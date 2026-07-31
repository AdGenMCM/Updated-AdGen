from __future__ import annotations

import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

from google.cloud import firestore as gc_firestore

from usage_caps import get_tier_and_status

from .decision_engine import build_recommendation_list, choose_next_best_action
from .profile_service import PROFILE_COLLECTION, get_or_create_profile
from .scoring import calculate_scores


def _safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


def _query_uid_collection(db, collection_name: str, uid: str) -> List[Dict[str, Any]]:
    """Return documents owned by uid from a top-level collection."""
    try:
        query = db.collection(collection_name).where("uid", "==", uid)
        return [{"id": snap.id, **(snap.to_dict() or {})} for snap in query.stream()]
    except Exception as exc:
        print(
            f"CUSTOMER INTELLIGENCE HISTORY QUERY ERROR [{collection_name}]:",
            repr(exc),
            flush=True,
        )
        return []


def _read_subcollection(db, uid: str, collection_name: str) -> List[Dict[str, Any]]:
    try:
        ref = db.collection("users").document(uid).collection(collection_name)
        return [{"id": snap.id, **(snap.to_dict() or {})} for snap in ref.stream()]
    except Exception:
        return []


def _successful(items: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        item
        for item in items
        if str(item.get("status") or "").lower() in {"succeeded", "complete", "completed"}
    ]


def _latest_timestamp(items: Iterable[Dict[str, Any]]) -> Optional[int]:
    latest = 0
    for item in items:
        for key in ("updatedAt", "createdAt", "completedAt", "finishedAt"):
            value = item.get(key)
            if hasattr(value, "timestamp"):
                value = int(value.timestamp())
            value = _safe_int(value)
            latest = max(latest, value)
    return latest or None


def _brand_kit_completion(kit: Dict[str, Any]) -> Tuple[bool, int]:
    if not kit:
        return False, 0

    color_enabled = _safe_dict(kit.get("colorEnabled"))
    font_enabled = _safe_dict(kit.get("fontEnabled"))

    checks = [
        bool(kit.get("logoUrl")),
        bool(kit.get("brandName")),
        bool(kit.get("websiteUrl")),
        any(bool(color_enabled.get(key)) for key in ("primary", "secondary", "accent")),
        any(bool(font_enabled.get(key)) for key in ("headline", "body", "cta")),
        bool(kit.get("voice") or kit.get("brandPersonality") or kit.get("brandDna")),
    ]
    completed = sum(1 for value in checks if value)
    return completed == len(checks), round((completed / len(checks)) * 100)


