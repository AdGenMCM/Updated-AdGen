import os
from dataclasses import dataclass


@dataclass(frozen=True)
class GoogleAdsSettings:
    client_id: str
    client_secret: str
    redirect_uri: str
    developer_token: str
    frontend_url: str
    token_encryption_key: str

    @property
    def oauth_ready(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    @property
    def api_ready(self) -> bool:
        return bool(self.oauth_ready and self.developer_token)


def get_settings() -> GoogleAdsSettings:
    return GoogleAdsSettings(
        client_id=(os.getenv("GOOGLE_ADS_CLIENT_ID") or "").strip(),
        client_secret=(os.getenv("GOOGLE_ADS_CLIENT_SECRET") or "").strip(),
        redirect_uri=(os.getenv("GOOGLE_ADS_REDIRECT_URI") or "").strip(),
        developer_token=(os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN") or "").strip(),
        frontend_url=(os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/"),
        token_encryption_key=(os.getenv("GOOGLE_ADS_TOKEN_ENCRYPTION_KEY") or "").strip(),
    )
