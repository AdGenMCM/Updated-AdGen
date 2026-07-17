from typing import Optional

from fastapi import APIRouter, Header, Query, status as http_status

from auth_helpers import get_db, require_user

from .schemas import (
    CampaignCreate,
    CampaignListResponse,
    CampaignResponse,
    CampaignStatus,
    CampaignUpdate,
)
from .service import (
    archive_campaign,
    create_campaign,
    get_campaign,
    list_campaigns,
    update_campaign,
)


router = APIRouter(
    prefix="/campaigns",
    tags=["Campaigns"],
)


def _is_admin(claims: dict) -> bool:
    return claims.get("role") == "admin"


@router.post(
    "",
    response_model=CampaignResponse,
    status_code=http_status.HTTP_201_CREATED,
)
def create_campaign_route(
    payload: CampaignCreate,
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)
    return create_campaign(get_db(), uid, payload)


@router.get("", response_model=CampaignListResponse)
def list_campaigns_route(
    authorization: str | None = Header(default=None),
    status: Optional[CampaignStatus] = Query(default=None),
    include_archived: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
):
    uid, _email, _claims = require_user(authorization)
    items = list_campaigns(
        get_db(),
        uid,
        status=status,
        include_archived=include_archived,
        limit=limit,
    )
    return {"items": items, "count": len(items)}


@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign_route(
    campaign_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return get_campaign(
        get_db(),
        uid,
        campaign_id,
        admin=_is_admin(claims),
    )


@router.patch("/{campaign_id}", response_model=CampaignResponse)
def update_campaign_route(
    campaign_id: str,
    payload: CampaignUpdate,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return update_campaign(
        get_db(),
        uid,
        campaign_id,
        payload,
        admin=_is_admin(claims),
    )


@router.delete("/{campaign_id}")
def archive_campaign_route(
    campaign_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return archive_campaign(
        get_db(),
        uid,
        campaign_id,
        admin=_is_admin(claims),
    )
