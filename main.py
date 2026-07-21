# main.py
from urllib.parse import quote, urlparse
import os
import re
import json
import uuid
import asyncio
import requests
import time
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    HTTPException,
    Header,
    Depends,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import base64

# Stripe router (separate file)
from stripe_server import stripe_router, price_id_to_tier, extract_subscription_period
import stripe

# Firebase auth + Firestore
from auth_helpers import get_db, get_bearer_token, verify_firebase_token
from usage_caps import (
    check_and_increment_usage,
    check_and_increment_resource,
    rollback_resource,
    peek_usage,
    peek_resource,
    get_tier_and_status,
    get_usage_period,
)

# admin dependency
from admin_guard import admin_required

# Amdin Page Imports
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
from entitlements import require_pro_or_business, build_entitlements_payload
from plan_config import get_plan_config
from optimizer_schemas import OptimizeAdRequest, OptimizeAdResponse

# Runway
from video_jobs import router as video_router
from storage_utils import (
    upload_bytes_to_firebase_storage,
    upload_bytes_to_firebase_storage_with_metadata,
    delete_firebase_storage_object,
)
from storage_tracking import (
    ensure_storage_available,
    get_storage_summary,
    register_storage_asset,
    release_storage_asset,
)
from brand_kits import router as brand_kits_router, resolve_brand_kit

from notification_utils import (
    create_notification,
    create_usage_notifications,
)

# Library Performace Schemas
from typing import Optional
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple
from fastapi import Query
from collections import Counter

# Google SMTP
import smtplib
from email.message import EmailMessage

# Campaign Manager
from campaign_backend.routes import router as campaign_router
from line_items.routes import router as line_items_router
from campaign_assets.routes import router as campaign_assets_router

load_dotenv(override=True)

app = FastAPI()
app.include_router(campaign_router)
app.include_router(line_items_router)
app.include_router(campaign_assets_router)

app.include_router(video_router)
app.include_router(brand_kits_router)


class AdminRequestTierBody(BaseModel):
    requestedTier: str  # e.g. "starter_monthly", "pro_monthly", etc.


class AdminGrantCreditsBody(BaseModel):
    credits: int


class AdminClearTierRequestBody(BaseModel):
    confirm: bool = True


class CreativeStudioRewriteBody(BaseModel):
    text: str
    tone: str = "shorter"
    role: str = "text"
    brandKitId: Optional[str] = None


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
OPENAI_TEXT_MODEL = (os.getenv("OPENAI_TEXT_MODEL") or "gpt-5.5").strip()
OPENAI_IMAGE_MODEL = (os.getenv("OPENAI_IMAGE_MODEL") or "gpt-image-2").strip()

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
        image_urls.extend(
            [u for u in input_image_urls if isinstance(u, str) and u.startswith("http")]
        )

    image_urls = image_urls[:4]  # logo + max 3 references

    def download_image_tuple(url: str, idx: int):
        r = requests.get(url, timeout=30)
        r.raise_for_status()

        content_type = (
            (r.headers.get("content-type") or "image/png").split(";")[0].lower()
        )

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
            download_image_tuple(url, idx) for idx, url in enumerate(image_urls)
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
    imageSize: str
    useBrandKit: bool = True
    brandKitId: Optional[str] = None

    offer: Optional[str] = None

    # Optional exact creative copy controls
    headline: Optional[str] = None
    primary_text: Optional[str] = None
    cta: Optional[str] = None

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
    brandKitId: Optional[str] = None
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

    spend: Optional[float] = None  # $
    revenue: Optional[float] = None  # $  (used to compute ROAS)

    thumb_stop_rate: Optional[float] = None
    view_3s: Optional[float] = None
    view_6s: Optional[float] = None
    hold_rate: Optional[float] = None
    conversion_rate: Optional[float] = None

    marked_successful: Optional[bool] = None
    notes: Optional[str] = None


# ---------------- Generation progress jobs ----------------
class ProgressStartResponse(BaseModel):
    jobId: str
    status: str = "queued"


IMAGE_PROGRESS = {
    "queued": (5, "Preparing your creative request."),
    "validated": (12, "Request validated."),
    "loading_brand_kit": (20, "Applying your Active Brand."),
    "building_prompts": (32, "Building creative strategy and prompts."),
    "generating_creative": (48, "Generating ad copy and image."),
    "uploading_creative": (82, "Uploading your creative."),
    "saving_library": (94, "Saving to your Library."),
    "succeeded": (100, "Creative complete."),
    "failed": (100, "Creative generation stopped."),
}

OPTIMIZER_PROGRESS = {
    "queued": (5, "Preparing campaign analysis."),
    "validated": (12, "Campaign details validated."),
    "loading_brand_kit": (20, "Applying your Active Brand."),
    "analyzing_creative": (34, "Analyzing uploaded creative."),
    "evaluating_performance": (52, "Evaluating performance and creative."),
    "building_recommendations": (78, "Building recommendations and improved copy."),
    "saving_results": (94, "Preparing optimization results."),
    "succeeded": (100, "Optimization complete."),
    "failed": (100, "Optimization stopped."),
}

OPTIMIZER_GENERATION_PROGRESS = {
    "queued": (5, "Preparing optimized creative."),
    "validated": (12, "Optimization results validated."),
    "loading_brand_kit": (22, "Applying your Active Brand."),
    "building_prompt": (34, "Building improved creative direction."),
    "generating_creative": (54, "Generating optimized image."),
    "uploading_creative": (84, "Uploading your creative."),
    "saving_library": (94, "Saving to your Library."),
    "succeeded": (100, "Optimized creative complete."),
    "failed": (100, "Creative generation stopped."),
}


def _progress_collection(kind: str) -> str:
    return "image_generation_jobs" if kind == "image" else "optimizer_jobs"


def set_generation_progress(
    db,
    kind: str,
    job_id: Optional[str],
    stage: str,
    *,
    message: Optional[str] = None,
    percent: Optional[int] = None,
    extra: Optional[Dict[str, Any]] = None,
):
    if not job_id:
        return
    table = (
        IMAGE_PROGRESS
        if kind == "image"
        else (
            OPTIMIZER_GENERATION_PROGRESS
            if kind == "optimizer_generation"
            else OPTIMIZER_PROGRESS
        )
    )
    default_percent, default_message = table.get(
        stage, (0, stage.replace("_", " ").title())
    )
    payload = {
        "progressStage": stage,
        "progressMessage": message or default_message,
        "progressPercent": int(default_percent if percent is None else percent),
        "updatedAt": int(time.time()),
    }
    if extra:
        payload.update(extra)
    db.collection(_progress_collection(kind)).document(job_id).set(payload, merge=True)


async def _run_image_generation_job(
    job_id: str, payload: AdRequest, authorization: str
):
    db = get_db()
    try:
        result = await generate_ad(payload, authorization, progress_job_id=job_id)
        set_generation_progress(
            db,
            "image",
            job_id,
            "succeeded",
            extra={"status": "succeeded", "result": result, "error": None},
        )
    except HTTPException as exc:
        error_message = (
            str(exc.detail)
            if isinstance(exc.detail, str)
            else "Creative generation failed."
        )

        set_generation_progress(
            db,
            "image",
            job_id,
            "failed",
            message=error_message,
            extra={"status": "failed", "error": exc.detail},
        )

        create_notification(
            db,
            uid=(
                db.collection("image_generation_jobs").document(job_id).get().to_dict()
                or {}
            ).get("uid"),
            event_key=f"image_failed_{job_id}",
            title="Image generation failed",
            body="Your creative could not be completed. Review the request and try again.",
            notification_type="generation_failed",
            link="/adgenerator",
            metadata={"jobId": job_id},
        )
    except Exception as exc:
        set_generation_progress(
            db,
            "image",
            job_id,
            "failed",
            message="Creative generation failed.",
            extra={"status": "failed", "error": str(exc)},
        )

        job_data = (
            db.collection("image_generation_jobs").document(job_id).get().to_dict()
            or {}
        )

        create_notification(
            db,
            uid=job_data.get("uid"),
            event_key=f"image_failed_{job_id}",
            title="Image generation failed",
            body="Your creative could not be completed. Review the request and try again.",
            notification_type="generation_failed",
            link="/adgenerator",
            metadata={"jobId": job_id},
        )


async def _run_optimizer_job(
    job_id: str,
    payload: OptimizeAdRequest,
    authorization: str,
):
    db = get_db()

    try:
        result = await optimize_ad(
            payload,
            authorization,
            progress_job_id=job_id,
        )

        result_data = (
            result.model_dump() if hasattr(result, "model_dump") else dict(result)
        )

        set_generation_progress(
            db,
            "optimizer",
            job_id,
            "succeeded",
            extra={
                "status": "succeeded",
                "result": result_data,
                "error": None,
            },
        )

    except HTTPException as exc:
        set_generation_progress(
            db,
            "optimizer",
            job_id,
            "failed",
            message=(
                str(exc.detail)
                if isinstance(exc.detail, str)
                else "Optimization failed."
            ),
            extra={
                "status": "failed",
                "error": exc.detail,
            },
        )

        job_data = (
            db.collection("optimizer_jobs").document(job_id).get().to_dict() or {}
        )

        create_notification(
            db,
            uid=job_data.get("uid"),
            event_key=f"optimizer_failed_{job_id}",
            title="Optimization could not be completed",
            body=(
                "Your campaign analysis stopped before completion. "
                "Review the inputs and try again."
            ),
            notification_type="generation_failed",
            link="/optimizer",
            metadata={"jobId": job_id},
        )

    except Exception as exc:
        set_generation_progress(
            db,
            "optimizer",
            job_id,
            "failed",
            message="Optimization failed.",
            extra={
                "status": "failed",
                "error": str(exc),
            },
        )

        job_data = (
            db.collection("optimizer_jobs").document(job_id).get().to_dict() or {}
        )

        create_notification(
            db,
            uid=job_data.get("uid"),
            event_key=f"optimizer_failed_{job_id}",
            title="Optimization could not be completed",
            body=(
                "Your campaign analysis stopped before completion. "
                "Review the inputs and try again."
            ),
            notification_type="generation_failed",
            link="/optimizer",
            metadata={
                "jobId": job_id,
                "error": str(exc)[:300],
            },
        )


