# runway_client.py
import os
from typing import Any, Dict, Optional
import httpx

RUNWAY_API_BASE = (os.getenv("RUNWAY_API_BASE") or "https://api.dev.runwayml.com").rstrip("/")
RUNWAY_API_KEY = (os.getenv("RUNWAY_API_KEY") or "").strip()
RUNWAY_VERSION = (os.getenv("RUNWAY_VERSION") or "2024-11-06").strip()

# ✅ Default TTS model (Runway currently expects this for /v1/text_to_speech)
RUNWAY_TTS_MODEL = (os.getenv("RUNWAY_TTS_MODEL") or "eleven_multilingual_v2").strip()


class RunwayError(Exception):
    pass


def _strip_wrapping_quotes(s: str) -> str:
    s = (s or "").strip()
    if len(s) >= 2 and ((s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'")):
        return s[1:-1].strip()
    return s


def _headers() -> Dict[str, str]:
    if not RUNWAY_API_KEY:
        raise RunwayError("RUNWAY_API_KEY is missing.")
    return {
        "Authorization": f"Bearer {RUNWAY_API_KEY}",
        "Content-Type": "application/json",
        "X-Runway-Version": RUNWAY_VERSION,
    }


async def _post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{RUNWAY_API_BASE}{path}"
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(url, headers=_headers(), json=payload)
    except httpx.TimeoutException as e:
        raise RunwayError(f"Runway timeout calling {path}: {e}") from e
    except httpx.RequestError as e:
        raise RunwayError(f"Runway network error calling {path}: {e}") from e

    if r.status_code >= 400:
        raise RunwayError(f"{path} failed: {r.status_code} {r.text}")
    try:
        return r.json()
    except Exception as e:
        raise RunwayError(f"{path} returned non-JSON: {r.text[:300]}") from e


async def _get(path: str) -> Dict[str, Any]:
    url = f"{RUNWAY_API_BASE}{path}"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.get(url, headers=_headers())
    except httpx.TimeoutException as e:
        raise RunwayError(f"Runway timeout calling {path}: {e}") from e
    except httpx.RequestError as e:
        raise RunwayError(f"Runway network error calling {path}: {e}") from e

    if r.status_code >= 400:
        raise RunwayError(f"{path} failed: {r.status_code} {r.text}")
    try:
        return r.json()
    except Exception as e:
        raise RunwayError(f"{path} returned non-JSON: {r.text[:300]}") from e


async def create_image_to_video(
    *,
    model: str,
    prompt_text: str,
    prompt_image: str,
    duration: int,
    ratio: str,
) -> str:
    data = await _post(
        "/v1/image_to_video",
        {
            "model": _strip_wrapping_quotes(model),
            "promptText": prompt_text,
            "promptImage": prompt_image,
            "duration": duration,
            "ratio": ratio,
        },
    )
    task_id = data.get("id")
    if not task_id:
        raise RunwayError(f"image_to_video missing task id: {data}")
    return task_id


async def create_text_to_video(
    *,
    model: str,
    prompt_text: str,
    duration: int,
    ratio: str,
    audio: bool = False,
) -> str:
    clean_model = _strip_wrapping_quotes(model)

    ratio_map = {
        "1920:1080": "1280:720",
        "1080:1920": "720:1280",
    }

    clean_ratio = ratio_map.get(ratio, ratio)

    print(
        f"[Runway] prompt generation path=/v1/text_to_video "
        f"model={clean_model} duration={duration} ratio={clean_ratio}"
    )

    data = await _post(
        "/v1/text_to_video",
        {
            "model": clean_model,
            "promptText": prompt_text,
            "duration": duration,
            "ratio": clean_ratio,
            "audio": audio,
        },
    )

    task_id = data.get("id")
    if not task_id:
        raise RunwayError(f"text_to_video missing task id: {data}")

    return task_id

# ✅ FIX: include model + sanitize accidental quotes from env
async def create_text_to_speech(*, prompt_text: str, preset_voice: str) -> str:
    # Per Runway docs, model must be EXACTLY this value
    model = "eleven_multilingual_v2"

    voice_id = (preset_voice or "Leslie").strip()

    payload = {
        "model": model,
        "promptText": prompt_text,
        "voice": {
            "type": "runway-preset",
            "presetId": voice_id,
        },
    }

    data = await _post("/v1/text_to_speech", payload)

    task_id = data.get("id")
    if not task_id:
        raise RunwayError(f"text_to_speech missing task id: {data}")
    return task_id


async def create_sound_effect(
    *,
    prompt_text: str,
    duration: int,
    model: str = "eleven_text_to_sound_v2",
) -> str:
    clean_prompt = " ".join((prompt_text or "").split())
    if len(clean_prompt) > 450:
        clean_prompt = clean_prompt[:450].rsplit(" ", 1)[0].rstrip(" ,;:-") + "."

    payload = {
        "model": _strip_wrapping_quotes(model),
        "promptText": clean_prompt,
        "duration": max(0.5, min(30.0, float(duration))),
    }
    data = await _post("/v1/sound_effect", payload)
    task_id = data.get("id")
    if not task_id:
        raise RunwayError(f"sound_effect missing task id: {data}")
    return task_id


async def create_text_to_image(
    *,
    prompt_text: str,
    ratio: str,
    model: str = "gen4_image",
) -> str:
    clean_prompt = " ".join((prompt_text or "").split()).strip()
    if not clean_prompt:
        raise RunwayError("text_to_image prompt is empty.")
    if len(clean_prompt) > 1000:
        clean_prompt = clean_prompt[:1000].rsplit(" ", 1)[0].rstrip(" ,;:-") + "."

    payload = {
        "model": _strip_wrapping_quotes(model),
        "promptText": clean_prompt,
        "ratio": ratio,
    }
    data = await _post("/v1/text_to_image", payload)
    task_id = data.get("id")
    if not task_id:
        raise RunwayError(f"text_to_image missing task id: {data}")
    return task_id


async def create_avatar_video(
    *,
    script: str,
    preset_voice: str,
    avatar_preset: str = "influencer",
) -> str:
    data = await _post(
        "/v1/avatar_videos",
        {
            "model": "gwm1_avatars",
            "avatar": {
                "type": "runway-preset",
                "presetId": avatar_preset,
            },
            "speech": {
                "type": "text",
                "text": script,
                "voice": {
                    "type": "preset",
                    "presetId": preset_voice,
                },
            },
        },
    )
    task_id = data.get("id")
    if not task_id:
        raise RunwayError(f"avatar_videos missing task id: {data}")
    return task_id


async def create_character_performance(
    *,
    reference_video: str,
    ratio: str,
    character_image: str | None = None,
    character_video: str | None = None,
) -> str:
    if character_image:
        character = {
            "type": "image",
            "uri": character_image,
        }
    elif character_video:
        character = {
            "type": "video",
            "uri": character_video,
        }
    else:
        raise RunwayError("character_performance requires a character image or video.")

    data = await _post(
        "/v1/character_performance",
        {
            "model": "act_two",
            "character": character,
            "reference": {
                "type": "video",
                "uri": reference_video,
            },
            "ratio": ratio,
        },
    )
    task_id = data.get("id")
    if not task_id:
        raise RunwayError(f"character_performance missing task id: {data}")
    return task_id


async def get_task(task_id: str) -> Dict[str, Any]:
    return await _get(f"/v1/tasks/{task_id}")


def extract_first_output_url(task: Dict[str, Any]) -> Optional[str]:
    out = task.get("output")
    if isinstance(out, list) and out:
        if isinstance(out[0], str):
            return out[0]
        if isinstance(out[0], dict):
            return out[0].get("url") or out[0].get("uri")
    return None
async def create_multi_shot_video(
    *,
    shots: list[dict[str, Any]],
    duration: int,
    ratio: str,
    audio: bool = True,
    version: str = "2026-06",
    first_frame: Optional[str] = None,
) -> str:
    """Create a Runway Multi-Shot Video recipe task in custom mode."""
    payload: Dict[str, Any] = {
        "version": version,
        "mode": "custom",
        "duration": int(duration),
        "ratio": ratio,
        "audio": bool(audio),
        "shots": shots,
    }
    if first_frame:
        payload["firstFrame"] = {"uri": first_frame}

    data = await _post("/v1/recipes/multi_shot_video", payload)
    task_id = data.get("id")
    if not task_id:
        raise RunwayError(f"multi_shot_video missing task id: {data}")
    return task_id
