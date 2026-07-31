from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from firebase_admin import auth as firebase_auth
from google.cloud import firestore as gc_firestore

from auth_helpers import get_db
from plan_config import get_plan_config, has_feature, normalize_tier
from usage_caps import get_tier_and_status, peek_resource
from customer_intelligence.event_service import track_event

from .config import get_email_config
from .email_service import EMAIL_DELIVERIES_COLLECTION, send_email_once, _first_name
from .lifecycle_config import get_lifecycle_settings
from .templates import (
    render_account_disabled_email,
    render_lifecycle_campaign_email,
)

SUCCESS = {"succeeded", "completed", "success"}


@dataclass(frozen=True)
class Candidate:
    key: str
    category: str
    title: str
    body: str
    cta_label: str
    path: str
    priority: int
    idempotency_suffix: str = "once"


def _unix(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp())
    if hasattr(value, "timestamp"):
        try:
            return int(value.timestamp())
        except Exception:
            return None
    return None


def _query_exists(collection: str, uid: str, *, succeeded: bool = False) -> bool:
    query = get_db().collection(collection).where("uid", "==", uid).limit(10)
    for snap in query.stream():
        data = snap.to_dict() or {}
        if not succeeded or str(data.get("status") or "").lower() in SUCCESS:
            return True
    return False


def _brand_kit_exists(uid: str) -> bool:
    return next(iter(get_db().collection("users").document(uid).collection("brand_kits").limit(1).stream()), None) is not None


def _connection_exists(collection: str, uid: str) -> bool:
    data = get_db().collection(collection).document(uid).get().to_dict() or {}
    return str(data.get("status") or "").lower() == "connected"


def _performance_profile_exists(uid: str) -> bool:
    for collection in ("performance_intelligence_profiles", "performance_profiles", "generation_profiles"):
        snap = get_db().collection(collection).document(uid).get()
        if snap.exists:
            return True
    return False


def _sent_docs(uid: str, since: int) -> list[dict]:
    docs = []
    query = get_db().collection(EMAIL_DELIVERIES_COLLECTION).where("uid", "==", uid)
    for snap in query.stream():
        data = snap.to_dict() or {}
        if data.get("category") != "lifecycle" or data.get("status") != "sent":
            continue
        sent_at = _unix(data.get("sentAt")) or _unix(data.get("createdAt")) or 0
        if sent_at >= since:
            docs.append({**data, "_sentAt": sent_at})
    return docs


def _can_send(uid: str, now: int) -> tuple[bool, str]:
    settings = get_lifecycle_settings()
    recent = _sent_docs(uid, now - 7 * 86400)
    if sum(1 for row in recent if row["_sentAt"] >= now - 86400) >= settings.daily_cap:
        return False, "daily_cap"
    if len(recent) >= settings.weekly_cap:
        return False, "weekly_cap"
    if recent and max(row["_sentAt"] for row in recent) > now - settings.global_cooldown_hours * 3600:
        return False, "global_cooldown"
    return True, "ok"


def _usage_candidate(uid: str, tier: str, user_doc: dict, resource: str, key: str, noun: str, path: str) -> Optional[Candidate]:
    state = peek_resource(get_db(), uid, tier, resource, user_doc)
    cap = int(state.get("cap") or 0)
    used = int(state.get("used") or 0)
    if cap <= 0:
        return None
    pct = (used / cap) * 100
    threshold = 100 if pct >= 100 else 90 if pct >= 90 else 70 if pct >= 70 else None
    if threshold is None:
        return None
    period = str(state.get("periodKey") or state.get("month") or "current")
    remaining = max(0, cap - used)
    title = f"You've used {threshold}% of your {noun} allowance" if threshold < 100 else f"You've reached your {noun} allowance"
    body = f"You've used {used} of {cap} {noun} for this period. You have {remaining} remaining. Review your plan before your next creative session."
    return Candidate(key, "usage", title, body, "View account usage", path, 95 + threshold, f"{period}:{threshold}")


