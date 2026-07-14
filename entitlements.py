from typing import Optional

from fastapi import HTTPException

from plan_config import get_plan_config, has_feature


def require_feature(tier: Optional[str], feature: str, message: str) -> None:
    if not has_feature(tier, feature):
        raise HTTPException(
            status_code=403,
            detail={
                "message": message,
                "upgradePath": "/account",
                "requiredFeature": feature,
            },
        )


def require_pro_or_business(tier: Optional[str]) -> None:
    require_feature(
        tier,
        "optimizer",
        "Ad Performance Optimization is available on Pro and Business plans.",
    )


def build_entitlements_payload(tier: Optional[str]) -> dict:
    plan = get_plan_config(tier)
    return {
        "tier": tier or "trial_monthly",
        "label": plan.get("label"),
        "monthlyPrice": plan.get("monthly_price"),
        "features": plan.get("features") or {},
        "limits": plan.get("limits") or {},
    }

