from typing import Any, Literal

from .adapters.google_ads import ingest_google_ads
from .adapters.meta_ads import ingest_meta_ads
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


GenerationMode = Literal["image", "video"]


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

    if payload.include_meta_ads:
        results["metaAds"] = ingest_meta_ads(
            uid=uid,
            date_range=payload.meta_date_range,
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
            duration_seconds=payload.source_metadata.get("duration_seconds"),
            source=payload.source,
        )
        # Preserve any structured video-generation metadata supplied by callers.
        features.video.update(
            {
                key: value
                for key, value in payload.source_metadata.items()
                if key
                in {
                    "ratio",
                    "generation_mode",
                    "campaign_type",
                    "visual_style",
                    "hook_style",
                    "pace",
                    "camera_motion",
                    "voice_mode",
                    "music_enabled",
                    "text_overlays_enabled",
                    "cta_finish_enabled",
                    "reference_image_used",
                    "scene_count",
                    "scene_roles",
                    "scene_performance_modes",
                }
                and value is not None
            }
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
        thumb_stop_rate=payload.source_metadata.get("thumb_stop_rate"),
        view_3s=payload.source_metadata.get("view_3s"),
        view_6s=payload.source_metadata.get("view_6s"),
        hold_rate=payload.source_metadata.get("hold_rate"),
        conversion_rate=payload.source_metadata.get("conversion_rate"),
    )
    evidence = qualify_evidence(evidence, get_thresholds(uid))
    evidence_id = save_evidence(uid, evidence)
    summary = rebuild_summary(uid)

    return {
        "ok": True,
        "evidenceId": evidence_id,
        "evidence": evidence.model_dump(),
        "summary": summary,
    }


def generation_profile(
    uid: str,
    mode: GenerationMode | None = None,
) -> dict[str, Any]:
    """
    Return generation guidance.

    Backward compatibility:
    - mode omitted -> historical image-oriented flat generationProfile
    - mode='image' -> image-specific profile
    - mode='video' -> video-specific profile

    This prevents image and video patterns from contaminating each other while
    preserving existing image-generation integrations.
    """
    summary = get_summary(uid)

    profiles = summary.get("generationProfiles") or {}
    mode_stats = summary.get("modeStats") or {}

    selected_mode = mode if mode in {"image", "video"} else "image"
    selected_profile = (
        profiles.get(selected_mode)
        or summary.get("generationProfile")
        or {}
    )
    selected_stats = mode_stats.get(selected_mode) or {}

    return {
        "enabled": bool(summary.get("learningEnabled", True)),
        "mode": selected_mode,
        "confidence": selected_stats.get(
            "confidence",
            summary.get("confidence", 0),
        ),
        "evidenceCount": selected_stats.get(
            "evidenceCount",
            summary.get("evidenceCount", 0),
        ),
        "qualifiedCount": selected_stats.get(
            "qualifiedCount",
            summary.get("qualifiedCount", 0),
        ),
        "positiveCount": selected_stats.get(
            "positiveCount",
            summary.get("positiveCount", 0),
        ),
        "underperformerCount": selected_stats.get(
            "underperformerCount",
            summary.get("underperformerCount", 0),
        ),
        "sources": selected_stats.get(
            "sources",
            summary.get("sources", {}),
        ),
        "profile": selected_profile,
        "avoidProfile": (
            (summary.get("avoidProfiles") or {}).get(selected_mode) or {}
        ),
        "updatedAt": summary.get("updatedAt"),
        # Available to admin/insights callers without breaking old clients.
        "profiles": profiles,
        "modeStats": mode_stats,
    }


__all__ = [
    "analyze_one",
    "generation_profile",
    "get_summary",
    "get_thresholds",
    "ingest_manual_creative",
    "ingest_meta_ads",
    "rebuild_intelligence",
    "rebuild_summary",
    "save_thresholds",
    "QualificationThresholds",
]
