import hashlib
import time
from collections import Counter, defaultdict
from typing import Any, Iterable

from auth_helpers import get_db
from google.cloud import firestore as gc_firestore

from .models import PerformanceEvidence, QualificationThresholds


ROOT_COLLECTION = "performance_intelligence"
EVIDENCE_SUBCOLLECTION = "evidence"
REFRESH_SUBCOLLECTION = "refresh_sessions"

POSITIVE_STATUSES = {"strong", "winner"}
QUALIFIED_STATUSES = {"qualified", "strong", "winner", "underperformer"}


def stable_creative_id(*parts: Any) -> str:
    raw = "::".join(str(part or "") for part in parts)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]
    return f"cr_{digest}"


def evidence_document_id(evidence: PerformanceEvidence) -> str:
    return stable_creative_id(
        evidence.source,
        evidence.source_account_id,
        evidence.campaign_id,
        evidence.external_asset_id,
        evidence.creative_id,
    ).replace("cr_", "ev_", 1)


def root_ref(uid: str):
    return get_db().collection(ROOT_COLLECTION).document(uid)


def get_thresholds(uid: str) -> QualificationThresholds:
    doc = root_ref(uid).get().to_dict() or {}
    raw = doc.get("thresholds") or {}
    try:
        return QualificationThresholds(**raw)
    except Exception:
        return QualificationThresholds()


def save_thresholds(
    uid: str,
    thresholds: QualificationThresholds,
) -> None:
    root_ref(uid).set(
        {
            "thresholds": thresholds.model_dump(),
            "updatedAt": int(time.time()),
        },
        merge=True,
    )


def save_evidence(uid: str, evidence: PerformanceEvidence) -> str:
    doc_id = evidence_document_id(evidence)
    payload = evidence.model_dump()
    payload["updatedAt"] = int(time.time())

    (
        root_ref(uid)
        .collection(EVIDENCE_SUBCOLLECTION)
        .document(doc_id)
        .set(payload, merge=True)
    )
    return doc_id


def upsert_evidence(
    uid: str,
    evidence: PerformanceEvidence,
) -> tuple[str, str]:
    """
    Upsert evidence while reporting whether this refresh added, updated, or
    left the evidence unchanged. Google Ads and Meta Ads adapters use this
    result for Learning Manager refresh summaries.
    """
    doc_id = evidence_document_id(evidence)
    ref = (
        root_ref(uid)
        .collection(EVIDENCE_SUBCOLLECTION)
        .document(doc_id)
    )
    existing = ref.get().to_dict() or {}

    payload = evidence.model_dump()
    payload["updatedAt"] = int(time.time())

    # updatedAt is bookkeeping and must not turn an otherwise identical record
    # into an "updated" result.
    comparable_existing = {
        key: value
        for key, value in existing.items()
        if key != "updatedAt"
    }
    comparable_next = dict(evidence.model_dump())

    if not existing:
        change = "added"
    elif comparable_existing == comparable_next:
        change = "unchanged"
    else:
        change = "updated"

    ref.set(payload, merge=True)
    return doc_id, change


def get_evidence(uid: str, limit: int = 1000) -> list[dict[str, Any]]:
    query = (
        root_ref(uid)
        .collection(EVIDENCE_SUBCOLLECTION)
        .order_by("updatedAt", direction=gc_firestore.Query.DESCENDING)
        .limit(limit)
    )
    return [
        {"id": snap.id, **(snap.to_dict() or {})}
        for snap in query.stream()
    ]


def save_refresh_session(
    uid: str,
    payload: dict[str, Any],
    session_id: str | None = None,
) -> dict[str, Any]:
    collection = root_ref(uid).collection(REFRESH_SUBCOLLECTION)
    ref = collection.document(session_id) if session_id else collection.document()

    data = dict(payload or {})
    data["id"] = ref.id
    ref.set(data, merge=True)
    return data


def get_refresh_sessions(
    uid: str,
    limit: int = 25,
) -> list[dict[str, Any]]:
    query = (
        root_ref(uid)
        .collection(REFRESH_SUBCOLLECTION)
        .order_by("startedAt", direction=gc_firestore.Query.DESCENDING)
        .limit(max(1, min(int(limit or 25), 100)))
    )
    return [
        {"id": snap.id, **(snap.to_dict() or {})}
        for snap in query.stream()
    ]


