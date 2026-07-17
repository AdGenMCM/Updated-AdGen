from fastapi import APIRouter, File, Form, Header, Query, UploadFile, status

from auth_helpers import get_db, require_user

from .schemas import AssetListResponse, AssetResponse, AssetUpdate
from .service import archive_asset, create_asset, get_asset, list_assets, update_asset


router = APIRouter(
    prefix="/campaigns/{campaign_id}/line-items/{line_item_id}/assets",
    tags=["Campaign Assets"],
)


def _is_admin(claims: dict) -> bool:
    return claims.get("role") == "admin" or claims.get("admin") is True


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset_route(
    campaign_id: str,
    line_item_id: str,
    name: str = Form(...),
    click_through_url: str = Form(...),
    alt_text: str | None = Form(default=None),
    tracking_pixel_1: str | None = Form(default=None),
    tracking_pixel_2: str | None = Form(default=None),
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return await create_asset(
        get_db(),
        uid,
        campaign_id,
        line_item_id,
        name=name,
        click_through_url=click_through_url,
        alt_text=alt_text,
        tracking_pixels=[tracking_pixel_1 or "", tracking_pixel_2 or ""],
        file=file,
        admin=_is_admin(claims),
    )


@router.get("", response_model=AssetListResponse)
def list_assets_route(
    campaign_id: str,
    line_item_id: str,
    include_archived: bool = Query(default=False),
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    items = list_assets(
        get_db(), uid, campaign_id, line_item_id,
        include_archived=include_archived,
        admin=_is_admin(claims),
    )
    return {"items": items, "count": len(items)}


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset_route(
    campaign_id: str,
    line_item_id: str,
    asset_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return get_asset(
        get_db(), uid, campaign_id, line_item_id, asset_id,
        admin=_is_admin(claims),
    )


@router.patch("/{asset_id}", response_model=AssetResponse)
def update_asset_route(
    campaign_id: str,
    line_item_id: str,
    asset_id: str,
    payload: AssetUpdate,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return update_asset(
        get_db(), uid, campaign_id, line_item_id, asset_id, payload,
        admin=_is_admin(claims),
    )


@router.delete("/{asset_id}", response_model=AssetResponse)
def archive_asset_route(
    campaign_id: str,
    line_item_id: str,
    asset_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return archive_asset(
        get_db(), uid, campaign_id, line_item_id, asset_id,
        admin=_is_admin(claims),
    )
