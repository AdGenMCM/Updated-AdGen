import hashlib
import json
import time
from collections import Counter, defaultdict
from typing import Any

from auth_helpers import get_db
from google.cloud import firestore as gc_firestore

from .models import PerformanceEvidence, QualificationThresholds


ROOT_COLLECTION = "performance_intelligence"
EVIDENCE_SUBCOLLECTION = "evidence"
REFRESH_SUBCOLLECTION = "refresh_sessions"


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


def save_thresholds(uid: str, thresholds: QualificationThresholds) -> None:
    root_ref(uid).set(
        {
            "thresholds": thresholds.model_dump(),
            "updatedAt": int(time.time()),
        },
        merge=True,
    )


def _content_hash(payload: dict[str, Any]) -> str:
    ignored = {
        "updatedAt",
        "firstSeenAt",
        "lastChangedAt",
        "contentHash",
    }
    clean = {
        key: value
        for key, value in payload.items()
        if key not in ignored
    }
    raw = json.dumps(
        clean,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def upsert_evidence(
    uid: str,
    evidence: PerformanceEvidence,
) -> tuple[str, str]:
    """Add or update one stable evidence record.

    Metrics are treated as the newest absolute provider values. They are never
    added to the prior values. Historical evidence documents not present in the
    current refresh are left untouched.
    """
    doc_id = evidence_document_id(evidence)
    ref = (
        root_ref(uid)
        .collection(EVIDENCE_SUBCOLLECTION)
        .document(doc_id)
    )
    now = int(time.time())
    existing_snap = ref.get()
    existing = existing_snap.to_dict() or {}
    incoming = evidence.model_dump()

    # A fast refresh can skip media analysis. Preserve previously extracted
    # traits rather than replacing them with empty feature sections.
    previous_features = existing.get("features") or {}
    incoming_features = incoming.get("features") or {}
    for section in ("copy", "image", "video"):
        if not incoming_features.get(section) and previous_features.get(section):
            incoming_features[section] = previous_features[section]
    incoming["features"] = incoming_features

    incoming_hash = _content_hash(incoming)
    if existing and existing.get("contentHash") == incoming_hash:
        return doc_id, "unchanged"

    ref.set(
        {
            **incoming,
            "contentHash": incoming_hash,
            "firstSeenAt": existing.get("firstSeenAt") or now,
            "lastChangedAt": now,
            "updatedAt": now,
        },
        merge=True,
    )
    return doc_id, "updated" if existing else "added"


def save_evidence(uid: str, evidence: PerformanceEvidence) -> str:
    doc_id, _change = upsert_evidence(uid, evidence)
    return doc_id


def get_evidence(uid: str, limit: int = 1000) -> list[dict[str, Any]]:
    query = (
        root_ref(uid)
        .collection(EVIDENCE_SUBCOLLECTION)
        .order_by(
            "updatedAt",
            direction=gc_firestore.Query.DESCENDING,
        )
        .limit(limit)
    )
    return [
        {"id": snap.id, **(snap.to_dict() or {})}
        for snap in query.stream()
    ]


def start_refresh_session(uid: str, request: dict[str, Any]) -> str:
    now = int(time.time())
    ref = (
        root_ref(uid)
        .collection(REFRESH_SUBCOLLECTION)
        .document()
    )
    ref.set(
        {
            "status": "running",
            "startedAt": now,
            "updatedAt": now,
            "request": request,
            "sources": {},
        }
    )
    root_ref(uid).set(
        {
            "latestRefresh": {
                "id": ref.id,
                "status": "running",
                "startedAt": now,
            }
        },
        merge=True,
    )
    return ref.id


def finish_refresh_session(
    uid: str,
    session_id: str,
    *,
    status: str,
    sources: dict[str, Any],
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    learning_changes: dict[str, Any] | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    now = int(time.time())
    ref = (
        root_ref(uid)
        .collection(REFRESH_SUBCOLLECTION)
        .document(session_id)
    )
    existing = ref.get().to_dict() or {}
    started_at = int(existing.get("startedAt") or now)
    payload = {
        "status": status,
        "sources": sources,
        "before": before or {},
        "after": after or {},
        "learningChanges": learning_changes or {},
        "error": error,
        "finishedAt": now,
        "updatedAt": now,
        "durationSeconds": max(0, now - started_at),
    }
    ref.set(payload, merge=True)
    latest = {
        "id": session_id,
        "startedAt": started_at,
        **payload,
    }
    root_ref(uid).set({"latestRefresh": latest}, merge=True)
    return latest



def get_refresh_sessions(uid: str, limit: int = 50) -> list[dict[str, Any]]:
    query = (
        root_ref(uid)
        .collection(REFRESH_SUBCOLLECTION)
        .order_by("startedAt", direction=gc_firestore.Query.DESCENDING)
        .limit(max(1, min(int(limit), 200)))
    )
    return [
        {"id": snap.id, **(snap.to_dict() or {})}
        for snap in query.stream()
    ]

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
            "count": count,
            "share": round(count / total, 4),
        }
        for value, count in counter.most_common(limit)
    ]


