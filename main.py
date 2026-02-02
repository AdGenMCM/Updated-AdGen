# main.py
import os
import base64
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

# Stripe router (separate file)
from stripe_server import stripe_router

load_dotenv(override=True)

app = FastAPI()

# ---------------- CORS ----------------
FRONTEND_URL = (os.getenv("FRONTEND_URL") or "").rstrip("/")
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://adgenmcm.com",
    "https://www.adgenmcm.com",
]
if FRONTEND_URL:
    origins.append(FRONTEND_URL)

# Deduplicate
origins = list(dict.fromkeys(origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,   # keep consistent with what you had deployed
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Basic health ----------------
@app.get("/")
def root():
    return {"status": "ok", "service": "AdGen backend"}

# ---------------- OpenAI + Ideogram ----------------
OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
IDEOGRAM_API_KEY = (os.getenv("IDEOGRAM_API_KEY") or "").strip()

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is missing.")
if not IDEOGRAM_API_KEY:
    raise RuntimeError("IDEOGRAM_API_KEY is missing.")

client = OpenAI(api_key=OPENAI_API_KEY)

# ✅ Make Ideogram import resilient to either layout:
# - providers/ideogram.py
# - ideogram.py at repo root
try:
    from providers.ideogram import generate_ideogram  # type: ignore
except Exception:
    from ideogram import generate_ideogram  # type: ignore


class AdRequest(BaseModel):
    product_name: str
    description: str
    audience: str
    tone: str
    platform: str
    imageSize: str  # "1024x1024" | "1024x1792" | "1792x1024"


def size_to_aspect_ratio(size: str) -> str:
    s = size.lower().replace(" ", "")
    if s in ("1024x1792", "720x1280", "1080x1920"):
        return "9x16"
    if s in ("1792x1024", "1280x720", "1920x1080"):
        return "16x9"
    return "1x1"


@app.post("/generate-ad")
def generate_ad(payload: AdRequest):
    prompt = (
        f"Create a compelling {payload.tone.lower()} ad for {payload.product_name}, "
        f'described as: "{payload.description}". '
        f"Target it to {payload.audience} on {payload.platform}. Make it short and catchy."
    )

    try:
        chat_response = client.chat.completions.create(
            model="gpt-4-turbo",
            messages=[
                {"role": "system", "content": "You are a creative ad copywriter."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
        )
        ad_text = chat_response.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenAI text generation failed: {e}")

    aspect_ratio = size_to_aspect_ratio(payload.imageSize)
    visual_prompt = (
        f"Studio product photograph for a {payload.tone.lower()} {payload.platform} ad "
        f"featuring {payload.product_name}. Clean composition, brand-safe, "
        f"gradient or soft background, negative space reserved for headline area, "
        f"no overlays, no labels on background, natural lighting, high contrast, balanced framing."
    )

    try:
        paths = generate_ideogram(
            prompt=visual_prompt,
            aspect_ratio=aspect_ratio,
            rendering_speed="DEFAULT",
            num_images=1,
        )
        if not paths:
            raise HTTPException(status_code=502, detail="Ideogram returned no images")

        image_path = paths[0]
        with open(image_path, "rb") as f:
            img_bytes = f.read()

        b64 = base64.b64encode(img_bytes).decode("utf-8")
        data_url = f"data:image/png;base64,{b64}"
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ideogram image generation failed: {e}")

    return {"text": ad_text, "imageUrl": data_url}


# ---------------- Stripe routes (kept separate) ----------------
# This is the line that makes /create-checkout-session etc appear in /docs
app.include_router(stripe_router)
