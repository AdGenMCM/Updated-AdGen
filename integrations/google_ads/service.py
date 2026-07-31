from typing import Any
from datetime import date, datetime

import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

from .config import get_settings
from .store import get_connection


ADS_API_VERSION = "v22"


def _validated_iso_date(value: str | None, label: str) -> str:
    cleaned = str(value or "").strip()
    try:
        parsed = datetime.strptime(cleaned, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"{label} must use YYYY-MM-DD.") from exc
    if parsed > date.today():
        raise ValueError(f"{label} cannot be in the future.")
    return parsed.isoformat()


def _date_condition(
    date_range: str,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[str, str]:
    requested = str(date_range or "LAST_30_DAYS").strip().upper()
    allowed_presets = {
        "TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_14_DAYS",
        "LAST_30_DAYS", "LAST_90_DAYS", "THIS_MONTH", "LAST_MONTH",
    }
    if requested == "CUSTOM":
        since = _validated_iso_date(start_date, "Start date")
        until = _validated_iso_date(end_date, "End date")
        if since > until:
            raise ValueError("Start date must be on or before end date.")
        return f"segments.date BETWEEN '{since}' AND '{until}'", f"{since}:{until}"
    if requested == "MAXIMUM":
        return f"segments.date BETWEEN '2000-01-01' AND '{date.today().isoformat()}'", "MAXIMUM"
    if requested not in allowed_presets:
        raise ValueError("Unsupported Google Ads date range.")
    return f"segments.date DURING {requested}", requested


def _clean_customer_id(value: str | None) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _credentials_for(uid: str) -> Credentials:
    settings = get_settings()
    connection = get_connection(uid, include_refresh_token=True)
    if not connection:
        raise RuntimeError("Google Ads is not connected.")

    credentials = Credentials(
        token=None,
        refresh_token=connection.get("refreshToken"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.client_id,
        client_secret=settings.client_secret,
        scopes=["https://www.googleapis.com/auth/adwords"],
    )
    credentials.refresh(Request())
    return credentials


def _headers(
    access_token: str,
    *,
    login_customer_id: str | None = None,
) -> dict[str, str]:
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": settings.developer_token,
        "Content-Type": "application/json",
    }

    clean_login = _clean_customer_id(login_customer_id)
    if clean_login:
        headers["login-customer-id"] = clean_login

    return headers


def _search(
    *,
    customer_id: str,
    access_token: str,
    query: str,
    login_customer_id: str | None = None,
    timeout: int = 45,
) -> list[dict[str, Any]]:
    clean_customer = _clean_customer_id(customer_id)
    if not clean_customer:
        raise RuntimeError("Invalid Google Ads customer ID.")

    response = requests.post(
        (
            f"https://googleads.googleapis.com/{ADS_API_VERSION}/"
            f"customers/{clean_customer}/googleAds:searchStream"
        ),
        headers=_headers(
            access_token,
            login_customer_id=login_customer_id,
        ),
        json={"query": query},
        timeout=timeout,
    )
    response.raise_for_status()

    rows: list[dict[str, Any]] = []
    for batch in response.json() or []:
        rows.extend(batch.get("results") or [])
    return rows


def _direct_customer_details(
    *,
    customer_id: str,
    access_token: str,
) -> dict[str, Any]:
    query = """
        SELECT
          customer.id,
          customer.descriptive_name,
          customer.manager,
          customer.currency_code,
          customer.time_zone
        FROM customer
        LIMIT 1
    """.strip()

    rows = _search(
        customer_id=customer_id,
        access_token=access_token,
        query=query,
    )
    customer = (rows[0].get("customer") or {}) if rows else {}

    clean_id = _clean_customer_id(customer.get("id") or customer_id)
    return {
        "customerId": clean_id,
        "name": customer.get("descriptiveName")
        or f"Google Ads {clean_id}",
        "manager": bool(customer.get("manager")),
        "currencyCode": customer.get("currencyCode"),
        "timeZone": customer.get("timeZone"),
        "loginCustomerId": None,
        "level": 0,
    }


def _manager_children(
    *,
    manager_customer_id: str,
    access_token: str,
    root_login_customer_id: str,
) -> list[dict[str, Any]]:
    query = """
        SELECT
          customer_client.id,
          customer_client.descriptive_name,
          customer_client.manager,
          customer_client.level,
          customer_client.status,
          customer_client.currency_code,
          customer_client.time_zone
        FROM customer_client
        WHERE customer_client.level <= 1
    """.strip()

    rows = _search(
        customer_id=manager_customer_id,
        access_token=access_token,
        query=query,
        login_customer_id=root_login_customer_id,
    )

    customers: list[dict[str, Any]] = []
    for row in rows:
        client = row.get("customerClient") or {}
        client_id = _clean_customer_id(client.get("id"))
        if not client_id:
            continue

        customers.append(
            {
                "customerId": client_id,
                "name": client.get("descriptiveName")
                or f"Google Ads {client_id}",
                "manager": bool(client.get("manager")),
                "currencyCode": client.get("currencyCode"),
                "timeZone": client.get("timeZone"),
                "loginCustomerId": (
                    root_login_customer_id
                    if client_id != root_login_customer_id
                    else None
                ),
                "level": int(client.get("level") or 0),
                "status": client.get("status"),
            }
        )

    return customers


def list_accessible_customers(uid: str) -> list[dict[str, Any]]:
    settings = get_settings()
    if not settings.developer_token:
        raise RuntimeError("Google Ads developer token is not configured yet.")

    credentials = _credentials_for(uid)

    response = requests.get(
        (
            f"https://googleads.googleapis.com/{ADS_API_VERSION}/"
            "customers:listAccessibleCustomers"
        ),
        headers=_headers(credentials.token),
        timeout=30,
    )
    response.raise_for_status()

    direct_ids = [
        _clean_customer_id(str(resource).split("/")[-1])
        for resource in (response.json().get("resourceNames") or [])
    ]

    discovered: dict[tuple[str, str | None], dict[str, Any]] = {}

    for direct_id in direct_ids:
        if not direct_id:
            continue

        details = _direct_customer_details(
            customer_id=direct_id,
            access_token=credentials.token,
        )
        discovered[(direct_id, None)] = details

        if details.get("manager"):
            for child in _manager_children(
                manager_customer_id=direct_id,
                access_token=credentials.token,
                root_login_customer_id=direct_id,
            ):
                key = (
                    child["customerId"],
                    child.get("loginCustomerId"),
                )
                discovered[key] = child

    customers = list(discovered.values())
    customers.sort(
        key=lambda item: (
            bool(item.get("manager")),
            str(item.get("name") or "").lower(),
            item.get("customerId") or "",
        )
    )
    return customers




def _fetch_campaign_context(
    *,
    customer_id: str,
    access_token: str,
    date_condition: str,
    login_customer_id: str | None = None,
) -> tuple[dict[str, dict[str, Any]], str | None]:
    """Fetch optional campaign-setting context without breaking the stable summary query."""
    query = f"""
        SELECT
          campaign.id,
          campaign.advertising_channel_type,
          campaign.bidding_strategy_type,
          campaign_budget.amount_micros,
          metrics.search_impression_share,
          metrics.search_budget_lost_impression_share,
          metrics.search_rank_lost_impression_share,
          metrics.conversions_from_interactions_rate
        FROM campaign
        WHERE {date_condition}
    """.strip()
    try:
        rows = _search(
            customer_id=customer_id,
            access_token=access_token,
            query=query,
            login_customer_id=login_customer_id,
        )
    except requests.HTTPError as exc:
        message = "Google campaign-setting context was unavailable; core campaign sync still completed."
        if exc.response is not None:
            try:
                message = str(exc.response.json())[:500]
            except Exception:
                pass
        return {}, message

    context: dict[str, dict[str, Any]] = {}
    for row in rows:
        campaign = row.get("campaign") or {}
        campaign_budget = row.get("campaignBudget") or {}
        metrics = row.get("metrics") or {}
        campaign_id = str(campaign.get("id") or "")
        if not campaign_id:
            continue
        context[campaign_id] = {
            "campaignType": campaign.get("advertisingChannelType") or "UNKNOWN",
            "biddingStrategyType": campaign.get("biddingStrategyType") or "UNKNOWN",
            "dailyBudget": round(float(campaign_budget.get("amountMicros") or 0) / 1_000_000, 2),
            "searchImpressionShare": round(float(metrics.get("searchImpressionShare") or 0) * 100, 2) if metrics.get("searchImpressionShare") is not None else None,
            "searchBudgetLostImpressionShare": round(float(metrics.get("searchBudgetLostImpressionShare") or 0) * 100, 2) if metrics.get("searchBudgetLostImpressionShare") is not None else None,
            "searchRankLostImpressionShare": round(float(metrics.get("searchRankLostImpressionShare") or 0) * 100, 2) if metrics.get("searchRankLostImpressionShare") is not None else None,
            "conversionRate": round(float(metrics.get("conversionsFromInteractionsRate") or 0) * 100, 2) if metrics.get("conversionsFromInteractionsRate") is not None else None,
        }
    return context, None


def fetch_campaign_summary(
    uid: str,
    *,
    customer_id: str,
    login_customer_id: str | None = None,
    start_date: str = "LAST_30_DAYS",
    custom_start_date: str | None = None,
    custom_end_date: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.developer_token:
        raise RuntimeError("Google Ads developer token is not configured yet.")

    clean_customer_id = _clean_customer_id(customer_id)
    if not clean_customer_id:
        raise RuntimeError("A Google Ads customer account must be selected.")

    credentials = _credentials_for(uid)
    date_condition, normalized_range = _date_condition(
        start_date, start_date=custom_start_date, end_date=custom_end_date
    )

    query = f"""
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.average_cpc,
          metrics.conversions,
          metrics.conversions_value,
          metrics.cost_per_conversion
        FROM campaign
        WHERE {date_condition}
        ORDER BY metrics.cost_micros DESC
    """.strip()

    rows = _search(
        customer_id=clean_customer_id,
        access_token=credentials.token,
        query=query,
        login_customer_id=login_customer_id,
    )
    campaign_context, context_warning = _fetch_campaign_context(
        customer_id=clean_customer_id,
        access_token=credentials.token,
        date_condition=date_condition,
        login_customer_id=login_customer_id,
    )

    campaigns: list[dict[str, Any]] = []
    for row in rows:
        campaign = row.get("campaign") or {}
        metrics = row.get("metrics") or {}

        impressions = int(metrics.get("impressions") or 0)
        clicks = int(metrics.get("clicks") or 0)
        spend = float(metrics.get("costMicros") or 0) / 1_000_000
        average_cpc = float(metrics.get("averageCpc") or 0) / 1_000_000
        conversions = float(metrics.get("conversions") or 0)
        conversion_value = float(metrics.get("conversionsValue") or 0)
        cost_per_conversion = (
            float(metrics.get("costPerConversion") or 0) / 1_000_000
        )
        ctr = (clicks / impressions * 100) if impressions else 0
        roas = (conversion_value / spend) if spend else 0

        campaigns.append(
            {
                "id": str(campaign.get("id") or ""),
                "name": campaign.get("name") or "Untitled campaign",
                "status": campaign.get("status") or "UNKNOWN",
                **campaign_context.get(str(campaign.get("id") or ""), {}),
                "conversionRate": (campaign_context.get(str(campaign.get("id") or ""), {}).get("conversionRate") if campaign_context.get(str(campaign.get("id") or ""), {}).get("conversionRate") is not None else (round((conversions / clicks) * 100, 2) if clicks else 0)),
                "impressions": impressions,
                "clicks": clicks,
                "ctr": round(ctr, 2),
                "spend": round(spend, 2),
                "averageCpc": round(average_cpc, 2),
                "conversions": round(conversions, 2),
                "conversionValue": round(conversion_value, 2),
                "costPerConversion": round(cost_per_conversion, 2),
                "roas": round(roas, 2),
            }
        )

    total_impressions = sum(item["impressions"] for item in campaigns)
    total_clicks = sum(item["clicks"] for item in campaigns)
    total_spend = round(sum(item["spend"] for item in campaigns), 2)
    total_conversions = round(
        sum(item["conversions"] for item in campaigns), 2
    )
    total_conversion_value = round(
        sum(item["conversionValue"] for item in campaigns), 2
    )

    ctr = (
        round((total_clicks / total_impressions) * 100, 2)
        if total_impressions
        else 0
    )
    average_cpc = (
        round(total_spend / total_clicks, 2)
        if total_clicks
        else 0
    )
    cost_per_conversion = (
        round(total_spend / total_conversions, 2)
        if total_conversions
        else 0
    )
    roas = (
        round(total_conversion_value / total_spend, 2)
        if total_spend
        else 0
    )


    return {
        "summary": {
            "spend": total_spend,
            "impressions": total_impressions,
            "clicks": total_clicks,
            "ctr": ctr,
            "averageCpc": average_cpc,
            "conversions": total_conversions,
            "conversionValue": total_conversion_value,
            "costPerConversion": cost_per_conversion,
            "roas": roas,
        },
        "campaigns": campaigns,
        "campaignContextWarning": context_warning,
        "dateRange": normalized_range,
    }



def fetch_daily_campaign_history(
    uid: str,
    *,
    customer_id: str,
    login_customer_id: str | None = None,
    start_date: str = "LAST_30_DAYS",
    custom_start_date: str | None = None,
    custom_end_date: str | None = None,
) -> dict[str, Any]:
    """Fetch one truthful Google Ads performance row per campaign per day.

    These rows are stored separately for Reports and must never replace the
    aggregate campaign snapshot used by Insights.
    """
    settings = get_settings()
    if not settings.developer_token:
        raise RuntimeError("Google Ads developer token is not configured yet.")

    clean_customer_id = _clean_customer_id(customer_id)
    if not clean_customer_id:
        raise RuntimeError("A Google Ads customer account must be selected.")

    credentials = _credentials_for(uid)
    date_condition, normalized_range = _date_condition(
        start_date,
        start_date=custom_start_date,
        end_date=custom_end_date,
    )

    query = f"""
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE {date_condition}
        ORDER BY segments.date ASC
    """.strip()

    rows = _search(
        customer_id=clean_customer_id,
        access_token=credentials.token,
        query=query,
        login_customer_id=login_customer_id,
    )

    daily_rows: list[dict[str, Any]] = []
    campaign_groups: dict[str, list[dict[str, Any]]] = {}
    campaign_meta: dict[str, dict[str, Any]] = {}

    for row in rows:
        campaign = row.get("campaign") or {}
        metrics = row.get("metrics") or {}
        segments = row.get("segments") or {}
        campaign_id = str(campaign.get("id") or "")
        report_date = str(segments.get("date") or "")
        if not campaign_id or not report_date:
            continue

        impressions = int(metrics.get("impressions") or 0)
        clicks = int(metrics.get("clicks") or 0)
        spend = float(metrics.get("costMicros") or 0) / 1_000_000
        conversions = float(metrics.get("conversions") or 0)
        conversion_value = float(metrics.get("conversionsValue") or 0)

        daily = {
            "id": campaign_id,
            "campaignId": campaign_id,
            "name": campaign.get("name") or "Untitled campaign",
            "campaignName": campaign.get("name") or "Untitled campaign",
            "status": campaign.get("status") or "UNKNOWN",
            "date": report_date,
            "reportDate": report_date,
            "impressions": impressions,
            "clicks": clicks,
            "spend": round(spend, 6),
            "conversions": round(conversions, 4),
            "conversionValue": round(conversion_value, 4),
            "ctr": round((clicks / impressions) * 100, 4) if impressions else 0,
            "averageCpc": round(spend / clicks, 6) if clicks else 0,
            "costPerConversion": round(spend / conversions, 6) if conversions else 0,
            "roas": round(conversion_value / spend, 6) if spend else 0,
        }
        daily_rows.append(daily)
        campaign_groups.setdefault(campaign_id, []).append(daily)
        campaign_meta[campaign_id] = {
            "id": campaign_id,
            "name": daily["campaignName"],
            "status": daily["status"],
        }

    return {
        "dailyCampaignPerformance": daily_rows,
        "dateRange": normalized_range,
    }


def _asset_metadata(
    *,
    customer_id: str,
    access_token: str,
    login_customer_id: str | None = None,
) -> dict[str, dict[str, Any]]:
    query = """
        SELECT
          asset.resource_name,
          asset.id,
          asset.name,
          asset.type,
          asset.text_asset.text,
          asset.image_asset.full_size.url,
          asset.image_asset.full_size.width_pixels,
          asset.image_asset.full_size.height_pixels,
          asset.image_asset.file_size,
          asset.image_asset.mime_type,
          asset.youtube_video_asset.youtube_video_id,
          asset.youtube_video_asset.youtube_video_title
        FROM asset
        WHERE asset.type IN ('IMAGE', 'YOUTUBE_VIDEO', 'TEXT')
    """.strip()

    rows = _search(
        customer_id=customer_id,
        access_token=access_token,
        query=query,
        login_customer_id=login_customer_id,
    )

    metadata: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset = row.get("asset") or {}
        resource_name = asset.get("resourceName")
        if not resource_name:
            continue

        image = asset.get("imageAsset") or {}
        full_size = image.get("fullSize") or {}
        youtube = asset.get("youtubeVideoAsset") or {}
        text_asset = asset.get("textAsset") or {}

        youtube_id = youtube.get("youtubeVideoId")
        preview_url = full_size.get("url")
        if not preview_url and youtube_id:
            preview_url = f"https://i.ytimg.com/vi/{youtube_id}/hqdefault.jpg"

        metadata[resource_name] = {
            "resourceName": resource_name,
            "assetId": str(asset.get("id") or ""),
            "name": asset.get("name") or None,
            "assetType": asset.get("type") or "UNKNOWN",
            "text": text_asset.get("text") or None,
            "imageUrl": full_size.get("url") or None,
            "previewUrl": preview_url,
            "width": int(full_size.get("widthPixels") or 0),
            "height": int(full_size.get("heightPixels") or 0),
            "fileSize": int(image.get("fileSize") or 0),
            "mimeType": image.get("mimeType") or None,
            "youtubeVideoId": youtube_id or None,
            "youtubeTitle": youtube.get("youtubeVideoTitle") or None,
        }

    return metadata


def _asset_row(
    *,
    asset_resource: str,
    metadata: dict[str, dict[str, Any]],
    campaign: dict[str, Any],
    field_type: str | None,
    performance_label: str | None,
    source: str,
    metrics: dict[str, Any],
    ad_id: str | None = None,
    ad_group_id: str | None = None,
    asset_group_id: str | None = None,
) -> dict[str, Any]:
    item = dict(metadata.get(asset_resource) or {})
    item.setdefault("resourceName", asset_resource)
    item.setdefault("assetId", str(asset_resource).split("/")[-1])
    item.setdefault("assetType", "UNKNOWN")

    impressions = int(metrics.get("impressions") or 0)
    clicks = int(metrics.get("clicks") or 0)
    spend = float(metrics.get("costMicros") or 0) / 1_000_000
    conversions = float(metrics.get("conversions") or 0)
    conversion_value = float(metrics.get("conversionsValue") or 0)

    item.update(
        {
            "campaignId": str(campaign.get("id") or ""),
            "campaignName": campaign.get("name") or "Untitled campaign",
            "fieldType": field_type or None,
            "performanceLabel": performance_label or None,
            "source": source,
            "adId": ad_id,
            "adGroupId": ad_group_id,
            "assetGroupId": asset_group_id,
            "impressions": impressions,
            "clicks": clicks,
            "ctr": round((clicks / impressions) * 100, 2) if impressions else 0,
            "spend": round(spend, 2),
            "conversions": round(conversions, 2),
            "conversionValue": round(conversion_value, 2),
            "roas": round(conversion_value / spend, 2) if spend else 0,
        }
    )
    return item


def fetch_creative_assets(
    uid: str,
    *,
    customer_id: str,
    login_customer_id: str | None = None,
    date_range: str = "LAST_30_DAYS",
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, Any]]:
    settings = get_settings()
    if not settings.developer_token:
        raise RuntimeError("Google Ads developer token is not configured yet.")

    credentials = _credentials_for(uid)
    date_condition, _normalized_range = _date_condition(
        date_range, start_date=start_date, end_date=end_date
    )
    metadata = _asset_metadata(
        customer_id=customer_id,
        access_token=credentials.token,
        login_customer_id=login_customer_id,
    )

    assets: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()

    queries = [
        (
            "ad_group_ad_asset_view",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  ad_group.id,
                  ad_group_ad.ad.id,
                  ad_group_ad_asset_view.asset,
                  ad_group_ad_asset_view.field_type,
                  ad_group_ad_asset_view.performance_label,
                  metrics.impressions,
                  metrics.clicks,
                  metrics.cost_micros,
                  metrics.conversions,
                  metrics.conversions_value
                FROM ad_group_ad_asset_view
                WHERE {date_condition}
            """.strip(),
        ),
        (
            "campaign_asset",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  campaign_asset.asset,
                  campaign_asset.field_type,
                  metrics.impressions,
                  metrics.clicks,
                  metrics.cost_micros,
                  metrics.conversions,
                  metrics.conversions_value
                FROM campaign_asset
                WHERE {date_condition}
            """.strip(),
        ),
        (
            "ad_group_asset",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  ad_group.id,
                  ad_group_asset.asset,
                  ad_group_asset.field_type,
                  metrics.impressions,
                  metrics.clicks,
                  metrics.cost_micros,
                  metrics.conversions,
                  metrics.conversions_value
                FROM ad_group_asset
                WHERE {date_condition}
            """.strip(),
        ),
        (
            "asset_group_asset",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  asset_group.id,
                  asset_group_asset.asset,
                  asset_group_asset.field_type,
                  metrics.impressions,
                  metrics.clicks,
                  metrics.cost_micros,
                  metrics.conversions,
                  metrics.conversions_value
                FROM asset_group_asset
                WHERE {date_condition}
                  AND asset_group_asset.status != 'REMOVED'
            """.strip(),
        ),
    ]

    for source, query in queries:
        try:
            rows = _search(
                customer_id=customer_id,
                access_token=credentials.token,
                query=query,
                login_customer_id=login_customer_id,
            )
        except requests.HTTPError as exc:
            print(
                f"GOOGLE ADS ASSET QUERY SKIPPED source={source}:",
                exc.response.text[:500] if exc.response is not None else repr(exc),
                flush=True,
            )
            continue

        for row in rows:
            campaign = row.get("campaign") or {}
            metrics = row.get("metrics") or {}
            ad_group = row.get("adGroup") or {}
            asset_group = row.get("assetGroup") or {}
            ad_group_ad = row.get("adGroupAd") or {}
            ad = ad_group_ad.get("ad") or {}

            if source == "ad_group_ad_asset_view":
                link = row.get("adGroupAdAssetView") or {}
            elif source == "campaign_asset":
                link = row.get("campaignAsset") or {}
            elif source == "ad_group_asset":
                link = row.get("adGroupAsset") or {}
            else:
                link = row.get("assetGroupAsset") or {}

            asset_resource = link.get("asset")
            if not asset_resource:
                continue

            field_type = link.get("fieldType")
            performance_label = link.get("performanceLabel")
            campaign_id = str(campaign.get("id") or "")
            key = (
                campaign_id,
                asset_resource,
                source,
                str(ad.get("id") or asset_group.get("id") or ad_group.get("id") or ""),
            )
            if key in seen:
                continue
            seen.add(key)

            assets.append(
                _asset_row(
                    asset_resource=asset_resource,
                    metadata=metadata,
                    campaign=campaign,
                    field_type=field_type,
                    performance_label=performance_label,
                    source=source,
                    metrics=metrics,
                    ad_id=str(ad.get("id") or "") or None,
                    ad_group_id=str(ad_group.get("id") or "") or None,
                    asset_group_id=str(asset_group.get("id") or "") or None,
                )
            )

    assets.sort(
        key=lambda item: (
            float(item.get("spend") or 0),
            int(item.get("impressions") or 0),
        ),
        reverse=True,
    )
    return assets[:250]
