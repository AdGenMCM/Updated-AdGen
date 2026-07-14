from __future__ import annotations

from typing import Any, Dict, Optional

from google.cloud import firestore as gc_firestore

from plan_config import get_limit

SUMMARY_COLLECTION = "storage"
SUMMARY_DOCUMENT = "summary"


def _summary_ref(db, uid: str):
    return (
        db.collection("users")
        .document(uid)
        .collection(SUMMARY_COLLECTION)
        .document(SUMMARY_DOCUMENT)
    )


def _safe_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except Exception:
        return 0


def get_storage_summary(db, uid: str, tier: Optional[str]) -> Dict[str, Any]:
    snap = _summary_ref(db, uid).get()
    data = snap.to_dict() or {}

    used = _safe_int(data.get("usedBytes"))
    limit_bytes = get_limit(tier, "storage_bytes")
    remaining = max(0, limit_bytes - used)
    percent = 0 if limit_bytes <= 0 else min(100, round((used / limit_bytes) * 100, 2))

    return {
        "usedBytes": used,
        "limitBytes": limit_bytes,
        "remainingBytes": remaining,
        "percentUsed": percent,
        "imageBytes": _safe_int(data.get("imageBytes")),
        "videoBytes": _safe_int(data.get("videoBytes")),
        "otherBytes": _safe_int(data.get("otherBytes")),
        "assetCount": _safe_int(data.get("assetCount")),
        "warning": percent >= 80,
        "full": limit_bytes > 0 and used >= limit_bytes,
    }


def ensure_storage_available(db, uid: str, tier: Optional[str], incoming_bytes: int) -> Dict[str, Any]:
    incoming = _safe_int(incoming_bytes)
    summary = get_storage_summary(db, uid, tier)
    if summary["limitBytes"] > 0 and summary["usedBytes"] + incoming > summary["limitBytes"]:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=413,
            detail={
                "message": "Your creative storage limit has been reached. Delete assets or upgrade your plan.",
                "usedBytes": summary["usedBytes"],
                "limitBytes": summary["limitBytes"],
                "incomingBytes": incoming,
                "upgradePath": "/account",
            },
        )
    return summary


def register_storage_asset(
    db,
    uid: str,
    *,
    size_bytes: int,
    asset_type: str,
) -> Dict[str, Any]:
    size = _safe_int(size_bytes)
    category = "image" if asset_type == "image" else "video" if asset_type == "video" else "other"
    ref = _summary_ref(db, uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}

        update = {
            "usedBytes": _safe_int(data.get("usedBytes")) + size,
            "imageBytes": _safe_int(data.get("imageBytes")) + (size if category == "image" else 0),
            "videoBytes": _safe_int(data.get("videoBytes")) + (size if category == "video" else 0),
            "otherBytes": _safe_int(data.get("otherBytes")) + (size if category == "other" else 0),
            "assetCount": _safe_int(data.get("assetCount")) + 1,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }
        transaction.set(ref, update, merge=True)
        return update

    return _tx(db.transaction())


def release_storage_asset(
    db,
    uid: str,
    *,
    size_bytes: int,
    asset_type: str,
) -> Dict[str, Any]:
    size = _safe_int(size_bytes)
    category = "image" if asset_type == "image" else "video" if asset_type == "video" else "other"
    ref = _summary_ref(db, uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}

        update = {
            "usedBytes": max(0, _safe_int(data.get("usedBytes")) - size),
            "imageBytes": max(0, _safe_int(data.get("imageBytes")) - (size if category == "image" else 0)),
            "videoBytes": max(0, _safe_int(data.get("videoBytes")) - (size if category == "video" else 0)),
            "otherBytes": max(0, _safe_int(data.get("otherBytes")) - (size if category == "other" else 0)),
            "assetCount": max(0, _safe_int(data.get("assetCount")) - 1),
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }
        transaction.set(ref, update, merge=True)
        return update

    return _tx(db.transaction())
