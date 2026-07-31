from __future__ import annotations

import time
from typing import Any

from auth_helpers import get_db

COLLECTION = "campaign_intelligence_history"
ITEMS = "items"


def _parent(uid: str):
    return get_db().collection(COLLECTION).document(uid)


def save_briefing(uid: str, briefing: dict[str, Any]) -> None:
    generated_at = int(briefing.get("generatedAt") or time.time())
    date_range = str(briefing.get("dateRange") or "LAST_30_DAYS")
    top_id = str(briefing.get("topPriorityId") or "none")
    platform_filter = str(briefing.get("platformFilter") or "all")
    # One stable snapshot per range/platform/hour avoids duplicate timeline spam.
    bucket = generated_at // 3600
    doc_id = f"{date_range}_{platform_filter}_{bucket}_{top_id}".replace("/", "_").replace(":", "_")[:180]
    payload = {**briefing, "uid": uid, "savedAt": int(time.time())}
    _parent(uid).collection(ITEMS).document(doc_id).set(payload, merge=True)
    _parent(uid).set({"uid": uid, "lastGeneratedAt": generated_at, "updatedAt": int(time.time())}, merge=True)


def list_briefings(uid: str, limit: int = 30) -> list[dict[str, Any]]:
    rows = []
    query = _parent(uid).collection(ITEMS).order_by("generatedAt", direction="DESCENDING").limit(max(1, min(limit, 100)))
    for snap in query.stream():
        rows.append({"historyId": snap.id, **(snap.to_dict() or {})})
    return rows
