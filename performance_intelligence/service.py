import time
from typing import Any

from integrations.google_ads.service import fetch_campaign_summary
from integrations.google_ads.store import (
    get_connection as get_google_connection,
    save_sync_summary as save_google_sync_summary,
)
from integrations.meta_ads.service import (
    sync_campaign_performance,
    sync_creative_performance,
)
from integrations.meta_ads.store import (
    get_connection as get_meta_connection,
    save_campaign_sync,
    save_creative_sync,
)

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
    finish_refresh_session,
    get_refresh_sessions,
    get_summary,
    get_thresholds,
    rebuild_summary,
    save_evidence,
    save_thresholds,
    start_refresh_session,
)


def _source_failure(exc: Exception) -> dict[str, Any]:
    return {
        "status": "failed",
        "added": 0,
        "updated": 0,
        "unchanged": 0,
        "skipped": 0,
        "failures": [{"error": str(exc)[:300]}],
    }


def _normalize_result(result: dict[str, Any] | None) -> dict[str, Any]:
    value = dict(result or {})
    imported = int(value.get("imported") or 0)
    value.setdefault("added", 0)
    value.setdefault("updated", 0)
    value.setdefault("unchanged", 0)
    value.setdefault("skipped", 0)
    value.setdefault("failures", [])

    # Older/manual adapters may only return imported. Keep that result useful
    # without pretending those rows were all new.
    if not any(value.get(key) for key in ("added", "updated", "unchanged")):
        value["processed"] = imported
    else:
        value["processed"] = (
            int(value.get("added") or 0)
            + int(value.get("updated") or 0)
            + int(value.get("unchanged") or 0)
        )
    value["status"] = "completed"
    return value


def _learning_snapshot(summary: dict[str, Any]) -> dict[str, Any]:
    return {
        "confidence": float(summary.get("confidence") or 0),
        "evidenceCount": int(summary.get("evidenceCount") or 0),
        "qualifiedCount": int(summary.get("qualifiedCount") or 0),
        "positiveCount": int(summary.get("positiveCount") or 0),
        "underperformerCount": int(
            summary.get("underperformerCount") or 0
        ),
        "generationProfile": summary.get("generationProfile") or {},
    }



def _top_value(profile: dict[str, Any], key: str) -> str | None:
    values = profile.get(key) or []
    if not values:
        return None
    return values[0].get("value")


def _build_learning_changes(
    before: dict[str, Any],
    after: dict[str, Any],
    source_results: dict[str, Any],
) -> dict[str, Any]:
    added = sum(int(value.get("added") or 0) for value in source_results.values() if isinstance(value, dict))
    updated = sum(int(value.get("updated") or 0) for value in source_results.values() if isinstance(value, dict))
    unchanged = sum(int(value.get("unchanged") or 0) for value in source_results.values() if isinstance(value, dict))
    skipped = sum(int(value.get("skipped") or 0) for value in source_results.values() if isinstance(value, dict))
    failure_count = sum(len(value.get("failures") or []) for value in source_results.values() if isinstance(value, dict))

    before_profile = before.get("generationProfile") or {}
    after_profile = after.get("generationProfile") or {}
    keys = {
        "visualStyle": "top_visual_styles",
        "cta": "top_cta_openers",
        "headlineOpener": "top_headline_openers",
        "composition": "top_compositions",
        "background": "top_backgrounds",
        "imageryType": "top_imagery_types",
    }
    profile_changes = {}
    for label, key in keys.items():
        old = _top_value(before_profile, key)
        new = _top_value(after_profile, key)
        if old != new and new:
            profile_changes[label] = {"before": old, "after": new}

    confidence_before = float(before.get("confidence") or 0)
    confidence_after = float(after.get("confidence") or 0)
    confidence_delta = round(confidence_after - confidence_before, 4)
    winner_delta = int(after.get("positiveCount") or 0) - int(before.get("positiveCount") or 0)

    top_style = _top_value(after_profile, "top_visual_styles")
    top_cta = _top_value(after_profile, "top_cta_openers")
    top_composition = _top_value(after_profile, "top_compositions")
    recommendation_parts = []
    if top_style:
        recommendation_parts.append(f"prioritize {str(top_style).replace('_', ' ')} creative")
    if top_composition:
        recommendation_parts.append(f"use {str(top_composition).replace('_', ' ')} compositions")
    if top_cta:
        recommendation_parts.append(f"test CTAs beginning with {str(top_cta).replace('_', ' ')}")
    recommendation = (
        "Continue to " + ", and ".join(recommendation_parts) + "."
        if recommendation_parts
        else "Continue collecting qualified results so ADGen can identify stronger creative patterns."
    )

    return {
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "skipped": skipped,
        "failureCount": failure_count,
        "newWinners": max(0, winner_delta),
        "confidenceBefore": confidence_before,
        "confidenceAfter": confidence_after,
        "confidenceDelta": confidence_delta,
        "profileChanges": profile_changes,
        "recommendation": recommendation,
    }

