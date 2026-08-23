"""Preflight safety and cost controls for paid Runway video operations."""
from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException
from google.cloud import firestore as gc_firestore
from openai import OpenAI


OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
VIDEO_MODERATION_MODEL = (os.getenv("VIDEO_MODERATION_MODEL") or "omni-moderation-latest").strip()
VIDEO_MODERATION_ENABLED = (os.getenv("VIDEO_MODERATION_ENABLED") or "true").lower() in {"1", "true", "yes", "on"}
VIDEO_MODERATION_FAIL_CLOSED = (os.getenv("VIDEO_MODERATION_FAIL_CLOSED") or "true").lower() in {"1", "true", "yes", "on"}

VIDEO_MAX_ACTIVE_JOBS_PER_USER = max(1, int(os.getenv("VIDEO_MAX_ACTIVE_JOBS_PER_USER", "1")))
VIDEO_USER_COOLDOWN_SECONDS = max(0, int(os.getenv("VIDEO_USER_COOLDOWN_SECONDS", "60")))
VIDEO_USER_DAILY_SUBMISSION_LIMIT = max(
    0,
    int(os.getenv("VIDEO_USER_DAILY_SUBMISSION_LIMIT", "0")),
)
VIDEO_POLICY_VIOLATION_LIMIT = max(1, int(os.getenv("VIDEO_POLICY_VIOLATION_LIMIT", "2")))
VIDEO_STALE_PRE_PROVIDER_SECONDS = max(
    60,
    int(os.getenv("VIDEO_STALE_PRE_PROVIDER_SECONDS", "300")),
)

RUNWAY_DAILY_SPEND_LIMIT_USD = max(0.0, float(os.getenv("RUNWAY_DAILY_SPEND_LIMIT_USD", "25")))
RUNWAY_COST_PER_SECOND_USD = max(0.0, float(os.getenv("RUNWAY_COST_PER_SECOND_USD", "0.12")))
RUNWAY_TTS_ESTIMATED_COST_USD = max(0.0, float(os.getenv("RUNWAY_TTS_ESTIMATED_COST_USD", "0.10")))
RUNWAY_CHARACTER_DIALOGUE_COST_PER_SECOND_USD = max(0.0, float(os.getenv("RUNWAY_CHARACTER_DIALOGUE_COST_PER_SECOND_USD", "0.05")))
RUNWAY_AVATAR_ESTIMATED_COST_PER_SECOND_USD = max(0.0, float(os.getenv("RUNWAY_AVATAR_ESTIMATED_COST_PER_SECOND_USD", "0.0034")))
RUNWAY_AUDIO_ENHANCEMENT_MIN_COST_USD = max(0.0, float(os.getenv("RUNWAY_AUDIO_ENHANCEMENT_MIN_COST_USD", "0.05")))
VIDEO_CHARACTER_VISION_MODEL = (os.getenv("VIDEO_CHARACTER_VISION_MODEL") or "gpt-4.1-mini").strip()

ACTIVE_VIDEO_STATUSES = {"queued", "running", "pending", "processing", "throttled"}
BLOCKING_CATEGORIES = {
    # Sexual content
    "sexual",
    "sexual/minors",

    # Violence
    "violence",
    "violence/graphic",

    # Self-harm
    "self-harm",
    "self-harm/intent",
    "self-harm/instructions",

    # Illegal or dangerous activity
    "illicit",
    "illicit/violent",

    # Hate and targeted abuse
    "hate",
    "hate/threatening",
    "harassment",
    "harassment/threatening",
}

# Fast deterministic first pass. The moderation API remains the authoritative check.
HARD_BLOCK_PATTERNS = (
    r"\b(?:nude|nudity|naked|topless|porn|pornographic|explicit sex|sexual intercourse)\b",
    r"\b(?:make|making|made)\s+out\b",
    r"\b(?:grop(?:e|ing)|fondl(?:e|ing)|striptease)\b",
    r"\b(?:child|minor|underage|teen(?:ager)?)\b.{0,60}\b(?:sex|sexual|nude|naked|kissing|make out)\b",
    r"\b(?:sex|sexual|nude|naked|kissing|make out)\b.{0,60}\b(?:child|minor|underage|teen(?:ager)?)\b",
    r"\b(?:rape|sexual assault|molest(?:ation|ing)?)\b",
)


