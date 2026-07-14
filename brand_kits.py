from __future__ import annotations

import time
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, UploadFile, File
from pydantic import BaseModel
from google.cloud import firestore as gc_firestore

from auth_helpers import get_db, require_user
from admin_guard import is_admin
from plan_config import get_limit
from storage_utils import upload_bytes_to_firebase_storage
from usage_caps import get_tier_and_status

router = APIRouter()


class BrandKitCreate(BaseModel):
    name: Optional[str] = None
    data: Dict[str, Any] = {}


class BrandKitUpdate(BaseModel):
    name: Optional[str] = None
    data: Dict[str, Any] = {}


def _serialize_doc(doc_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(data or {})
    out["id"] = doc_id
    return out


def ensure_brand_kit_migration(db, uid: str, user_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    user_ref = db.collection("users").document(uid)
    if user_doc is None:
        user_doc = user_ref.get().to_dict() or {}

    kits_ref = user_ref.collection("brand_kits")
    existing = list(kits_ref.limit(1).stream())
    if existing:
        if not user_doc.get("defaultBrandKitId"):
            first_id = existing[0].id
            user_ref.set({"defaultBrandKitId": first_id, "brandKitCount": max(1, int(user_doc.get("brandKitCount") or 1))}, merge=True)
            user_doc["defaultBrandKitId"] = first_id
        return user_doc

    legacy = user_doc.get("brandKit")
    if not isinstance(legacy, dict) or not legacy:
        return user_doc

    kit_id = uuid.uuid4().hex
    name = (legacy.get("brandName") or "My Brand").strip() or "My Brand"
    now = int(time.time())
    kit_doc = {
        **legacy,
        "name": name,
        "isDefault": True,
        "createdAt": now,
        "updatedAt": now,
        "migratedFromLegacy": True,
    }
    kits_ref.document(kit_id).set(kit_doc)
    user_ref.set({"defaultBrandKitId": kit_id, "brandKitCount": 1}, merge=True)
    user_doc["defaultBrandKitId"] = kit_id
    user_doc["brandKitCount"] = 1
    return user_doc


def resolve_brand_kit(db, uid: str, brand_kit_id: Optional[str] = None, user_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    user_ref = db.collection("users").document(uid)
    if user_doc is None:
        user_doc = user_ref.get().to_dict() or {}

    user_doc = ensure_brand_kit_migration(db, uid, user_doc)
    selected_id = (brand_kit_id or user_doc.get("defaultBrandKitId") or "").strip()

    if selected_id:
        snap = user_ref.collection("brand_kits").document(selected_id).get()
        if snap.exists:
            data = snap.to_dict() or {}
            data["id"] = snap.id
            return data
        if brand_kit_id:
            raise HTTPException(status_code=404, detail="Brand Kit not found.")

    legacy = user_doc.get("brandKit")
    if isinstance(legacy, dict):
        return legacy
    return {}


@router.get("/brand-kits")
def list_brand_kits(authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    db = get_db()
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get().to_dict() or {}
    user_doc = ensure_brand_kit_migration(db, uid, user_doc)
    tier, _status = get_tier_and_status(user_doc)

    kits = []
    for snap in user_ref.collection("brand_kits").stream():
        kits.append(_serialize_doc(snap.id, snap.to_dict() or {}))
    kits.sort(key=lambda x: (not bool(x.get("isDefault")), str(x.get("name") or x.get("brandName") or "").lower()))

    limit = get_limit(tier, "brand_kits")
    return {
        "items": kits,
        "defaultBrandKitId": user_doc.get("defaultBrandKitId"),
        "used": len(kits),
        "limit": limit,
        "remaining": max(0, limit - len(kits)),
        "tier": tier,
        "isAdmin": is_admin(claims),
    }


@router.get("/brand-kits/{brand_kit_id}")
def get_brand_kit(brand_kit_id: str, authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()
    data = resolve_brand_kit(db, uid, brand_kit_id)
    return data


@router.post("/brand-kits")
def create_brand_kit(body: BrandKitCreate, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    db = get_db()
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get().to_dict() or {}
    user_doc = ensure_brand_kit_migration(db, uid, user_doc)
    tier, _status = get_tier_and_status(user_doc)
    limit = get_limit(tier, "brand_kits")

    count = sum(1 for _ in user_ref.collection("brand_kits").stream())
    if not is_admin(claims) and count >= limit:
        raise HTTPException(status_code=429, detail={"message": "You have reached your Brand Kit limit.", "used": count, "cap": limit, "upgradePath": "/account"})

    kit_id = uuid.uuid4().hex
    now = int(time.time())
    payload = dict(body.data or {})
    name = (body.name or payload.get("brandName") or f"Brand {count + 1}").strip()
    is_first = count == 0
    payload.update({"name": name, "createdAt": now, "updatedAt": now, "isDefault": is_first})
    user_ref.collection("brand_kits").document(kit_id).set(payload)

    update = {"brandKitCount": count + 1}
    if is_first or not user_doc.get("defaultBrandKitId"):
        update["defaultBrandKitId"] = kit_id
    user_ref.set(update, merge=True)
    return _serialize_doc(kit_id, payload)


@router.patch("/brand-kits/{brand_kit_id}")
def update_brand_kit(brand_kit_id: str, body: BrandKitUpdate, authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()
    ref = db.collection("users").document(uid).collection("brand_kits").document(brand_kit_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Brand Kit not found.")

    payload = dict(body.data or {})
    if body.name is not None:
        payload["name"] = body.name.strip() or "Untitled Brand"
    payload["updatedAt"] = int(time.time())
    ref.set(payload, merge=True)
    return _serialize_doc(brand_kit_id, ref.get().to_dict() or {})


@router.post("/brand-kits/{brand_kit_id}/set-default")
def set_default_brand_kit(brand_kit_id: str, authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()
    user_ref = db.collection("users").document(uid)
    selected_ref = user_ref.collection("brand_kits").document(brand_kit_id)
    if not selected_ref.get().exists:
        raise HTTPException(status_code=404, detail="Brand Kit not found.")

    batch = db.batch()
    for snap in user_ref.collection("brand_kits").stream():
        batch.set(snap.reference, {"isDefault": snap.id == brand_kit_id}, merge=True)
    batch.set(user_ref, {"defaultBrandKitId": brand_kit_id}, merge=True)
    batch.commit()
    return {"ok": True, "defaultBrandKitId": brand_kit_id}


@router.delete("/brand-kits/{brand_kit_id}")
def delete_brand_kit(brand_kit_id: str, authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()
    user_ref = db.collection("users").document(uid)
    ref = user_ref.collection("brand_kits").document(brand_kit_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Brand Kit not found.")

    all_kits = list(user_ref.collection("brand_kits").stream())
    if len(all_kits) <= 1:
        raise HTTPException(status_code=400, detail="You must keep at least one Brand Kit.")

    was_default = bool((snap.to_dict() or {}).get("isDefault"))
    ref.delete()
    remaining = [x for x in all_kits if x.id != brand_kit_id]
    update: Dict[str, Any] = {"brandKitCount": len(remaining)}
    if was_default:
        new_default = remaining[0].id
        remaining[0].reference.set({"isDefault": True}, merge=True)
        update["defaultBrandKitId"] = new_default
    user_ref.set(update, merge=True)
    return {"ok": True}


@router.post("/brand-kits/{brand_kit_id}/logo")
async def upload_brand_kit_logo(
    brand_kit_id: str,
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)
    db = get_db()
    ref = db.collection("users").document(uid).collection("brand_kits").document(brand_kit_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Brand Kit not found.")

    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"}
    ct = (file.content_type or "").lower().strip()
    if ct not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported logo type. Use PNG, JPG, WEBP, or SVG.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="No file uploaded.")
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Logo too large. Max 5MB.")

    logo_url = upload_bytes_to_firebase_storage(
        data,
        uid,
        content_type=ct,
        folder=f"brand_logos/{brand_kit_id}",
        filename_hint=file.filename or "logo",
    )
    ref.set({"logoUrl": logo_url, "logoUpdatedAt": int(time.time()), "updatedAt": int(time.time())}, merge=True)
    return {"logoUrl": logo_url}
