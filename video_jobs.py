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
from admin_guard import is_admin

from fastapi import APIRouter, Header, HTTPException, Query
from google.cloud import firestore as gc_firestore

from entitlements import require_pro_or_business



# -----------------------------
# Env / defaults
# -----------------------------
VIDEO_MAX_SECONDS = int(os.getenv("VIDEO_MAX_SECONDS", "10"))

# ✅ Separate defaults so you never mix them up
VIDEO_DEFAULT_IMAGE_MODEL = os.getenv("VIDEO_DEFAULT_IMAGE_MODEL", "gen4_turbo").strip()
VIDEO_DEFAULT_TEXT_MODEL = os.getenv("VIDEO_DEFAULT_TEXT_MODEL", "veo3.1_fast").strip()

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

    if tier not in VIDEO_ALLOWED_TIERS:
        raise HTTPException(status_code=403, detail="Video ads are only available on Early Access, Pro, and Business plans.")

    if tier == "early_access" and int(duration) > 6:
        raise HTTPException(status_code=403, detail="Early Access supports 6-second videos only.")

    cap = VIDEO_CAPS.get(tier)
    if not cap:
        raise HTTPException(status_code=500, detail="Video cap configuration missing for your plan.")

    month_key = utc_month_key()
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get().to_dict() or {}

    used = int(user_doc.get("video_used", 0) or 0)
    prev_month = user_doc.get("video_month_key")
    if prev_month != month_key:
        used = 0

    if used >= cap:
        raise HTTPException(
            status_code=429,
            detail={"message": "You’ve reached your monthly video generation limit. Upgrade to continue.", "used": used, "cap": cap, "month": month_key, "upgradePath": "/account"},
        )

    user_ref.update({"video_used": used + 1, "video_month_key": month_key})
    return {"allowed": True, "used": used + 1, "cap": cap, "month": month_key}

# ---------- Request/Response models ----------
class VoiceoverConfig(BaseModel):
    enabled: bool = False
    presetVoice: str = "Leslie"

class StartImageVideoRequest(BaseModel):
    promptImageUrl: str
    duration: Literal[6, 10]
    ratio: VideoRatio = "720:1280"
    promptText: str = Field(min_length=1, max_length=1000)
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
    platform: Optional[str] = Field(default="tiktok", max_length=30)

    duration: Literal[6, 10]
    ratio: VideoRatio = "720:1280"

    userPrompt: Optional[str] = Field(default=None, max_length=1000)
    voiceoverScript: Optional[str] = Field(default=None, max_length=1200)

    # ✅ prompt/video default model (separate from image)
    model: str = VIDEO_DEFAULT_TEXT_MODEL
    voiceover: VoiceoverConfig = VoiceoverConfig()

    # legacy (keep)
    winnerGuidance: Optional[str] = Field(default=None, max_length=1200)

    # ✅ NEW: structured winners (preferred over winnerGuidance)
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

def build_director_prompt(req: StartPromptVideoRequest) -> str:
    bits = [
        "Create a short-form performance ad video.",
        f"Product: {req.productName}.",
        f"Description: {req.description}.",
    ]
    if req.offer:
        bits.append(f"Offer: {req.offer}.")
    if req.audience:
        bits.append(f"Audience: {req.audience}.")
    if req.tone:
        bits.append(f"Tone: {req.tone}.")
    if req.platform:
        bits.append(f"Platform style: {req.platform} short-form pacing.")
    bits.append("No on-screen text. No logos. Clean product-focused visuals. Strong hook pacing. Studio lighting.")
    if req.userPrompt:
        bits.append(f"Extra direction: {req.userPrompt}")
    return " ".join(bits)[:1000]

