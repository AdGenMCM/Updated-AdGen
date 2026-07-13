# main.py
from urllib.parse import quote
import os
import re
import json
import uuid
import asyncio
import requests
import time
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import base64

# Stripe router (separate file)
from stripe_server import stripe_router, price_id_to_tier, extract_subscription_period
import stripe

# Firebase auth + Firestore
from auth_helpers import get_db, get_bearer_token, verify_firebase_token
from usage_caps import check_and_increment_usage, peek_usage, get_tier_and_status, get_usage_period

# admin dependency
from admin_guard import admin_required

#Amdin Page Imports
from fastapi import Header, HTTPException, Query
from typing import Any, Optional
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import auth as admin_auth
from usage_caps import utc_month_key

import traceback
from fastapi.responses import JSONResponse, StreamingResponse
import io

from pydantic import BaseModel
from google.cloud import firestore as gc_firestore
from usage_caps import peek_usage, get_tier_and_status



# feature gating + optimizer schemas
from entitlements import require_pro_or_business
from optimizer_schemas import OptimizeAdRequest, OptimizeAdResponse

#Runway
from video_jobs import router as video_router
from storage_utils import upload_bytes_to_firebase_storage

#Library Performace Schemas
from typing import Optional
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple
from fastapi import Query
from collections import Counter

#Google SMTP 
import smtplib
from email.message import EmailMessage


load_dotenv(override=True)

app = FastAPI()

app.include_router(video_router)

class AdminRequestTierBody(BaseModel):
    requestedTier: str  # e.g. "starter_monthly", "pro_monthly", etc.

# -------------- visual prompt for image generation -----------------
def build_visual_prompt(
    *,
    product_name: str,
    subject: str,
    tone: str,
    goal: str,
    style_hint: str,
    extra_instructions: str = "",
) -> str:
    """
    Shared image prompt builder used by both /generate-ad and /generate-from-optimizer.

    Goals:
    - HARD anchor requested product_name (prevents category drift)
    - Great product photography composition
    - Aggressively prevent ANY text artifacts by banning text-carrying props + printed surfaces
    - Allow route-specific instructions via extra_instructions
    """

    product_name = (product_name or "").strip()
    subject = (subject or "").strip()
    extra = (extra_instructions or "").strip()


    base = (
        f"{style_hint}. "
        f"Ultra-realistic commercial product photography. "
        f"PRIMARY SUBJECT (must be depicted exactly): {product_name}. "
        f"Depict: {subject}. "
        f"The {product_name} must be the single primary hero object in the frame. "
        f"ONLY ONE product total: exactly 1 {product_name}. "
        f"No duplicates, no multiples, no sets, no bundles, no lineup, no collection. "
        f"Do not show more than one unit of the product. "
        f"If multiple items are shown, they must be identical variations of the same product model only. "
        f"Do NOT substitute with other product categories. "
        f"{(extra + ' ') if extra else ''}"

        # ✅ Composition that does NOT invite text
        f"Plain seamless studio backdrop, clean and minimal. "
        f"Single hero product shot, centered, with empty BLANK background space. "
        f"No lifestyle scene. No marketing set. No product showcase boards. No collages. "
        f"Professional commercial lighting, realistic proportions, natural shadows. "
        f"Create an ad-ready social media image in a {tone.lower()} tone. "
        f"Goal: {goal}. "

        # Background variety
        f"Background must be a solid seamless backdrop with a SINGLE smooth color (no gradients, no textures). "
        f"Vary the backdrop color across generations and choose a color that complements the product. "
        f"Pick ONE of these backdrop colors (rotate between them over multiple generations): "
        f"cool white, soft light gray, slate gray, charcoal, pale blue, muted navy, sage green, "
        f"forest green, blush pink, muted terracotta, lavender, sand-white."
        f"AVOID beige/tan unless explicitly requested. "

        # ✅ Hard “no text” + hard ban on props that usually contain text
        f"Brand-neutral and unbranded. "
        f"ABSOLUTELY NO TEXT OR WRITING ANYWHERE: "
        f"no words, no letters, no numbers, no symbols, no glyphs, no fake writing. "
        f"NO logos, NO brand marks, NO trademarks, NO icons. "
        f"NO packaging, NO boxes, NO labels, NO stickers, NO tags, NO instruction cards, "
        f"NO posters, NO signage, NO billboards, NO magazines, NO brochures, NO placards, "
        f"NO screens or UI, NO QR codes, NO barcodes, NO watermarks. "
        f"No printed graphics or printed textures anywhere in the scene. "
        f"Background must be smooth and blank: no embossing, no engraving, no debossing, "
        f"no letter-shaped or symbol-shaped geometry, no patterns that resemble writing. "
        f"NO textures or materials that resemble writing surfaces (e.g. paper, cardboard). "

        # ✅ General avoid list (keep shorter + focused)
        f"AVOID: distorted products, warped shapes, melted surfaces, extra random objects, "
        f"surreal elements, cartoon/illustration style, heavy CGI look, faces, hands, fingers."
    )

    return " ".join(base.split())



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

# ---------------- OpenAI ----------------
OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_TEXT_MODEL = (
    os.getenv("OPENAI_TEXT_MODEL")
    or "gpt-5.5"
).strip()
OPENAI_IMAGE_MODEL = (
    os.getenv("OPENAI_IMAGE_MODEL")
    or "gpt-image-2"
).strip()

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is missing.")

client = OpenAI(api_key=OPENAI_API_KEY)

def generate_gpt_image_bytes(
    prompt: str,
    size: str = "1024x1024",
    input_image_url: str | None = None,
    input_image_urls: Optional[List[str]] = None,
) -> bytes:
    allowed_sizes = {"1024x1024", "1024x1792", "1792x1024"}
    safe_size = size if size in allowed_sizes else "1024x1024"
    model = OPENAI_IMAGE_MODEL

    image_urls = []

    if input_image_url:
        image_urls.append(input_image_url)

    if input_image_urls:
        image_urls.extend([
            u for u in input_image_urls
            if isinstance(u, str) and u.startswith("http")
        ])

    image_urls = image_urls[:4]  # logo + max 3 references

    def download_image_tuple(url: str, idx: int):
        r = requests.get(url, timeout=30)
        r.raise_for_status()

        content_type = (r.headers.get("content-type") or "image/png").split(";")[0].lower()

        if content_type == "image/jpg":
            content_type = "image/jpeg"

        if content_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise RuntimeError(f"Unsupported reference image type: {content_type}")

        ext = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
        }[content_type]

        return (f"reference_{idx}.{ext}", r.content, content_type)

    if image_urls:
        image_files = [
            download_image_tuple(url, idx)
            for idx, url in enumerate(image_urls)
        ]

        result = client.images.edit(
            model=model,
            image=image_files if len(image_files) > 1 else image_files[0],
            prompt=prompt,
            size=safe_size,
            quality="medium",
        )
    else:
        result = client.images.generate(
            model=model,
            prompt=prompt,
            size=safe_size,
            quality="medium",
        )

    image_b64 = result.data[0].b64_json
    if not image_b64:
        raise RuntimeError("GPT Image returned no image data.")

    return base64.b64decode(image_b64)

# ---------------- Models ----------------
class AdRequest(BaseModel):
    companyName: Optional[str] = None
    product_name: str
    description: str
    audience: str
    tone: str
    platform: str
    imageSize: str  # "1024x1024" | "1024x1792" | "1792x1024"
    useBrandKit: bool = True

    offer: Optional[str] = None
    goal: Optional[str] = None
    stylePreset: Optional[str] = None
    productType: Optional[str] = None

    campaignObjective: Optional[str] = None
    referenceImageUrls: Optional[List[str]] = None
    referenceImageMode: Optional[str] = "product_reference"

    # Legacy winners text (keep)
    winnerGuidance: Optional[str] = None

    # ✅ NEW structured winners (preferred over winnerGuidance)
    winnerProfile: Optional[Dict[str, Any]] = None
    winnersApply: Optional[List[str]] = None
    winnersInfluence: Optional[float] = 0.5

class ContactForm(BaseModel):
    name: str
    email: str
    message: str

class UploadCreativesResponse(BaseModel):
    urls: List[str]

class GenerateFromOptimizerRequest(BaseModel):
    improved_headline: str
    improved_primary_text: str
    improved_cta: str
    improved_image_prompt: str
    imageSize: str = "1024x1024"
    useBrandKit: bool = True
    creative_image_urls: Optional[List[str]] = None
    companyName: Optional[str] = None
    product_name: Optional[str] = None
    productName: Optional[str] = None
    description: Optional[str] = None
    productType: Optional[str] = None
    stylePreset: Optional[str] = None
    tone: Optional[str] = None
    goal: Optional[str] = None
    platform: Optional[str] = None

class PerformanceUpdate(BaseModel):
    ctr: Optional[float] = None
    cpc: Optional[float] = None
    cpa: Optional[float] = None
    cpm: Optional[float] = None

    spend: Optional[float] = None      # $
    revenue: Optional[float] = None    # $  (used to compute ROAS)

    thumb_stop_rate: Optional[float] = None
    view_3s: Optional[float] = None
    view_6s: Optional[float] = None
    hold_rate: Optional[float] = None
    conversion_rate: Optional[float] = None

    marked_successful: Optional[bool] = None
    notes: Optional[str] = None


# ---------------- Helpers ----------------
def upload_png_to_firebase_storage(img_bytes: bytes, uid: str) -> str:
    """
    Upload PNG bytes to Firebase Storage and return a direct download URL.
    Uses firebaseStorageDownloadTokens so the URL can be fetched without auth.
    """
    from firebase_admin import storage  # type: ignore (lazy import)

    bucket_name = (os.getenv("FIREBASE_STORAGE_BUCKET") or "").strip()
    if not bucket_name:
        raise RuntimeError("FIREBASE_STORAGE_BUCKET is missing.")

    bucket = storage.bucket(bucket_name)

    object_id = f"generated_ads/{uid}/{uuid.uuid4().hex}.png"
    token = uuid.uuid4().hex

    blob = bucket.blob(object_id)
    blob.metadata = {"firebaseStorageDownloadTokens": token}
    blob.upload_from_string(img_bytes, content_type="image/png")

    return (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
        f"{quote(object_id, safe='')}?alt=media&token={token}"
    )

