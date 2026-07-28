from typing import Any

from .adapters.google_ads import ingest_google_ads
from .adapters.manual import ingest_manual_creative, ingest_manual_library
from .extractors import analyze_copy, analyze_image, analyze_video_metadata
from .models import (
    AnalyzeCreativeRequest,
    CreativeFeatures,
    PerformanceEvidence,
    QualificationThresholds,
    RebuildRequest,
)
from .qualification import qualify_evidence
from .store import (
    get_summary,
    get_thresholds,
    rebuild_summary,
    save_evidence,
    save_thresholds,
)


def rebuild_intelligence(
    *,
    uid: str,
    payload: RebuildRequest,
) -> dict[str, Any]:
    results: dict[str, Any] = {}

    if payload.include_manual:
        results["manual"] = ingest_manual_library(
            uid=uid,
            analyze_media=payload.analyze_media,
        )

    if payload.include_google_ads:
        results["googleAds"] = ingest_google_ads(
            uid=uid,
            date_range=payload.google_date_range,
            analyze_media=payload.analyze_media,
        )

    results["summary"] = rebuild_summary(uid)
    return results


def analyze_one(
    *,
    uid: str,
    payload: AnalyzeCreativeRequest,
) -> dict[str, Any]:
    features = CreativeFeatures(
        copy=analyze_copy(
            headline=payload.headline,
            body=payload.body,
            cta=payload.cta,
        ),
        source_metadata=payload.source_metadata,
    )

    if payload.kind in {"image", "mixed"} and payload.image_url:
        features.image = analyze_image(payload.image_url)

    if payload.kind in {"video", "mixed"}:
        features.video = analyze_video_metadata(
            title=payload.source_metadata.get("title"),
            duration_seconds=payload.source_metadata.get(
                "duration_seconds"
            ),
            source=payload.source,
        )
        if payload.video_url:
            features.video["video_url_available"] = True

    evidence = PerformanceEvidence(
        source=payload.source,
        creative_id=payload.creative_id,
        kind=payload.kind,
        asset_role=payload.source_metadata.get("asset_role"),
        attribution_confidence=0.5,
        features=features,
        raw_metadata=payload.source_metadata,
    )
    evidence = qualify_evidence(
        evidence,
        get_thresholds(uid),
    )
    evidence_id = save_evidence(uid, evidence)
    summary = rebuild_summary(uid)

    return {
        "ok": True,
        "evidenceId": evidence_id,
        "evidence": evidence.model_dump(),
        "summary": summary,
    }


def generation_profile(uid: str) -> dict[str, Any]:
    summary = get_summary(uid)
    return {
        "enabled": bool(summary.get("learningEnabled", True)),
        "confidence": summary.get("confidence", 0),
        "evidenceCount": summary.get("evidenceCount", 0),
        "qualifiedCount": summary.get("qualifiedCount", 0),
        "positiveCount": summary.get("positiveCount", 0),
        "sources": summary.get("sources", {}),
        "profile": summary.get("generationProfile", {}),
    }


__all__ = [
    "analyze_one",
    "generation_profile",
    "get_summary",
    "get_thresholds",
    "ingest_manual_creative",
    "rebuild_intelligence",
    "rebuild_summary",
    "save_thresholds",
    "QualificationThresholds",
]
