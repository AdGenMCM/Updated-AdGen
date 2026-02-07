# main.py
from urllib.parse import quote
import os
from dotenv import load_dotenv
load_dotenv(override=True)
import re
import json
import uuid
import asyncio
import requests

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

# Stripe router (separate file)
from stripe_server import stripe_router

# Firebase auth + Firestore
from auth_helpers import get_db, get_bearer_token, verify_firebase_token
from usage_caps import check_and_increment_usage, peek_usage, get_tier_and_status

# admin dependency
from admin_guard import admin_required

# Feature gating + optimizer schemas
from entitlements import require_pro_or_business
from optimizer_schemas import OptimizeAdRequest, OptimizeAdResponse


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


@app.get("/admin/health", dependencies=[Depends(admin_required)])
def admin_health():
    return {"ok": True, "admin": True}


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


# ---------------- Models ----------------
class AdRequest(BaseModel):
    product_name: str
    description: str
    audience: str
    tone: str
    platform: str
    imageSize: str  # "1024x1024" | "1024x1792" | "1792x1024"

    offer: str | None = None
    goal: str | None = None
    stylePreset: str | None = None

    productType: str | None = None


class ContactForm(BaseModel):
    name: str
    email: str
    message: str


# ---------------- Helpers ----------------
def upload_png_to_firebase_storage(img_bytes: bytes, uid: str) -> str:
    """
    Upload PNG bytes to Firebase Storage and return a direct download URL.
    Uses firebaseStorageDownloadTokens so the URL can be fetched without auth.
    """
    # ✅ Lazy import (prevents early/default bucket behavior)
    from firebase_admin import storage

    bucket_name = (os.getenv("FIREBASE_STORAGE_BUCKET") or "").strip()
    if not bucket_name:
        raise RuntimeError("FIREBASE_STORAGE_BUCKET is missing.")

    bucket = storage.bucket(bucket_name)

    # ✅ quick proof (temporary) - remove after it works
    print("🔥 USING STORAGE BUCKET:", bucket.name)

    object_id = f"generated_ads/{uid}/{uuid.uuid4().hex}.png"
    token = uuid.uuid4().hex

    blob = bucket.blob(object_id)
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(img_bytes, content_type="image/png")

    return (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
        f"{quote(object_id, safe='')}?alt=media&token={token}"
    )



