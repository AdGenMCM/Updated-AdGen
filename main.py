# main.py
import os
import base64
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

# Stripe router (separate file)
from stripe_server import stripe_router

# Firebase auth + Firestore
from auth_helpers import get_db, get_bearer_token, verify_firebase_token
from usage_caps import check_and_increment_usage, peek_usage, get_tier_and_status

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

origins = list(dict.fromkeys(origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
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

class ContactForm(BaseModel):
    name: str
    email: str
    message: str


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


@app.get("/usage")
def get_usage(authorization: str | None = Header(default=None)):
    uid, _ = require_user(authorization)
    db = get_db()

    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, _status = get_tier_and_status(user_doc)

    return peek_usage(db, uid, tier)


@app.post("/contact")
def send_contact_email(payload: ContactForm):
    # Reads Gmail SMTP settings from environment variables.
    # Required:
    #   EMAIL_HOST=smtp.gmail.com
    #   EMAIL_PORT=587
    #   EMAIL_USER=adgenmcm@gmail.com
    #   EMAIL_PASS=<16-char Gmail App Password>
    host = (os.getenv("EMAIL_HOST") or "").strip()
    port_raw = (os.getenv("EMAIL_PORT") or "").strip()
    user = (os.getenv("EMAIL_USER") or "").strip()
    app_pass = (os.getenv("EMAIL_PASS") or "").strip()

    if not host or not port_raw or not user or not app_pass:
        raise HTTPException(
            status_code=500,
            detail="Email service is not configured (missing EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASS).",
        )

    try:
        port = int(port_raw)
    except ValueError:
        raise HTTPException(status_code=500, detail="EMAIL_PORT must be an integer.")

    try:
        msg = EmailMessage()
        msg["Subject"] = f"New Contact Form Message from {payload.name}"
        msg["From"] = user
        msg["To"] = "adgenmcm@gmail.com"
        msg["Reply-To"] = payload.email

        msg.set_content(
            "New contact form submission:\n\n"
            f"Name: {payload.name}\n"
            f"Email: {payload.email}\n\n"
            "Message:\n"
            f"{payload.message}\n"
        )

        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, app_pass)
            server.send_message(msg)

        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send contact email: {str(e)}")


@app.post("/generate-ad")
def generate_ad(payload: AdRequest, authorization: str | None = Header(default=None)):
    # 1) Auth
    uid, _email = require_user(authorization)

    # 2) Load tier/status from Firestore
    db = get_db()
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, status = get_tier_and_status(user_doc)

    # If you want to require an active subscription for non-trial tiers,
    # you can tighten this later. For now:
    # - allow trialing/active
    # - allow missing tier => treat as trial cap
    allowed_statuses = {"active", "trialing"}
    if status not in allowed_statuses and tier not in (None, "trial_monthly"):
        raise HTTPException(
            status_code=402,
            detail="Subscription inactive. Please subscribe to continue.",
        )

    # 3) Cap enforcement (transactional)
    cap_result = check_and_increment_usage(db, uid, tier)
    if not cap_result["allowed"]:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "You’ve reached your monthly ad generation limit. Upgrade to continue.",
                "used": cap_result["used"],
                "cap": cap_result["cap"],
                "month": cap_result["month"],
                # Frontend can send user to /account for Stripe portal button
                "upgradePath": "/account",
            },
        )

    # 4) Generate text (OpenAI)
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

    # 5) Generate image (Ideogram)
    aspect_ratio = size_to_aspect_ratio(payload.imageSize)
    visual_prompt = (
        f"Studio product photograph for a {payload.tone.lower()} {payload.platform} ad "
        f"featuring {payload.product_name}. Clean composition, brand-safe, "
        f"gradient or soft background, negative space reserved for headline area, "
        f"no overlays, no labels on background, no letters, no lettering, no text, no words, "
        f"natural lighting, high contrast, balanced framing."
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

    return {
        "text": ad_text,
        "imageUrl": data_url,
        "usage": {
            "used": cap_result["used"],
            "cap": cap_result["cap"],
            "month": cap_result["month"],
            "remaining": max(0, cap_result["cap"] - cap_result["used"]),
        },
    }


# ---------------- Stripe routes (kept separate) ----------------
app.include_router(stripe_router)



