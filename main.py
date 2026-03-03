# main.py
from urllib.parse import quote
import os
import re
import json
import uuid
import asyncio
import requests
import time
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends, UploadFile, File
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

#Amdin Page Imports
from fastapi import Header, HTTPException, Query
from typing import Any, Optional
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import auth as admin_auth
from usage_caps import utc_month_key

import traceback
from fastapi.responses import JSONResponse

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

    offer: Optional[str] = None
    goal: Optional[str] = None
    stylePreset: Optional[str] = None
    productType: Optional[str] = None

    winnerGuidance: Optional[str] = None

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
    creative_image_urls: Optional[List[str]] = None

class PerformanceUpdate(BaseModel):
    ctr: Optional[float] = None
    cpc: Optional[float] = None
    cpa: Optional[float] = None

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
    for k in ("ctr", "cpc", "cpa", "spend", "revenue", "roas"):
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

        out.append({
            "value": g,
            "count": len(arr),
            "avg_ctr": _avg([x for x in ctrs if x is not None]),
            "avg_cpa": _avg([x for x in cpas if x is not None]),
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

# ---------------- Generate Ad ----------------
@app.post("/generate-ad")
async def generate_ad(payload: AdRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    tier, status = get_tier_and_status(user_doc)

    winner_guidance = (getattr(payload, "winnerGuidance", None) or "").strip()[:1000]
    if winner_guidance and not admin:
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

    description = (payload.description or "").strip()[:800]
    audience = (payload.audience or "").strip()[:120]
    tone = (payload.tone or "confident").strip()[:40]
    platform = (payload.platform or "Instagram").strip()[:40]

    offer = (payload.offer or "").strip()[:80]
    goal = (payload.goal or "Sales").strip()[:30]
    style = (payload.stylePreset or "Minimal").strip()[:30]
    product_type = (payload.productType or "").strip()[:40] or None

    style_hint = STYLE_HINTS.get(style, STYLE_HINTS["Minimal"])
    aspect_ratio = size_to_aspect_ratio(payload.imageSize)

    # IMPORTANT: subject should not override product_name — prompt builder anchors product_name regardless.
    subject = infer_visual_subject(product_name, description, product_type)

    winners_line=""
    if winner_guidance:
        winners_line=f"\nPast winners guidance (use lightly; do NOT mention metrics): {winner_guidance}"

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
{winners_line}
"""
    
    extra = (
        "Plain seamless studio setup. "
        "Single hero product shot. "
        "No packaging, no posters, no signage, no printed materials."
        "Absolutely no visible text of any kind. "
        "No logos, no labels, no packaging, no brand names, no symbols, "
        "no typography, no engraved markings, no embossed markings. "
        "All surfaces must be completely blank and smooth. "
    )

    if winner_guidance:
        extra += (
            "Use this guidance from the user's past best performers as subtle direction "
            "(do NOT mention metrics and do NOT copy verbatim): "
            f"{winner_guidance}. "
        )

    # ✅ NEW: shared builder w/ hard product anchor
    visual_prompt = build_visual_prompt(
        product_name=product_name,
        subject=subject,
        tone=tone,
        goal=goal,
        style_hint=style_hint,
        extra_instructions=extra,
    )

    async def _gen_copy():
        try:
            resp = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model="gpt-4-turbo",
                    messages=[
                        {"role": "system", "content": "You are an expert direct-response ad copywriter. Output ONLY valid JSON."},
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
            paths = await asyncio.to_thread(
                lambda: generate_ideogram(
                    prompt=visual_prompt,
                    aspect_ratio=aspect_ratio,
                    rendering_speed="DEFAULT",
                    num_images=1,
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

    # ✅ NEW: Save a Firestore "image job" record for the Library
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
        })
    except Exception:
        # Don't break generation if logging fails
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
        "imageJobId": image_job_id,  # ✅ NEW
        "meta": {"goal": goal, "stylePreset": style, "offer": offer, "productType": product_type},
        "usage": {
            "used": cap_result.get("used"),
            "cap": cap_result.get("cap"),
            "month": cap_result.get("month"),
            "remaining": max(0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)),
        },
    }


# ---------------- Optimize Ad (Pro/Business only, DOES NOT consume usage) ----------------
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

    creative_urls = payload.creative_image_urls or []
    creative_analysis = await analyze_uploaded_creatives(creative_urls) if creative_urls else ""

    # include extra context fields (even if model ignores, it’s useful)
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
You are an expert direct-response performance marketer.

Given the current ad and its metrics, diagnose what's likely happening and produce improved copy + an improved image prompt.

RULES:
- Output ONLY valid JSON. No markdown, no extra text.
- improved_headline <= 40 characters.
- improved_primary_text <= 150 characters.
- improved_cta must be one of: Shop Now, Learn More, Sign Up, Get Offer, Download, Contact Us, Book Now
- Improved image prompt must be brand-neutral and avoid ANY readable text, logos, labels, trademarks.

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

EXTRA CONTEXT JSON:
{json.dumps(extra)}

creative_image_urls: {creative_urls}

CREATIVE ANALYSIS (HIGH PRIORITY):
{creative_analysis or "No uploaded creatives."}

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

# ---------------- Generate New Creative from Optimizer (Pro/Business only, CONSUMES usage) ----------------
@app.post("/generate-from-optimizer")
async def generate_from_optimizer(payload: GenerateFromOptimizerRequest, authorization: str | None = Header(default=None)):
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

    # --- Pull optional fields safely (won't break if not in model yet) ---
    product_name = (getattr(payload, "product_name", None) or getattr(payload, "productName", None) or "").strip()[:80]
    description = (getattr(payload, "description", None) or "").strip()[:800]
    product_type = (getattr(payload, "productType", None) or "").strip()[:40] or None
    style = (getattr(payload, "stylePreset", None) or "Minimal").strip()[:30]
    tone = (getattr(payload, "tone", None) or "confident").strip()[:40]
    goal = (getattr(payload, "goal", None) or "Performance optimization").strip()[:60]

    style_hint = STYLE_HINTS.get(style, STYLE_HINTS["Minimal"])

    # If not provided yet, fallback is still better than nothing
    if not product_name:
        product_name = "the same product as the reference creative"

    subject = infer_visual_subject(product_name, description, product_type)

    regen_extra = (
        "This is a regeneration of an existing ad creative. "
        "Match the reference creative’s product identity and overall composition/camera angle. "
        "Do NOT recreate any text-bearing elements (no posters, no packaging, no signage, no boards). "
        "Only improve ad quality (lighting, clarity, composition, realism). "
        "Absolutely no visible text of any kind. "
        "No logos, no labels, no packaging, no brand names, no symbols, "
        "no typography, no engraved markings, no embossed markings. "
        "All surfaces must be completely blank and smooth. "
        f"Apply these improvements: {payload.improved_image_prompt}."
    )

    # ✅ NEW: shared builder w/ hard product anchor + regen instructions
    visual_prompt = build_visual_prompt(
        product_name=product_name,
        subject=subject,
        tone=tone,
        goal=goal,
        style_hint=style_hint,
        extra_instructions=regen_extra,
    )

    try:
        paths = await asyncio.to_thread(
            lambda: generate_ideogram(
                prompt=visual_prompt,
                aspect_ratio=aspect_ratio,
                rendering_speed="DEFAULT",
                num_images=1,
            )
        )
        if not paths:
            raise HTTPException(status_code=502, detail="Ideogram returned no images")

        image_path = paths[0]
        with open(image_path, "rb") as f:
            img_bytes = f.read()

        image_url = upload_png_to_firebase_storage(img_bytes, uid)

        try:
            os.remove(image_path)
        except Exception:
            pass

        # ✅ NEW: Save a Firestore "image job" record for the Library
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
            "imageJobId": image_job_id,  # ✅ NEW
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
        raise HTTPException(status_code=502, detail=f"Generation failed: {e}")


# ---------------- Creation of Admin Page Routes ----------------

@app.get("/admin/users")
def admin_list_users(
    authorization: str | None = Header(default=None),
    q: str = Query(default=""),                     # search (email/name)
    tier: str = Query(default="all"),               # filter by tier (Firestore)
    status: str = Query(default="all"),             # filter by stripe status (Firestore)
    limit: int = Query(default=50, ge=1, le=200),
    page_token: str = Query(default=""),            # pagination cursor from Firebase Auth
) -> dict[str, Any]:
    try:
        uid, _email, claims = require_user(authorization)
        if not is_admin(claims):
            raise HTTPException(status_code=403, detail="Admin only")

        db = get_db()

        q_norm = (q or "").strip().lower()
        tier_norm = (tier or "all").strip().lower()
        status_norm = (status or "all").strip().lower()

        # ✅ Some SDKs don't like empty string page_token
        pt = page_token or None

        # Firebase Auth list_users pagination
        page = admin_auth.list_users(page_token=pt, max_results=limit)

        results = []

        for u in page.users:
            # Auth fields
            auth_uid = u.uid
            auth_email = u.email or ""
            display_name = (u.display_name or "").strip()

            # Signup date from Auth (milliseconds since epoch)
            created_iso = None
            try:
                ms = u.user_metadata.creation_timestamp
                if ms:
                    created_iso = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
            except Exception:
                created_iso = None

            # Firestore profile (optional)
            prof = {}
            try:
                snap = db.collection("users").document(auth_uid).get()
                if snap.exists:
                    prof = snap.to_dict() or {}
            except Exception:
                prof = {}

            first = (prof.get("firstName") or "").strip()
            last = (prof.get("lastName") or "").strip()

            # Fallback: split displayName if first/last missing
            if (not first and not last) and display_name:
                parts = display_name.split()
                if len(parts) >= 2:
                    first = first or parts[0]
                    last = last or " ".join(parts[1:])
                else:
                    first = first or display_name

            # ✅ Prefer tier/status from your canonical helper (reads prof["stripe"].tier/status)
            tier_for_caps, stripe_status_from_helper = get_tier_and_status(prof)

            # For display/filtering: try stripe.tier first, then fallback
            stripe_obj = (prof.get("stripe") or {})
            requested_tier = (stripe_obj.get("requestedTier") or "").strip()
            customer_id = (stripe_obj.get("customerId") or "").strip()


            user_tier = (stripe_obj.get("tier") or stripe_obj.get("requestedTier") or prof.get("tier") or "-")
            user_tier = str(user_tier).strip() or "-"

            stripe_status = (stripe_obj.get("status") or stripe_status_from_helper or "inactive")
            stripe_status = str(stripe_status).strip().lower()

            # ✅ Usage + cap from your real system (usage/{uid} + tier caps)
            usage_info = peek_usage(db, auth_uid, tier_for_caps)
            used = int(usage_info.get("used") or 0)
            cap = int(usage_info.get("cap") or 0)
            remaining = int(usage_info.get("remaining") or max(0, cap - used))
            usage_pct = 0 if cap <= 0 else round((used / cap) * 100)

                        # ✅ Video usage (stored on users/{uid})
            VIDEO_CAPS = {"early_access": 3, "pro_monthly": 15, "business_monthly": 50}
            month_key = utc_month_key()

            video_cap = int(VIDEO_CAPS.get(tier_for_caps) or 0)

            video_used = int(prof.get("video_used") or 0)
            video_month_key = prof.get("video_month_key")

            if video_month_key != month_key:
                video_used = 0

            video_remaining = max(0, video_cap - video_used) if video_cap else 0
            video_usage_pct = 0 if video_cap <= 0 else round((video_used / video_cap) * 100)

            # Filters
            if tier_norm != "all" and user_tier.lower() != tier_norm:
                continue
            if status_norm != "all" and stripe_status.lower() != status_norm:
                continue

            # Search across merged fields
            if q_norm:
                hay = f"{first} {last} {auth_email} {display_name}".lower()
                if q_norm not in hay:
                    continue

            results.append({
                "uid": auth_uid,
                "firstName": first,
                "lastName": last,
                "email": auth_email,
                "createdAt": created_iso,          # Auth creation timestamp

                "tier": user_tier,
                "requestedTier": requested_tier,   # ✅ included for admin tier-request UI
                "stripeStatus": stripe_status,
                "customerId": customer_id,

                # ✅ fields for UI usage display + highlighting
                "used": used,
                "cap": cap,
                "remaining": remaining,
                "usagePct": usage_pct,

                # ✅ backwards compatibility
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
    

from fastapi import Header, HTTPException, Query
from google.cloud import firestore as gc_firestore

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
    month = utc_month_key()
    usage_ref = db.collection("usage").document(target_uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = usage_ref.get(transaction=transaction)
        data = snap.to_dict() or {}

        current_month = data.get("month")
        used = int(data.get("used") or 0)

        if current_month != month:
            used = 0

        # Grant credits = reduce used count
        new_used = max(0, used - credits)

        transaction.set(
            usage_ref,
            {"month": month, "used": new_used, "updatedAt": gc_firestore.SERVER_TIMESTAMP},
            merge=True,
        )
        return {"ok": True, "uid": target_uid, "month": month, "used": new_used, "granted": credits}

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
    month = utc_month_key()
    usage_ref = db.collection("usage").document(target_uid)

    usage_ref.set(
        {"month": month, "used": 0, "updatedAt": gc_firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    return {"ok": True, "uid": target_uid, "month": month, "used": 0}

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
    tier, _status = get_tier_and_status(user_doc)

    # Match your video caps
    VIDEO_CAPS = {
        "early_access": 3,
        "pro_monthly": 15,
        "business_monthly": 50,
    }

    # Month key uses the same helper as image usage
    month_key = utc_month_key()

    video_used = int(user_doc.get("video_used", 0) or 0)
    video_month_key = user_doc.get("video_month_key")

    # Reset for a new month
    if video_month_key != month_key:
        video_used = 0

    cap = VIDEO_CAPS.get(tier, 0)
    remaining = max(0, int(cap) - int(video_used)) if cap else 0

    return {
        "month": month_key,
        "used": video_used,
        "cap": cap,
        "remaining": remaining,
        "enabled": tier in VIDEO_CAPS,  # handy for UI
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
    month = utc_month_key()
    user_ref = db.collection("users").document(target_uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snap = user_ref.get(transaction=transaction)
        doc = snap.to_dict() or {}

        used = int(doc.get("video_used") or 0)
        month_key = doc.get("video_month_key")

        if month_key != month:
            used = 0

        # Grant credits = reduce used count
        new_used = max(0, used - credits)

        transaction.set(
            user_ref,
            {"video_used": new_used, "video_month_key": month, "updatedAt": gc_firestore.SERVER_TIMESTAMP},
            merge=True,
        )
        return {"ok": True, "uid": target_uid, "month": month, "video_used": new_used, "granted": credits}

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
    month = utc_month_key()
    user_ref = db.collection("users").document(target_uid)

    user_ref.set(
        {"video_used": 0, "video_month_key": month, "updatedAt": gc_firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    return {"ok": True, "uid": target_uid, "month": month, "video_used": 0}

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
    if spend is not None and spend < 0:
        raise HTTPException(status_code=400, detail="spend must be >= 0.")
    if revenue is not None and revenue < 0:
        raise HTTPException(status_code=400, detail="revenue must be >= 0.")

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

    all_roas = [_safe_num((x.get("performance") or {}).get("roas")) for x in items]
    all_ctr = [_safe_num((x.get("performance") or {}).get("ctr")) for x in items]
    all_cpa = [_safe_num((x.get("performance") or {}).get("cpa")) for x in items]

    summary = {
        "count_with_performance": len(items),
        "avg_roas": _avg([x for x in all_roas if x is not None]),
        "avg_ctr": _avg([x for x in all_ctr if x is not None]),
        "avg_cpa": _avg([x for x in all_cpa if x is not None]),
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


# ---------------- Stripe routes ----------------
app.include_router(stripe_router)


















