from typing import Dict, Any, Optional

from fastapi import Depends, Header, HTTPException, status

from auth_helpers import get_bearer_token, verify_firebase_token


def get_current_user_claims(
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """
    Reads Authorization: Bearer <token>
    Returns decoded Firebase claims dict.
    """
    token = get_bearer_token(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization bearer token",
        )

    try:
        claims = verify_firebase_token(token)
        return claims
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def admin_required(user: Dict[str, Any] = Depends(get_current_user_claims)) -> Dict[str, Any]:
    """
    Admin users must have Firebase custom claim: role=admin
    """
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user

