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
from performance_intelligence.store import get_summary as get_learning_summary
from .metrics import aggregate, derive, num

def _campaign(row: dict[str, Any], provider: str, label: str) -> dict[str, Any]:
    return derive({"provider":provider,"providerLabel":label,"campaignId":str(row.get("id") or row.get("campaignId") or ""),
      "campaignName":row.get("name") or row.get("campaignName") or "Untitled campaign","status":row.get("status") or row.get("effectiveStatus") or "UNKNOWN",
      "impressions":row.get("impressions"),"clicks":row.get("clicks"),"spend":row.get("spend"),"conversions":row.get("conversions"),
      "conversionValue":row.get("conversionValue") or row.get("revenue"),"date":row.get("date") or row.get("reportDate"),
      "adGroupId":row.get("adGroupId") or row.get("adsetId"),"adGroupName":row.get("adGroupName") or row.get("adsetName"),
      "device":row.get("device"),"country":row.get("country"),"placement":row.get("placement")})

def _provider(
    connection: dict[str, Any],
    provider: str,
    label: str,
    daily_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    rows = [_campaign(r, provider, label) for r in connection.get("campaigns") or []]
    normalized_daily = [_campaign(r, provider, label) for r in (daily_rows or [])]
    account_id = connection.get("selectedCustomerId") if provider == "google_ads" else connection.get("selectedAdAccountId")
    return {
        "provider": provider,
        "connected": connection.get("status") == "connected",
        "selected": bool(account_id),
        "accountId": account_id,
        "accountName": connection.get("selectedCustomerName") if provider == "google_ads" else connection.get("selectedAdAccountName"),
        "lastSyncedAt": connection.get("lastSyncAt"),
        "dateRange": connection.get("lastSyncDateRange") or "Last synced range",
        "campaignCount": len(rows),
        "count": len(rows),
        "dailyRowCount": len(normalized_daily),
        "totals": aggregate(rows),
        "summary": aggregate(rows),
        "campaigns": rows,
        "dailyCampaignPerformance": normalized_daily,
    }


def _library(uid: str) -> dict[str, Any]:
    db=firestore.client(); rows=[]
    for collection_name, kind in (("image_jobs","Image"),("video_jobs","Video")):
        for snap in db.collection(collection_name).where("uid","==",uid).stream():
            raw=snap.to_dict() or {}; p=raw.get("performance") or {}
            if not any(p.get(k) not in (None,"") for k in ("impressions","clicks","spend","conversions","revenue","conversion_value","roas","ctr")) and not p.get("marked_successful"): continue
            rows.append(derive({"provider":"library_performance","providerLabel":"Library Performance","creativeId":snap.id,
              "creativeName":raw.get("productName") or raw.get("title") or f"{kind} creative","creativeType":kind,
              "campaignName":p.get("campaign_name") or p.get("campaignName") or "Library Performance","platform":p.get("platform") or raw.get("platform") or "Manual",
              "status":"Winner" if p.get("marked_successful") else "Tracked","notes":p.get("notes") or "",
              "impressions":p.get("impressions"),"clicks":p.get("clicks"),"spend":p.get("spend"),"conversions":p.get("conversions"),
              "conversionValue":p.get("revenue") or p.get("conversion_value"),"performanceDate":p.get("date") or p.get("performance_date") or raw.get("updatedAt") or raw.get("createdAt")}))
    totals=aggregate(rows)
    return {"provider":"library_performance","connected":True,"selected":bool(rows),"accountName":"ADGen Library","lastSyncedAt":None,
      "creativeCount":len(rows),"count":len(rows),"totals":totals,"summary":totals,"creatives":rows}

def reporting_snapshot(uid: str) -> dict[str, Any]:
    learning = get_learning_summary(uid) or {}
    google_connection = get_google_connection(uid) or {}
    meta_connection = get_meta_connection(uid) or {}
    return {
        "googleAds": _provider(
            google_connection,
            "google_ads",
            "Google Ads",
            list_google_daily(uid, account_id=google_connection.get("selectedCustomerId")),
        ),
        "metaAds": _provider(
            meta_connection,
            "meta_ads",
            "Meta Ads",
            list_meta_daily(uid, account_id=meta_connection.get("selectedAdAccountId")),
        ),
        "libraryPerformance": _library(uid),
        "learning": {
            "confidence": learning.get("confidence") or 0,
            "creativeAssetCount": learning.get("creativeAssetCount") or 0,
            "independentResultCount": learning.get("independentResultCount") or 0,
            "qualifiedIndependentResultCount": learning.get("qualifiedCount") or 0,
            "positiveIndependentResultCount": learning.get("positiveCount") or 0,
            "updatedAt": learning.get("updatedAt"),
        },
    }
