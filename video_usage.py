from typing import Dict

from plan_config import get_limit
from usage_caps import check_and_increment_resource, rollback_resource


def check_and_increment_video_usage(db, uid: str, tier: str, credits: int = 1) -> Dict:
    cap = get_limit(tier, "video_credits")
    if cap <= 0:
        return {"allowed": False, "reason": "tier_not_allowed", "cap": 0, "used": 0}

    result = check_and_increment_resource(db, uid, tier, "video_credits", credits)
    if not result.get("allowed"):
        result["reason"] = "cap_reached"
    return result


def rollback_video_usage(db, uid: str, expected_period_key: str, credits: int = 1) -> bool:
    return rollback_resource(db, uid, "video_credits", expected_period_key, credits)