def _performance_unit_key(item: dict[str, Any]) -> str:
    explicit = str(item.get("performance_unit_id") or "").strip()
    if explicit:
        return explicit
    source = str(item.get("source") or "unknown")
    account = str(item.get("source_account_id") or "")
    campaign = str(item.get("campaign_id") or "")
    raw = item.get("raw_metadata") or {}
    if source == "google_ads":
        scope = str(raw.get("adId") or raw.get("ad_id") or raw.get("assetGroupId") or item.get("ad_group_id") or "campaign")
    elif source == "meta_ads":
        scope = str(item.get("deployment_id") or raw.get("metaAdId") or raw.get("adId") or item.get("creative_id") or "creative")
    else:
        scope = str(item.get("deployment_id") or item.get("creative_id") or item.get("external_asset_id") or "creative")
    return ":".join([source, account, campaign, scope])


def _unit_representatives(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    representatives: dict[str, dict[str, Any]] = {}
    for item in items:
        key = _performance_unit_key(item)
        current = representatives.get(key)
        if current is None or float(item.get("qualification_score") or 0) > float(current.get("qualification_score") or 0):
            representatives[key] = item
    return representatives


def rebuild_summary(uid: str) -> dict[str, Any]:
    # This intentionally reads the full retained evidence set. A refresh never
    # scopes the summary to only the most recently requested provider range.
    evidence = get_evidence(uid, limit=5000)
    unit_representatives = _unit_representatives(evidence)
    independent_results = list(unit_representatives.values())
    unit_asset_counts = Counter(_performance_unit_key(item) for item in evidence)
    positive = [
        item
        for item in evidence
        if item.get("evidence_status") in {"strong", "winner"}
    ]
    negative = [
        item
        for item in independent_results
        if item.get("evidence_status") == "underperformer"
    ]
    qualified = [
        item
        for item in independent_results
        if item.get("evidence_status")
        in {"qualified", "strong", "winner", "underperformer"}
    ]

    colors = Counter()
    styles = Counter()
    compositions = Counter()
    backgrounds = Counter()
    lifestyle = Counter()
    tones = Counter()
    cta_openers = Counter()
    headline_openers = Counter()
    asset_roles = Counter()
    sources = Counter()
    statuses = Counter()
    source_statuses: dict[str, Counter] = defaultdict(Counter)

    headline_lengths: list[tuple[float, float]] = []
    product_prominence: list[tuple[float, float]] = []
    ctr_values: list[tuple[float, float]] = []
    roas_values: list[tuple[float, float]] = []

    for item in evidence:
        source = str(item.get("source") or "unknown")
        evidence_status = str(item.get("evidence_status") or "unknown")
        sources[source] += 1
        statuses[evidence_status] += 1
        source_statuses[source][evidence_status] += 1

    for item in positive:
        unit_key = _performance_unit_key(item)
        sibling_count = max(int(unit_asset_counts.get(unit_key) or 1), 1)
        score = float(item.get("qualification_score") or 0.25) / sibling_count
        features = item.get("features") or {}
        copy = features.get("copy") or {}
        image = features.get("image") or {}

        for color in image.get("dominant_colors") or []:
            colors[str(color).lower()] += score
        for key, counter in [
            ("visual_style", styles),
            ("composition", compositions),
            ("background_type", backgrounds),
            ("lifestyle_vs_studio", lifestyle),
            ("emotional_tone", tones),
        ]:
            value = image.get(key)
            if value:
                counter[str(value).lower()] += score

        if copy.get("first_cta_word"):
            cta_openers[str(copy["first_cta_word"]).lower()] += score
        if copy.get("first_headline_word"):
            headline_openers[
                str(copy["first_headline_word"]).lower()
            ] += score
        if item.get("asset_role"):
            asset_roles[str(item["asset_role"]).lower()] += score
        if copy.get("headline_length") is not None:
            headline_lengths.append(
                (float(copy["headline_length"]), score)
            )
        if image.get("product_prominence_percent") is not None:
            try:
                product_prominence.append(
                    (float(image["product_prominence_percent"]), score)
                )
            except (TypeError, ValueError):
                pass
        if item.get("ctr_percent") is not None:
            ctr_values.append((float(item["ctr_percent"]), score))
        if item.get("roas") is not None:
            roas_values.append((float(item["roas"]), score))

    source_count = len(sources)
    evidence_count = len(evidence)
    independent_result_count = len(independent_results)
    qualified_count = len(qualified)
    positive_units = {_performance_unit_key(item) for item in positive}
    positive_count = len(positive_units)

    confidence = 0.0
    if independent_result_count:
        confidence = min(
            1.0,
            min(qualified_count / 20.0, 1.0) * 0.55
            + min(positive_count / 10.0, 1.0) * 0.30
            + min(source_count / 3.0, 1.0) * 0.15,
        )

    generation_profile = {
        "top_colors": _top_counter(colors, 5),
        "top_visual_styles": _top_counter(styles, 5),
        "top_compositions": _top_counter(compositions, 5),
        "top_backgrounds": _top_counter(backgrounds, 5),
        "top_imagery_types": _top_counter(lifestyle, 5),
        "top_emotional_tones": _top_counter(tones, 5),
        "top_cta_openers": _top_counter(cta_openers, 5),
        "top_headline_openers": _top_counter(headline_openers, 5),
        "top_asset_roles": _top_counter(asset_roles, 8),
        "average_winning_headline_length": _weighted_average(
            headline_lengths
        ),
        "average_winning_product_prominence_percent": _weighted_average(
            product_prominence
        ),
    }

    source_stats = {}
    independent_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for result in independent_results:
        independent_by_source[str(result.get("source") or "unknown")].append(result)
    for source, count in sources.items():
        status_counts = source_statuses[source]
        source_units = independent_by_source.get(source, [])
        unit_statuses = Counter(str(item.get("evidence_status") or "unknown") for item in source_units)
        source_stats[source] = {
            "evidenceCount": count,
            "independentResultCount": len(source_units),
            "qualifiedCount": sum(unit_statuses.get(status, 0) for status in {"qualified", "strong", "winner", "underperformer"}),
            "positiveCount": unit_statuses.get("strong", 0) + unit_statuses.get("winner", 0),
            "learningCount": unit_statuses.get("learning", 0) + unit_statuses.get("insufficient", 0),
            "underperformerCount": unit_statuses.get("underperformer", 0),
            "statuses": dict(status_counts),
            "independentStatuses": dict(unit_statuses),
        }

    existing_root = root_ref(uid).get().to_dict() or {}
    summary = {
        "version": 3,
        "learningEnabled": True,
        "confidence": round(confidence, 4),
        "evidenceCount": evidence_count,
        "creativeAssetCount": evidence_count,
        "independentResultCount": independent_result_count,
        "qualifiedCount": qualified_count,
        "positiveCount": positive_count,
        "underperformerCount": len(negative),
        "sourceCount": source_count,
        "sources": dict(sources),
        "sourceStats": source_stats,
        "statuses": dict(statuses),
        "averagePositiveCtrPercent": _weighted_average(ctr_values),
        "averagePositiveRoas": _weighted_average(roas_values),
        "generationProfile": generation_profile,
        "latestRefresh": existing_root.get("latestRefresh"),
        "updatedAt": int(time.time()),
    }
    root_ref(uid).set(summary, merge=True)
    return summary


def get_summary(uid: str) -> dict[str, Any]:
    doc = root_ref(uid).get().to_dict() or {}
    if not doc.get("updatedAt"):
        return rebuild_summary(uid)
    return doc
