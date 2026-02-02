import os
import json
from typing import Optional, Dict, Any

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore


def init_firebase_once() -> None:
    """
    Initialize Firebase Admin SDK once.

    FIREBASE_SERVICE_ACCOUNT_JSON supports:
      - a file path on server (Render secret file path like /etc/secrets/<file>.json)
      - OR raw JSON string (not recommended, but supported)
    """
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    sa_value = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not sa_value:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")

    # Case 1: file path
    if os.path.exists(sa_value):
        cred = credentials.Certificate(sa_value)
        firebase_admin.initialize_app(cred)
        return

    # Case 2: raw JSON
    try:
        sa_dict = json.loads(sa_value)
        cred = credentials.Certificate(sa_dict)
        firebase_admin.initialize_app(cred)
        return
    except Exception as e:
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT_JSON must be a valid file path or JSON string."
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
    """Verify Firebase ID token and return decoded claims."""
    init_firebase_once()
    return fb_auth.verify_id_token(id_token)