async def analyze_uploaded_creatives(urls: List[str]) -> str:
    """
    Best-effort creative analysis for uploaded creative images.
    Uses a vision-capable model if available; safe fallback otherwise.
    Output is injected as HIGH PRIORITY context.
    """
    urls = [u for u in (urls or []) if isinstance(u, str) and u.startswith("http")]
    if not urls:
        return ""

    urls = urls[:4]

    prompt = (
        "Analyze these ad creative images for performance.\n"
        "Return concise bullet points ONLY:\n"
        "- What the creative shows (product/scene)\n"
        "- Hook/message clarity\n"
        "- Visual hierarchy (what stands out first)\n"
        "- Likely friction points\n"
        "- 3 concrete improvement ideas\n"
        "Be decisive and practical."
    )

    try:
        vision_model = (os.getenv("OPENAI_VISION_MODEL") or "gpt-4o-mini").strip()

        messages = [
            {"role": "system", "content": "You are a direct-response creative strategist."},
            {
                "role": "user",
                "content": (
                    [{"type": "text", "text": prompt}]
                    + [{"type": "image_url", "image_url": {"url": u}} for u in urls]
                ),
            },
        ]

        resp = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=vision_model,
                messages=messages,
                max_tokens=450,
            )
        )
        out = (resp.choices[0].message.content or "").strip()
        return out[:2000]
    except Exception:
        return (
            "Uploaded creatives were provided. Prioritize what is actually shown in the creative: "
            "clarify the hook, strengthen the focal point, reduce clutter, align the visual story "
            "to the offer/goal, keep clean hierarchy, avoid text-heavy designs."
        )

def _extract_json_object(text: str) -> dict:
    """Best-effort extraction of a JSON object from model output."""
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
    
def require_pro_or_business_for_performance(db, uid: str, claims: dict):
    """
    Performance tracking is Pro & Business only.
    Admins bypass.
    """
    if is_admin(claims):
        return {"tier": "admin", "status": "active", "admin": True}

    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, status = get_tier_and_status(user_doc)

    allowed_statuses = {"active", "trialing"}
    if status not in allowed_statuses and tier not in (None, "trial_monthly"):
        raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")

    # ✅ Pro & Business only
    require_pro_or_business(tier)

    return {"tier": tier, "status": status, "admin": False}

STYLE_HINTS = {
    "Minimal": "studio product hero shot, clean background, minimal props, crisp soft lighting",
    "Premium": "luxury editorial product hero shot, dramatic lighting, premium materials, high-end look",
    "Bold": "high contrast modern product photo, dynamic angle, punchy lighting, energetic composition",
    "Lifestyle": "lifestyle in-use scene in a realistic environment, natural daylight, candid composition",
    "UGC": "authentic user-generated style photo, handheld feel, casual environment, slight grain, imperfect framing",
}


# ✅ UPDATED: keyword-first + many more categories + productType normalized
import re

def infer_visual_subject(product_name: str, description: str, product_type: str | None = None) -> str:
    """
    Generic subject builder:
    - NEVER swaps the user's product for something else
    - Uses description to extract helpful visual attributes (materials/colors/features)
    """
    pn = (product_name or "").strip()
    desc = (description or "").strip()

    # Basic attribute extraction (lightweight + safe)
    text = f"{pn}. {desc}".lower()

    # common materials/colors/finishes to help the model stay on target
    materials = []
    for m in ["leather", "faux leather", "mesh", "fabric", "wood", "metal", "plastic", "glass", "ceramic", "steel", "aluminum"]:
        if m in text:
            materials.append(m)

    colors = []
    for c in ["black", "white", "gray", "grey", "beige", "tan", "brown", "silver", "gold", "blue", "green", "red"]:
        if re.search(rf"\b{c}\b", text):
            colors.append(c)

    features = []
    for f in [
        "adjustable", "ergonomic", "wireless", "portable", "waterproof", "rechargeable",
        "lightweight", "compact", "premium", "minimal", "modern"
    ]:
        if f in text:
            features.append(f)

    # Build an attribute string that helps but doesn't override the object
    attr_bits = []
    if materials:
        attr_bits.append("materials: " + ", ".join(sorted(set(materials))))
    if colors:
        attr_bits.append("colors: " + ", ".join(sorted(set(colors))))
    if features:
        attr_bits.append("features: " + ", ".join(sorted(set(features))))

    attrs = ("; ".join(attr_bits)).strip()

    # ✅ Hard anchor: the subject is ALWAYS the user's product name
    if attrs:
        return f"{pn} ({attrs})"
    return pn

def build_brand_kit_prompt_context(brand_kit: dict | None) -> str:
    if not brand_kit:
        return ""

    colors = brand_kit.get("colors") or {}
    fonts = brand_kit.get("fonts") or {}

    active_lines = []
    disabled_lines = []

    def add(label, value):
        value = value.strip() if isinstance(value, str) else value
        if value:
            active_lines.append(f"✓ {label}: {value}")
        else:
            disabled_lines.append(f"• {label}")

    # Identity
    add("Brand name", brand_kit.get("brandName"))
    add("Website", brand_kit.get("websiteUrl"))
    add("Industry", brand_kit.get("industry"))
    add("Brand personality", brand_kit.get("brandPersonality"))
    add("Target audience", brand_kit.get("targetAudience"))
    add("Brand DNA", brand_kit.get("brandDna"))

    # Visual identity
    add("Logo", brand_kit.get("logoUrl"))
    add("Primary color", colors.get("primary"))
    add("Secondary color", colors.get("secondary"))
    add("Accent color", colors.get("accent"))
    add("Headline font", fonts.get("headline"))
    add("Body font", fonts.get("body"))
    add("CTA font", fonts.get("cta"))

    # Defaults / strategy
    add("Brand voice", brand_kit.get("voice"))
    add("Preferred CTA", brand_kit.get("preferredCta"))
    add("Preferred platform", brand_kit.get("preferredPlatform"))
    add("Preferred image style", brand_kit.get("imageStyle"))
    add("Preferred aspect ratio", brand_kit.get("aspectRatioPreference"))
    add("Offer style", brand_kit.get("offerStyle"))

    # Rules
    add("Extra instructions", brand_kit.get("notes"))
    add("Do list", brand_kit.get("doList"))
    add("Don't list", brand_kit.get("dontList"))
    add("Brand keywords", brand_kit.get("brandKeywords"))
    add("Negative keywords", brand_kit.get("negativeKeywords"))
    add("Compliance rules", brand_kit.get("complianceRules"))
    add("Products/services notes", brand_kit.get("productsServices"))

    if not active_lines:
        return ""

    disabled_preview = "\n".join(disabled_lines[:12]) if disabled_lines else "None"

    return f"""
==================================================
ESTABLISHED BRAND IDENTITY
==================================================

Active Brand Kit Fields:
{chr(10).join(active_lines)}

Disabled / Blank Brand Kit Fields:
{disabled_preview}

Brand Kit Usage Rules:

• Treat active Brand Kit fields as the established brand identity.
• Only apply fields listed under Active Brand Kit Fields.
• Completely ignore disabled or blank fields.
• Do not invent missing colors, fonts, logo details, or brand rules.
• Use supplied colors for accents, CTA buttons, badges, highlights, backgrounds, and supporting design elements when appropriate.
• Use supplied fonts or close visual matches for headline, body, and CTA typography.
• Preserve brand voice, personality, audience, compliance rules, and creative restrictions when provided.
""".strip()

def ensure_stripe_period_for_user(db, uid: str, user_doc: dict) -> dict:
    stripe_obj = (user_doc or {}).get("stripe") or {}

    if stripe_obj.get("currentPeriodStart") and stripe_obj.get("currentPeriodEnd"):
        return user_doc

    customer_id = stripe_obj.get("customerId")
    if not customer_id:
        return user_doc

    try:
        subs = stripe.Subscription.list(
            customer=customer_id,
            status="all",
            limit=1,
            expand=["data.items"],
        )

        if not subs.data:
            return user_doc

        latest = subs.data[0]

        sub_id = latest.get("id")
        sub_status = latest.get("status")
        status = "active" if sub_status in {"active", "trialing", "past_due"} else "pending"

        price_id = None
        tier = None

        items = (latest.get("items") or {}).get("data") or []
        if items and items[0].get("price"):
            price_id = items[0]["price"].get("id")
            tier = price_id_to_tier(price_id)

        period_start, period_end = extract_subscription_period(latest)

        stripe_update = {
            "customerId": customer_id,
            "subscriptionId": sub_id,
            "status": status,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }

        if price_id:
            stripe_update["priceId"] = price_id

        if tier:
            stripe_update["tier"] = tier

        if period_start:
            stripe_update["currentPeriodStart"] = int(period_start)

        if period_end:
            stripe_update["currentPeriodEnd"] = int(period_end)

        user_ref = db.collection("users").document(uid)
        user_ref.set({"stripe": stripe_update}, merge=True)

        refreshed = user_ref.get()
        return refreshed.to_dict() or user_doc

    except Exception as e:
        print("STRIPE PERIOD SELF-HEAL ERROR:", repr(e))
        return user_doc

# ---------------- Library Performance ----------------
def _safe_num(x):
    try:
        if x is None:
            return None
        n = float(x)
        if n != n:  # NaN
            return None
        return n
    except Exception:
        return None

def _pick(doc: dict, keys: List[str], default=None):
    for k in keys:
        v = doc.get(k)
        if v is not None and v != "":
            return v
    return default

def _get_perf(doc: dict) -> dict:
    p = doc.get("performance") or {}
    return p if isinstance(p, dict) else {}

def _has_perf(doc: dict) -> bool:
    p = _get_perf(doc)
    # consider it “has perf” if any of the key metrics exist
    for k in ("ctr", "cpc", "cpa", "cpm", "spend", "revenue", "roas"):
        if p.get(k) is not None:
            return True
    return False

