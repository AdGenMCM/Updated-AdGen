from __future__ import annotations

import time
from typing import Any, Dict, Optional

from google.cloud import firestore as gc_firestore

from usage_caps import get_tier_and_status, peek_resource

from .decision_engine import build_recommendation_list, choose_next_best_action
from .scoring import calculate_scores


PROFILE_COLLECTION = "customer_intelligence_profiles"


def _profile_ref(db, uid: str):
    return db.collection(PROFILE_COLLECTION).document(uid)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


def _credit_usage_state(db, uid: str, tier: str, user_doc: Dict[str, Any]) -> Dict[str, Any]:
    image_state = peek_resource(db, uid, tier, "images", user_doc) or {}
    video_state = peek_resource(db, uid, tier, "video_credits", user_doc) or {}

    purchased_images = max(0, _safe_int(image_state.get("purchasedRemaining"), _safe_int(user_doc.get("purchasedImageCredits"))))
    purchased_videos = max(0, _safe_int(video_state.get("purchasedRemaining"), _safe_int(user_doc.get("purchasedVideoCredits"))))

    def normalize(state: Dict[str, Any], purchased: int) -> Dict[str, Any]:
        cap = max(0, _safe_int(state.get("cap")))
        used = max(0, _safe_int(state.get("used")))
        included_remaining = max(0, cap - used)
        return {
            "cap": cap,
            "used": used,
            "includedRemaining": included_remaining,
            "purchasedRemaining": purchased,
            "totalRemaining": included_remaining + purchased,
            "includedExhausted": bool(cap > 0 and used >= cap),
            "periodKey": state.get("periodKey") or state.get("month"),
        }

    return {
        "purchasedImageCredits": purchased_images,
        "purchasedVideoCredits": purchased_videos,
        "hasPurchasedCredits": bool(purchased_images or purchased_videos),
        "creditUsage": {
            "images": normalize(image_state, purchased_images),
            "video_credits": normalize(video_state, purchased_videos),
        },
    }


