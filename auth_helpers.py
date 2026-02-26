import os
import json
from typing import Optional, Dict, Any, Tuple

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore
from fastapi import HTTPException


def init_firebase_once() -> None:
    """
    Initialize Firebase Admin SDK once.

    Env:
      - FIREBASE_SERVICE_ACCOUNT_JSON: either
          a) absolute file path to service account json, OR
          b) raw JSON string of the service account
      - FIREBASE_STORAGE_BUCKET (optional): e.g. "<project>.appspot.com"
    """
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass  # not initialized yet

    sa_value = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not sa_value:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")

    bucket_name = (os.getenv("FIREBASE_STORAGE_BUCKET") or "").strip()
    init_options = {"storageBucket": bucket_name} if bucket_name else None

    # Case 1: file path
    if os.path.exists(sa_value):
        cred = credentials.Certificate(sa_value)
        firebase_admin.initialize_app(cred, init_options) if init_options else firebase_admin.initialize_app(cred)
        return

    # Case 2: raw JSON string
    try:
        sa_dict = json.loads(sa_value)
        cred = credentials.Certificate(sa_dict)
        firebase_admin.initialize_app(cred, init_options) if init_options else firebase_admin.initialize_app(cred)
        return
    except Exception as e:
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT_JSON must be a valid file path or a valid JSON string."
        ) from e


def get_db():
    init_firebase_once()
    return firestore.client()


def get_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        return None
    scheme, token = parts[0].strip(), parts[1].strip()
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def verify_firebase_token(id_token: str) -> Dict[str, Any]:
    """
    Verify Firebase ID token and return decoded claims.
    Adds clock skew tolerance to avoid 'Token used too early' from tiny time drift.
    """
    init_firebase_once()

    try:
        return fb_auth.verify_id_token(id_token, clock_skew_seconds=15)

    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired. Please log in again.")

    except fb_auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Token revoked. Please log in again.")

    except fb_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please log in again.")

    except Exception as e:
        # This covers init/config errors too (bad service account, missing env var, etc.)
        print("🔥 Unexpected auth error:", str(e))
        raise HTTPException(status_code=401, detail="Authentication failed.")


def require_user(authorization: Optional[str]) -> Tuple[str, Optional[str], Dict[str, Any]]:
    """
    Require a valid Firebase ID token in the Authorization header.
    Returns (uid, email, claims).
    """
    token = get_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token.")

    claims = verify_firebase_token(token)

    uid = claims.get("uid") or claims.get("user_id") or claims.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid auth token (missing uid).")

    email = claims.get("email")
    return uid, email, claims



