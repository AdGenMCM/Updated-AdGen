from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional

GIB = 1024 ** 3
MIB = 1024 ** 2

PLAN_CONFIG: Dict[str, Dict[str, Any]] = {
    "free": {
        "label": "Free",
        "monthly_price": 0,
        "limits": {
            "images": 2,
            "video_credits": 1,
            "optimizer_runs": 0,
            "brand_kits": 0,
            "storage_bytes": 250 * MIB,
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

    "trial_monthly": {
        "label": "Trial",
        "monthly_price": 9.99,
        "limits": {
            "images": 10,
            "video_credits": 3,
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
            "video_credits": 6,
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
            "video_credits": 14,
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
            "video_credits": 32,
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

LEGACY_PLAN_CONFIG = {
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
RECOGNIZED_PLAN_TIERS = frozenset(
    {*PLAN_CONFIG.keys(), *LEGACY_PLAN_CONFIG.keys()}
)


def normalize_tier(tier: Optional[str]) -> str:
    value = (tier or "").strip().lower()
    return value if value in RECOGNIZED_PLAN_TIERS else "free"


def get_plan_config(tier: Optional[str], *, include_legacy=True):
    normalized = normalize_tier(tier)

    source = PLAN_CONFIG.get(normalized)

    if source is None and include_legacy:
        source = LEGACY_PLAN_CONFIG.get(normalized)

    if source is None:
        source = PLAN_CONFIG["free"]

    return deepcopy(source)


def get_limit(tier: Optional[str], resource: str) -> int:
    return int(
        (get_plan_config(tier)["limits"]).get(resource, 0)
    )


def has_feature(tier: Optional[str], feature: str) -> bool:
    return bool(
        (get_plan_config(tier)["features"]).get(feature, False)
    )


def video_credits_for_duration(duration: int) -> int:
    if duration <= 6:
        return 1

    if duration <= 10:
        return 2

    raise ValueError("Unsupported video duration.")