@dataclass(frozen=True)
class CostReservation:
    document_id: str
    estimated_cost_usd: float
    submission_count: int = 1


def _normalize(text: Optional[str]) -> str:
    return " ".join((text or "").strip().lower().split())


def _field_dict(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump()
        except Exception:
            return {}
    if hasattr(value, "to_dict"):
        try:
            return value.to_dict()
        except Exception:
            return {}
    return {}


def _flagged_categories(result: Any) -> list[str]:
    categories = _field_dict(getattr(result, "categories", None))
    return sorted(
        key for key, value in categories.items()
        if bool(value) and key in BLOCKING_CATEGORIES
    )


def require_active_account(user_doc: Dict[str, Any]) -> None:
    status = str(
        user_doc.get("accountStatus")
        or user_doc.get("account_status")
        or "active"
    ).strip().lower()
    if status in {"suspended", "disabled", "blocked", "banned"}:
        raise HTTPException(status_code=403, detail="This account has been suspended.")


def require_no_active_video_job(db, uid: str) -> None:
    """
    Block duplicate paid video submissions without allowing an abandoned
    pre-provider Firestore job to lock the user forever.

    Jobs that already have a provider video task ID remain blocking here.
    Their provider state is reconciled by video_jobs before this guard runs.
    """
    now = int(time.time())
    active = 0

    # Filter by UID only to avoid requiring a new composite Firestore index.
    for snap in db.collection("video_jobs").where("uid", "==", uid).limit(25).stream():
        data = snap.to_dict() or {}
        status = str(data.get("status") or "").lower()
        if status not in ACTIVE_VIDEO_STATUSES:
            continue

        provider_task_id = str(data.get("runwayVideoTaskId") or "").strip()
        created_at = int(data.get("createdAt") or 0)
        progress_updated_at = int(data.get("progressUpdatedAt") or 0)
        last_activity_at = max(created_at, progress_updated_at)
        age_seconds = (now - last_activity_at) if last_activity_at else VIDEO_STALE_PRE_PROVIDER_SECONDS + 1

        # A job that never reached the paid provider should not permanently
        # block the account after an interrupted request/deploy/browser session.
        if not provider_task_id and age_seconds >= VIDEO_STALE_PRE_PROVIDER_SECONDS:
            snap.reference.update({
                "status": "failed",
                "error": (
                    "The previous video request was interrupted before generation "
                    "started. Please try again."
                ),
                "staleRecovery": True,
                "staleRecoveredAt": now,
                "progressStage": "failed",
                "progressPercent": 100,
                "progressMessage": "Video generation failed.",
                "progressUpdatedAt": now,
            })
            print(
                "[Video Stale Job Recovery]",
                f"uid={uid}",
                f"job_id={snap.id}",
                "provider_task_id=missing",
                f"age_seconds={age_seconds}",
                flush=True,
            )
            continue

        active += 1
        if active >= VIDEO_MAX_ACTIVE_JOBS_PER_USER:
            raise HTTPException(
                status_code=429,
                detail="You already have a video generation in progress.",
            )


def enforce_user_submission_window(db, uid: str) -> None:
    """Atomic per-user cooldown and daily submission ceiling."""
    now = int(time.time())
    day_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ref = db.collection("video_submission_guards").document(uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}
        existing_day = data.get("dayKey")
        count = int(data.get("submissionCount") or 0) if existing_day == day_key else 0
        last_at = int(data.get("lastSubmissionAt") or 0)

        if VIDEO_USER_COOLDOWN_SECONDS and last_at and now - last_at < VIDEO_USER_COOLDOWN_SECONDS:
            retry_after = VIDEO_USER_COOLDOWN_SECONDS - (now - last_at)
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "Please wait before starting another video generation.",
                    "retryAfterSeconds": max(1, retry_after),
                },
            )
        if (
            VIDEO_USER_DAILY_SUBMISSION_LIMIT > 0
            and count >= VIDEO_USER_DAILY_SUBMISSION_LIMIT
        ):
            raise HTTPException(
                status_code=429,
                detail="You have reached today's video submission safety limit.",
            )

        transaction.set(ref, {
            "uid": uid,
            "dayKey": day_key,
            "submissionCount": count + 1,
            "lastSubmissionAt": now,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }, merge=True)

    _tx(db.transaction())


