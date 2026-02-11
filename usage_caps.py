from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional

from google.cloud import firestore as gc_firestore


TIER_CAPS: Dict[str, int] = {
    "trial_monthly": 5,
    "starter_monthly": 25,
    "pro_monthly": 60,
    "business_monthly": 175,
    "early_access": 10,
}


def utc_month_key(dt: Optional[datetime] = None) -> str:
    dt = dt or datetime.now(timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}"


def get_cap_for_tier(tier: Optional[str]) -> int:
    if not tier:
        return TIER_CAPS["trial_monthly"]
    return TIER_CAPS.get(tier, TIER_CAPS["trial_monthly"])


def get_tier_and_status(user_doc: Dict[str, Any]) -> Tuple[Optional[str], str]:
    stripe = (user_doc or {}).get("stripe") or {}
    tier = stripe.get("tier") or stripe.get("requestedTier")
    status = (stripe.get("status") or "inactive").lower()
    return tier, status


def check_and_increment_usage(db: gc_firestore.Client, uid: str, tier: Optional[str]) -> Dict[str, Any]:
    """
    Transactionally check the user's monthly cap and increment usage by 1 if allowed.

    Firestore doc:
      usage/{uid} => { month: "YYYY-MM", used: int, updatedAt: server_timestamp }
    """
    month = utc_month_key()
    cap = get_cap_for_tier(tier)
    usage_ref = db.collection("usage").document(uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = usage_ref.get(transaction=transaction)
        data = snap.to_dict() or {}

        current_month = data.get("month")
        used = int(data.get("used") or 0)

        # reset if new month
        if current_month != month:
            used = 0

        if used >= cap:
            # write back (keeps month consistent) but don't increment
            transaction.set(
                usage_ref,
                {"month": month, "used": used, "updatedAt": gc_firestore.SERVER_TIMESTAMP},
                merge=True,
            )
            return {"allowed": False, "used": used, "cap": cap, "month": month}

        new_used = used + 1
        transaction.set(
            usage_ref,
            {"month": month, "used": new_used, "updatedAt": gc_firestore.SERVER_TIMESTAMP},
            merge=True,
        )
        return {"allowed": True, "used": new_used, "cap": cap, "month": month}

    tx = db.transaction()
    return _tx(tx)


def peek_usage(db: gc_firestore.Client, uid: str, tier: Optional[str]) -> Dict[str, Any]:
    month = utc_month_key()
    cap = get_cap_for_tier(tier)

    usage_ref = db.collection("usage").document(uid)
    doc = usage_ref.get()
    data = doc.to_dict() or {}

    used = int(data.get("used") or 0)
    if data.get("month") != month:
        used = 0

    return {"used": used, "cap": cap, "month": month, "remaining": max(0, cap - used)}