def _last_sign_in(uid: str, fallback: int) -> int:
    try:
        user = firebase_auth.get_user(uid)
        value = getattr(user.user_metadata, "last_sign_in_timestamp", None)
        return int(float(value) / 1000) if value else fallback
    except Exception:
        return fallback


def evaluate_user(uid: str, user_doc: dict, *, now: Optional[int] = None) -> list[Candidate]:
    now = now or int(time.time())
    settings = get_lifecycle_settings()
    tier, _status = get_tier_and_status(user_doc)
    tier = normalize_tier(tier)
    plan = get_plan_config(tier)
    limits = plan.get("limits") or {}
    created = _unix(user_doc.get("createdAt")) or now
    age_days = max(0.0, (now - created) / 86400)
    image_exists = _query_exists("image_jobs", uid, succeeded=True)
    video_exists = _query_exists("video_jobs", uid, succeeded=True)
    candidates: list[Candidate] = []

    if settings.activation_enabled:
        if settings.campaigns["first_image"] and age_days >= 1 and not image_exists:
            remaining = int(limits.get("images") or 0)
            body = f"Your workspace is ready and you still have {remaining} image generation{'s' if remaining != 1 else ''} available. Create your first campaign-ready ad in a few minutes."
            candidates.append(Candidate("first_image", "activation", "Create your first ADGen image", body, "Create my first image", "/adgenerator", 100))
        if settings.campaigns["brand_kit"] and age_days >= 3 and int(limits.get("brand_kits") or 0) > 0 and not _brand_kit_exists(uid):
            candidates.append(Candidate("brand_kit", "activation", "Keep every creative on brand", "Set up your Brand Kit once, then apply your brand identity across future image and video generations.", "Create my Brand Kit", "/brand-kit", 85))
        if settings.campaigns["first_video"] and age_days >= 5 and has_feature(tier, "video_generation") and int(limits.get("video_credits") or 0) > 0 and not video_exists:
            candidates.append(Candidate("first_video", "activation", "Turn your creative into a video ad", "Your plan includes Video Ads. Animate a product image or generate a campaign-ready marketing video from your prompt.", "Create a video ad", "/video-ads", 80))
        if settings.campaigns["google_ads"] and age_days >= 7 and has_feature(tier, "performance_tracking") and not _connection_exists("google_ads_connections", uid):
            candidates.append(Candidate("google_ads", "activation", "Connect Google Ads to ADGen", "Bring campaign performance into ADGen so your creative intelligence can learn from real results.", "Connect Google Ads", "/insights", 75))
        if settings.campaigns["meta_ads"] and age_days >= 8 and has_feature(tier, "performance_tracking") and not _connection_exists("meta_ads_connections", uid):
            candidates.append(Candidate("meta_ads", "activation", "Connect Meta Ads to ADGen", "Sync Meta campaign performance and keep your creative insights together in one workspace.", "Connect Meta Ads", "/insights", 72))
        if settings.campaigns["performance_intelligence"] and age_days >= 10 and has_feature(tier, "advanced_insights") and (image_exists or video_exists) and not _performance_profile_exists(uid):
            candidates.append(Candidate("performance_intelligence", "activation", "Let ADGen learn from your winners", "Connect or enter performance data so Performance Intelligence can identify patterns and guide future generations.", "Open Performance Intelligence", "/insights", 70))
        if settings.campaigns["optimizer_intro"] and age_days >= 12 and has_feature(tier, "optimizer") and not _query_exists("optimizer_jobs", uid, succeeded=True):
            candidates.append(Candidate("optimizer_intro", "activation", "Improve an ad with the Optimizer", "Your plan includes Ad Performance Optimization. Analyze an existing creative and generate actionable improvements.", "Try the Optimizer", "/optimizer", 68))

    if settings.usage_enabled:
        for resource, key, noun, path in (
            ("images", "image_usage", "image generations", "/account"),
            ("video_credits", "video_usage", "video credits", "/account"),
            ("optimizer_runs", "optimizer_usage", "optimizer runs", "/account"),
        ):
            if settings.campaigns[key] and int(limits.get(resource) or 0) > 0:
                candidate = _usage_candidate(uid, tier, user_doc, resource, key, noun, path)
                if candidate:
                    candidates.append(candidate)

    if settings.upgrade_enabled and tier != "business_monthly":
        image_state = peek_resource(get_db(), uid, tier, "images", user_doc)
        cap, used = int(image_state.get("cap") or 0), int(image_state.get("used") or 0)
        pct = (used / cap * 100) if cap else 0
        upgrade_key = {"free": "free_upgrade", "trial_monthly": "trial_upgrade", "starter_monthly": "starter_upgrade", "pro_monthly": "pro_upgrade"}.get(tier)
        threshold = 100 if tier in {"free", "trial_monthly"} else 90
        if upgrade_key and settings.campaigns.get(upgrade_key, False) and pct >= threshold:
            period = str(image_state.get("periodKey") or "current")
            candidates.append(Candidate(upgrade_key, "upgrade", "Keep creating without interruption", "You're close to or at your current image allowance. Compare plans for more creative capacity and additional ADGen features.", "Compare plans", "/subscribe?upgrade=1", 130, f"{period}:{threshold}"))

    if settings.reengagement_enabled:
        last_seen = _last_sign_in(uid, created)
        inactive_days = max(0, int((now - last_seen) / 86400))
        for days in (90, 45, 21, 7):
            key = f"inactive_{days}_days"
            if inactive_days >= days and settings.campaigns.get(key, False):
                candidates.append(Candidate(key, "reengagement", "Your ADGen workspace is ready when you are", "Return to your creative workspace and continue building campaign-ready images, videos, and copy with the features included in your plan.", "Return to ADGen", "/dashboard", 20 + days, "once"))
                break

    return sorted(candidates, key=lambda item: item.priority, reverse=True)