def rebuild_intelligence(
    *,
    uid: str,
    payload: RebuildRequest,
) -> dict[str, Any]:
    before_summary = get_summary(uid)
    before = _learning_snapshot(before_summary)
    session_id = start_refresh_session(uid, payload.model_dump())
    source_results: dict[str, Any] = {}
    failure_count = 0

    try:
        if payload.include_manual:
            try:
                source_results["manual"] = _normalize_result(
                    ingest_manual_library(
                        uid=uid,
                        analyze_media=payload.analyze_media,
                    )
                )
            except Exception as exc:
                failure_count += 1
                source_results["manual"] = _source_failure(exc)

        if payload.include_google_ads:
            try:
                google_connection = get_google_connection(uid) or {}
                customer_id = google_connection.get("selectedCustomerId")

                if payload.sync_sources and customer_id:
                    report = fetch_campaign_summary(
                        uid,
                        customer_id=customer_id,
                        login_customer_id=google_connection.get(
                            "loginCustomerId"
                        ),
                        start_date=payload.google_date_range,
                        custom_start_date=payload.google_start_date,
                        custom_end_date=payload.google_end_date,
                    )
                    save_google_sync_summary(
                        uid,
                        summary=report.get("summary") or {},
                        campaigns=report.get("campaigns") or [],
                        synced_at=int(time.time()),
                    )

                source_results["googleAds"] = _normalize_result(
                    ingest_google_ads(
                        uid=uid,
                        date_range=payload.google_date_range,
                        start_date=payload.google_start_date,
                        end_date=payload.google_end_date,
                        analyze_media=payload.analyze_media,
                    )
                )
            except Exception as exc:
                failure_count += 1
                source_results["googleAds"] = _source_failure(exc)

        if payload.include_meta_ads:
            try:
                meta_connection = get_meta_connection(uid) or {}
                has_meta_account = bool(
                    meta_connection.get("selectedAdAccountId")
                )

                if payload.sync_sources and has_meta_account:
                    campaign_result = sync_campaign_performance(
                        uid,
                        date_range=payload.meta_date_range,
                        start_date=payload.meta_start_date,
                        end_date=payload.meta_end_date,
                    )
                    save_campaign_sync(
                        uid,
                        date_range=campaign_result["dateRange"],
                        summary=campaign_result["summary"],
                        campaigns=campaign_result["campaigns"],
                    )

                    creative_result = sync_creative_performance(
                        uid,
                        date_range=payload.meta_date_range,
                        start_date=payload.meta_start_date,
                        end_date=payload.meta_end_date,
                    )
                    save_creative_sync(
                        uid,
                        date_range=creative_result["dateRange"],
                        creatives=creative_result["creatives"],
                    )

                source_results["metaAds"] = _normalize_result(
                    ingest_meta_ads(
                        uid=uid,
                        date_range=payload.meta_date_range,
                        start_date=payload.meta_start_date,
                        end_date=payload.meta_end_date,
                        analyze_media=payload.analyze_media,
                    )
                )
            except Exception as exc:
                failure_count += 1
                source_results["metaAds"] = _source_failure(exc)

        after_summary = rebuild_summary(uid)
        after = _learning_snapshot(after_summary)
        status = "partial" if failure_count else "completed"
        learning_changes = _build_learning_changes(before, after, source_results)
        latest_refresh = finish_refresh_session(
            uid,
            session_id,
            status=status,
            sources=source_results,
            before=before,
            after=after,
            learning_changes=learning_changes,
        )
        # Store the completed refresh metadata back into the returned summary.
        after_summary["latestRefresh"] = latest_refresh

        return {
            "ok": True,
            "status": status,
            "refreshSessionId": session_id,
            **source_results,
            "before": before,
            "after": after,
            "learningChanges": learning_changes,
            "summary": after_summary,
            "latestRefresh": latest_refresh,
        }
    except Exception as exc:
        finish_refresh_session(
            uid,
            session_id,
            status="failed",
            sources=source_results,
            before=before,
            error=str(exc)[:300],
        )
        raise


def refresh_status(uid: str) -> dict[str, Any]:
    summary = get_summary(uid)
    google = get_google_connection(uid) or {}
    meta = get_meta_connection(uid) or {}
    return {
        "latestRefresh": summary.get("latestRefresh"),
        "learningTimeline": get_refresh_sessions(uid, limit=12),
        "learningUpdatedAt": summary.get("updatedAt"),
        "googleAds": {
            "connected": google.get("status") == "connected",
            "selected": bool(google.get("selectedCustomerId")),
            "lastSyncAt": google.get("lastSyncAt"),
        },
        "metaAds": {
            "connected": meta.get("status") == "connected",
            "selected": bool(meta.get("selectedAdAccountId")),
            "lastSyncAt": meta.get("lastSyncAt"),
            "lastCreativeSyncAt": meta.get("lastCreativeSyncAt"),
            "lastSyncDateRange": meta.get("lastSyncDateRange"),
            "lastCreativeSyncDateRange": meta.get(
                "lastCreativeSyncDateRange"
            ),
        },
    }


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
    evidence = qualify_evidence(evidence, get_thresholds(uid))
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
        "sourceStats": summary.get("sourceStats", {}),
        "updatedAt": summary.get("updatedAt"),
        "profile": summary.get("generationProfile", {}),
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
    "refresh_status",
    "save_thresholds",
    "QualificationThresholds",
]
