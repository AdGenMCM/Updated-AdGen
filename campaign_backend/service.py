from datetime import datetime, timezone
from typing import Any, Optional
import uuid

from fastapi import HTTPException

from .schemas import CampaignCreate, CampaignUpdate


COLLECTION_NAME = "campaigns"

MANUAL_STATUS_OVERRIDES = {"paused", "archived"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: Any) -> Optional[datetime]:
    if not isinstance(value, datetime):
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _serialize_datetime(value: Any) -> Any:
    if isinstance(value, datetime):
        return _as_utc(value)
    return value


def calculate_campaign_status(
    start_at: Any,
    end_at: Any,
    stored_status: Optional[str] = None,
    *,
    now: Optional[datetime] = None,
) -> str:
    """
    Return the effective campaign lifecycle status.

    paused and archived are manual overrides. All other lifecycle statuses are
    derived from the campaign's required start and end datetimes.
    """
    normalized_status = str(stored_status or "").lower()

    if normalized_status in MANUAL_STATUS_OVERRIDES:
        return normalized_status

    start = _as_utc(start_at)
    end = _as_utc(end_at)

    if start is None or end is None:
        return "draft"

    current = _as_utc(now) or _utc_now()

    if current < start:
        return "scheduled"

    if start <= current < end:
        return "active"

    return "completed"


def _normalize_document(document_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": document_id,
        "uid": data.get("uid"),
        "name": data.get("name", "Untitled Campaign"),
        "brand_id": data.get("brand_id"),
        "objective": data.get("objective", "sales"),
        "status": data.get("status", "draft"),
        "budget_type": data.get("budget_type", "daily"),
        "budget": data.get("budget"),
        "currency": "USD",
        "start_at": data.get("start_at"),
        "end_at": data.get("end_at"),
        "description": data.get("description"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
        "archived_at": data.get("archived_at"),
    }


def _get_owned_campaign_snapshot(
    db,
    uid: str,
    campaign_id: str,
    *,
    admin: bool = False,
):
    ref = db.collection(COLLECTION_NAME).document(campaign_id)
    snapshot = ref.get()

    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    data = snapshot.to_dict() or {}

    if not admin and data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    return ref, snapshot, data


def _validate_required_dates(start_at: Any, end_at: Any) -> tuple[datetime, datetime]:
    start = _as_utc(start_at)
    end = _as_utc(end_at)

    if start is None or end is None:
        raise HTTPException(
            status_code=400,
            detail="start_at and end_at are required.",
        )

    if end <= start:
        raise HTTPException(
            status_code=400,
            detail="end_at must be later than start_at.",
        )

    return start, end


def _reconcile_campaign_status(
    ref,
    data: dict[str, Any],
    *,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """
    Calculate the effective lifecycle status and persist it when it changed.

    This is called during reads as well as writes, so a scheduled campaign
    becomes active and later completed without requiring a manual edit.
    """
    effective_status = calculate_campaign_status(
        data.get("start_at"),
        data.get("end_at"),
        data.get("status"),
        now=now,
    )

    current_status = str(data.get("status") or "draft").lower()

    if effective_status == current_status:
        return data

    reconciled_at = _as_utc(now) or _utc_now()

    updates = {
        "status": effective_status,
        "updated_at": reconciled_at,
    }

    ref.set(updates, merge=True)

    return {
        **data,
        **updates,
    }


def create_campaign(db, uid: str, payload: CampaignCreate) -> dict[str, Any]:
    campaign_id = uuid.uuid4().hex
    now = _utc_now()

    data = payload.model_dump()
    start_at, end_at = _validate_required_dates(
        data.get("start_at"),
        data.get("end_at"),
    )

    requested_status = str(data.get("status") or "").lower()
    status = calculate_campaign_status(
        start_at,
        end_at,
        requested_status,
        now=now,
    )

    data.update(
        {
            "uid": uid,
            "status": status,
            "currency": "USD",
            "start_at": start_at,
            "end_at": end_at,
            "created_at": now,
            "updated_at": now,
            "archived_at": now if status == "archived" else None,
        }
    )

    data = {
        key: _serialize_datetime(value)
        for key, value in data.items()
    }

    db.collection(COLLECTION_NAME).document(campaign_id).set(data)
    return _normalize_document(campaign_id, data)


def list_campaigns(
    db,
    uid: str,
    *,
    status: Optional[str] = None,
    include_archived: bool = False,
    limit: int = 50,
) -> list[dict[str, Any]]:
    query = db.collection(COLLECTION_NAME).where("uid", "==", uid)
    now = _utc_now()

    items: list[dict[str, Any]] = []

    for snapshot in query.stream():
        ref = snapshot.reference
        data = snapshot.to_dict() or {}
        data = _reconcile_campaign_status(ref, data, now=now)

        if not include_archived and data.get("status") == "archived":
            continue

        if status and data.get("status") != status:
            continue

        items.append(_normalize_document(snapshot.id, data))

    items.sort(
        key=lambda item: (
            item.get("updated_at")
            or item.get("created_at")
            or datetime.min.replace(tzinfo=timezone.utc)
        ),
        reverse=True,
    )

    return items[:limit]


def get_campaign(
    db,
    uid: str,
    campaign_id: str,
    *,
    admin: bool = False,
) -> dict[str, Any]:
    ref, snapshot, data = _get_owned_campaign_snapshot(
        db,
        uid,
        campaign_id,
        admin=admin,
    )

    data = _reconcile_campaign_status(ref, data)
    return _normalize_document(snapshot.id, data)


def update_campaign(
    db,
    uid: str,
    campaign_id: str,
    payload: CampaignUpdate,
    *,
    admin: bool = False,
) -> dict[str, Any]:
    ref, _snapshot, existing = _get_owned_campaign_snapshot(
        db,
        uid,
        campaign_id,
        admin=admin,
    )

    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        reconciled = _reconcile_campaign_status(ref, existing)
        return _normalize_document(campaign_id, reconciled)

    next_start, next_end = _validate_required_dates(
        updates.get("start_at", existing.get("start_at")),
        updates.get("end_at", existing.get("end_at")),
    )

    requested_status = str(
        updates.get("status", existing.get("status") or "")
    ).lower()

    now = _utc_now()
    next_status = calculate_campaign_status(
        next_start,
        next_end,
        requested_status,
        now=now,
    )

    updates.update(
        {
            "status": next_status,
            "currency": "USD",
            "start_at": next_start,
            "end_at": next_end,
            "updated_at": now,
            "archived_at": (
                now
                if next_status == "archived"
                else None
            ),
        }
    )

    updates = {
        key: _serialize_datetime(value)
        for key, value in updates.items()
    }

    ref.set(updates, merge=True)

    saved = ref.get().to_dict() or {}
    saved = _reconcile_campaign_status(ref, saved)

    return _normalize_document(campaign_id, saved)


def archive_campaign(
    db,
    uid: str,
    campaign_id: str,
    *,
    admin: bool = False,
) -> dict[str, Any]:
    ref, _snapshot, data = _get_owned_campaign_snapshot(
        db,
        uid,
        campaign_id,
        admin=admin,
    )

    now = _utc_now()

    updates = {
        "status": "archived",
        "archived_at": now,
        "updated_at": now,
    }

    ref.set(updates, merge=True)

    saved = {
        **data,
        **updates,
    }

    return _normalize_document(campaign_id, saved)