def inject_winners_structured(
    base_text: str,
    winner_profile: Optional[Dict[str, Any]],
    winners_apply: Optional[List[str]],
    winners_influence: Optional[float],
) -> str:
    """
    Injects compact, structured winners constraints (NOT a blob).
    Safe + optional. If no profile or no applicable fields, returns base_text unchanged.
    """
    if not winner_profile:
        return base_text

    # normalize apply list
    apply_set = set()
    for x in (winners_apply or []):
        if isinstance(x, str) and x.strip():
            apply_set.add(x.strip().lower())

    # parse influence (optional)
    w = "default"
    try:
        if winners_influence is not None:
            w = str(round(float(winners_influence), 2))
    except Exception:
        w = "default"

    constraints: List[str] = []

    top_platform = winner_profile.get("top_platform")
    top_ratio = winner_profile.get("top_ratio")
    top_tone = winner_profile.get("top_tone")

    if top_platform and ("platform" in apply_set):
        constraints.append(f"Optimize for platform: {top_platform}.")
    if top_ratio and ("ratio" in apply_set):
        constraints.append(f"Use aspect ratio: {top_ratio}.")
    if top_tone and ("tone" in apply_set):
        constraints.append(f"Tone: {top_tone}.")

    # optional arrays if you add them later
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

    return (
        f"{base_text}\n\n"
        f"Winners-based constraints (weight {w}): "
        + " ".join(constraints)
    )