def send_candidate(uid: str, recipient: str, display_name: str, tier: str, candidate: Candidate, *, bypass_cooldown: bool = False, test_mode: bool = False) -> dict:
    now = int(time.time())
    if not bypass_cooldown:
        allowed, reason = _can_send(uid, now)
        if not allowed:
            return {"sent": False, "skipped": True, "reason": reason, "campaign": candidate.key}
    config = get_email_config()
    subject, html = render_lifecycle_campaign_email(
        campaign_key=candidate.key,
        first_name=_first_name(display_name, recipient),
        title=candidate.title,
        body=candidate.body,
        cta_label=candidate.cta_label,
        cta_url=f"{config.app_url}{candidate.path}",
        tier=tier,
    )
    email_key = f"lifecycle:{candidate.key}:{candidate.idempotency_suffix}"
    if test_mode:
        email_key = f"test:{email_key}:{now}"
    result = send_email_once(uid=uid, recipient=recipient, email_key=email_key, category="test" if test_mode else "lifecycle", subject=subject, html=html, metadata={"campaign": candidate.key, "category": candidate.category, "plan": tier, "schemaVersion": 1, "reason": candidate.key, "testMode": test_mode})
    if result.get("sent") and not result.get("skipped") and not test_mode:
        try:
            track_event(get_db(), uid, "email.sent.lifecycle", event_id=f"email:{candidate.key}:{uid}:{candidate.idempotency_suffix}", metadata={"campaign": candidate.key, "category": candidate.category, "plan": tier, "deliveryId": result.get("deliveryId")}, source="email_engine")
        except Exception as error:
            print("[EMAIL LIFECYCLE] Event tracking failed:", repr(error), flush=True)
    return {**result, "campaign": candidate.key}



