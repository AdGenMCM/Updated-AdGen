# main.py
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
import os
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import base64

from providers.ideogram import generate_ideogram

from auth_helpers import get_db, get_bearer_token, verify_firebase_token
from usage_caps import check_and_increment_usage, peek_usage
from stripe_server import stripe_router

load_dotenv(override=True)

# --- API key checks ---
openai_key = os.getenv("OPENAI_API_KEY")
if not openai_key:
    raise RuntimeError("OPENAI_API_KEY is missing. Check your .env file.")

ideogram_key = os.getenv("IDEOGRAM_API_KEY")
if not ideogram_key:
    raise RuntimeError("IDEOGRAM_API_KEY is missing. Check your .env file.")

client = OpenAI(api_key=openai_key)

app = FastAPI()

# ---------------- CORS ----------------
FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://adgenmcm.com",
    "https://www.adgenmcm.com",
]
if FRONTEND_URL:
    origins.append(FRONTEND_URL)
origins = list(dict.fromkeys(origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Stripe routes on same service/domain
app.include_router(stripe_router)


@app.get("/")
def root():
    return {"status": "ok", "service": "AdGen backend", "message": "Backend is running"}


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


def require_user(authorization: str | None):
    token = get_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization Bearer token.")
    try:
        claims = verify_firebase_token(token)
        uid = claims.get("uid")
        email = claims.get("email")
        if not uid:
            raise HTTPException(status_code=401, detail="Invalid auth token (no uid).")
        return uid, email
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token.")


def read_stripe_context(user_doc: dict):
    stripe = (user_doc or {}).get("stripe") or {}
    tier = stripe.get("tier") or stripe.get("requestedTier")  # fallback
    status = (stripe.get("status") or "inactive").lower()

    ps = stripe.get("currentPeriodStart")
    pe = stripe.get("currentPeriodEnd")

    try:
        ps = int(ps) if ps is not None else None
    except Exception:
        ps = None

    try:
        pe = int(pe) if pe is not None else None
    except Exception:
        pe = None

    return tier, status, ps, pe


@app.get("/usage")
def get_usage(authorization: str | None = Header(default=None)):
    uid, _ = require_user(authorization)
    db = get_db()

    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}

    tier, _status, ps, pe = read_stripe_context(user_doc)
    return peek_usage(db, uid, tier, ps, pe)


@app.post("/generate-ad")
def generate_ad(request: AdRequest, authorization: str | None = Header(default=None)):
    # 1) Auth
    uid, _email = require_user(authorization)

    # 2) Read subscription context (tier/status/billing cycle)
    db = get_db()
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, status, ps, pe = read_stripe_context(user_doc)

    # Optional: require paid users to be active/trialing; trial is allowed without subscription
    if tier and tier != "trial_monthly":
        if status not in {"active", "trialing"}:
            raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")

    # 3) Cap enforcement aligned to Stripe billing cycle
    cap_result = check_and_increment_usage(db, uid, tier, ps, pe)
    if not cap_result["allowed"]:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "You’ve reached your billing-cycle limit. Upgrade to continue.",
                "used": cap_result["used"],
                "cap": cap_result["cap"],
                "periodStart": cap_result.get("periodStart"),
                "periodEnd": cap_result.get("periodEnd"),
                "upgradePath": "/account",
            },
        )

    # 4) Generate ad copy (OpenAI)
    prompt = (
        f"Create a compelling {request.tone.lower()} ad for {request.product_name}, "
        f'a product described as: "{request.description}". '
        f"Target it to {request.audience} on {request.platform}. Make it short and catchy."
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

    # 5) Generate image via Ideogram provider
    aspect_ratio = size_to_aspect_ratio(request.imageSize)

    visual_prompt = (
        f"Studio product photograph for a {request.tone.lower()} {request.platform} ad "
        f"featuring {request.product_name}. Clean composition, brand-safe, "
        f"gradient or soft background, negative space reserved for headline area, "
        f"no overlays, no labels on background, natural lighting, high contrast, balanced framing."
    )

    negative_prompt = (
        "text, letters, words, numbers, typography, captions, hashtags, emojis, watermarks, "
        "logos, brandmarks, signage, packaging text, stickers, UI text, labels, handwriting"
    )

    try:
        paths = generate_ideogram(
            prompt=visual_prompt,
            aspect_ratio=aspect_ratio,
            rendering_speed="DEFAULT",
            num_images=1,
            # if your provider supports negative prompts, keep this line; otherwise remove it
            negative_prompt=negative_prompt,  # safe even if ignored by provider
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
    except TypeError:
        # Some provider wrappers don't accept negative_prompt
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
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ideogram image generation failed: {e}")

    return {
        "text": ad_text,
        "imageUrl": data_url,
        "usage": {
            "used": cap_result["used"],
            "cap": cap_result["cap"],
            "remaining": max(0, cap_result["cap"] - cap_result["used"]),
            "periodStart": cap_result.get("periodStart"),
            "periodEnd": cap_result.get("periodEnd"),
        },
    }

