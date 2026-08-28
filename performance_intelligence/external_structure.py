from typing import Any


def _present(value: Any):
    return True if str(value or "").strip() else None


def infer_external_creative_elements(*, source: str, headline=None, body=None, cta=None):
    """Infer only positive presence from already-synced platform fields.
    Missing fields remain unknown; logo is unknown. No vision/model call occurs.
    """
    return {
        "source": "inferred_from_platform",
        "platform": source,
        "headline": _present(headline),
        "body": _present(body),
        "cta": _present(cta),
        "logoMode": None,
    }
