from urllib.parse import urlencode
import time

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from .auth import require_google_ads_user
from .config import get_settings
from .models import OAuthStartResponse, SelectCustomerBody
from .oauth import authorization_url, build_flow
from .service import (
    list_accessible_customers,
    fetch_campaign_summary,
    fetch_daily_campaign_history,
    fetch_creative_assets,
)
from .store import (
    consume_oauth_state,
    create_oauth_state,
    disconnect,
    get_connection,
    save_connection,
    save_selected_customer,
    save_sync_summary,
    save_daily_campaign_performance,
)


router = APIRouter(
    prefix="/integrations/google-ads",
    tags=["Google Ads"],
)


def _frontend_redirect(**params) -> RedirectResponse:
    settings = get_settings()
    query = urlencode({k: v for k, v in params.items() if v is not None})
    return RedirectResponse(
        url=f"{settings.frontend_url}/insights?{query}",
        status_code=302,
    )


def _google_error(exc: requests.HTTPError, fallback: str):
    detail = fallback
    if exc.response is not None:
        try:
            detail = exc.response.json()
        except Exception:
            detail = exc.response.text[:500] or detail
    return detail


@router.get("/status")
def google_ads_status(user=Depends(require_google_ads_user)):
    settings = get_settings()
    connection = get_connection(user["uid"]) or {}

    return {
        "connected": connection.get("status") == "connected",
        "googleEmail": connection.get("googleEmail"),
        "selectedCustomerId": connection.get("selectedCustomerId"),
        "selectedCustomerName": connection.get("selectedCustomerName"),
        "loginCustomerId": connection.get("loginCustomerId"),
        "selectedCustomerIsManager": bool(
            connection.get("selectedCustomerIsManager")
        ),
        "connectedAt": connection.get("connectedAt"),
        "lastSyncAt": connection.get("lastSyncAt"),
        "campaignCount": int(connection.get("campaignCount") or 0),
        "summary": connection.get("summary") or {},
        "campaigns": connection.get("campaigns") or [],
        "campaignContextWarning": connection.get("campaignContextWarning"),
        "lastSyncDateRange": connection.get("lastSyncDateRange"),
        "oauthConfigured": settings.oauth_ready,
        "apiConfigured": settings.api_ready,
        "developerTokenConfigured": bool(settings.developer_token),
    }


@router.post("/oauth/start", response_model=OAuthStartResponse)
def start_google_ads_oauth(user=Depends(require_google_ads_user)):
    try:
        state = create_oauth_state(user["uid"])
        return {"authorizationUrl": authorization_url(state)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/oauth/callback", include_in_schema=False)
def google_ads_oauth_callback(
    state: str = Query(default=""),
    code: str = Query(default=""),
    error: str = Query(default=""),
):
    if error:
        return _frontend_redirect(google_ads="error", reason=error)

    try:
        uid = consume_oauth_state(state)
        if not code:
            raise ValueError("Google did not return an authorization code.")

        flow = build_flow(state=state)
        flow.fetch_token(code=code)
        credentials = flow.credentials

        google_email = None
        try:
            userinfo = requests.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={
                    "Authorization": f"Bearer {credentials.token}"
                },
                timeout=15,
            )
            if userinfo.ok:
                google_email = userinfo.json().get("email")
        except Exception:
            google_email = None

        save_connection(
            uid,
            refresh_token=credentials.refresh_token or "",
            scope=" ".join(credentials.scopes or []),
            google_email=google_email,
        )
        return _frontend_redirect(google_ads="connected")
    except Exception as exc:
        print(
            "GOOGLE ADS OAUTH CALLBACK ERROR:",
            repr(exc),
            flush=True,
        )
        return _frontend_redirect(
            google_ads="error",
            reason="connection_failed",
        )


@router.get("/customers")
def google_ads_customers(user=Depends(require_google_ads_user)):
    if not get_connection(user["uid"]):
        raise HTTPException(
            status_code=409,
            detail="Google Ads is not connected.",
        )

    try:
        return {
            "customers": list_accessible_customers(user["uid"])
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except requests.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=_google_error(
                exc,
                "Google Ads rejected the account request.",
            ),
        ) from exc


