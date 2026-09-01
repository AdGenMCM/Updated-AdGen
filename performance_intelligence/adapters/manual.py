from typing import Any

from auth_helpers import get_db

from ..extractors import analyze_copy, analyze_image, analyze_video_metadata
from ..models import CreativeFeatures, PerformanceEvidence
from ..qualification import qualify_evidence
from ..store import (
    get_thresholds,
    save_evidence,
    stable_creative_id,
)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _optional_num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
        return None if number != number else number
    except (TypeError, ValueError):
        return None


def _first(*values):
    for value in values:
        if value not in (None, "", []):
            return value
    return None


def _scene_list(doc: dict[str, Any]) -> list[dict[str, Any]]:
    scenes = doc.get("scenes")
    if isinstance(scenes, list):
        return [scene for scene in scenes if isinstance(scene, dict)]

    storyboard = doc.get("storyboard") or {}
    scenes = storyboard.get("scenes") if isinstance(storyboard, dict) else None
    if isinstance(scenes, list):
        return [scene for scene in scenes if isinstance(scene, dict)]

    return []


def _video_generation_features(doc: dict[str, Any]) -> dict[str, Any]:
    brief = doc.get("brief") if isinstance(doc.get("brief"), dict) else {}
    scenes = _scene_list(doc)

    voice_mode = _first(
        doc.get("voiceMode"),
        brief.get("voiceMode"),
        "voiceover"
        if (
            doc.get("voiceover")
            and isinstance(doc.get("voiceover"), dict)
            and doc.get("voiceover", {}).get("enabled")
        )
        else None,
        "none",
    )

    overlay_enabled = _first(
        doc.get("textOverlays"),
        brief.get("textOverlays"),
    )
    if overlay_enabled is None:
        overlay_enabled = any(
            bool(scene.get("overlayText"))
            for scene in scenes
        )

    end_card = _first(
        doc.get("endCard"),
        brief.get("endCard"),
    )

    music = _first(
        doc.get("musicAndEffects"),
        brief.get("musicAndEffects"),
        doc.get("musicEnabled"),
    )

    reference_url = _first(
        doc.get("referenceImageUrl"),
        brief.get("referenceImageUrl"),
        doc.get("promptImageUrl"),
        doc.get("sourceImageUrl"),
    )

    return {
        "duration_seconds": _optional_num(
            _first(
                doc.get("durationSeconds"),
                doc.get("duration"),
                brief.get("duration"),
            )
        ),
        "ratio": _first(doc.get("ratio"), brief.get("ratio")),
        "generation_mode": _first(
            doc.get("mode"),
            brief.get("mode"),
            doc.get("generationMode"),
        ),
        "campaign_type": _first(
            doc.get("campaignType"),
            brief.get("campaignType"),
        ),
        "visual_style": _first(
            doc.get("visualStyle"),
            brief.get("visualStyle"),
            doc.get("style"),
        ),
        "hook_style": _first(
            doc.get("hookStyle"),
            brief.get("hookStyle"),
        ),
        "pace": _first(doc.get("pace"), brief.get("pace")),
        "camera_motion": _first(
            doc.get("cameraMotion"),
            brief.get("cameraMotion"),
        ),
        "voice_mode": voice_mode,
        "music_enabled": bool(music) if music is not None else None,
        "text_overlays_enabled": (
            bool(overlay_enabled)
            if overlay_enabled is not None
            else None
        ),
        "cta_finish_enabled": (
            bool(end_card)
            if end_card is not None
            else None
        ),
        "reference_image_used": bool(reference_url),
        "scene_count": len(scenes) if scenes else None,
        "scene_roles": [
            _first(scene.get("purpose"), scene.get("role"))
            for scene in scenes
            if _first(scene.get("purpose"), scene.get("role"))
        ],
        "scene_performance_modes": [
            scene.get("performanceMode")
            for scene in scenes
            if scene.get("performanceMode")
        ],
    }


