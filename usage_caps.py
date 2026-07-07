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
    """Legacy fallback only. Prefer Stripe billing periods for paid users."""
    dt = dt or datetime.now(timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}"


def get_usage_period(user_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    
    """
    Returns the active usage period.

    Paid users should have Stripe currentPeriodStart/currentPeriodEnd saved on
    users/{uid}.stripe. When present, usage resets on that Stripe renewal cycle.
    If the Stripe period is missing, fall back to the old UTC calendar month so
    existing/free/trial users do not break.
    """
    stripe = (user_doc or {}).get("stripe") or {}
    start = stripe.get("currentPeriodStart")
    end = stripe.get("currentPeriodEnd")

    try:
        start_i = int(start) if start is not None else None
        end_i = int(end) if end is not None else None
    except Exception:
        start_i = None
        end_i = None

    if start_i and end_i:
        return {
            "periodKey": f"stripe:{start_i}:{end_i}",
            "periodStart": start_i,
            "periodEnd": end_i,
            "periodSource": "stripe",
            "month": f"stripe:{start_i}:{end_i}",
        }

    month = utc_month_key()
    return {
        "periodKey": f"month:{month}",
        "periodStart": None,
        "periodEnd": None,
        "periodSource": "month_fallback",
        "month": month,
    }


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
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}

    period = get_usage_period(user_doc)
    period_key = period["periodKey"]

    cap = get_cap_for_tier(tier)
    usage_ref = db.collection("usage").document(uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = usage_ref.get(transaction=transaction)
        data = snap.to_dict() or {}

        current_period = data.get("periodKey") or data.get("month")
        used = int(data.get("used") or 0)

        if current_period != period_key:
            used = 0

        base_update = {
            "periodKey": period_key,
            "periodStart": period.get("periodStart"),
            "periodEnd": period.get("periodEnd"),
            "periodSource": period.get("periodSource"),
            "month": period.get("month"),
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }

        if used >= cap:
            transaction.set(
                usage_ref,
                {**base_update, "used": used},
                merge=True,
            )
            return {"allowed": False, "used": used, "cap": cap, **period}

        new_used = used + 1

        transaction.set(
            usage_ref,
            {**base_update, "used": new_used},
            merge=True,
        )

        return {"allowed": True, "used": new_used, "cap": cap, **period}

    tx = db.transaction()
    return _tx(tx)


def peek_usage(
    db: gc_firestore.Client,
    uid: str,
    tier: Optional[str],
    user_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if user_doc is None:
        user_snap = db.collection("users").document(uid).get()
        user_doc = user_snap.to_dict() or {}

    period = get_usage_period(user_doc)
    period_key = period["periodKey"]

    cap = get_cap_for_tier(tier)

    usage_ref = db.collection("usage").document(uid)
    doc = usage_ref.get()
    data = doc.to_dict() or {}

    current_period = data.get("periodKey") or data.get("month")
    used = int(data.get("used") or 0)

    if current_period != period_key:
        used = 0

    return {
        "used": used,
        "cap": cap,
        "remaining": max(0, cap - used),
        **period,
    }

