from __future__ import annotations

from typing import Any, Dict, List

from .feature_catalog import feature_available
from .recommendation_catalog import get_recommendation


def _count(profile: Dict[str, Any], key: str) -> int:
    try:
        return int((profile.get("counters") or {}).get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


def _attempted(profile: Dict[str, Any], feature_key: str) -> bool:
    attempts = profile.get("featureAccessAttempts") or {}
    return int(attempts.get(feature_key, 0) or 0) > 0


def _attempted_any(profile: Dict[str, Any], *feature_keys: str) -> bool:
    return any(_attempted(profile, key) for key in feature_keys)


def _with_confidence(
    recommendation: Dict[str, Any],
    confidence: float,
) -> Dict[str, Any]:
    return {
        **recommendation,
        "confidence": round(
            max(0.0, min(1.0, float(confidence))),
            2,
        ),
    }


def _candidate_recommendations(
    profile: Dict[str, Any],
) -> List[Dict[str, Any]]:
    tier = profile.get("tier") or "free"
    commercial_state = profile.get("commercialState") or "free"

    creative_count = _count(profile, "creativeGenerated")
    video_count = _count(profile, "videoGenerated")
    optimizer_count = _count(profile, "optimizerCompleted")
    studio_count = _count(profile, "studioProjectsSaved")
    reporting_views = _count(profile, "reportingViews")

    google_connected = bool(profile.get("googleAdsConnected"))
    meta_connected = bool(profile.get("metaAdsConnected"))

    # These optional profile flags are forward-compatible. They are only used
    # when a current or future event/rebuild process records the signal.
    performance_intelligence_used = bool(
        profile.get("performanceIntelligenceUsed")
    )
    creative_dna_viewed = bool(profile.get("creativeDnaViewed"))

    candidates: List[Dict[str, Any]] = []

    if commercial_state == "payment_attention":
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "resolve_payment",
                    reason="The user's subscription payment is past due.",
                ),
                1.0,
            )
        )
        return candidates

    if commercial_state == "canceled":
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "reactivate_subscription",
                    reason="The user's paid subscription is canceled.",
                ),
                1.0,
            )
        )
        return candidates

    if (
        feature_available(tier, "image_generation")
        and creative_count == 0
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "create_first_creative",
                    reason="The user has not generated a creative yet.",
                ),
                1.0,
            )
        )

    if (
        feature_available(tier, "image_generation")
        and creative_count == 1
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "create_second_creative",
                    reason="The user has generated only one creative.",
                ),
                0.98,
            )
        )

    if (
        feature_available(tier, "brand_kit")
        and not bool(profile.get("brandKitCompleted"))
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "complete_brand_kit",
                    reason="Brand Kit is available but not completed.",
                ),
                0.95,
            )
        )

    if (
        feature_available(tier, "creative_studio")
        and studio_count == 0
        and creative_count > 0
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "try_creative_studio",
                    reason=(
                        "Creative Studio is available, and the user has "
                        "creatives but has not saved a Studio project."
                    ),
                ),
                0.9,
            )
        )

    if (
        feature_available(tier, "video_generation")
        and video_count == 0
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "create_first_video",
                    reason=(
                        "Video generation is available but has not been used."
                    ),
                ),
                0.9,
            )
        )

    if (
        _attempted(profile, "video_generation")
        and not feature_available(tier, "video_generation")
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "upgrade_video",
                    reason=(
                        "The user attempted to access video generation "
                        "without access."
                    ),
                ),
                0.98,
            )
        )

    if (
        _attempted(profile, "optimizer")
        and not feature_available(tier, "optimizer")
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "upgrade_optimizer",
                    reason=(
                        "The user attempted to access the Optimizer "
                        "without access."
                    ),
                ),
                0.98,
            )
        )

    performance_attempted = _attempted_any(
        profile,
        "performance_tracking",
        "manual_performance_tracking",
        "google_ads",
        "meta_ads",
        "reporting",
        "unified_reporting",
        "performance_intelligence",
        "creative_dna",
    )

    if (
        performance_attempted
        and not feature_available(tier, "manual_performance_tracking")
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "upgrade_reporting",
                    reason=(
                        "The user attempted to access a paid performance "
                        "feature without access."
                    ),
                ),
                0.98,
            )
        )

    if (
        feature_available(tier, "google_ads")
        and not google_connected
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "connect_google_ads",
                    reason=(
                        "Google Ads integration is available but not connected."
                    ),
                ),
                0.88,
            )
        )

    if (
        feature_available(tier, "meta_ads")
        and not meta_connected
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "connect_meta_ads",
                    reason=(
                        "Meta Ads integration is available but not connected."
                    ),
                ),
                0.86,
            )
        )

    if (
        feature_available(tier, "optimizer")
        and optimizer_count == 0
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "use_optimizer",
                    reason="The Optimizer is available but has not been used.",
                ),
                0.84,
            )
        )

    if (
        feature_available(tier, "unified_reporting")
        and reporting_views == 0
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "use_reporting",
                    reason="Unified Reporting is available but has not been viewed.",
                ),
                0.82,
            )
        )

    # These are only surfaced once the profile has enough context. They do not
    # appear merely because the user's plan includes the feature.
    if (
        feature_available(tier, "performance_intelligence")
        and (google_connected or meta_connected or reporting_views > 0)
        and creative_count >= 2
        and not performance_intelligence_used
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "use_performance_intelligence",
                    reason=(
                        "The user has creative and performance context but has "
                        "not yet used Performance Intelligence."
                    ),
                ),
                0.8,
            )
        )

    if (
        feature_available(tier, "creative_dna")
        and performance_intelligence_used
        and not creative_dna_viewed
    ):
        candidates.append(
            _with_confidence(
                get_recommendation(
                    "review_creative_dna",
                    reason=(
                        "Performance Intelligence has been used, but Creative "
                        "DNA has not been reviewed."
                    ),
                ),
                0.78,
            )
        )

    return candidates


def choose_next_best_action(
    profile: Dict[str, Any],
) -> Dict[str, Any] | None:
    candidates = _candidate_recommendations(profile)
    return candidates[0] if candidates else None


def build_recommendation_list(
    profile: Dict[str, Any],
) -> List[Dict[str, Any]]:
    return _candidate_recommendations(profile)[:4]
