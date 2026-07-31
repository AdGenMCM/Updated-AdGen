from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class LifecycleSettings:
    enabled: bool
    activation_enabled: bool
    usage_enabled: bool
    upgrade_enabled: bool
    reengagement_enabled: bool
    disabled_notice_enabled: bool
    global_cooldown_hours: int
    weekly_cap: int
    daily_cap: int
    scheduler_secret: str
    scan_limit: int
    campaigns: Dict[str, bool]


def get_lifecycle_settings() -> LifecycleSettings:
    campaign_defaults = {
        "first_image": True,
        "brand_kit": True,
        "first_video": True,
        "google_ads": True,
        "meta_ads": True,
        "performance_intelligence": True,
        "optimizer_intro": True,
        "image_usage": True,
        "video_usage": True,
        "optimizer_usage": True,
        "free_upgrade": True,
        "trial_upgrade": True,
        "starter_upgrade": True,
        "pro_upgrade": True,
        "inactive_7_days": True,
        "inactive_21_days": True,
        "inactive_45_days": True,
        "inactive_90_days": True,
    }
    campaigns = {
        key: _env_bool(f"EMAIL_CAMPAIGN_{key.upper()}", default)
        for key, default in campaign_defaults.items()
    }
    return LifecycleSettings(
        enabled=_env_bool("EMAIL_LIFECYCLE_ENABLED", True),
        activation_enabled=_env_bool("EMAIL_ACTIVATION_ENABLED", True),
        usage_enabled=_env_bool("EMAIL_USAGE_ENABLED", True),
        upgrade_enabled=_env_bool("EMAIL_UPGRADE_ENABLED", True),
        reengagement_enabled=_env_bool("EMAIL_REENGAGEMENT_ENABLED", True),
        disabled_notice_enabled=_env_bool("EMAIL_DISABLED_NOTICE_ENABLED", True),
        global_cooldown_hours=max(24, _env_int("EMAIL_GLOBAL_COOLDOWN_HOURS", 72)),
        weekly_cap=max(1, _env_int("EMAIL_WEEKLY_CAP", 3)),
        daily_cap=max(1, _env_int("EMAIL_DAILY_CAP", 1)),
        scheduler_secret=(os.getenv("EMAIL_SCHEDULER_SECRET") or "").strip(),
        scan_limit=max(1, min(_env_int("EMAIL_LIFECYCLE_SCAN_LIMIT", 500), 5000)),
        campaigns=campaigns,
    )