@router.post("/customer")
def choose_google_ads_customer(
    payload: SelectCustomerBody,
    user=Depends(require_google_ads_user),
):
    customer_id = "".join(
        ch for ch in payload.customerId if ch.isdigit()
    )
    login_customer_id = "".join(
        ch for ch in (payload.loginCustomerId or "") if ch.isdigit()
    ) or None

    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid Google Ads customer ID.",
        )

    if payload.manager:
        raise HTTPException(
            status_code=400,
            detail=(
                "Choose an advertiser account rather than a manager account."
            ),
        )

    save_selected_customer(
        user["uid"],
        customer_id,
        payload.customerName,
        login_customer_id=login_customer_id,
        manager=payload.manager,
    )
    return {
        "ok": True,
        "selectedCustomerId": customer_id,
        "selectedCustomerName": payload.customerName,
        "loginCustomerId": login_customer_id,
    }



@router.get("/assets")
def get_google_ads_assets(
    date_range: str = Query(default="LAST_30_DAYS"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    user=Depends(require_google_ads_user),
):
    """Fetch Google Ads creative assets live.

    Results are returned directly to the browser and are intentionally not
    written to Firestore or Firebase Storage.
    """
    connection = get_connection(user["uid"]) or {}
    customer_id = connection.get("selectedCustomerId")
    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="Choose a Google Ads advertiser account first.",
        )

    normalized_range = str(date_range or "LAST_30_DAYS").strip().upper()

    try:
        assets = fetch_creative_assets(
            user["uid"],
            customer_id=customer_id,
            login_customer_id=connection.get("loginCustomerId"),
            date_range=normalized_range,
            start_date=start_date,
            end_date=end_date,
        )
        return {
            "assets": assets,
            "assetCount": len(assets),
            "dateRange": (f"{start_date}:{end_date}" if normalized_range == "CUSTOM" else normalized_range),
            "storageMode": "live_only",
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print("GOOGLE ADS LIVE ASSET FETCH FAILED:", repr(exc), flush=True)
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve Google Ads creative assets.",
        ) from exc


@router.post("/sync")
def sync_google_ads(
    date_range: str = Query(default="LAST_30_DAYS"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    user=Depends(require_google_ads_user),
):
    settings = get_settings()
    if not settings.developer_token:
        raise HTTPException(
            status_code=503,
            detail="Google Ads developer token is not configured yet.",
        )

    connection = get_connection(user["uid"])
    if not connection:
        raise HTTPException(
            status_code=409,
            detail="Google Ads is not connected.",
        )

    customer_id = connection.get("selectedCustomerId")
    if not customer_id:
        raise HTTPException(
            status_code=409,
            detail="Choose a Google Ads account before refreshing data.",
        )

    normalized_range = str(date_range or "LAST_30_DAYS").strip().upper()

    try:
        report = fetch_campaign_summary(
            user["uid"],
            customer_id=customer_id,
            login_customer_id=connection.get("loginCustomerId"),
            start_date=normalized_range,
            custom_start_date=start_date,
            custom_end_date=end_date,
        )
        daily_report = fetch_daily_campaign_history(
            user["uid"],
            customer_id=customer_id,
            login_customer_id=connection.get("loginCustomerId"),
            start_date=normalized_range,
            custom_start_date=start_date,
            custom_end_date=end_date,
        )
        synced_at = int(time.time())

        save_sync_summary(
            user["uid"],
            summary=report.get("summary") or {},
            campaigns=report.get("campaigns") or [],
            synced_at=synced_at,
            date_range=report.get("dateRange") or normalized_range,
            campaign_context_warning=report.get("campaignContextWarning"),
        )
        save_daily_campaign_performance(
            user["uid"],
            account_id=customer_id,
            rows=daily_report.get("dailyCampaignPerformance") or [],
            synced_at=synced_at,
        )

        return {
            "ok": True,
            "lastSyncAt": synced_at,
            "dateRange": report.get("dateRange") or normalized_range,
            "dailyHistoryRowCount": len(
                daily_report.get("dailyCampaignPerformance") or []
            ),
            **report,
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except requests.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=_google_error(
                exc,
                "Google Ads rejected the reporting request.",
            ),
        ) from exc


@router.delete("/connection")
def disconnect_google_ads(user=Depends(require_google_ads_user)):
    disconnect(user["uid"])
    return {"ok": True}
