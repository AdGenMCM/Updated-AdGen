# notification_utils.py

from typing import Any, Dict, Optional

from google.cloud import firestore as gc_firestore


def create_notification(
    db,
    uid: str,
    *,
    event_key: str,
    title: str,
    body: str,
    notification_type: str = "info",
    link: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Creates a notification exactly once for a given user/event_key.

    Stored at:
      users/{uid}/notifications/{event_key}
    """
    if not uid or not event_key:
        return False

    safe_event_key = (
        str(event_key)
        .strip()
        .replace("/", "_")
        .replace(" ", "_")
    )[:180]

    ref = (
        db.collection("users")
        .document(uid)
        .collection("notifications")
        .document(safe_event_key)
    )

    payload = {
        "eventKey": safe_event_key,
        "title": str(title or "").strip()[:120],
        "body": str(body or "").strip()[:500],
        "type": str(notification_type or "info").strip(),
        "link": link or None,
        "read": False,
        "createdAt": gc_firestore.SERVER_TIMESTAMP,
        "metadata": metadata or {},
    }

    @gc_firestore.transactional
    def _transaction(transaction: gc_firestore.Transaction):
        snapshot = ref.get(transaction=transaction)

        if snapshot.exists:
            return False

        transaction.set(ref, payload)
        return True

    return _transaction(db.transaction())


def create_usage_notifications(
    db,
    uid: str,
    *,
    resource: str,
    used: int,
    cap: int,
    period_key: Optional[str],
    link: str = "/account",
) -> None:
    """
    Creates one 80% warning and one 100% limit notification per billing period.
    """
    if not uid or cap <= 0:
        return

    percentage = int(round((used / cap) * 100))
    safe_period = str(period_key or "current").replace(":", "_")

    labels = {
        "images": "image generation",
        "video": "video credit",
        "optimizer": "Optimizer",
    }

    label = labels.get(resource, resource)

    if percentage >= 100:
        create_notification(
            db,
            uid,
            event_key=f"usage_{resource}_100_{safe_period}",
            title=f"{label.title()} limit reached",
            body=(
                f"You have used all {cap} of your available "
                f"{label} capacity for this billing period."
            ),
            notification_type="usage_limit",
            link=link,
            metadata={
                "resource": resource,
                "used": used,
                "cap": cap,
                "percentage": percentage,
            },
        )

    elif percentage >= 80:
        remaining = max(0, cap - used)

        create_notification(
            db,
            uid,
            event_key=f"usage_{resource}_80_{safe_period}",
            title=f"{label.title()} usage is at {percentage}%",
            body=(
                f"You have {remaining} remaining for the current "
                f"billing period."
            ),
            notification_type="usage_warning",
            link=link,
            metadata={
                "resource": resource,
                "used": used,
                "cap": cap,
                "percentage": percentage,
            },
        )