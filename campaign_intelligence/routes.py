from __future__ import annotations

import time
from typing import Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Query

from integrations.google_ads.service import fetch_campaign_summary, fetch_daily_campaign_history
from integrations.google_ads.store import (
    get_connection as get_google_connection,
    save_sync_summary as save_google_sync_summary,
    save_daily_campaign_performance as save_google_daily,
)
from integrations.meta_ads.service import sync_campaign_performance as sync_meta_campaign_performance
from integrations.meta_ads.store import (
    get_connection as get_meta_connection,
    save_campaign_sync as save_meta_campaign_sync,
    save_campaign_sync_error as save_meta_sync_error,
    save_daily_campaign_performance as save_meta_daily,
)

from .auth import require_campaign_intelligence_user
from .models import CampaignAnalysisRequest, CampaignBriefingResponse
from .service import build_briefing
from .store import list_briefings

router = APIRouter(prefix="/campaign-intelligence", tags=["Campaign Intelligence"])


def _error_text(exc: Exception) -> str:
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        try:
            payload = exc.response.json() or {}
            error = payload.get("error") or {}
            return str(error.get("message") or payload or exc)
        except Exception:
            return exc.response.text[:500] or str(exc)
    return str(exc)


def _sync_google(uid: str, date_range: str) -> dict[str, Any]:
    connection = get_google_connection(uid) or {}
    customer_id = connection.get("selectedCustomerId")
    if connection.get("status") != "connected" or not customer_id:
        return {"platform": "google_ads", "status": "skipped", "message": "Google Ads is not connected or no account is selected."}

    report = fetch_campaign_summary(
        uid,
        customer_id=customer_id,
        login_customer_id=connection.get("loginCustomerId"),
        start_date=date_range,
    )
    daily = fetch_daily_campaign_history(
        uid,
        customer_id=customer_id,
        login_customer_id=connection.get("loginCustomerId"),
        start_date=date_range,
    )
    synced_at = int(time.time())
    save_google_sync_summary(
        uid,
        summary=report.get("summary") or {},
        campaigns=report.get("campaigns") or [],
        synced_at=synced_at,
        date_range=report.get("dateRange") or date_range,
    )
    save_google_daily(
        uid,
        account_id=customer_id,
        rows=daily.get("dailyCampaignPerformance") or [],
        synced_at=synced_at,
    )
    return {
        "platform": "google_ads",
        "status": "success",
        "campaignCount": len(report.get("campaigns") or []),
        "historyRows": len(daily.get("dailyCampaignPerformance") or []),
        "syncedAt": synced_at,
    }


def _sync_meta(uid: str, date_range: str) -> dict[str, Any]:
    connection = get_meta_connection(uid) or {}
    account_id = connection.get("selectedAdAccountId")
    if connection.get("status") != "connected" or not account_id:
        return {"platform": "meta_ads", "status": "skipped", "message": "Meta Ads is not connected or no account is selected."}

    try:
        result = sync_meta_campaign_performance(uid, date_range=date_range)
        save_meta_campaign_sync(
            uid,
            date_range=result.get("dateRange") or date_range,
            summary=result.get("summary") or {},
            campaigns=result.get("campaigns") or [],
        )
        save_meta_daily(
            uid,
            account_id=account_id,
            rows=result.get("dailyCampaignPerformance") or [],
        )
        return {
            "platform": "meta_ads",
            "status": "success",
            "campaignCount": len(result.get("campaigns") or []),
            "historyRows": len(result.get("dailyCampaignPerformance") or []),
            "syncedAt": int(time.time()),
        }
    except Exception as exc:
        save_meta_sync_error(uid, _error_text(exc))
        raise


@router.get("/briefing", response_model=CampaignBriefingResponse)
def campaign_intelligence_briefing(
    date_range: str = Query(default="LAST_30_DAYS"),
    platforms: str = Query(default="all"),
    user=Depends(require_campaign_intelligence_user),
):
    try:
        return build_briefing(user["uid"], date_range=date_range, platform_filter=platforms)
    except HTTPException:
        raise
    except Exception as exc:
        print("CAMPAIGN INTELLIGENCE ERROR:", repr(exc), flush=True)
        raise HTTPException(status_code=500, detail="Campaign Intelligence could not prepare the briefing.") from exc


@router.post("/analyze")
def analyze_campaigns(
    payload: CampaignAnalysisRequest,
    user=Depends(require_campaign_intelligence_user),
):
    uid = user["uid"]
    date_range = payload.dateRange
    platform_filter = payload.platforms
    platform_results: list[dict[str, Any]] = []

    selected = ["google_ads", "meta_ads"] if platform_filter == "all" else [platform_filter]
    for platform in selected:
        try:
            result = _sync_google(uid, date_range) if platform == "google_ads" else _sync_meta(uid, date_range)
            platform_results.append(result)
        except Exception as exc:
            print(f"CAMPAIGN INTELLIGENCE {platform} SYNC ERROR:", repr(exc), flush=True)
            platform_results.append({
                "platform": platform,
                "status": "error",
                "message": _error_text(exc),
            })

    successful = [item for item in platform_results if item.get("status") == "success"]
    if not successful:
        connected_or_error = [item for item in platform_results if item.get("status") != "skipped"]
        if connected_or_error:
            # Keep the page usable and return the last stored briefing context alongside errors.
            briefing = build_briefing(uid, date_range=date_range, platform_filter=platform_filter)
            return {"ok": False, "partial": True, "platformResults": platform_results, "briefing": briefing}

    briefing = build_briefing(uid, date_range=date_range, platform_filter=platform_filter)
    return {
        "ok": all(item.get("status") != "error" for item in platform_results),
        "partial": any(item.get("status") in {"error", "skipped"} for item in platform_results),
        "platformResults": platform_results,
        "briefing": briefing,
    }


@router.get("/history")
def campaign_intelligence_history(
    limit: int = Query(default=20, ge=1, le=100),
    user=Depends(require_campaign_intelligence_user),
):
    return {"items": list_briefings(user["uid"], limit=limit)}
