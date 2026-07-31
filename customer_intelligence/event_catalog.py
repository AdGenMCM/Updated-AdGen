from __future__ import annotations

from typing import Dict, FrozenSet


EVENTS: FrozenSet[str] = frozenset(
    {
        "user.created",
        "user.logged_in",
        "creative.generated",
        "video.generated",
        "optimizer.completed",
        "creative_studio.project_saved",
        "brand_kit.completed",
        "integration.google_ads_connected",
        "integration.meta_ads_connected",
        "reporting.viewed",
        "feature.access_attempted",
        "usage.limit_reached",
        "email.sent.welcome",
        "email.sent.lifecycle",
        "subscription.activated",
        "subscription.plan_changed",
        "subscription.upgraded",
        "subscription.canceled",
        "subscription.payment_failed",
        "subscription.payment_recovered",
    }
)


EVENT_ALIASES: Dict[str, str] = {
    "image.generated": "creative.generated",
    "subscription.updated": "subscription.plan_changed",
}


def normalize_event_name(event_name: str) -> str:
    normalized = str(event_name or "").strip().lower()
    return EVENT_ALIASES.get(normalized, normalized)


def validate_event_name(event_name: str) -> str:
    normalized = normalize_event_name(event_name)
    if normalized not in EVENTS:
        raise ValueError(f"Unsupported Customer Intelligence event: {event_name}")
    return normalized
