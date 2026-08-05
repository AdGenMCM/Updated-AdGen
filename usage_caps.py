from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from google.cloud import firestore as gc_firestore

from plan_config import get_limit, normalize_tier


def utc_month_key(dt: Optional[datetime] = None) -> str:
    dt = dt or datetime.now(timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}"


def get_usage_period(user_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    user_doc = user_doc or {}
    effective_tier, _status = get_tier_and_status(user_doc)
    tier = normalize_tier(effective_tier)

    if tier == "free":
        return {
            "periodKey": "lifetime:free",
            "periodStart": None,
            "periodEnd": None,
            "periodSource": "lifetime",
            "month": "lifetime:free",
        }

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


def get_tier_and_status(
    user_doc: Dict[str, Any],
) -> Tuple[Optional[str], str]:
    user_doc = user_doc or {}
    stripe = user_doc.get("stripe") or {}

    stripe_tier = stripe.get("tier")
    stripe_status = str(
        stripe.get("status") or ""
    ).strip().lower()

    active_statuses = {
        "active",
        "trialing",
        "past_due",
    }

    # A Stripe tier is authoritative only after Stripe confirms
    # an active subscription state.
    if stripe_tier and stripe_status in active_statuses:
        return stripe_tier, stripe_status

    # Free accounts deliberately bypass Stripe.
    firestore_tier = user_doc.get("tier")
    firestore_status = str(
        user_doc.get("subscriptionStatus") or "inactive"
    ).strip().lower()

    if firestore_tier == "free":
        return "free", firestore_status

    return firestore_tier, firestore_status


def _usage_ref(db: gc_firestore.Client, uid: str):
    return db.collection("usage").document(uid)


def _resource_fields(resource: str) -> tuple[str, str, str]:
    mapping = {
        "images": (
            "imageUsed",
            "bonusImageCredits",
            "bonusImageCreditsPeriodKey",
        ),
        "video_credits": (
            "videoCreditsUsed",
            "bonusVideoCredits",
            "bonusVideoCreditsPeriodKey",
        ),
        "optimizer_runs": (
            "optimizerRunsUsed",
            "bonusOptimizerRuns",
            "bonusOptimizerRunsPeriodKey",
        ),
    }

    if resource not in mapping:
        raise ValueError(f"Unsupported metered resource: {resource}")

    return mapping[resource]


def _resolve_period_scoped_bonus(
    *,
    data: Dict[str, Any],
    bonus_field: str,
    bonus_period_field: str,
    active_period_key: str,
    current_usage_period: Optional[str],
) -> tuple[int, bool]:
    """
    Return the bonus valid for the active period.

    Legacy bonus values that have no bonus-specific period key are treated as
    expired. This prevents an old admin grant from carrying into a new billing
    period after this update is deployed.
    """
    raw_bonus = int(data.get(bonus_field, 0) or 0)
    bonus_period_key = data.get(bonus_period_field)

    usage_period_matches = current_usage_period == active_period_key
    bonus_period_matches = bonus_period_key == active_period_key

    if not usage_period_matches or not bonus_period_matches:
        return 0, raw_bonus != 0 or bonus_period_key is not None

    return raw_bonus, False


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

    used_field, bonus_field, bonus_period_field = _resource_fields(resource)
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

        if current_period != period_key:
            used = 0

        bonus, stale_bonus_found = _resolve_period_scoped_bonus(
            data=data,
            bonus_field=bonus_field,
            bonus_period_field=bonus_period_field,
            active_period_key=period_key,
            current_usage_period=current_period,
        )

        effective_limit = base_limit + bonus

        base_update = {
            "periodKey": period_key,
            "periodStart": period.get("periodStart"),
            "periodEnd": period.get("periodEnd"),
            "periodSource": period.get("periodSource"),
            "month": period.get("month"),
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }

        # Clear expired or legacy bonus data whenever this resource is touched.
        if stale_bonus_found:
            base_update[bonus_field] = 0
            base_update[bonus_period_field] = gc_firestore.DELETE_FIELD
        elif bonus > 0:
            base_update[bonus_field] = bonus
            base_update[bonus_period_field] = period_key
        else:
            base_update[bonus_field] = 0
            base_update[bonus_period_field] = gc_firestore.DELETE_FIELD

        if used + amount > effective_limit:
            update = {
                **base_update,
                used_field: used,
            }
            if resource == "images":
                update["used"] = used

            transaction.set(ref, update, merge=True)

            return {
                "allowed": False,
                "resource": resource,
                "used": used,
                "cap": effective_limit,
                "remaining": max(0, effective_limit - used),
                "requested": amount,
                "bonus": bonus,
                **period,
            }

        new_used = used + amount

        update = {
            **base_update,
            used_field: new_used,
        }

        if resource == "images":
            update["used"] = new_used

        transaction.set(ref, update, merge=True)

        return {
            "allowed": True,
            "resource": resource,
            "used": new_used,
            "cap": effective_limit,
            "remaining": max(0, effective_limit - new_used),
            "charged": amount,
            "bonus": bonus,
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

    used_field, _bonus_field, _bonus_period_field = _resource_fields(resource)
    ref = _usage_ref(db, uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}
        current_period = data.get("periodKey") or data.get("month")

        if current_period != expected_period_key:
            return False

        if resource == "images":
            current_used = int(
                data.get(used_field, data.get("used", 0)) or 0
            )
        else:
            current_used = int(data.get(used_field, 0) or 0)

        if current_used <= 0:
            return False

        new_used = max(0, current_used - amount)

        update = {
            used_field: new_used,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }

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

    used_field, bonus_field, bonus_period_field = _resource_fields(resource)
    ref = _usage_ref(db, uid)
    data = ref.get().to_dict() or {}
    current_period = data.get("periodKey") or data.get("month")

    if resource == "images":
        used = int(data.get(used_field, data.get("used", 0)) or 0)
    else:
        used = int(data.get(used_field, 0) or 0)

    if current_period != period_key:
        used = 0

    bonus, stale_bonus_found = _resolve_period_scoped_bonus(
        data=data,
        bonus_field=bonus_field,
        bonus_period_field=bonus_period_field,
        active_period_key=period_key,
        current_usage_period=current_period,
    )

    # Read operations also clean expired legacy bonus data so the admin page,
    # sidebar, and account page all converge on the correct base plan cap.
    if stale_bonus_found:
        cleanup = {
            bonus_field: 0,
            bonus_period_field: gc_firestore.DELETE_FIELD,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }

        if current_period != period_key:
            cleanup.update(
                {
                    "periodKey": period_key,
                    "periodStart": period.get("periodStart"),
                    "periodEnd": period.get("periodEnd"),
                    "periodSource": period.get("periodSource"),
                    "month": period.get("month"),
                    used_field: 0,
                }
            )

            if resource == "images":
                cleanup["used"] = 0

        ref.set(cleanup, merge=True)

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
def check_and_increment_usage(
    db: gc_firestore.Client,
    uid: str,
    tier: Optional[str],
) -> Dict[str, Any]:
    return check_and_increment_resource(
        db,
        uid,
        tier,
        "images",
        1,
    )


def peek_usage(
    db: gc_firestore.Client,
    uid: str,
    tier: Optional[str],
    user_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return peek_resource(
        db,
        uid,
        tier,
        "images",
        user_doc,
    )
