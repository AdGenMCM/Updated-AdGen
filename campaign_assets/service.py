from datetime import datetime, timezone
from io import BytesIO
from typing import Any
from urllib.parse import quote, urlparse
import uuid

from fastapi import HTTPException, UploadFile
from firebase_admin import storage
from PIL import Image, UnidentifiedImageError

from .schemas import AssetUpdate


CAMPAIGNS_COLLECTION = "campaigns"
LINE_ITEMS_SUBCOLLECTION = "line_items"
ASSETS_SUBCOLLECTION = "assets"
MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _campaign_ref(db, campaign_id: str):
    return db.collection(CAMPAIGNS_COLLECTION).document(campaign_id)


def _line_item_ref(db, campaign_id: str, line_item_id: str):
    return _campaign_ref(db, campaign_id).collection(
        LINE_ITEMS_SUBCOLLECTION
    ).document(line_item_id)


def _asset_ref(db, campaign_id: str, line_item_id: str, asset_id: str):
    return _line_item_ref(db, campaign_id, line_item_id).collection(
        ASSETS_SUBCOLLECTION
    ).document(asset_id)


def _require_parent_access(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    *,
    admin: bool,
) -> dict[str, Any]:
    campaign_snapshot = _campaign_ref(db, campaign_id).get()
    if not campaign_snapshot.exists:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    campaign = campaign_snapshot.to_dict() or {}
    if not admin and campaign.get("uid") != uid:
        raise HTTPException(status_code=403, detail="You cannot access this campaign.")

    line_item_snapshot = _line_item_ref(db, campaign_id, line_item_id).get()
    if not line_item_snapshot.exists:
        raise HTTPException(status_code=404, detail="Line item not found.")

    line_item = line_item_snapshot.to_dict() or {}
    if not admin and line_item.get("uid") != uid:
        raise HTTPException(status_code=403, detail="You cannot access this line item.")

    return line_item


def _normalize(
    campaign_id: str,
    line_item_id: str,
    asset_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    width = int(data.get("width") or 0)
    height = int(data.get("height") or 0)
    return {
        "id": asset_id,
        "campaign_id": campaign_id,
        "line_item_id": line_item_id,
        "uid": data.get("uid"),
        "name": data.get("name", "Untitled Asset"),
        "asset_type": "image",
        "file_url": data.get("file_url", ""),
        "storage_path": data.get("storage_path", ""),
        "mime_type": data.get("mime_type", "application/octet-stream"),
        "file_size": data.get("file_size", 0),
        "original_filename": data.get("original_filename", "asset"),
        "width": width,
        "height": height,
        "aspect_ratio": data.get("aspect_ratio") or (round(width / height, 6) if height else 0),
        "alt_text": data.get("alt_text"),
        "click_through_url": data.get("click_through_url", ""),
        "tracking_pixels": data.get("tracking_pixels") or [],
        "status": data.get("status", "active"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
        "archived_at": data.get("archived_at"),
    }


def _download_url(bucket_name: str, storage_path: str, token: str) -> str:
    encoded_path = quote(storage_path, safe="")
    return (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
        f"{encoded_path}?alt=media&token={token}"
    )


def _read_dimensions(contents: bytes) -> tuple[int, int]:
    try:
        with Image.open(BytesIO(contents)) as image:
            image.verify()
        with Image.open(BytesIO(contents)) as image:
            width, height = image.size
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail="The uploaded file is not a readable image.",
        ) from error

    if width <= 0 or height <= 0:
        raise HTTPException(status_code=422, detail="The image dimensions are invalid.")

    return width, height


async def create_asset(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    *,
    name: str,
    click_through_url: str,
    file: UploadFile,
    alt_text: str | None = None,
    tracking_pixels: list[str] | None = None,
    admin: bool = False,
):
    line_item = _require_parent_access(
        db,
        uid,
        campaign_id,
        line_item_id,
        admin=admin,
    )

    cleaned_name = name.strip()
    if not cleaned_name:
        raise HTTPException(status_code=422, detail="Asset name is required.")

    destination = click_through_url.strip()
    parsed_destination = urlparse(destination)
    if parsed_destination.scheme not in {"http", "https"} or not parsed_destination.netloc:
        raise HTTPException(status_code=422, detail="Enter a valid click-through URL.")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Upload a JPG, PNG, WEBP, or GIF image.",
        )

    pixels = [value.strip() for value in (tracking_pixels or []) if value.strip()]
    if len(pixels) > 2:
        raise HTTPException(status_code=422, detail="A maximum of two tracking pixels is allowed.")
    if len(set(pixels)) != len(pixels):
        raise HTTPException(status_code=422, detail="Tracking pixel URLs must be unique.")
    if any(not value.startswith("https://") for value in pixels):
        raise HTTPException(status_code=422, detail="Tracking pixel URLs must use HTTPS.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=422, detail="The uploaded image is empty.")
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="The image must be 10 MB or smaller.")

    width, height = _read_dimensions(contents)
    asset_id = uuid.uuid4().hex
    extension = (file.filename or "asset").rsplit(".", 1)[-1].lower()
    storage_path = (
        f"users/{uid}/campaigns/{campaign_id}/line_items/{line_item_id}/"
        f"assets/{asset_id}.{extension}"
    )
    token = str(uuid.uuid4())
    bucket = storage.bucket()
    blob = bucket.blob(storage_path)
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(contents, content_type=file.content_type)

    now = _utc_now()
    document = {
        "uid": uid,
        "name": cleaned_name,
        "asset_type": "image",
        "file_url": _download_url(bucket.name, storage_path, token),
        "storage_path": storage_path,
        "mime_type": file.content_type,
        "file_size": len(contents),
        "original_filename": file.filename or "asset",
        "width": width,
        "height": height,
        "aspect_ratio": round(width / height, 6),
        "alt_text": (alt_text or "").strip() or None,
        "click_through_url": destination,
        "tracking_pixels": pixels,
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "archived_at": None,
    }
    _asset_ref(db, campaign_id, line_item_id, asset_id).set(document)
    return _normalize(campaign_id, line_item_id, asset_id, document)


