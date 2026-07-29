import os
from dataclasses import dataclass


@dataclass(frozen=True)
class MetaAdsSettings:
    app_id: str
    app_secret: str
    redirect_uri: str
    frontend_url: str
    graph_api_version: str
    token_encryption_key: str

    @property
    def oauth_ready(self) -> bool:
        return bool(
            self.app_id
            and self.app_secret
            and self.redirect_uri
            and self.token_encryption_key
        )

    @property
    def graph_base_url(self) -> str:
        return f"https://graph.facebook.com/{self.graph_api_version}"


def get_settings() -> MetaAdsSettings:
    return MetaAdsSettings(
        app_id=(os.getenv("META_APP_ID") or "").strip(),
        app_secret=(os.getenv("META_APP_SECRET") or "").strip(),
        redirect_uri=(os.getenv("META_REDIRECT_URI") or "").strip(),
        frontend_url=(os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/"),
        graph_api_version=(os.getenv("META_GRAPH_API_VERSION") or "v25.0").strip(),
        token_encryption_key=(os.getenv("META_ADS_TOKEN_ENCRYPTION_KEY") or "").strip(),
    )
