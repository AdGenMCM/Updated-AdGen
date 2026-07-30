from __future__ import annotations

from typing import Any

from firebase_admin import firestore

from integrations.google_ads.store import (
    get_connection as get_google_connection,
    list_daily_campaign_performance as list_google_daily,
)
from integrations.meta_ads.store import (
    get_connection as get_meta_connection,
    list_daily_campaign_performance as list_meta_daily,
)
from performance_intelligence.store import (
    get_summary as get_learning_summary,
)

from .metrics import aggregate, derive


def _first_value(
    row: dict[str, Any],
    *keys: str,
) -> Any:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def _campaign(
    row: dict[str, Any],
    provider: str,
    label: str,
) -> dict[str, Any]:
    return derive(
        {
            "provider": provider,
            "providerLabel": label,
            "campaignId": str(
                _first_value(
                    row,
                    "id",
                    "campaignId",
                    "campaign_id",
                )
                or ""
            ),
            "campaignName": (
                _first_value(
                    row,
                    "name",
                    "campaignName",
                    "campaign_name",
                )
                or "Untitled campaign"
            ),
            "status": (
                _first_value(
                    row,
                    "status",
                    "effectiveStatus",
                    "effective_status",
                )
                or "UNKNOWN"
            ),
            "impressions": row.get("impressions"),
            "clicks": row.get("clicks"),
            "spend": row.get("spend"),
            "conversions": row.get("conversions"),
            "conversionValue": _first_value(
                row,
                "conversionValue",
                "conversion_value",
                "revenue",
            ),
            "date": _first_value(
                row,
                "date",
                "reportDate",
                "date_start",
                "performanceDate",
            ),
            "adGroupId": _first_value(
                row,
                "adGroupId",
                "ad_group_id",
                "adSetId",
                "adsetId",
                "adset_id",
            ),
            "adGroupName": _first_value(
                row,
                "adGroupName",
                "ad_group_name",
                "adSetName",
                "adsetName",
                "adset_name",
            ),
            "creativeId": _first_value(
                row,
                "creativeId",
                "creative_id",
                "adId",
                "ad_id",
            ),
            "creativeName": _first_value(
                row,
                "creativeName",
                "creative_name",
                "adName",
                "ad_name",
                "title",
            ),
            "device": _first_value(
                row,
                "device",
                "deviceName",
                "device_type",
            ),
            "country": _first_value(
                row,
                "country",
                "countryCode",
                "country_code",
            ),
            "placement": _first_value(
                row,
                "placement",
                "publisherPlatform",
                "publisher_platform",
                "platformPosition",
                "platform_position",
            ),
        }
    )


def _provider(
    connection: dict[str, Any],
    provider: str,
    label: str,
    daily_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    rows = [
        _campaign(row, provider, label)
        for row in connection.get("campaigns") or []
    ]

    normalized_daily = [
        _campaign(row, provider, label)
        for row in (daily_rows or [])
    ]

    account_id = (
        connection.get("selectedCustomerId")
        if provider == "google_ads"
        else connection.get("selectedAdAccountId")
    )

    account_name = (
        connection.get("selectedCustomerName")
        if provider == "google_ads"
        else connection.get("selectedAdAccountName")
    )

    return {
        "provider": provider,
        "connected": connection.get("status") == "connected",
        "selected": bool(account_id),
        "accountId": account_id,
        "accountName": account_name,
        "lastSyncedAt": connection.get("lastSyncAt"),
        "dateRange": (
            connection.get("lastSyncDateRange")
            or "Last synced range"
        ),
        "campaignCount": len(rows),
        "count": len(rows),
        "dailyRowCount": len(normalized_daily),
        "totals": aggregate(rows),
        "summary": aggregate(rows),
        "campaigns": rows,
        "dailyCampaignPerformance": normalized_daily,
    }


def _library(uid: str) -> dict[str, Any]:
    db = firestore.client()
    rows: list[dict[str, Any]] = []

    for collection_name, kind in (
        ("image_jobs", "Image"),
        ("video_jobs", "Video"),
    ):
        query = (
            db.collection(collection_name)
            .where("uid", "==", uid)
        )

        for snap in query.stream():
            raw = snap.to_dict() or {}
            performance = raw.get("performance") or {}

            has_performance = any(
                performance.get(key) not in (None, "")
                for key in (
                    "impressions",
                    "clicks",
                    "spend",
                    "conversions",
                    "revenue",
                    "conversion_value",
                    "roas",
                    "ctr",
                )
            )

            if (
                not has_performance
                and not performance.get("marked_successful")
            ):
                continue

            rows.append(
                derive(
                    {
                        "provider": "library_performance",
                        "providerLabel": "Library Performance",
                        "creativeId": snap.id,
                        "creativeName": (
                            raw.get("productName")
                            or raw.get("title")
                            or f"{kind} creative"
                        ),
                        "creativeType": kind,
                        "campaignName": (
                            performance.get("campaign_name")
                            or performance.get("campaignName")
                            or "Library Performance"
                        ),
                        "platform": (
                            performance.get("platform")
                            or raw.get("platform")
                            or "Manual"
                        ),
                        "status": (
                            "Winner"
                            if performance.get("marked_successful")
                            else "Tracked"
                        ),
                        "notes": performance.get("notes") or "",
                        "impressions": performance.get("impressions"),
                        "clicks": performance.get("clicks"),
                        "spend": performance.get("spend"),
                        "conversions": performance.get("conversions"),
                        "conversionValue": (
                            performance.get("revenue")
                            or performance.get("conversion_value")
                        ),
                        "performanceDate": (
                            performance.get("date")
                            or performance.get("performance_date")
                            or raw.get("updatedAt")
                            or raw.get("createdAt")
                        ),
                        "adGroupName": (
                            performance.get("ad_group_name")
                            or performance.get("adGroupName")
                            or performance.get("ad_set_name")
                            or performance.get("adSetName")
                        ),
                        "device": performance.get("device"),
                        "country": performance.get("country"),
                        "placement": performance.get("placement"),
                    }
                )
            )

    totals = aggregate(rows)

    return {
        "provider": "library_performance",
        "connected": True,
        "selected": bool(rows),
        "accountName": "ADGen Library",
        "lastSyncedAt": None,
        "creativeCount": len(rows),
        "count": len(rows),
        "totals": totals,
        "summary": totals,
        "creatives": rows,
    }


def reporting_snapshot(uid: str) -> dict[str, Any]:
    learning = get_learning_summary(uid) or {}
    google_connection = get_google_connection(uid) or {}
    meta_connection = get_meta_connection(uid) or {}

    google_daily = list_google_daily(
        uid,
        account_id=google_connection.get("selectedCustomerId"),
    )
    meta_daily = list_meta_daily(
        uid,
        account_id=meta_connection.get("selectedAdAccountId"),
    )

    return {
        "googleAds": _provider(
            google_connection,
            "google_ads",
            "Google Ads",
            google_daily,
        ),
        "metaAds": _provider(
            meta_connection,
            "meta_ads",
            "Meta Ads",
            meta_daily,
        ),
        "libraryPerformance": _library(uid),
        "learning": {
            "confidence": learning.get("confidence") or 0,
            "creativeAssetCount": (
                learning.get("creativeAssetCount") or 0
            ),
            "independentResultCount": (
                learning.get("independentResultCount") or 0
            ),
            "qualifiedIndependentResultCount": (
                learning.get("qualifiedCount") or 0
            ),
            "positiveIndependentResultCount": (
                learning.get("positiveCount") or 0
            ),
            "updatedAt": learning.get("updatedAt"),
        },
    }
