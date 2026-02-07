# providers/ideogram.py
import os
import time
from typing import List, Optional

import requests

# Ideogram v3 endpoint (multipart/form-data)
IDEOGRAM_URL = "https://api.ideogram.ai/v1/ideogram-v3/generate"


def _api_key() -> str:
    key = (os.getenv("IDEOGRAM_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("IDEOGRAM_API_KEY is missing from environment")
    return key


def _download_image(url: str, out_path: str, timeout: int = 120) -> None:
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        f.write(r.content)


def generate_ideogram(
    prompt: str,
    aspect_ratio: str = "1x1",               # "1x1", "4x5", "9x16", etc.
    rendering_speed: str = "DEFAULT",        # "DEFAULT" or "TURBO" (if supported on your plan)
    num_images: int = 1,
    magic_prompt: str = "OFF",               # ✅ reduces prompt drift
    negative_prompt: Optional[str] = None,   # ✅ true negative prompt
    style_type: str = "REALISTIC",           # helps keep it photorealistic
    seed: Optional[int] = None,              # optional for repeatability
    out_dir: str = "/tmp",
    timeout: int = 120,
    max_retries: int = 2,
) -> List[str]:
    """
    Calls Ideogram v3 generate endpoint and downloads images to disk.
    Returns list of file paths.

    Uses multipart/form-data "files" payload (as required by Ideogram v3).
    """

    headers = {"Api-Key": _api_key()}

    # Multipart fields — each entry is (filename, value) with filename None
    files = {
        "prompt": (None, prompt),
        "aspect_ratio": (None, aspect_ratio),
        "rendering_speed": (None, rendering_speed),
        "num_images": (None, str(num_images)),
        "magic_prompt": (None, magic_prompt),
        "style_type": (None, style_type),
    }
    if negative_prompt:
        files["negative_prompt"] = (None, negative_prompt)
    if seed is not None:
        files["seed"] = (None, str(seed))

    last_err = None

    for attempt in range(max_retries + 1):
        try:
            resp = requests.post(
                IDEOGRAM_URL,
                headers=headers,
                files=files,
                timeout=timeout,
            )
            resp.raise_for_status()

            payload = resp.json()
            data = payload.get("data") or []
            if not data:
                raise RuntimeError(f"Ideogram returned no images. Response: {payload}")

            paths: List[str] = []
            for i, item in enumerate(data):
                url = item.get("url")
                if not url:
                    raise RuntimeError(f"Ideogram response missing image url: {item}")

                out_path = os.path.join(out_dir, f"ideogram_{int(time.time())}_{attempt}_{i}.png")
                _download_image(url, out_path, timeout=timeout)
                paths.append(out_path)

            return paths

        except Exception as e:
            last_err = e
            # brief backoff then retry
            if attempt < max_retries:
                time.sleep(0.75 * (attempt + 1))
            else:
                break

    raise RuntimeError(f"Ideogram generation failed after retries: {last_err}")