def rollback_user_submission_window(db, uid: str) -> None:
    """Best-effort rollback when no paid provider task was accepted."""
    day_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ref = db.collection("video_submission_guards").document(uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}
        if data.get("dayKey") != day_key:
            return
        count = max(0, int(data.get("submissionCount") or 0) - 1)
        transaction.set(ref, {"submissionCount": count, "updatedAt": gc_firestore.SERVER_TIMESTAMP}, merge=True)

    try:
        _tx(db.transaction())
    except Exception:
        pass


def record_policy_violation(db, uid: str, *, reason: str, categories: Iterable[str]) -> int:
    user_ref = db.collection("users").document(uid)
    event_ref = db.collection("video_policy_events").document()

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction) -> int:
        snap = user_ref.get(transaction=transaction)
        data = snap.to_dict() or {}
        count = int(data.get("videoPolicyViolations") or 0) + 1
        update: Dict[str, Any] = {
            "videoPolicyViolations": count,
            "lastVideoPolicyViolation": reason[:300],
            "lastVideoPolicyViolationAt": gc_firestore.SERVER_TIMESTAMP,
        }
        if count >= VIDEO_POLICY_VIOLATION_LIMIT:
            update.update({
                "accountStatus": "suspended",
                "suspensionReason": "Repeated prohibited video requests",
                "suspendedAt": gc_firestore.SERVER_TIMESTAMP,
            })
        transaction.set(user_ref, update, merge=True)
        transaction.set(event_ref, {
            "uid": uid,
            "reason": reason[:500],
            "categories": list(categories),
            "createdAt": gc_firestore.SERVER_TIMESTAMP,
        })
        return count

    return _tx(db.transaction())


async def moderate_video_request(
    db,
    uid: str,
    *,
    text_parts: Iterable[Optional[str]],
    image_url: Optional[str] = None,
) -> Dict[str, Any]:
    text = "\n".join(part.strip() for part in text_parts if isinstance(part, str) and part.strip())
    normalized = _normalize(text)

    for pattern in HARD_BLOCK_PATTERNS:
        if re.search(pattern, normalized, flags=re.IGNORECASE | re.DOTALL):
            count = record_policy_violation(db, uid, reason="local_policy_match", categories=["local/sexual"])
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "This video request contains prohibited content.",
                    "policyViolationCount": count,
                },
            )

    if not VIDEO_MODERATION_ENABLED:
        return {"checked": False, "flagged": False, "categories": []}

    if not OPENAI_API_KEY:
        if VIDEO_MODERATION_FAIL_CLOSED:
            raise HTTPException(status_code=503, detail="Video safety screening is temporarily unavailable.")
        return {"checked": False, "flagged": False, "categories": [], "warning": "missing_api_key"}

    moderation_input: Any
    if image_url:
        moderation_input = [
            {"type": "text", "text": text or "Video generation request"},
            {"type": "image_url", "image_url": {"url": image_url}},
        ]
    else:
        moderation_input = text or "Video generation request"

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = await asyncio.to_thread(
            lambda: client.moderations.create(
                model=VIDEO_MODERATION_MODEL,
                input=moderation_input,
            )
        )
        result = response.results[0]
        categories = _flagged_categories(result)
        flagged = bool(categories)
    except HTTPException:
        raise
    except Exception as exc:
        print("[Video Moderation Error]", repr(exc), flush=True)
        if VIDEO_MODERATION_FAIL_CLOSED:
            raise HTTPException(status_code=503, detail="Video safety screening is temporarily unavailable.")
        return {"checked": False, "flagged": False, "categories": [], "warning": "moderation_error"}

    if flagged:
        count = record_policy_violation(
            db,
            uid,
            reason="moderation_flagged:" + ",".join(categories),
            categories=categories,
        )
        raise HTTPException(
            status_code=400,
            detail={
                "message": "This video request contains prohibited content.",
                "categories": categories,
                "policyViolationCount": count,
            },
        )

    return {"checked": True, "flagged": False, "categories": []}



