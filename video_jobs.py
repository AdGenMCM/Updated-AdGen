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

from storage_utils import upload_bytes_to_firebase_storage

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

# -----------------------------
# Video plan gating + caps
# -----------------------------
VIDEO_ALLOWED_TIERS = {"early_access", "pro_monthly", "business_monthly"}
VIDEO_CAPS = {
    "early_access": 3,
    "pro_monthly": 15,
    "business_monthly": 50,
}

TTS_PREVIEW_CAPS = {
    "early_access": 100,
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
    if tier not in VIDEO_ALLOWED_TIERS:
        raise HTTPException(status_code=403, detail="Voice preview is only available on Early Access, Pro, and Business.")

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

    if tier == "early_access" and int(duration) > 6:
        raise HTTPException(status_code=403, detail="Early Access supports 6-second videos only.")

    result = check_and_increment_video_usage(db, uid, tier)

    if not result.get("allowed"):
        reason = result.get("reason")

        if reason == "tier_not_allowed":
            raise HTTPException(
                status_code=403,
                detail="Video ads are only available on Early Access, Pro, and Business plans.",
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

class VideoStatusResponse(BaseModel):
    jobId: str
    status: str
    finalVideoUrl: Optional[str] = None
    error: Optional[str] = None

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
        "and a polished hero ending."
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

    brand_kit = (
        user_doc.get("brandKit") or {}
    ) if req.useBrandKit else {}

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

        # Runway task fields.
        "runwayVideoTaskId": None,
        "runwayTtsTaskId": None,

        # Final output.
        "finalVideoUrl": None,
        "error": None,

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
            refunded = rollback_video_usage(
                db,
                uid,
                usage_reservation.get("periodKey"),
            )

            print(
                "[Video Usage Refund] "
                f"mode=image uid={uid} refunded={refunded}"
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
        })

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    except Exception as e:
        if not admin and usage_reservation:
            refunded = rollback_video_usage(
                db,
                uid,
                usage_reservation.get("periodKey"),
            )

            print(
                "[Video Usage Refund] "
                f"mode=image uid={uid} refunded={refunded}"
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
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
        )

    except RunwayError as e:
        # No usage refund: the Runway video task already exists.
        job_ref.update({
            "status": "failed",
            "error": str(e),
        })

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    except Exception as e:
        # No usage refund: the Runway video task already exists.
        job_ref.update({
            "status": "failed",
            "error": str(e),
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

    brand_kit = (
        user_doc.get("brandKit") or {}
    ) if req.useBrandKit else {}

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
        "brandDirection": brand_direction or None,

        # Exact prompt sent to Runway.
        "directorPrompt": director_prompt,

        # Runway task fields.
        "runwayVideoTaskId": None,
        "runwayTtsTaskId": None,

        # Final output.
        "finalVideoUrl": None,
        "error": None,

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
    try:
        runway_task_id = await create_text_to_video(
            prompt_text=director_prompt,
            model=req.model,
            ratio=req.ratio,
            duration=int(req.duration),
        )

    except RunwayError as e:
        if not admin and usage_reservation:
            refunded = rollback_video_usage(
                db,
                uid,
                usage_reservation.get("periodKey"),
            )

            print(
                "[Video Usage Refund] "
                f"mode=prompt uid={uid} refunded={refunded}"
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
        })

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    except Exception as e:
        if not admin and usage_reservation:
            refunded = rollback_video_usage(
                db,
                uid,
                usage_reservation.get("periodKey"),
            )

            print(
                "[Video Usage Refund] "
                f"mode=prompt uid={uid} refunded={refunded}"
            )

        job_ref.update({
            "status": "failed",
            "error": str(e),
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
        )

    except RunwayError as e:
        # No usage refund: the video task was already accepted.
        job_ref.update({
            "status": "failed",
            "error": str(e),
        })

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    except Exception as e:
        # No usage refund: the video task was already accepted.
        job_ref.update({
            "status": "failed",
            "error": str(e),
        })

        raise HTTPException(
            status_code=500,
            detail="Failed after the video task was accepted.",
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
        return VideoStatusResponse(jobId=job_id, status="succeeded", finalVideoUrl=job["finalVideoUrl"])
    if job.get("status") in ("failed", "canceled"):
        return VideoStatusResponse(jobId=job_id, status=job.get("status", "failed"), error=job.get("error"))

    runway_video_task_id = job.get("runwayVideoTaskId")
    if not runway_video_task_id:
        return VideoStatusResponse(jobId=job_id, status=job.get("status", "running"))

    try:
        task = await get_task(runway_video_task_id)
    except RunwayError as e:
        job_ref.update({"status": "failed", "error": str(e)})
        return VideoStatusResponse(jobId=job_id, status="failed", error=str(e))
    except Exception as e:
        job_ref.update({"status": "failed", "error": str(e)})
        return VideoStatusResponse(jobId=job_id, status="failed", error=str(e))

    st = task.get("status")

    if st == "SUCCEEDED":
        runway_video_url = extract_first_output_url(task)
        if not runway_video_url:
            job_ref.update({"status": "failed", "error": "Runway succeeded but output URL missing."})
            return VideoStatusResponse(jobId=job_id, status="failed", error="Missing output URL")

        try:
            with tempfile.TemporaryDirectory() as td:
                raw_video = os.path.join(td, "runway_raw.mp4")
                await download_to_file(runway_video_url, raw_video)

                normalized_video = os.path.join(td, "runway_norm.mp4")
                normalize_video_with_ffmpeg(raw_video, normalized_video)

                target_seconds = int(job.get("duration") or 6)
                enforced_video = os.path.join(td, "runway_enforced.mp4")
                enforce_exact_duration(normalized_video, enforced_video, target_seconds)

                final_path = enforced_video

                vo_cfg = job.get("voiceover") or {}
                if vo_cfg.get("enabled"):
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

                    tts_task = await get_task(tts_task_id)
                    if tts_task.get("status") != "SUCCEEDED":
                        return VideoStatusResponse(jobId=job_id, status="running")

                    tts_url = extract_first_output_url(tts_task)
                    if not tts_url:
                        raise RuntimeError("TTS succeeded but output URL missing.")

                    audio_path = os.path.join(td, "voice.mp3")
                    await download_to_file(tts_url, audio_path)

                    muxed = os.path.join(td, "final_muxed.mp4")
                    mux_voiceover(enforced_video, audio_path, muxed)
                    final_path = muxed

                with open(final_path, "rb") as f:
                    data = f.read()

                final_url = upload_bytes_to_firebase_storage(
                    data,
                    uid,
                    content_type="video/mp4",
                    folder="video_ads",
                    filename_hint="video.mp4",
                )

                job_ref.update({"status": "succeeded", "finalVideoUrl": final_url, "error": None})
                return VideoStatusResponse(jobId=job_id, status="succeeded", finalVideoUrl=final_url)

        except Exception as e:
            job_ref.update({"status": "failed", "error": str(e)})
            return VideoStatusResponse(jobId=job_id, status="failed", error=str(e))

    if st in ("FAILED", "CANCELED"):
        err = task.get("error") or task.get("failureReason") or "Runway task failed."
        job_ref.update({"status": "failed", "error": err})
        return VideoStatusResponse(jobId=job_id, status="failed", error=err)

    return VideoStatusResponse(jobId=job_id, status="running")


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