def _extract_json_object(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return {}


def size_to_aspect_ratio(size: str) -> str:
    s = (size or "").lower().replace(" ", "")
    if s in ("1024x1792", "720x1280", "1080x1920"):
        return "9x16"
    if s in ("1792x1024", "1280x720", "1920x1080"):
        return "16x9"
    return "1x1"


def is_admin(claims: dict) -> bool:
    return claims.get("role") == "admin"


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
        return uid, email, claims
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token.")


STYLE_HINTS = {
    "Minimal": "studio product hero shot, clean background, minimal props, crisp soft lighting",
    "Premium": "luxury editorial product hero shot, dramatic lighting, premium materials, high-end look",
    "Bold": "high contrast modern product photo, dynamic angle, punchy lighting, energetic composition",
    "Lifestyle": "lifestyle in-use scene in a realistic environment, natural daylight, candid composition",
    "UGC": "authentic user-generated style photo, handheld feel, casual environment, slight grain, imperfect framing",
}


# ✅ UPDATED: keyword-first + many more categories + productType normalized
def infer_visual_subject(product_name: str, description: str, product_type: str | None = None) -> str:
    pn = (product_name or "").lower()
    desc = (description or "").lower()
    text = f"{pn} {desc}".strip()

    def has_any(keys: list[str]) -> bool:
        return any(k in text for k in keys)

    # --- Food / Candy / Snacks (specific first) ---
    if has_any(["candy", "candies", "sweet", "sweets", "gummy", "gummies", "lollipop", "lollipops",
                "chocolate", "taffy", "caramel", "marshmallow", "sour candy"]):
        return "a colorful assortment of unbranded wrapped candies and gummies on a clean tabletop (no readable text)"

    if has_any(["ice cream", "gelato", "frozen yogurt", "sundae"]):
        return "a premium dessert hero shot featuring a generic ice cream cup or bowl (no readable text)"

    if has_any(["cookie", "cookies", "brownie", "cake", "cupcake", "donut", "doughnut", "pastry", "dessert"]):
        return "a premium dessert hero shot featuring generic baked goods on a clean surface (no readable text)"

    if has_any(["chips", "nachos", "pretzel", "popcorn", "snack", "snacks", "cracker", "crackers",
                "granola bar", "protein bar", "trail mix", "nuts"]):
        return "a premium snack hero shot featuring unbranded packaging or a snack assortment (no readable text)"

    if has_any(["pizza", "burger", "sandwich", "taco", "sushi", "salad", "meal", "restaurant", "takeout", "delivery"]):
        return "a delicious food hero shot plated on a clean tabletop scene (no readable text)"

    # --- Beverages ---
    if has_any(["coffee", "latte", "espresso", "cappuccino", "tea", "matcha"]):
        return "a premium café-style beverage scene with a generic cup and no branding (no readable text)"

    if has_any(["soda", "sparkling water", "soft drink", "energy drink", "beverage", "drink", "juice",
                "smoothie", "sports drink"]):
        return "a generic beverage container (can or bottle) with a completely blank label (no readable text)"

    if has_any(["beer", "wine", "whiskey", "vodka", "tequila", "cocktail"]):
        return "a premium beverage hero shot featuring generic glassware and unbranded bottle silhouettes (no readable text)"

    # --- Beauty / Personal Care ---
    if has_any(["skincare", "serum", "moisturizer", "cleanser", "toner", "sunscreen", "spf", "face mask"]):
        return "a minimalist skincare product set with blank labels (no readable text)"

    if has_any(["shampoo", "conditioner", "haircare", "hair", "styling", "pomade"]):
        return "a premium haircare bottle set with blank labels (no readable text)"

    if has_any(["makeup", "mascara", "lipstick", "foundation", "concealer", "blush", "eyeliner", "palette"]):
        return "a premium cosmetics flat-lay with unbranded items (no readable text)"

    if has_any(["perfume", "cologne", "fragrance"]):
        return "a luxury fragrance bottle silhouette with no branding (no readable text)"

    # --- Apparel / Accessories ---
    if has_any(["shirt", "tshirt", "t-shirt", "hoodie", "jacket", "dress", "apparel", "clothing"]):
        return "a clean apparel product hero shot with no logos (no readable text)"

    if has_any(["shoes", "sneakers", "boots", "footwear"]):
        return "a premium footwear product shot with no logos (no readable text)"

    if has_any(["watch", "jewelry", "necklace", "bracelet", "ring", "earrings"]):
        return "a luxury jewelry product shot (no branding, no readable text)"

    if has_any(["bag", "handbag", "backpack", "wallet", "purse"]):
        return "a premium accessory product shot with no logos and no readable text"

    # --- Tech / Electronics ---
    if has_any(["phone", "smartphone", "tablet", "laptop", "computer"]):
        return "a modern device mockup on a clean desk scene with blank, non-readable UI (no readable text)"

    if has_any(["headphones", "earbuds", "speaker", "audio"]):
        return "a clean product shot of generic audio gear with no logos (no readable text)"

    if has_any(["camera", "lens", "microphone", "mic"]):
        return "a premium product hero shot of generic creator gear with no logos (no readable text)"

    if has_any(["charger", "charging", "power bank", "usb", "cable"]):
        return "a clean product shot of generic charging accessories with no logos (no readable text)"

    # --- Home / Household ---
    if has_any(["candle", "diffuser", "essential oil", "home scent"]):
        return "a cozy home fragrance scene with unbranded candles/diffusers (no readable text)"

    if has_any(["cleaning", "detergent", "soap", "dish", "laundry", "disinfectant", "spray"]):
        return "a clean home cleaning product set with blank labels (no readable text)"

    if has_any(["furniture", "sofa", "chair", "table", "desk", "mattress"]):
        return "a bright interior lifestyle scene featuring generic furniture (no branding, no readable text)"

    if has_any(["kitchen", "cookware", "pan", "pot", "knife", "blender", "air fryer", "toaster"]):
        return "a clean kitchen product hero shot featuring generic cookware/appliance with no logos (no readable text)"

    # --- Fitness / Wellness ---
    if has_any(["supplement", "vitamin", "protein", "creatine", "preworkout", "pre-workout"]):
        return "a generic supplement jar with a completely blank label (no readable text)"

    if has_any(["gym", "fitness", "workout", "yoga", "pilates", "dumbbell", "kettlebell"]):
        return "a lifestyle fitness scene with generic gear and no branding (no readable text)"

    # --- Pets ---
    if has_any(["pet", "dog", "cat", "puppy", "kitten", "pet food", "kibble", "pet treats"]):
        return "a pet product hero shot with a generic bag/container with blank label and pet bowl (no readable text)"

    # --- Automotive ---
    if has_any(["car", "auto", "automotive", "tire", "oil", "wax", "detail", "detailing"]):
        return "a premium automotive product shot with generic car-care bottle silhouettes (no readable text)"

    # --- Tools / DIY ---
    if has_any(["tool", "drill", "hammer", "screwdriver", "wrench", "hardware", "diy"]):
        return "a clean product hero shot of generic tools on a workshop tabletop (no logos, no readable text)"

    # --- SaaS / App / Service ---
    if has_any(["app", "software", "saas", "website", "dashboard", "mobile app", "analytics", "platform"]):
        return "a modern smartphone or laptop mockup showing a generic dashboard UI with no readable text"

    if has_any(["course", "ebook", "book", "pdf", "guide", "workshop"]):
        return "a clean book/ebook cover mockup with abstract shapes (no readable text)"

    # --- productType fallback (only if keyword detection didn’t match) ---
    if product_type:
        pt = product_type.lower().strip()

        # normalize dropdown values like "Beverage / Food"
        if "beverage" in pt or "drink" in pt:
            return "a generic beverage container (can or bottle) with a completely blank label (no readable text)"
        if "food" in pt or "snack" in pt:
            return "a premium food/snack hero shot with unbranded packaging and no readable text"
        if "skincare" in pt or "cosmetic" in pt or "beauty" in pt:
            return "a minimalist cosmetic container set with blank labels (no readable text)"
        if "app" in pt or "software" in pt or "saas" in pt:
            return "a modern smartphone mockup showing a generic app interface with blank UI (no readable text)"
        if "electronics" in pt or "device" in pt or "tech" in pt:
            return "a clean product shot of a generic consumer device with no logos or text"
        if "apparel" in pt or "clothing" in pt:
            return "a clean product shot of apparel with no logos or text"

        return f"a clean hero product photo of a generic {pt} with no logos and no readable text"

    return "a clean hero product photo of a generic item that represents the product, with no logos and no readable text"


# ---------------- Usage ----------------
@app.get("/usage")
def get_usage(authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()

    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, _status = get_tier_and_status(user_doc)

    return peek_usage(db, uid, tier)


@app.get("/me")
def me(authorization: str | None = Header(default=None)):
    uid, email, claims = require_user(authorization)
    db = get_db()

    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, status = get_tier_and_status(user_doc)

    return {
        "uid": uid,
        "email": email,
        "tier": tier,
        "status": status,
        "isAdmin": is_admin(claims),
    }


# ---------------- Contact ----------------
@app.post("/contact")
def send_contact_email(payload: ContactForm):
    api_key = os.getenv("SENDGRID_API_KEY")
    from_email = os.getenv("CONTACT_FROM_EMAIL")
    to_email = os.getenv("CONTACT_TO_EMAIL", from_email)

    if not api_key:
        raise HTTPException(status_code=500, detail="SENDGRID_API_KEY not configured")
    if not from_email:
        raise HTTPException(status_code=500, detail="CONTACT_FROM_EMAIL not configured")

    subject = f"New Contact Form Message from {payload.name}"
    text_body = (
        f"New contact form submission:\n\n"
        f"Name: {payload.name}\n"
        f"Email: {payload.email}\n\n"
        f"Message:\n{payload.message}\n"
    )

    sendgrid_url = "https://api.sendgrid.com/v3/mail/send"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    data = {
        "personalizations": [{"to": [{"email": to_email}], "subject": subject}],
        "from": {"email": from_email, "name": "AdGen MCM"},
        "reply_to": {"email": payload.email},
        "content": [{"type": "text/plain", "value": text_body}],
    }

    try:
        response = requests.post(sendgrid_url, headers=headers, json=data, timeout=15)
        if response.status_code != 202:
            raise HTTPException(status_code=500, detail=f"SendGrid error: {response.status_code} {response.text}")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send contact email: {str(e)}")


# ---------------- Generate Ad ----------------
@app.post("/generate-ad")
async def generate_ad(payload: AdRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, status = get_tier_and_status(user_doc)

    if not admin:
        allowed_statuses = {"active", "trialing"}
        if status not in allowed_statuses and tier not in (None, "trial_monthly"):
            raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")

        cap_result = check_and_increment_usage(db, uid, tier)
        if not cap_result["allowed"]:
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "You’ve reached your monthly ad generation limit. Upgrade to continue.",
                    "used": cap_result["used"],
                    "cap": cap_result["cap"],
                    "month": cap_result["month"],
                    "upgradePath": "/account",
                },
            )
    else:
        cap_result = {"used": 0, "cap": 0, "month": None, "allowed": True}

    product_name = (payload.product_name or "").strip()[:80]
    description = (payload.description or "").strip()[:800]
    audience = (payload.audience or "").strip()[:120]
    tone = (payload.tone or "confident").strip()[:40]
    platform = (payload.platform or "Instagram").strip()[:40]

    offer = (payload.offer or "").strip()[:80]
    goal = (payload.goal or "Sales").strip()[:30]
    style = (payload.stylePreset or "Minimal").strip()[:30]
    product_type = (payload.productType or "").strip()[:40] or None

    style_hint = STYLE_HINTS.get(style, STYLE_HINTS["Minimal"])

    copy_prompt = f"""Create high-performing ad copy as JSON ONLY.

Return one JSON object with:
- headline: string (<= 40 chars)
- primary_text: string (<= 125 chars)
- cta: string (one of: Shop Now, Learn More, Sign Up, Get Offer, Download, Contact Us, Book Now)
- hooks: array of 3 short strings (each <= 8 words)
- variants: array of 3 objects, each with headline, primary_text, cta

Inputs:
product_name: {product_name}
description: {description}
audience: {audience}
tone: {tone}
platform: {platform}
goal: {goal}
offer: {offer or "N/A"}
"""

    aspect_ratio = size_to_aspect_ratio(payload.imageSize)
    subject = infer_visual_subject(product_name, description, product_type)

    # ✅ UPDATED: anchor the image to the user inputs up front (keeps Ideogram on-topic)
    visual_prompt = (
    f"{style_hint}. "
    f"Photorealistic product photograph (NOT an advertisement layout). "
    f"NO graphic design elements.\n"

    f"Depict ONLY: {subject}. "
    f"Set the scene to match: {description}. "
    f"Show the product clearly as the hero.\n"

    f"Hard rules:\n"
    f"- Absolutely NO text of any kind (no letters, no words, no numbers, no fake writing).\n"
    f"- Do NOT create posters, flyers, menus, brochures, magazine covers, side panels, "
    f"headline areas, text boxes, captions, banners, frames, borders, or layout columns.\n"
    f"- Do NOT include QR codes, barcodes, watermarks, stamps, seals, badges, labels, stickers.\n"
    f"- Do NOT include packaging with readable or fake text.\n"
    f"- Do NOT include logos, brand marks, icons, trademarks.\n"

    f"Composition:\n"
    f"- Full-bleed photo (edge-to-edge), no split panels.\n"
    f"- Clean background, shallow depth of field, professional studio lighting.\n"
    f"- Leave natural negative space only by using an empty background, not a text panel.\n"
)


    async def _gen_copy():
        try:
            resp = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model="gpt-4-turbo",
                    messages=[
                        {"role": "system", "content": "You are an expert direct-response ad copywriter. Output ONLY valid JSON."},
                        {"role": "user", "content": copy_prompt},
                        {"role": "user", "content": copy_prompt},
                    ],
                    max_tokens=450,
                )
            )
            raw = (resp.choices[0].message.content or "").strip()
            obj = _extract_json_object(raw)

            if not obj or "headline" not in obj:
                return {
                    "headline": product_name or "Ad Headline",
                    "primary_text": raw[:250],
                    "cta": "Learn More",
                    "hooks": [],
                    "variants": [],
                    "_raw": raw,
                }

            obj.setdefault("headline", product_name or "Ad Headline")
            obj.setdefault("primary_text", "")
            obj.setdefault("cta", "Learn More")
            obj.setdefault("hooks", [])
            obj.setdefault("variants", [])
            return obj
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OpenAI text generation failed: {e}")

    async def _gen_image_and_upload():
        try:
            # ✅ NEW: negative prompt strongly discourages text/logos + common “ad overlay” artifacts
            negative_prompt = (
    "text, typography, words, letters, numbers, readable text, fake text, misspelled text, "
    "poster, flyer, brochure, menu, magazine cover, banner, headline, caption, subtitle, "
    "text box, text panel, layout column, split layout, frame, border, "
    "qr code, barcode, watermark, logo, brand mark, icon, label, sticker, badge, stamp, seal, "
    "signage, placard, screen UI"
)


            paths = await asyncio.to_thread(
                lambda: generate_ideogram(
                    prompt=visual_prompt,
                    aspect_ratio=aspect_ratio,
                    rendering_speed="DEFAULT",
                    num_images=1,
                    magic_prompt="OFF",
                    negative_prompt=negative_prompt,
                    style_type="REALISTIC",
                )
            )
            if not paths:
                raise HTTPException(status_code=502, detail="Ideogram returned no images")

            image_path = paths[0]
            with open(image_path, "rb") as f:
                img_bytes = f.read()

            url = upload_png_to_firebase_storage(img_bytes, uid)

            try:
                os.remove(image_path)
            except Exception:
                pass

            return url
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Ideogram image generation failed: {e}")

    copy_obj, image_url = await asyncio.gather(_gen_copy(), _gen_image_and_upload())

    legacy_text = (
        f"{copy_obj.get('headline','')}\n\n"
        f"{copy_obj.get('primary_text','')}\n\n"
        f"CTA: {copy_obj.get('cta','')}"
    ).strip()

    return {
        "text": legacy_text,
        "copy": copy_obj,
        "imageUrl": image_url,
        "meta": {
            "goal": goal,
            "stylePreset": style,
            "offer": offer,
            "productType": product_type,
            "imagePrompt": visual_prompt,
        },
        "usage": {
            "used": cap_result.get("used"),
            "cap": cap_result.get("cap"),
            "month": cap_result.get("month"),
            "remaining": max(0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)),
        },
    }