def _creative_snapshot(kind: str, doc_id: str, doc: dict) -> dict:
    p = _get_perf(doc)

    # For display fields, try multiple likely locations safely
    product_name = _pick(doc, ["productName", "product_name"], default=None)
    title = f"{kind.capitalize()} Ad" if not product_name else f"{kind.capitalize()}: {product_name}"

    # URLs
    if kind == "video":
        url = _pick(doc, ["finalVideoUrl", "videoUrl"], default=None)
        thumb = _pick(doc, ["thumbnailUrl"], default=None)
        ratio = _pick(doc, ["ratio", "aspectRatio"], default=None)
    else:
        url = _pick(doc, ["imageUrl"], default=None)
        thumb = url
        ratio = _pick(doc, ["aspectRatio", "ratio"], default=None)

    created_at = doc.get("createdAt")
    status = doc.get("status")

    return {
        "id": doc_id,
        "kind": kind,
        "title": title,
        "createdAt": created_at,
        "status": status,
        "url": url,
        "thumbnailUrl": thumb,
        "ratio": ratio,
        "performance": {
            "ctr": _safe_num(p.get("ctr")),
            "cpc": _safe_num(p.get("cpc")),
            "cpa": _safe_num(p.get("cpa")),
            "cpm": _safe_num(p.get("cpm")),
            "spend": _safe_num(p.get("spend")),
            "revenue": _safe_num(p.get("revenue")),
            "roas": _safe_num(p.get("roas")),
            "marked_successful": p.get("marked_successful") if isinstance(p.get("marked_successful"), bool) else None,
        },
        # helpful context for “best averages”
        "meta": {
            "platform": _pick(doc, ["platform", "platformStyle"], default=None),
            "tone": _pick(doc, ["tone"], default=None),
            "stylePreset": _pick(doc, ["stylePreset", "style"], default=None),
            "model": _pick(doc, ["model"], default=None),
        },
    }

def _avg(nums: List[float]) -> Optional[float]:
    vals = [x for x in nums if isinstance(x, (int, float))]
    return round(sum(vals) / len(vals), 4) if vals else None

def _weighted_roas(items: List[dict]) -> Optional[float]:
    # weighted by spend when available: sum(revenue)/sum(spend)
    total_spend = 0.0
    total_revenue = 0.0
    for it in items:
        p = it.get("performance") or {}
        s = _safe_num(p.get("spend"))
        r = _safe_num(p.get("revenue"))
        if s is None or r is None or s <= 0:
            continue
        total_spend += s
        total_revenue += r
    if total_spend <= 0:
        return None
    return round(total_revenue / total_spend, 4)

def _rank(items: List[dict], key: str, desc: bool = True) -> List[dict]:
    def k(it):
        v = _safe_num((it.get("performance") or {}).get(key))
        return v if v is not None else (-1e18 if desc else 1e18)
    return sorted(items, key=k, reverse=desc)

def _rank_low(items: List[dict], key: str) -> List[dict]:
    # lowest first
    def k(it):
        v = _safe_num((it.get("performance") or {}).get(key))
        return v if v is not None else 1e18
    return sorted(items, key=k)

def _group_best(items: List[dict], group_key: str, min_spend: float) -> Dict[str, Any]:
    groups = defaultdict(list)
    for it in items:
        meta = it.get("meta") or {}
        g = meta.get(group_key)
        if not g:
            continue
        p = it.get("performance") or {}
        spend = _safe_num(p.get("spend")) or 0.0
        if spend < min_spend:
            continue
        groups[g].append(it)

    # compute summary per group
    out = []
    for g, arr in groups.items():
        roas = _weighted_roas(arr)
        ctrs = [_safe_num((x.get("performance") or {}).get("ctr")) for x in arr]
        cpas = [_safe_num((x.get("performance") or {}).get("cpa")) for x in arr]
        spends = [_safe_num((x.get("performance") or {}).get("spend")) for x in arr]
        cpms = [_safe_num((x.get("performance") or {}).get("cpm")) for x in arr]

        out.append({
            "value": g,
            "count": len(arr),
            "avg_ctr": _avg([x for x in ctrs if x is not None]),
            "avg_cpa": _avg([x for x in cpas if x is not None]),
            "avg_cpm": _avg([x for x in cpms if x is not None]),
            "total_spend": round(sum([x for x in spends if x is not None]), 4),
            "weighted_roas": roas,
        })

    # sort by weighted_roas desc, fallback to avg_ctr
    out.sort(key=lambda r: (r["weighted_roas"] if r["weighted_roas"] is not None else -1e18,
                           r["avg_ctr"] if r["avg_ctr"] is not None else -1e18),
             reverse=True)
    return {
        "best": out[0] if out else None,
        "rows": out[:10],
    }

def inject_winners_structured_image(
    base_text: str,
    winner_profile: Optional[Dict[str, Any]],
    winners_apply: Optional[List[str]],
    winners_influence: Optional[float],
) -> str:
    """
    Compact, structured winners constraints for image gen (NOT a blob).
    Safe + optional. Returns base_text unchanged if no profile or nothing applicable.
    """
    if not winner_profile:
        return base_text

    apply_set = set()
    for x in (winners_apply or []):
        if isinstance(x, str) and x.strip():
            apply_set.add(x.strip().lower())

    # optional weight for future
    w = "default"
    try:
        if winners_influence is not None:
            w = str(round(float(winners_influence), 2))
    except Exception:
        w = "default"

    constraints = []

    top_tone = winner_profile.get("top_tone")
    top_platform = winner_profile.get("top_platform")
    top_ratio = winner_profile.get("top_ratio")
    top_style = winner_profile.get("top_stylePreset") or winner_profile.get("top_style")

    if top_tone and ("tone" in apply_set):
        constraints.append(f"Tone: {top_tone}.")
    if top_platform and ("platform" in apply_set):
        constraints.append(f"Optimize for platform: {top_platform}.")
    if top_ratio and ("ratio" in apply_set):
        constraints.append(f"Compose for aspect ratio: {top_ratio}.")
    if top_style and ("style" in apply_set):
        constraints.append(f"Style direction: {top_style}.")

    # optional do/avoid arrays (if you add them later to profile)
    do_list = winner_profile.get("do")
    avoid_list = winner_profile.get("avoid")
    if isinstance(do_list, list) and ("do" in apply_set):
        do_items = [str(v).strip() for v in do_list if str(v).strip()][:5]
        if do_items:
            constraints.append("Do: " + "; ".join(do_items) + ".")
    if isinstance(avoid_list, list) and ("avoid" in apply_set):
        avoid_items = [str(v).strip() for v in avoid_list if str(v).strip()][:5]
        if avoid_items:
            constraints.append("Avoid: " + "; ".join(avoid_items) + ".")

    if not constraints:
        return base_text

    return f"{base_text}\nWinners-based constraints (weight {w}): " + " ".join(constraints)

# ---------------- Usage ----------------
@app.get("/usage")
def get_usage(authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()

    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}

    user_doc = ensure_stripe_period_for_user(db, uid, user_doc)

    tier, _status = get_tier_and_status(user_doc)

    return peek_usage(db, uid, tier, user_doc)

