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


def save_evidence(
    uid: str,
    evidence: PerformanceEvidence,
) -> str:
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


def rebuild_summary(uid: str) -> dict[str, Any]:
    evidence = get_evidence(uid, limit=2000)
    positive = [
        item
        for item in evidence
        if item.get("evidence_status") in {"strong", "winner"}
    ]
    negative = [
        item
        for item in evidence
        if item.get("evidence_status") == "underperformer"
    ]
    qualified = [
        item
        for item in evidence
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

    headline_lengths: list[tuple[float, float]] = []
    product_prominence: list[tuple[float, float]] = []
    ctr_values: list[tuple[float, float]] = []
    roas_values: list[tuple[float, float]] = []

    for item in evidence:
        sources[str(item.get("source") or "unknown")] += 1
        statuses[str(item.get("evidence_status") or "unknown")] += 1

    for item in positive:
        score = float(item.get("qualification_score") or 0.25)
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
                    (
                        float(image["product_prominence_percent"]),
                        score,
                    )
                )
            except (TypeError, ValueError):
                pass
        if item.get("ctr_percent") is not None:
            ctr_values.append(
                (float(item["ctr_percent"]), score)
            )
        if item.get("roas") is not None:
            roas_values.append((float(item["roas"]), score))

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

    summary = {
        "version": 1,
        "learningEnabled": True,
        "confidence": round(confidence, 4),
        "evidenceCount": evidence_count,
        "qualifiedCount": qualified_count,
        "positiveCount": positive_count,
        "underperformerCount": len(negative),
        "sourceCount": source_count,
        "sources": dict(sources),
        "statuses": dict(statuses),
        "averagePositiveCtrPercent": _weighted_average(ctr_values),
        "averagePositiveRoas": _weighted_average(roas_values),
        "generationProfile": generation_profile,
        "updatedAt": int(time.time()),
    }

    root_ref(uid).set(summary, merge=True)
    return summary


def get_summary(uid: str) -> dict[str, Any]:
    doc = root_ref(uid).get().to_dict() or {}
    if not doc.get("updatedAt"):
        return rebuild_summary(uid)
    return doc
