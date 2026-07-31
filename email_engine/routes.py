from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from firebase_admin import auth as firebase_auth

from auth_helpers import get_db, require_user
from customer_intelligence.event_service import track_event

from .config import get_email_config
from .email_service import build_repeat_test_key, send_welcome_email
from .models import (
    CompleteOnboardingRequest,
    CompleteOnboardingResponse,
    EmailSendResponse,
    EmailStatusResponse,
    TestWelcomeEmailRequest,
)
from .resend_client import EmailConfigurationError, EmailProviderError


router = APIRouter(prefix="/email-engine", tags=["email-engine"])

# This endpoint is only for accounts that were just created. Firebase Auth's
# authoritative creation timestamp prevents existing users from triggering a
# retroactive welcome email by editing a Firestore profile.
MAX_NEW_ACCOUNT_AGE_SECONDS = 30 * 60
ALLOWED_AUTH_PROVIDERS = {"email", "google"}


def _display_name(user_data: dict, claims: dict) -> Optional[str]:
    first_name = str(user_data.get("firstName") or "").strip()
    last_name = str(user_data.get("lastName") or "").strip()
    full_name = " ".join(part for part in (first_name, last_name) if part).strip()

    return (
        full_name
        or str(user_data.get("displayName") or "").strip()
        or str(claims.get("name") or "").strip()
        or str(claims.get("display_name") or "").strip()
        or None
    )


def _require_recent_firebase_account(uid: str) -> None:
    try:
        auth_user = firebase_auth.get_user(uid)
        created_ms = getattr(auth_user.user_metadata, "creation_timestamp", None)
        if not created_ms:
            raise HTTPException(
                status_code=409,
                detail="The account creation time could not be verified.",
            )

        age_seconds = time.time() - (float(created_ms) / 1000.0)
        if age_seconds < -60 or age_seconds > MAX_NEW_ACCOUNT_AGE_SECONDS:
            raise HTTPException(
                status_code=409,
                detail="This onboarding endpoint is available only for newly created accounts.",
            )
    except HTTPException:
        raise
    except Exception as error:
        print("[EMAIL ENGINE] Firebase account age check failed:", repr(error), flush=True)
        raise HTTPException(
            status_code=500,
            detail="The new account could not be verified.",
        ) from error


def _record_welcome_event(
    *,
    db,
    uid: str,
    auth_provider: str,
    delivery_result: dict,
) -> bool:
    event_result = track_event(
        db,
        uid,
        "email.sent.welcome",
        event_id=f"email:welcome:{uid}:sent",
        metadata={
            "template": "welcome",
            "category": "transactional",
            "authProvider": auth_provider,
            "deliveryId": delivery_result.get("deliveryId"),
            "providerMessageId": delivery_result.get("providerMessageId"),
        },
        source="email_engine",
    )
    return bool(event_result.get("ok"))


@router.get("/status", response_model=EmailStatusResponse)
def email_engine_status(authorization: str | None = Header(default=None)):
    require_user(authorization)
    config = get_email_config()
    return EmailStatusResponse(
        configured=config.configured,
        sender=config.from_email if config.configured else None,
        appUrl=config.app_url,
    )


