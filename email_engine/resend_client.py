from __future__ import annotations

from typing import Any, Dict, Optional

from .config import get_email_config


class EmailConfigurationError(RuntimeError):
    pass


class EmailProviderError(RuntimeError):
    pass


def _extract_provider_id(response: Any) -> Optional[str]:
    if response is None:
        return None

    if isinstance(response, dict):
        value = response.get("id")
        if value:
            return str(value)

        data = response.get("data")
        if isinstance(data, dict) and data.get("id"):
            return str(data["id"])

    value = getattr(response, "id", None)
    if value:
        return str(value)

    data = getattr(response, "data", None)
    if isinstance(data, dict) and data.get("id"):
        return str(data["id"])

    return None


def send_resend_email(
    *,
    to_email: str,
    subject: str,
    html: str,
) -> Dict[str, Optional[str]]:
    config = get_email_config()
    if not config.configured:
        raise EmailConfigurationError(
            "Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL."
        )

    try:
        import resend
    except ImportError as error:
        raise EmailConfigurationError(
            "The Resend Python package is not installed. Run: pip install resend"
        ) from error

    resend.api_key = config.api_key

    payload: Dict[str, Any] = {
        "from": config.from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    if config.reply_to:
        payload["reply_to"] = config.reply_to

    try:
        response = resend.Emails.send(payload)
    except Exception as error:
        raise EmailProviderError(f"Resend send failed: {error}") from error

    return {
        "provider": "resend",
        "providerMessageId": _extract_provider_id(response),
    }
