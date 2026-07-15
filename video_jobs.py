# video_jobs.py
import os
import asyncio
import hashlib
import time
import uuid
import tempfile
import subprocess
from typing import Optional, Literal, Dict, Any, List

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from storage_utils import upload_bytes_to_firebase_storage, upload_bytes_to_firebase_storage_with_metadata, delete_firebase_storage_object
from storage_tracking import ensure_storage_available, register_storage_asset, release_storage_asset

from runway_client import (
    RunwayError,
    create_image_to_video,
    create_text_to_video,
    create_text_to_speech,
    get_task,
    extract_first_output_url,
)

from auth_helpers import get_db, require_user
from usage_caps import get_tier_and_status, utc_month_key
from video_usage import (
    check_and_increment_video_usage,
    rollback_video_usage,
)
from admin_guard import is_admin

from fastapi import APIRouter, Header, HTTPException, Query
from google.cloud import firestore as gc_firestore

from entitlements import require_pro_or_business
from brand_kits import resolve_brand_kit
from plan_config import get_limit, video_credits_for_duration

from notification_utils import (
    create_notification,
    create_usage_notifications,
)



# -----------------------------
# Env / defaults
# -----------------------------
VIDEO_MAX_SECONDS = int(os.getenv("VIDEO_MAX_SECONDS", "10"))

# ✅ Separate defaults so you never mix them up
VIDEO_DEFAULT_IMAGE_MODEL = os.getenv(
    "VIDEO_IMAGE_DEFAULT_MODEL",
    "gen4.5",
).strip()

VIDEO_DEFAULT_TEXT_MODEL = os.getenv(
    "VIDEO_TEXT_DEFAULT_MODEL",
    "gen4.5",
).strip()

router = APIRouter()

VIDEO_PROGRESS = {
    "queued": (5, "Preparing your video request."),
    "loading_brand_kit": (12, "Applying your Active Brand."),
    "building_prompt": (22, "Building your creative direction."),
    "submitting_to_runway": (32, "Submitting your video request."),
    "waiting_for_runway": (48, "Generating your video."),
    "processing_video": (68, "Processing the final video."),
    "generating_voiceover": (78, "Generating your voiceover."),
    "mixing_audio": (86, "Adding voiceover to your video."),
    "uploading_video": (93, "Uploading your finished video."),
    "saving_library": (98, "Saving your video to the Library."),
    "succeeded": (100, "Your video is ready."),
    "failed": (100, "Video generation failed."),
}

def progress_payload(stage: str) -> Dict[str, Any]:
    percent, message = VIDEO_PROGRESS.get(stage, VIDEO_PROGRESS["queued"])
    return {"progressStage": stage, "progressPercent": percent, "progressMessage": message}

def set_video_progress(job_ref, stage: str, **extra) -> None:
    payload = progress_payload(stage)
    payload.update(extra)
    payload["progressUpdatedAt"] = int(time.time())
    job_ref.update(payload)

# -----------------------------
# Video plan gating + caps
# -----------------------------
# Generation limits come from plan_config.py. Voice-preview caps remain
# separate because previews are a lightweight support feature.
TTS_PREVIEW_CAPS = {
    "trial_monthly": 25,
    "starter_monthly": 75,
    "pro_monthly": 250,
    "business_monthly": 600,
}

# -----------------------------
# Ratios (shared)
# -----------------------------
VideoRatio = Literal[
    "720:1280",   # 9:16 SD
    "1080:1920",  # 9:16 HD
    "1280:720",   # 16:9 HD
    "1920:1080",  # 16:9 Full HD
    "1080:1080",  # 1:1
    "1080:1350",  # 4:5
]

# -----------------------------
# TTS voice allowlist + fallback
# -----------------------------
ALLOWED_TTS_VOICES = {
    "Maya","Arjun","Serene","Bernard","Billy","Mark","Clint","Mabel","Chad","Leslie",
    "Eleanor","Elias","Elliot","Grungle","Brodie","Sandra","Kirk","Kylie","Lara","Lisa",
    "Malachi","Marlene","Martin","Miriam","Paula","Pip","Rusty","Ragnar","Xylar","Maggie",
    "Jack","Katie","Noah","James","Rina","Ella","Mariah","Frank","Claudia","Niki","Vincent",
    "Kendrick","Myrna","Tom","Wanda","Benjamin","Kiana","Rachel"
}

def safe_voice(voice: Optional[str]) -> str:
    v = (voice or "").strip()
    return v if v in ALLOWED_TTS_VOICES else "Leslie"

def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

async def download_to_file(url: str, out_path: str) -> None:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(url)
        r.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(r.content)

def mux_voiceover(video_path: str, audio_path: str, out_path: str) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-map", "0:v:0",   # ✅ keep video from first input
        "-map", "1:a:0",   # ✅ take audio from second input
        "-c:v", "copy",
        "-c:a", "aac",
        out_path,
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg mux failed: {p.stderr[-800:]}")

def normalize_video_with_ffmpeg(in_path: str, out_path: str) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-i", in_path,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        out_path,
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg normalize failed: {p.stderr[-800:]}")

def probe_duration_seconds(path: str) -> float:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=nk=1:nw=1",
        path,
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {p.stderr[-800:]}")
    try:
        return float((p.stdout or "").strip())
    except Exception:
        raise RuntimeError(f"ffprobe returned invalid duration: {p.stdout!r}")

def enforce_exact_duration(in_path: str, out_path: str, target_seconds: int) -> None:
    """
    Runway sometimes returns shorter (ex: 4s when you request 6s).
    This trims or pads (clone last frame) to ensure exact target length.
    """
    dur = probe_duration_seconds(in_path)

    # If we're already very close, just copy through a faststart normalize
    if abs(dur - target_seconds) <= 0.15:
        normalize_video_with_ffmpeg(in_path, out_path)
        return

    pad = max(0.0, (target_seconds - dur) + 0.25)

    # Re-encode video to safely apply tpad and time trim
    vf = f"tpad=stop_mode=clone:stop_duration={pad:.3f}"
    cmd = [
        "ffmpeg", "-y",
        "-i", in_path,
        "-t", str(target_seconds),
        "-vf", vf,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        out_path,
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg enforce duration failed: {p.stderr[-800:]}")

# -----------------------------
# Voiceover script duration guard
# -----------------------------
def estimate_speech_seconds(text: str) -> float:
    t = (text or "").strip()
    if not t:
        return 0.0
    words = [w for w in t.split() if w.strip()]
    # ~150 wpm => 2.5 words/sec + buffer
    return round((len(words) / 2.5) + 0.6, 2)

def enforce_script_fits_duration(script: Optional[str], duration: int, enabled: bool) -> None:
    if not enabled:
        return
    s = (script or "").strip()
    if not s:
        return
    est = estimate_speech_seconds(s)
    if est > (duration + 0.2):
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"Voiceover script is too long (~{est}s) for a {duration}s video. Please shorten it.",
                "estimatedSeconds": est,
                "maxSeconds": duration,
            },
        )