def get_latest_refresh_session(uid: str) -> dict[str, Any] | None:
    sessions = get_refresh_sessions(uid, limit=1)
    return sessions[0] if sessions else None


def _weighted_average(items: list[tuple[float, float]]) -> float | None:
    total_weight = sum(max(weight, 0.0) for _value, weight in items)
    if total_weight <= 0:
        return None
    return round(
        sum(value * max(weight, 0.0) for value, weight in items)
        / total_weight,
        4,
    )


def _top_counter(counter: Counter, limit: int = 8) -> list[dict[str, Any]]:
    total = sum(counter.values())
    if total <= 0:
        return []
    return [
        {
            "value": value,
            "count": round(float(count), 4),
            "share": round(float(count) / float(total), 4),
        }
        for value, count in counter.most_common(limit)
    ]


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "yes" if value else "no"
    text = str(value).strip()
    return text or None


def _add(counter: Counter, value: Any, score: float) -> None:
    text = _as_text(value)
    if text:
        counter[text.lower()] += score


def _add_many(counter: Counter, values: Iterable[Any], score: float) -> None:
    for value in values or []:
        _add(counter, value, score)


def _num(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        number = float(value)
        if number != number:
            return None
        return number
    except (TypeError, ValueError):
        return None


def _mode_matches(item: dict[str, Any], mode: str) -> bool:
    kind = str(item.get("kind") or "").lower()
    if mode == "image":
        return kind in {"image", "mixed"}
    if mode == "video":
        return kind in {"video", "mixed"}
    return True


def _profile_confidence(items: list[dict[str, Any]], source_count: int) -> float:
    evidence_count = len(items)
    qualified_count = sum(
        1 for item in items if item.get("evidence_status") in QUALIFIED_STATUSES
    )
    positive_count = sum(
        1 for item in items if item.get("evidence_status") in POSITIVE_STATUSES
    )
    if not evidence_count:
        return 0.0
    return min(
        1.0,
        (
            min(qualified_count / 12.0, 1.0) * 0.55
            + min(positive_count / 6.0, 1.0) * 0.30
            + min(source_count / 3.0, 1.0) * 0.15
        ),
    )


def _mode_stats(items: list[dict[str, Any]]) -> dict[str, Any]:
    sources = Counter(str(item.get("source") or "unknown") for item in items)
    qualified = [
        item for item in items
        if item.get("evidence_status") in QUALIFIED_STATUSES
    ]
    positive = [
        item for item in items
        if item.get("evidence_status") in POSITIVE_STATUSES
    ]
    return {
        "evidenceCount": len(items),
        "qualifiedCount": len(qualified),
        "positiveCount": len(positive),
        "underperformerCount": sum(
            1 for item in items
            if item.get("evidence_status") == "underperformer"
        ),
        "sourceCount": len(sources),
        "sources": dict(sources),
        "confidence": round(_profile_confidence(items, len(sources)), 4),
    }


def _common_copy_profile(positive: list[dict[str, Any]]) -> dict[str, Any]:
    tones = Counter()
    cta_openers = Counter()
    headline_openers = Counter()
    asset_roles = Counter()
    platforms = Counter()
    headline_lengths: list[tuple[float, float]] = []

    for item in positive:
        score = max(float(item.get("qualification_score") or 0.25), 0.05)
        features = item.get("features") or {}
        copy = features.get("copy") or {}
        meta = features.get("source_metadata") or {}

        _add(tones, copy.get("emotional_tone") or meta.get("tone"), score)
        _add(cta_openers, copy.get("first_cta_word"), score)
        _add(headline_openers, copy.get("first_headline_word"), score)
        _add(asset_roles, item.get("asset_role"), score)
        _add(
            platforms,
            meta.get("platform")
            or item.get("platform_label")
            or (item.get("raw_metadata") or {}).get("platform"),
            score,
        )

        length = _num(copy.get("headline_length"))
        if length is not None:
            headline_lengths.append((length, score))

    return {
        "top_emotional_tones": _top_counter(tones, 5),
        "top_cta_openers": _top_counter(cta_openers, 5),
        "top_headline_openers": _top_counter(headline_openers, 5),
        "top_asset_roles": _top_counter(asset_roles, 8),
        "top_platforms": _top_counter(platforms, 5),
        "average_winning_headline_length": _weighted_average(headline_lengths),
    }


def _build_image_profile(positive: list[dict[str, Any]]) -> dict[str, Any]:
    colors = Counter()
    styles = Counter()
    compositions = Counter()
    backgrounds = Counter()
    imagery = Counter()
    tones = Counter()
    text_levels = Counter()
    text_positions = Counter()
    cta_positions = Counter()
    contrast_levels = Counter()
    orientations = Counter()
    ratios = Counter()
    reference_modes = Counter()
    campaign_objectives = Counter()
    product_types = Counter()
    product_prominence: list[tuple[float, float]] = []

    for item in positive:
        if not _mode_matches(item, "image"):
            continue
        score = max(float(item.get("qualification_score") or 0.25), 0.05)
        features = item.get("features") or {}
        image = features.get("image") or {}
        meta = features.get("source_metadata") or {}
        raw = item.get("raw_metadata") or {}

        _add_many(colors, image.get("dominant_colors") or [], score)
        for key, counter in [
            ("visual_style", styles),
            ("composition", compositions),
            ("background_type", backgrounds),
            ("lifestyle_vs_studio", imagery),
            ("emotional_tone", tones),
            ("text_overlay_level", text_levels),
            ("text_position", text_positions),
            ("cta_position", cta_positions),
            ("contrast_level", contrast_levels),
            ("aspect_orientation", orientations),
        ]:
            _add(counter, image.get(key), score)

        _add(ratios, meta.get("ratio") or raw.get("ratio"), score)
        _add(reference_modes, meta.get("referenceImageMode") or raw.get("referenceImageMode"), score)
        _add(campaign_objectives, meta.get("campaignObjective") or raw.get("campaignObjective"), score)
        _add(product_types, meta.get("productType") or raw.get("productType"), score)

        prominence = _num(image.get("product_prominence_percent"))
        if prominence is not None:
            product_prominence.append((prominence, score))

    common = _common_copy_profile(
        [item for item in positive if _mode_matches(item, "image")]
    )
    return {
        **common,
        "top_colors": _top_counter(colors, 5),
        "top_visual_styles": _top_counter(styles, 5),
        "top_compositions": _top_counter(compositions, 5),
        "top_backgrounds": _top_counter(backgrounds, 5),
        "top_imagery_types": _top_counter(imagery, 5),
        "top_image_emotional_tones": _top_counter(tones, 5),
        "top_text_overlay_levels": _top_counter(text_levels, 4),
        "top_text_positions": _top_counter(text_positions, 5),
        "top_cta_positions": _top_counter(cta_positions, 5),
        "top_contrast_levels": _top_counter(contrast_levels, 4),
        "top_aspect_orientations": _top_counter(orientations, 4),
        "top_ratios": _top_counter(ratios, 5),
        "top_reference_modes": _top_counter(reference_modes, 4),
        "top_campaign_objectives": _top_counter(campaign_objectives, 6),
        "top_product_types": _top_counter(product_types, 6),
        "average_winning_product_prominence_percent": _weighted_average(
            product_prominence
        ),
    }


def _build_video_profile(positive: list[dict[str, Any]]) -> dict[str, Any]:
    durations = Counter()
    ratios = Counter()
    modes = Counter()
    campaign_types = Counter()
    visual_styles = Counter()
    hook_styles = Counter()
    pace = Counter()
    camera_motion = Counter()
    voice_modes = Counter()
    music_usage = Counter()
    overlay_usage = Counter()
    cta_finish_usage = Counter()
    reference_usage = Counter()
    scene_counts = Counter()
    scene_roles = Counter()
    scene_performance_modes = Counter()

    duration_values: list[tuple[float, float]] = []
    thumb_stop_values: list[tuple[float, float]] = []
    view_3s_values: list[tuple[float, float]] = []
    view_6s_values: list[tuple[float, float]] = []
    hold_values: list[tuple[float, float]] = []
    conversion_rate_values: list[tuple[float, float]] = []

    for item in positive:
        if not _mode_matches(item, "video"):
            continue

        score = max(float(item.get("qualification_score") or 0.25), 0.05)
        features = item.get("features") or {}
        video = features.get("video") or {}
        meta = features.get("source_metadata") or {}
        raw = item.get("raw_metadata") or {}

        duration = _num(video.get("duration_seconds") or meta.get("duration"))
        if duration is not None and duration > 0:
            duration_values.append((duration, score))
            _add(durations, str(int(round(duration))), score)

        _add(ratios, video.get("ratio") or meta.get("ratio") or raw.get("ratio"), score)
        _add(modes, video.get("generation_mode") or meta.get("mode"), score)
        _add(campaign_types, video.get("campaign_type") or meta.get("campaignType"), score)
        _add(visual_styles, video.get("visual_style") or meta.get("visualStyle"), score)
        _add(hook_styles, video.get("hook_style") or meta.get("hookStyle"), score)
        _add(pace, video.get("pace") or meta.get("pace"), score)
        _add(camera_motion, video.get("camera_motion") or meta.get("cameraMotion"), score)
        _add(voice_modes, video.get("voice_mode") or meta.get("voiceMode"), score)
        _add(music_usage, video.get("music_enabled"), score)
        _add(overlay_usage, video.get("text_overlays_enabled"), score)
        _add(cta_finish_usage, video.get("cta_finish_enabled"), score)
        _add(reference_usage, video.get("reference_image_used"), score)

        count = _num(video.get("scene_count"))
        if count is not None:
            _add(scene_counts, str(int(count)), score)

        _add_many(scene_roles, video.get("scene_roles") or [], score)
        _add_many(
            scene_performance_modes,
            video.get("scene_performance_modes") or [],
            score,
        )

        for field, bucket in [
            ("thumb_stop_rate", thumb_stop_values),
            ("view_3s", view_3s_values),
            ("view_6s", view_6s_values),
            ("hold_rate", hold_values),
            ("conversion_rate", conversion_rate_values),
        ]:
            value = _num(item.get(field))
            if value is not None:
                bucket.append((value, score))

    common = _common_copy_profile(
        [item for item in positive if _mode_matches(item, "video")]
    )

    return {
        **common,
        "top_durations": _top_counter(durations, 5),
        "top_ratios": _top_counter(ratios, 5),
        "top_generation_modes": _top_counter(modes, 5),
        "top_campaign_types": _top_counter(campaign_types, 7),
        "top_visual_styles": _top_counter(visual_styles, 6),
        "top_hook_styles": _top_counter(hook_styles, 6),
        "top_pacing": _top_counter(pace, 5),
        "top_camera_motion": _top_counter(camera_motion, 6),
        "top_voice_modes": _top_counter(voice_modes, 5),
        "top_music_usage": _top_counter(music_usage, 3),
        "top_text_overlay_usage": _top_counter(overlay_usage, 3),
        "top_cta_finish_usage": _top_counter(cta_finish_usage, 3),
        "top_reference_image_usage": _top_counter(reference_usage, 3),
        "top_scene_counts": _top_counter(scene_counts, 6),
        "top_scene_roles": _top_counter(scene_roles, 8),
        "top_scene_performance_modes": _top_counter(
            scene_performance_modes,
            5,
        ),
        "average_winning_duration_seconds": _weighted_average(duration_values),
        "average_winning_thumb_stop_rate": _weighted_average(thumb_stop_values),
        "average_winning_view_3s": _weighted_average(view_3s_values),
        "average_winning_view_6s": _weighted_average(view_6s_values),
        "average_winning_hold_rate": _weighted_average(hold_values),
        "average_winning_conversion_rate": _weighted_average(
            conversion_rate_values
        ),
    }


def _build_avoid_profile(negative: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    """
    Conservative underperformer signal. Only exposes repeated structured traits;
    it never turns one weak ad into a hard rule.
    """
    counters: dict[str, Counter] = defaultdict(Counter)

    for item in negative:
        if not _mode_matches(item, mode):
            continue
        features = item.get("features") or {}
        meta = features.get("source_metadata") or {}
        media = features.get(mode) or {}
        weight = max(float(item.get("qualification_score") or 0.2), 0.05)

        if mode == "image":
            fields = {
                "visual_styles": media.get("visual_style"),
                "compositions": media.get("composition"),
                "backgrounds": media.get("background_type"),
                "text_overlay_levels": media.get("text_overlay_level"),
                "ratios": meta.get("ratio"),
            }
        else:
            fields = {
                "durations": media.get("duration_seconds"),
                "visual_styles": media.get("visual_style") or meta.get("visualStyle"),
                "hook_styles": media.get("hook_style") or meta.get("hookStyle"),
                "pacing": media.get("pace") or meta.get("pace"),
                "voice_modes": media.get("voice_mode") or meta.get("voiceMode"),
                "ratios": media.get("ratio") or meta.get("ratio"),
            }

        for key, value in fields.items():
            _add(counters[key], value, weight)

    return {
        key: _top_counter(counter, 3)
        for key, counter in counters.items()
        if len(counter) > 0
    }


def rebuild_summary(uid: str) -> dict[str, Any]:
    evidence = get_evidence(uid, limit=2000)

    positive = [
        item for item in evidence
        if item.get("evidence_status") in POSITIVE_STATUSES
    ]
    negative = [
        item for item in evidence
        if item.get("evidence_status") == "underperformer"
    ]
    qualified = [
        item for item in evidence
        if item.get("evidence_status") in QUALIFIED_STATUSES
    ]

    sources = Counter()
    statuses = Counter()
    source_statuses: dict[str, Counter] = defaultdict(Counter)

    ctr_values: list[tuple[float, float]] = []
    roas_values: list[tuple[float, float]] = []

    for item in evidence:
        source = str(item.get("source") or "unknown")
        evidence_status = str(item.get("evidence_status") or "unknown")
        sources[source] += 1
        statuses[evidence_status] += 1
        source_statuses[source][evidence_status] += 1

    for item in positive:
        score = max(float(item.get("qualification_score") or 0.25), 0.05)
        ctr = _num(item.get("ctr_percent"))
        roas = _num(item.get("roas"))
        if ctr is not None:
            ctr_values.append((ctr, score))
        if roas is not None:
            roas_values.append((roas, score))

    image_items = [item for item in evidence if _mode_matches(item, "image")]
    video_items = [item for item in evidence if _mode_matches(item, "video")]

    image_positive = [item for item in positive if _mode_matches(item, "image")]
    video_positive = [item for item in positive if _mode_matches(item, "video")]

    image_profile = _build_image_profile(image_positive)
    video_profile = _build_video_profile(video_positive)

    # Preserve the historical generationProfile key as the image profile.
    # Image generation already consumed image-oriented fields from this key.
    generation_profiles = {
        "image": image_profile,
        "video": video_profile,
    }

    mode_stats = {
        "image": _mode_stats(image_items),
        "video": _mode_stats(video_items),
    }

    source_stats = {}
    for source, count in sources.items():
        status_counts = source_statuses[source]
        source_stats[source] = {
            "evidenceCount": count,
            "qualifiedCount": sum(
                status_counts.get(status, 0)
                for status in QUALIFIED_STATUSES
            ),
            "positiveCount": (
                status_counts.get("strong", 0)
                + status_counts.get("winner", 0)
            ),
            "learningCount": (
                status_counts.get("learning", 0)
                + status_counts.get("insufficient", 0)
            ),
            "underperformerCount": status_counts.get("underperformer", 0),
            "statuses": dict(status_counts),
        }

    source_count = len(sources)
    evidence_count = len(evidence)
    qualified_count = len(qualified)
    positive_count = len(positive)

    confidence = 0.0
    if evidence_count:
        confidence = min(
            1.0,
            (
                min(qualified_count / 20.0, 1.0) * 0.55
                + min(positive_count / 10.0, 1.0) * 0.30
                + min(source_count / 3.0, 1.0) * 0.15
            ),
        )

    summary = {
        "version": 3,
        "learningEnabled": True,
        "confidence": round(confidence, 4),
        "evidenceCount": evidence_count,
        "qualifiedCount": qualified_count,
        "positiveCount": positive_count,
        "underperformerCount": len(negative),
        "sourceCount": source_count,
        "sources": dict(sources),
        "sourceStats": source_stats,
        "statuses": dict(statuses),
        "modeStats": mode_stats,
        "averagePositiveCtrPercent": _weighted_average(ctr_values),
        "averagePositiveRoas": _weighted_average(roas_values),

        # Backward compatible: image generation keeps receiving the historical
        # image-oriented flat profile.
        "generationProfile": image_profile,

        # New: explicit image/video separation.
        "generationProfiles": generation_profiles,
        "avoidProfiles": {
            "image": _build_avoid_profile(negative, "image"),
            "video": _build_avoid_profile(negative, "video"),
        },
        "updatedAt": int(time.time()),
    }

    root_ref(uid).set(summary, merge=True)
    return summary


def get_summary(uid: str) -> dict[str, Any]:
    doc = root_ref(uid).get().to_dict() or {}
    if not doc.get("updatedAt") or int(doc.get("version") or 0) < 3:
        return rebuild_summary(uid)
    return doc