def _base_profile(uid: str, user_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    user_doc = user_doc or {}
    tier, status = get_tier_and_status(user_doc)
    return {
        "uid": uid,
        "tier": tier or "free",
        "subscriptionStatus": status or "inactive",
        "activationScore": 0,
        "engagementScore": 0,
        "lifecycleStage": "new",
        "commercialState": "free",
        "brandKitCompleted": False,
        "googleAdsConnected": False,
        "metaAdsConnected": False,
        "purchasedImageCredits": max(0, _safe_int(user_doc.get("purchasedImageCredits"))),
        "purchasedVideoCredits": max(0, _safe_int(user_doc.get("purchasedVideoCredits"))),
        "hasPurchasedCredits": bool(_safe_int(user_doc.get("purchasedImageCredits")) or _safe_int(user_doc.get("purchasedVideoCredits"))),
        "creditUsage": {},
        "counters": {},
        "featureAccessAttempts": {},
        "completedActions": [],
        "nextBestAction": None,
        "recommendations": [],
        "lastEventName": None,
        "lastEventAt": None,
        "createdAt": int(time.time()),
        "updatedAt": int(time.time()),
    }


def get_or_create_profile(db, uid: str) -> Dict[str, Any]:
    ref = _profile_ref(db, uid)
    snap = ref.get()
    user_doc = db.collection("users").document(uid).get().to_dict() or {}
    tier, _status = get_tier_and_status(user_doc)
    credit_state = _credit_usage_state(db, uid, tier or "free", user_doc)

    if snap.exists:
        profile = snap.to_dict() or {}
        changed = any(profile.get(key) != value for key, value in credit_state.items())
        if changed:
            profile.update(credit_state)
            profile["updatedAt"] = int(time.time())
            profile["nextBestAction"] = choose_next_best_action(profile)
            profile["recommendations"] = build_recommendation_list(profile)
            ref.set(profile, merge=True)
        return profile

    profile = _base_profile(uid, user_doc)
    profile.update(credit_state)
    profile["nextBestAction"] = choose_next_best_action(profile)
    profile["recommendations"] = build_recommendation_list(profile)
    ref.set(profile)
    return profile


def _increment_nested(mapping: Dict[str, Any], key: str, amount: int = 1) -> Dict[str, Any]:
    updated = dict(mapping or {})
    updated[key] = int(updated.get(key, 0) or 0) + amount
    return updated


def apply_event_to_profile(
    db,
    uid: str,
    event_name: str,
    metadata: Optional[Dict[str, Any]] = None,
    occurred_at: Optional[int] = None,
) -> Dict[str, Any]:
    metadata = metadata or {}
    profile = get_or_create_profile(db, uid)
    user_doc = db.collection("users").document(uid).get().to_dict() or {}
    tier, status = get_tier_and_status(user_doc)

    profile["tier"] = tier or profile.get("tier") or "free"
    profile["subscriptionStatus"] = status or profile.get("subscriptionStatus") or "inactive"
    profile.update(_credit_usage_state(db, uid, profile["tier"], user_doc))

    counters = dict(profile.get("counters") or {})
    attempts = dict(profile.get("featureAccessAttempts") or {})

    if event_name == "user.logged_in":
        counters = _increment_nested(counters, "logins30d")
    elif event_name == "creative.generated":
        creative_type = str(metadata.get("creativeType") or "image").lower()
        counters = _increment_nested(counters, "creativeGenerated")
        if creative_type == "video":
            counters = _increment_nested(counters, "videoGenerated")
    elif event_name == "video.generated":
        counters = _increment_nested(counters, "creativeGenerated")
        counters = _increment_nested(counters, "videoGenerated")
    elif event_name == "optimizer.completed":
        counters = _increment_nested(counters, "optimizerCompleted")
    elif event_name == "creative_studio.project_saved":
        counters = _increment_nested(counters, "studioProjectsSaved")
    elif event_name == "brand_kit.completed":
        profile["brandKitCompleted"] = True
    elif event_name == "integration.google_ads_connected":
        profile["googleAdsConnected"] = True
    elif event_name == "integration.meta_ads_connected":
        profile["metaAdsConnected"] = True
    elif event_name == "reporting.viewed":
        counters = _increment_nested(counters, "reportingViews")
    elif event_name == "feature.access_attempted":
        feature_key = str(metadata.get("feature") or "").strip()
        if feature_key:
            attempts = _increment_nested(attempts, feature_key)
    elif event_name == "usage.limit_reached":
        resource = str(metadata.get("resource") or "unknown").strip()
        counters = _increment_nested(counters, f"limitReached.{resource}")
    elif event_name == "credit_pack.purchased":
        counters = _increment_nested(counters, "creditPackPurchases")
    elif event_name in {"subscription.activated", "subscription.plan_changed", "subscription.upgraded"}:
        profile["subscriptionStatus"] = str(metadata.get("status") or "active")
        if metadata.get("tier"):
            profile["tier"] = metadata["tier"]
    elif event_name == "subscription.canceled":
        profile["subscriptionStatus"] = "canceled"
    elif event_name == "subscription.payment_failed":
        profile["subscriptionStatus"] = "past_due"
    elif event_name == "subscription.payment_recovered":
        profile["subscriptionStatus"] = "active"

    profile["counters"] = counters
    profile["featureAccessAttempts"] = attempts
    profile["lastEventName"] = event_name
    profile["lastEventAt"] = int(occurred_at or time.time())
    profile["updatedAt"] = int(time.time())

    score = calculate_scores(profile)
    profile["activationScore"] = score.activation_score
    profile["engagementScore"] = score.engagement_score
    profile["lifecycleStage"] = score.lifecycle_stage
    profile["commercialState"] = score.commercial_state
    profile["completedActions"] = score.completed_actions
    profile["nextBestAction"] = choose_next_best_action(profile)
    profile["recommendations"] = build_recommendation_list(profile)

    _profile_ref(db, uid).set(profile, merge=True)

    db.collection("users").document(uid).set(
        {
            "customerIntelligence": {
                "activationScore": profile["activationScore"],
                "engagementScore": profile["engagementScore"],
                "lifecycleStage": profile["lifecycleStage"],
                "commercialState": profile["commercialState"],
                "nextBestAction": profile["nextBestAction"],
                "updatedAt": gc_firestore.SERVER_TIMESTAMP,
            }
        },
        merge=True,
    )

    return profile


def rebuild_profile(db, uid: str) -> Dict[str, Any]:
    profile = get_or_create_profile(db, uid)
    user_doc = db.collection("users").document(uid).get().to_dict() or {}
    tier, status = get_tier_and_status(user_doc)
    profile["tier"] = tier or "free"
    profile["subscriptionStatus"] = status or "inactive"
    profile.update(_credit_usage_state(db, uid, profile["tier"], user_doc))

    score = calculate_scores(profile)
    profile["activationScore"] = score.activation_score
    profile["engagementScore"] = score.engagement_score
    profile["lifecycleStage"] = score.lifecycle_stage
    profile["commercialState"] = score.commercial_state
    profile["completedActions"] = score.completed_actions
    profile["nextBestAction"] = choose_next_best_action(profile)
    profile["recommendations"] = build_recommendation_list(profile)
    profile["updatedAt"] = int(time.time())

    _profile_ref(db, uid).set(profile, merge=True)
    return profile
