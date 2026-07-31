from __future__ import annotations

import hashlib
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from google.cloud import firestore as gc_firestore

from auth_helpers import get_db

from .config import get_email_config
from .resend_client import send_resend_email
from .templates import render_welcome_email


EMAIL_DELIVERIES_COLLECTION = "email_deliveries"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _delivery_document_id(uid: str, idempotency_key: str) -> str:
    raw = f"{uid}:{idempotency_key}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _first_name(display_name: Optional[str], email: Optional[str]) -> str:
    candidate = (display_name or "").strip()
    if candidate:
        return candidate.split()[0]

    local_part = (email or "").split("@", 1)[0].strip()
    if local_part:
        return local_part.split(".")[0].split("_")[0].capitalize()

    return "there"


def send_email_once(
    *,
    uid: str,
    recipient: str,
    email_key: str,
    category: str,
    subject: str,
    html: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Send one idempotent email.

    Firestore is reserved before provider delivery so simultaneous requests do not
    send duplicates. A failed reservation is marked failed and may be retried by
    using an intentionally different idempotency key.
    """
    db = get_db()
    doc_id = _delivery_document_id(uid, email_key)
    ref = db.collection(EMAIL_DELIVERIES_COLLECTION).document(doc_id)

    @gc_firestore.transactional
    def reserve(transaction):
        snap = ref.get(transaction=transaction)
        if snap.exists:
            existing = snap.to_dict() or {}

            # A provider failure may be retried with the same production
            # idempotency key. Sent and currently-sending deliveries remain
            # protected from duplicates.
            if existing.get("status") == "failed":
                transaction.set(
                    ref,
                    {
                        "status": "sending",
                        "error": gc_firestore.DELETE_FIELD,
                        "failedAt": gc_firestore.DELETE_FIELD,
                        "attemptCount": int(existing.get("attemptCount") or 1) + 1,
                        "updatedAt": gc_firestore.SERVER_TIMESTAMP,
                    },
                    merge=True,
                )
                return {"reserved": True, "existing": existing}

            return {
                "reserved": False,
                "existing": existing,
            }

        transaction.create(
            ref,
            {
                "uid": uid,
                "recipient": recipient,
                "emailKey": email_key,
                "category": category,
                "subject": subject,
                "status": "sending",
                "provider": "resend",
                "metadata": metadata or {},
                "attemptCount": 1,
                "createdAt": gc_firestore.SERVER_TIMESTAMP,
                "updatedAt": gc_firestore.SERVER_TIMESTAMP,
            },
        )
        return {"reserved": True, "existing": None}

    reservation = reserve(db.transaction())

    if not reservation["reserved"]:
        existing = reservation.get("existing") or {}
        return {
            "sent": existing.get("status") == "sent",
            "skipped": True,
            "reason": "duplicate",
            "deliveryId": doc_id,
            "providerMessageId": existing.get("providerMessageId"),
        }

    try:
        provider_result = send_resend_email(
            to_email=recipient,
            subject=subject,
            html=html,
        )

        ref.set(
            {
                "status": "sent",
                "providerMessageId": provider_result.get("providerMessageId"),
                "sentAt": gc_firestore.SERVER_TIMESTAMP,
                "updatedAt": gc_firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )

        return {
            "sent": True,
            "skipped": False,
            "reason": None,
            "deliveryId": doc_id,
            "providerMessageId": provider_result.get("providerMessageId"),
        }

    except Exception as error:
        ref.set(
            {
                "status": "failed",
                "error": str(error)[:1200],
                "failedAt": gc_firestore.SERVER_TIMESTAMP,
                "updatedAt": gc_firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        raise


def send_welcome_email(
    *,
    uid: str,
    recipient: str,
    display_name: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    test_mode: bool = False,
) -> Dict[str, Any]:
    config = get_email_config()
    first_name = _first_name(display_name, recipient)
    subject, html = render_welcome_email(
        first_name=first_name,
        app_url=config.app_url,
    )

    key = idempotency_key or f"welcome:{uid}"
    category = "test" if test_mode else "transactional"

    return send_email_once(
        uid=uid,
        recipient=recipient,
        email_key=key,
        category=category,
        subject=subject,
        html=html,
        metadata={
            "template": "welcome",
            "testMode": test_mode,
            "schemaVersion": 1,
        },
    )


def build_repeat_test_key(uid: str) -> str:
    return f"welcome_test:{uid}:{int(time.time())}:{uuid.uuid4().hex}"