@app.get("/sync-my-subscription")
def sync_my_subscription(authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()

    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get().to_dict() or {}
    stripe_obj = user_doc.get("stripe") or {}
    customer_id = stripe_obj.get("customerId")

    if not customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customerId found for this user.")

    subs = stripe.Subscription.list(
        customer=customer_id,
        status="all",
        limit=1,
        expand=["data.items"],
    )

    if not subs.data:
        raise HTTPException(status_code=404, detail="No Stripe subscription found for this customer.")

    latest = subs.data[0]

    sub_id = latest.get("id")
    sub_status = latest.get("status")
    status = "active" if sub_status in {"active", "trialing", "past_due"} else "pending"

    price_id = None
    tier = None

    items = (latest.get("items") or {}).get("data") or []
    if items and items[0].get("price"):
        price_id = items[0]["price"].get("id")
        tier = price_id_to_tier(price_id)

    period_start, period_end = extract_subscription_period(latest)

    update_payload = {
        "stripe.customerId": customer_id,
        "stripe.subscriptionId": sub_id,
        "stripe.status": status,
        "stripe.updatedAt": gc_firestore.SERVER_TIMESTAMP,
    }

    if price_id:
        update_payload["stripe.priceId"] = price_id

    if tier:
        update_payload["stripe.tier"] = tier

    if period_start:
        update_payload["stripe.currentPeriodStart"] = int(period_start)

    if period_end:
        update_payload["stripe.currentPeriodEnd"] = int(period_end)

    user_ref.set(update_payload, merge=True)

    saved = user_ref.get().to_dict() or {}

    return {
        "ok": True,
        "uid": uid,
        "customer_id": customer_id,
        "status": status,
        "subscription_status": sub_status,
        "price_id": price_id,
        "tier": tier,
        "current_period_start": period_start,
        "current_period_end": period_end,
        "saved_stripe": saved.get("stripe"),
    }

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
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL", smtp_user)
    from_name = os.getenv("SMTP_FROM_NAME", "AdGen MCM Support")
    to_email = os.getenv("SMTP_CONTACT_TO_EMAIL", from_email)

    if not all([smtp_host, smtp_user, smtp_password]):
        raise HTTPException(
            status_code=500,
            detail="SMTP configuration is incomplete."
        )

    subject = f"New Contact Form Message from {payload.name}"

    body = f"""
New contact form submission

----------------------------------------

Name:
{payload.name}

Email:
{payload.email}

----------------------------------------

Message:

{payload.message}
"""

    try:
        msg = EmailMessage()

        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email
        msg["Reply-To"] = payload.email

        msg.set_content(body)

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)

        return {"success": True}

    except Exception as e:
        print("SMTP CONTACT ERROR:", repr(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send email: {str(e)}"
        )

# ---------------- Upload creatives ----------------
@app.post("/upload-creatives", response_model=UploadCreativesResponse)
async def upload_creatives(
    files: List[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    # Pro/Business only (admin bypass)
    if not admin:
        db = get_db()
        user_snap = db.collection("users").document(uid).get()
        user_doc = user_snap.to_dict() or {}
        tier, status = get_tier_and_status(user_doc)

        allowed_statuses = {"active", "trialing"}
        if status not in allowed_statuses and tier not in (None, "trial_monthly"):
            raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")
        require_pro_or_business(tier)

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
    if len(files) > 6:
        raise HTTPException(status_code=400, detail="Too many files. Max 6 images.")

    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    urls: List[str] = []

    for f in files[:6]:
        ct = (f.content_type or "").lower().strip()
        if ct not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ct or 'unknown'}")

        data = await f.read()
        if not data:
            continue
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large. Max 8MB per image.")

        url = upload_bytes_to_firebase_storage(
            data,
            uid,
            content_type=ct,
            folder="uploaded_creatives",
            filename_hint=f.filename or None,
        )
        urls.append(url)

    if not urls:
        raise HTTPException(status_code=400, detail="No valid files uploaded.")

    return {"urls": urls}

@app.post("/upload-brand-logo")
async def upload_brand_logo(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)

    allowed_types = {
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/svg+xml",
    }

    ct = (file.content_type or "").lower().strip()

    if ct not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Unsupported logo type. Use PNG, JPG, WEBP, or SVG.",
        )

    data = await file.read()

    if not data:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Logo too large. Max 5MB.")

    logo_url = upload_bytes_to_firebase_storage(
        data,
        uid,
        content_type=ct,
        folder="brand_logos",
        filename_hint=file.filename or "logo",
    )

    db = get_db()
    db.collection("users").document(uid).set(
        {
            "brandKit": {
                "logoUrl": logo_url,
                "logoUpdatedAt": int(time.time()),
            }
        },
        merge=True,
    )

    return {"logoUrl": logo_url}

@app.post("/upload-reference-images")
async def upload_reference_images(
    files: List[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    if len(files) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 reference images allowed.")

    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    urls: List[str] = []

    for f in files[:3]:
        ct = (f.content_type or "").lower().strip()

        if ct not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ct or 'unknown'}")

        data = await f.read()

        if not data:
            continue

        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Reference image too large. Max 8MB per image.")

        url = upload_bytes_to_firebase_storage(
            data,
            uid,
            content_type=ct,
            folder="reference_images",
            filename_hint=f.filename or "reference-image",
        )

        urls.append(url)

    if not urls:
        raise HTTPException(status_code=400, detail="No valid images uploaded.")

    return {"urls": urls}

# ---------------- Generate Ad ----------------
@app.post("/generate-ad")
async def generate_ad(payload: AdRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    brand_kit = (user_doc.get("brandKit") or {}) if payload.useBrandKit else {}
    brand_kit_context = build_brand_kit_prompt_context(brand_kit)
    tier, status = get_tier_and_status(user_doc)

    winner_guidance = (getattr(payload, "winnerGuidance", None) or "").strip()[:1000]
    winner_profile = getattr(payload, "winnerProfile", None)
    winners_apply = getattr(payload, "winnersApply", None)
    winners_influence = getattr(payload, "winnersInfluence", None)

    if (winner_guidance or winner_profile) and not admin:
        require_pro_or_business(tier)

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
    if not product_name:
        raise HTTPException(status_code=400, detail="product_name is required.")

    company_name = (payload.companyName or "").strip()[:80]
    description = (payload.description or "").strip()[:800]
    audience = (payload.audience or "").strip()[:120]
    tone = (payload.tone or "confident").strip()[:40]
    platform = (payload.platform or "Instagram").strip()[:40]
    offer = (payload.offer or "").strip()[:80]
    goal = (payload.goal or "Sales").strip()[:30]
    style = (payload.stylePreset or "Minimal").strip()[:30]
    product_type = (payload.productType or "").strip()[:40] or None
    campaign_objective = (payload.campaignObjective or "Auto").strip()[:80]
    reference_image_urls = (payload.referenceImageUrls or [])[:3]
    reference_image_mode = (payload.referenceImageMode or "product_reference").strip()[:40]

    aspect_ratio = size_to_aspect_ratio(payload.imageSize)

    winners_line = ""
    if winner_profile:
        winners_line = inject_winners_structured_image(
            "",
            winner_profile,
            winners_apply,
            winners_influence,
        ).strip()
        if winners_line:
            winners_line = "\n" + winners_line
    elif winner_guidance:
        winners_line = f"\nPast winners guidance (use lightly; do NOT mention metrics): {winner_guidance}"

    copy_prompt = f"""Create high-performing ad copy as JSON ONLY.
    
==================================================
PRIORITY ORDER
==================================================

When generating this creative, follow these priorities in order:

1. The user's current request is the highest priority.
   Always satisfy the user's requested product, offer, goal, platform, style,
   and any specific instructions they provide.

2. Use the Brand Kit to maintain consistent branding, colors, typography,
   messaging, voice, personality, and design language.
   Only apply Brand Kit fields that are present.
   Never override the user's current request with Brand Kit defaults.

3. Use the Winner Profile as optimization guidance only.
   Incorporate successful patterns when they do not conflict with the user's
   request or Brand Kit.
   Never copy previous creatives.

4. Follow general advertising best practices to maximize performance while
   maintaining originality and visual quality.
    
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

{brand_kit_context}

{winners_line}
"""

    winners_section = f"""
        ==================================================
        PAST WINNING CREATIVE INSIGHTS
        ==================================================

        These insights summarize patterns identified from the advertiser's highest-performing creatives. Treat them as performance-informed creative direction that should influence your design decisions.

        These insights represent characteristics shared by the advertiser's highest-performing creatives.

        Use these insights to influence layout, composition, lighting, visual hierarchy, typography, color palette, and overall creative direction.

        Do not copy previous advertisements directly. Instead, naturally apply the successful design principles while creating a new, original advertisement.

        {winners_line}
        """ if winners_line else ""

    visual_prompt = f"""
You are the Creative Director at a world-class advertising agency.

Your job is to design a premium, production-ready advertisement that a Fortune 500 company would confidently run on Meta, Instagram, LinkedIn, TikTok, or Google Display.

The final result should look like it was created by an experienced marketing designer—not AI.

==================================================
CREATIVE BRIEF
==================================================

Company:
{company_name or brand_kit.get("brandName") or product_name}

Product:
{product_name}

Product Description:
{description}

Target Audience:
{audience}

Platform:
{platform}

Campaign Goal:
{goal}

Campaign Objective:
{campaign_objective}

Offer:
{offer or "No promotional offer"}

Brand Style:
{style}

Tone:
{tone}

==================================================
PRIORITY ORDER
==================================================

When generating this creative, follow these priorities in order:

1. The user's current request is the highest priority.
   Always satisfy the user's requested product, offer, goal, platform, style,
   and any specific instructions they provide.

2. Use the Brand Kit to maintain consistent branding, colors, typography,
   messaging, voice, personality, and design language.
   Only apply Brand Kit fields that are present.
   Never override the user's current request with Brand Kit defaults.

3. Use the Winner Profile as optimization guidance only.
   Incorporate successful patterns when they do not conflict with the user's
   request or Brand Kit.
   Never copy previous creatives.

4. Follow general advertising best practices to maximize performance while
   maintaining originality and visual quality.

==================================================
BRAND KIT
==================================================

{brand_kit_context}

When Brand Kit information is provided:

• Treat the Brand Kit as the established visual identity.
• Use the supplied brand colors throughout the advertisement whenever appropriate.
• The primary color should be the dominant accent color.
• The secondary color should support the design.
• The accent color should be used for buttons, highlights, badges, or supporting elements.
• Keep the overall advertisement visually consistent with the Brand Kit.
• Do not ignore supplied brand colors unless the user specifically requests a different style.

When Brand Kit fonts are provided:

• Use the specified headline font style for major headlines.
• Use the specified body font style for supporting text.
• Use the CTA font style for buttons.
• If the exact font is unavailable, closely match its visual appearance.

If a logo reference image is provided:

• Preserve the logo design as accurately as possible.
• Scale it naturally for the composition.
• Keep the logo sharp and legible.
• Never stretch, crop, recolor, or distort the logo.
• Place the logo where a professional advertising designer would (for example on product packaging, in the upper corner, or as subtle brand identification).
• The logo should reinforce the advertisement, not dominate it.
• Unless specifically requested, the logo should occupy less than 10% of the overall advertisement.

If reference images are provided, use them as visual guidance.

Reference image mode:
{reference_image_mode}

If reference mode is product_reference, preserve the product, packaging, app screen, or object identity from the uploaded references as closely as possible.

If reference mode is style_inspiration, use the references only for composition, mood, lighting, framing, and design inspiration. Do not copy the reference image directly.

{winners_section}

==================================================
DESIGN REQUIREMENTS
==================================================

Create a complete advertisement—not just a product render.

The finished advertisement should be visually indistinguishable from a professionally designed digital advertisement created by a senior advertising designer using Adobe Photoshop.

Every design decision should reflect modern advertising best practices and commercial-quality graphic design.

The design should include:

• A premium hero product
• Professional advertising layout
• Clean modern composition
• Authentic commercial photography
• Luxury lighting
• Elegant spacing
• Strong visual hierarchy
• Professional marketing typography
• CTA BUTTON
    - Include one professionally designed call-to-action button.
    - The button should:
        • Be visually prominent without overpowering the design.
        • Use strong contrast against the background.
        • Have premium rounded corners.
        • Include clean, readable typography.
        • Feel modern and professionally designed.
        • Match the Brand Kit colors when available.
        • Position naturally near the bottom of the advertisement.
• One clear headline
• One supporting line if needed
• One offer badge if appropriate

==================================================
VISUAL HIERARCHY
==================================================

Priority order:

1. Product
2. Brand
3. Headline
4. Offer
5. CTA

The product should occupy roughly 60% of the visual composition.

Typography should complement the product—not overpower it.

==================================================
TYPOGRAPHY
==================================================

Use real English words.

Every word must be correctly spelled.

Typography should be clean, elegant, readable, and professionally typeset.

Avoid excessive text.

Never use placeholder or meaningless text.

==================================================
ART DIRECTION
==================================================

The advertisement should feel:

Premium

Modern

Trustworthy

Professional

Commercial

Photorealistic

Visually balanced

Use realistic shadows, reflections, textures, depth of field, and studio-quality lighting.

==================================================
NEGATIVE REQUIREMENTS
==================================================

Do not include:

Watermarks

Stock photo watermarks

Distorted products

Duplicate products

Clutter

Busy backgrounds

Unnecessary props

Unrealistic lighting

Comic-style graphics

Cheap clip art

Messy layouts

==================================================
FINAL GOAL
==================================================

Create an advertisement that looks ready to publish immediately as a paid social advertisement.

It should be visually impressive enough to appear in a professional design portfolio.

""".strip()

    async def _gen_copy():
        try:
            resp = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=OPENAI_TEXT_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are an expert direct-response ad copywriter. "
                                "Output ONLY valid JSON."
                            ),
                        },
                        {
                            "role": "user",
                            "content": copy_prompt,
                        },
                    ],
                    max_completion_tokens=450,
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
            img_bytes = await asyncio.to_thread(
                lambda: generate_gpt_image_bytes(
                    prompt=visual_prompt,
                    size=payload.imageSize or "1024x1024",
                    input_image_url=brand_kit.get("logoUrl"),
                    input_image_urls=reference_image_urls,
                )
            )
            return upload_png_to_firebase_storage(img_bytes, uid)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"GPT Image generation failed: {e}")

    copy_obj, image_url = await asyncio.gather(_gen_copy(), _gen_image_and_upload())

    image_job_id = uuid.uuid4().hex
    try:
        db.collection("image_jobs").document(image_job_id).set({
            "uid": uid,
            "createdAt": int(time.time()),
            "status": "succeeded",
            "source": "ad_generator",
            "productName": product_name,
            "description": description,
            "audience": audience,
            "tone": tone,
            "platform": platform,
            "goal": goal,
            "offer": offer,
            "stylePreset": style,
            "productType": product_type,
            "aspectRatio": aspect_ratio,
            "campaignObjective": campaign_objective,
            "referenceImageUrls": reference_image_urls,
            "referenceImageMode": reference_image_mode,
            "referenceImageCount": len(reference_image_urls),
            "useBrandKit": payload.useBrandKit,
            "brandKitUsed": bool(brand_kit_context),
            "brandKitLogoUsed": bool(brand_kit.get("logoUrl")),
            "useMyWinners": bool(winner_profile),
            "visualPrompt": visual_prompt,
            "imageUrl": image_url,
            "copy": copy_obj,
            "error": None,
            "usage": {
                "used": cap_result.get("used"),
                "cap": cap_result.get("cap"),
                "month": cap_result.get("month"),
                "remaining": max(0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)),
            },
            "winnerProfile": winner_profile or None,
            "winnersApply": winners_apply or None,
            "winnersInfluence": winners_influence if winners_influence is not None else None,
            "winnerGuidance": winner_guidance or None,
            "model": OPENAI_IMAGE_MODEL,
        })
    except Exception:
        pass

    legacy_text = (
        f"{copy_obj.get('headline','')}\n\n"
        f"{copy_obj.get('primary_text','')}\n\n"
        f"CTA: {copy_obj.get('cta','')}"
    ).strip()

    return {
        "text": legacy_text,
        "copy": copy_obj,
        "imageUrl": image_url,
        "imageJobId": image_job_id,
        "meta": {"goal": goal, "stylePreset": style, "offer": offer, "productType": product_type},
        "usage": {
            "used": cap_result.get("used"),
            "cap": cap_result.get("cap"),
            "month": cap_result.get("month"),
            "remaining": max(0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)),
        },
    }


