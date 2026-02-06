# entitlements.py
from fastapi import HTTPException
from typing import Optional

# Exact tier IDs from your usage_caps.py
PRO_TIERS = {"pro_monthly", "business_monthly"}

def require_pro_or_business(tier: Optional[str]) -> None:
    t = (tier or "").lower()
    if t not in PRO_TIERS:
        raise HTTPException(
            status_code=403,
            detail={
                "message": "Ad Performance Optimization is available on Pro and Business plans.",
                "upgradePath": "/account",
                "requiredTiers": sorted(list(PRO_TIERS)),
            },
        )

