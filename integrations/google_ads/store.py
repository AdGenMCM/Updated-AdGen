import secrets
import time
from typing import Any

from google.cloud import firestore as gc_firestore

from auth_helpers import get_db
from .security import encrypt_secret, decrypt_secret


CONNECTIONS = "google_ads_connections"
OAUTH_STATES = "google_ads_oauth_states"
STATE_TTL_SECONDS = 10 * 60
DAILY_HISTORY = "google_ads_daily_history"
DAILY_ITEMS = "items"


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
            "lastSyncDateRange": None,
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
    date_range: str | None = None,
) -> None:
    connection_ref(uid).set(
        {
            "lastSyncAt": int(synced_at),
            "campaignCount": len(campaigns),
            "summary": summary or {},
            "campaigns": campaigns or [],
            "lastSyncDateRange": date_range,
            "updatedAt": int(time.time()),
        },
        merge=True,
    )


def _daily_parent(uid: str):
    return get_db().collection(DAILY_HISTORY).document(uid)


def save_daily_campaign_performance(
    uid: str,
    *,
    account_id: str,
    rows: list[dict[str, Any]],
    synced_at: int,
) -> None:
    """Upsert daily rows with deterministic IDs; never add metrics together."""
    db = get_db()
    parent = _daily_parent(uid)
    writes: list[tuple[Any, dict[str, Any]]] = []
    clean_account = "".join(ch for ch in str(account_id or "") if ch.isdigit())
    for row in rows or []:
        campaign_id = str(row.get("campaignId") or row.get("id") or "").strip()
        report_date = str(row.get("date") or row.get("reportDate") or "").strip()
        if not clean_account or not campaign_id or not report_date:
            continue
        doc_id = f"{clean_account}_{campaign_id}_{report_date}"
        payload = {**row, "uid": uid, "accountId": clean_account, "syncedAt": int(synced_at)}
        writes.append((parent.collection(DAILY_ITEMS).document(doc_id), payload))

    for start in range(0, len(writes), 450):
        batch = db.batch()
        for ref, payload in writes[start:start + 450]:
            batch.set(ref, payload, merge=True)
        if writes[start:start + 450]:
            batch.commit()

    parent.set({"uid": uid, "accountId": clean_account, "rowCountLastSync": len(writes), "lastSyncAt": int(synced_at)}, merge=True)


def list_daily_campaign_performance(uid: str, *, account_id: str | None = None, limit: int = 20000) -> list[dict[str, Any]]:
    query = _daily_parent(uid).collection(DAILY_ITEMS)
    clean_account = "".join(ch for ch in str(account_id or "") if ch.isdigit())
    if clean_account:
        query = query.where("accountId", "==", clean_account)
    rows = [{"historyId": snap.id, **(snap.to_dict() or {})} for snap in query.limit(max(1, min(limit, 20000))).stream()]
    rows.sort(key=lambda row: (str(row.get("date") or ""), str(row.get("campaignName") or "")))
    return rows