PERSON_TERMS = re.compile(
    r"\b(person|people|woman|women|girl|female|man|men|boy|male|model|athlete|"
    r"trainer|coach|creator|influencer|spokesperson|speaker|customer|worker|"
    r"professional|founder|doctor|nurse|chef|barista|agent|consultant|human)\b",
    re.IGNORECASE,
)


def character_dialogue_max_seconds(duration: int) -> float:
    return 5.5 if int(duration) >= 10 else 3.5


async def validate_character_dialogue_request(
    *,
    voice_mode: str,
    script: Optional[str],
    speaker_gender: Optional[str],
    duration: int,
    text: str = "",
    image_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Reject invalid Character Dialogue requests before video credits/provider spend."""
    mode = (voice_mode or "none").strip().lower()
    if mode != "character_dialogue":
        return {"validated": False, "required": False}

    clean_script = " ".join((script or "").split())
    if not clean_script:
        raise HTTPException(
            status_code=400,
            detail="Add a Character Dialogue script before creating the video.",
        )

    gender = (speaker_gender or "").strip().lower()
    if gender not in {"female", "male"}:
        raise HTTPException(
            status_code=400,
            detail="Choose a male or female Character Voice before creating the video.",
        )

    words = len(clean_script.split())
    estimated_seconds = (words / 2.5) + 0.6
    max_dialogue_seconds = character_dialogue_max_seconds(int(duration))
    if estimated_seconds > max_dialogue_seconds:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The Character Dialogue is too long for the planned on-screen speaking window "
                f"(about {max_dialogue_seconds:g}s in a {int(duration)}s video). "
                "Shorten the dialogue so the character only speaks while they are on screen."
            ),
        )

    normalized = _normalize(text)
    opposite_terms = (
        (r"\b(woman|women|girl|female)\b", "male"),
        (r"\b(man|men|boy|male)\b", "female"),
    )
    for pattern, conflicting_gender in opposite_terms:
        if gender == conflicting_gender and re.search(pattern, normalized, re.IGNORECASE):
            raise HTTPException(
                status_code=400,
                detail=(
                    "The selected Character Voice conflicts with the person described "
                    "in your prompt. Choose a matching voice or update the prompt."
                ),
            )

    if image_url:
        if not OPENAI_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="Character Dialogue image validation is temporarily unavailable.",
            )
        try:
            client = OpenAI(api_key=OPENAI_API_KEY)
            response = await asyncio.to_thread(
                lambda: client.responses.create(
                    model=VIDEO_CHARACTER_VISION_MODEL,
                    input=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": (
                                    "Inspect this image for video preflight. Reply with exactly one "
                                    "token: FEMALE if it contains a clearly visible adult female-presenting "
                                    "person suitable to speak on camera, MALE if it contains a clearly visible "
                                    "adult male-presenting person suitable to speak on camera, PERSON if a "
                                    "clearly visible adult person is present but presentation is unclear, "
                                    "or NONE if there is no suitable visible adult person."
                                ),
                            },
                            {"type": "input_image", "image_url": image_url},
                        ],
                    }],
                    max_output_tokens=8,
                )
            )
            verdict = (getattr(response, "output_text", "") or "").strip().upper()
        except Exception as exc:
            print("[Character Dialogue Vision Check Error]", repr(exc), flush=True)
            raise HTTPException(
                status_code=503,
                detail="Character Dialogue image validation is temporarily unavailable.",
            )

        if verdict == "NONE" or verdict not in {"FEMALE", "MALE", "PERSON"}:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Character Dialogue requires an on-screen person. Upload an image "
                    "with a clearly visible person or switch to AI Voiceover."
                ),
            )
        if verdict in {"FEMALE", "MALE"} and verdict.lower() != gender:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The selected Character Voice does not match the visible person "
                    "in the uploaded image. Choose a matching voice."
                ),
            )
        return {"validated": True, "required": True, "speaker": verdict.lower()}

    if not PERSON_TERMS.search(normalized):
        raise HTTPException(
            status_code=400,
            detail=(
                "Character Dialogue requires an on-screen person. Add a person to "
                "your video prompt or switch to AI Voiceover."
            ),
        )

    return {"validated": True, "required": True, "speaker": gender}



def estimated_runway_cost(
    duration: int,
    *,
    include_tts: bool = False,
    include_character_dialogue: bool = False,
    include_audio_enhancement: bool = False,
) -> float:
    seconds = max(0, int(duration))
    cost = seconds * RUNWAY_COST_PER_SECOND_USD
    if include_tts:
        cost += RUNWAY_TTS_ESTIMATED_COST_USD
    if include_character_dialogue:
        cost += seconds * RUNWAY_CHARACTER_DIALOGUE_COST_PER_SECOND_USD
        cost += seconds * RUNWAY_AVATAR_ESTIMATED_COST_PER_SECOND_USD
    if include_audio_enhancement:
        cost += max(RUNWAY_AUDIO_ENHANCEMENT_MIN_COST_USD, seconds * 0.0025)
    return round(cost, 4)


def reserve_platform_cost(
    db,
    *,
    duration: int,
    include_tts: bool = False,
    include_character_dialogue: bool = False,
    include_audio_enhancement: bool = False,
) -> CostReservation:
    estimated = estimated_runway_cost(
        duration,
        include_tts=include_tts,
        include_character_dialogue=include_character_dialogue,
        include_audio_enhancement=include_audio_enhancement,
    )
    day_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    document_id = f"runway_{day_key}"
    ref = db.collection("platform_cost_guards").document(document_id)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}
        current = float(data.get("estimatedSpendUsd") or 0.0)
        count = int(data.get("submissionCount") or 0)
        projected = current + estimated
        if RUNWAY_DAILY_SPEND_LIMIT_USD > 0 and projected > RUNWAY_DAILY_SPEND_LIMIT_USD:
            raise HTTPException(
                status_code=503,
                detail="Video generation is temporarily unavailable because the daily provider budget limit was reached.",
            )
        transaction.set(ref, {
            "provider": "runway",
            "dayKey": day_key,
            "estimatedSpendUsd": round(projected, 4),
            "submissionCount": count + 1,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }, merge=True)

    _tx(db.transaction())
    return CostReservation(document_id=document_id, estimated_cost_usd=estimated)


def rollback_platform_cost(db, reservation: Optional[CostReservation]) -> None:
    if not reservation:
        return
    ref = db.collection("platform_cost_guards").document(reservation.document_id)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = ref.get(transaction=transaction)
        data = snap.to_dict() or {}
        spend = max(0.0, float(data.get("estimatedSpendUsd") or 0.0) - reservation.estimated_cost_usd)
        count = max(0, int(data.get("submissionCount") or 0) - reservation.submission_count)
        transaction.set(ref, {
            "estimatedSpendUsd": round(spend, 4),
            "submissionCount": count,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }, merge=True)

    try:
        _tx(db.transaction())
    except Exception as exc:
        print("[Runway Cost Guard Rollback Error]", repr(exc), flush=True)