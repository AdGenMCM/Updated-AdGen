# providers/ideogram.py
import os, requests

IDEOGRAM_URL = "https://api.ideogram.ai/v1/ideogram-v3/generate"

def _get_api_key() -> str:
    key = os.getenv("IDEOGRAM_API_KEY", "").strip()
    return key

def generate_ideogram(prompt: str, aspect_ratio: str = "1x1",
                      rendering_speed: str = "DEFAULT", num_images: int = 1):
    api_key = _get_api_key()
    if not api_key:
        raise RuntimeError("IDEOGRAM_API_KEY is missing in environment")

    files = {
        "prompt": (None, prompt),
        "aspect_ratio": (None, aspect_ratio),
        "rendering_speed": (None, rendering_speed),
        "num_images": (None, str(num_images)),
    }
    resp = requests.post(
        IDEOGRAM_URL,
        headers={"Api-Key": api_key},  # must be exactly this header
        files=files,
        timeout=120,
    )
    resp.raise_for_status()

    data = resp.json().get("data", [])
    results = []
    for i, item in enumerate(data):
        url = item["url"]
        img = requests.get(url, timeout=120).content
        path = f"/tmp/ideogram_{i}.png"
        with open(path, "wb") as f:
            f.write(img)
        results.append(path)
    return results


