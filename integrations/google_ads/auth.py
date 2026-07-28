from fastapi import Header, HTTPException

from auth_helpers import get_bearer_token, verify_firebase_token, get_db
from entitlements import require_pro_or_business
from usage_caps import get_tier_and_status


def require_google_ads_user(authorization: str | None = Header(default=None)):
    token = get_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization Bearer token.")

    try:
        claims = verify_firebase_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token.") from exc

    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid auth token.")

    is_admin = claims.get("role") == "admin"
    if not is_admin:
        user_doc = get_db().collection("users").document(uid).get().to_dict() or {}
        tier, status = get_tier_and_status(user_doc)
        if status not in {"active", "trialing"}:
            raise HTTPException(
                status_code=402,
                detail="An active subscription is required to connect Google Ads.",
            )
        require_pro_or_business(tier)

    return {
        "uid": uid,
        "email": claims.get("email"),
        "claims": claims,
        "is_admin": is_admin,
    }