# -----------------------------
# Caps helpers
# -----------------------------
def _enforce_tts_preview_caps_and_increment(db, uid: str, tier: str, status: str) -> Dict[str, Any]:
    allowed_statuses = {"active", "trialing"}
    if status not in allowed_statuses:
        raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")
    if get_limit(tier, "video_credits") <= 0:
        raise HTTPException(status_code=403, detail="Voice preview is not available on your plan.")

    cap = TTS_PREVIEW_CAPS.get(tier, 0)
    if not cap:
        raise HTTPException(status_code=500, detail="TTS preview cap configuration missing for your plan.")

    month_key = utc_month_key()
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get().to_dict() or {}

    used = int(user_doc.get("tts_preview_used", 0) or 0)
    prev_month = user_doc.get("tts_preview_month_key")
    if prev_month != month_key:
        used = 0

    if used >= cap:
        raise HTTPException(
            status_code=429,
            detail={"message": "You’ve reached your monthly voice preview limit.", "used": used, "cap": cap, "month": month_key, "upgradePath": "/account"},
        )

    user_ref.update({"tts_preview_used": used + 1, "tts_preview_month_key": month_key})
    return {"used": used + 1, "cap": cap, "month": month_key}

def _enforce_video_entitlements_and_increment(db, uid: str, tier: str, status: str, duration: int) -> Dict[str, Any]:
    allowed_statuses = {"active", "trialing"}

    if status not in allowed_statuses:
        raise HTTPException(status_code=402, detail="Subscription inactive. Please subscribe to continue.")

    try:
        required_credits = video_credits_for_duration(int(duration))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = check_and_increment_video_usage(db, uid, tier, required_credits)
    result["creditsCharged"] = required_credits

    if not result.get("allowed"):
        reason = result.get("reason")

        if reason == "tier_not_allowed":
            raise HTTPException(
                status_code=403,
                detail="Video generation is not available on your plan.",
            )

        if reason == "no_cap_configured":
            raise HTTPException(status_code=500, detail="Video cap configuration missing for your plan.")

        if reason == "cap_reached":
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "You’ve reached your video generation limit. Upgrade to continue.",
                    "used": result.get("used"),
                    "cap": result.get("cap"),
                    "month": result.get("month"),
                    "periodKey": result.get("periodKey"),
                    "periodStart": result.get("periodStart"),
                    "periodEnd": result.get("periodEnd"),
                    "periodSource": result.get("periodSource"),
                    "upgradePath": "/account",
                },
            )

        raise HTTPException(status_code=403, detail="Video generation is not available for your plan.")

    return result

def refund_video_usage_once(
    db,
    job_ref,
    uid: str,
    *,
    reason: str,
    fallback_credits: int = 0,
    fallback_period_key: Optional[str] = None,
) -> bool:
    """Refund reserved video credits exactly once for an undelivered job."""
    latest = job_ref.get().to_dict() or {}

    if latest.get("usageRefunded"):
        return True

    credits = int(
        latest.get("creditsReserved")
        or fallback_credits
        or 0
    )
    period_key = (
        latest.get("usagePeriodKey")
        or fallback_period_key
    )

    if credits <= 0 or not period_key:
        return False

    try:
        refunded = rollback_video_usage(
            db,
            uid,
            period_key,
            credits,
        )
    except Exception as exc:
        print(
            "[Video Usage Refund Error]",
            f"uid={uid}",
            f"reason={reason}",
            repr(exc),
        )
        return False

    if refunded:
        job_ref.update({
            "usageRefunded": True,
            "usageRefundReason": reason,
            "usageRefundedAt": int(time.time()),
        })

    return bool(refunded)

# ---------- Request/Response models ----------
class VoiceoverConfig(BaseModel):
    enabled: bool = False
    presetVoice: str = "Leslie"

class StartImageVideoRequest(BaseModel):
    promptImageUrl: str
    duration: Literal[6, 10]
    ratio: VideoRatio = "720:1280"
    promptText: str = Field(min_length=1, max_length=1000)
    useBrandKit: bool = True
    brandKitId: Optional[str] = None
    voiceoverScript: Optional[str] = Field(default=None, max_length=1200)
    model: str = VIDEO_DEFAULT_IMAGE_MODEL
    voiceover: VoiceoverConfig = VoiceoverConfig()

    # legacy (keep)
    winnerGuidance: Optional[str] = Field(default=None, max_length=1200)

    # ✅ NEW: structured winners (preferred over winnerGuidance)
    winnerProfile: Optional[Dict[str, Any]] = None
    winnersApply: Optional[List[str]] = None
    winnersInfluence: Optional[float] = 0.5


class StartPromptVideoRequest(BaseModel):
    productName: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=800)
    offer: Optional[str] = Field(default=None, max_length=200)
    audience: Optional[str] = Field(default=None, max_length=200)
    tone: Optional[str] = Field(default=None, max_length=80)
    platform: Optional[str] = Field(default="tiktok", max_length=60)

    # Creative direction controls already sent by VideoAds.jsx
    goal: Optional[str] = Field(default=None, max_length=40)
    hookStyle: Optional[str] = Field(default=None, max_length=60)
    sceneStyle: Optional[str] = Field(default=None, max_length=60)
    cameraMotion: Optional[str] = Field(default=None, max_length=60)
    lightingStyle: Optional[str] = Field(default=None, max_length=60)
    pace: Optional[str] = Field(default=None, max_length=60)
    callToAction: Optional[str] = Field(default=None, max_length=160)
    fullCreativeDirection: Optional[str] = Field(
        default=None,
        max_length=1000,
    )

    duration: Literal[6, 10]
    ratio: VideoRatio = "720:1280"

    userPrompt: Optional[str] = Field(default=None, max_length=1000)
    useBrandKit: bool = True
    brandKitId: Optional[str] = None
    voiceoverScript: Optional[str] = Field(
        default=None,
        max_length=1200,
    )

    model: str = VIDEO_DEFAULT_TEXT_MODEL
    voiceover: VoiceoverConfig = VoiceoverConfig()

    # Legacy guidance
    winnerGuidance: Optional[str] = Field(
        default=None,
        max_length=1200,
    )

    # Structured winner guidance
    winnerProfile: Optional[Dict[str, Any]] = None
    winnersApply: Optional[List[str]] = None
    winnersInfluence: Optional[float] = 0.5

