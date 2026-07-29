from urllib.parse import urlencode

import requests

from .config import get_settings


META_ADS_SCOPES = ["ads_read", "business_management"]


def authorization_url(state: str) -> str:
    settings = get_settings()
    if not settings.oauth_ready:
        raise RuntimeError("Meta Ads OAuth environment variables are incomplete.")

    query = urlencode(
        {
            "client_id": settings.app_id,
            "redirect_uri": settings.redirect_uri,
            "state": state,
            "response_type": "code",
            "scope": ",".join(META_ADS_SCOPES),
        }
    )
    return f"https://www.facebook.com/{settings.graph_api_version}/dialog/oauth?{query}"


def exchange_code_for_access_token(code: str) -> dict:
    settings = get_settings()
    response = requests.get(
        f"{settings.graph_base_url}/oauth/access_token",
        params={
            "client_id": settings.app_id,
            "client_secret": settings.app_secret,
            "redirect_uri": settings.redirect_uri,
            "code": code,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json() or {}


def exchange_for_long_lived_token(short_lived_token: str) -> dict:
    settings = get_settings()
    response = requests.get(
        f"{settings.graph_base_url}/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": settings.app_id,
            "client_secret": settings.app_secret,
            "fb_exchange_token": short_lived_token,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json() or {}


def fetch_meta_identity(access_token: str) -> dict:
    settings = get_settings()
    response = requests.get(
        f"{settings.graph_base_url}/me",
        params={"fields": "id,name,email", "access_token": access_token},
        timeout=20,
    )
    response.raise_for_status()
    return response.json() or {}
