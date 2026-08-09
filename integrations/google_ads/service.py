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



def _reporting_metric_values(metrics: dict[str, Any]) -> dict[str, Any]:
    impressions = int(metrics.get("impressions") or 0)
    clicks = int(metrics.get("clicks") or 0)
    spend = round(float(metrics.get("costMicros") or 0) / 1_000_000, 2)
    conversions = round(float(metrics.get("conversions") or 0), 2)
    conversion_value = round(float(metrics.get("conversionsValue") or 0), 2)
    return {
        "impressions": impressions,
        "clicks": clicks,
        "spend": spend,
        "conversions": conversions,
        "conversionValue": conversion_value,
    }


def _google_country_names(
    *,
    customer_id: str,
    access_token: str,
    login_customer_id: str | None,
    country_ids: set[str],
) -> dict[str, str]:
    clean_ids = sorted({
        str(value).strip()
        for value in country_ids
        if str(value or "").strip().isdigit()
    })
    if not clean_ids:
        return {}

    names: dict[str, str] = {}
    for start in range(0, len(clean_ids), 100):
        chunk = clean_ids[start:start + 100]
        query = f"""
            SELECT
              geo_target_constant.id,
              geo_target_constant.name,
              geo_target_constant.country_code
            FROM geo_target_constant
            WHERE geo_target_constant.id IN ({",".join(chunk)})
        """.strip()
        try:
            rows = _search(
                customer_id=customer_id,
                access_token=access_token,
                query=query,
                login_customer_id=login_customer_id,
            )
        except requests.HTTPError:
            continue

        for row in rows:
            geo = row.get("geoTargetConstant") or {}
            geo_id = str(geo.get("id") or "")
            if not geo_id:
                continue
            names[geo_id] = (
                geo.get("name")
                or geo.get("countryCode")
                or f"Country {geo_id}"
            )
    return names