class StartVideoResponse(BaseModel):
    jobId: str
    status: str
    progressStage: Optional[str] = None
    progressMessage: Optional[str] = None
    progressPercent: Optional[int] = None

class VideoStatusResponse(BaseModel):
    jobId: str
    status: str
    finalVideoUrl: Optional[str] = None
    error: Optional[str] = None
    progressStage: Optional[str] = None
    progressMessage: Optional[str] = None
    progressPercent: Optional[int] = None

class TTSPreviewRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    presetVoice: Optional[str] = "Leslie"

class TTSPreviewResponse(BaseModel):
    audioUrl: str
    cached: bool = False


def trim_video_prompt(text: str, max_length: int = 1000) -> str:
    cleaned = " ".join((text or "").split())

    if len(cleaned) <= max_length:
        return cleaned

    shortened = cleaned[: max_length - 1].rsplit(" ", 1)[0]
    return shortened.rstrip(" ,;:-") + "."

GOAL_PROMPTS = {
    "conversions": (
        "Prioritize product clarity, offer visibility, purchase intent, "
        "and a decisive sales-oriented ending."
    ),
    "leads": (
        "Prioritize trust, credibility, clarity, and a strong reason "
        "to take the next step."
    ),
    "traffic": (
        "Prioritize curiosity, momentum, visual intrigue, and a clear "
        "reason to continue exploring."
    ),
    "awareness": (
        "Prioritize memorable brand imagery, distinct visual identity, "
        "and broad audience appeal."
    ),
}


HOOK_STYLE_PROMPTS = {
    "bold claim": (
        "Open with an immediate, visually bold product statement."
    ),
    "question": (
        "Open with a curiosity-driven visual that creates an unanswered question."
    ),
    "problem solution": (
        "Open by showing the problem, then quickly reveal the product "
        "as the solution."
    ),
    "social proof": (
        "Open with a confident proof-oriented visual that suggests trust, "
        "popularity, or credibility."
    ),
    "before after": (
        "Open with a clear visual contrast between the before state "
        "and the improved result."
    ),
}


SCENE_STYLE_PROMPTS = {
    "studio product": "Premium studio product setting.",
    "lifestyle": "Authentic aspirational lifestyle setting.",
    "ugc": "Natural creator-style social video.",
    "cinematic": "Cinematic environment with rich depth.",
    "minimal abstract": "Minimal abstract environment with clean negative space.",
}

CAMERA_MOTION_PROMPTS = {
    "none": "Locked stable camera.",
    "subtle": "Slow controlled push-in.",
    "dynamic": "Smooth energetic orbit and reveal.",
    "fast cuts": "Rapid clean shot progression.",
}

LIGHTING_PROMPTS = {
    "bright clean": "Bright clean commercial lighting.",
    "natural": "Soft natural lighting.",
    "dramatic": "Dramatic rim lighting and deep contrast.",
    "high contrast": "Bold highlights and rich shadows.",
}

PACE_PROMPTS = {
    "fast": "Immediate hook with fast commercial pacing.",
    "medium": "Balanced reveal and hero ending.",
    "slow cinematic": "Elegant deliberate cinematic pacing.",
}

def _sentence(value: Optional[str]) -> str:
    cleaned = (value or "").strip().rstrip(" .!?;:")
    return f"{cleaned}." if cleaned else ""

def compile_video_brand_direction(
    brand_kit: Optional[Dict[str, Any]]
) -> str:
    """
    Compiles only the most useful visual Brand Kit details into
    one short Runway-friendly instruction.
    """
    if not brand_kit:
        return ""

    colors = brand_kit.get("colors") or {}

    personality = str(
        brand_kit.get("brandPersonality") or ""
    ).strip()

    visual_style = str(
        brand_kit.get("preferredImageStyle")
        or brand_kit.get("imageStyle")
        or ""
    ).strip()

    color_values = [
        colors.get("primary"),
        colors.get("secondary"),
        colors.get("accent"),
    ]

    color_values = [
        str(value).strip()
        for value in color_values
        if value and str(value).strip()
    ]

    parts: List[str] = []

    if personality:
        parts.append(f"{personality} brand aesthetic")

    if visual_style:
        parts.append(f"{visual_style} visual style")

    if color_values:
        parts.append(
            "naturally use brand colors "
            + ", ".join(color_values[:3])
        )

    if not parts:
        return ""

    return "Brand direction: " + "; ".join(parts) + "."

def build_director_prompt(
    req: StartPromptVideoRequest,
    brand_kit_context: str = "",
) -> str:
    """
    Compiles the user's structured inputs into a concise,
    cinematography-focused Runway prompt.

    Target length: approximately 450–700 characters.
    """

    parts: List[str] = []

    # 1. Product and scene foundation
    parts.append(
        _sentence(
            f"Create a premium commercial for {req.productName}. "
            f"{req.description}"
        )
    )

    # 2. Highest-priority user direction
    if req.fullCreativeDirection:
        compact_direction = " ".join(
            req.fullCreativeDirection.split()
        )[:350]

        parts.append(
            _sentence(
                f"Creative direction: {compact_direction}"
            )
        )

    if req.userPrompt:
        compact_extra = " ".join(
            req.userPrompt.split()
        )[:400]

        parts.append(
            _sentence(
                f"Additional direction: {compact_extra}"
            )
        )

    # 3. Compact Brand Kit direction
    if brand_kit_context:
        parts.append(brand_kit_context)

    # 4. Visible production choices
    scene_direction = SCENE_STYLE_PROMPTS.get(
        (req.sceneStyle or "").strip().lower(),
        "",
    )
    if scene_direction:
        parts.append(scene_direction)

    camera_direction = CAMERA_MOTION_PROMPTS.get(
        (req.cameraMotion or "").strip().lower(),
        "",
    )
    if camera_direction:
        parts.append(camera_direction)

    lighting_direction = LIGHTING_PROMPTS.get(
        (req.lightingStyle or "").strip().lower(),
        "",
    )
    if lighting_direction:
        parts.append(lighting_direction)

    pace_direction = PACE_PROMPTS.get(
        (req.pace or "").strip().lower(),
        "",
    )
    if pace_direction:
        parts.append(pace_direction)

    # 5. Tone can affect visual presentation without adding marketing metadata
    if req.tone:
        parts.append(
            _sentence(
                f"Visual tone: {req.tone}"
            )
        )

    # 6. Short quality instruction
    parts.append(
        "Use photorealistic materials, stable product geometry, "
        "clean commercial framing, smooth physical motion, "
        "End on a clean hero view of the product.."
    )

    # 7. Short negative safeguards
    parts.append(
        "Avoid jitter, flicker, warping, morphing, duplicate objects, "
        "random lettering, captions, subtitles, and floating graphics."
    )

    prompt = " ".join(part for part in parts if part)

    return trim_video_prompt(prompt, 1000)