# ---------------- Optimize Ad (Pro/Business only) ----------------
@app.post("/optimize-ad", response_model=OptimizeAdResponse)
async def optimize_ad(payload: OptimizeAdRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, status = get_tier_and_status(user_doc)

    if not admin:
        allowed_statuses = {"active", "trialing"}
        if status not in allowed_statuses and tier not in (None, "trial_monthly"):
            raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")
        require_pro_or_business(tier)

    product_name = (payload.product_name or "").strip()[:80]
    description = (payload.description or "").strip()[:800]
    audience = (payload.audience or "").strip()[:120]
    tone = (payload.tone or "confident").strip()[:40]
    offer = (payload.offer or "").strip()[:80]
    goal = (payload.goal or "Sales").strip()[:30]
    platform = (payload.platform or "meta").strip()[:20]

    metrics = payload.metrics.dict() if payload.metrics else {}

    optimizer_prompt = f"""
You are an expert direct-response performance marketer.

Given the current ad and its metrics, diagnose what's likely happening and produce improved copy + an improved image prompt.

RULES:
- Output ONLY valid JSON. No markdown, no extra text.
- improved_headline <= 40 characters.
- improved_primary_text <= 150 characters.
- improved_cta must be one of: Shop Now, Learn More, Sign Up, Get Offer, Download, Contact Us, Book Now
- Improved image prompt must be brand-neutral and avoid ANY readable text, logos, labels, trademarks.
- Do NOT output any brand names or logos in the image prompt. No text overlays.

CONTEXT:
product_name: {product_name}
description: {description}
audience: {audience}
tone: {tone}
platform: {platform}
goal: {goal}
offer: {offer or "N/A"}
audience_temp: {payload.audience_temp}
notes: {payload.notes or ""}

CURRENT CREATIVE:
headline: {payload.current_headline or ""}
primary_text: {payload.current_primary_text or ""}
cta: {payload.current_cta or ""}
image_prompt: {payload.current_image_prompt or ""}

METRICS JSON:
{json.dumps(metrics)}

Return JSON with keys:
summary (string),
likely_issues (array of 3-6 strings),
recommended_changes (array of 3-6 strings),
improved_headline (string),
improved_primary_text (string),
improved_cta (string),
improved_image_prompt (string),
confidence ("low"|"medium"|"high")
""".strip()

    try:
        resp = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model="gpt-4-turbo",
                messages=[
                    {"role": "system", "content": "Output ONLY valid JSON."},
                    {"role": "user", "content": optimizer_prompt},
                ],
                max_tokens=650,
            )
        )
        raw = (resp.choices[0].message.content or "").strip()
        obj = _extract_json_object(raw)

        if not obj or "improved_headline" not in obj:
            raise HTTPException(status_code=502, detail="Optimizer returned invalid JSON.")

        obj.setdefault("summary", "Here are recommended improvements based on the metrics provided.")
        obj.setdefault("likely_issues", [])
        obj.setdefault("recommended_changes", [])
        obj.setdefault("improved_cta", "Learn More")
        obj.setdefault("confidence", "medium")

        return OptimizeAdResponse(**obj)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Optimization failed: {e}")


# ---------------- Stripe routes ----------------
app.include_router(stripe_router)














