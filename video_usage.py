from typing import Dict

from google.cloud import firestore

from usage_caps import get_usage_period


VIDEO_CAPS = {
    "early_access": 3,
    "pro_monthly": 15,
    "business_monthly": 50,
}

ALLOWED_TIERS = {
    "early_access",
    "pro_monthly",
    "business_monthly",
}


@firestore.transactional
def _check_and_increment_video_usage_transaction(
    transaction,
    user_ref,
    tier: str,
) -> Dict:
    snap = user_ref.get(transaction=transaction)
    user_doc = snap.to_dict() or {}

    period = get_usage_period(user_doc)
    period_key = period["periodKey"]

    cap = VIDEO_CAPS.get(tier)

    if not cap:
        return {
            "allowed": False,
            "reason": "no_cap_configured",
        }

    video_used = int(
        user_doc.get("video_used", 0) or 0
    )

    current_period = (
        user_doc.get("video_period_key")
        or user_doc.get("video_month_key")
    )

    if current_period != period_key:
        video_used = 0

    if video_used >= cap:
        return {
            "allowed": False,
            "reason": "cap_reached",
            "cap": cap,
            "used": video_used,
            **period,
        }

    new_used = video_used + 1

    transaction.update(
        user_ref,
        {
            "video_used": new_used,
            "video_period_key": period_key,
            "video_period_start": period.get("periodStart"),
            "video_period_end": period.get("periodEnd"),
            "video_period_source": period.get("periodSource"),
            "video_month_key": period.get("month"),
        },
    )

    return {
        "allowed": True,
        "used": new_used,
        "cap": cap,
        **period,
    }


def check_and_increment_video_usage(
    db,
    uid: str,
    tier: str,
) -> Dict:
    """
    Atomically checks the user's current video usage and reserves
    one generation when the plan has remaining capacity.
    """

    if tier not in ALLOWED_TIERS:
        return {
            "allowed": False,
            "reason": "tier_not_allowed",
        }

    user_ref = (
        db.collection("users")
        .document(uid)
    )

    transaction = db.transaction()

    return _check_and_increment_video_usage_transaction(
        transaction,
        user_ref,
        tier,
    )


@firestore.transactional
def _rollback_video_usage_transaction(
    transaction,
    user_ref,
    expected_period_key: str,
) -> bool:
    """
    Refunds one reserved video generation only when the user's
    current usage period still matches the period originally charged.
    """

    snap = user_ref.get(transaction=transaction)
    user_doc = snap.to_dict() or {}

    current_period = (
        user_doc.get("video_period_key")
        or user_doc.get("video_month_key")
    )

    if current_period != expected_period_key:
        return False

    current_used = int(
        user_doc.get("video_used", 0) or 0
    )

    if current_used <= 0:
        return False

    transaction.update(
        user_ref,
        {
            "video_used": current_used - 1,
        },
    )

    return True


def rollback_video_usage(
    db,
    uid: str,
    expected_period_key: str,
) -> bool:
    """
    Refunds one reserved video generation after Runway rejects
    the initial video-start request before returning a task ID.
    """

    if not expected_period_key:
        return False

    user_ref = (
        db.collection("users")
        .document(uid)
    )

    transaction = db.transaction()

    return _rollback_video_usage_transaction(
        transaction,
        user_ref,
        expected_period_key,
    )