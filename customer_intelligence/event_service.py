from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Any, Dict, Optional

from google.cloud import firestore as gc_firestore

from .event_catalog import validate_event_name
from .profile_service import apply_event_to_profile


EVENT_COLLECTION = "customer_intelligence_events"


def _safe_event_id(value: str) -> str:
    cleaned = str(value or "").strip().replace("/", "_")
    if cleaned:
        return cleaned[:180]
    return uuid.uuid4().hex


def _derived_event_id(uid: str, event_name: str, metadata: Dict[str, Any]) -> str:
    canonical = json.dumps(metadata or {}, sort_keys=True, default=str)
    digest = hashlib.sha256(f"{uid}|{event_name}|{canonical}".encode("utf-8")).hexdigest()[:24]
    return f"{event_name}:{digest}:{int(time.time())}"


def track_event(
    db,
    uid: str,
    event_name: str,
    *,
    event_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    source: str = "backend",
    occurred_at: Optional[int] = None,
    raise_on_error: bool = False,
) -> Dict[str, Any]:
    """
    Record one idempotent Customer Intelligence event and update the profile.

    The default behavior is best-effort. Set raise_on_error=True only for
    explicit internal tooling or tests.
    """
    try:
        if not uid:
            raise ValueError("uid is required")

        normalized_event = validate_event_name(event_name)
        metadata = metadata or {}
        occurred_at = int(occurred_at or time.time())
        resolved_event_id = _safe_event_id(
            event_id or _derived_event_id(uid, normalized_event, metadata)
        )

        ref = db.collection(EVENT_COLLECTION).document(resolved_event_id)

        payload = {
            "uid": uid,
            "eventName": normalized_event,
            "eventId": resolved_event_id,
            "metadata": metadata,
            "source": str(source or "backend"),
            "occurredAt": occurred_at,
            "createdAt": gc_firestore.SERVER_TIMESTAMP,
        }

        @gc_firestore.transactional
        def _tx(transaction: gc_firestore.Transaction):
            snap = ref.get(transaction=transaction)
            if snap.exists:
                return False
            transaction.set(ref, payload)
            return True

        created = _tx(db.transaction())

        if not created:
            return {
                "ok": True,
                "created": False,
                "duplicate": True,
                "eventId": resolved_event_id,
                "eventName": normalized_event,
            }

        profile = apply_event_to_profile(
            db,
            uid,
            normalized_event,
            metadata,
            occurred_at,
        )

        return {
            "ok": True,
            "created": True,
            "duplicate": False,
            "eventId": resolved_event_id,
            "eventName": normalized_event,
            "profile": profile,
        }

    except Exception as exc:
        print("CUSTOMER INTELLIGENCE EVENT ERROR:", repr(exc), flush=True)
        if raise_on_error:
            raise
        return {
            "ok": False,
            "created": False,
            "error": str(exc),
        }
