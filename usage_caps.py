# usage_caps.py
from __future__ import annotations

from typing import Dict, Any, Optional
from google.cloud import firestore as gc_firestore

TIER_CAPS: Dict[str, int] = {
    "trial_monthly": 5,
    "starter_monthly": 25,
    "pro_monthly": 60,
    "business_monthly": 175,
}


def get_cap_for_tier(tier: Optional[str]) -> int:
    if not tier:
        return TIER_CAPS["trial_monthly"]
    return TIER_CAPS.get(tier, TIER_CAPS["trial_monthly"])


def check_and_increment_usage(
    db: gc_firestore.Client,
    uid: str,
    tier: Optional[str],
    period_start: Optional[int],
    period_end: Optional[int],
) -> Dict[str, Any]:
    """
    Enforces usage caps aligned to Stripe billing cycle:
      - usage/{uid}.periodStart is the reset key
      - if periodStart changes => reset usage to 0
    """
    cap = get_cap_for_tier(tier)
    usage_ref = db.collection("usage").document(uid)

    if not period_start:
        # If user has no Stripe period yet, treat as trial and use a single rolling bucket.
        # (You can change this to calendar month if you prefer.)
        period_start = 0

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = usage_ref.get(transaction=transaction)
        data = snap.to_dict() or {}

        used = int(data.get("used") or 0)
        stored_period_start = data.get("periodStart")

        # Reset if billing cycle changed
        if stored_period_start != period_start:
            used = 0

        if used >= cap:
            transaction.set(
                usage_ref,
                {
                    "periodStart": period_start,
                    "periodEnd": period_end,
                    "used": used,
                    "updatedAt": gc_firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
            return {
                "allowed": False,
                "used": used,
                "cap": cap,
                "periodStart": period_start,
                "periodEnd": period_end,
            }

        new_used = used + 1
        transaction.set(
            usage_ref,
            {
                "periodStart": period_start,
                "periodEnd": period_end,
                "used": new_used,
                "updatedAt": gc_firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return {
            "allowed": True,
            "used": new_used,
            "cap": cap,
            "periodStart": period_start,
            "periodEnd": period_end,
        }

    tx = db.transaction()
    return _tx(tx)


def peek_usage(
    db: gc_firestore.Client,
    uid: str,
    tier: Optional[str],
    period_start: Optional[int],
    period_end: Optional[int],
) -> Dict[str, Any]:
    cap = get_cap_for_tier(tier)
    usage_ref = db.collection("usage").document(uid)
    doc = usage_ref.get()
    data = doc.to_dict() or {}

    if not period_start:
        period_start = 0

    used = int(data.get("used") or 0)
    if data.get("periodStart") != period_start:
        used = 0

    remaining = max(0, cap - used)
    return {
        "used": used,
        "cap": cap,
        "remaining": remaining,
        "periodStart": period_start,
        "periodEnd": period_end,
    }