def list_assets(
    db,
    uid: str,
    campaign_id: str,
    line_item_id: str,
    *,
    include_archived: bool = False,
    admin: bool = False,
):
    _require_parent_access(db, uid, campaign_id, line_item_id, admin=admin)
    snapshots = _line_item_ref(db, campaign_id, line_item_id).collection(
        ASSETS_SUBCOLLECTION
    ).stream()
    items = []
    for snapshot in snapshots:
        data = snapshot.to_dict() or {}
        if not include_archived and data.get("status") == "archived":
            continue
        items.append(_normalize(campaign_id, line_item_id, snapshot.id, data))
    items.sort(
        key=lambda item: item.get("updated_at")
        or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return items


def get_asset(db, uid, campaign_id, line_item_id, asset_id, *, admin=False):
    _require_parent_access(db, uid, campaign_id, line_item_id, admin=admin)
    snapshot = _asset_ref(db, campaign_id, line_item_id, asset_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return _normalize(campaign_id, line_item_id, asset_id, snapshot.to_dict() or {})


def update_asset(
    db,
    uid,
    campaign_id,
    line_item_id,
    asset_id,
    payload: AssetUpdate,
    *,
    admin=False,
):
    existing = get_asset(db, uid, campaign_id, line_item_id, asset_id, admin=admin)
    updates = payload.model_dump(exclude_unset=True, mode="json")
    if "tracking_pixels" in updates:
        updates["tracking_pixels"] = updates["tracking_pixels"] or []
    updates["updated_at"] = _utc_now()
    if updates.get("status") == "archived":
        updates["archived_at"] = updates["updated_at"]
    _asset_ref(db, campaign_id, line_item_id, asset_id).update(updates)
    return _normalize(campaign_id, line_item_id, asset_id, {**existing, **updates})


def archive_asset(db, uid, campaign_id, line_item_id, asset_id, *, admin=False):
    return update_asset(
        db,
        uid,
        campaign_id,
        line_item_id,
        asset_id,
        AssetUpdate(status="archived"),
        admin=admin,
    )