# ---------------- Optimize Ad (Pro/Business only, DOES NOT consume usage) ----------------
# ---------------- Optimize Ad (Pro/Business only, DOES NOT consume usage) ----------------
@app.post("/optimize-ad", response_model=OptimizeAdResponse)
async def optimize_ad(payload: OptimizeAdRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}

    brand_kit = (user_doc.get("brandKit") or {}) if getattr(payload, "useBrandKit", True) else {}
    brand_kit_context = build_brand_kit_prompt_context(brand_kit)

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

    creative_urls = payload.creative_image_urls or []
    creative_analysis = await analyze_uploaded_creatives(creative_urls) if creative_urls else ""

    extra = {
        "flight_start": payload.flight_start,
        "flight_end": payload.flight_end,
        "placements": payload.placements,
        "objective": payload.objective,
        "audience_size": payload.audience_size,
        "budget_type": payload.budget_type,
        "conversion_event": payload.conversion_event,
        "geo": payload.geo,
        "device": payload.device,
    }

    optimizer_prompt = f"""
You are a senior direct-response creative strategist and performance marketing analyst.

Your job is to analyze the current ad, uploaded creative, campaign context, and metrics, then produce:
1. A concise diagnosis
2. Specific creative recommendations
3. Improved ad copy
4. A production-ready image prompt for generating a stronger finished advertisement

RULES:
- Output ONLY valid JSON.
- Do not include markdown.
- Do not include commentary outside the JSON object.
- likely_issues must be an array of strings.
- recommended_changes must be an array of strings.
- confidence must be exactly one of: low, medium, high.
- improved_headline <= 40 characters.
- improved_primary_text <= 150 characters.
- improved_cta must be one of: Shop Now, Learn More, Sign Up, Get Offer, Download, Contact Us, Book Now.
- improved_image_prompt should describe a complete, polished advertisement, not just a product photo.
- The improved image prompt should encourage clean readable typography, correct spelling, strong product focus, clear CTA, and professional ad layout.
- Do not recommend misleading claims, unrealistic guarantees, or unsupported performance claims.

==================================================
PRIORITY ORDER
==================================================

When analyzing this advertisement and generating improvements, follow these priorities in order:

1. Preserve the advertiser's core product, offer, campaign objective, and messaging.
   Improvements should strengthen the existing campaign—not create a completely different one.

2. Maintain the Established Brand Identity.
   Use the Brand Kit to preserve branding, colors, typography, messaging, voice,
   personality, and overall creative direction.
   Only apply Brand Kit fields that are present.
   Never recommend changes that conflict with the Brand Kit.

3. Use the uploaded creative analysis and performance metrics to identify the
   highest-impact opportunities for improvement.
   Recommendations should improve performance while remaining consistent with the brand.

4. Follow modern advertising and conversion best practices.
   Focus on stronger hooks, better visual hierarchy, clearer messaging,
   improved readability, stronger CTAs, and higher commercial quality.

CAMPAIGN CONTEXT:
product_name: {product_name}
description: {description}
audience: {audience}
tone: {tone}
platform: {platform}
goal: {goal}
offer: {offer or "N/A"}
audience_temp: {payload.audience_temp}
notes: {payload.notes or ""}

{brand_kit_context}

When Brand Kit information is provided:
• Treat it as the established visual identity.
• Only use colors, fonts, logo, voice, and rules that are present.
• If colors or fonts are blank, ignore them completely.
• Do not invent missing brand colors or fonts.
• Use supplied brand colors for accents, CTA buttons, badges, highlights, and supporting design elements.
• Use supplied fonts or close visual matches for headline, body, and CTA typography.

EXTRA CONTEXT JSON:
{json.dumps(extra)}

CREATIVE ANALYSIS FROM UPLOADED IMAGES:
{creative_analysis or "No uploaded creatives."}

CURRENT CREATIVE:
headline: {payload.current_headline or ""}
primary_text: {payload.current_primary_text or ""}
cta: {payload.current_cta or ""}
image_prompt_or_notes: {payload.current_image_prompt or ""}

PERFORMANCE METRICS JSON:
{json.dumps(metrics)}

ANALYSIS GUIDANCE:
- If CTR is low, focus on hook strength, visual stopping power, headline clarity, contrast, and audience-message fit.
- If CPC is high, focus on relevance, clarity, stronger offer framing, and reducing friction.
- If CPA is high, focus on trust, offer strength, CTA clarity, objections, and conversion intent.
- If CPM is high, mention audience/placement competitiveness only if relevant, but focus creative recommendations on improving efficiency.
- If ROAS is low, focus on stronger purchase intent, clearer value proposition, better offer presentation, and reducing wasted clicks.
- If metrics are incomplete, state that confidence is medium or low and base recommendations on creative fundamentals.

IMPROVED IMAGE PROMPT REQUIREMENTS:
The improved_image_prompt should instruct the image model to create a finished paid social advertisement with:
- Hero product or product scene
- Professional commercial photography
- Clean readable English typography
- One clear headline
- Optional short supporting line
- Clear CTA button
- Offer badge if an offer exists
- Strong visual hierarchy
- Balanced spacing
- Platform-appropriate layout
- Premium, realistic, publish-ready design

Return JSON with exactly these keys:
summary,
likely_issues,
recommended_changes,
improved_headline,
improved_primary_text,
improved_cta,
improved_image_prompt,
confidence
""".strip()

    try:
        resp = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=OPENAI_TEXT_MODEL,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You output only valid JSON. "
                            "Return arrays where arrays are requested. "
                            "Return confidence as lowercase: low, medium, or high."
                        ),
                    },
                    {
                        "role": "user",
                        "content": optimizer_prompt,
                    },
                ],
                max_completion_tokens=750,
            )
        )

        raw = (resp.choices[0].message.content or "").strip()
        obj = _extract_json_object(raw)

        if not obj or "improved_headline" not in obj:
            raise HTTPException(status_code=502, detail="Optimizer returned invalid JSON.")

        obj.setdefault(
            "summary",
            "Here are recommended improvements based on the metrics provided."
        )

        # Normalize likely_issues
        issues = obj.get("likely_issues", [])

        if isinstance(issues, dict):
            issues = list(issues.values())
        elif isinstance(issues, str):
            issues = [issues]
        elif not isinstance(issues, list):
            issues = []

        obj["likely_issues"] = [str(x).strip() for x in issues if str(x).strip()]

        # Normalize recommended_changes
        changes = obj.get("recommended_changes", [])

        if isinstance(changes, dict):
            changes = list(changes.values())
        elif isinstance(changes, str):
            changes = [changes]
        elif not isinstance(changes, list):
            changes = []

        obj["recommended_changes"] = [str(x).strip() for x in changes if str(x).strip()]

        # Normalize headline
        obj["improved_headline"] = str(obj.get("improved_headline") or product_name or "Better Results").strip()[:80]

        # Normalize primary text
        obj["improved_primary_text"] = str(
            obj.get("improved_primary_text") or "Discover a clearer, stronger offer designed to drive action."
        ).strip()[:250]

        # Normalize image prompt
        obj["improved_image_prompt"] = str(
            obj.get("improved_image_prompt") or "Create a premium, professional paid social advertisement with strong product focus, clean typography, clear CTA, balanced spacing, and modern commercial design."
        ).strip()

        # Normalize CTA
        allowed_ctas = {
            "Shop Now",
            "Learn More",
            "Sign Up",
            "Get Offer",
            "Download",
            "Contact Us",
            "Book Now",
        }

        cta = str(obj.get("improved_cta", "Learn More")).strip()

        if cta not in allowed_ctas:
            cta = "Learn More"

        obj["improved_cta"] = cta

        # Normalize confidence
        confidence = str(obj.get("confidence", "medium")).strip().lower()

        if confidence not in {"low", "medium", "high"}:
            confidence = "medium"

        obj["confidence"] = confidence

        return OptimizeAdResponse(**obj)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Optimization failed: {e}")