async def _run_optimizer_generation_job(
    job_id: str,
    payload: GenerateFromOptimizerRequest,
    authorization: str,
):
    db = get_db()

    try:
        result = await generate_from_optimizer(
            payload,
            authorization,
            progress_job_id=job_id,
        )

        set_generation_progress(
            db,
            "optimizer_generation",
            job_id,
            "succeeded",
            extra={
                "status": "succeeded",
                "result": result,
                "error": None,
            },
        )

    except HTTPException as exc:
        set_generation_progress(
            db,
            "optimizer_generation",
            job_id,
            "failed",
            message=(
                str(exc.detail)
                if isinstance(exc.detail, str)
                else "Creative generation failed."
            ),
            extra={
                "status": "failed",
                "error": exc.detail,
            },
        )

        job_data = (
            db.collection("optimizer_jobs").document(job_id).get().to_dict() or {}
        )

        create_notification(
            db,
            uid=job_data.get("uid"),
            event_key=f"optimizer_creative_failed_{job_id}",
            title="Optimized creative failed",
            body=(
                "The optimized image could not be completed. "
                "Your analysis results are still available."
            ),
            notification_type="generation_failed",
            link="/optimizer",
            metadata={"jobId": job_id},
        )

    except Exception as exc:
        set_generation_progress(
            db,
            "optimizer_generation",
            job_id,
            "failed",
            message="Creative generation failed.",
            extra={
                "status": "failed",
                "error": str(exc),
            },
        )

        job_data = (
            db.collection("optimizer_jobs").document(job_id).get().to_dict() or {}
        )

        create_notification(
            db,
            uid=job_data.get("uid"),
            event_key=f"optimizer_creative_failed_{job_id}",
            title="Optimized creative failed",
            body=(
                "The optimized image could not be completed. "
                "Your analysis results are still available."
            ),
            notification_type="generation_failed",
            link="/optimizer",
            metadata={
                "jobId": job_id,
                "error": str(exc)[:300],
            },
        )