def send_account_disabled_notice(
    uid: str,
    recipient: str,
    display_name: str,
    *,
    test_mode: bool = False,
) -> dict:
    config = get_email_config()
    subject, html = render_account_disabled_email(
        first_name=_first_name(display_name, recipient),
        support_email=config.reply_to,
    )

    email_key = f"account_disabled:{uid}"
    category = "account_status"

    if test_mode:
        email_key = f"test:{email_key}:{int(time.time())}"
        category = "test"

    result = send_email_once(
        uid=uid,
        recipient=recipient,
        email_key=email_key,
        category=category,
        subject=subject,
        html=html,
        metadata={
            "campaign": "account_disabled",
            "category": "account_status",
            "schemaVersion": 1,
            "reason": "terms_violation",
            "testMode": test_mode,
        },
    )

    if result.get("sent") and not result.get("skipped") and not test_mode:
        try:
            track_event(
                get_db(),
                uid,
                "email.sent.account_disabled",
                event_id=f"email:account_disabled:{uid}",
                metadata={
                    "campaign": "account_disabled",
                    "category": "account_status",
                    "deliveryId": result.get("deliveryId"),
                },
                source="email_engine",
            )
        except Exception as error:
            print(
                "[EMAIL LIFECYCLE] Disabled-account event tracking failed:",
                repr(error),
                flush=True,
            )

    return {
        **result,
        "campaign": "account_disabled",
        "reason": result.get("reason") or "firebase_user_disabled",
    }


def process_user(
    uid: str,
    user_doc: dict,
    *,
    campaign_key: Optional[str] = None,
    bypass_cooldown: bool = False,
    test_mode: bool = False,
) -> dict:
    settings = get_lifecycle_settings()

    recipient = str(user_doc.get("email") or "").strip()
    auth_display_name = ""
    auth_user = None

    try:
        auth_user = firebase_auth.get_user(uid)
        if not recipient:
            recipient = str(auth_user.email or "").strip()
        auth_display_name = str(auth_user.display_name or "").strip()
    except Exception as error:
        print(
            f"[EMAIL LIFECYCLE] Firebase Auth lookup failed for {uid}: "
            f"{error!r}",
            flush=True,
        )

    firestore_display_name = " ".join(
        filter(
            None,
            [
                user_doc.get("firstName"),
                user_doc.get("lastName"),
            ],
        )
    ).strip()

    display_name = str(
        user_doc.get("displayName")
        or firestore_display_name
        or auth_display_name
    ).strip()

    if auth_user is not None and bool(auth_user.disabled):
        if not recipient:
            return {
                "sent": False,
                "skipped": True,
                "reason": "missing_email_disabled_account",
                "campaign": "account_disabled",
            }

        if not settings.disabled_notice_enabled and not test_mode:
            return {
                "sent": False,
                "skipped": True,
                "reason": "firebase_user_disabled",
                "campaign": "account_disabled",
            }

        return send_account_disabled_notice(
            uid,
            recipient,
            display_name,
            test_mode=test_mode,
        )

    if not settings.enabled and not test_mode:
        return {
            "sent": False,
            "skipped": True,
            "reason": "lifecycle_disabled",
        }

    if not recipient:
        return {
            "sent": False,
            "skipped": True,
            "reason": "missing_email",
        }

    candidates = evaluate_user(uid, user_doc)

    if campaign_key:
        candidates = [
            item
            for item in candidates
            if item.key == campaign_key
        ]

    if not candidates:
        return {
            "sent": False,
            "skipped": True,
            "reason": "no_eligible_campaign",
        }

    tier, _ = get_tier_and_status(user_doc)

    return send_candidate(
        uid,
        recipient,
        display_name,
        normalize_tier(tier),
        candidates[0],
        bypass_cooldown=bypass_cooldown,
        test_mode=test_mode,
    )

def run_lifecycle_batch(*, limit: Optional[int] = None) -> dict:
    settings = get_lifecycle_settings()
    scan_limit = min(limit or settings.scan_limit, settings.scan_limit)
    stats = {"scanned": 0, "sent": 0, "skipped": 0, "failed": 0, "results": []}
    for snap in get_db().collection("users").limit(scan_limit).stream():
        stats["scanned"] += 1
        try:
            result = process_user(snap.id, snap.to_dict() or {})
            stats["sent" if result.get("sent") and not result.get("skipped") else "skipped"] += 1
            if len(stats["results"]) < 50:
                stats["results"].append({"uid": snap.id, **result})
        except Exception as error:
            stats["failed"] += 1
            print(f"[EMAIL LIFECYCLE] User {snap.id} failed: {error!r}", flush=True)
    return stats
