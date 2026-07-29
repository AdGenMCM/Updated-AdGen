from typing import Any

from integrations.meta_ads.store import (
    get_connection,
    list_creative_sync,
)

from ..extractors import (
    analyze_copy,
    analyze_image,
    analyze_video_metadata,
)
from ..models import CreativeFeatures, PerformanceEvidence
from ..qualification import qualify_evidence
from ..store import (
    get_thresholds,
    upsert_evidence,
    stable_creative_id,
)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _integer(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _kind(item: dict[str, Any]) -> str:
    media_type = str(item.get("mediaType") or "").lower()

    if media_type == "image":
        return "image"
    if media_type == "video":
        return "video"
    if media_type == "text":
        return "copy"

    has_media = bool(
        item.get("imageUrl")
        or item.get("thumbnailUrl")
        or item.get("videoId")
    )
    has_copy = bool(
        item.get("headline")
        or item.get("primaryText")
        or item.get("description")
        or item.get("ctaType")
    )

    if has_media and has_copy:
        return "mixed"
    if has_media:
        return "image"
    if has_copy:
        return "copy"
    return "mixed"


def meta_creative_to_evidence(
    *,
    uid: str,
    ad_account_id: str,
    item: dict[str, Any],
    analyze_media: bool,
) -> PerformanceEvidence:
    kind = _kind(item)
    headline = item.get("headline")
    body = item.get("primaryText") or item.get("description")
    cta = item.get("ctaType")

    features = CreativeFeatures(
        copy=analyze_copy(
            headline=headline,
            body=body,
            cta=cta,
        ),
        source_metadata={
            "adId": item.get("adId"),
            "adName": item.get("adName"),
            "adSetId": item.get("adSetId"),
            "adSetName": item.get("adSetName"),
            "creativeId": item.get("creativeId"),
            "creativeName": item.get("creativeName"),
            "mediaType": item.get("mediaType"),
            "destinationUrl": item.get("destinationUrl"),
            "effectiveStatus": item.get("effectiveStatus"),
        },
    )

    image_url = item.get("imageUrl") or item.get("thumbnailUrl")
    if kind in {"image", "mixed"} and image_url and analyze_media:
        try:
            features.image = analyze_image(image_url)
        except Exception as exc:
            features.image = {
                "analysis_status": "failed",
                "analysis_error": str(exc)[:250],
            }

    if kind in {"video", "mixed"} and item.get("videoId"):
        features.video = analyze_video_metadata(
            title=(
                item.get("headline")
                or item.get("creativeName")
                or item.get("adName")
            ),
            source="meta_ads",
        )
        features.video["meta_video_id"] = item.get("videoId")

    ad_id = str(item.get("adId") or "")
    creative_id = str(item.get("creativeId") or "")
    external_asset_id = creative_id or ad_id or "unknown"
    campaign_id = str(item.get("campaignId") or "")

    evidence = PerformanceEvidence(
        source="meta_ads",
        source_account_id=ad_account_id,
        campaign_id=campaign_id or None,
        campaign_name=item.get("campaignName"),
        ad_group_id=str(item.get("adSetId") or "") or None,
        external_asset_id=external_asset_id,
        creative_id=stable_creative_id(
            "meta_ads",
            ad_account_id,
            campaign_id,
            ad_id,
            external_asset_id,
        ),
        deployment_id=ad_id or None,
        performance_unit_id="meta_ads:" + ":".join(filter(None, [ad_account_id, campaign_id, str(item.get("adSetId") or ""), ad_id or creative_id])),
        kind=kind,
        asset_role=(
            item.get("mediaType")
            or item.get("ctaType")
            or "META_AD"
        ),
        impressions=_integer(item.get("impressions")),
        clicks=_integer(item.get("clicks")),
        spend=_num(item.get("spend")),
        conversions=_num(item.get("conversions")),
        revenue=_num(
            item.get("conversionValue")
            or item.get("revenue")
        ),
        ctr_percent=(
            _num(item.get("ctr"))
            if item.get("ctr") is not None
            else None
        ),
        cpc=(
            _num(item.get("cpc"))
            if item.get("cpc") is not None
            else None
        ),
        cpa=(
            _num(item.get("cpa"))
            if item.get("cpa") is not None
            else None
        ),
        cpm=(
            _num(item.get("cpm"))
            if item.get("cpm") is not None
            else None
        ),
        roas=(
            _num(item.get("roas"))
            if item.get("roas") is not None
            else None
        ),
        attribution_confidence=0.9,
        features=features,
        raw_metadata={
            "metaAdId": ad_id or None,
            "metaAdSetId": item.get("adSetId"),
            "metaCreativeId": creative_id or None,
            "metaMediaType": item.get("mediaType"),
            "metaStatus": item.get("status"),
            "metaEffectiveStatus": item.get("effectiveStatus"),
            "previewUrlUsedForAnalysis": bool(
                image_url and analyze_media
            ),
        },
    )

    return qualify_evidence(
        evidence,
        get_thresholds(uid),
    )


def ingest_meta_ads(
    *,
    uid: str,
    date_range: str = "LAST_30_DAYS",
    start_date: str | None = None,
    end_date: str | None = None,
    analyze_media: bool = True,
) -> dict[str, Any]:
    connection = get_connection(uid) or {}
    ad_account_id = connection.get("selectedAdAccountId")

    if not ad_account_id:
        return {
            "imported": 0,
            "skipped": 0,
            "failures": [],
            "reason": "meta_ads_account_not_selected",
        }

    synced_range = str(
        connection.get("lastCreativeSyncDateRange") or ""
    ).upper()
    requested_range = str(
        date_range or "LAST_30_DAYS"
    ).upper()

    # Performance Intelligence ingests the latest Meta creative snapshot.
    # The Meta panel owns provider synchronization so rebuilding learning
    # never unexpectedly makes a second external API request.
    creatives = list_creative_sync(uid, limit=1000)

    imported = 0
    added = 0
    updated = 0
    unchanged = 0
    skipped = 0
    failures: list[dict[str, Any]] = []

    for item in creatives:
        if not item.get("adId") and not item.get("creativeId"):
            skipped += 1
            continue

        try:
            evidence = meta_creative_to_evidence(
                uid=uid,
                ad_account_id=ad_account_id,
                item=item,
                analyze_media=analyze_media,
            )
            _evidence_id, change = upsert_evidence(uid, evidence)
            if change == "added":
                added += 1
            elif change == "updated":
                updated += 1
            else:
                unchanged += 1
            imported += 1
        except Exception as exc:
            failures.append(
                {
                    "adId": item.get("adId"),
                    "creativeId": item.get("creativeId"),
                    "campaignId": item.get("campaignId"),
                    "error": str(exc)[:250],
                }
            )

    return {
        "imported": imported,
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "skipped": skipped,
        "failures": failures[:25],
        "adAccountId": ad_account_id,
        "requestedDateRange": requested_range,
        "syncedDateRange": synced_range or None,
        "snapshotDateRangeMatches": (
            not synced_range or synced_range == requested_range
        ),
        "lastCreativeSyncAt": connection.get(
            "lastCreativeSyncAt"
        ),
    }