# ---------- Routes ----------
@router.post("/video/start-image", response_model=StartVideoResponse)
async def start_image_video(req: StartImageVideoRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    if req.duration > VIDEO_MAX_SECONDS:
        raise HTTPException(status_code=400, detail=f"Max duration is {VIDEO_MAX_SECONDS}s")

    # ✅ backend safeguard: block if script won't fit
    enforce_script_fits_duration(req.voiceoverScript, int(req.duration), bool(req.voiceover.enabled))

    db = get_db()

    if not admin:
        user_doc = (db.collection("users").document(uid).get().to_dict() or {})
        tier, status = get_tier_and_status(user_doc)

        # caps/entitlements
        _enforce_video_entitlements_and_increment(db, uid, tier, status, int(req.duration))

        # ✅ winners guidance/profile is Pro/Business only
        if (req.winnerGuidance or "").strip() or (req.winnerProfile is not None):
            require_pro_or_business(tier)

    job_id = str(uuid.uuid4())
    job_ref = db.collection("video_jobs").document(job_id)
    job_ref.set({
        "uid": uid,
        "createdAt": int(time.time()),
        "status": "running",
        "mode": "image",
        "duration": req.duration,
        "ratio": req.ratio,
        "model": req.model,
        "voiceover": req.voiceover.model_dump(),
        "voiceoverScript": (req.voiceoverScript or "").strip() or None,
        "promptText": req.promptText,
        "promptImageUrl": req.promptImageUrl,
        "runwayVideoTaskId": None,
        "runwayTtsTaskId": None,
        "finalVideoUrl": None,
        "error": None,

        # Keep old field
        "winnerGuidance": (req.winnerGuidance or "").strip() or None,

        # NEW structured winners fields
        "winnerProfile": req.winnerProfile or None,
        "winnersApply": req.winnersApply or None,
        "winnersInfluence": req.winnersInfluence if req.winnersInfluence is not None else None,
    })

    # Build prompt text + inject winners structured constraints (preferred)
    prompt_text = (req.promptText or "").strip()

    if req.winnerProfile is not None:
        prompt_text = inject_winners_structured(
            prompt_text,
            req.winnerProfile,
            req.winnersApply,
            req.winnersInfluence,
        )
    elif (req.winnerGuidance or "").strip():
        # Backward-compatible old guidance blob
        g = (req.winnerGuidance or "").strip()
        prompt_text = (
            f"{prompt_text}\n\n"
            "Guidance from the user's past best-performing creatives (use lightly; do not mention metrics; do not copy verbatim):\n"
            f"{g}"
        )

    prompt_text = prompt_text[:1000]

    try:
        task = await create_image_to_video(
            image_url=req.promptImageUrl,
            prompt=prompt_text,
            model=req.model,
            ratio=req.ratio,
            duration=int(req.duration),
        )
        runway_task_id = task.get("id") or task.get("task_id")
        job_ref.update({"runwayVideoTaskId": runway_task_id})

        if bool(req.voiceover.enabled) and (req.voiceoverScript or "").strip():
            tts_task = await create_text_to_speech(
                text=(req.voiceoverScript or "").strip(),
                voice=req.voiceover.voice,
            )
            runway_tts_id = tts_task.get("id") or tts_task.get("task_id")
            job_ref.update({"runwayTtsTaskId": runway_tts_id})

        # Persist final prompt text used (optional but helpful)
        job_ref.update({"promptTextFinal": prompt_text})

        return StartVideoResponse(ok=True, jobId=job_id)

    except RunwayError as e:
        job_ref.update({"status": "failed", "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        job_ref.update({"status": "failed", "error": str(e)})
        raise HTTPException(status_code=500, detail="Failed to start image video job.")


@router.post("/video/start-prompt", response_model=StartVideoResponse)
async def start_prompt_video(req: StartPromptVideoRequest, authorization: str | None = Header(default=None)):
    uid, _email, claims = require_user(authorization)
    admin = is_admin(claims)

    if req.duration > VIDEO_MAX_SECONDS:
        raise HTTPException(status_code=400, detail=f"Max duration is {VIDEO_MAX_SECONDS}s")

    # ✅ backend safeguard: block if script won't fit
    enforce_script_fits_duration(req.voiceoverScript, int(req.duration), bool(req.voiceover.enabled))

    db = get_db()

    if not admin:
        user_doc = (db.collection("users").document(uid).get().to_dict() or {})
        tier, status = get_tier_and_status(user_doc)

        _enforce_video_entitlements_and_increment(db, uid, tier, status, int(req.duration))

        # ✅ winners guidance/profile is Pro/Business only
        if (req.winnerGuidance or "").strip() or (req.winnerProfile is not None):
            require_pro_or_business(tier)

    # ✅ Director prompt used for the actual Runway generation
    director_prompt = build_director_prompt(req)

    # ✅ NEW: structured winners (preferred)
    if req.winnerProfile is not None:
        director_prompt = inject_winners_structured(
            director_prompt,
            req.winnerProfile,
            req.winnersApply,
            req.winnersInfluence,
        )
    # ✅ Backward-compatible: old blob text still works
    elif (req.winnerGuidance or "").strip():
        g = (req.winnerGuidance or "").strip()
        director_prompt = (
            f"{director_prompt}\n\n"
            "Guidance from the user's past best-performing creatives (use lightly; do not mention metrics; do not copy verbatim):\n"
            f"{g}"
        )

    director_prompt = director_prompt[:1000]

    job_id = str(uuid.uuid4())
    job_ref = db.collection("video_jobs").document(job_id)
    job_ref.set({
        "uid": uid,
        "createdAt": int(time.time()),
        "status": "running",
        "mode": "prompt",
        "duration": req.duration,
        "ratio": req.ratio,
        "model": req.model,
        "voiceover": req.voiceover.model_dump(),
        "voiceoverScript": (req.voiceoverScript or "").strip() or None,
        "directorPrompt": director_prompt,
        "runwayVideoTaskId": None,
        "runwayTtsTaskId": None,
        "finalVideoUrl": None,
        "error": None,

        # Keep old field for compatibility / debugging
        "winnerGuidance": (req.winnerGuidance or "").strip() or None,

        # NEW structured winners fields (safe/no styling impact)
        "winnerProfile": req.winnerProfile or None,
        "winnersApply": req.winnersApply or None,
        "winnersInfluence": req.winnersInfluence if req.winnersInfluence is not None else None,
    })

    try:
        # start Runway task (UNCHANGED)
        task = await create_text_to_video(
            prompt=director_prompt,
            model=req.model,
            ratio=req.ratio,
            duration=int(req.duration),
        )
        runway_task_id = task.get("id") or task.get("task_id")

        job_ref.update({"runwayVideoTaskId": runway_task_id})

        # Kick off TTS (UNCHANGED)
        if bool(req.voiceover.enabled) and (req.voiceoverScript or "").strip():
            tts_task = await create_text_to_speech(
                text=(req.voiceoverScript or "").strip(),
                voice=req.voiceover.voice,
            )
            runway_tts_id = tts_task.get("id") or tts_task.get("task_id")
            job_ref.update({"runwayTtsTaskId": runway_tts_id})

        return StartVideoResponse(ok=True, jobId=job_id)

    except RunwayError as e:
        job_ref.update({"status": "failed", "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        job_ref.update({"status": "failed", "error": str(e)})
        raise HTTPException(status_code=500, detail="Failed to start video job.")


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