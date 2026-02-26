# video_usage.py
from typing import Dict
from usage_caps import utc_month_key

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

    month_key = utc_month_key()

    user_ref = db.collection("users").document(uid)
    snap = user_ref.get()
    user_doc = snap.to_dict() or {}

    video_used = user_doc.get("video_used", 0)
    video_month_key = user_doc.get("video_month_key")

    # Reset if new month
    if video_month_key != month_key:
        video_used = 0

    if video_used >= cap:
        return {"allowed": False, "reason": "cap_reached", "cap": cap}

    user_ref.update({
        "video_used": video_used + 1,
        "video_month_key": month_key,
    })

    return {"allowed": True, "used": video_used + 1, "cap": cap}