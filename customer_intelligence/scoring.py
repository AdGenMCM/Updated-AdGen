from __future__ import annotations

from typing import Any, Dict, List

from .models import ScoreResult


ACTIVATION_WEIGHTS = {
    "created_first_creative": 35,
    "created_second_creative": 15,
    "completed_brand_kit": 20,
    "saved_studio_project": 10,
    "created_video": 10,
    "connected_ad_platform": 10,
}

ENGAGEMENT_WEIGHTS = {
    "creative_count": 4,
    "video_count": 8,
    "optimizer_count": 8,
    "studio_save_count": 5,
    "login_count_30d": 2,
    "reporting_view_count": 3,
}


def _count(profile: Dict[str, Any], key: str) -> int:
    try:
        return max(0, int((profile.get("counters") or {}).get(key, 0) or 0))
    except (TypeError, ValueError):
        return 0


def calculate_scores(profile: Dict[str, Any]) -> ScoreResult:
    completed: List[str] = []
    activation = 0

    creative_count = _count(profile, "creativeGenerated")
    video_count = _count(profile, "videoGenerated")
    optimizer_count = _count(profile, "optimizerCompleted")
    studio_count = _count(profile, "studioProjectsSaved")
    login_count = _count(profile, "logins30d")
    reporting_count = _count(profile, "reportingViews")

    if creative_count >= 1:
        activation += ACTIVATION_WEIGHTS["created_first_creative"]
        completed.append("created_first_creative")
    if creative_count >= 2:
        activation += ACTIVATION_WEIGHTS["created_second_creative"]
        completed.append("created_second_creative")
    if bool(profile.get("brandKitCompleted")):
        activation += ACTIVATION_WEIGHTS["completed_brand_kit"]
        completed.append("completed_brand_kit")
    if studio_count >= 1:
        activation += ACTIVATION_WEIGHTS["saved_studio_project"]
        completed.append("saved_studio_project")
    if video_count >= 1:
        activation += ACTIVATION_WEIGHTS["created_video"]
        completed.append("created_video")
    if bool(profile.get("googleAdsConnected") or profile.get("metaAdsConnected")):
        activation += ACTIVATION_WEIGHTS["connected_ad_platform"]
        completed.append("connected_ad_platform")

    activation = min(100, activation)

    engagement = 0
    engagement += min(28, creative_count * ENGAGEMENT_WEIGHTS["creative_count"])
    engagement += min(16, video_count * ENGAGEMENT_WEIGHTS["video_count"])
    engagement += min(16, optimizer_count * ENGAGEMENT_WEIGHTS["optimizer_count"])
    engagement += min(15, studio_count * ENGAGEMENT_WEIGHTS["studio_save_count"])
    engagement += min(15, login_count * ENGAGEMENT_WEIGHTS["login_count_30d"])
    engagement += min(10, reporting_count * ENGAGEMENT_WEIGHTS["reporting_view_count"])
    engagement = min(100, engagement)

    if activation < 35:
        lifecycle_stage = "new"
    elif activation < 70:
        lifecycle_stage = "activating"
    elif engagement < 35:
        lifecycle_stage = "activated"
    else:
        lifecycle_stage = "engaged"

    stripe_status = str(profile.get("subscriptionStatus") or "inactive").lower()
    tier = str(profile.get("tier") or "free").lower()

    if stripe_status == "past_due":
        commercial_state = "payment_attention"
    elif stripe_status in {"active", "trialing"} and tier != "free":
        commercial_state = "paid"
    elif stripe_status == "canceled":
        commercial_state = "canceled"
    else:
        commercial_state = "free"

    return ScoreResult(
        activation_score=activation,
        engagement_score=engagement,
        lifecycle_stage=lifecycle_stage,
        commercial_state=commercial_state,
        completed_actions=completed,
    )