def build_image_director_prompt(
    req: StartImageVideoRequest,
    brand_kit_context: str = "",
) -> str:
    """
    Compiles a concise image-to-video motion prompt.
    The uploaded image remains the source of truth.
    """

    parts: List[str] = [
        (
            "Animate the supplied image as a premium commercial shot. "
            "Preserve the original subject, product, branding, colors, "
            "composition, proportions, packaging, labels, and scene."
        )
    ]

    user_direction = (req.promptText or "").strip()

    if user_direction:
        parts.append(
            _sentence(f"Motion direction: {user_direction}")
        )

    if brand_kit_context:
        parts.append(brand_kit_context)

    parts.append(
        "Use smooth restrained camera motion, realistic parallax, "
        "natural reflections, subtle atmosphere, and physically believable movement."
    )

    parts.append(
        "Preserve all existing text and logos exactly. "
        "Do not add, rewrite, distort, or invent lettering."
        "End on a clean hero view of the product. "
    )

    parts.append(
        "Maintain stable geometry and textures. Avoid jitter, flicker, "
        "warping, morphing, duplicate objects, abrupt movement, captions, "
        "and floating graphics."
    )

    prompt = " ".join(part for part in parts if part)

    return trim_video_prompt(prompt, 1000)

def inject_winners_structured(
    base_text: str,
    winner_profile: Optional[Dict[str, Any]],
    winners_apply: Optional[List[str]],
    winners_influence: Optional[float],
) -> str:
    """
    Adds compact Winner Profile guidance without overwhelming
    the Runway prompt.
    """
    if not winner_profile:
        return base_text

    apply_set = {
        str(value).strip().lower()
        for value in (winners_apply or [])
        if str(value).strip()
    }

    constraints: List[str] = []

    top_platform = winner_profile.get("top_platform")
    top_ratio = winner_profile.get("top_ratio")
    top_tone = winner_profile.get("top_tone")

    if top_platform and "platform" in apply_set:
        constraints.append(
            f"Winning platform style: {top_platform}."
        )

    if top_ratio and "ratio" in apply_set:
        constraints.append(
            f"Winning framing: {top_ratio}."
        )

    if top_tone and "tone" in apply_set:
        constraints.append(
            f"Winning visual tone: {top_tone}."
        )

    do_list = winner_profile.get("do")
    if isinstance(do_list, list) and "do" in apply_set:
        do_items = [
            str(item).strip()
            for item in do_list
            if str(item).strip()
        ][:3]

        if do_items:
            constraints.append(
                "Use: " + "; ".join(do_items) + "."
            )

    avoid_list = winner_profile.get("avoid")
    if isinstance(avoid_list, list) and "avoid" in apply_set:
        avoid_items = [
            str(item).strip()
            for item in avoid_list
            if str(item).strip()
        ][:3]

        if avoid_items:
            constraints.append(
                "Avoid: " + "; ".join(avoid_items) + "."
            )

    if not constraints:
        return base_text

    return (
        f"{base_text} "
        "Winning creative direction, use only when compatible: "
        + " ".join(constraints)
    )