def manual_job_to_evidence(
    *,
    uid: str,
    kind: str,
    job_id: str,
    doc: dict[str, Any],
    analyze_media: bool,
) -> PerformanceEvidence | None:
    perf = doc.get("performance") or {}
    if not perf:
        return None

    headline = _first(
        doc.get("headline"),
        doc.get("generatedHeadline"),
        (doc.get("copy") or {}).get("headline"),
        (doc.get("result") or {}).get("headline"),
    )
    body = _first(
        doc.get("body"),
        doc.get("primaryText"),
        doc.get("generatedPrimaryText"),
        (doc.get("copy") or {}).get("body"),
        (doc.get("result") or {}).get("body"),
        (doc.get("copy") or {}).get("primary_text"),
    )
    cta = _first(
        doc.get("cta"),
        doc.get("generatedCta"),
        (doc.get("copy") or {}).get("cta"),
        (doc.get("result") or {}).get("cta"),
    )

    image_url = _first(
        doc.get("imageUrl"),
        doc.get("image_url"),
        doc.get("outputUrl"),
        doc.get("url"),
    )
    video_url = _first(
        doc.get("finalVideoUrl"),
        doc.get("videoUrl"),
        doc.get("video_url"),
        doc.get("outputUrl") if kind == "video" else None,
    )

    source_metadata = {
        "platform": doc.get("platform"),
        "tone": doc.get("tone"),
        "stylePreset": doc.get("stylePreset"),
        "ratio": _first(
            doc.get("ratio"),
            doc.get("aspectRatio"),
            doc.get("imageSize"),
        ),
        "brandKitId": doc.get("brandKitId"),
        "prompt": _first(
            doc.get("prompt"),
            doc.get("visualPrompt"),
            doc.get("directorPrompt"),
        ),
        "referenceImageMode": doc.get("referenceImageMode"),
        "referenceImageCount": doc.get("referenceImageCount"),
        "campaignObjective": doc.get("campaignObjective"),
        "productType": doc.get("productType"),
        "useBrandKit": doc.get("useBrandKit"),
        "usePerformanceIntelligence": _first(
            doc.get("usePerformanceIntelligence"),
            (doc.get("brief") or {}).get("usePerformanceIntelligence")
            if isinstance(doc.get("brief"), dict)
            else None,
        ),
    }

    features = CreativeFeatures(
        copy=analyze_copy(
            headline=headline,
            body=body,
            cta=cta,
        ),
        source_metadata=source_metadata,
    )

    if kind == "image" and image_url and analyze_media:
        try:
            features.image = analyze_image(image_url)
        except Exception as exc:
            features.image = {
                "analysis_status": "failed",
                "analysis_error": str(exc)[:250],
            }

    if kind == "video":
        video_features = _video_generation_features(doc)
        features.video = analyze_video_metadata(
            duration_seconds=video_features.get("duration_seconds"),
            title=_first(
                doc.get("title"),
                doc.get("productName"),
                doc.get("product_name"),
            ),
            source="adgen_library",
        )
        features.video.update(
            {
                key: value
                for key, value in video_features.items()
                if value is not None
            }
        )
        if video_url:
            features.video["video_url_available"] = True

    evidence = PerformanceEvidence(
        source="manual_tracking",
        creative_id=stable_creative_id(
            "adgen_library",
            uid,
            kind,
            job_id,
        ),
        external_asset_id=job_id,
        kind=kind,
        asset_role=kind,
        impressions=int(_num(perf.get("impressions"))),
        clicks=int(_num(perf.get("clicks"))),
        spend=_num(perf.get("spend")),
        conversions=_num(perf.get("conversions")),
        revenue=_num(perf.get("revenue")),
        ctr_percent=_optional_num(perf.get("ctr")),
        cpc=_optional_num(perf.get("cpc")),
        cpa=_optional_num(perf.get("cpa")),
        cpm=_optional_num(perf.get("cpm")),
        roas=_optional_num(perf.get("roas")),
        thumb_stop_rate=_optional_num(perf.get("thumb_stop_rate")),
        view_3s=_optional_num(perf.get("view_3s")),
        view_6s=_optional_num(perf.get("view_6s")),
        hold_rate=_optional_num(perf.get("hold_rate")),
        conversion_rate=_optional_num(perf.get("conversion_rate")),
        platform_label=(
            "BEST"
            if perf.get("marked_successful")
            else None
        ),
        attribution_confidence=1.0,
        features=features,
        raw_metadata={
            "libraryKind": kind,
            "libraryJobId": job_id,
            "markedSuccessful": bool(perf.get("marked_successful")),
            "platform": doc.get("platform"),
            "ratio": source_metadata.get("ratio"),
            "referenceImageMode": doc.get("referenceImageMode"),
            "campaignObjective": doc.get("campaignObjective"),
            "productType": doc.get("productType"),
        },
    )

    return qualify_evidence(
        evidence,
        get_thresholds(uid),
    )


def ingest_manual_creative(
    *,
    uid: str,
    kind: str,
    job_id: str,
    analyze_media: bool = True,
) -> dict[str, Any]:
    collection = "image_jobs" if kind == "image" else "video_jobs"
    snap = get_db().collection(collection).document(job_id).get()
    if not snap.exists:
        return {"ok": False, "reason": "creative_not_found"}

    doc = snap.to_dict() or {}
    if doc.get("uid") != uid:
        return {"ok": False, "reason": "forbidden"}

    evidence = manual_job_to_evidence(
        uid=uid,
        kind=kind,
        job_id=job_id,
        doc=doc,
        analyze_media=analyze_media,
    )
    if not evidence:
        return {"ok": False, "reason": "no_performance"}

    evidence_id = save_evidence(uid, evidence)
    return {
        "ok": True,
        "evidenceId": evidence_id,
        "status": evidence.evidence_status,
    }


def ingest_manual_library(
    *,
    uid: str,
    analyze_media: bool = True,
    limit: int = 500,
) -> dict[str, Any]:
    db = get_db()
    imported = 0
    skipped = 0
    failures = []

    for kind, collection in [
        ("image", "image_jobs"),
        ("video", "video_jobs"),
    ]:
        query = (
            db.collection(collection)
            .where("uid", "==", uid)
            .limit(limit)
        )
        for snap in query.stream():
            try:
                evidence = manual_job_to_evidence(
                    uid=uid,
                    kind=kind,
                    job_id=snap.id,
                    doc=snap.to_dict() or {},
                    analyze_media=analyze_media,
                )
                if not evidence:
                    skipped += 1
                    continue
                save_evidence(uid, evidence)
                imported += 1
            except Exception as exc:
                failures.append(
                    {
                        "kind": kind,
                        "jobId": snap.id,
                        "error": str(exc)[:250],
                    }
                )

    return {
        "imported": imported,
        "skipped": skipped,
        "failures": failures[:25],
    }
