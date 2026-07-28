import secrets
import time
from typing import Any

from google.cloud import firestore as gc_firestore

from auth_helpers import get_db
from .security import encrypt_secret, decrypt_secret


CONNECTIONS = "google_ads_connections"
OAUTH_STATES = "google_ads_oauth_states"
STATE_TTL_SECONDS = 10 * 60


def connection_ref(uid: str):
    return get_db().collection(CONNECTIONS).document(uid)


def get_connection(
    uid: str,
    *,
    include_refresh_token: bool = False,
) -> dict[str, Any] | None:
    snap = connection_ref(uid).get()
    if not snap.exists:
        return None

    data = snap.to_dict() or {}
    if include_refresh_token:
        data["refreshToken"] = decrypt_secret(
            data.get("refreshTokenEncrypted") or ""
        )
    data.pop("refreshTokenEncrypted", None)
    return data


def save_connection(
    uid: str,
    *,
    refresh_token: str,
    scope: str,
    google_email: str | None = None,
) -> None:
    now = int(time.time())
    existing = connection_ref(uid).get().to_dict() or {}

    encrypted = (
        encrypt_secret(refresh_token)
        if refresh_token
        else existing.get("refreshTokenEncrypted")
    )
    if not encrypted:
        raise RuntimeError(
            "Google did not return a refresh token. "
            "Reconnect and grant consent again."
        )

    connection_ref(uid).set(
        {
            "uid": uid,
            "status": "connected",
            "refreshTokenEncrypted": encrypted,
            "scope": scope,
            "googleEmail": google_email,
            "selectedCustomerId": existing.get("selectedCustomerId"),
            "selectedCustomerName": existing.get("selectedCustomerName"),
            "loginCustomerId": existing.get("loginCustomerId"),
            "selectedCustomerIsManager": existing.get(
                "selectedCustomerIsManager", False
            ),
            "connectedAt": existing.get("connectedAt") or now,
            "updatedAt": now,
        },
        merge=True,
    )


def disconnect(uid: str) -> None:
    connection_ref(uid).delete()


def create_oauth_state(uid: str) -> str:
    state = secrets.token_urlsafe(32)
    now = int(time.time())
    get_db().collection(OAUTH_STATES).document(state).set(
        {
            "uid": uid,
            "createdAt": now,
            "expiresAt": now + STATE_TTL_SECONDS,
            "used": False,
        }
    )
    return state


def consume_oauth_state(state: str) -> str:
    if not state:
        raise ValueError("Missing OAuth state.")

    db = get_db()
    ref = db.collection(OAUTH_STATES).document(state)
    transaction = db.transaction()

    @gc_firestore.transactional
    def _consume(tx):
        snap = ref.get(transaction=tx)
        if not snap.exists:
            raise ValueError("OAuth state is invalid or expired.")

        data = snap.to_dict() or {}
        now = int(time.time())

        if data.get("used") is True or int(data.get("expiresAt") or 0) < now:
            raise ValueError("OAuth state is invalid or expired.")

        uid = data.get("uid")
        if not uid:
            raise ValueError("OAuth state is invalid.")

        tx.update(ref, {"used": True, "usedAt": now})
        return uid

    return _consume(transaction)


def save_selected_customer(
    uid: str,
    customer_id: str,
    customer_name: str | None,
    *,
    login_customer_id: str | None = None,
    manager: bool = False,
) -> None:
    connection_ref(uid).set(
        {
            "selectedCustomerId": customer_id,
            "selectedCustomerName": customer_name,
            "loginCustomerId": login_customer_id,
            "selectedCustomerIsManager": bool(manager),
            "lastSyncAt": None,
            "campaignCount": 0,
            "summary": {},
            "campaigns": [],
            "updatedAt": int(time.time()),
        },
        merge=True,
    )


def save_sync_summary(
    uid: str,
    *,
    summary: dict[str, Any],
    campaigns: list[dict[str, Any]],
    synced_at: int,
) -> None:
    connection_ref(uid).set(
        {
            "lastSyncAt": int(synced_at),
            "campaignCount": len(campaigns),
            "summary": summary or {},
            "campaigns": campaigns or [],
            "updatedAt": int(time.time()),
        },
        merge=True,
    )