# ---------- Routes ----------
@router.post("/video/start-image", response_model=StartVideoResponse,)
async def start_image_video(
    req: StartImageVideoRequest,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    if req.duration > VIDEO_MAX_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=f"Max duration is {VIDEO_MAX_SECONDS}s",
        )

    # Prevent voiceover scripts that will not fit the selected duration.
    enforce_script_fits_duration(
        req.voiceoverScript,
        int(req.duration),
        bool(req.voiceover.enabled),
    )

    db = get_db()

    user_doc = (
        db.collection("users")
        .document(uid)
        .get()
        .to_dict()
        or {}
    )

    brand_kit = resolve_brand_kit(db, uid, req.brandKitId, user_doc) if req.useBrandKit else {}

    # Compact visual Brand Kit direction for Runway.
    brand_direction = compile_video_brand_direction(
        brand_kit
    )

    usage_reservation = None

    if not admin:
        tier, status = get_tier_and_status(user_doc)

        # Validate premium Winner Profile access before reserving usage.
        if (
            (req.winnerGuidance or "").strip()
            or req.winnerProfile is not None
        ):
            require_pro_or_business(tier)

        # Reserve usage only after all local entitlement checks pass.
        usage_reservation = _enforce_video_entitlements_and_increment(
            db,
            uid,
            tier,
            status,
            int(req.duration),
        )
        create_usage_notifications(
            db,
            uid,
            resource="video",
            used=int(usage_reservation.get("used") or 0),
            cap=int(usage_reservation.get("cap") or 0),
            period_key=(
                usage_reservation.get("periodKey")
                or usage_reservation.get("month")
            ),
            link="/videoads",
        )

    job_id = str(uuid.uuid4())

    job_ref = (
        db.collection("video_jobs")
        .document(job_id)
    )

    job_ref.set({
        "uid": uid,
        "createdAt": int(time.time()),
        "status": "running",
        "mode": "image",
        "duration": req.duration,
        "creditsReserved": int((usage_reservation or {}).get("creditsCharged") or 0),
        "usagePeriodKey": (usage_reservation or {}).get("periodKey"),
        "usageRefunded": False,
        "usageRefundReason": None,
        "ratio": req.ratio,
        "model": req.model,

        "voiceover": req.voiceover.model_dump(),
        "voiceoverScript": (
            (req.voiceoverScript or "").strip()
            or None
        ),

        # Original user inputs.
        "promptText": req.promptText,
        "promptImageUrl": req.promptImageUrl,
        "useBrandKit": req.useBrandKit,
        "brandKitId": req.brandKitId,

        # Runway task fields.
        "runwayVideoTaskId": None,
        "runwayTtsTaskId": None,

        # Final output.
        "finalVideoUrl": None,
        "error": None,
        **progress_payload("building_prompt"),
        "progressUpdatedAt": int(time.time()),

        # Legacy winner guidance.
        "winnerGuidance": (
            (req.winnerGuidance or "").strip()
            or None
        ),

        # Structured winner guidance.
        "winnerProfile": req.winnerProfile or None,
        "winnersApply": req.winnersApply or None,
        "winnersInfluence": (
            req.winnersInfluence
            if req.winnersInfluence is not None
            else None
        ),
    })

    # Build concise image-to-video motion prompt.
    prompt_text = build_image_director_prompt(
        req,
        brand_kit_context=brand_direction,
    )

    # Apply structured Winner Profile guidance when selected.
    if req.winnerProfile is not None:
        prompt_text = inject_winners_structured(
            prompt_text,
            req.winnerProfile,
            req.winnersApply,
            req.winnersInfluence,
        )

    # Backward-compatible legacy winner guidance.
    elif (req.winnerGuidance or "").strip():
        legacy_guidance = " ".join(
            (req.winnerGuidance or "").split()
        )

        if legacy_guidance:
            prompt_text = (
                f"{prompt_text} "
                "Past winning direction, use only when compatible: "
                f"{legacy_guidance[:180]}"
            )

    # Runway promptText has a hard 1,000-character limit.
    prompt_text = trim_video_prompt(
        prompt_text,
        1000,
    )

    if len(prompt_text) > 800:
        print(
            "[Image Prompt Warning] "
            f"Long prompt: {len(prompt_text)} characters"
        )

    print(
        f"[Image Director Prompt] "
        f"{len(prompt_text)} chars\n"
        f"{prompt_text}\n"
    )

    # Save the exact prompt sent to Runway.
    job_ref.update({
        "promptTextFinal": prompt_text,
        "brandDirection": brand_direction or None,
    })
    set_video_progress(job_ref, "submitting_to_runway")

    # Only this call is eligible for an automatic usage refund.
    try:
        runway_task_id = await create_image_to_video(
            prompt_image=req.promptImageUrl,
            prompt_text=prompt_text,
            model=req.model,
            ratio=req.ratio,
            duration=int(req.duration),
        )

    except RunwayError as e:
        if not admin and usage_reservation:
            refunded = refund_video_usage_once(
                db,
                job_ref,
                uid,
                reason="image_submission_failure",
                fallback_credits=int(
                    usage_reservation.get("creditsCharged") or 1
                ),
                fallback_period_key=usage_reservation.get("periodKey"),
            )

            print(
                "[Video Usage Refund] "
                f"mode=image uid={uid} refunded={refunded}"
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
            **progress_payload("failed"),
        })

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    except Exception as e:
        if not admin and usage_reservation:
            refunded = refund_video_usage_once(
                db,
                job_ref,
                uid,
                reason="image_submission_failure",
                fallback_credits=int(
                    usage_reservation.get("creditsCharged") or 1
                ),
                fallback_period_key=usage_reservation.get("periodKey"),
            )

            print(
                "[Video Usage Refund] "
                f"mode=image uid={uid} refunded={refunded}"
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
            **progress_payload("failed"),
        })

        raise HTTPException(
            status_code=500,
            detail="Failed to start image video job.",
        )


    # From this point forward, Runway accepted the video job.
    # Do not refund usage after this line.
    job_ref.update({
        "runwayVideoTaskId": runway_task_id,
    })
    set_video_progress(job_ref, "waiting_for_runway")


    try:
        if (
            bool(req.voiceover.enabled)
            and (req.voiceoverScript or "").strip()
        ):
            runway_tts_id = await create_text_to_speech(
                prompt_text=(
                    req.voiceoverScript or ""
                ).strip(),
                preset_voice=safe_voice(
                    req.voiceover.presetVoice
                ),
            )

            job_ref.update({
                "runwayTtsTaskId": runway_tts_id,
            })

        return StartVideoResponse(
            jobId=job_id,
            status="running",
            **progress_payload("waiting_for_runway"),
        )

    except RunwayError as e:
        if not admin and usage_reservation:
            refund_video_usage_once(
                db,
                job_ref,
                uid,
                reason="post_accept_voiceover_failure",
                fallback_credits=int(
                    usage_reservation.get("creditsCharged") or 1
                ),
                fallback_period_key=usage_reservation.get("periodKey"),
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
            **progress_payload("failed"),
        })

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    except Exception as e:
        if not admin and usage_reservation:
            refund_video_usage_once(
                db,
                job_ref,
                uid,
                reason="post_accept_internal_failure",
                fallback_credits=int(
                    usage_reservation.get("creditsCharged") or 1
                ),
                fallback_period_key=usage_reservation.get("periodKey"),
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
            **progress_payload("failed"),
        })

        raise HTTPException(
            status_code=500,
            detail="Failed after the image video task was accepted.",
        )


