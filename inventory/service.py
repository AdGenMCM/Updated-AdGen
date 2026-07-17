from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException


INVENTORY_COLLECTION = "inventory"
CAMPAIGNS_COLLECTION = "campaigns"
LINE_ITEMS_SUBCOLLECTION = "line_items"
ASSETS_SUBCOLLECTION = "assets"


DEFAULT_INVENTORY = [
    {
        "id": "web_leaderboard_728x90",
        "name": "Web Leaderboard",
        "channel": "web",
        "width": 728,
        "height": 90,
        "format": "image",
        "description": "Wide banner commonly used near the top of a web page.",
    },
    {
        "id": "web_medium_rectangle_300x250",
        "name": "Web Medium Rectangle",
        "channel": "web",
        "width": 300,
        "height": 250,
        "format": "image",
        "description": "Standard web display unit for sidebars and content areas.",
    },
    {
        "id": "web_large_rectangle_336x280",
        "name": "Web Large Rectangle",
        "channel": "web",
        "width": 336,
        "height": 280,
        "format": "image",
        "description": "Larger rectangle placement for web content areas.",
    },
    {
        "id": "web_wide_skyscraper_160x600",
        "name": "Web Wide Skyscraper",
        "channel": "web",
        "width": 160,
        "height": 600,
        "format": "image",
        "description": "Tall web unit for side rails and persistent placements.",
    },
    {
        "id": "email_hero_600x300",
        "name": "Email Hero",
        "channel": "email",
        "width": 600,
        "height": 300,
        "format": "image",
        "description": "Large promotional image for the top of an email.",
    },
    {
        "id": "email_banner_600x200",
        "name": "Email Banner",
        "channel": "email",
        "width": 600,
        "height": 200,
        "format": "image",
        "description": "Wide email banner for offers and announcements.",
    },
    {
        "id": "email_content_rectangle_300x250",
        "name": "Email Content Rectangle",
        "channel": "email",
        "width": 300,
        "height": 250,
        "format": "image",
        "description": "Compact image placement inside email content.",
    },
    {
        "id": "mobile_app_banner_320x50",
        "name": "Mobile App Banner",
        "channel": "mobile_app",
        "width": 320,
        "height": 50,
        "format": "image",
        "description": "Compact banner placement inside a mobile app.",
    },
    {
        "id": "mobile_app_large_banner_320x100",
        "name": "Mobile App Large Banner",
        "channel": "mobile_app",
        "width": 320,
        "height": 100,
        "format": "image",
        "description": "Larger mobile banner with more room for messaging.",
    },
    {
        "id": "mobile_app_interstitial_1080x1920",
        "name": "Mobile App Interstitial",
        "channel": "mobile_app",
        "width": 1080,
        "height": 1920,
        "format": "image",
        "description": "Full-screen portrait placement for mobile apps.",
    },
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_template(template_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": template_id,
        "name": data.get("name", "Untitled inventory"),
        "channel": data.get("channel", "web"),
        "width": int(data.get("width") or 0),
        "height": int(data.get("height") or 0),
        "format": data.get("format", "image"),
        "description": data.get("description"),
        "active": data.get("active", True),
        "max_file_size_mb": int(data.get("max_file_size_mb") or 10),
        "accepted_mime_types": data.get("accepted_mime_types")
        or ["image/jpeg", "image/png", "image/webp", "image/gif"],
        "supports_click_url": data.get("supports_click_url", True),
        "supports_tracking_pixels": data.get("supports_tracking_pixels", True),
    }


def ensure_default_inventory(db) -> None:
    collection = db.collection(INVENTORY_COLLECTION)
    for template in DEFAULT_INVENTORY:
        ref = collection.document(template["id"])
        snapshot = ref.get()
        if snapshot.exists:
            continue
        now = _utc_now()
        ref.set(
            {
                **template,
                "active": True,
                "max_file_size_mb": 10,
                "accepted_mime_types": [
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                    "image/gif",
                ],
                "supports_click_url": True,
                "supports_tracking_pixels": True,
                "created_at": now,
                "updated_at": now,
            }
        )


def list_inventory_templates(db, *, include_inactive: bool = False) -> list[dict[str, Any]]:
    ensure_default_inventory(db)
    items = []
    for snapshot in db.collection(INVENTORY_COLLECTION).stream():
        data = snapshot.to_dict() or {}
        if not include_inactive and data.get("active", True) is False:
            continue
        items.append(_normalize_template(snapshot.id, data))
    items.sort(key=lambda item: (item["channel"], item["name"]))
    return items


def _require_line_item_access(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    *,
    admin: bool,
):
    campaign_ref = db.collection(CAMPAIGNS_COLLECTION).document(campaign_id)
    campaign_snapshot = campaign_ref.get()
    if not campaign_snapshot.exists:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    campaign = campaign_snapshot.to_dict() or {}
    if not admin and campaign.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    line_item_ref = campaign_ref.collection(LINE_ITEMS_SUBCOLLECTION).document(line_item_id)
    line_item_snapshot = line_item_ref.get()
    if not line_item_snapshot.exists:
        raise HTTPException(status_code=404, detail="Line item not found.")

    line_item = line_item_snapshot.to_dict() or {}
    if not admin and line_item.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    return line_item_ref, line_item


def _active_assets(line_item_ref) -> list[dict[str, Any]]:
    items = []
    for snapshot in line_item_ref.collection(ASSETS_SUBCOLLECTION).stream():
        data = snapshot.to_dict() or {}
        if data.get("status") == "archived":
            continue
        items.append({"id": snapshot.id, **data})
    return items


def _is_compatible(asset: dict[str, Any], template: dict[str, Any]) -> bool:
    return (
        asset.get("asset_type", "image") == template.get("format", "image")
        and int(asset.get("width") or 0) == int(template.get("width") or 0)
        and int(asset.get("height") or 0) == int(template.get("height") or 0)
        and asset.get("mime_type") in (template.get("accepted_mime_types") or [])
        and int(asset.get("file_size") or 0)
        <= int(template.get("max_file_size_mb") or 10) * 1024 * 1024
    )


def get_line_item_inventory(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    *,
    admin: bool = False,
) -> dict[str, Any]:
    line_item_ref, line_item = _require_line_item_access(
        db,
        uid,
        campaign_id,
        line_item_id,
        admin=admin,
    )
    channels = set(line_item.get("channels") or [])
    assignments = {
        item.get("inventory_id"): list(dict.fromkeys(item.get("asset_ids") or []))
        for item in (line_item.get("inventory_assignments") or [])
        if item.get("inventory_id")
    }
    assets = _active_assets(line_item_ref)
    active_asset_ids = {asset["id"] for asset in assets}

    items = []
    for template in list_inventory_templates(db):
        if template["channel"] not in channels:
            continue
        compatible_asset_ids = [
            asset["id"] for asset in assets if _is_compatible(asset, template)
        ]
        selected_asset_ids = [
            asset_id
            for asset_id in assignments.get(template["id"], [])
            if asset_id in active_asset_ids
        ]
        selected = template["id"] in assignments
        items.append(
            {
                **template,
                "compatible_asset_ids": compatible_asset_ids,
                "selected_asset_ids": selected_asset_ids,
                "selected": selected,
                "needs_attention": selected and not selected_asset_ids,
            }
        )

    items.sort(
        key=lambda item: (
            not bool(item["compatible_asset_ids"]),
            item["channel"],
            item["name"],
        )
    )
    return {
        "items": items,
        "count": len(items),
        "compatible_count": sum(bool(item["compatible_asset_ids"]) for item in items),
        "selected_count": sum(bool(item["selected"]) for item in items),
    }


def update_line_item_inventory(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    assignments: list[dict[str, Any]],
    *,
    admin: bool = False,
) -> dict[str, Any]:
    line_item_ref, line_item = _require_line_item_access(
        db,
        uid,
        campaign_id,
        line_item_id,
        admin=admin,
    )
    channels = set(line_item.get("channels") or [])
    templates = {item["id"]: item for item in list_inventory_templates(db)}
    assets = {asset["id"]: asset for asset in _active_assets(line_item_ref)}

    cleaned = []
    seen_inventory = set()
    for assignment in assignments:
        inventory_id = assignment.get("inventory_id")
        if not inventory_id or inventory_id in seen_inventory:
            continue
        template = templates.get(inventory_id)
        if not template:
            raise HTTPException(status_code=422, detail="Unknown inventory selection.")
        if template["channel"] not in channels:
            raise HTTPException(
                status_code=422,
                detail=f"{template['name']} requires the {template['channel']} delivery channel.",
            )

        asset_ids = list(dict.fromkeys(assignment.get("asset_ids") or []))
        if not asset_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Assign at least one compatible asset to {template['name']}.",
            )
        for asset_id in asset_ids:
            asset = assets.get(asset_id)
            if not asset:
                raise HTTPException(status_code=422, detail="An assigned asset is unavailable.")
            if not _is_compatible(asset, template):
                raise HTTPException(
                    status_code=422,
                    detail=f"{asset.get('name', 'Asset')} is not compatible with {template['name']}.",
                )

        cleaned.append({"inventory_id": inventory_id, "asset_ids": asset_ids})
        seen_inventory.add(inventory_id)

    line_item_ref.set(
        {
            "inventory_assignments": cleaned,
            "updated_at": _utc_now(),
        },
        merge=True,
    )
    return get_line_item_inventory(
        db,
        uid,
        campaign_id,
        line_item_id,
        admin=admin,
    )
