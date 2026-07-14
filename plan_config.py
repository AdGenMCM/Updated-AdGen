from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional

GIB = 1024 ** 3

PLAN_CONFIG: Dict[str, Dict[str, Any]] = {
    "trial_monthly": {
        "label": "Trial",
        "monthly_price": 9.99,
        "limits": {
            "images": 10,
            "video_credits": 2,
            "optimizer_runs": 0,
            "brand_kits": 1,
            "storage_bytes": 2 * GIB,
        },
        "features": {
            "video_generation": True,
            "optimizer": False,
            "performance_tracking": False,
            "winner_analysis": False,
            "advanced_insights": False,
            "priority_generation": False,
        },
    },
    "starter_monthly": {
        "label": "Starter",
        "monthly_price": 34.99,
        "limits": {
            "images": 40,
            "video_credits": 5,
            "optimizer_runs": 0,
            "brand_kits": 1,
            "storage_bytes": 10 * GIB,
        },
        "features": {
            "video_generation": True,
            "optimizer": False,
            "performance_tracking": False,
            "winner_analysis": False,
            "advanced_insights": False,
            "priority_generation": False,
        },
    },
    "pro_monthly": {
        "label": "Pro",
        "monthly_price": 79.99,
        "limits": {
            "images": 100,
            "video_credits": 12,
            "optimizer_runs": 20,
            "brand_kits": 3,
            "storage_bytes": 50 * GIB,
        },
        "features": {
            "video_generation": True,
            "optimizer": True,
            "performance_tracking": True,
            "winner_analysis": True,
            "advanced_insights": True,
            "priority_generation": False,
        },
    },
    "business_monthly": {
        "label": "Business",
        "monthly_price": 199.99,
        "limits": {
            "images": 250,
            "video_credits": 30,
            "optimizer_runs": 75,
            "brand_kits": 10,
            "storage_bytes": 200 * GIB,
        },
        "features": {
            "video_generation": True,
            "optimizer": True,
            "performance_tracking": True,
            "winner_analysis": True,
            "advanced_insights": True,
            "priority_generation": True,
        },
    },
}

# Existing Early Access subscriptions remain recognizable, but this tier should
# not be offered to new customers after the V2 price migration.
LEGACY_PLAN_CONFIG: Dict[str, Dict[str, Any]] = {
    "early_access": {
        "label": "Early Access (Legacy)",
        "monthly_price": 14.99,
        "limits": {
            "images": 10,
            "video_credits": 4,
            "optimizer_runs": 0,
            "brand_kits": 1,
            "storage_bytes": 2 * GIB,
        },
        "features": {
            "video_generation": True,
            "optimizer": False,
            "performance_tracking": False,
            "winner_analysis": False,
            "advanced_insights": False,
            "priority_generation": False,
        },
    }
}

ACTIVE_PLAN_TIERS = frozenset(PLAN_CONFIG.keys())
RECOGNIZED_PLAN_TIERS = frozenset({*PLAN_CONFIG.keys(), *LEGACY_PLAN_CONFIG.keys()})


def normalize_tier(tier: Optional[str]) -> str:
    value = (tier or "").strip().lower()
    return value if value in RECOGNIZED_PLAN_TIERS else "trial_monthly"


def get_plan_config(tier: Optional[str], *, include_legacy: bool = True) -> Dict[str, Any]:
    normalized = normalize_tier(tier)
    source = PLAN_CONFIG.get(normalized)
    if source is None and include_legacy:
        source = LEGACY_PLAN_CONFIG.get(normalized)
    if source is None:
        source = PLAN_CONFIG["trial_monthly"]
    return deepcopy(source)


def get_limit(tier: Optional[str], resource: str) -> int:
    plan = get_plan_config(tier)
    return int((plan.get("limits") or {}).get(resource, 0) or 0)


def has_feature(tier: Optional[str], feature: str) -> bool:
    plan = get_plan_config(tier)
    return bool((plan.get("features") or {}).get(feature, False))


def video_credits_for_duration(duration: int) -> int:
    seconds = int(duration)
    if seconds <= 6:
        return 1
    if seconds <= 10:
        return 2
    raise ValueError("Unsupported video duration. Maximum supported duration is 10 seconds.")

