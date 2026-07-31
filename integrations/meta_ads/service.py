from __future__ import annotations

from typing import Any
from datetime import date, datetime
import json

import requests

from .config import get_settings
from .store import get_connection


ACCOUNT_FIELDS = ",".join(
    [
        "id",
        "account_id",
        "name",
        "account_status",
        "currency",
        "timezone_name",
        "business{id,name}",
    ]
)

CAMPAIGN_FIELDS = ",".join(
    [
        "id",
        "name",
        "objective",
        "status",
        "effective_status",
        "created_time",
        "start_time",
        "stop_time",
    ]
)

INSIGHT_FIELDS = ",".join(
    [
        "campaign_id",
        "campaign_name",
        "impressions",
        "reach",
        "frequency",
        "clicks",
        "inline_link_clicks",
        "spend",
        "ctr",
        "cpc",
        "cpm",
        "actions",
        "action_values",
        "date_start",
        "date_stop",
    ]
)


ADSET_FIELDS = ",".join(
    [
        "id",
        "name",
        "campaign{id,name}",
        "status",
        "effective_status",
        "daily_budget",
        "lifetime_budget",
        "bid_strategy",
        "billing_event",
        "optimization_goal",
        "start_time",
        "end_time",
    ]
)

ADSET_INSIGHT_FIELDS = ",".join(
    [
        "adset_id",
        "adset_name",
        "campaign_id",
        "campaign_name",
        "impressions",
        "reach",
        "frequency",
        "clicks",
        "inline_link_clicks",
        "spend",
        "ctr",
        "cpc",
        "cpm",
        "actions",
        "action_values",
        "date_start",
        "date_stop",
    ]
)

DATE_PRESETS = {
    "LAST_7_DAYS": "last_7d",
    "LAST_14_DAYS": "last_14d",
    "LAST_30_DAYS": "last_30d",
    "LAST_90_DAYS": "last_90d",
    "THIS_MONTH": "this_month",
    "LAST_MONTH": "last_month",
    "MAXIMUM": "maximum",
}

PURCHASE_ACTION_TYPES = {
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
}

LEAD_ACTION_TYPES = {
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
}

CONVERSION_ACTION_TYPES = PURCHASE_ACTION_TYPES | LEAD_ACTION_TYPES


def _validated_iso_date(value: str | None, label: str) -> str:
    cleaned = str(value or "").strip()
    try:
        parsed = datetime.strptime(cleaned, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"{label} must use YYYY-MM-DD.") from exc
    if parsed > date.today():
        raise ValueError(f"{label} cannot be in the future.")
    return parsed.isoformat()


def _insight_date_params(
    date_range: str,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[dict[str, Any], str]:
    requested = str(date_range or "LAST_30_DAYS").upper()
    if requested == "CUSTOM":
        since = _validated_iso_date(start_date, "Start date")
        until = _validated_iso_date(end_date, "End date")
        if since > until:
            raise ValueError("Start date must be on or before end date.")
        return {"time_range": json.dumps({"since": since, "until": until})}, f"{since}:{until}"
    date_preset = DATE_PRESETS.get(requested)
    if not date_preset:
        raise ValueError(
            "Unsupported date range. Use LAST_7_DAYS, LAST_14_DAYS, "
            "LAST_30_DAYS, LAST_90_DAYS, THIS_MONTH, LAST_MONTH, "
            "MAXIMUM, or CUSTOM."
        )
    return {"date_preset": date_preset}, requested


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else default)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value if value not in (None, "") else default))
    except (TypeError, ValueError):
        return default


def _round(value: float, digits: int = 4) -> float:
    return round(float(value or 0), digits)


def _access_token_for(uid: str) -> str:
    connection = get_connection(uid, include_access_token=True)
    if not connection:
        raise RuntimeError("Meta Ads is not connected.")

    access_token = str(connection.get("accessToken") or "").strip()
    if not access_token:
        raise RuntimeError("Stored Meta Ads credentials are unavailable.")
    return access_token


def _selected_account_for(uid: str) -> tuple[str, dict[str, Any]]:
    connection = get_connection(uid) or {}
    account_id = _normalize_ad_account_id(
        connection.get("selectedAdAccountId")
    )
    if not account_id:
        raise ValueError(
            "Choose a Meta ad account before syncing campaign data."
        )
    return account_id, connection


def _normalize_ad_account_id(value: str | None) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""
    digits = "".join(character for character in cleaned if character.isdigit())
    return f"act_{digits}" if digits else ""


