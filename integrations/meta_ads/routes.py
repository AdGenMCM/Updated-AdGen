from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from .auth import require_meta_ads_user
from .config import get_settings
from .models import OAuthStartResponse, SelectAdAccountBody
from .oauth import (
    authorization_url,
    exchange_code_for_access_token,
    exchange_for_long_lived_token,
    fetch_meta_identity,
)
from .service import (
    list_accessible_ad_accounts,
    validate_accessible_ad_account,
    sync_campaign_performance,
    sync_creative_performance,
)
from .store import (
    consume_oauth_state,
    create_oauth_state,
    disconnect,
    get_connection,
    save_connection,
    save_selected_ad_account,
    save_campaign_sync,
    save_campaign_sync_error,
    save_creative_sync,
    list_creative_sync,
    save_creative_sync_error,
    save_daily_campaign_performance,
)


router = APIRouter(
    prefix="/integrations/meta-ads",
    tags=["Meta Ads"],
)


def _frontend_redirect(**params) -> RedirectResponse:
    settings = get_settings()
    query = urlencode(
        {key: value for key, value in params.items() if value is not None}
    )
    return RedirectResponse(
        url=f"{settings.frontend_url}/insights?{query}",
        status_code=302,
    )


def _meta_error(exc: requests.HTTPError, fallback: str):
    detail = fallback
    if exc.response is not None:
        try:
            payload = exc.response.json() or {}
            error = payload.get("error") or {}
            detail = error.get("message") or payload or fallback
        except Exception:
            detail = exc.response.text[:500] or fallback
    return detail


@router.get("/status")
def meta_ads_status(user=Depends(require_meta_ads_user)):
    settings = get_settings()
    connection = get_connection(user["uid"]) or {}

    return {
        "connected": connection.get("status") == "connected",
        "metaUserId": connection.get("metaUserId"),
        "metaName": connection.get("metaName"),
        "metaEmail": connection.get("metaEmail"),
        "selectedAdAccountId": connection.get("selectedAdAccountId"),
        "selectedAdAccountName": connection.get("selectedAdAccountName"),
        "selectedBusinessId": connection.get("selectedBusinessId"),
        "selectedBusinessName": connection.get("selectedBusinessName"),
        "selectedCurrency": connection.get("selectedCurrency"),
        "selectedTimeZone": connection.get("selectedTimeZone"),
        "selectedAccountStatus": connection.get("selectedAccountStatus"),
        "connectedAt": connection.get("connectedAt"),
        "tokenExpiresAt": connection.get("tokenExpiresAt"),
        "lastSyncAt": connection.get("lastSyncAt"),
        "campaignCount": int(connection.get("campaignCount") or 0),
        "summary": connection.get("summary") or {},
        "campaigns": connection.get("campaigns") or [],
        "creativeCount": int(connection.get("creativeCount") or 0),
        "lastCreativeSyncAt": connection.get("lastCreativeSyncAt"),
        "oauthConfigured": settings.oauth_ready,
        "graphApiVersion": settings.graph_api_version,
    }


@router.post("/oauth/start", response_model=OAuthStartResponse)
def start_meta_ads_oauth(user=Depends(require_meta_ads_user)):
    try:
        state = create_oauth_state(user["uid"])
        return {"authorizationUrl": authorization_url(state)}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/oauth/callback", include_in_schema=False)
def meta_ads_oauth_callback(
    state: str = Query(default=""),
    code: str = Query(default=""),
    error: str = Query(default=""),
    error_reason: str = Query(default=""),
):
    if error:
        return _frontend_redirect(
            meta_ads="error",
            reason=error_reason or error,
        )

    try:
        uid = consume_oauth_state(state)
        if not code:
            raise ValueError("Meta did not return an authorization code.")

        short_token_payload = exchange_code_for_access_token(code)
        short_token = short_token_payload.get("access_token")
        if not short_token:
            raise RuntimeError("Meta did not return an access token.")

        long_token_payload = exchange_for_long_lived_token(short_token)
        access_token = long_token_payload.get("access_token") or short_token
        expires_in = (
            long_token_payload.get("expires_in")
            or short_token_payload.get("expires_in")
        )

        identity = fetch_meta_identity(access_token)

        save_connection(
            uid,
            access_token=access_token,
            expires_in=expires_in,
            scope="ads_read business_management",
            meta_user_id=str(identity.get("id") or "") or None,
            meta_name=identity.get("name"),
            meta_email=identity.get("email"),
        )

        return _frontend_redirect(meta_ads="connected")
    except requests.HTTPError as exc:
        print(
            "META ADS OAUTH CALLBACK HTTP ERROR:",
            _meta_error(exc, "Meta rejected the OAuth request."),
            flush=True,
        )
        return _frontend_redirect(
            meta_ads="error",
            reason="meta_oauth_rejected",
        )
    except Exception as exc:
        print("META ADS OAUTH CALLBACK ERROR:", repr(exc), flush=True)
        return _frontend_redirect(
            meta_ads="error",
            reason="connection_failed",
        )


