from typing import Any

from integrations.google_ads.service import fetch_creative_assets
from integrations.google_ads.store import get_connection

from ..extractors import analyze_copy, analyze_image, analyze_video_metadata
from ..models import CreativeFeatures, PerformanceEvidence
from ..qualification import qualify_evidence
from ..store import get_thresholds, save_evidence, stable_creative_id


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _kind(asset: dict[str, Any]) -> str:
    asset_type = str(asset.get("assetType") or "").upper()
    field_type = str(asset.get("fieldType") or "").upper()

    if asset_type == "IMAGE":
        return "image"
    if asset_type == "YOUTUBE_VIDEO" or field_type in {
        "VIDEO",
        "YOUTUBE_VIDEO",
    }:
        return "video"
    if asset_type == "TEXT":
        return "copy"
    return "mixed"


def google_asset_to_evidence(
    *,
    uid: str,
    customer_id: str,
    asset: dict[str, Any],
    analyze_media: bool,
) -> PerformanceEvidence:
    kind = _kind(asset)
    text_value = (
        asset.get("text")
        or asset.get("name")
        or asset.get("youtubeTitle")
    )
    field_type = str(asset.get("fieldType") or "").upper()

    headline = text_value if "HEADLINE" in field_type else None
    body = (
        text_value
        if field_type in {
            "DESCRIPTION",
            "LONG_DESCRIPTION",
            "CALLOUT",
            "STRUCTURED_SNIPPET",
        }
        else None
    )
    cta = (
        text_value
        if field_type in {"CALL_TO_ACTION", "SITELINK"}
        else None
    )

    features = CreativeFeatures(
        copy=analyze_copy(
            headline=headline,
            body=body,
            cta=cta,
        ),
        source_metadata={
            "fieldType": asset.get("fieldType"),
            "source": asset.get("source"),
            "width": asset.get("width"),
            "height": asset.get("height"),
        },
    )

    if kind == "image" and asset.get("previewUrl") and analyze_media:
        try:
            features.image = analyze_image(asset["previewUrl"])
        except Exception as exc:
            features.image = {
                "analysis_status": "failed",
                "analysis_error": str(exc)[:250],
            }

    if kind == "video":
        features.video = analyze_video_metadata(
            title=asset.get("youtubeTitle") or asset.get("name"),
            source="google_ads",
        )
        if asset.get("youtubeVideoId"):
            features.video["youtube_video_id"] = asset[
                "youtubeVideoId"
            ]

    external_asset_id = str(
        asset.get("assetId")
        or asset.get("resourceName")
        or asset.get("text")
        or "unknown"
    )
    campaign_id = str(asset.get("campaignId") or "")

    evidence = PerformanceEvidence(
        source="google_ads",
        source_account_id=customer_id,
        campaign_id=campaign_id or None,
        campaign_name=asset.get("campaignName"),
        external_asset_id=external_asset_id,
        creative_id=stable_creative_id(
            "google_ads",
            customer_id,
            campaign_id,
            external_asset_id,
        ),
        kind=kind,
        asset_role=asset.get("fieldType") or asset.get("assetType"),
        impressions=int(_num(asset.get("impressions"))),
        clicks=int(_num(asset.get("clicks"))),
        spend=_num(asset.get("spend")),
        conversions=_num(asset.get("conversions")),
        revenue=_num(
            asset.get("conversionValue")
            or asset.get("revenue")
        ),
        ctr_percent=(
            _num(asset.get("ctr"))
            if asset.get("ctr") is not None
            else None
        ),
        cpc=(
            _num(asset.get("averageCpc") or asset.get("cpc"))
            if (
                asset.get("averageCpc") is not None
                or asset.get("cpc") is not None
            )
            else None
        ),
        cpa=(
            _num(asset.get("cpa"))
            if asset.get("cpa") is not None
            else None
        ),
        roas=(
            _num(asset.get("roas"))
            if asset.get("roas") is not None
            else None
        ),
        platform_label=asset.get("performanceLabel"),
        attribution_confidence=0.85,
        features=features,
        raw_metadata={
            "googleAssetType": asset.get("assetType"),
            "googleFieldType": asset.get("fieldType"),
            "googleSource": asset.get("source"),
            "previewUrlUsedForAnalysis": bool(
                asset.get("previewUrl")
            ),
        },
    )

    return qualify_evidence(
        evidence,
        get_thresholds(uid),
    )


def ingest_google_ads(
    *,
    uid: str,
    date_range: str = "LAST_30_DAYS",
    analyze_media: bool = True,
) -> dict[str, Any]:
    connection = get_connection(uid) or {}
    customer_id = connection.get("selectedCustomerId")
    if not customer_id:
        return {
            "imported": 0,
            "skipped": 0,
            "failures": [],
            "reason": "google_ads_customer_not_selected",
        }

    assets = fetch_creative_assets(
        uid,
        customer_id=customer_id,
        login_customer_id=connection.get("loginCustomerId"),
        date_range=date_range,
    )

    imported = 0
    skipped = 0
    failures = []

    for asset in assets:
        try:
            evidence = google_asset_to_evidence(
                uid=uid,
                customer_id=customer_id,
                asset=asset,
                analyze_media=analyze_media,
            )
            save_evidence(uid, evidence)
            imported += 1
        except Exception as exc:
            failures.append(
                {
                    "assetId": asset.get("assetId"),
                    "campaignId": asset.get("campaignId"),
                    "error": str(exc)[:250],
                }
            )

    return {
        "imported": imported,
        "skipped": skipped,
        "failures": failures[:25],
        "customerId": customer_id,
        "dateRange": date_range,
    }
