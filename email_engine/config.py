from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class EmailConfig:
    api_key: str
    from_email: str
    reply_to: str
    app_url: str

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.from_email)


def get_email_config() -> EmailConfig:
    return EmailConfig(
        api_key=(os.getenv("RESEND_API_KEY") or "").strip(),
        from_email=(
            os.getenv("RESEND_FROM_EMAIL")
            or "ADGen <hello@updates.adgenmcm.com>"
        ).strip(),
        reply_to=(
            os.getenv("RESEND_REPLY_TO")
            or "support@adgenmcm.com"
        ).strip(),
        app_url=(
            os.getenv("ADGEN_APP_URL")
            or "https://adgenmcm.com"
        ).strip().rstrip("/"),
    )
