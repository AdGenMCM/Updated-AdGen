from datetime import datetime, timezone
from typing import Any, Optional
import uuid

from fastapi import HTTPException

from .schemas import LineItemCreate, LineItemUpdate


CAMPAIGNS_COLLECTION = "campaigns"
LINE_ITEMS_SUBCOLLECTION = "line_items"
MANUAL_STATUS_OVERRIDES = {"paused", "archived"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: Any) -> Optional[datetime]:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def calculate_line_item_status(
    start_at: Any,
    end_at: Any,
    stored_status: Optional[str] = None,
    *,
    now: Optional[datetime] = None,
) -> str:
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


def _normalize_document(
    campaign_id: str,
    document_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": document_id,
        "campaign_id": campaign_id,
        "uid": data.get("uid"),
        "name": data.get("name", "Untitled Line Item"),
        "billing_model": data.get("billing_model", "cpm"),
        "budget_type": data.get("budget_type", "lifetime"),
        "budget_amount": data.get("budget_amount", 0),
        "bid_amount": data.get("bid_amount", 0),
        "currency": "USD",
        "start_at": data.get("start_at"),
        "end_at": data.get("end_at"),
        "status": data.get("status", "draft"),
        "channels": data.get("channels") or [],
        "inventory_assignments": data.get("inventory_assignments") or [],
        "frequency_cap_count": data.get("frequency_cap_count") or data.get("frequency_cap"),
        "frequency_cap_window": data.get("frequency_cap_window") or ("day" if data.get("frequency_cap") else None),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
        "archived_at": data.get("archived_at"),
    }


def _get_campaign(db, uid: str, campaign_id: str, *, admin: bool = False):
    ref = db.collection(CAMPAIGNS_COLLECTION).document(campaign_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    data = snapshot.to_dict() or {}
    if not admin and data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    return ref, data


def _line_items_collection(campaign_ref):
    return campaign_ref.collection(LINE_ITEMS_SUBCOLLECTION)


def _get_line_item(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    *,
    admin: bool = False,
):
    campaign_ref, campaign = _get_campaign(db, uid, campaign_id, admin=admin)
    ref = _line_items_collection(campaign_ref).document(line_item_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Line item not found.")
    return campaign_ref, campaign, ref, snapshot.to_dict() or {}


def _validate_flight(
    campaign: dict[str, Any],
    start_at: Any,
    end_at: Any,
) -> tuple[datetime, datetime]:
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

    campaign_start = _as_utc(campaign.get("start_at"))
    campaign_end = _as_utc(campaign.get("end_at"))
    if campaign_start and start < campaign_start:
        raise HTTPException(
            status_code=400,
            detail="Line-item start_at cannot be before the campaign start_at.",
        )
    if campaign_end and end > campaign_end:
        raise HTTPException(
            status_code=400,
            detail="Line-item end_at cannot be after the campaign end_at.",
        )

    return start, end


def _reconcile_status(ref, data: dict[str, Any], *, now: Optional[datetime] = None):
    effective = calculate_line_item_status(
        data.get("start_at"),
        data.get("end_at"),
        data.get("status"),
        now=now,
    )
    current = str(data.get("status") or "draft").lower()
    if effective == current:
        return data

    reconciled_at = _as_utc(now) or _utc_now()
    updates = {"status": effective, "updated_at": reconciled_at}
    ref.set(updates, merge=True)
    return {**data, **updates}


def create_line_item(
    db,
    uid: str,
    campaign_id: str,
    payload: LineItemCreate,
    *,
    admin: bool = False,
) -> dict[str, Any]:
    campaign_ref, campaign = _get_campaign(db, uid, campaign_id, admin=admin)
    now = _utc_now()
    data = payload.model_dump()
    start, end = _validate_flight(campaign, data.get("start_at"), data.get("end_at"))

    status = calculate_line_item_status(
        start,
        end,
        data.get("status"),
        now=now,
    )
    line_item_id = uuid.uuid4().hex
    data.update(
        {
            "campaign_id": campaign_id,
            "uid": campaign.get("uid") or uid,
            "currency": "USD",
            "start_at": start,
            "end_at": end,
            "status": status,
            "created_at": now,
            "updated_at": now,
            "archived_at": now if status == "archived" else None,
        }
    )

    _line_items_collection(campaign_ref).document(line_item_id).set(data)
    return _normalize_document(campaign_id, line_item_id, data)


def list_line_items(
    db,
    uid: str,
    campaign_id: str,
    *,
    status: Optional[str] = None,
    include_archived: bool = False,
    limit: int = 100,
    admin: bool = False,
) -> list[dict[str, Any]]:
    campaign_ref, _campaign = _get_campaign(db, uid, campaign_id, admin=admin)
    now = _utc_now()
    items: list[dict[str, Any]] = []

    for snapshot in _line_items_collection(campaign_ref).stream():
        data = _reconcile_status(snapshot.reference, snapshot.to_dict() or {}, now=now)
        if not include_archived and data.get("status") == "archived":
            continue
        if status and data.get("status") != status:
            continue
        items.append(_normalize_document(campaign_id, snapshot.id, data))

    items.sort(
        key=lambda item: item.get("updated_at") or item.get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return items[:limit]


def get_line_item(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    *,
    admin: bool = False,
) -> dict[str, Any]:
    _campaign_ref, _campaign, ref, data = _get_line_item(
        db,
        uid,
        campaign_id,
        line_item_id,
        admin=admin,
    )
    data = _reconcile_status(ref, data)
    return _normalize_document(campaign_id, line_item_id, data)


def update_line_item(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    payload: LineItemUpdate,
    *,
    admin: bool = False,
) -> dict[str, Any]:
    _campaign_ref, campaign, ref, existing = _get_line_item(
        db,
        uid,
        campaign_id,
        line_item_id,
        admin=admin,
    )
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        saved = _reconcile_status(ref, existing)
        return _normalize_document(campaign_id, line_item_id, saved)

    next_start, next_end = _validate_flight(
        campaign,
        updates.get("start_at", existing.get("start_at")),
        updates.get("end_at", existing.get("end_at")),
    )
    next_frequency_count = updates.get(
        "frequency_cap_count",
        existing.get("frequency_cap_count") or existing.get("frequency_cap"),
    )
    next_frequency_window = updates.get(
        "frequency_cap_window",
        existing.get("frequency_cap_window") or ("day" if existing.get("frequency_cap") else None),
    )
    if (next_frequency_count is None) != (next_frequency_window is None):
        raise HTTPException(
            status_code=422,
            detail="Frequency cap count and window must be set together.",
        )

    requested_status = str(updates.get("status", existing.get("status") or "")).lower()
    now = _utc_now()
    next_status = calculate_line_item_status(
        next_start,
        next_end,
        requested_status,
        now=now,
    )

    updates.update(
        {
            "currency": "USD",
            "start_at": next_start,
            "end_at": next_end,
            "status": next_status,
            "updated_at": now,
            "archived_at": now if next_status == "archived" else None,
        }
    )
    ref.set(updates, merge=True)
    saved = ref.get().to_dict() or {}
    saved = _reconcile_status(ref, saved)
    return _normalize_document(campaign_id, line_item_id, saved)


def archive_line_item(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    *,
    admin: bool = False,
) -> dict[str, Any]:
    _campaign_ref, _campaign, ref, existing = _get_line_item(
        db,
        uid,
        campaign_id,
        line_item_id,
        admin=admin,
    )
    now = _utc_now()
    updates = {"status": "archived", "archived_at": now, "updated_at": now}
    ref.set(updates, merge=True)
    return _normalize_document(campaign_id, line_item_id, {**existing, **updates})