def _load_brand_kits(db, uid: str, user_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    kits: List[Dict[str, Any]] = []
    kits.extend(_query_uid_collection(db, "brand_kits", uid))
    kits.extend(_read_subcollection(db, uid, "brand_kits"))

    legacy = user_doc.get("brandKit")
    if isinstance(legacy, dict) and legacy:
        kits.append({"id": "legacy_user_brand_kit", **legacy})

    # Deduplicate by document id while retaining legacy/fallback records.
    deduped: Dict[str, Dict[str, Any]] = {}
    for index, kit in enumerate(kits):
        key = str(kit.get("id") or f"kit_{index}")
        deduped[key] = kit
    return list(deduped.values())


def _document_indicates_connected(data: Dict[str, Any]) -> bool:
    if not data:
        return False
    status = str(data.get("status") or data.get("connectionStatus") or "").lower()
    if status in {"connected", "active", "ready", "authorized"}:
        return True
    if data.get("connected") is True or data.get("isConnected") is True:
        return True
    return bool(
        data.get("refreshToken")
        or data.get("refresh_token")
        or data.get("customerId")
        or data.get("customer_id")
        or data.get("accountId")
    )


def _load_integration_state(db, uid: str, provider: str, user_doc: Dict[str, Any]) -> bool:
    candidates: List[Dict[str, Any]] = []

    # Common per-user integration document layouts.
    for path in (
        ("users", uid, "integrations", provider),
        ("users", uid, "integrations", provider.replace("_", "-")),
    ):
        try:
            snap = db.collection(path[0]).document(path[1]).collection(path[2]).document(path[3]).get()
            if snap.exists:
                candidates.append(snap.to_dict() or {})
        except Exception:
            pass

    # Common top-level layouts.
    for collection_name in (
        f"{provider}_integrations",
        f"{provider}_connections",
        "ad_integrations",
        "integrations",
    ):
        candidates.extend(_query_uid_collection(db, collection_name, uid))

    user_integrations = _safe_dict(user_doc.get("integrations"))
    provider_doc = user_integrations.get(provider) or user_integrations.get(provider.replace("_", "-"))
    if isinstance(provider_doc, dict):
        candidates.append(provider_doc)

    for candidate in candidates:
        candidate_provider = str(candidate.get("provider") or candidate.get("platform") or "").lower()
        if candidate_provider and provider.replace("_", "") not in candidate_provider.replace("_", "").replace("-", ""):
            continue
        if _document_indicates_connected(candidate):
            return True
    return False


def collect_historical_snapshot(db, uid: str) -> Dict[str, Any]:
    user_doc = db.collection("users").document(uid).get().to_dict() or {}

    image_jobs = _successful(_query_uid_collection(db, "image_jobs", uid))
    video_jobs = _successful(_query_uid_collection(db, "video_jobs", uid))
    optimizer_jobs = _successful(_query_uid_collection(db, "optimizer_jobs", uid))

    studio_projects = [
        item
        for item in image_jobs
        if str(item.get("source") or item.get("sourceType") or "").lower() == "creative_studio"
    ]
    generated_images = [
        item
        for item in image_jobs
        if str(item.get("source") or item.get("sourceType") or "").lower() != "creative_studio"
    ]

    brand_kits = _load_brand_kits(db, uid, user_doc)
    brand_scores = [_brand_kit_completion(kit) for kit in brand_kits]
    brand_kit_completed = any(completed for completed, _percent in brand_scores)
    brand_kit_percent = max([percent for _completed, percent in brand_scores] or [0])

    google_connected = _load_integration_state(db, uid, "google_ads", user_doc)
    meta_connected = _load_integration_state(db, uid, "meta_ads", user_doc)

    all_activity = [*image_jobs, *video_jobs, *optimizer_jobs]

    return {
        "userDoc": user_doc,
        "counters": {
            "creativeGenerated": len(generated_images) + len(video_jobs),
            "videoGenerated": len(video_jobs),
            "optimizerCompleted": len(optimizer_jobs),
            "studioProjectsSaved": len(studio_projects),
        },
        "brandKitCompleted": brand_kit_completed,
        "brandKitPercent": brand_kit_percent,
        "brandKitCount": len(brand_kits),
        "googleAdsConnected": google_connected,
        "metaAdsConnected": meta_connected,
        "latestHistoricalActivityAt": _latest_timestamp(all_activity),
        "sourceCounts": {
            "imageJobs": len(generated_images),
            "videoJobs": len(video_jobs),
            "optimizerJobs": len(optimizer_jobs),
            "studioProjects": len(studio_projects),
            "brandKits": len(brand_kits),
        },
    }


def rebuild_profile_from_history(db, uid: str) -> Dict[str, Any]:
    """
    Reconstruct durable Customer Intelligence fields from existing ADGen records.

    Event-only signals such as recent logins, reporting views, access attempts, and
    limit events are preserved from the existing profile because they cannot be
    reliably inferred from creative documents.
    """
    existing = get_or_create_profile(db, uid)
    snapshot = collect_historical_snapshot(db, uid)
    user_doc = snapshot.pop("userDoc")
    tier, status = get_tier_and_status(user_doc)

    existing_counters = dict(existing.get("counters") or {})
    historical_counters = snapshot["counters"]

    merged_counters = {
        **existing_counters,
        **historical_counters,
    }

    now = int(time.time())
    profile = {
        **existing,
        "uid": uid,
        "tier": tier or existing.get("tier") or "free",
        "subscriptionStatus": status or existing.get("subscriptionStatus") or "inactive",
        "counters": merged_counters,
        "brandKitCompleted": bool(snapshot["brandKitCompleted"]),
        "brandKitPercent": int(snapshot["brandKitPercent"]),
        "googleAdsConnected": bool(snapshot["googleAdsConnected"]),
        "metaAdsConnected": bool(snapshot["metaAdsConnected"]),
        "lastHistoricalActivityAt": snapshot.get("latestHistoricalActivityAt"),
        "historyRebuild": {
            "completedAt": now,
            "version": 1,
            "sourceCounts": snapshot["sourceCounts"],
            "brandKitCount": snapshot["brandKitCount"],
        },
        "updatedAt": now,
    }

    score = calculate_scores(profile)
    profile["activationScore"] = score.activation_score
    profile["engagementScore"] = score.engagement_score
    profile["lifecycleStage"] = score.lifecycle_stage
    profile["commercialState"] = score.commercial_state
    profile["completedActions"] = score.completed_actions
    profile["nextBestAction"] = choose_next_best_action(profile)
    profile["recommendations"] = build_recommendation_list(profile)

    db.collection(PROFILE_COLLECTION).document(uid).set(profile, merge=True)
    db.collection("users").document(uid).set(
        {
            "customerIntelligence": {
                "activationScore": profile["activationScore"],
                "engagementScore": profile["engagementScore"],
                "lifecycleStage": profile["lifecycleStage"],
                "commercialState": profile["commercialState"],
                "nextBestAction": profile["nextBestAction"],
                "historyRebuiltAt": gc_firestore.SERVER_TIMESTAMP,
                "updatedAt": gc_firestore.SERVER_TIMESTAMP,
            }
        },
        merge=True,
    )

    return profile
