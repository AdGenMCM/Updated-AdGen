import base64
import json
import os
import re
from collections import Counter
from typing import Any

import requests
from openai import OpenAI

URGENCY_WORDS = {
    "now", "today", "limited", "hurry", "ends", "last chance",
    "exclusive", "instant", "fast", "quick",
}
BENEFIT_WORDS = {
    "save", "grow", "improve", "increase", "reduce", "better",
    "faster", "easier", "more", "less", "free", "simplify",
}
ACTION_WORDS = {
    "start", "try", "shop", "buy", "learn", "discover", "get",
    "join", "book", "download", "create", "generate",
}


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def analyze_copy(
    *,
    headline: str | None = None,
    body: str | None = None,
    cta: str | None = None,
) -> dict[str, Any]:
    headline = _clean_text(headline)
    body = _clean_text(body)
    cta = _clean_text(cta)
    combined = " ".join(part for part in [headline, body, cta] if part)
    lower = combined.lower()
    words = re.findall(r"[A-Za-z0-9']+", combined)
    headline_words = re.findall(r"[A-Za-z0-9']+", headline)
    cta_words = re.findall(r"[A-Za-z0-9']+", cta)

    first_headline_word = (
        headline_words[0].lower() if headline_words else None
    )
    first_cta_word = cta_words[0].lower() if cta_words else None

    return {
        "headline": headline or None,
        "body": body or None,
        "cta": cta or None,
        "headline_length": len(headline),
        "headline_word_count": len(headline_words),
        "body_length": len(body),
        "body_word_count": len(re.findall(r"[A-Za-z0-9']+", body)),
        "cta_length": len(cta),
        "cta_word_count": len(cta_words),
        "starts_with_action": first_headline_word in ACTION_WORDS,
        "cta_starts_with_action": first_cta_word in ACTION_WORDS,
        "benefit_first": bool(
            first_headline_word in BENEFIT_WORDS
            or any(
                headline.lower().startswith(word + " ")
                for word in BENEFIT_WORDS
            )
        ),
        "contains_urgency": any(word in lower for word in URGENCY_WORDS),
        "contains_number": bool(re.search(r"\d", combined)),
        "contains_question": "?" in combined,
        "contains_exclamation": "!" in combined,
        "contains_price": bool(
            re.search(r"\$\s?\d|\d+\s?%|\bfree\b", lower)
        ),
        "all_caps_ratio": round(
            sum(1 for char in combined if char.isupper())
            / max(sum(1 for char in combined if char.isalpha()), 1),
            4,
        ),
        "first_headline_word": first_headline_word,
        "first_cta_word": first_cta_word,
        "top_words": [
            word
            for word, _count in Counter(
                word.lower()
                for word in words
                if len(word) > 3
            ).most_common(8)
        ],
    }


def _download_as_data_url(url: str) -> str:
    response = requests.get(url, timeout=25)
    response.raise_for_status()
    content_type = response.headers.get(
        "content-type",
        "image/jpeg",
    ).split(";")[0]
    encoded = base64.b64encode(response.content).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def _parse_json_response(text: str) -> dict[str, Any]:
    cleaned = str(text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(
            r"^```(?:json)?\s*|\s*```$",
            "",
            cleaned,
            flags=re.I | re.S,
        )
    return json.loads(cleaned)


def analyze_image(
    image_url: str,
    *,
    model: str | None = None,
) -> dict[str, Any]:
    if not image_url:
        return {}

    client = OpenAI()
    vision_model = (
        model
        or os.getenv("OPENAI_VISION_MODEL")
        or os.getenv("OPENAI_TEXT_MODEL")
        or "gpt-5.5"
    )

    data_url = _download_as_data_url(image_url)

    response = client.responses.create(
        model=vision_model,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Analyze this advertising creative. Return only "
                            "valid JSON with these keys: dominant_colors "
                            "(array of simple color names), visual_style, "
                            "composition, background_type, lighting, "
                            "product_present, product_prominence_percent, "
                            "human_present, human_count, lifestyle_vs_studio, "
                            "logo_visible, logo_prominence, text_overlay_level "
                            "(none/low/medium/high), text_position, "
                            "cta_visible, cta_position, contrast_level "
                            "(low/medium/high), emotional_tone, "
                            "aspect_orientation, notable_elements (array), "
                            "creative_summary. Do not identify real people."
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": data_url,
                    },
                ],
            }
        ],
    )
    return _parse_json_response(response.output_text)


def analyze_video_metadata(
    *,
    duration_seconds: float | None = None,
    title: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    return {
        "duration_seconds": duration_seconds,
        "title": _clean_text(title) or None,
        "source": source,
        "visual_analysis_status": "pending_frame_analysis",
    }