@router.post("/video/start-prompt", response_model=StartVideoResponse,)
async def start_prompt_video(
    req: StartPromptVideoRequest,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    if req.duration > VIDEO_MAX_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=f"Max duration is {VIDEO_MAX_SECONDS}s",
        )

    # Prevent voiceover scripts that will not fit the selected duration.
    enforce_script_fits_duration(
        req.voiceoverScript,
        int(req.duration),
        bool(req.voiceover.enabled),
    )

    db = get_db()

    user_doc = (
        db.collection("users")
        .document(uid)
        .get()
        .to_dict()
        or {}
    )

    brand_kit = resolve_brand_kit(db, uid, req.brandKitId, user_doc) if req.useBrandKit else {}

    # Compact visual Brand Kit direction for Runway.
    brand_direction = compile_video_brand_direction(
        brand_kit
    )

    usage_reservation = None

    if not admin:
        tier, status = get_tier_and_status(user_doc)

        # Validate premium Winner Profile access before reserving usage.
        if (
            (req.winnerGuidance or "").strip()
            or req.winnerProfile is not None
        ):
            require_pro_or_business(tier)

        # Reserve usage only after all local entitlement checks pass.
        usage_reservation = _enforce_video_entitlements_and_increment(
            db,
            uid,
            tier,
            status,
            int(req.duration),
        )
        create_usage_notifications(
            db,
            uid,
            resource="video",
            used=int(usage_reservation.get("used") or 0),
            cap=int(usage_reservation.get("cap") or 0),
            period_key=(
                usage_reservation.get("periodKey")
                or usage_reservation.get("month")
            ),
            link="/videoads",
        )

    # Build concise prompt-to-video creative direction.
    director_prompt = build_director_prompt(
        req,
        brand_kit_context=brand_direction,
    )

    # Apply structured Winner Profile guidance when selected.
    if req.winnerProfile is not None:
        director_prompt = inject_winners_structured(
            director_prompt,
            req.winnerProfile,
            req.winnersApply,
            req.winnersInfluence,
        )

    # Backward-compatible legacy winner guidance.
    elif (req.winnerGuidance or "").strip():
        legacy_guidance = " ".join(
            (req.winnerGuidance or "").split()
        )

        if legacy_guidance:
            director_prompt = (
                f"{director_prompt} "
                "Past winning direction, use only when compatible: "
                f"{legacy_guidance[:180]}"
            )

    # Runway promptText has a hard 1,000-character limit.
    director_prompt = trim_video_prompt(
        director_prompt,
        1000,
    )

    if len(director_prompt) > 800:
        print(
            "[Director Prompt Warning] "
            f"Long prompt: {len(director_prompt)} characters"
        )

    print(
        f"[Director Prompt] "
        f"{len(director_prompt)} chars\n"
        f"{director_prompt}\n"
    )

    job_id = str(uuid.uuid4())

    job_ref = (
        db.collection("video_jobs")
        .document(job_id)
    )

    job_ref.set({
        "uid": uid,
        "createdAt": int(time.time()),
        "status": "running",
        "mode": "prompt",
        "duration": req.duration,
        "creditsReserved": int((usage_reservation or {}).get("creditsCharged") or 0),
        "usagePeriodKey": (usage_reservation or {}).get("periodKey"),
        "usageRefunded": False,
        "usageRefundReason": None,
        "ratio": req.ratio,
        "model": req.model,

        "voiceover": req.voiceover.model_dump(),
        "voiceoverScript": (
            (req.voiceoverScript or "").strip()
            or None
        ),

        # Core creative request.
        "productName": req.productName,
        "description": req.description,
        "offer": req.offer,
        "audience": req.audience,
        "tone": req.tone,
        "platform": req.platform,

        # Structured creative controls.
        "goal": req.goal,
        "hookStyle": req.hookStyle,
        "sceneStyle": req.sceneStyle,
        "cameraMotion": req.cameraMotion,
        "lightingStyle": req.lightingStyle,
        "pace": req.pace,
        "callToAction": req.callToAction,
        "fullCreativeDirection": (
            req.fullCreativeDirection
            or None
        ),
        "userPrompt": req.userPrompt or None,

        # Brand configuration.
        "useBrandKit": req.useBrandKit,
        "brandKitId": req.brandKitId,
        "brandDirection": brand_direction or None,

        # Exact prompt sent to Runway.
        "directorPrompt": director_prompt,

        # Runway task fields.
        "runwayVideoTaskId": None,
        "runwayTtsTaskId": None,

        # Final output.
        "finalVideoUrl": None,
        "error": None,
        **progress_payload("building_prompt"),
        "progressUpdatedAt": int(time.time()),

        # Legacy winner guidance.
        "winnerGuidance": (
            (req.winnerGuidance or "").strip()
            or None
        ),

        # Structured winner guidance.
        "winnerProfile": req.winnerProfile or None,
        "winnersApply": req.winnersApply or None,
        "winnersInfluence": (
            req.winnersInfluence
            if req.winnersInfluence is not None
            else None
        ),
    })

    # Only this call is eligible for an automatic usage refund.
    set_video_progress(job_ref, "submitting_to_runway")
    try:
        runway_task_id = await create_text_to_video(
            prompt_text=director_prompt,
            model=req.model,
            ratio=req.ratio,
            duration=int(req.duration),
        )

    except RunwayError as e:
        if not admin and usage_reservation:
            refunded = refund_video_usage_once(
                db,
                job_ref,
                uid,
                reason="prompt_submission_failure",
                fallback_credits=int(
                    usage_reservation.get("creditsCharged") or 1
                ),
                fallback_period_key=usage_reservation.get("periodKey"),
            )

            print(
                "[Video Usage Refund] "
                f"mode=prompt uid={uid} refunded={refunded}"
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
            **progress_payload("failed"),
        })

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    except Exception as e:
        if not admin and usage_reservation:
            refunded = refund_video_usage_once(
                db,
                job_ref,
                uid,
                reason="prompt_submission_failure",
                fallback_credits=int(
                    usage_reservation.get("creditsCharged") or 1
                ),
                fallback_period_key=usage_reservation.get("periodKey"),
            )

            print(
                "[Video Usage Refund] "
                f"mode=prompt uid={uid} refunded={refunded}"
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
            **progress_payload("failed"),
        })

        raise HTTPException(
            status_code=500,
            detail="Failed to start video job.",
        )


    # From this point forward, Runway accepted the video job.
    # Do not refund usage after this line.
    job_ref.update({
        "runwayVideoTaskId": runway_task_id,
    })
    set_video_progress(job_ref, "waiting_for_runway")


    try:
        if (
            bool(req.voiceover.enabled)
            and (req.voiceoverScript or "").strip()
        ):
            runway_tts_id = await create_text_to_speech(
                prompt_text=(
                    req.voiceoverScript or ""
                ).strip(),
                preset_voice=safe_voice(
                    req.voiceover.presetVoice
                ),
            )

            job_ref.update({
                "runwayTtsTaskId": runway_tts_id,
            })

        return StartVideoResponse(
            jobId=job_id,
            status="running",
            **progress_payload("waiting_for_runway"),
        )

    except RunwayError as e:
        if not admin and usage_reservation:
            refund_video_usage_once(
                db,
                job_ref,
                uid,
                reason="post_accept_voiceover_failure",
                fallback_credits=int(
                    usage_reservation.get("creditsCharged") or 1
                ),
                fallback_period_key=usage_reservation.get("periodKey"),
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
            **progress_payload("failed"),
        })

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    except Exception as e:
        if not admin and usage_reservation:
            refund_video_usage_once(
                db,
                job_ref,
                uid,
                reason="post_accept_internal_failure",
                fallback_credits=int(
                    usage_reservation.get("creditsCharged") or 1
                ),
                fallback_period_key=usage_reservation.get("periodKey"),
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
            **progress_payload("failed"),
        })

        raise HTTPException(
            status_code=500,
            detail="Failed after the video task was accepted.",
        )