@router.post(
    "/onboarding/complete",
    response_model=CompleteOnboardingResponse,
)
def complete_new_user_onboarding(
    payload: CompleteOnboardingRequest,
    authorization: str | None = Header(default=None),
):
    uid, token_email, claims = require_user(authorization)

    if not token_email:
        raise HTTPException(
            status_code=400,
            detail="The authenticated Firebase account does not have an email address.",
        )

    auth_provider = str(payload.authProvider or "email").strip().lower()
    if auth_provider not in ALLOWED_AUTH_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported authentication provider.")

    # Google accounts complete onboarding immediately after account creation,
    # so retain the new-account age guard for that provider. Email/password
    # accounts may be verified later and are instead protected by a Firestore
    # pending marker plus Firebase's verified-email claim.
    if auth_provider == "google":
        _require_recent_firebase_account(uid)

    if auth_provider == "email" and not bool(claims.get("email_verified")):
        raise HTTPException(
            status_code=403,
            detail="Verify your email address before onboarding is completed.",
        )

    db = get_db()
    user_snapshot = db.collection("users").document(uid).get()
    if not user_snapshot.exists:
        raise HTTPException(
            status_code=409,
            detail="The user profile must exist before onboarding can be completed.",
        )

    user_data = user_snapshot.to_dict() or {}
    onboarding_data = user_data.get("onboarding") or {}

    if auth_provider == "email":
        welcome_pending = bool(onboarding_data.get("welcomeEmailPending"))
        welcome_completed = bool(onboarding_data.get("welcomeEmailCompleted"))

        # Once completed, return without touching the provider. This second
        # guard makes repeated logins harmless even if the frontend calls the
        # endpoint again or the delivery history is unavailable.
        if welcome_completed:
            return CompleteOnboardingResponse(
                ok=True,
                sent=True,
                skipped=True,
                reason="already_completed",
                deliveryId=onboarding_data.get("welcomeEmailDeliveryId"),
                providerMessageId=None,
                intelligenceEventRecorded=False,
            )

        # Existing accounts created before this verified-welcome flow do not
        # have the pending marker and must not receive a retroactive welcome.
        if not welcome_pending:
            raise HTTPException(
                status_code=409,
                detail="No verified-email welcome is pending for this account.",
            )

    profile_email = str(user_data.get("email") or "").strip().lower()
    verified_email = str(token_email).strip().lower()
    if profile_email and profile_email != verified_email:
        raise HTTPException(
            status_code=409,
            detail="The authenticated email does not match the new user profile.",
        )

    try:
        result = send_welcome_email(
            uid=uid,
            recipient=token_email,
            display_name=_display_name(user_data, claims),
            idempotency_key=f"welcome:{uid}",
            test_mode=False,
        )

        event_recorded = False
        # A duplicate with sent=True means delivery succeeded earlier but the
        # caller may be retrying after a network interruption. The stable event
        # ID safely repairs any missing Customer Intelligence event.
        if result.get("sent"):
            event_recorded = _record_welcome_event(
                db=db,
                uid=uid,
                auth_provider=auth_provider,
                delivery_result=result,
            )

        db.collection("users").document(uid).set(
            {
                "onboarding": {
                    "welcomeEmailPending": not bool(result.get("sent")),
                    "welcomeEmailCompleted": bool(result.get("sent")),
                    "welcomeEmailDeliveryId": result.get("deliveryId"),
                    "welcomeEmailUpdatedAt": int(time.time()),
                }
            },
            merge=True,
        )

        return CompleteOnboardingResponse(
            ok=True,
            intelligenceEventRecorded=event_recorded,
            **result,
        )

    except EmailConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except EmailProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except HTTPException:
        raise
    except Exception as error:
        print("[EMAIL ENGINE] Welcome onboarding failed:", repr(error), flush=True)
        raise HTTPException(
            status_code=500,
            detail="New-user email onboarding could not be completed.",
        ) from error


@router.post("/test/welcome", response_model=EmailSendResponse)
def send_test_welcome_email(
    payload: TestWelcomeEmailRequest,
    authorization: str | None = Header(default=None),
):
    uid, email, claims = require_user(authorization)

    if not email:
        raise HTTPException(
            status_code=400,
            detail="The authenticated Firebase account does not have an email address.",
        )

    display_name = claims.get("name") or claims.get("display_name")
    idempotency_key = (
        build_repeat_test_key(uid)
        if payload.allowRepeat
        else f"welcome_test:{uid}"
    )

    try:
        result = send_welcome_email(
            uid=uid,
            recipient=email,
            display_name=display_name,
            idempotency_key=idempotency_key,
            test_mode=True,
        )
        return EmailSendResponse(**result)
    except EmailConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except EmailProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except Exception as error:
        print("[EMAIL ENGINE] Test welcome send failed:", repr(error), flush=True)
        raise HTTPException(
            status_code=500,
            detail="The test email could not be sent.",
        ) from error