@router.get("/accounts")
def meta_ads_accounts(user=Depends(require_meta_ads_user)):
    if not get_connection(user["uid"]):
        raise HTTPException(status_code=409, detail="Meta Ads is not connected.")

    try:
        accounts = list_accessible_ad_accounts(user["uid"])
        return {"accounts": accounts, "accountCount": len(accounts)}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except requests.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=_meta_error(
                exc,
                "Meta rejected the ad-account request.",
            ),
        ) from exc


@router.post("/account")
def choose_meta_ads_account(
    payload: SelectAdAccountBody,
    user=Depends(require_meta_ads_user),
):
    if not get_connection(user["uid"]):
        raise HTTPException(status_code=409, detail="Meta Ads is not connected.")

    try:
        account = validate_accessible_ad_account(
            user["uid"],
            payload.adAccountId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except requests.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=_meta_error(exc, "Meta could not verify this ad account."),
        ) from exc

    save_selected_ad_account(
        user["uid"],
        ad_account_id=account["adAccountId"],
        ad_account_name=account.get("name") or payload.adAccountName,
        business_id=account.get("businessId") or payload.businessId,
        business_name=account.get("businessName") or payload.businessName,
        currency=account.get("currency"),
        time_zone=account.get("timeZone"),
        account_status=account.get("accountStatus"),
    )

    return {"ok": True, **account}


@router.post("/sync")
def sync_meta_ads_campaigns(
    date_range: str = Query(default="LAST_30_DAYS"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    user=Depends(require_meta_ads_user),
):
    connection = get_connection(user["uid"]) or {}
    if connection.get("status") != "connected":
        raise HTTPException(status_code=409, detail="Meta Ads is not connected.")
    if not connection.get("selectedAdAccountId"):
        raise HTTPException(
            status_code=409,
            detail="Choose a Meta ad account before syncing campaign data.",
        )

    try:
        result = sync_campaign_performance(
            user["uid"],
            date_range=date_range,
            start_date=start_date,
            end_date=end_date,
        )
        save_campaign_sync(
            user["uid"],
            date_range=result["dateRange"],
            summary=result["summary"],
            campaigns=result["campaigns"],
        )
        save_daily_campaign_performance(
            user["uid"],
            account_id=connection.get("selectedAdAccountId") or "",
            rows=result.get("dailyCampaignPerformance") or [],
        )
        return result
    except ValueError as exc:
        save_campaign_sync_error(user["uid"], str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        save_campaign_sync_error(user["uid"], str(exc))
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except requests.HTTPError as exc:
        detail = _meta_error(
            exc,
            "Meta could not retrieve campaign performance.",
        )
        save_campaign_sync_error(user["uid"], str(detail))
        raise HTTPException(status_code=502, detail=detail) from exc
    except Exception as exc:
        print("META ADS SYNC ERROR:", repr(exc), flush=True)
        save_campaign_sync_error(
            user["uid"],
            "Meta campaign synchronization failed.",
        )
        raise HTTPException(
            status_code=500,
            detail="Meta campaign synchronization failed.",
        ) from exc


@router.post("/creative-sync")
def sync_meta_ads_creatives(
    date_range: str = Query(default="LAST_30_DAYS"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    user=Depends(require_meta_ads_user),
):
    connection = get_connection(user["uid"]) or {}
    if connection.get("status") != "connected":
        raise HTTPException(status_code=409, detail="Meta Ads is not connected.")
    if not connection.get("selectedAdAccountId"):
        raise HTTPException(status_code=409, detail="Choose a Meta ad account before syncing creatives.")
    try:
        result = sync_creative_performance(
            user["uid"], date_range=date_range, start_date=start_date, end_date=end_date
        )
        save_creative_sync(
            user["uid"],
            date_range=result["dateRange"],
            creatives=result["creatives"],
        )
        return result
    except (ValueError, RuntimeError) as exc:
        save_creative_sync_error(user["uid"], str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except requests.HTTPError as exc:
        detail = _meta_error(exc, "Meta could not retrieve creative performance.")
        save_creative_sync_error(user["uid"], str(detail))
        raise HTTPException(status_code=502, detail=detail) from exc


@router.get("/creatives")
def meta_ads_creatives(
    limit: int = Query(default=500, ge=1, le=1000),
    user=Depends(require_meta_ads_user),
):
    rows = list_creative_sync(user["uid"], limit=limit)
    return {"creatives": rows, "creativeCount": len(rows)}


@router.delete("/connection")
def disconnect_meta_ads(user=Depends(require_meta_ads_user)):
    disconnect(user["uid"])
    return {"ok": True}
