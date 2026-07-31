from __future__ import annotations

from typing import Any, Dict, Optional

from plan_config import get_plan_config, normalize_tier


# Customer Intelligence models each pricing-page capability separately.
# Several capabilities intentionally map to the same existing entitlement flag;
# this does not change ADGen's live authorization or plan behavior.
FEATURES: Dict[str, Dict[str, Any]] = {
    "image_generation": {
        "label": "Image Generation",
        "route": "/adgenerator",
        "availability": "limit:images",
    },
    "ad_copy_generation": {
        "label": "Ad Copy Generation",
        "route": "/adgenerator",
        "availability": "limit:images",
    },
    "video_generation": {
        "label": "Video Generation",
        "route": "/video-ads",
        "availability": "feature:video_generation",
    },
    "creative_studio": {
        "label": "Creative Studio",
        "route": "/creative-studio",
        "availability": (
            "tiers:trial_monthly,early_access,starter_monthly,"
            "pro_monthly,business_monthly"
        ),
    },
    "creative_library": {
        "label": "Creative Library",
        "route": "/library",
        "availability": (
            "tiers:trial_monthly,early_access,starter_monthly,"
            "pro_monthly,business_monthly"
        ),
    },
    # Legacy alias retained so existing stored events/profiles remain valid.
    "library": {
        "label": "Creative Library",
        "route": "/library",
        "availability": (
            "tiers:trial_monthly,early_access,starter_monthly,"
            "pro_monthly,business_monthly"
        ),
    },
    "brand_kit": {
        "label": "Brand Kit",
        "route": "/brand-kit",
        "availability": "limit:brand_kits",
    },
    "optimizer": {
        "label": "Optimizer",
        "route": "/optimizer",
        "availability": "feature:optimizer",
    },
    "manual_performance_tracking": {
        "label": "Manual Performance Tracking",
        "route": "/insights",
        "availability": "feature:performance_tracking",
    },
    # Legacy alias retained for existing feature-access events.
    "performance_tracking": {
        "label": "Performance Tracking",
        "route": "/insights",
        "availability": "feature:performance_tracking",
    },
    "google_ads": {
        "label": "Google Ads Integration",
        "route": "/insights",
        "availability": "feature:performance_tracking",
    },
    "meta_ads": {
        "label": "Meta Ads Integration",
        "route": "/insights",
        "availability": "feature:performance_tracking",
    },
    "performance_intelligence": {
        "label": "Performance Intelligence",
        "route": "/insights",
        "availability": "feature:winner_analysis",
    },
    "unified_reporting": {
        "label": "Unified Reporting",
        "route": "/reports",
        "availability": "feature:advanced_insights",
    },
    # Legacy alias retained for existing recommendation/event logic.
    "reporting": {
        "label": "Unified Reporting",
        "route": "/reports",
        "availability": "feature:advanced_insights",
    },
    "creative_dna": {
        "label": "Creative DNA",
        "route": "/insights",
        "availability": "feature:winner_analysis",
    },
    "priority_generation": {
        "label": "Priority Generation",
        "route": "/adgenerator",
        "availability": "feature:priority_generation",
    },
}


def feature_available(tier: Optional[str], feature_key: str) -> bool:
    feature = FEATURES.get(feature_key)
    if not feature:
        return False

    rule = feature.get("availability")
    normalized_tier = normalize_tier(tier)

    if rule == "always":
        return True

    plan = get_plan_config(normalized_tier)

    if isinstance(rule, str) and rule.startswith("feature:"):
        key = rule.split(":", 1)[1]
        return bool((plan.get("features") or {}).get(key, False))

    if isinstance(rule, str) and rule.startswith("limit:"):
        key = rule.split(":", 1)[1]
        return int((plan.get("limits") or {}).get(key, 0) or 0) > 0

    if isinstance(rule, str) and rule.startswith("tiers:"):
        allowed_tiers = {
            value.strip().lower()
            for value in rule.split(":", 1)[1].split(",")
            if value.strip()
        }
        return normalized_tier in allowed_tiers

    return False


def build_feature_state(
    tier: Optional[str],
    usage_summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    usage_summary = usage_summary or {}
    state: Dict[str, Any] = {}

    for key, feature in FEATURES.items():
        state[key] = {
            "label": feature["label"],
            "route": feature["route"],
            "available": feature_available(tier, key),
            "used": bool((usage_summary.get(key) or {}).get("used")),
        }

    return state
