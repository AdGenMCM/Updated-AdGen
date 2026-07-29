import secrets
import time
from typing import Any

from google.cloud import firestore as gc_firestore

from auth_helpers import get_db
from .security import encrypt_secret, decrypt_secret


CONNECTIONS = "meta_ads_connections"
OAUTH_STATES = "meta_ads_oauth_states"
STATE_TTL_SECONDS = 10 * 60
DAILY_HISTORY = "meta_ads_daily_history"
DAILY_ITEMS = "items"


def connection_ref(uid: str):
    return get_db().collection(CONNECTIONS).document(uid)


def get_connection(uid: str, *, include_access_token: bool = False) -> dict[str, Any] | None:
    snap = connection_ref(uid).get()
    if not snap.exists:
        return None

    data = snap.to_dict() or {}
    if include_access_token:
        data["accessToken"] = decrypt_secret(data.get("accessTokenEncrypted") or "")
    data.pop("accessTokenEncrypted", None)
    return data


def save_connection(
    uid: str,
    *,
    access_token: str,
    expires_in: int | None,
    scope: str,
    meta_user_id: str | None,
    meta_name: str | None,
    meta_email: str | None,
) -> None:
    if not access_token:
        raise RuntimeError("Meta did not return an access token.")

    now = int(time.time())
    expires_at = now + int(expires_in) if expires_in and int(expires_in) > 0 else None
    existing = connection_ref(uid).get().to_dict() or {}

    connection_ref(uid).set(
        {
            "uid": uid,
            "status": "connected",
            "accessTokenEncrypted": encrypt_secret(access_token),
            "tokenExpiresAt": expires_at,
            "scope": scope,
            "metaUserId": meta_user_id,
            "metaName": meta_name,
            "metaEmail": meta_email,
            "selectedAdAccountId": existing.get("selectedAdAccountId"),
            "selectedAdAccountName": existing.get("selectedAdAccountName"),
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

def save_selected_ad_account(
    uid: str,
    *,
    ad_account_id: str,
    ad_account_name: str | None,
    business_id: str | None = None,
    business_name: str | None = None,
    currency: str | None = None,
    time_zone: str | None = None,
    account_status: int | None = None,
) -> None:
    connection_ref(uid).set(
        {
            "selectedAdAccountId": ad_account_id,
            "selectedAdAccountName": ad_account_name,
            "selectedBusinessId": business_id,
            "selectedBusinessName": business_name,
            "selectedCurrency": currency,
            "selectedTimeZone": time_zone,
            "selectedAccountStatus": account_status,
            "lastSyncAt": None,
            "campaignCount": 0,
            "summary": {},
            "campaigns": [],
            "lastSyncDateRange": None,
            "updatedAt": int(time.time()),
        },
        merge=True,
    )



def save_campaign_sync(
    uid: str,
    *,
    date_range: str,
    summary: dict[str, Any],
    campaigns: list[dict[str, Any]],
) -> None:
    now = int(time.time())
    connection_ref(uid).set(
        {
            "lastSyncAt": now,
            "lastSyncDateRange": date_range,
            "campaignCount": len(campaigns),
            "summary": summary or {},
            "campaigns": (campaigns or [])[:200],
            "lastSyncError": None,
            "updatedAt": now,
        },
        merge=True,
    )


def save_campaign_sync_error(uid: str, message: str) -> None:
    connection_ref(uid).set(
        {
            "lastSyncError": str(message or "")[:500],
            "updatedAt": int(time.time()),
        },
        merge=True,
    )


CREATIVE_SYNCS = "meta_ads_creative_syncs"
CREATIVE_ITEMS = "items"


def save_creative_sync(uid: str, *, date_range: str, creatives: list[dict[str, Any]]) -> None:
    db = get_db()
    parent = db.collection(CREATIVE_SYNCS).document(uid)
    now = int(time.time())
    batch = db.batch()

    # Delete stale items from the previous selected account snapshot.
    for snap in parent.collection(CREATIVE_ITEMS).stream():
        batch.delete(snap.reference)

    for row in (creatives or [])[:1000]:
        doc_id = str(row.get("adId") or row.get("creativeId") or "").strip()
        if not doc_id:
            continue
        ref = parent.collection(CREATIVE_ITEMS).document(doc_id)
        batch.set(ref, {**row, "uid": uid, "syncedAt": now})

    batch.set(parent, {
        "uid": uid,
        "dateRange": date_range,
        "creativeCount": len(creatives or []),
        "lastSyncAt": now,
        "updatedAt": now,
    }, merge=True)
    batch.commit()

    connection_ref(uid).set({
        "creativeCount": len(creatives or []),
        "lastCreativeSyncAt": now,
        "lastCreativeSyncDateRange": date_range,
        "lastCreativeSyncError": None,
        "updatedAt": now,
    }, merge=True)


def list_creative_sync(uid: str, limit: int = 500) -> list[dict[str, Any]]:
    rows = []
    query = get_db().collection(CREATIVE_SYNCS).document(uid).collection(CREATIVE_ITEMS).limit(max(1, min(limit, 1000)))
    for snap in query.stream():
        rows.append({"id": snap.id, **(snap.to_dict() or {})})
    rows.sort(key=lambda row: (float(row.get("spend") or 0), int(row.get("impressions") or 0)), reverse=True)
    return rows


def save_creative_sync_error(uid: str, message: str) -> None:
    connection_ref(uid).set({
        "lastCreativeSyncError": str(message or "")[:500],
        "updatedAt": int(time.time()),
    }, merge=True)


def _daily_parent(uid: str):
    return get_db().collection(DAILY_HISTORY).document(uid)


def save_daily_campaign_performance(
    uid: str,
    *,
    account_id: str,
    rows: list[dict[str, Any]],
    synced_at: int | None = None,
) -> None:
    now = int(synced_at or time.time())
    db = get_db()
    parent = _daily_parent(uid)
    clean_account = str(account_id or "").strip()
    writes: list[tuple[Any, dict[str, Any]]] = []
    for row in rows or []:
        campaign_id = str(row.get("campaignId") or "").strip()
        report_date = str(row.get("date") or row.get("reportDate") or "").strip()
        if not clean_account or not campaign_id or not report_date:
            continue
        doc_id = f"{clean_account}_{campaign_id}_{report_date}".replace("/", "_")
        payload = {**row, "uid": uid, "accountId": clean_account, "syncedAt": now}
        writes.append((parent.collection(DAILY_ITEMS).document(doc_id), payload))

    for start in range(0, len(writes), 450):
        chunk = writes[start:start + 450]
        batch = db.batch()
        for ref, payload in chunk:
            batch.set(ref, payload, merge=True)
        if chunk:
            batch.commit()

    parent.set({"uid": uid, "accountId": clean_account, "rowCountLastSync": len(writes), "lastSyncAt": now}, merge=True)


def list_daily_campaign_performance(uid: str, *, account_id: str | None = None, limit: int = 20000) -> list[dict[str, Any]]:
    query = _daily_parent(uid).collection(DAILY_ITEMS)
    if account_id:
        query = query.where("accountId", "==", str(account_id))
    rows = [{"historyId": snap.id, **(snap.to_dict() or {})} for snap in query.limit(max(1, min(limit, 20000))).stream()]
    rows.sort(key=lambda row: (str(row.get("date") or ""), str(row.get("campaignName") or "")))
    return rows
