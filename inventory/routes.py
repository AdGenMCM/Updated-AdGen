from fastapi import APIRouter, Header, Query

from auth_helpers import get_db, require_user

from .schemas import (
    InventoryTemplateListResponse,
    LineItemInventoryResponse,
    LineItemInventoryUpdate,
)
from .service import (
    get_line_item_inventory,
    list_inventory_templates,
    update_line_item_inventory,
)


router = APIRouter(tags=["Campaign Inventory"])


def _is_admin(claims: dict) -> bool:
    return claims.get("role") == "admin" or claims.get("admin") is True


@router.get("/inventory/templates", response_model=InventoryTemplateListResponse)
def list_inventory_templates_route(
    include_inactive: bool = Query(default=False),
    authorization: str | None = Header(default=None),
):
    require_user(authorization)
    items = list_inventory_templates(get_db(), include_inactive=include_inactive)
    return {"items": items, "count": len(items)}


@router.get(
    "/campaigns/{campaign_id}/line-items/{line_item_id}/inventory",
    response_model=LineItemInventoryResponse,
)
def get_line_item_inventory_route(
    campaign_id: str,
    line_item_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return get_line_item_inventory(
        get_db(),
        uid,
        campaign_id,
        line_item_id,
        admin=_is_admin(claims),
    )


@router.put(
    "/campaigns/{campaign_id}/line-items/{line_item_id}/inventory",
    response_model=LineItemInventoryResponse,
)
def update_line_item_inventory_route(
    campaign_id: str,
    line_item_id: str,
    payload: LineItemInventoryUpdate,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return update_line_item_inventory(
        get_db(),
        uid,
        campaign_id,
        line_item_id,
        [item.model_dump() for item in payload.assignments],
        admin=_is_admin(claims),
    )
