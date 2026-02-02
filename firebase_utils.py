# firebase_utils.py
import os
import json
import firebase_admin
from firebase_admin import credentials, firestore


def init_firebase_once():
    """
    Supports FIREBASE_SERVICE_ACCOUNT_JSON as:
    - a file path (Render Secret Files => /etc/secrets/xxx.json)
    - OR raw JSON string
    """
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    sa_value = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not sa_value:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")

    # Case 1: env var is a file path
    if os.path.exists(sa_value):
        cred = credentials.Certificate(sa_value)
        firebase_admin.initialize_app(cred)
        return

    # Case 2: env var is raw JSON
    try:
        sa_dict = json.loads(sa_value)
        cred = credentials.Certificate(sa_dict)
        firebase_admin.initialize_app(cred)
        return
    except Exception:
        pass

    raise RuntimeError(
        "FIREBASE_SERVICE_ACCOUNT_JSON must be a valid file path on the server "
        "or a JSON string containing the service account."
    )


def get_db():
    init_firebase_once()
    return firestore.client()