# ---------------- Generate New Creative from Optimizer (Pro/Business only, CONSUMES usage) ----------------
@app.post("/generate-from-optimizer")
async def generate_from_optimizer(payload: GenerateFromOptimizerRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    brand_kit = (user_doc.get("brandKit") or {}) if payload.useBrandKit else {}
    brand_kit_context = build_brand_kit_prompt_context(brand_kit)
    tier, status = get_tier_and_status(user_doc)

    if not admin:
        allowed_statuses = {"active", "trialing"}
        if status not in allowed_statuses and tier not in (None, "trial_monthly"):
            raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")
        require_pro_or_business(tier)

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

    aspect_ratio = size_to_aspect_ratio(payload.imageSize)

    product_name = (getattr(payload, "product_name", None) or getattr(payload, "productName", None) or "").strip()[:80]
    description = (getattr(payload, "description", None) or "").strip()[:800]
    product_type = (getattr(payload, "productType", None) or "").strip()[:40] or None
    style = (getattr(payload, "stylePreset", None) or "Minimal").strip()[:30]
    tone = (getattr(payload, "tone", None) or "confident").strip()[:40]
    goal = (getattr(payload, "goal", None) or "Performance optimization").strip()[:60]
    platform = (payload.platform or "Instagram").strip()[:40]

    if not product_name:
        product_name = "the same product as the reference creative"

    visual_prompt = f"""
You are the Lead Creative Director at a world-class advertising agency.

You are reviewing an existing advertisement that performed reasonably well.

Your task is to redesign it into a significantly stronger version while preserving the same product identity and campaign intent.

The result should feel like Version 2 of the same advertisement—not a completely different campaign.

==================================================
PRODUCT
==================================================

Brand:
{product_name}

Description:
{description}

Platform:
{platform}

Campaign Goal:
{goal}

Tone:
{tone}

Style:
{style}

==================================================
UPDATED COPY
==================================================

Headline:
{payload.improved_headline}

Primary Text:
{payload.improved_primary_text}

CTA:
{payload.improved_cta}

==================================================
PRIORITY ORDER
==================================================

When generating this optimized advertisement, follow these priorities in order:

1. Preserve the advertiser's core product, message, offer, and campaign objective.
   This should feel like an improved version of the same campaign, not a totally new campaign.

2. Maintain the Established Brand Identity.
   Use the Brand Kit to preserve branding, colors, typography, messaging, voice,
   personality, and design language.
   Only apply Brand Kit fields that are present.
   Never override the advertiser's branding.

3. Apply the optimization recommendations.
   Improve the creative using the optimizer's suggested copy, image prompt, and performance guidance,
   but do not sacrifice brand consistency or product accuracy.

4. Follow modern advertising and conversion best practices.
   Improve clarity, hierarchy, stopping power, trust, and commercial quality.

==================================================
OPTIMIZATION OBJECTIVES
==================================================

Apply these improvements:

{payload.improved_image_prompt}

==================================================
BRAND KIT
==================================================

{brand_kit_context}

If a logo reference image is provided, use it as the brand logo reference. Preserve the logo identity as accurately as possible and place it tastefully in the advertisement only when it improves the design.

==================================================
CREATIVE DIRECTION
==================================================

Improve the advertisement while keeping the same product identity.

The finished advertisement should be visually indistinguishable from a professionally designed digital advertisement created by a senior advertising designer using Adobe Photoshop.

Every design decision should reflect modern advertising best practices and commercial-quality graphic design.

Preserve the overall campaign theme.

Create a noticeably higher-quality version with:

• Better composition
• Better product placement
• Better lighting
• Better realism
• Better typography
• Better spacing
• Better hierarchy
• Better commercial appeal

==================================================
VISUAL HIERARCHY
==================================================

Priority:

1. Product
2. Brand
3. Headline
4. Supporting text
5. Offer (if appropriate)
6. CTA

The product should dominate the composition.

Typography should support the product—not compete with it.

==================================================
TYPOGRAPHY
==================================================

Use only correctly spelled English.

Use elegant professional marketing typography.

The text should be perfectly readable.

Avoid excessive wording.

Avoid clutter.

==================================================
QUALITY
==================================================

Create an advertisement that appears professionally designed.

Use:

• Studio-quality lighting
• Premium commercial photography
• Realistic shadows
• Natural reflections
• High-end textures
• Excellent depth of field
• Balanced composition

==================================================
NEGATIVE REQUIREMENTS
==================================================

Do NOT include:

Watermarks

Duplicate products

Random decorative objects

Unreadable typography

Misspelled words

Placeholder text

Fake logos

Messy layouts

Cheap clip art

Distorted products

Think like an experienced performance marketing designer.

Every design decision should increase the likelihood that someone stops scrolling and takes action.

The advertisement should maximize visual attention while maintaining a premium brand appearance.

==================================================
FINAL GOAL
==================================================

The optimized advertisement should look like the result of an experienced creative team improving an already good campaign.

Someone should immediately think:

"This is a stronger version of the same advertisement."

Do not redesign the campaign from scratch.

Improve it.

""".strip()

    try:
        reference_image_urls = (payload.creative_image_urls or [])[:3]

        img_bytes = await asyncio.to_thread(
            lambda: generate_gpt_image_bytes(
                prompt=visual_prompt,
                size=payload.imageSize or "1024x1024",
                input_image_url=brand_kit.get("logoUrl"),
                input_image_urls=reference_image_urls,
        )
    )

        image_url = upload_png_to_firebase_storage(img_bytes, uid)

        image_job_id = uuid.uuid4().hex
        try:
            db.collection("image_jobs").document(image_job_id).set({
                "uid": uid,
                "createdAt": int(time.time()),
                "status": "succeeded",
                "source": "optimizer_generate",
                "productName": product_name,
                "description": description,
                "tone": tone,
                "goal": goal,
                "stylePreset": style,
                "productType": product_type,
                "aspectRatio": aspect_ratio,
                "referenceImageUrls": reference_image_urls,
                "referenceImageCount": len(reference_image_urls),
                "useBrandKit": payload.useBrandKit,
                "brandKitUsed": bool(brand_kit_context),
                "brandKitLogoUsed": bool(brand_kit.get("logoUrl")),
                "visualPrompt": visual_prompt,
                "imageUrl": image_url,
                "copy": {
                    "headline": payload.improved_headline,
                    "primary_text": payload.improved_primary_text,
                    "cta": payload.improved_cta,
                },
                "error": None,
                "usage": {
                    "used": cap_result.get("used"),
                    "cap": cap_result.get("cap"),
                    "month": cap_result.get("month"),
                    "remaining": max(0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)),
                },
                "model": OPENAI_IMAGE_MODEL,
            })
        except Exception:
            pass

        return {
            "copy": {
                "headline": payload.improved_headline,
                "primary_text": payload.improved_primary_text,
                "cta": payload.improved_cta,
            },
            "imageUrl": image_url,
            "imageJobId": image_job_id,
            "usage": {
                "used": cap_result.get("used"),
                "cap": cap_result.get("cap"),
                "month": cap_result.get("month"),
                "remaining": max(0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GPT Image generation failed: {e}")


# ---------------- Creation of Admin Page Routes ----------------

@app.get("/admin/users")
def admin_list_users(
    authorization: str | None = Header(default=None),
    q: str = Query(default=""),
    tier: str = Query(default="all"),
    status: str = Query(default="all"),
    limit: int = Query(default=50, ge=1, le=200),
    page_token: str = Query(default=""),
) -> dict[str, Any]:
    try:
        uid, _email, claims = require_user(authorization)
        if not is_admin(claims):
            raise HTTPException(status_code=403, detail="Admin only")

        db = get_db()

        q_norm = (q or "").strip().lower()
        tier_norm = (tier or "all").strip().lower()
        status_norm = (status or "all").strip().lower()

        pt = page_token or None
        page = admin_auth.list_users(page_token=pt, max_results=limit)

        results = []

        for u in page.users:
            auth_uid = u.uid
            auth_email = u.email or ""
            display_name = (u.display_name or "").strip()

            created_iso = None
            try:
                ms = u.user_metadata.creation_timestamp
                if ms:
                    created_iso = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
            except Exception:
                created_iso = None

            prof = {}
            try:
                snap = db.collection("users").document(auth_uid).get()
                if snap.exists:
                    prof = snap.to_dict() or {}
            except Exception:
                prof = {}

            first = (prof.get("firstName") or "").strip()
            last = (prof.get("lastName") or "").strip()

            if (not first and not last) and display_name:
                parts = display_name.split()
                if len(parts) >= 2:
                    first = first or parts[0]
                    last = last or " ".join(parts[1:])
                else:
                    first = first or display_name

            tier_for_caps, stripe_status_from_helper = get_tier_and_status(prof)

            stripe_obj = prof.get("stripe") or {}
            requested_tier = (stripe_obj.get("requestedTier") or "").strip()
            customer_id = (stripe_obj.get("customerId") or "").strip()

            user_tier = stripe_obj.get("tier") or stripe_obj.get("requestedTier") or prof.get("tier") or "-"
            user_tier = str(user_tier).strip() or "-"

            stripe_status = stripe_obj.get("status") or stripe_status_from_helper or "inactive"
            stripe_status = str(stripe_status).strip().lower()

            usage_info = peek_usage(db, auth_uid, tier_for_caps)
            used = int(usage_info.get("used") or 0)
            cap = int(usage_info.get("cap") or 0)
            remaining = int(usage_info.get("remaining") or max(0, cap - used))
            usage_pct = 0 if cap <= 0 else round((used / cap) * 100)

            VIDEO_CAPS = {
                "early_access": 3,
                "pro_monthly": 15,
                "business_monthly": 50,
            }

            usage_period = get_usage_period(prof)
            period_key = usage_period["periodKey"]

            video_cap = int(VIDEO_CAPS.get(tier_for_caps) or 0)
            video_used = int(prof.get("video_used") or 0)
            video_current_period = prof.get("video_period_key") or prof.get("video_month_key")

            if video_current_period != period_key:
                video_used = 0

            video_remaining = max(0, video_cap - video_used) if video_cap else 0
            video_usage_pct = 0 if video_cap <= 0 else round((video_used / video_cap) * 100)

            if tier_norm != "all" and user_tier.lower() != tier_norm:
                continue

            if status_norm != "all" and stripe_status.lower() != status_norm:
                continue

            if q_norm:
                hay = f"{first} {last} {auth_email} {display_name}".lower()
                if q_norm not in hay:
                    continue

            results.append({
                "uid": auth_uid,
                "firstName": first,
                "lastName": last,
                "email": auth_email,
                "createdAt": created_iso,

                "tier": user_tier,
                "requestedTier": requested_tier,
                "stripeStatus": stripe_status,
                "customerId": customer_id,

                "used": used,
                "cap": cap,
                "remaining": remaining,
                "usagePct": usage_pct,
                "monthlyUsage": used,

                "hasProfile": bool(prof),

                "videoUsed": video_used,
                "videoCap": video_cap,
                "videoRemaining": video_remaining,
                "videoUsagePct": video_usage_pct,
            })

        next_token = page.next_page_token or ""
        return {"users": results, "nextCursor": next_token}

    except HTTPException:
        raise
    except Exception as e:
        print("ADMIN USERS ERROR:", repr(e))
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": str(e)})

@app.post("/admin/users/{target_uid}/usage/grant")
def admin_grant_usage_credits(
    target_uid: str,
    authorization: str | None = Header(default=None),
    credits: int = Query(default=5, ge=1, le=100),
):
    uid, _email, claims = require_user(authorization)
    if not is_admin(claims):
        raise HTTPException(status_code=403, detail="Admin only")

    db = get_db()

    target_snap = db.collection("users").document(target_uid).get()
    target_doc = target_snap.to_dict() or {}

    usage_period = get_usage_period(target_doc)
    period_key = usage_period["periodKey"]

    usage_ref = db.collection("usage").document(target_uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = usage_ref.get(transaction=transaction)
        data = snap.to_dict() or {}

        current_period = data.get("periodKey") or data.get("month")
        used = int(data.get("used") or 0)

        if current_period != period_key:
            used = 0

        new_used = max(0, used - credits)

        transaction.set(
            usage_ref,
            {
                "periodKey": period_key,
                "periodStart": usage_period.get("periodStart"),
                "periodEnd": usage_period.get("periodEnd"),
                "periodSource": usage_period.get("periodSource"),
                "month": usage_period.get("month"),
                "used": new_used,
                "updatedAt": gc_firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )

        return {
            "ok": True,
            "uid": target_uid,
            "used": new_used,
            "granted": credits,
            **usage_period,
        }

    tx = db.transaction()
    return _tx(tx)

@app.post("/admin/users/{target_uid}/usage/reset")
def admin_reset_usage(
    target_uid: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    if not is_admin(claims):
        raise HTTPException(status_code=403, detail="Admin only")

    db = get_db()

    target_snap = db.collection("users").document(target_uid).get()
    target_doc = target_snap.to_dict() or {}

    usage_period = get_usage_period(target_doc)
    period_key = usage_period["periodKey"]

    usage_ref = db.collection("usage").document(target_uid)

    usage_ref.set(
        {
            "periodKey": period_key,
            "periodStart": usage_period.get("periodStart"),
            "periodEnd": usage_period.get("periodEnd"),
            "periodSource": usage_period.get("periodSource"),
            "month": usage_period.get("month"),
            "used": 0,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )

    return {
        "ok": True,
        "uid": target_uid,
        "used": 0,
        **usage_period,
    }

@app.post("/admin/users/{target_uid}/tier/request")
def admin_request_tier_change(
    target_uid: str,
    body: AdminRequestTierBody,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    if not is_admin(claims):
        raise HTTPException(status_code=403, detail="Admin only")

    requested = (body.requestedTier or "").strip()
    allowed = {"trial_monthly", "starter_monthly", "pro_monthly", "business_monthly", "early_access"}
    if requested not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid requestedTier. Allowed: {sorted(allowed)}")

    db = get_db()
    user_ref = db.collection("users").document(target_uid)

    # Store on stripe object (matches your existing stripe metadata pattern)
    user_ref.set(
        {
            "stripe": {
                "requestedTier": requested,
                "requestedTierAt": gc_firestore.SERVER_TIMESTAMP,
            }
        },
        merge=True,
    )

    return {"ok": True, "uid": target_uid, "requestedTier": requested}

@app.post("/users/me/tier/clear-request")
def clear_requested_tier(
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)

    db = get_db()
    user_ref = db.collection("users").document(uid)

    user_ref.set(
        {
            "stripe": {
                "requestedTier": gc_firestore.DELETE_FIELD
            }
        },
        merge=True,
    )

    return {"ok": True}

# --- Video Usage (My Account) ---
@app.get("/video/usage")
def get_video_usage(authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()

    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}

    user_doc = ensure_stripe_period_for_user(db, uid, user_doc)

    tier, _status = get_tier_and_status(user_doc)

    VIDEO_CAPS = {
        "early_access": 3,
        "pro_monthly": 15,
        "business_monthly": 50,
    }

    usage_period = get_usage_period(user_doc)
    period_key = usage_period["periodKey"]

    video_used = int(user_doc.get("video_used", 0) or 0)
    video_current_period = user_doc.get("video_period_key") or user_doc.get("video_month_key")

    if video_current_period != period_key:
        video_used = 0

    cap = VIDEO_CAPS.get(tier, 0)
    remaining = max(0, int(cap) - int(video_used)) if cap else 0

    return {
        **usage_period,
        "used": video_used,
        "cap": cap,
        "remaining": remaining,
        "enabled": tier in VIDEO_CAPS,
        "tier": tier,
    }

@app.post("/admin/users/{target_uid}/video/usage/grant")
def admin_grant_video_credits(
    target_uid: str,
    authorization: str | None = Header(default=None),
    credits: int = Query(default=1, ge=1, le=10),
):
    uid, _email, claims = require_user(authorization)
    if not is_admin(claims):
        raise HTTPException(status_code=403, detail="Admin only")

    db = get_db()
    user_ref = db.collection("users").document(target_uid)

    target_snap = user_ref.get()
    target_doc = target_snap.to_dict() or {}

    usage_period = get_usage_period(target_doc)
    period_key = usage_period["periodKey"]

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = user_ref.get(transaction=transaction)
        doc = snap.to_dict() or {}

        used = int(doc.get("video_used") or 0)
        current_period = doc.get("video_period_key") or doc.get("video_month_key")

        if current_period != period_key:
            used = 0

        new_used = max(0, used - credits)

        transaction.set(
            user_ref,
            {
                "video_used": new_used,
                "video_period_key": period_key,
                "video_period_start": usage_period.get("periodStart"),
                "video_period_end": usage_period.get("periodEnd"),
                "video_period_source": usage_period.get("periodSource"),
                "video_month_key": usage_period.get("month"),
                "updatedAt": gc_firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )

        return {
            "ok": True,
            "uid": target_uid,
            "video_used": new_used,
            "granted": credits,
            **usage_period,
        }

    tx = db.transaction()
    return _tx(tx)


@app.post("/admin/users/{target_uid}/video/usage/reset")
def admin_reset_video_usage(
    target_uid: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    if not is_admin(claims):
        raise HTTPException(status_code=403, detail="Admin only")

    db = get_db()
    user_ref = db.collection("users").document(target_uid)

    target_snap = user_ref.get()
    target_doc = target_snap.to_dict() or {}

    usage_period = get_usage_period(target_doc)
    period_key = usage_period["periodKey"]

    user_ref.set(
        {
            "video_used": 0,
            "video_period_key": period_key,
            "video_period_start": usage_period.get("periodStart"),
            "video_period_end": usage_period.get("periodEnd"),
            "video_period_source": usage_period.get("periodSource"),
            "video_month_key": usage_period.get("month"),
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )

    return {
        "ok": True,
        "uid": target_uid,
        "video_used": 0,
        **usage_period,
    }

@app.get("/download-image/{job_id}")
async def download_image(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    snap = db.collection("image_jobs").document(job_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Image job not found.")

    data = snap.to_dict() or {}

    if not admin and data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    image_url = data.get("imageUrl")
    if not image_url:
        raise HTTPException(status_code=404, detail="No image URL found for this job.")

    try:
        r = requests.get(image_url, timeout=30)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch image: {e}")

    product_name = (data.get("productName") or "adgen-image").strip()
    safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", product_name).strip("-").lower()
    filename = f"{safe_name or 'adgen-image'}-{job_id[:8]}.png"

    return StreamingResponse(
        io.BytesIO(r.content),
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )

@app.get("/image/jobs")
async def list_image_jobs(
    authorization: str | None = Header(default=None),
    limit: int = Query(24, ge=1, le=100),
    cursor: int | None = Query(None, description="createdAt cursor (unix seconds)"),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    q = (
        db.collection("image_jobs")
        .where("uid", "==", uid)
        .order_by("createdAt", direction=gc_firestore.Query.DESCENDING)
        .limit(limit)
    )

    if cursor is not None:
        q = q.start_after({"createdAt": cursor})

    items = []
    last_created_at = None
    for snap in q.stream():
        data = snap.to_dict() or {}
        if not admin and data.get("uid") != uid:
            continue
        data["id"] = snap.id
        items.append(data)
        last_created_at = data.get("createdAt")

    return {"items": items, "nextCursor": last_created_at}


@app.get("/image/jobs/{job_id}")
async def get_image_job(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    ref = db.collection("image_jobs").document(job_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Job not found.")

    data = snap.to_dict() or {}
    if not admin and data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    data["id"] = snap.id
    return data

@app.post("/creative/performance/{kind}/{job_id}")
async def update_creative_performance(
    kind: str,
    job_id: str,
    payload: PerformanceUpdate,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    db = get_db()

    gate = require_pro_or_business_for_performance(db, uid, claims)
    admin = gate["admin"]

    kind = (kind or "").strip().lower()
    if kind not in {"image", "video"}:
        raise HTTPException(status_code=400, detail="kind must be 'image' or 'video'.")

    collection = "image_jobs" if kind == "image" else "video_jobs"

    ref = db.collection(collection).document(job_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Creative not found.")

    doc = snap.to_dict() or {}
    if not admin and doc.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    perf = payload.model_dump(exclude_none=True)

    # Percent validation (0-100)
    pct_fields = {"ctr", "thumb_stop_rate", "view_3s", "view_6s", "hold_rate", "conversion_rate"}
    for k in list(perf.keys()):
        if k in pct_fields and perf[k] is not None:
            if perf[k] < 0 or perf[k] > 100:
                raise HTTPException(status_code=400, detail=f"{k} must be between 0 and 100.")

    # Money validation
    spend = perf.get("spend")
    revenue = perf.get("revenue")
    cpm = perf.get("cpm")
    if spend is not None and spend < 0:
        raise HTTPException(status_code=400, detail="spend must be >= 0.")
    if revenue is not None and revenue < 0:
        raise HTTPException(status_code=400, detail="revenue must be >= 0.")
    if cpm is not None and cpm < 0:  
        raise HTTPException(status_code=400, detail="cpm must be >= 0.")

    # Notes cleanup
    if "notes" in perf and perf["notes"] is not None:
        perf["notes"] = perf["notes"].strip()[:800]

    # ✅ Auto-calc ROAS from spend + revenue
    if spend is not None and revenue is not None and spend > 0:
        perf["roas"] = round(revenue / spend, 4)
    else:
        # prevent stale ROAS lingering
        perf.pop("roas", None)

    perf["updatedAt"] = int(time.time())
    perf["updatedBy"] = uid

    ref.set({"performance": perf}, merge=True)

    return {"ok": True, "kind": kind, "jobId": job_id, "performance": perf}


# --- Shared insights implementation (we'll call it from BOTH /insights and /creative-insights) ---
async def _creative_insights_impl(
    authorization: str | None,
    limit: int,
    min_spend: float,
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    # Gate: Pro/Business only (admins bypass)
    if not admin:
        user_snap = db.collection("users").document(uid).get()
        user_doc = user_snap.to_dict() or {}
        tier, status = get_tier_and_status(user_doc)

        allowed_statuses = {"active", "trialing"}
        if status not in allowed_statuses and tier not in (None, "trial_monthly"):
            raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")
        require_pro_or_business(tier)

    def fetch_jobs(col_name: str) -> List[dict]:
        q = (
            db.collection(col_name)
            .where("uid", "==", uid)
            .order_by("createdAt", direction=gc_firestore.Query.DESCENDING)
            .limit(limit)
        )
        docs = []
        for snap in q.stream():
            docs.append({"id": snap.id, **(snap.to_dict() or {})})
        return docs

    image_docs = fetch_jobs("image_jobs")
    video_docs = fetch_jobs("video_jobs")

    items = []
    for d in image_docs:
        if not _has_perf(d):
            continue
        snap = _creative_snapshot("image", d["id"], d)
        spend = _safe_num((snap["performance"] or {}).get("spend")) or 0.0
        if spend < min_spend:
            continue
        items.append(snap)

    for d in video_docs:
        if not _has_perf(d):
            continue
        snap = _creative_snapshot("video", d["id"], d)
        spend = _safe_num((snap["performance"] or {}).get("spend")) or 0.0
        if spend < min_spend:
            continue
        items.append(snap)

    top_by_roas = _rank(items, "roas", desc=True)[:5]
    top_by_ctr = _rank(items, "ctr", desc=True)[:5]
    lowest_cpa = _rank_low(items, "cpa")[:5]
    lowest_cpm = _rank_low(items, "cpm")[:5] 

    all_roas = [_safe_num((x.get("performance") or {}).get("roas")) for x in items]
    all_ctr = [_safe_num((x.get("performance") or {}).get("ctr")) for x in items]
    all_cpa = [_safe_num((x.get("performance") or {}).get("cpa")) for x in items]
    all_cpm = [_safe_num((x.get("performance") or {}).get("cpm")) for x in items]
    

    summary = {
        "count_with_performance": len(items),
        "avg_roas": _avg([x for x in all_roas if x is not None]),
        "avg_ctr": _avg([x for x in all_ctr if x is not None]),
        "avg_cpa": _avg([x for x in all_cpa if x is not None]),
        "avg_cpm": _avg([x for x in all_cpm if x is not None]),
        "weighted_roas": _weighted_roas(items),
        "min_spend_filter": min_spend,
        "limit": limit,
    }

    best_platform = _group_best(items, "platform", min_spend=min_spend)
    best_tone = _group_best(items, "tone", min_spend=min_spend)
    best_style = _group_best([x for x in items if x["kind"] == "image"], "stylePreset", min_spend=min_spend)

    ratio_groups = defaultdict(list)
    for it in items:
        ratio = it.get("ratio")
        if not ratio:
            continue
        spend = _safe_num((it.get("performance") or {}).get("spend")) or 0.0
        if spend < min_spend:
            continue
        ratio_groups[ratio].append(it)

    ratio_rows = []
    for ratio, arr in ratio_groups.items():
        ratio_rows.append({
            "value": ratio,
            "count": len(arr),
            "weighted_roas": _weighted_roas(arr),
            "avg_ctr": _avg([_safe_num((x.get("performance") or {}).get("ctr")) for x in arr if _safe_num((x.get("performance") or {}).get("ctr")) is not None]),
            "avg_cpa": _avg([_safe_num((x.get("performance") or {}).get("cpa")) for x in arr if _safe_num((x.get("performance") or {}).get("cpa")) is not None]),
            "avg_cpm": _avg([_safe_num((x.get("performance") or {}).get("cpm")) for x in arr if _safe_num((x.get("performance") or {}).get("cpm")) is not None]),
        })
    ratio_rows.sort(key=lambda r: (r["weighted_roas"] if r["weighted_roas"] is not None else -1e18), reverse=True)
    best_ratio = {"best": ratio_rows[0] if ratio_rows else None, "rows": ratio_rows[:10]}

    guidance_parts = []
    if best_platform.get("best") and best_platform["best"].get("value"):
        guidance_parts.append(f"Best platform: {best_platform['best']['value']}")
    if best_tone.get("best") and best_tone["best"].get("value"):
        guidance_parts.append(f"Best tone: {best_tone['best']['value']}")
    if best_style.get("best") and best_style["best"].get("value"):
        guidance_parts.append(f"Best image style: {best_style['best']['value']}")
    if best_ratio.get("best") and best_ratio["best"].get("value"):
        guidance_parts.append(f"Best ratio: {best_ratio['best']['value']}")

    return {
        "summary": summary,
        "top": {
            "by_roas": top_by_roas,
            "by_ctr": top_by_ctr,
            "lowest_cpa": lowest_cpa,
            "lowest_cpm": lowest_cpm,
        },
        "patterns": {
            "platform": best_platform,
            "tone": best_tone,
            "image_stylePreset": best_style,
            "ratio": best_ratio,
        },
        "guidance": " • ".join(guidance_parts) if guidance_parts else "",
    }

@app.get("/creative-insights")
async def creative_insights(
    authorization: str | None = Header(default=None),
    limit: int = Query(200, ge=10, le=1000),
    min_spend: float = Query(0.0, ge=0.0),
):
    return await _creative_insights_impl(authorization, limit, min_spend)

@app.get("/insights")
async def insights(
    authorization: str | None = Header(default=None),
    limit: int = Query(200, ge=10, le=1000),
    min_spend: float = Query(0.0, ge=0.0),
):
    return await _creative_insights_impl(authorization, limit, min_spend)

@app.get("/winners/profile")
async def winners_profile(
    authorization: str | None = Header(default=None),
    kind: str | None = Query(None, description="image | video | None"),
    limit: int = Query(200, ge=10, le=1000),
    min_spend: float = Query(0.0, ge=0.0),
):
    """
    Returns a structured winners profile based on marked_successful creatives.
    This is used by 'Use My Winners' to inject structured signals instead of text blobs.
    """

    # Reuse your existing insights logic
    insights = await _creative_insights_impl(authorization, limit, min_spend)

    # Pull all top items (already filtered by spend etc.)
    items = []
    items.extend(insights.get("top", {}).get("by_roas", []) or [])
    items.extend(insights.get("top", {}).get("by_ctr", []) or [])

    # Deduplicate
    seen = set()
    winners = []
    for it in items:
        key = f"{it.get('kind')}:{it.get('id')}"
        if key in seen:
            continue
        seen.add(key)
        winners.append(it)

    if kind in {"image", "video"}:
        winners = [w for w in winners if w.get("kind") == kind]

    if not winners:
        return {"count": 0, "profile": {}}

    # Aggregate structured signals
    platforms = Counter()
    tones = Counter()
    ratios = Counter()

    for w in winners:
        if w.get("platform"):
            platforms[w["platform"]] += 1
        if w.get("tone"):
            tones[w["tone"]] += 1
        if w.get("ratio"):
            ratios[w["ratio"]] += 1

    def top(counter):
        if not counter:
            return None
        return counter.most_common(1)[0][0]

    profile = {
        "top_platform": top(platforms),
        "top_tone": top(tones),
        "top_ratio": top(ratios),
        "winner_count": len(winners),
    }

    return {
        "count": len(winners),
        "profile": profile,
    }



# ---------------- Stripe routes ----------------
app.include_router(stripe_router)


















