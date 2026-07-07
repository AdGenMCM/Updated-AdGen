# video_usage.py
from typing import Dict

from usage_caps import get_usage_period


VIDEO_CAPS = {
    "early_access": 3,
    "pro_monthly": 15,
    "business_monthly": 50,
}

ALLOWED_TIERS = {"early_access", "pro_monthly", "business_monthly"}


def check_and_increment_video_usage(db, uid: str, tier: str) -> Dict:
    if tier not in ALLOWED_TIERS:
        return {"allowed": False, "reason": "tier_not_allowed"}

    cap = VIDEO_CAPS.get(tier)
    if not cap:
        return {"allowed": False, "reason": "no_cap_configured"}

    user_ref = db.collection("users").document(uid)
    snap = user_ref.get()
    user_doc = snap.to_dict() or {}

    period = get_usage_period(user_doc)
    period_key = period["periodKey"]

    video_used = int(user_doc.get("video_used", 0) or 0)
    current_period = user_doc.get("video_period_key") or user_doc.get("video_month_key")

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

    user_ref.update({
        "video_used": video_used + 1,
        "video_period_key": period_key,
        "video_period_start": period.get("periodStart"),
        "video_period_end": period.get("periodEnd"),
        "video_period_source": period.get("periodSource"),
        "video_month_key": period.get("month"),
    })

    return {
        "allowed": True,
        "used": video_used + 1,
        "cap": cap,
        **period,
    }