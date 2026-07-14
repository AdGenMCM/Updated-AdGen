from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from google.cloud import firestore as gc_firestore

from plan_config import get_limit


def utc_month_key(dt: Optional[datetime] = None) -> str:
    dt = dt or datetime.now(timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}"


def get_usage_period(user_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
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


def get_tier_and_status(user_doc: Dict[str, Any]) -> Tuple[Optional[str], str]:
    stripe = (user_doc or {}).get("stripe") or {}
    tier = stripe.get("tier") or stripe.get("requestedTier")
    status = (stripe.get("status") or "inactive").lower()
    return tier, status


def _usage_ref(db: gc_firestore.Client, uid: str):
    return db.collection("usage").document(uid)


def _resource_fields(resource: str) -> tuple[str, str]:
    mapping = {
        "images": ("imageUsed", "bonusImageCredits"),
        "video_credits": ("videoCreditsUsed", "bonusVideoCredits"),
        "optimizer_runs": ("optimizerRunsUsed", "bonusOptimizerRuns"),
    }
    if resource not in mapping:
        raise ValueError(f"Unsupported metered resource: {resource}")
    return mapping[resource]


def check_and_increment_resource(
    db: gc_firestore.Client,
    uid: str,
    tier: Optional[str],
    resource: str,
    amount: int = 1,
) -> Dict[str, Any]:
    if amount <= 0:
        raise ValueError("Usage increment must be greater than zero.")

    user_doc = db.collection("users").document(uid).get().to_dict() or {}
    period = get_usage_period(user_doc)
    period_key = period["periodKey"]
    base_limit = get_limit(tier, resource)
    used_field, bonus_field = _resource_fields(resource)
    ref = _usage_ref(db, uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}
        current_period = data.get("periodKey") or data.get("month")

        # Backward compatibility for the original image counter.
        if resource == "images":
            used = int(data.get(used_field, data.get("used", 0)) or 0)
        else:
            used = int(data.get(used_field, 0) or 0)

        bonus = int(data.get(bonus_field, 0) or 0)
        if current_period != period_key:
            used = 0
            bonus = 0

        effective_limit = base_limit + bonus
        base_update = {
            "periodKey": period_key,
            "periodStart": period.get("periodStart"),
            "periodEnd": period.get("periodEnd"),
            "periodSource": period.get("periodSource"),
            "month": period.get("month"),
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }

        if used + amount > effective_limit:
            transaction.set(ref, {**base_update, used_field: used, bonus_field: bonus}, merge=True)
            return {
                "allowed": False,
                "resource": resource,
                "used": used,
                "cap": effective_limit,
                "remaining": max(0, effective_limit - used),
                "requested": amount,
                **period,
            }

        new_used = used + amount
        update = {**base_update, used_field: new_used, bonus_field: bonus}
        if resource == "images":
            update["used"] = new_used  # temporary compatibility with existing UI/admin code
        transaction.set(ref, update, merge=True)

        return {
            "allowed": True,
            "resource": resource,
            "used": new_used,
            "cap": effective_limit,
            "remaining": max(0, effective_limit - new_used),
            "charged": amount,
            **period,
        }

    return _tx(db.transaction())


def rollback_resource(
    db: gc_firestore.Client,
    uid: str,
    resource: str,
    expected_period_key: str,
    amount: int = 1,
) -> bool:
    if not expected_period_key or amount <= 0:
        return False

    used_field, _bonus_field = _resource_fields(resource)
    ref = _usage_ref(db, uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}
        current_period = data.get("periodKey") or data.get("month")
        if current_period != expected_period_key:
            return False

        if resource == "images":
            current_used = int(data.get(used_field, data.get("used", 0)) or 0)
        else:
            current_used = int(data.get(used_field, 0) or 0)

        if current_used <= 0:
            return False

        new_used = max(0, current_used - amount)
        update = {used_field: new_used, "updatedAt": gc_firestore.SERVER_TIMESTAMP}
        if resource == "images":
            update["used"] = new_used
        transaction.set(ref, update, merge=True)
        return True

    return _tx(db.transaction())


def peek_resource(
    db: gc_firestore.Client,
    uid: str,
    tier: Optional[str],
    resource: str,
    user_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if user_doc is None:
        user_doc = db.collection("users").document(uid).get().to_dict() or {}

    period = get_usage_period(user_doc)
    period_key = period["periodKey"]
    base_limit = get_limit(tier, resource)
    used_field, bonus_field = _resource_fields(resource)
    data = _usage_ref(db, uid).get().to_dict() or {}
    current_period = data.get("periodKey") or data.get("month")

    if resource == "images":
        used = int(data.get(used_field, data.get("used", 0)) or 0)
    else:
        used = int(data.get(used_field, 0) or 0)
    bonus = int(data.get(bonus_field, 0) or 0)

    if current_period != period_key:
        used = 0
        bonus = 0

    cap = base_limit + bonus
    return {
        "resource": resource,
        "used": used,
        "cap": cap,
        "remaining": max(0, cap - used),
        "bonus": bonus,
        **period,
    }


# Existing image API compatibility wrappers.
def check_and_increment_usage(db: gc_firestore.Client, uid: str, tier: Optional[str]) -> Dict[str, Any]:
    return check_and_increment_resource(db, uid, tier, "images", 1)


def peek_usage(
    db: gc_firestore.Client,
    uid: str,
    tier: Optional[str],
    user_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return peek_resource(db, uid, tier, "images", user_doc)


