from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from admin_guard import is_admin
from auth_helpers import get_db, require_user

from .decision_engine import build_recommendation_list, choose_next_best_action
from .event_service import track_event
from .historical_rebuild import rebuild_profile_from_history
from .profile_service import get_or_create_profile, rebuild_profile


router = APIRouter(prefix="/customer-intelligence", tags=["customer-intelligence"])


class ClientEventBody(BaseModel):
    eventName: str = Field(min_length=1, max_length=120)
    eventId: Optional[str] = Field(default=None, max_length=180)
    metadata: Dict[str, Any] = Field(default_factory=dict)


@router.get("/profile")
def get_customer_intelligence_profile(
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)
    return get_or_create_profile(get_db(), uid)


@router.get("/next-best-action")
def get_next_best_action(
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)
    profile = get_or_create_profile(get_db(), uid)
    recommendations = build_recommendation_list(profile)
    next_best_action = choose_next_best_action(profile)

    return {
        "uid": uid,
        "nextBestAction": next_best_action,
        "opportunities": recommendations[1:4],
        "recommendations": recommendations[:4],
        "activationScore": profile.get("activationScore", 0),
        "engagementScore": profile.get("engagementScore", 0),
        "lifecycleStage": profile.get("lifecycleStage", "new"),
    }


@router.post("/events")
def post_customer_event(
    body: ClientEventBody,
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)

    client_allowed = {
        "user.logged_in",
        "feature.access_attempted",
        "reporting.viewed",
    }

    if body.eventName not in client_allowed:
        raise HTTPException(
            status_code=403,
            detail="This event may only be recorded by the ADGen backend.",
        )

    result = track_event(
        get_db(),
        uid,
        body.eventName,
        event_id=body.eventId,
        metadata=body.metadata,
        source="frontend",
        raise_on_error=True,
    )
    return result


@router.post("/rebuild")
def rebuild_my_customer_intelligence_profile(
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)
    return rebuild_profile(get_db(), uid)


@router.post("/rebuild-from-history")
def rebuild_my_profile_from_existing_records(
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)
    return rebuild_profile_from_history(get_db(), uid)


@router.post("/admin/users/{target_uid}/rebuild-from-history")
def admin_rebuild_profile_from_existing_records(
    target_uid: str,
    authorization: str | None = Header(default=None),
):
    _uid, _email, claims = require_user(authorization)
    if not is_admin(claims):
        raise HTTPException(status_code=403, detail="Admin access required")
    return rebuild_profile_from_history(get_db(), target_uid)


@router.get("/admin/users/{target_uid}")
def admin_get_customer_intelligence_profile(
    target_uid: str,
    authorization: str | None = Header(default=None),
):
    _uid, _email, claims = require_user(authorization)
    if not is_admin(claims):
        raise HTTPException(status_code=403, detail="Admin access required")
    return get_or_create_profile(get_db(), target_uid)
