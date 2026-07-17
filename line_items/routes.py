from typing import Optional

from fastapi import APIRouter, Header, Query, status as http_status

from auth_helpers import get_db, require_user

from .schemas import (
    LineItemCreate,
    LineItemListResponse,
    LineItemResponse,
    LineItemStatus,
    LineItemUpdate,
)
from .service import (
    archive_line_item,
    create_line_item,
    get_line_item,
    list_line_items,
    update_line_item,
)


router = APIRouter(
    prefix="/campaigns/{campaign_id}/line-items",
    tags=["Campaign Line Items"],
)


def _is_admin(claims: dict) -> bool:
    return claims.get("role") == "admin" or claims.get("admin") is True


@router.post(
    "",
    response_model=LineItemResponse,
    status_code=http_status.HTTP_201_CREATED,
)
def create_line_item_route(
    campaign_id: str,
    payload: LineItemCreate,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return create_line_item(
        get_db(),
        uid,
        campaign_id,
        payload,
        admin=_is_admin(claims),
    )


@router.get("", response_model=LineItemListResponse)
def list_line_items_route(
    campaign_id: str,
    authorization: str | None = Header(default=None),
    status: Optional[LineItemStatus] = Query(default=None),
    include_archived: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
):
    uid, _email, claims = require_user(authorization)
    items = list_line_items(
        get_db(),
        uid,
        campaign_id,
        status=status,
        include_archived=include_archived,
        limit=limit,
        admin=_is_admin(claims),
    )
    return {"items": items, "count": len(items)}


@router.get("/{line_item_id}", response_model=LineItemResponse)
def get_line_item_route(
    campaign_id: str,
    line_item_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return get_line_item(
        get_db(),
        uid,
        campaign_id,
        line_item_id,
        admin=_is_admin(claims),
    )


@router.patch("/{line_item_id}", response_model=LineItemResponse)
def update_line_item_route(
    campaign_id: str,
    line_item_id: str,
    payload: LineItemUpdate,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return update_line_item(
        get_db(),
        uid,
        campaign_id,
        line_item_id,
        payload,
        admin=_is_admin(claims),
    )


@router.delete("/{line_item_id}", response_model=LineItemResponse)
def archive_line_item_route(
    campaign_id: str,
    line_item_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return archive_line_item(
        get_db(),
        uid,
        campaign_id,
        line_item_id,
        admin=_is_admin(claims),
    )
