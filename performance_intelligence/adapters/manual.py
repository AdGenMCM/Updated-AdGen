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


def _first(*values):
    for value in values:
        if value not in (None, "", []):
            return value
    return None


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
        doc.get("videoUrl"),
        doc.get("video_url"),
        doc.get("outputUrl") if kind == "video" else None,
    )

    features = CreativeFeatures(
        copy=analyze_copy(
            headline=headline,
            body=body,
            cta=cta,
        ),
        source_metadata={
            "platform": doc.get("platform"),
            "tone": doc.get("tone"),
            "stylePreset": doc.get("stylePreset"),
            "ratio": doc.get("ratio") or doc.get("imageSize"),
            "brandKitId": doc.get("brandKitId"),
            "prompt": doc.get("prompt"),
        },
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
        features.video = analyze_video_metadata(
            duration_seconds=_num(
                doc.get("durationSeconds")
                or doc.get("duration"),
                0,
            )
            or None,
            title=doc.get("title") or doc.get("product_name"),
            source="adgen_library",
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
        ctr_percent=(
            _num(perf.get("ctr"))
            if perf.get("ctr") is not None
            else None
        ),
        cpc=(
            _num(perf.get("cpc"))
            if perf.get("cpc") is not None
            else None
        ),
        cpa=(
            _num(perf.get("cpa"))
            if perf.get("cpa") is not None
            else None
        ),
        cpm=(
            _num(perf.get("cpm"))
            if perf.get("cpm") is not None
            else None
        ),
        roas=(
            _num(perf.get("roas"))
            if perf.get("roas") is not None
            else None
        ),
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
            "markedSuccessful": bool(
                perf.get("marked_successful")
            ),
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