async def finalize_video_job(job_id: str, uid: str) -> None:
    """Finalize a completed Runway task while status polling remains responsive."""
    db = get_db()
    job_ref = db.collection("video_jobs").document(job_id)
    job = job_ref.get().to_dict() or {}

    try:
        runway_video_task_id = job.get("runwayVideoTaskId")
        task = await get_task(runway_video_task_id)
        runway_video_url = extract_first_output_url(task)
        if not runway_video_url:
            raise RuntimeError("Runway succeeded but output URL is missing.")

        set_video_progress(job_ref, "processing_video", finalizationState="running")

        with tempfile.TemporaryDirectory() as td:
            raw_video = os.path.join(td, "runway_raw.mp4")
            await download_to_file(runway_video_url, raw_video)

            normalized_video = os.path.join(td, "runway_norm.mp4")
            await asyncio.to_thread(
                normalize_video_with_ffmpeg,
                raw_video,
                normalized_video,
            )

            target_seconds = int(job.get("duration") or 6)
            enforced_video = os.path.join(td, "runway_enforced.mp4")
            await asyncio.to_thread(
                enforce_exact_duration,
                normalized_video,
                enforced_video,
                target_seconds,
            )
            final_path = enforced_video

            vo_cfg = job.get("voiceover") or {}
            if vo_cfg.get("enabled"):
                set_video_progress(job_ref, "generating_voiceover")
                script = (job.get("voiceoverScript") or "").strip()
                if not script:
                    raise RuntimeError("Voiceover enabled but voiceoverScript is empty.")

                enforce_script_fits_duration(script, target_seconds, True)
                tts_task_id = job.get("runwayTtsTaskId")
                if not tts_task_id:
                    tts_task_id = await create_text_to_speech(
                        prompt_text=script,
                        preset_voice=safe_voice(vo_cfg.get("presetVoice")),
                    )
                    job_ref.update({"runwayTtsTaskId": tts_task_id})

                tts_task = None
                for _ in range(120):
                    tts_task = await get_task(tts_task_id)
                    tts_status = tts_task.get("status")
                    if tts_status == "SUCCEEDED":
                        break
                    if tts_status in ("FAILED", "CANCELED"):
                        raise RuntimeError(
                            tts_task.get("error")
                            or tts_task.get("failureReason")
                            or "Voiceover generation failed."
                        )
                    await asyncio.sleep(1)
                else:
                    raise RuntimeError("Voiceover generation timed out.")

                tts_url = extract_first_output_url(tts_task or {})
                if not tts_url:
                    raise RuntimeError("TTS succeeded but output URL is missing.")

                audio_path = os.path.join(td, "voice.mp3")
                await download_to_file(tts_url, audio_path)

                set_video_progress(job_ref, "mixing_audio")
                muxed = os.path.join(td, "final_muxed.mp4")
                await asyncio.to_thread(
                    mux_voiceover,
                    enforced_video,
                    audio_path,
                    muxed,
                )
                final_path = muxed

            with open(final_path, "rb") as f:
                data = f.read()

            set_video_progress(job_ref, "uploading_video")
            latest_job = job_ref.get().to_dict() or job
            tier, _status = get_tier_and_status(
                db.collection("users").document(uid).get().to_dict() or {}
            )
            ensure_storage_available(
                db,
                uid,
                tier,
                len(data),
            )
            stored = upload_bytes_to_firebase_storage_with_metadata(
                data, uid, content_type="video/mp4", folder="video_ads", filename_hint="video.mp4"
            )
            final_url = stored["url"]

            set_video_progress(job_ref, "saving_library")
            register_storage_asset(
                db,
                uid,
                size_bytes=stored["fileSizeBytes"],
                asset_type="video",
            )

            job_ref.update({
                "status": "succeeded",
                "finalVideoUrl": final_url,
                "error": None,
                "finalizationState": "complete",
                **progress_payload("succeeded"),
                "progressUpdatedAt": int(time.time()),
                "storagePath": stored["storagePath"],
                "fileSizeBytes": stored["fileSizeBytes"],
                "contentType": stored.get("contentType") or "video/mp4",
            })

            product_name = (
                job.get("productName")
                or job.get("description")
                or "Your creative"
            )

            create_notification(
                db,
                uid,
                event_key=f"video_ready_{job_id}",
                title="Your video is ready",
                body=f"{str(product_name)[:80]} has finished generating and is available in your Library.",
                notification_type="video_ready",
                link="/library",
                metadata={
                    "jobId": job_id,
                    "finalVideoUrl": final_url,
                },
            )

    except Exception as exc:
        refund_succeeded = refund_video_usage_once(
            db,
            job_ref,
            uid,
            reason="finalization_failure",
        )

        job_ref.update({
            "status": "failed",
            "error": str(exc),
            "finalizationState": "failed",
            **progress_payload("failed"),
            "progressUpdatedAt": int(time.time()),
        })

        create_notification(
            db,
            uid,
            event_key=f"video_failed_{job_id}",
            title="Video generation failed",
            body=(
                "Your video could not be completed. The video credits used "
                "for this attempt have been returned to your account."
                if refund_succeeded
                else
                "Your video could not be completed. Review the request and try again."
            ),
            notification_type="generation_failed",
            link="/videoads",
            metadata={
                "jobId": job_id,
                "error": str(exc)[:300],
                "creditsRefunded": int(
                    (job_ref.get().to_dict() or {}).get("creditsReserved") or 0
                ) if refund_succeeded else 0,
            },
        )