def fetch_reporting_dimensions(
    uid: str,
    *,
    customer_id: str,
    login_customer_id: str | None = None,
    date_range: str = "LAST_30_DAYS",
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """
    Fetch dimension-specific rows used only by the Reports workspace.

    The existing campaign summary and daily campaign-history syncs remain
    unchanged. These rows are additive and prevent report grouping from
    falling back to "Not available" for supported provider dimensions.
    """
    settings = get_settings()
    if not settings.developer_token:
        raise RuntimeError("Google Ads developer token is not configured yet.")

    clean_customer_id = _clean_customer_id(customer_id)
    if not clean_customer_id:
        raise RuntimeError("A Google Ads customer account must be selected.")

    credentials = _credentials_for(uid)
    date_condition, normalized_range = _date_condition(
        date_range,
        start_date=start_date,
        end_date=end_date,
    )

    base_metrics = """
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    """.strip()

    specs = [
        (
            "ad_group",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  ad_group.id,
                  ad_group.name,
                  segments.date,
                  {base_metrics}
                FROM ad_group
                WHERE {date_condition}
                  AND ad_group.status != 'REMOVED'
            """.strip(),
        ),
        (
            "creative",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  ad_group.id,
                  ad_group.name,
                  ad_group_ad.ad.id,
                  ad_group_ad.ad.name,
                  segments.date,
                  {base_metrics}
                FROM ad_group_ad
                WHERE {date_condition}
                  AND ad_group_ad.status != 'REMOVED'
            """.strip(),
        ),
        (
            "device",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  segments.device,
                  segments.date,
                  {base_metrics}
                FROM campaign
                WHERE {date_condition}
            """.strip(),
        ),
        (
            "country",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  geographic_view.country_criterion_id,
                  segments.date,
                  {base_metrics}
                FROM geographic_view
                WHERE {date_condition}
            """.strip(),
        ),
        (
            "placement",
            f"""
                SELECT
                  campaign.id,
                  campaign.name,
                  ad_group.id,
                  ad_group.name,
                  detail_placement_view.target_url,
                  detail_placement_view.placement_type,
                  segments.date,
                  {base_metrics}
                FROM detail_placement_view
                WHERE {date_condition}
            """.strip(),
        ),
    ]

    dimension_rows: list[dict[str, Any]] = []
    warnings: list[str] = []
    pending_country_rows: list[dict[str, Any]] = []
    country_ids: set[str] = set()

    for dimension_type, query in specs:
        try:
            rows = _search(
                customer_id=clean_customer_id,
                access_token=credentials.token,
                query=query,
                login_customer_id=login_customer_id,
            )
        except requests.HTTPError as exc:
            detail = ""
            if exc.response is not None:
                detail = (exc.response.text or "")[:300]
            warnings.append(
                f"{dimension_type.replace('_', ' ').title()} reporting was unavailable."
                + (f" {detail}" if detail else "")
            )
            continue

        for raw in rows:
            campaign = raw.get("campaign") or {}
            ad_group = raw.get("adGroup") or {}
            ad_group_ad = raw.get("adGroupAd") or {}
            ad = ad_group_ad.get("ad") or {}
            segments = raw.get("segments") or {}
            metrics = raw.get("metrics") or {}
            geo = raw.get("geographicView") or {}
            placement = raw.get("detailPlacementView") or {}

            row = {
                "dimensionType": dimension_type,
                "provider": "google_ads",
                "campaignId": str(campaign.get("id") or ""),
                "campaignName": campaign.get("name") or "Untitled campaign",
                "date": segments.get("date"),
                "reportDate": segments.get("date"),
                **_reporting_metric_values(metrics),
            }

            if dimension_type == "ad_group":
                row["adGroupId"] = str(ad_group.get("id") or "")
                row["adGroupName"] = (
                    ad_group.get("name")
                    or f"Ad Group {row['adGroupId']}"
                )
            elif dimension_type == "creative":
                row["adGroupId"] = str(ad_group.get("id") or "")
                row["adGroupName"] = ad_group.get("name")
                row["creativeId"] = str(ad.get("id") or "")
                row["creativeName"] = (
                    ad.get("name")
                    or f"Ad {row['creativeId']}"
                )
            elif dimension_type == "device":
                row["device"] = (
                    str(segments.get("device") or "Unknown")
                    .replace("_", " ")
                    .title()
                )
            elif dimension_type == "country":
                country_id = str(geo.get("countryCriterionId") or "")
                row["countryCriterionId"] = country_id
                country_ids.add(country_id)
                pending_country_rows.append(row)
                continue
            elif dimension_type == "placement":
                row["adGroupId"] = str(ad_group.get("id") or "")
                row["adGroupName"] = ad_group.get("name")
                row["placement"] = (
                    placement.get("targetUrl")
                    or str(placement.get("placementType") or "")
                    .replace("_", " ")
                    .title()
                    or "Unknown placement"
                )

            dimension_rows.append(row)

    if pending_country_rows:
        country_names = _google_country_names(
            customer_id=clean_customer_id,
            access_token=credentials.token,
            login_customer_id=login_customer_id,
            country_ids=country_ids,
        )
        for row in pending_country_rows:
            country_id = str(row.get("countryCriterionId") or "")
            row["country"] = (
                country_names.get(country_id)
                or (f"Country {country_id}" if country_id else "Unknown country")
            )
            dimension_rows.append(row)

    return {
        "ok": True,
        "dateRange": normalized_range,
        "rows": dimension_rows,
        "rowCount": len(dimension_rows),
        "warnings": warnings,
    }

def fetch_creative_assets(
    uid: str,
    *,
    customer_id: str,
    login_customer_id: str | None = None,
    date_range: str = "LAST_30_DAYS",
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, Any]]:
    """
    Fetch linked Google Ads creative assets plus performance when available.

    Important:
    - Performance views can omit newly linked assets that have not served yet.
    - ADGen still needs those assets to appear in Campaign/Creative Intelligence.
    - We therefore run the normal performance queries first, then run lightweight
      structural linkage queries without a date/metrics requirement and add any
      missing linked assets with zero performance.

    Performance Intelligence can still qualify assets using its existing
    delivery thresholds; this only prevents valid image/video assets from
    disappearing before they accumulate metrics.
    """
    settings = get_settings()
    if not settings.developer_token:
        raise RuntimeError("Google Ads developer token is not configured yet.")

    clean_customer_id = _clean_customer_id(customer_id)
    if not clean_customer_id:
        raise RuntimeError("A Google Ads customer account must be selected.")

    credentials = _credentials_for(uid)
    date_condition, _normalized_range = _date_condition(
        date_range, start_date=start_date, end_date=end_date
    )
    metadata = _asset_metadata(
        customer_id=clean_customer_id,
        access_token=credentials.token,
        login_customer_id=login_customer_id,
    )

    assets: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()

    def add_asset_from_row(
        *,
        source: str,
        row: dict[str, Any],
        metrics: dict[str, Any] | None = None,
    ) -> None:
        campaign = row.get("campaign") or {}
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
            return

        field_type = link.get("fieldType")
        performance_label = link.get("performanceLabel")
        campaign_id = str(campaign.get("id") or "")
        association_id = str(
            ad.get("id")
            or asset_group.get("id")
            or ad_group.get("id")
            or ""
        )

        key = (
            campaign_id,
            asset_resource,
            source,
            association_id,
        )
        if key in seen:
            return
        seen.add(key)

        assets.append(
            _asset_row(
                asset_resource=asset_resource,
                metadata=metadata,
                campaign=campaign,
                field_type=field_type,
                performance_label=performance_label,
                source=source,
                metrics=metrics or {},
                ad_id=str(ad.get("id") or "") or None,
                ad_group_id=str(ad_group.get("id") or "") or None,
                asset_group_id=str(asset_group.get("id") or "") or None,
            )
        )

    # First: performance-bearing queries for the requested date range.
    performance_queries = [
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

    for source, query in performance_queries:
        try:
            rows = _search(
                customer_id=clean_customer_id,
                access_token=credentials.token,
                query=query,
                login_customer_id=login_customer_id,
            )
        except requests.HTTPError as exc:
            print(
                f"GOOGLE ADS ASSET PERFORMANCE QUERY SKIPPED source={source}:",
                exc.response.text[:500]
                if exc.response is not None
                else repr(exc),
                flush=True,
            )
            continue

        for row in rows:
            add_asset_from_row(
                source=source,
                row=row,
                metrics=row.get("metrics") or {},
            )

    # Second: structural linkage fallback.
    #
    # A valid asset can be attached to a campaign/ad group but have no delivery
    # yet. Date-segmented performance queries can therefore return no row for it.
    # These queries intentionally omit metrics and date filters so ADGen can
    # still surface the attached creative immediately.
    structural_queries = [
        (
            "ad_group_ad_asset_view",
            """
                SELECT
                  campaign.id,
                  campaign.name,
                  ad_group.id,
                  ad_group_ad.ad.id,
                  ad_group_ad_asset_view.asset,
                  ad_group_ad_asset_view.field_type,
                  ad_group_ad_asset_view.performance_label
                FROM ad_group_ad_asset_view
            """.strip(),
        ),
        (
            "campaign_asset",
            """
                SELECT
                  campaign.id,
                  campaign.name,
                  campaign_asset.asset,
                  campaign_asset.field_type,
                  campaign_asset.status
                FROM campaign_asset
                WHERE campaign_asset.status != 'REMOVED'
            """.strip(),
        ),
        (
            "ad_group_asset",
            """
                SELECT
                  campaign.id,
                  campaign.name,
                  ad_group.id,
                  ad_group_asset.asset,
                  ad_group_asset.field_type,
                  ad_group_asset.status
                FROM ad_group_asset
                WHERE ad_group_asset.status != 'REMOVED'
            """.strip(),
        ),
        (
            "asset_group_asset",
            """
                SELECT
                  campaign.id,
                  campaign.name,
                  asset_group.id,
                  asset_group_asset.asset,
                  asset_group_asset.field_type,
                  asset_group_asset.status
                FROM asset_group_asset
                WHERE asset_group_asset.status != 'REMOVED'
            """.strip(),
        ),
    ]

    for source, query in structural_queries:
        try:
            rows = _search(
                customer_id=clean_customer_id,
                access_token=credentials.token,
                query=query,
                login_customer_id=login_customer_id,
            )
        except requests.HTTPError as exc:
            print(
                f"GOOGLE ADS ASSET LINK QUERY SKIPPED source={source}:",
                exc.response.text[:500]
                if exc.response is not None
                else repr(exc),
                flush=True,
            )
            continue

        added_before = len(assets)
        for row in rows:
            add_asset_from_row(
                source=source,
                row=row,
                metrics={},
            )

        added_count = len(assets) - added_before
        if added_count:
            print(
                f"GOOGLE ADS ASSET LINK FALLBACK source={source} "
                f"added={added_count}",
                flush=True,
            )

    assets.sort(
        key=lambda item: (
            float(item.get("spend") or 0),
            int(item.get("impressions") or 0),
            1 if item.get("assetType") == "IMAGE" else 0,
        ),
        reverse=True,
    )
    return assets[:250]