def _graph_get(
    path_or_url: str,
    *,
    access_token: str,
    params: dict[str, Any] | None = None,
    timeout: int = 45,
) -> dict[str, Any]:
    settings = get_settings()
    url = (
        path_or_url
        if str(path_or_url).startswith("https://")
        else f"{settings.graph_base_url}/{str(path_or_url).lstrip('/')}"
    )

    response = requests.get(
        url,
        params={**(params or {}), "access_token": access_token},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json() or {}


def _paged_rows(
    path: str,
    *,
    access_token: str,
    params: dict[str, Any],
    max_rows: int = 500,
) -> list[dict[str, Any]]:
    payload = _graph_get(
        path,
        access_token=access_token,
        params=params,
    )
    rows: list[dict[str, Any]] = []

    while True:
        for item in payload.get("data") or []:
            if isinstance(item, dict):
                rows.append(item)
            if len(rows) >= max_rows:
                return rows

        next_url = ((payload.get("paging") or {}).get("next") or "").strip()
        if not next_url:
            break

        payload = _graph_get(
            next_url,
            access_token=access_token,
        )

    return rows


def _account_row(item: dict[str, Any]) -> dict[str, Any]:
    business = item.get("business") or {}
    ad_account_id = _normalize_ad_account_id(
        item.get("id") or item.get("account_id")
    )

    return {
        "adAccountId": ad_account_id,
        "accountId": str(item.get("account_id") or ""),
        "name": item.get("name") or f"Meta Ads {ad_account_id}",
        "accountStatus": int(item.get("account_status") or 0),
        "currency": item.get("currency"),
        "timeZone": item.get("timezone_name"),
        "businessId": str(business.get("id") or "") or None,
        "businessName": business.get("name") or None,
    }


def list_accessible_ad_accounts(uid: str) -> list[dict[str, Any]]:
    access_token = _access_token_for(uid)

    items = _paged_rows(
        "me/adaccounts",
        access_token=access_token,
        params={
            "fields": ACCOUNT_FIELDS,
            "limit": 100,
        },
        max_rows=500,
    )

    accounts: dict[str, dict[str, Any]] = {}
    for item in items:
        row = _account_row(item)
        ad_account_id = row.get("adAccountId")
        if ad_account_id:
            accounts[ad_account_id] = row

    rows = list(accounts.values())
    rows.sort(
        key=lambda account: (
            str(account.get("businessName") or "").lower(),
            str(account.get("name") or "").lower(),
            str(account.get("adAccountId") or ""),
        )
    )
    return rows


def validate_accessible_ad_account(
    uid: str,
    ad_account_id: str,
) -> dict[str, Any]:
    normalized = _normalize_ad_account_id(ad_account_id)
    if not normalized:
        raise ValueError("Invalid Meta ad account ID.")

    for account in list_accessible_ad_accounts(uid):
        if account.get("adAccountId") == normalized:
            return account

    raise PermissionError(
        "This Meta ad account is not available to the connected user."
    )


def _action_total(
    actions: Any,
    accepted_types: set[str],
) -> float:
    total = 0.0
    for item in actions or []:
        if not isinstance(item, dict):
            continue
        action_type = str(item.get("action_type") or "")
        if action_type in accepted_types:
            total += _safe_float(item.get("value"))
    return total


def _insight_row(item: dict[str, Any]) -> dict[str, Any]:
    spend = _safe_float(item.get("spend"))
    impressions = _safe_int(item.get("impressions"))
    clicks = _safe_int(item.get("clicks"))
    link_clicks = _safe_int(item.get("inline_link_clicks"))
    conversions = _action_total(
        item.get("actions"),
        CONVERSION_ACTION_TYPES,
    )
    purchases = _action_total(
        item.get("actions"),
        PURCHASE_ACTION_TYPES,
    )
    leads = _action_total(
        item.get("actions"),
        LEAD_ACTION_TYPES,
    )
    conversion_value = _action_total(
        item.get("action_values"),
        PURCHASE_ACTION_TYPES,
    )

    ctr = _safe_float(item.get("ctr"))
    cpc = _safe_float(item.get("cpc"))
    cpm = _safe_float(item.get("cpm"))

    if not ctr and impressions > 0:
        ctr = (clicks / impressions) * 100
    if not cpc and clicks > 0:
        cpc = spend / clicks
    if not cpm and impressions > 0:
        cpm = (spend / impressions) * 1000

    return {
        "campaignId": str(item.get("campaign_id") or ""),
        "campaignName": item.get("campaign_name") or "Meta campaign",
        "date": item.get("date_start") or None,
        "reportDate": item.get("date_start") or None,
        "dateStop": item.get("date_stop") or None,
        "impressions": impressions,
        "reach": _safe_int(item.get("reach")),
        "frequency": _round(_safe_float(item.get("frequency")), 2),
        "clicks": clicks,
        "linkClicks": link_clicks,
        "spend": _round(spend, 2),
        "ctr": _round(ctr, 4),
        "cpc": _round(cpc, 4),
        "cpm": _round(cpm, 4),
        "conversions": _round(conversions, 2),
        "purchases": _round(purchases, 2),
        "leads": _round(leads, 2),
        "conversionValue": _round(conversion_value, 2),
        "cpa": _round(spend / conversions, 4)
        if conversions > 0
        else None,
        "roas": _round(conversion_value / spend, 4)
        if spend > 0
        else None,
    }


def _campaign_row(
    item: dict[str, Any],
    insight: dict[str, Any] | None,
) -> dict[str, Any]:
    metrics = insight or {
        "impressions": 0,
        "reach": 0,
        "frequency": 0,
        "clicks": 0,
        "linkClicks": 0,
        "spend": 0,
        "ctr": 0,
        "cpc": 0,
        "cpm": 0,
        "conversions": 0,
        "purchases": 0,
        "leads": 0,
        "conversionValue": 0,
        "cpa": None,
        "roas": None,
    }

    return {
        "campaignId": str(item.get("id") or metrics.get("campaignId") or ""),
        "name": item.get("name") or metrics.get("campaignName") or "Meta campaign",
        "objective": item.get("objective"),
        "status": item.get("status"),
        "effectiveStatus": item.get("effective_status"),
        "createdTime": item.get("created_time"),
        "startTime": item.get("start_time"),
        "stopTime": item.get("stop_time"),
        **{
            key: value
            for key, value in metrics.items()
            if key not in {"campaignId", "campaignName"}
        },
    }


def _summary(campaigns: list[dict[str, Any]]) -> dict[str, Any]:
    impressions = sum(_safe_int(row.get("impressions")) for row in campaigns)
    reach = sum(_safe_int(row.get("reach")) for row in campaigns)
    clicks = sum(_safe_int(row.get("clicks")) for row in campaigns)
    link_clicks = sum(_safe_int(row.get("linkClicks")) for row in campaigns)
    spend = sum(_safe_float(row.get("spend")) for row in campaigns)
    conversions = sum(_safe_float(row.get("conversions")) for row in campaigns)
    purchases = sum(_safe_float(row.get("purchases")) for row in campaigns)
    leads = sum(_safe_float(row.get("leads")) for row in campaigns)
    conversion_value = sum(
        _safe_float(row.get("conversionValue"))
        for row in campaigns
    )

    return {
        "impressions": impressions,
        "reach": reach,
        "frequency": _round(impressions / reach, 2) if reach > 0 else 0,
        "clicks": clicks,
        "linkClicks": link_clicks,
        "spend": _round(spend, 2),
        "conversions": _round(conversions, 2),
        "purchases": _round(purchases, 2),
        "leads": _round(leads, 2),
        "conversionValue": _round(conversion_value, 2),
        "ctr": _round((clicks / impressions) * 100, 4)
        if impressions > 0
        else 0,
        "cpc": _round(spend / clicks, 4) if clicks > 0 else 0,
        "cpm": _round((spend / impressions) * 1000, 4)
        if impressions > 0
        else 0,
        "cpa": _round(spend / conversions, 4)
        if conversions > 0
        else None,
        "roas": _round(conversion_value / spend, 4)
        if spend > 0
        else None,
    }



def _adset_insight_row(item: dict[str, Any]) -> dict[str, Any]:
    row = _insight_row({
        **item,
        "campaign_id": item.get("campaign_id"),
        "campaign_name": item.get("campaign_name"),
    })
    row.update({
        "adSetId": str(item.get("adset_id") or ""),
        "adSetName": item.get("adset_name") or "Meta ad set",
    })
    return row


def _sync_adset_context(
    *,
    account_id: str,
    access_token: str,
    insight_date_params: dict[str, Any],
) -> tuple[list[dict[str, Any]], str | None]:
    """Fetch optional ad-set context without making the stable campaign sync fail."""
    try:
        adset_items = _paged_rows(
            f"{account_id}/adsets",
            access_token=access_token,
            params={"fields": ADSET_FIELDS, "limit": 100},
            max_rows=1000,
        )
        insight_items = _paged_rows(
            f"{account_id}/insights",
            access_token=access_token,
            params={
                "level": "adset",
                **insight_date_params,
                "fields": ADSET_INSIGHT_FIELDS,
                "limit": 100,
            },
            max_rows=1000,
        )
        by_adset = {
            row["adSetId"]: row
            for row in (_adset_insight_row(item) for item in insight_items)
            if row.get("adSetId")
        }
        rows: list[dict[str, Any]] = []
        known: set[str] = set()
        for item in adset_items:
            adset_id = str(item.get("id") or "")
            if not adset_id:
                continue
            known.add(adset_id)
            campaign = item.get("campaign") or {}
            metrics = by_adset.get(adset_id) or {}
            daily_budget = _safe_float(item.get("daily_budget")) / 100
            lifetime_budget = _safe_float(item.get("lifetime_budget")) / 100
            rows.append({
                "adSetId": adset_id,
                "adSetName": item.get("name") or metrics.get("adSetName") or "Meta ad set",
                "campaignId": str(campaign.get("id") or metrics.get("campaignId") or ""),
                "campaignName": campaign.get("name") or metrics.get("campaignName") or "Meta campaign",
                "status": item.get("status"),
                "effectiveStatus": item.get("effective_status"),
                "dailyBudget": _round(daily_budget, 2) if daily_budget else None,
                "lifetimeBudget": _round(lifetime_budget, 2) if lifetime_budget else None,
                "bidStrategy": item.get("bid_strategy"),
                "billingEvent": item.get("billing_event"),
                "optimizationGoal": item.get("optimization_goal"),
                "startTime": item.get("start_time"),
                "endTime": item.get("end_time"),
                **{k: v for k, v in metrics.items() if k not in {
                    "adSetId", "adSetName", "campaignId", "campaignName"
                }},
            })
        for adset_id, metrics in by_adset.items():
            if adset_id in known:
                continue
            rows.append({
                "adSetId": adset_id,
                "adSetName": metrics.get("adSetName") or "Meta ad set",
                "campaignId": metrics.get("campaignId") or "",
                "campaignName": metrics.get("campaignName") or "Meta campaign",
                **{k: v for k, v in metrics.items() if k not in {
                    "adSetId", "adSetName", "campaignId", "campaignName"
                }},
            })
        rows.sort(key=lambda row: (_safe_float(row.get("spend")), _safe_int(row.get("impressions"))), reverse=True)
        return rows, None
    except requests.HTTPError as exc:
        message = "Meta ad-set context was unavailable; campaign analysis still completed."
        if exc.response is not None:
            try:
                message = ((exc.response.json() or {}).get("error") or {}).get("message") or message
            except Exception:
                pass
        return [], message


def sync_campaign_performance(
    uid: str,
    date_range: str = "LAST_30_DAYS",
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    access_token = _access_token_for(uid)
    account_id, connection = _selected_account_for(uid)
    insight_date_params, normalized_range = _insight_date_params(
        date_range, start_date=start_date, end_date=end_date
    )

    campaign_items = _paged_rows(
        f"{account_id}/campaigns",
        access_token=access_token,
        params={
            "fields": CAMPAIGN_FIELDS,
            "limit": 100,
        },
        max_rows=500,
    )

    insight_items = _paged_rows(
        f"{account_id}/insights",
        access_token=access_token,
        params={
            "level": "campaign",
            **insight_date_params,
            "fields": INSIGHT_FIELDS,
            "limit": 100,
        },
        max_rows=500,
    )

    daily_insight_items = _paged_rows(
        f"{account_id}/insights",
        access_token=access_token,
        params={
            "level": "campaign",
            **insight_date_params,
            "time_increment": 1,
            "fields": INSIGHT_FIELDS,
            "limit": 100,
        },
        max_rows=20000,
    )
    daily_campaign_performance = [
        _insight_row(item) for item in daily_insight_items
        if item.get("campaign_id") and item.get("date_start")
    ]

    insights_by_campaign = {
        row["campaignId"]: row
        for row in (_insight_row(item) for item in insight_items)
        if row.get("campaignId")
    }

    campaign_ids = {
        str(item.get("id") or "")
        for item in campaign_items
        if item.get("id")
    }
    rows = [
        _campaign_row(
            item,
            insights_by_campaign.get(str(item.get("id") or "")),
        )
        for item in campaign_items
    ]

    for campaign_id, insight in insights_by_campaign.items():
        if campaign_id not in campaign_ids:
            rows.append(
                _campaign_row(
                    {
                        "id": campaign_id,
                        "name": insight.get("campaignName"),
                    },
                    insight,
                )
            )

    rows.sort(
        key=lambda row: (
            _safe_float(row.get("spend")),
            _safe_int(row.get("impressions")),
            str(row.get("name") or "").lower(),
        ),
        reverse=True,
    )

    summary = _summary(rows)
    ad_sets, ad_set_warning = _sync_adset_context(
        account_id=account_id,
        access_token=access_token,
        insight_date_params=insight_date_params,
    )

    return {
        "ok": True,
        "dateRange": normalized_range,
        "datePreset": insight_date_params.get("date_preset"),
        "adAccountId": account_id,
        "adAccountName": connection.get("selectedAdAccountName"),
        "currency": connection.get("selectedCurrency"),
        "timeZone": connection.get("selectedTimeZone"),
        "campaignCount": len(rows),
        "summary": summary,
        "campaigns": rows[:200],
        "adSetCount": len(ad_sets),
        "adSets": ad_sets[:1000],
        "adSetContextWarning": ad_set_warning,
        "dailyCampaignPerformance": daily_campaign_performance,
    }

# ---------------- Creative-level reporting ----------------
AD_FIELDS = ",".join(
    [
        "id",
        "name",
        "status",
        "effective_status",
        "campaign{id,name}",
        "adset{id,name}",
        "creative{id,name}",
        "created_time",
        "updated_time",
    ]
)

AD_INSIGHT_FIELDS = ",".join(
    [
        "ad_id",
        "ad_name",
        "adset_id",
        "adset_name",
        "campaign_id",
        "campaign_name",
        "impressions",
        "reach",
        "frequency",
        "clicks",
        "inline_link_clicks",
        "spend",
        "ctr",
        "cpc",
        "cpm",
        "actions",
        "action_values",
    ]
)

CREATIVE_FIELDS = ",".join(
    [
        "id",
        "name",
        "title",
        "body",
        "thumbnail_url",
        "image_url",
        "effective_object_story_id",
        "object_story_spec",
        "asset_feed_spec",
    ]
)


def _first_text(items: Any) -> str | None:
    for item in items or []:
        if isinstance(item, dict):
            value = item.get("text") or item.get("url")
        else:
            value = item
        cleaned = str(value or "").strip()
        if cleaned:
            return cleaned
    return None


def _creative_content(creative: dict[str, Any]) -> dict[str, Any]:
    object_story = creative.get("object_story_spec") or {}
    link_data = object_story.get("link_data") or {}
    video_data = object_story.get("video_data") or {}
    photo_data = object_story.get("photo_data") or {}
    asset_feed = creative.get("asset_feed_spec") or {}

    headline = (
        creative.get("title")
        or link_data.get("name")
        or video_data.get("title")
        or _first_text(asset_feed.get("titles"))
    )
    primary_text = (
        creative.get("body")
        or link_data.get("message")
        or video_data.get("message")
        or photo_data.get("message")
        or _first_text(asset_feed.get("bodies"))
    )
    description = (
        link_data.get("description")
        or video_data.get("link_description")
        or _first_text(asset_feed.get("descriptions"))
    )

    cta_obj = link_data.get("call_to_action") or video_data.get("call_to_action") or {}
    cta_type = cta_obj.get("type") or _first_text(asset_feed.get("call_to_action_types"))
    cta_value = cta_obj.get("value") or {}

    destination_url = (
        cta_value.get("link")
        or link_data.get("link")
        or video_data.get("link")
        or _first_text(asset_feed.get("link_urls"))
    )

    image_url = (
        creative.get("image_url")
        or link_data.get("picture")
        or video_data.get("image_url")
        or _first_text(asset_feed.get("images"))
    )
    thumbnail_url = creative.get("thumbnail_url") or image_url

    video_id = video_data.get("video_id")
    if not video_id:
        videos = asset_feed.get("videos") or []
        if videos and isinstance(videos[0], dict):
            video_id = videos[0].get("video_id")

    media_type = "video" if video_id else ("image" if (image_url or thumbnail_url) else "text")

    return {
        "headline": str(headline or "").strip() or None,
        "primaryText": str(primary_text or "").strip() or None,
        "description": str(description or "").strip() or None,
        "ctaType": str(cta_type or "").strip() or None,
        "destinationUrl": str(destination_url or "").strip() or None,
        "imageUrl": str(image_url or "").strip() or None,
        "thumbnailUrl": str(thumbnail_url or "").strip() or None,
        "videoId": str(video_id or "").strip() or None,
        "mediaType": media_type,
        "effectiveObjectStoryId": creative.get("effective_object_story_id"),
    }


def _ad_insight_row(item: dict[str, Any]) -> dict[str, Any]:
    row = _insight_row({
        **item,
        "campaign_id": item.get("campaign_id"),
        "campaign_name": item.get("campaign_name"),
    })
    row.update({
        "adId": str(item.get("ad_id") or ""),
        "adName": item.get("ad_name") or "Meta ad",
        "adSetId": str(item.get("adset_id") or ""),
        "adSetName": item.get("adset_name") or "Meta ad set",
    })
    return row


def _creative_details(access_token: str, creative_ids: list[str]) -> dict[str, dict[str, Any]]:
    details: dict[str, dict[str, Any]] = {}
    clean = list(dict.fromkeys(str(value) for value in creative_ids if value))
    for start in range(0, len(clean), 50):
        batch = clean[start:start + 50]
        payload = _graph_get(
            "",
            access_token=access_token,
            params={"ids": ",".join(batch), "fields": CREATIVE_FIELDS},
        )
        for creative_id, item in payload.items():
            if isinstance(item, dict):
                details[str(creative_id)] = item
    return details


def sync_creative_performance(
    uid: str,
    date_range: str = "LAST_30_DAYS",
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    access_token = _access_token_for(uid)
    account_id, connection = _selected_account_for(uid)
    insight_date_params, normalized_range = _insight_date_params(
        date_range, start_date=start_date, end_date=end_date
    )

    ads = _paged_rows(
        f"{account_id}/ads",
        access_token=access_token,
        params={"fields": AD_FIELDS, "limit": 100},
        max_rows=1000,
    )
    insights = _paged_rows(
        f"{account_id}/insights",
        access_token=access_token,
        params={
            "level": "ad",
            **insight_date_params,
            "fields": AD_INSIGHT_FIELDS,
            "limit": 100,
        },
        max_rows=1000,
    )
    insight_by_ad = {
        row["adId"]: row
        for row in (_ad_insight_row(item) for item in insights)
        if row.get("adId")
    }

    creative_ids = [
        str((item.get("creative") or {}).get("id") or "")
        for item in ads
    ]
    details = _creative_details(access_token, creative_ids)

    rows: list[dict[str, Any]] = []
    for item in ads:
        ad_id = str(item.get("id") or "")
        campaign = item.get("campaign") or {}
        adset = item.get("adset") or {}
        creative_ref = item.get("creative") or {}
        creative_id = str(creative_ref.get("id") or "")
        creative = details.get(creative_id) or creative_ref
        content = _creative_content(creative)
        metrics = insight_by_ad.get(ad_id) or {
            "impressions": 0, "reach": 0, "frequency": 0, "clicks": 0,
            "linkClicks": 0, "spend": 0, "ctr": 0, "cpc": 0, "cpm": 0,
            "conversions": 0, "purchases": 0, "leads": 0,
            "conversionValue": 0, "cpa": None, "roas": None,
        }
        rows.append({
            "adId": ad_id,
            "adName": item.get("name") or metrics.get("adName") or "Meta ad",
            "status": item.get("status"),
            "effectiveStatus": item.get("effective_status"),
            "campaignId": str(campaign.get("id") or metrics.get("campaignId") or ""),
            "campaignName": campaign.get("name") or metrics.get("campaignName") or "Meta campaign",
            "adSetId": str(adset.get("id") or metrics.get("adSetId") or ""),
            "adSetName": adset.get("name") or metrics.get("adSetName") or "Meta ad set",
            "creativeId": creative_id or None,
            "creativeName": creative.get("name") or creative_ref.get("name"),
            "createdTime": item.get("created_time"),
            "updatedTime": item.get("updated_time"),
            **content,
            **{k: v for k, v in metrics.items() if k not in {
                "adId", "adName", "adSetId", "adSetName", "campaignId", "campaignName"
            }},
        })

    rows.sort(key=lambda row: (_safe_float(row.get("spend")), _safe_int(row.get("impressions"))), reverse=True)
    return {
        "ok": True,
        "dateRange": normalized_range,
        "adAccountId": account_id,
        "adAccountName": connection.get("selectedAdAccountName"),
        "currency": connection.get("selectedCurrency"),
        "creativeCount": len(rows),
        "creatives": rows,
    }