@router.get("/video/status/{job_id}", response_model=VideoStatusResponse)
async def video_status(job_id: str, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    job_ref = db.collection("video_jobs").document(job_id)
    job = job_ref.get().to_dict()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if not admin and job.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    if job.get("status") == "succeeded" and job.get("finalVideoUrl"):
        return VideoStatusResponse(
            jobId=job_id, status="succeeded", finalVideoUrl=job["finalVideoUrl"],
            progressStage=job.get("progressStage") or "succeeded",
            progressMessage=job.get("progressMessage") or VIDEO_PROGRESS["succeeded"][1],
            progressPercent=job.get("progressPercent") or 100,
        )
    if job.get("status") in ("failed", "canceled"):
        return VideoStatusResponse(
            jobId=job_id, status=job.get("status", "failed"), error=job.get("error"),
            progressStage=job.get("progressStage") or "failed",
            progressMessage=job.get("progressMessage") or VIDEO_PROGRESS["failed"][1],
            progressPercent=job.get("progressPercent") or 100,
        )

    runway_video_task_id = job.get("runwayVideoTaskId")
    if not runway_video_task_id:
        return VideoStatusResponse(
            jobId=job_id, status=job.get("status", "running"),
            progressStage=job.get("progressStage") or "queued",
            progressMessage=job.get("progressMessage") or VIDEO_PROGRESS["queued"][1],
            progressPercent=job.get("progressPercent") or VIDEO_PROGRESS["queued"][0],
        )

    try:
        task = await get_task(runway_video_task_id)

    except (RunwayError, Exception) as exc:
        error_message = str(exc)

        refund_video_usage_once(
            db,
            job_ref,
            uid,
            reason="status_check_failure",
        )

        job_ref.update({
            "status": "failed",
            "error": error_message,
            **progress_payload("failed"),
            "progressUpdatedAt": int(time.time()),
        })

        create_notification(
            db,
            uid,
            event_key=f"video_failed_{job_id}",
            title="Video generation failed",
            body=(
                "The video service could not complete your request. "
                "Review the creative direction and try again."
            ),
            notification_type="generation_failed",
            link="/videoads",
            metadata={
                "jobId": job_id,
                "error": error_message[:300],
            },
        )

        return VideoStatusResponse(
            jobId=job_id,
            status="failed",
            error=error_message,
            **progress_payload("failed"),
        )

    st = task.get("status")

    if st == "SUCCEEDED":
        latest = job_ref.get().to_dict() or job
        finalization_state = latest.get("finalizationState")

        if finalization_state not in {"running", "complete"}:
            set_video_progress(job_ref, "processing_video", finalizationState="running")
            asyncio.create_task(finalize_video_job(job_id, uid))
            latest = job_ref.get().to_dict() or latest

        return VideoStatusResponse(
            jobId=job_id,
            status="running",
            progressStage=latest.get("progressStage") or "processing_video",
            progressMessage=latest.get("progressMessage") or VIDEO_PROGRESS["processing_video"][1],
            progressPercent=latest.get("progressPercent") or VIDEO_PROGRESS["processing_video"][0],
        )

    if st in ("FAILED", "CANCELED"):
        refund_video_usage_once(
            db,
            job_ref,
            uid,
            reason="provider_generation_failure",
        )

        err = (
            task.get("error")
            or task.get("failureReason")
            or "Runway task failed."
        )

        job_ref.update({
            "status": "failed",
            "error": err,
            **progress_payload("failed"),
        })

        create_notification(
            db,
            uid,
            event_key=f"video_failed_{job_id}",
            title="Video generation failed",
            body=(
                "The video service could not complete your request. "
                "Review the creative direction and try again."
            ),
            notification_type="generation_failed",
            link="/videoads",
            metadata={
                "jobId": job_id,
                "error": str(err)[:300],
            },
        )

        return VideoStatusResponse(
            jobId=job_id,
            status="failed",
            error=err,
            **progress_payload("failed"),
        )

    refreshed = job_ref.get().to_dict() or job
    return VideoStatusResponse(
        jobId=job_id, status="running",
        progressStage=refreshed.get("progressStage") or "waiting_for_runway",
        progressMessage=refreshed.get("progressMessage") or VIDEO_PROGRESS["waiting_for_runway"][1],
        progressPercent=refreshed.get("progressPercent") or VIDEO_PROGRESS["waiting_for_runway"][0],
    )


@router.post("/video/tts/preview", response_model=TTSPreviewResponse)
async def tts_preview(req: TTSPreviewRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Missing 'text'.")

    voice = safe_voice(req.presetVoice)
    month_key = utc_month_key()
    cache_key = _sha256(f"{uid}|{month_key}|{voice}|{text}")

    cache_ref = db.collection("tts_preview_cache").document(cache_key)
    cached = cache_ref.get().to_dict() or {}
    if cached.get("audioUrl"):
        return TTSPreviewResponse(audioUrl=cached["audioUrl"], cached=True)

    if not admin:
        user_doc = (db.collection("users").document(uid).get().to_dict() or {})
        tier, status = get_tier_and_status(user_doc)
        _enforce_tts_preview_caps_and_increment(db, uid, tier, status)

    try:
        tts_task_id = await create_text_to_speech(prompt_text=text, preset_voice=voice or "Leslie")
    except RunwayError as e:
        raise HTTPException(status_code=502, detail=f"text_to_speech failed: {e}")

    try:
        for _ in range(30):
            task = await get_task(tts_task_id)
            st = task.get("status")
            if st == "SUCCEEDED":
                url = extract_first_output_url(task)
                if not url:
                    raise HTTPException(status_code=502, detail="TTS succeeded but output URL missing.")

                with tempfile.TemporaryDirectory() as td:
                    audio_path = os.path.join(td, "preview.mp3")
                    await download_to_file(url, audio_path)
                    with open(audio_path, "rb") as f:
                        audio_bytes = f.read()

                audio_url = upload_bytes_to_firebase_storage(
                    audio_bytes,
                    uid,
                    content_type="audio/mpeg",
                    folder="voice_previews",
                    filename_hint="preview.mp3",
                )

                cache_ref.set({
                    "uid": uid,
                    "month": month_key,
                    "voice": voice,
                    "textHash": _sha256(text),
                    "audioUrl": audio_url,
                    "createdAt": int(time.time()),
                })

                return TTSPreviewResponse(audioUrl=audio_url, cached=False)

            if st in ("FAILED", "CANCELED"):
                err = task.get("error") or task.get("failureReason") or "TTS task failed."
                raise HTTPException(status_code=502, detail=err)

            await asyncio.sleep(1)

        raise HTTPException(status_code=504, detail="TTS preview timed out. Try again.")
    except HTTPException:
        raise
    except RunwayError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/video/jobs")
async def list_video_jobs(
    authorization: str | None = Header(default=None),
    limit: int = Query(24, ge=1, le=100),
    cursor: int | None = Query(None, description="createdAt cursor (unix seconds)"),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    q = (
        db.collection("video_jobs")
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


@router.delete("/video/jobs/{job_id}")
def delete_video_job(job_id: str, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()
    ref = db.collection("video_jobs").document(job_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Video job not found.")
    data = snap.to_dict() or {}
    if not admin and data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")
    if data.get("storageState") != "deleted":
        path = data.get("storagePath")
        if path:
            delete_firebase_storage_object(path)
        release_storage_asset(db, data.get("uid") or uid, size_bytes=int(data.get("fileSizeBytes") or 0), asset_type="video")
    ref.delete()
    return {"ok": True, "jobId": job_id}

@router.get("/video/jobs/{job_id}")
async def get_video_job(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)
    db = get_db()

    ref = db.collection("video_jobs").document(job_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Job not found.")

    data = snap.to_dict() or {}
    if not admin and data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden.")

    data["id"] = snap.id
    return data