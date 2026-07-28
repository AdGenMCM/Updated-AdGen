from google_auth_oauthlib.flow import Flow

from .config import get_settings


GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords"
OPENID_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]


def build_flow(*, state: str | None = None) -> Flow:
    settings = get_settings()
    if not settings.oauth_ready:
        raise RuntimeError("Google Ads OAuth environment variables are incomplete.")

    client_config = {
        "web": {
            "client_id": settings.client_id,
            "client_secret": settings.client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.redirect_uri],
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=[GOOGLE_ADS_SCOPE, *OPENID_SCOPES],
        state=state,
    )
    flow.redirect_uri = settings.redirect_uri
    return flow


def authorization_url(state: str) -> str:
    flow = build_flow(state=state)
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return url