def _read_progress_job(db, collection: str, job_id: str, uid: str, admin: bool):
    snap = db.collection(collection).document(job_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Progress job not found.")
    data = snap.to_dict() or {}
    if not admin and data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")
    return {"jobId": job_id, **data}


# ---------------- Helpers ----------------
def upload_png_to_firebase_storage(img_bytes: bytes, uid: str) -> dict:
    """Upload a generated PNG and return durable storage metadata."""
    return upload_bytes_to_firebase_storage_with_metadata(
        img_bytes,
        uid,
        content_type="image/png",
        folder="generated_ads",
        filename_hint="creative.png",
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
            {
                "role": "system",
                "content": "You are a direct-response creative strategist.",
            },
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
        raise HTTPException(
            status_code=401, detail="Missing Authorization Bearer token."
        )
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
        raise HTTPException(
            status_code=402,
            detail="Subscription inactive. Please subscribe to continue.",
        )

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


def infer_visual_subject(
    product_name: str, description: str, product_type: str | None = None
) -> str:
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
    for m in [
        "leather",
        "faux leather",
        "mesh",
        "fabric",
        "wood",
        "metal",
        "plastic",
        "glass",
        "ceramic",
        "steel",
        "aluminum",
    ]:
        if m in text:
            materials.append(m)

    colors = []
    for c in [
        "black",
        "white",
        "gray",
        "grey",
        "beige",
        "tan",
        "brown",
        "silver",
        "gold",
        "blue",
        "green",
        "red",
    ]:
        if re.search(rf"\b{c}\b", text):
            colors.append(c)

    features = []
    for f in [
        "adjustable",
        "ergonomic",
        "wireless",
        "portable",
        "waterproof",
        "rechargeable",
        "lightweight",
        "compact",
        "premium",
        "minimal",
        "modern",
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
        status = (
            "active" if sub_status in {"active", "trialing", "past_due"} else "pending"
        )

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
    title = (
        f"{kind.capitalize()} Ad"
        if not product_name
        else f"{kind.capitalize()}: {product_name}"
    )

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
            "marked_successful": (
                p.get("marked_successful")
                if isinstance(p.get("marked_successful"), bool)
                else None
            ),
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

        out.append(
            {
                "value": g,
                "count": len(arr),
                "avg_ctr": _avg([x for x in ctrs if x is not None]),
                "avg_cpa": _avg([x for x in cpas if x is not None]),
                "avg_cpm": _avg([x for x in cpms if x is not None]),
                "total_spend": round(sum([x for x in spends if x is not None]), 4),
                "weighted_roas": roas,
            }
        )

    # sort by weighted_roas desc, fallback to avg_ctr
    out.sort(
        key=lambda r: (
            r["weighted_roas"] if r["weighted_roas"] is not None else -1e18,
            r["avg_ctr"] if r["avg_ctr"] is not None else -1e18,
        ),
        reverse=True,
    )
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
    for x in winners_apply or []:
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

    return f"{base_text}\nWinners-based constraints (weight {w}): " + " ".join(
        constraints
    )


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
        raise HTTPException(
            status_code=400, detail="No Stripe customerId found for this user."
        )

    subs = stripe.Subscription.list(
        customer=customer_id,
        status="all",
        limit=1,
        expand=["data.items"],
    )

    if not subs.data:
        raise HTTPException(
            status_code=404, detail="No Stripe subscription found for this customer."
        )

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


@app.get("/me/entitlements")
def me_entitlements(authorization: str | None = Header(default=None)):
    uid, email, claims = require_user(authorization)
    db = get_db()

    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get().to_dict() or {}
    user_doc = ensure_stripe_period_for_user(db, uid, user_doc)
    tier, status = get_tier_and_status(user_doc)

    payload = build_entitlements_payload(tier)
    payload.update(
        {
            "uid": uid,
            "email": email,
            "status": status,
            "isAdmin": is_admin(claims),
            "usage": {
                "images": peek_resource(db, uid, tier, "images", user_doc),
                "videoCredits": peek_resource(db, uid, tier, "video_credits", user_doc),
                "optimizerRuns": peek_resource(
                    db, uid, tier, "optimizer_runs", user_doc
                ),
                "storage": get_storage_summary(db, uid, tier),
            },
            "period": get_usage_period(user_doc),
        }
    )
    return payload


@app.get("/storage/usage")
def storage_usage(authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()
    user_doc = db.collection("users").document(uid).get().to_dict() or {}
    tier, _status = get_tier_and_status(user_doc)
    return get_storage_summary(db, uid, tier)


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
        raise HTTPException(status_code=500, detail="SMTP configuration is incomplete.")

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
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


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
            raise HTTPException(
                status_code=402,
                detail="Subscription inactive. Please subscribe to continue.",
            )
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
            raise HTTPException(
                status_code=400, detail=f"Unsupported file type: {ct or 'unknown'}"
            )

        data = await f.read()
        if not data:
            continue
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(
                status_code=413, detail="File too large. Max 8MB per image."
            )

        db = get_db()
        user_doc = db.collection("users").document(uid).get().to_dict() or {}
        tier, _status = get_tier_and_status(user_doc)
        if not admin:
            ensure_storage_available(db, uid, tier, len(data))
        stored = upload_bytes_to_firebase_storage_with_metadata(
            data,
            uid,
            content_type=ct,
            folder="uploaded_creatives",
            filename_hint=f.filename or None,
        )
        register_storage_asset(
            db, uid, size_bytes=stored["fileSizeBytes"], asset_type="image"
        )
        urls.append(stored["url"])

    if not urls:
        raise HTTPException(status_code=400, detail="No valid files uploaded.")

    return {"urls": urls}


@app.post("/creative-studio/upload-image")
async def upload_creative_studio_image(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    """Persist a user-supplied Creative Studio source image as a Library asset."""
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    user_doc = db.collection("users").document(uid).get().to_dict() or {}
    tier, _status = get_tier_and_status(user_doc)

    # Creative Studio access is controlled by the app's existing feature gating.
    # This endpoint only requires authentication and enforces the user's storage limit.

    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    content_type = (file.content_type or "").lower().strip()
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use PNG, JPG, JPEG, or WEBP.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail="Image too large. Maximum file size is 8MB."
        )

    if not admin:
        ensure_storage_available(db, uid, tier, len(data))

    stored = None
    registered = False
    try:
        stored = upload_bytes_to_firebase_storage_with_metadata(
            data,
            uid,
            content_type=content_type,
            folder="creative_studio_uploads",
            filename_hint=file.filename or "creative-studio-upload",
        )

        register_storage_asset(
            db,
            uid,
            size_bytes=stored["fileSizeBytes"],
            asset_type="image",
        )
        registered = True

        job_id = uuid.uuid4().hex
        filename = (file.filename or "Uploaded creative").strip()
        product_name = re.sub(r"\.[^.]+$", "", filename).strip() or "Uploaded creative"

        item = {
            "uid": uid,
            "createdAt": int(time.time()),
            "status": "succeeded",
            "source": "creative_studio_upload",
            "sourceType": "user_upload",
            "productName": product_name[:120],
            "originalFilename": filename[:255],
            "imageUrl": stored["url"],
            "storagePath": stored.get("storagePath"),
            "fileSizeBytes": stored.get("fileSizeBytes"),
            "contentType": stored.get("contentType"),
            "storageState": "active",
            "copy": {"headline": "", "primary_text": "", "cta": ""},
            "error": None,
        }
        db.collection("image_jobs").document(job_id).set(item)

        return {
            "ok": True,
            "item": {"id": job_id, **item},
            "storage": get_storage_summary(db, uid, tier),
        }
    except HTTPException:
        raise
    except Exception as exc:
        if stored and stored.get("storagePath"):
            try:
                delete_firebase_storage_object(stored["storagePath"])
            except Exception:
                pass
        if registered and stored:
            try:
                release_storage_asset(
                    db,
                    uid,
                    size_bytes=int(stored.get("fileSizeBytes") or 0),
                    asset_type="image",
                )
            except Exception:
                pass
        print("CREATIVE STUDIO UPLOAD ERROR:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="The image could not be added to Creative Studio. Please try again.",
        )


@app.get("/creative-studio/image/{job_id}")
async def get_creative_studio_image(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    """Stream a user's Library image through the API so canvas rendering is not blocked by CORS."""
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    snap = db.collection("image_jobs").document(job_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Image not found.")

    item = snap.to_dict() or {}
    if not admin and item.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    image_url = item.get("imageUrl")
    if not image_url:
        raise HTTPException(
            status_code=404, detail="This Library item has no image URL."
        )

    try:
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not retrieve image: {exc}")

    content_type = (
        response.headers.get("content-type") or item.get("contentType") or "image/png"
    )
    return StreamingResponse(io.BytesIO(response.content), media_type=content_type)


@app.get("/creative-studio/proxy-image")
async def proxy_creative_studio_image(
    url: str = Query(...),
    authorization: str | None = Header(default=None),
):
    """Proxy trusted Firebase/Google Storage images used as Studio logo and image layers."""
    require_user(authorization)
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    allowed_hosts = {
        "firebasestorage.googleapis.com",
        "storage.googleapis.com",
    }
    if parsed.scheme not in {"https", "http"} or host not in allowed_hosts:
        raise HTTPException(
            status_code=400, detail="Only trusted storage image URLs can be loaded."
        )

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not retrieve image: {exc}")

    content_type = response.headers.get("content-type") or "image/png"
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=400, detail="The requested URL is not an image."
        )
    return StreamingResponse(io.BytesIO(response.content), media_type=content_type)


@app.post("/creative-studio/rewrite")
async def rewrite_creative_studio_text(
    payload: CreativeStudioRewriteBody,
    authorization: str | None = Header(default=None),
):
    """Rewrite only the selected editable Studio layer. Existing generator prompts are untouched."""
    uid, _email, _claims = require_user(authorization)
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(
            status_code=400, detail="Select a text layer with copy before rewriting."
        )
    if len(text) > 800:
        raise HTTPException(
            status_code=400, detail="Selected text is too long to rewrite."
        )

    tone_map = {
        "shorter": "Make it shorter and clearer while preserving the exact meaning.",
        "premium": "Make it feel more premium, polished, and credible.",
        "urgent": "Add tasteful urgency without fake scarcity or unsupported claims.",
        "luxury": "Use refined luxury-brand language that remains concise.",
        "gen_z": "Use current, natural Gen Z language without forced slang.",
        "professional": "Make it professional, direct, and trustworthy.",
    }
    instruction = tone_map.get(payload.tone, tone_map["shorter"])

    brand_context = ""
    if payload.brandKitId:
        try:
            db = get_db()
            user_doc = db.collection("users").document(uid).get().to_dict() or {}
            kit = resolve_brand_kit(db, uid, payload.brandKitId, user_doc) or {}
            brand_context = "\nBrand voice/context: " + json.dumps(
                {
                    "brandName": kit.get("brandName") or kit.get("name"),
                    "voice": kit.get("voice"),
                    "brandPersonality": kit.get("brandPersonality"),
                    "doList": kit.get("doList"),
                    "dontList": kit.get("dontList"),
                    "complianceRules": kit.get("complianceRules"),
                },
                ensure_ascii=False,
            )
        except Exception:
            brand_context = ""

    system_prompt = (
        "You rewrite one editable advertising design layer. Return only the revised text, with no quotes, labels, or commentary. "
        "Do not invent prices, guarantees, statistics, testimonials, or product claims. Preserve the user's core meaning and factual details."
    )
    user_prompt = f"Layer role: {payload.role}\nInstruction: {instruction}{brand_context}\nOriginal text:\n{text}"

    try:
        response = await asyncio.to_thread(
            lambda: client.chat.completions.create(
                model=OPENAI_TEXT_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.6,
                max_tokens=220,
            )
        )
        rewritten = (response.choices[0].message.content or "").strip().strip('"')
        if not rewritten:
            raise ValueError("Empty rewrite")
        return {"text": rewritten[:800]}
    except Exception as exc:
        print("CREATIVE STUDIO REWRITE ERROR:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail="The selected copy could not be rewritten. Please try again.",
        )


@app.post("/creative-studio/save")
async def save_creative_studio_image(
    file: UploadFile = File(...),
    project: str = Form(...),
    title: str = Form("Creative Studio design"),
    source_image_job_id: str = Form(""),
    authorization: str | None = Header(default=None),
):
    """Save a flattened Studio export and its editable project as a new Library image."""
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()
    user_doc = db.collection("users").document(uid).get().to_dict() or {}
    tier, _status = get_tier_and_status(user_doc)

    content_type = (file.content_type or "image/png").lower().strip()
    if content_type not in {"image/png", "image/jpeg", "image/jpg", "image/webp"}:
        raise HTTPException(
            status_code=400, detail="Creative Studio can save PNG, JPG, or WEBP images."
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The rendered image is empty.")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="The rendered image is too large.")

    try:
        project_data = json.loads(project)
    except Exception:
        raise HTTPException(
            status_code=400, detail="The editable Studio project is invalid."
        )
    if not isinstance(project_data, dict) or not isinstance(
        project_data.get("layers", []), list
    ):
        raise HTTPException(
            status_code=400, detail="The editable Studio project is invalid."
        )
    if len(project_data.get("layers", [])) > 150:
        raise HTTPException(
            status_code=400, detail="This project contains too many layers."
        )

    if not admin:
        ensure_storage_available(db, uid, tier, len(data))

    stored = None
    registered = False
    try:
        stored = upload_bytes_to_firebase_storage_with_metadata(
            data,
            uid,
            content_type=content_type,
            folder="creative_studio_exports",
            filename_hint=file.filename or "creative-studio-export",
        )
        register_storage_asset(
            db, uid, size_bytes=stored["fileSizeBytes"], asset_type="image"
        )
        registered = True

        job_id = uuid.uuid4().hex
        clean_title = (title or "Creative Studio design").strip()[:120]
        item = {
            "uid": uid,
            "createdAt": int(time.time()),
            "status": "succeeded",
            "source": "creative_studio",
            "sourceType": "creative_studio",
            "sourceImageJobId": source_image_job_id or None,
            "productName": clean_title,
            "imageUrl": stored["url"],
            "storagePath": stored.get("storagePath"),
            "fileSizeBytes": stored.get("fileSizeBytes"),
            "contentType": stored.get("contentType"),
            "storageState": "active",
            "creativeProject": project_data,
            "copy": {"headline": "", "primary_text": "", "cta": ""},
            "error": None,
        }
        db.collection("image_jobs").document(job_id).set(item)
        return {
            "ok": True,
            "item": {"id": job_id, **item},
            "storage": get_storage_summary(db, uid, tier),
        }
    except HTTPException:
        raise
    except Exception as exc:
        if stored and stored.get("storagePath"):
            try:
                delete_firebase_storage_object(stored["storagePath"])
            except Exception:
                pass
        if registered and stored:
            try:
                release_storage_asset(
                    db,
                    uid,
                    size_bytes=int(stored.get("fileSizeBytes") or 0),
                    asset_type="image",
                )
            except Exception:
                pass
        print("CREATIVE STUDIO SAVE ERROR:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="The finished creative could not be saved. Please try again.",
        )


@app.post("/video/upload-image", response_model=UploadCreativesResponse)
async def upload_video_image(
    files: List[UploadFile] = File(...),
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()

    user_doc = db.collection("users").document(uid).get().to_dict() or {}

    tier, status = get_tier_and_status(user_doc)

    # Trial, Starter, Pro, and Business may upload images for Video Ads.
    # Admin bypasses plan checks.
    if not admin:
        allowed_statuses = {"active", "trialing"}

        if status not in allowed_statuses:
            raise HTTPException(
                status_code=402,
                detail="Subscription inactive. Please subscribe to continue.",
            )

        allowed_video_tiers = {
            "trial_monthly",
            "starter_monthly",
            "pro_monthly",
            "business_monthly",
        }

        if tier not in allowed_video_tiers:
            raise HTTPException(
                status_code=403,
                detail="Video generation is not available on your plan.",
            )

    if not files:
        raise HTTPException(
            status_code=400,
            detail="No files uploaded.",
        )

    if len(files) > 1:
        raise HTTPException(
            status_code=400,
            detail="Upload one image for image-to-video.",
        )

    allowed_types = {
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
    }

    uploaded_file = files[0]

    content_type = (uploaded_file.content_type or "").lower().strip()

    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=("Unsupported file type. " "Use PNG, JPG, JPEG, or WEBP."),
        )

    data = await uploaded_file.read()

    if not data:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty.",
        )

    max_file_size = 8 * 1024 * 1024

    if len(data) > max_file_size:
        raise HTTPException(
            status_code=413,
            detail="Image too large. Maximum file size is 8MB.",
        )

    # Match the storage_tracking function signatures already used
    # elsewhere in your current main.py.
    if not admin:
        ensure_storage_available(
            db,
            uid,
            tier,
            len(data),
        )

    try:
        stored = upload_bytes_to_firebase_storage_with_metadata(
            data,
            uid,
            content_type=content_type,
            folder="video_source_images",
            filename_hint=(uploaded_file.filename or "video-source-image"),
        )

        register_storage_asset(
            db,
            uid,
            size_bytes=stored["fileSizeBytes"],
            asset_type="image",
        )

    except HTTPException:
        raise

    except Exception as exc:
        print(
            "VIDEO SOURCE IMAGE UPLOAD ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="The image could not be uploaded. Please try again.",
        )

    image_url = stored.get("url")

    if not image_url:
        raise HTTPException(
            status_code=500,
            detail="Image upload completed, but no image URL was returned.",
        )

    return {
        "urls": [image_url],
    }


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

    db = get_db()
    user_doc = db.collection("users").document(uid).get().to_dict() or {}
    tier, _status = get_tier_and_status(user_doc)
    ensure_storage_available(db, uid, tier, len(data))
    stored = upload_bytes_to_firebase_storage_with_metadata(
        data,
        uid,
        content_type=ct,
        folder="brand_logos",
        filename_hint=file.filename or "logo",
    )
    register_storage_asset(
        db, uid, size_bytes=stored["fileSizeBytes"], asset_type="other"
    )
    logo_url = stored["url"]

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
        raise HTTPException(
            status_code=400, detail="Maximum 3 reference images allowed."
        )

    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    urls: List[str] = []

    for f in files[:3]:
        ct = (f.content_type or "").lower().strip()

        if ct not in allowed_types:
            raise HTTPException(
                status_code=400, detail=f"Unsupported file type: {ct or 'unknown'}"
            )

        data = await f.read()

        if not data:
            continue

        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(
                status_code=413, detail="Reference image too large. Max 8MB per image."
            )

        db = get_db()
        user_doc = db.collection("users").document(uid).get().to_dict() or {}
        tier, _status = get_tier_and_status(user_doc)
        ensure_storage_available(db, uid, tier, len(data))
        stored = upload_bytes_to_firebase_storage_with_metadata(
            data,
            uid,
            content_type=ct,
            folder="reference_images",
            filename_hint=f.filename or "reference-image",
        )
        register_storage_asset(
            db, uid, size_bytes=stored["fileSizeBytes"], asset_type="image"
        )
        urls.append(stored["url"])

    if not urls:
        raise HTTPException(status_code=400, detail="No valid images uploaded.")

    return {"urls": urls}


# ---------------- Async generation job routes ----------------
@app.post("/image/start", response_model=ProgressStartResponse)
async def start_image_generation(
    payload: AdRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    db = get_db()
    job_id = uuid.uuid4().hex
    db.collection("image_generation_jobs").document(job_id).set(
        {
            "uid": uid,
            "createdAt": int(time.time()),
            "updatedAt": int(time.time()),
            "status": "queued",
            "jobType": "image",
            "progressStage": "queued",
            "progressMessage": IMAGE_PROGRESS["queued"][1],
            "progressPercent": IMAGE_PROGRESS["queued"][0],
            "result": None,
            "error": None,
        }
    )
    background_tasks.add_task(
        _run_image_generation_job, job_id, payload, authorization or ""
    )
    return ProgressStartResponse(jobId=job_id, status="queued")


@app.get("/image/status/{job_id}")
async def image_generation_status(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return _read_progress_job(
        get_db(), "image_generation_jobs", job_id, uid, is_admin(claims)
    )


@app.post("/optimizer/start", response_model=ProgressStartResponse)
async def start_optimizer_analysis(
    payload: OptimizeAdRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    db = get_db()
    job_id = uuid.uuid4().hex
    db.collection("optimizer_jobs").document(job_id).set(
        {
            "uid": uid,
            "createdAt": int(time.time()),
            "updatedAt": int(time.time()),
            "status": "queued",
            "jobType": "optimizer",
            "progressStage": "queued",
            "progressMessage": OPTIMIZER_PROGRESS["queued"][1],
            "progressPercent": OPTIMIZER_PROGRESS["queued"][0],
            "result": None,
            "error": None,
        }
    )
    background_tasks.add_task(_run_optimizer_job, job_id, payload, authorization or "")
    return ProgressStartResponse(jobId=job_id, status="queued")


@app.get("/optimizer/status/{job_id}")
async def optimizer_status(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return _read_progress_job(get_db(), "optimizer_jobs", job_id, uid, is_admin(claims))


@app.post("/optimizer/generate/start", response_model=ProgressStartResponse)
async def start_optimizer_generation(
    payload: GenerateFromOptimizerRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    db = get_db()
    job_id = uuid.uuid4().hex
    db.collection("optimizer_jobs").document(job_id).set(
        {
            "uid": uid,
            "createdAt": int(time.time()),
            "updatedAt": int(time.time()),
            "status": "queued",
            "jobType": "optimizer_generation",
            "progressStage": "queued",
            "progressMessage": OPTIMIZER_GENERATION_PROGRESS["queued"][1],
            "progressPercent": OPTIMIZER_GENERATION_PROGRESS["queued"][0],
            "result": None,
            "error": None,
        }
    )
    background_tasks.add_task(
        _run_optimizer_generation_job, job_id, payload, authorization or ""
    )
    return ProgressStartResponse(jobId=job_id, status="queued")


@app.get("/optimizer/generate/status/{job_id}")
async def optimizer_generation_status(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    return _read_progress_job(get_db(), "optimizer_jobs", job_id, uid, is_admin(claims))


# ---------------- Generate Ad ----------------
@app.post("/generate-ad")
async def generate_ad(
    payload: AdRequest,
    authorization: str | None = Header(default=None),
    progress_job_id: Optional[str] = None,
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    set_generation_progress(db, "image", progress_job_id, "validated")
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    set_generation_progress(db, "image", progress_job_id, "loading_brand_kit")
    brand_kit = (
        resolve_brand_kit(db, uid, payload.brandKitId, user_doc)
        if payload.useBrandKit
        else {}
    )
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
            raise HTTPException(
                status_code=402,
                detail="Subscription inactive. Please subscribe to continue.",
            )

        cap_result = check_and_increment_usage(db, uid, tier)

        if not cap_result["allowed"]:
            create_usage_notifications(
                db,
                uid,
                resource="images",
                used=int(cap_result.get("used") or 0),
                cap=int(cap_result.get("cap") or 0),
                period_key=(cap_result.get("periodKey") or cap_result.get("month")),
                link="/account",
            )

            raise HTTPException(
                status_code=429,
                detail={
                    "message": (
                        "You’ve reached your monthly ad generation "
                        "limit. Upgrade to continue."
                    ),
                    "used": cap_result["used"],
                    "cap": cap_result["cap"],
                    "month": cap_result["month"],
                    "upgradePath": "/account",
                },
            )

        create_usage_notifications(
            db,
            uid,
            resource="images",
            used=int(cap_result.get("used") or 0),
            cap=int(cap_result.get("cap") or 0),
            period_key=cap_result.get("periodKey") or cap_result.get("month"),
            link="/account",
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

    requested_headline = (payload.headline or "").strip()[:35]
    requested_primary_text = (payload.primary_text or "").strip()[:100]
    requested_cta = (payload.cta or "").strip()[:20]

    goal = (payload.goal or "Sales").strip()[:30]
    style = (payload.stylePreset or "Minimal").strip()[:30]
    product_type = (payload.productType or "").strip()[:40] or None
    campaign_objective = (payload.campaignObjective or "Auto").strip()[:80]
    reference_image_urls = (payload.referenceImageUrls or [])[:3]
    reference_image_mode = (payload.referenceImageMode or "product_reference").strip()[
        :40
    ]

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

    set_generation_progress(db, "image", progress_job_id, "building_prompts")

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
    
COPY PRESERVATION RULES:
- If supplied_headline is not N/A, use it exactly as the headline.
- If supplied_primary_text is not N/A, use it exactly as primary_text.
- If supplied_cta is not N/A, use it exactly as the CTA.
- Do not rewrite, shorten, paraphrase, or replace supplied copy.
- Generate only the copy fields that were left blank.

Return one JSON object with:
- headline: string (<= 35 chars)
- primary_text: string (<= 100 chars)
- cta: string (<= 20 chars)
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
supplied_headline: {requested_headline or "N/A"}
supplied_primary_text: {requested_primary_text or "N/A"}
supplied_cta: {requested_cta or "N/A"}

{brand_kit_context}

{winners_line}
"""

    winners_section = (
        f"""
        ==================================================
        PAST WINNING CREATIVE INSIGHTS
        ==================================================

        These insights summarize patterns identified from the advertiser's highest-performing creatives. Treat them as performance-informed creative direction that should influence your design decisions.

        These insights represent characteristics shared by the advertiser's highest-performing creatives.

        Use these insights to influence layout, composition, lighting, visual hierarchy, typography, color palette, and overall creative direction.

        Do not copy previous advertisements directly. Instead, naturally apply the successful design principles while creating a new, original advertisement.

        {winners_line}
        """
        if winners_line
        else ""
    )

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

Exact Creative Copy:

Headline:
{requested_headline or "Generate one concise headline"}

Body Text:
{requested_primary_text or "Generate one concise supporting line if useful"}

CTA:
{requested_cta or "Choose one concise action-oriented CTA"}

When exact creative copy is supplied:

• Reproduce it exactly.
• Do not paraphrase, rewrite, or replace it.
• Spell every supplied word exactly as written.
• Use the supplied headline, body text, and CTA only once each.

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

            if requested_headline:
                obj["headline"] = requested_headline
            else:
                obj["headline"] = str(
                    obj.get("headline") or product_name or "Ad Headline"
                ).strip()[:35]

            if requested_primary_text:
                obj["primary_text"] = requested_primary_text
            else:
                obj["primary_text"] = str(obj.get("primary_text") or "").strip()[:100]

            if requested_cta:
                obj["cta"] = requested_cta
            else:
                obj["cta"] = str(obj.get("cta") or "Learn More").strip()[:20]

            return obj
        except Exception as e:
            raise HTTPException(
                status_code=502, detail=f"OpenAI text generation failed: {e}"
            )

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
            if not admin:
                ensure_storage_available(db, uid, tier, len(img_bytes))
            set_generation_progress(db, "image", progress_job_id, "uploading_creative")
            stored = upload_png_to_firebase_storage(img_bytes, uid)
            register_storage_asset(
                db, uid, size_bytes=stored["fileSizeBytes"], asset_type="image"
            )
            return stored
        except Exception as e:
            raise HTTPException(
                status_code=502, detail=f"GPT Image generation failed: {e}"
            )

    set_generation_progress(db, "image", progress_job_id, "generating_creative")
    copy_obj, image_asset = await asyncio.gather(_gen_copy(), _gen_image_and_upload())
    image_url = image_asset["url"]

    set_generation_progress(db, "image", progress_job_id, "saving_library")
    image_job_id = uuid.uuid4().hex
    try:
        db.collection("image_jobs").document(image_job_id).set(
            {
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
                "brandKitId": getattr(payload, "brandKitId", None),
                "brandKitUsed": bool(brand_kit_context),
                "brandKitLogoUsed": bool(brand_kit.get("logoUrl")),
                "useMyWinners": bool(winner_profile),
                "visualPrompt": visual_prompt,
                "imageUrl": image_url,
                "storagePath": image_asset.get("storagePath"),
                "fileSizeBytes": image_asset.get("fileSizeBytes"),
                "contentType": image_asset.get("contentType"),
                "storageState": "active",
                "copy": copy_obj,
                "error": None,
                "usage": {
                    "used": cap_result.get("used"),
                    "cap": cap_result.get("cap"),
                    "month": cap_result.get("month"),
                    "remaining": max(
                        0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)
                    ),
                },
                "winnerProfile": winner_profile or None,
                "winnersApply": winners_apply or None,
                "winnersInfluence": (
                    winners_influence if winners_influence is not None else None
                ),
                "winnerGuidance": winner_guidance or None,
                "model": OPENAI_IMAGE_MODEL,
            }
        )
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
        "meta": {
            "goal": goal,
            "stylePreset": style,
            "offer": offer,
            "productType": product_type,
        },
        "usage": {
            "used": cap_result.get("used"),
            "cap": cap_result.get("cap"),
            "month": cap_result.get("month"),
            "remaining": max(
                0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)
            ),
        },
    }


# ---------------- Optimize Ad (Pro/Business only, DOES NOT consume usage) ----------------
# ---------------- Optimize Ad (Pro/Business only, DOES NOT consume usage) ----------------
@app.post("/optimize-ad", response_model=OptimizeAdResponse)
async def optimize_ad(
    payload: OptimizeAdRequest,
    authorization: str | None = Header(default=None),
    progress_job_id: Optional[str] = None,
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    set_generation_progress(db, "optimizer", progress_job_id, "validated")
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}

    set_generation_progress(db, "optimizer", progress_job_id, "loading_brand_kit")
    brand_kit = (
        resolve_brand_kit(db, uid, getattr(payload, "brandKitId", None), user_doc)
        if getattr(payload, "useBrandKit", True)
        else {}
    )
    brand_kit_context = build_brand_kit_prompt_context(brand_kit)

    tier, status = get_tier_and_status(user_doc)

    if not admin:
        allowed_statuses = {"active", "trialing"}
        if status not in allowed_statuses and tier not in (None, "trial_monthly"):
            raise HTTPException(
                status_code=402,
                detail="Subscription inactive. Please subscribe to continue.",
            )
        require_pro_or_business(tier)

    optimizer_usage_reservation = None

    if not admin:
        optimizer_usage_reservation = check_and_increment_resource(
            db,
            uid,
            tier,
            "optimizer_runs",
            1,
        )

        if not optimizer_usage_reservation.get("allowed"):
            create_usage_notifications(
                db,
                uid,
                resource="optimizer",
                used=int(optimizer_usage_reservation.get("used") or 0),
                cap=int(optimizer_usage_reservation.get("cap") or 0),
                period_key=(
                    optimizer_usage_reservation.get("periodKey")
                    or optimizer_usage_reservation.get("month")
                ),
                link="/optimizer",
            )

            raise HTTPException(
                status_code=429,
                detail={
                    "message": "You’ve reached your monthly Optimizer limit.",
                    "used": optimizer_usage_reservation.get("used"),
                    "cap": optimizer_usage_reservation.get("cap"),
                    "remaining": optimizer_usage_reservation.get("remaining"),
                    "periodEnd": optimizer_usage_reservation.get("periodEnd"),
                    "upgradePath": "/account",
                },
            )

        create_usage_notifications(
            db,
            uid,
            resource="optimizer",
            used=int(optimizer_usage_reservation.get("used") or 0),
            cap=int(optimizer_usage_reservation.get("cap") or 0),
            period_key=(
                optimizer_usage_reservation.get("periodKey")
                or optimizer_usage_reservation.get("month")
            ),
            link="/optimizer",
        )

    product_name = (payload.product_name or "").strip()[:80]
    description = (payload.description or "").strip()[:800]
    audience = (payload.audience or "").strip()[:120]
    tone = (payload.tone or "confident").strip()[:40]
    offer = (payload.offer or "").strip()[:80]
    goal = (payload.goal or "Sales").strip()[:30]
    platform = (payload.platform or "meta").strip()[:20]

    metrics = payload.metrics.dict() if payload.metrics else {}

    creative_urls = payload.creative_image_urls or []
    set_generation_progress(db, "optimizer", progress_job_id, "analyzing_creative")
    creative_analysis = (
        await analyze_uploaded_creatives(creative_urls) if creative_urls else ""
    )

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

    set_generation_progress(db, "optimizer", progress_job_id, "evaluating_performance")

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
        set_generation_progress(
            db, "optimizer", progress_job_id, "building_recommendations"
        )
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
            raise HTTPException(
                status_code=502, detail="Optimizer returned invalid JSON."
            )

        obj.setdefault(
            "summary",
            "Here are recommended improvements based on the metrics provided.",
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
        obj["improved_headline"] = str(
            obj.get("improved_headline") or product_name or "Better Results"
        ).strip()[:80]

        # Normalize primary text
        obj["improved_primary_text"] = str(
            obj.get("improved_primary_text")
            or "Discover a clearer, stronger offer designed to drive action."
        ).strip()[:250]

        # Normalize image prompt
        obj["improved_image_prompt"] = str(
            obj.get("improved_image_prompt")
            or "Create a premium, professional paid social advertisement with strong product focus, clean typography, clear CTA, balanced spacing, and modern commercial design."
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

        set_generation_progress(db, "optimizer", progress_job_id, "saving_results")
        return OptimizeAdResponse(**obj)

    except HTTPException:
        if not admin and optimizer_usage_reservation:
            rollback_resource(
                db,
                uid,
                "optimizer_runs",
                optimizer_usage_reservation.get("periodKey"),
                1,
            )
        raise
    except Exception as e:
        if not admin and optimizer_usage_reservation:
            rollback_resource(
                db,
                uid,
                "optimizer_runs",
                optimizer_usage_reservation.get("periodKey"),
                1,
            )
        raise HTTPException(status_code=502, detail=f"Optimization failed: {e}")


# ---------------- Generate New Creative from Optimizer (Pro/Business only, CONSUMES usage) ----------------
@app.post("/generate-from-optimizer")
async def generate_from_optimizer(
    payload: GenerateFromOptimizerRequest,
    authorization: str | None = Header(default=None),
    progress_job_id: Optional[str] = None,
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    db = get_db()
    set_generation_progress(db, "optimizer_generation", progress_job_id, "validated")
    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    set_generation_progress(
        db, "optimizer_generation", progress_job_id, "loading_brand_kit"
    )
    brand_kit = (
        resolve_brand_kit(db, uid, payload.brandKitId, user_doc)
        if payload.useBrandKit
        else {}
    )
    brand_kit_context = build_brand_kit_prompt_context(brand_kit)
    tier, status = get_tier_and_status(user_doc)

    if not admin:
        allowed_statuses = {"active", "trialing"}

        if status not in allowed_statuses and tier not in (None, "trial_monthly"):
            raise HTTPException(
                status_code=402,
                detail="Subscription inactive. Please subscribe to continue.",
            )

        require_pro_or_business(tier)

        cap_result = check_and_increment_usage(db, uid, tier)

        if not cap_result["allowed"]:
            create_usage_notifications(
                db,
                uid,
                resource="images",
                used=int(cap_result.get("used") or 0),
                cap=int(cap_result.get("cap") or 0),
                period_key=(cap_result.get("periodKey") or cap_result.get("month")),
                link="/account",
            )

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

        create_usage_notifications(
            db,
            uid,
            resource="images",
            used=int(cap_result.get("used") or 0),
            cap=int(cap_result.get("cap") or 0),
            period_key=(cap_result.get("periodKey") or cap_result.get("month")),
            link="/account",
        )

    else:
        cap_result = {
            "used": 0,
            "cap": 0,
            "month": None,
            "allowed": True,
        }

    aspect_ratio = size_to_aspect_ratio(payload.imageSize)

    product_name = (
        getattr(payload, "product_name", None)
        or getattr(payload, "productName", None)
        or ""
    ).strip()[:80]
    description = (getattr(payload, "description", None) or "").strip()[:800]
    product_type = (getattr(payload, "productType", None) or "").strip()[:40] or None
    style = (getattr(payload, "stylePreset", None) or "Minimal").strip()[:30]
    tone = (getattr(payload, "tone", None) or "confident").strip()[:40]
    goal = (getattr(payload, "goal", None) or "Performance optimization").strip()[:60]
    platform = (payload.platform or "Instagram").strip()[:40]

    if not product_name:
        product_name = "the same product as the reference creative"

    set_generation_progress(
        db, "optimizer_generation", progress_job_id, "building_prompt"
    )

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

        set_generation_progress(
            db, "optimizer_generation", progress_job_id, "generating_creative"
        )
        img_bytes = await asyncio.to_thread(
            lambda: generate_gpt_image_bytes(
                prompt=visual_prompt,
                size=payload.imageSize or "1024x1024",
                input_image_url=brand_kit.get("logoUrl"),
                input_image_urls=reference_image_urls,
            )
        )

        if not admin:
            ensure_storage_available(db, uid, tier, len(img_bytes))
        set_generation_progress(
            db, "optimizer_generation", progress_job_id, "uploading_creative"
        )
        image_asset = upload_png_to_firebase_storage(img_bytes, uid)
        register_storage_asset(
            db, uid, size_bytes=image_asset["fileSizeBytes"], asset_type="image"
        )
        image_url = image_asset["url"]

        set_generation_progress(
            db, "optimizer_generation", progress_job_id, "saving_library"
        )
        image_job_id = uuid.uuid4().hex
        try:
            db.collection("image_jobs").document(image_job_id).set(
                {
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
                    "storagePath": image_asset.get("storagePath"),
                    "fileSizeBytes": image_asset.get("fileSizeBytes"),
                    "contentType": image_asset.get("contentType"),
                    "storageState": "active",
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
                        "remaining": max(
                            0,
                            (cap_result.get("cap") or 0)
                            - (cap_result.get("used") or 0),
                        ),
                    },
                    "model": OPENAI_IMAGE_MODEL,
                }
            )
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
                "remaining": max(
                    0, (cap_result.get("cap") or 0) - (cap_result.get("used") or 0)
                ),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GPT Image generation failed: {e}")


# ---------------- Creation of Admin Page Routes ----------------


def _require_admin_request(authorization: str | None):
    """Return the authenticated admin UID and claims or raise 403."""
    admin_uid, _email, claims = require_user(authorization)

    if not is_admin(claims):
        raise HTTPException(status_code=403, detail="Admin only")

    return admin_uid, claims


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value if value is not None else default)
    except (TypeError, ValueError):
        return default


def _usage_percent(used: int, cap: int) -> int:
    if cap <= 0:
        return 0
    return max(0, round((used / cap) * 100))


def _firebase_timestamp_to_iso(value):
    if not value:
        return None

    try:
        if hasattr(value, "isoformat"):
            return value.isoformat()

        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
    except Exception:
        return None

    return None


def _auth_timestamp_to_iso(milliseconds):
    try:
        if not milliseconds:
            return None

        return datetime.fromtimestamp(
            milliseconds / 1000,
            tz=timezone.utc,
        ).isoformat()
    except Exception:
        return None


def _get_admin_target_user(db, target_uid: str):
    """
    Return the Firestore reference and user document for an admin target.
    The Firebase Auth user must exist.
    """
    try:
        auth_user = admin_auth.get_user(target_uid)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"User not found: {exc}",
        )

    user_ref = db.collection("users").document(target_uid)
    user_snapshot = user_ref.get()
    user_doc = user_snapshot.to_dict() or {}

    return auth_user, user_ref, user_doc


def _current_usage_period(db, target_uid: str):
    target_doc = db.collection("users").document(target_uid).get().to_dict() or {}

    return target_doc, get_usage_period(target_doc)


def _resource_admin_fields(resource: str) -> tuple[str, str]:
    mapping = {
        "images": ("imageUsed", "bonusImageCredits"),
        "video_credits": ("videoCreditsUsed", "bonusVideoCredits"),
        "optimizer_runs": ("optimizerRunsUsed", "bonusOptimizerRuns"),
    }

    if resource not in mapping:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported resource: {resource}",
        )

    return mapping[resource]


def _grant_bonus_capacity(
    *,
    db,
    target_uid: str,
    resource: str,
    credits: int,
):
    """
    Adds true bonus capacity to the current usage period.

    Example:
        plan cap = 10
        current used = 2
        grant 1 bonus credit
        new effective cap = 11
        displayed usage = 2 / 11
    """
    if credits <= 0:
        raise HTTPException(
            status_code=400,
            detail="Credits must be greater than zero.",
        )

    target_doc = db.collection("users").document(target_uid).get().to_dict() or {}

    usage_period = get_usage_period(target_doc)
    period_key = usage_period["periodKey"]

    used_field, bonus_field = _resource_admin_fields(resource)
    usage_ref = db.collection("usage").document(target_uid)

    @gc_firestore.transactional
    def _tx(transaction: gc_firestore.Transaction):
        snapshot = usage_ref.get(transaction=transaction)
        data = snapshot.to_dict() or {}

        current_period = data.get("periodKey") or data.get("month")

        if resource == "images":
            used = int(
                data.get(
                    used_field,
                    data.get("used", 0),
                )
                or 0
            )
        else:
            used = int(data.get(used_field, 0) or 0)

        current_bonus = int(data.get(bonus_field, 0) or 0)

        # A new billing period starts with fresh usage and no prior bonus.
        if current_period != period_key:
            used = 0
            current_bonus = 0

        new_bonus = current_bonus + credits

        update = {
            "periodKey": period_key,
            "periodStart": usage_period.get("periodStart"),
            "periodEnd": usage_period.get("periodEnd"),
            "periodSource": usage_period.get("periodSource"),
            "month": usage_period.get("month"),
            used_field: used,
            bonus_field: new_bonus,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }

        # Preserve temporary backward compatibility for image usage.
        if resource == "images":
            update["used"] = used

        transaction.set(
            usage_ref,
            update,
            merge=True,
        )

        return {
            "ok": True,
            "uid": target_uid,
            "resource": resource,
            "used": used,
            "bonus": new_bonus,
            "granted": credits,
            **usage_period,
        }

    return _tx(db.transaction())


def _reset_resource_usage(
    *,
    db,
    target_uid: str,
    resource: str,
    clear_bonus: bool = False,
):
    """
    Resets consumed usage to zero.

    By default, bonus capacity remains available for the current period.
    Pass clear_bonus=True only when you explicitly want to remove bonuses too.
    """
    target_doc = db.collection("users").document(target_uid).get().to_dict() or {}

    usage_period = get_usage_period(target_doc)
    period_key = usage_period["periodKey"]

    used_field, bonus_field = _resource_admin_fields(resource)
    usage_ref = db.collection("usage").document(target_uid)

    update = {
        "periodKey": period_key,
        "periodStart": usage_period.get("periodStart"),
        "periodEnd": usage_period.get("periodEnd"),
        "periodSource": usage_period.get("periodSource"),
        "month": usage_period.get("month"),
        used_field: 0,
        "updatedAt": gc_firestore.SERVER_TIMESTAMP,
    }

    if resource == "images":
        update["used"] = 0

    if clear_bonus:
        update[bonus_field] = 0

    usage_ref.set(update, merge=True)

    return {
        "ok": True,
        "uid": target_uid,
        "resource": resource,
        "used": 0,
        "bonusCleared": bool(clear_bonus),
        **usage_period,
    }




# ---------------- Admin Creative Manager ----------------
def _admin_creative_user(db, uid: str, cache: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if not uid:
        return {
            "uid": "",
            "email": "",
            "displayName": "Unknown user",
            "tier": "unknown",
            "status": "inactive",
        }

    if uid in cache:
        return cache[uid]

    profile = {}
    try:
        snap = db.collection("users").document(uid).get()
        profile = snap.to_dict() or {} if snap.exists else {}
    except Exception:
        profile = {}

    auth_user = None
    try:
        auth_user = admin_auth.get_user(uid)
    except Exception:
        auth_user = None

    stripe_obj = profile.get("stripe") or {}
    display_name = (
        (profile.get("fullName") or "").strip()
        or " ".join(
            str(value).strip()
            for value in [profile.get("firstName"), profile.get("lastName")]
            if value
        ).strip()
        or ((getattr(auth_user, "display_name", None) or "").strip())
        or "AdGen user"
    )

    email = (
        (profile.get("email") or "").strip()
        or ((getattr(auth_user, "email", None) or "").strip())
    )

    tier_value, helper_status = get_tier_and_status(profile)
    tier = stripe_obj.get("tier") or profile.get("tier") or tier_value or "unknown"
    subscription_status = (
        stripe_obj.get("status")
        or profile.get("subscriptionStatus")
        or helper_status
        or "inactive"
    )

    result = {
        "uid": uid,
        "email": email,
        "displayName": display_name,
        "tier": str(tier),
        "status": str(subscription_status).lower(),
    }
    cache[uid] = result
    return result


def _admin_creative_item(kind: str, doc_id: str, data: dict, user: dict) -> dict:
    is_video = kind == "video"
    media_url = (
        _pick(data, ["finalVideoUrl", "videoUrl", "outputUrl"], default=None)
        if is_video
        else _pick(data, ["imageUrl"], default=None)
    )
    thumbnail_url = (
        _pick(data, ["thumbnailUrl", "posterUrl"], default=None)
        if is_video
        else media_url
    )

    prompt = (
        _pick(data, ["directorPrompt", "userPrompt", "promptText", "prompt"], default="")
        if is_video
        else _pick(data, ["visualPrompt", "prompt"], default="")
    )

    return {
        "id": doc_id,
        "kind": kind,
        "uid": data.get("uid") or "",
        "createdAt": _safe_int(data.get("createdAt"), 0),
        "updatedAt": _safe_int(data.get("updatedAt"), 0),
        "status": str(data.get("status") or "unknown").lower(),
        "source": data.get("source") or data.get("sourceType") or None,
        "productName": _pick(data, ["productName", "product_name"], default=None),
        "url": media_url,
        "thumbnailUrl": thumbnail_url,
        "prompt": prompt or "",
        "copy": data.get("copy") if isinstance(data.get("copy"), dict) else None,
        "ratio": _pick(data, ["aspectRatio", "ratio"], default=None),
        "duration": _safe_int(data.get("duration"), 0) if is_video else None,
        "model": data.get("model") or None,
        "fileSizeBytes": _safe_int(data.get("fileSizeBytes"), 0),
        "error": data.get("error") or None,
        "brandKitUsed": bool(data.get("brandKitUsed") or data.get("useBrandKit")),
        "user": user,
    }


@app.get("/admin/creative")
def admin_list_creative(
    authorization: str | None = Header(default=None),
    kind: str = Query(default="all"),
    status: str = Query(default="all"),
    q: str = Query(default=""),
    days: int = Query(default=0, ge=0, le=3650),
    limit: int = Query(default=48, ge=1, le=100),
    cursor: int | None = Query(default=None),
) -> dict[str, Any]:
    """Return a read-only, admin-only view of generated image and video assets."""
    _require_admin_request(authorization)
    db = get_db()

    kind_norm = (kind or "all").strip().lower()
    status_norm = (status or "all").strip().lower()
    search_norm = (q or "").strip().lower()

    if kind_norm not in {"all", "image", "video"}:
        raise HTTPException(status_code=400, detail="Invalid creative type.")

    collections = []
    if kind_norm in {"all", "image"}:
        collections.append(("image", "image_jobs"))
    if kind_norm in {"all", "video"}:
        collections.append(("video", "video_jobs"))

    start_timestamp = 0
    if days > 0:
        start_timestamp = int(time.time()) - (days * 86400)

    # Fetch enough records to support cross-collection merge and light admin search.
    per_collection_limit = min(300, max(limit * 3, 100 if search_norm else limit * 2))
    raw_items: list[tuple[str, str, dict]] = []

    for creative_kind, collection_name in collections:
        query_ref = db.collection(collection_name).order_by(
            "createdAt", direction=gc_firestore.Query.DESCENDING
        )

        if cursor is not None:
            query_ref = query_ref.where("createdAt", "<", int(cursor))
        if start_timestamp:
            query_ref = query_ref.where("createdAt", ">=", start_timestamp)

        query_ref = query_ref.limit(per_collection_limit)

        try:
            for snap in query_ref.stream():
                data = snap.to_dict() or {}
                item_status = str(data.get("status") or "unknown").lower()
                if status_norm != "all" and item_status != status_norm:
                    continue
                raw_items.append((creative_kind, snap.id, data))
        except Exception as exc:
            print(
                f"ADMIN CREATIVE QUERY ERROR collection={collection_name}:",
                repr(exc),
                flush=True,
            )
            raise HTTPException(
                status_code=500,
                detail=f"Could not load {creative_kind} creative records.",
            )

    raw_items.sort(
        key=lambda row: (_safe_int(row[2].get("createdAt"), 0), row[1]),
        reverse=True,
    )

    user_cache: dict[str, dict[str, Any]] = {}
    items = []

    for creative_kind, doc_id, data in raw_items:
        uid = str(data.get("uid") or "")
        user = _admin_creative_user(db, uid, user_cache)
        item = _admin_creative_item(creative_kind, doc_id, data, user)

        if search_norm:
            copy_obj = item.get("copy") or {}
            haystack = " ".join(
                str(value or "")
                for value in [
                    item.get("id"),
                    item.get("uid"),
                    item.get("kind"),
                    item.get("status"),
                    item.get("productName"),
                    item.get("prompt"),
                    item.get("model"),
                    item.get("source"),
                    user.get("email"),
                    user.get("displayName"),
                    copy_obj.get("headline"),
                    copy_obj.get("primary_text"),
                    copy_obj.get("cta"),
                ]
            ).lower()
            if search_norm not in haystack:
                continue

        items.append(item)
        if len(items) >= limit:
            break

    next_cursor = None
    if len(items) == limit:
        last_created_at = _safe_int(items[-1].get("createdAt"), 0)
        if last_created_at > 0:
            next_cursor = last_created_at

    return {
        "items": items,
        "nextCursor": next_cursor,
        "count": len(items),
        "filters": {
            "kind": kind_norm,
            "status": status_norm,
            "q": q or "",
            "days": days,
        },
    }


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
        _require_admin_request(authorization)

        db = get_db()

        q_norm = (q or "").strip().lower()
        tier_norm = (tier or "all").strip().lower()
        status_norm = (status or "all").strip().lower()

        page = admin_auth.list_users(
            page_token=page_token or None,
            max_results=limit,
        )

        results = []

        for auth_user in page.users:
            auth_uid = auth_user.uid
            auth_email = auth_user.email or ""
            display_name = (auth_user.display_name or "").strip()

            created_iso = _auth_timestamp_to_iso(
                getattr(
                    auth_user.user_metadata,
                    "creation_timestamp",
                    None,
                )
            )

            last_sign_in_iso = _auth_timestamp_to_iso(
                getattr(
                    auth_user.user_metadata,
                    "last_sign_in_timestamp",
                    None,
                )
            )

            profile = {}

            try:
                snapshot = db.collection("users").document(auth_uid).get()
                if snapshot.exists:
                    profile = snapshot.to_dict() or {}
            except Exception:
                profile = {}

            first_name = (profile.get("firstName") or "").strip()
            last_name = (profile.get("lastName") or "").strip()

            if not first_name and not last_name and display_name:
                name_parts = display_name.split()

                if len(name_parts) >= 2:
                    first_name = name_parts[0]
                    last_name = " ".join(name_parts[1:])
                else:
                    first_name = display_name

            full_name = f"{first_name} {last_name}".strip()

            tier_for_caps, helper_status = get_tier_and_status(profile)
            stripe_object = profile.get("stripe") or {}

            requested_tier = (stripe_object.get("requestedTier") or "").strip()

            user_tier = stripe_object.get("tier") or profile.get("tier") or "-"
            user_tier = str(user_tier).strip() or "-"

            stripe_status = stripe_object.get("status") or helper_status or "inactive"
            stripe_status = str(stripe_status).strip().lower()

            customer_id = (stripe_object.get("customerId") or "").strip()

            subscription_id = (stripe_object.get("subscriptionId") or "").strip()

            price_id = (stripe_object.get("priceId") or "").strip()

            period_start = (
                _safe_int(
                    stripe_object.get("currentPeriodStart"),
                    0,
                )
                or None
            )

            period_end = (
                _safe_int(
                    stripe_object.get("currentPeriodEnd"),
                    0,
                )
                or None
            )

            requested_tier_at = _firebase_timestamp_to_iso(
                stripe_object.get("requestedTierAt")
            )

            image_usage = peek_usage(
                db,
                auth_uid,
                tier_for_caps,
                profile,
            )
            image_used = _safe_int(image_usage.get("used"))
            image_cap = _safe_int(image_usage.get("cap"))
            image_remaining = _safe_int(
                image_usage.get("remaining"),
                max(0, image_cap - image_used),
            )
            image_usage_pct = _usage_percent(
                image_used,
                image_cap,
            )

            video_usage = peek_resource(
                db,
                auth_uid,
                tier_for_caps,
                "video_credits",
                profile,
            )
            video_used = _safe_int(video_usage.get("used"))
            video_cap = _safe_int(video_usage.get("cap"))
            video_remaining = _safe_int(
                video_usage.get("remaining"),
                max(0, video_cap - video_used),
            )
            video_usage_pct = _usage_percent(
                video_used,
                video_cap,
            )

            optimizer_usage = peek_resource(
                db,
                auth_uid,
                tier_for_caps,
                "optimizer_runs",
                profile,
            )
            optimizer_used = _safe_int(optimizer_usage.get("used"))
            optimizer_cap = _safe_int(optimizer_usage.get("cap"))
            optimizer_remaining = _safe_int(
                optimizer_usage.get("remaining"),
                max(0, optimizer_cap - optimizer_used),
            )
            optimizer_usage_pct = _usage_percent(
                optimizer_used,
                optimizer_cap,
            )

            storage_summary = {}

            try:
                storage_summary = (
                    get_storage_summary(
                        db,
                        auth_uid,
                        tier_for_caps,
                    )
                    or {}
                )
            except Exception:
                storage_summary = {}

            storage_used_bytes = _safe_int(
                storage_summary.get("usedBytes") or storage_summary.get("used_bytes")
            )
            storage_limit_bytes = _safe_int(
                storage_summary.get("limitBytes") or storage_summary.get("limit_bytes")
            )
            storage_asset_count = _safe_int(
                storage_summary.get("assetCount") or storage_summary.get("asset_count")
            )

            storage_usage_pct = _safe_int(
                storage_summary.get("usagePct") or storage_summary.get("usage_pct")
            )

            if storage_usage_pct <= 0 and storage_limit_bytes > 0:
                storage_usage_pct = _usage_percent(
                    storage_used_bytes,
                    storage_limit_bytes,
                )

            if tier_norm != "all" and user_tier.lower() != tier_norm:
                continue

            if status_norm != "all" and stripe_status.lower() != status_norm:
                continue

            if q_norm:
                search_text = " ".join(
                    [
                        first_name,
                        last_name,
                        full_name,
                        display_name,
                        auth_email,
                        auth_uid,
                        customer_id,
                    ]
                ).lower()

                if q_norm not in search_text:
                    continue

            results.append(
                {
                    "uid": auth_uid,
                    "firstName": first_name,
                    "lastName": last_name,
                    "fullName": full_name or display_name or "-",
                    "displayName": display_name,
                    "email": auth_email,
                    "emailVerified": bool(auth_user.email_verified),
                    "disabled": bool(auth_user.disabled),
                    "createdAt": created_iso,
                    "lastSignInAt": last_sign_in_iso,
                    "tier": user_tier,
                    "requestedTier": requested_tier,
                    "requestedTierAt": requested_tier_at,
                    "stripeStatus": stripe_status,
                    "customerId": customer_id,
                    "subscriptionId": subscription_id,
                    "priceId": price_id,
                    "currentPeriodStart": period_start,
                    "currentPeriodEnd": period_end,
                    "used": image_used,
                    "cap": image_cap,
                    "remaining": image_remaining,
                    "usagePct": image_usage_pct,
                    "monthlyUsage": image_used,
                    "videoUsed": video_used,
                    "videoCap": video_cap,
                    "videoRemaining": video_remaining,
                    "videoUsagePct": video_usage_pct,
                    "optimizerUsed": optimizer_used,
                    "optimizerCap": optimizer_cap,
                    "optimizerRemaining": optimizer_remaining,
                    "optimizerUsagePct": optimizer_usage_pct,
                    "storageUsedBytes": storage_used_bytes,
                    "storageLimitBytes": storage_limit_bytes,
                    "storageAssetCount": storage_asset_count,
                    "storageUsagePct": storage_usage_pct,
                    "hasProfile": bool(profile),
                    "periodKey": image_usage.get("periodKey"),
                    "periodStart": image_usage.get("periodStart"),
                    "periodEnd": image_usage.get("periodEnd"),
                    "periodSource": image_usage.get("periodSource"),
                }
            )

        return {
            "users": results,
            "nextCursor": page.next_page_token or "",
            "returned": len(results),
        }

    except HTTPException:
        raise

    except Exception as exc:
        print("ADMIN USERS ERROR:", repr(exc))
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
        )


# ---------- Image usage ----------


@app.post("/admin/users/{target_uid}/usage/grant")
def admin_grant_image_credits(
    target_uid: str,
    authorization: str | None = Header(default=None),
    credits: int = Query(default=5, ge=1, le=1000),
):
    _require_admin_request(authorization)

    result = _grant_bonus_capacity(
        db=get_db(),
        target_uid=target_uid,
        resource="images",
        credits=credits,
    )

    return {
        **result,
        "bonusImageCredits": result["bonus"],
    }


@app.post("/admin/users/{target_uid}/usage/reset")
def admin_reset_image_usage(
    target_uid: str,
    authorization: str | None = Header(default=None),
    clear_bonus: bool = Query(default=False),
):
    _require_admin_request(authorization)

    result = _reset_resource_usage(
        db=get_db(),
        target_uid=target_uid,
        resource="images",
        clear_bonus=clear_bonus,
    )

    return {
        **result,
        "imageUsed": 0,
        "used": 0,
    }


# ---------- Video usage ----------


@app.post("/admin/users/{target_uid}/video/usage/grant")
def admin_grant_video_credits(
    target_uid: str,
    authorization: str | None = Header(default=None),
    credits: int = Query(default=1, ge=1, le=250),
):
    _require_admin_request(authorization)

    result = _grant_bonus_capacity(
        db=get_db(),
        target_uid=target_uid,
        resource="video_credits",
        credits=credits,
    )

    return {
        **result,
        "bonusVideoCredits": result["bonus"],
        "videoCreditsUsed": result["used"],
        "video_used": result["used"],
    }


@app.post("/admin/users/{target_uid}/video/usage/reset")
def admin_reset_video_usage(
    target_uid: str,
    authorization: str | None = Header(default=None),
    clear_bonus: bool = Query(default=False),
):
    _require_admin_request(authorization)

    result = _reset_resource_usage(
        db=get_db(),
        target_uid=target_uid,
        resource="video_credits",
        clear_bonus=clear_bonus,
    )

    return {
        **result,
        "videoCreditsUsed": 0,
        "video_used": 0,
    }


# ---------- Optimizer usage ----------


@app.post("/admin/users/{target_uid}/optimizer/usage/grant")
def admin_grant_optimizer_runs(
    target_uid: str,
    authorization: str | None = Header(default=None),
    credits: int = Query(default=5, ge=1, le=500),
):
    _require_admin_request(authorization)

    result = _grant_bonus_capacity(
        db=get_db(),
        target_uid=target_uid,
        resource="optimizer_runs",
        credits=credits,
    )

    return {
        **result,
        "bonusOptimizerRuns": result["bonus"],
        "optimizerRunsUsed": result["used"],
    }


@app.post("/admin/users/{target_uid}/optimizer/usage/reset")
def admin_reset_optimizer_usage(
    target_uid: str,
    authorization: str | None = Header(default=None),
    clear_bonus: bool = Query(default=False),
):
    _require_admin_request(authorization)

    result = _reset_resource_usage(
        db=get_db(),
        target_uid=target_uid,
        resource="optimizer_runs",
        clear_bonus=clear_bonus,
    )

    return {
        **result,
        "optimizerRunsUsed": 0,
    }


@app.post("/admin/users/{target_uid}/usage/reset-all")
def admin_reset_all_usage(
    target_uid: str,
    authorization: str | None = Header(default=None),
    clear_bonus: bool = Query(default=False),
):
    _require_admin_request(authorization)

    db = get_db()

    target_doc = db.collection("users").document(target_uid).get().to_dict() or {}

    usage_period = get_usage_period(target_doc)
    usage_ref = db.collection("usage").document(target_uid)

    update = {
        "periodKey": usage_period["periodKey"],
        "periodStart": usage_period.get("periodStart"),
        "periodEnd": usage_period.get("periodEnd"),
        "periodSource": usage_period.get("periodSource"),
        "month": usage_period.get("month"),
        "imageUsed": 0,
        "used": 0,
        "videoCreditsUsed": 0,
        "optimizerRunsUsed": 0,
        "updatedAt": gc_firestore.SERVER_TIMESTAMP,
    }

    if clear_bonus:
        update.update(
            {
                "bonusImageCredits": 0,
                "bonusVideoCredits": 0,
                "bonusOptimizerRuns": 0,
            }
        )

    usage_ref.set(update, merge=True)

    return {
        "ok": True,
        "uid": target_uid,
        "imagesUsed": 0,
        "videoCreditsUsed": 0,
        "optimizerRunsUsed": 0,
        "bonusCleared": bool(clear_bonus),
        **usage_period,
    }


# ---------- Requested plan changes ----------


@app.post("/admin/users/{target_uid}/tier/request")
def admin_request_tier_change(
    target_uid: str,
    body: AdminRequestTierBody,
    authorization: str | None = Header(default=None),
):
    _require_admin_request(authorization)

    requested_tier = (body.requestedTier or "").strip()

    allowed_tiers = {
        "trial_monthly",
        "starter_monthly",
        "pro_monthly",
        "business_monthly",
    }

    if requested_tier not in allowed_tiers:
        raise HTTPException(
            status_code=400,
            detail=("Invalid requestedTier. " f"Allowed: {sorted(allowed_tiers)}"),
        )

    db = get_db()
    _auth_user, user_ref, _user_doc = _get_admin_target_user(
        db,
        target_uid,
    )

    user_ref.set(
        {
            "stripe": {
                "requestedTier": requested_tier,
                "requestedTierAt": gc_firestore.SERVER_TIMESTAMP,
            }
        },
        merge=True,
    )

    return {
        "ok": True,
        "uid": target_uid,
        "requestedTier": requested_tier,
    }


@app.post("/admin/users/{target_uid}/tier/clear-request")
def admin_clear_requested_tier(
    target_uid: str,
    authorization: str | None = Header(default=None),
):
    _require_admin_request(authorization)

    db = get_db()
    _auth_user, user_ref, _user_doc = _get_admin_target_user(
        db,
        target_uid,
    )

    user_ref.set(
        {
            "stripe": {
                "requestedTier": gc_firestore.DELETE_FIELD,
                "requestedTierAt": gc_firestore.DELETE_FIELD,
            }
        },
        merge=True,
    )

    return {
        "ok": True,
        "uid": target_uid,
        "requestedTier": None,
    }


# Keep this existing self-service route outside the admin UI.
@app.post("/users/me/tier/clear-request")
def clear_requested_tier(
    authorization: str | None = Header(default=None),
):
    uid, _email, _claims = require_user(authorization)

    get_db().collection("users").document(uid).set(
        {
            "stripe": {
                "requestedTier": gc_firestore.DELETE_FIELD,
                "requestedTierAt": gc_firestore.DELETE_FIELD,
            }
        },
        merge=True,
    )

    return {"ok": True}


# ---------- Subscription sync ----------


@app.post("/admin/users/{target_uid}/subscription/sync")
def admin_sync_user_subscription(
    target_uid: str,
    authorization: str | None = Header(default=None),
):
    _require_admin_request(authorization)

    db = get_db()
    _auth_user, user_ref, user_doc = _get_admin_target_user(
        db,
        target_uid,
    )

    stripe_object = user_doc.get("stripe") or {}
    customer_id = (stripe_object.get("customerId") or "").strip()

    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="This user does not have a billing customer ID.",
        )

    try:
        subscriptions = stripe.Subscription.list(
            customer=customer_id,
            status="all",
            limit=10,
            expand=["data.items"],
        )

        if not subscriptions.data:
            user_ref.set(
                {
                    "stripe": {
                        "customerId": customer_id,
                        "status": "inactive",
                        "updatedAt": gc_firestore.SERVER_TIMESTAMP,
                    }
                },
                merge=True,
            )

            return {
                "ok": True,
                "uid": target_uid,
                "customerId": customer_id,
                "subscriptionId": None,
                "status": "inactive",
                "subscriptionStatus": None,
                "tier": None,
                "priceId": None,
                "currentPeriodStart": None,
                "currentPeriodEnd": None,
                "message": "No subscription exists for this customer.",
            }

        status_priority = {
            "active": 0,
            "trialing": 1,
            "past_due": 2,
            "incomplete": 3,
            "unpaid": 4,
            "paused": 5,
            "canceled": 6,
        }

        latest = sorted(
            subscriptions.data,
            key=lambda subscription: (
                status_priority.get(
                    subscription.get("status") or "",
                    99,
                ),
                -_safe_int(subscription.get("created")),
            ),
        )[0]

        subscription_id = latest.get("id")
        subscription_status = latest.get("status") or "inactive"

        if subscription_status in {
            "active",
            "trialing",
            "past_due",
        }:
            app_status = subscription_status
        else:
            app_status = "inactive"

        items = (latest.get("items") or {}).get("data") or []

        price_id = None
        resolved_tier = None

        if items and items[0].get("price"):
            price_id = items[0]["price"].get("id")
            resolved_tier = price_id_to_tier(price_id)

        period_start, period_end = extract_subscription_period(latest)

        stripe_update = {
            "customerId": customer_id,
            "subscriptionId": subscription_id,
            "status": app_status,
            "updatedAt": gc_firestore.SERVER_TIMESTAMP,
        }

        if price_id:
            stripe_update["priceId"] = price_id

        if resolved_tier:
            stripe_update["tier"] = resolved_tier

        if period_start:
            stripe_update["currentPeriodStart"] = int(period_start)

        if period_end:
            stripe_update["currentPeriodEnd"] = int(period_end)

        user_ref.set(
            {"stripe": stripe_update},
            merge=True,
        )

        return {
            "ok": True,
            "uid": target_uid,
            "customerId": customer_id,
            "subscriptionId": subscription_id,
            "status": app_status,
            "subscriptionStatus": subscription_status,
            "tier": resolved_tier,
            "priceId": price_id,
            "currentPeriodStart": period_start,
            "currentPeriodEnd": period_end,
        }

    except HTTPException:
        raise

    except Exception as exc:
        print(
            "ADMIN SUBSCRIPTION SYNC ERROR:",
            repr(exc),
        )
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Could not sync subscription: {exc}",
        )


# --- Video Credit Usage (My Account + Dashboard compatibility) ---
@app.get("/video/usage")
def get_video_usage(authorization: str | None = Header(default=None)):
    uid, _email, _claims = require_user(authorization)
    db = get_db()

    user_snap = db.collection("users").document(uid).get()
    user_doc = user_snap.to_dict() or {}
    user_doc = ensure_stripe_period_for_user(db, uid, user_doc)

    tier, _status = get_tier_and_status(user_doc)
    usage = peek_resource(db, uid, tier, "video_credits", user_doc)

    return {
        **usage,
        "enabled": int(usage.get("cap") or 0) > 0,
        "tier": tier,
        "unit": "video_credits",
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
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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


@app.delete("/image/jobs/{job_id}")
def delete_image_job(job_id: str, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()
    ref = db.collection("image_jobs").document(job_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Image job not found.")
    data = snap.to_dict() or {}
    if not admin and data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")
    if data.get("storageState") != "deleted":
        path = data.get("storagePath")
        if path:
            delete_firebase_storage_object(path)
        release_storage_asset(
            db,
            data.get("uid") or uid,
            size_bytes=int(data.get("fileSizeBytes") or 0),
            asset_type="image",
        )
    ref.delete()
    return {"ok": True, "jobId": job_id}


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
    pct_fields = {
        "ctr",
        "thumb_stop_rate",
        "view_3s",
        "view_6s",
        "hold_rate",
        "conversion_rate",
    }
    for k in list(perf.keys()):
        if k in pct_fields and perf[k] is not None:
            if perf[k] < 0 or perf[k] > 100:
                raise HTTPException(
                    status_code=400, detail=f"{k} must be between 0 and 100."
                )

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
            raise HTTPException(
                status_code=402,
                detail="Subscription inactive. Please subscribe to continue.",
            )
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
    best_style = _group_best(
        [x for x in items if x["kind"] == "image"], "stylePreset", min_spend=min_spend
    )

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
        ratio_rows.append(
            {
                "value": ratio,
                "count": len(arr),
                "weighted_roas": _weighted_roas(arr),
                "avg_ctr": _avg(
                    [
                        _safe_num((x.get("performance") or {}).get("ctr"))
                        for x in arr
                        if _safe_num((x.get("performance") or {}).get("ctr"))
                        is not None
                    ]
                ),
                "avg_cpa": _avg(
                    [
                        _safe_num((x.get("performance") or {}).get("cpa"))
                        for x in arr
                        if _safe_num((x.get("performance") or {}).get("cpa"))
                        is not None
                    ]
                ),
                "avg_cpm": _avg(
                    [
                        _safe_num((x.get("performance") or {}).get("cpm"))
                        for x in arr
                        if _safe_num((x.get("performance") or {}).get("cpm"))
                        is not None
                    ]
                ),
            }
        )
    ratio_rows.sort(
        key=lambda r: (r["weighted_roas"] if r["weighted_roas"] is not None else -1e18),
        reverse=True,
    )
    best_ratio = {
        "best": ratio_rows[0] if ratio_rows else None,
        "rows": ratio_rows[:10],
    }

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



























































