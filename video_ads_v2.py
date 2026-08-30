from __future__ import annotations

import asyncio
import io
import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from openai import OpenAI
from PIL import Image, ImageDraw, ImageFont

from auth_helpers import get_db, require_user
from admin_guard import is_admin
from usage_caps import get_tier_and_status
from video_usage import check_and_increment_video_usage, rollback_video_usage
from video_safety import (
    moderate_video_request,
    require_active_account,
    require_no_active_video_job,
    enforce_user_submission_window,
    rollback_user_submission_window,
)
from storage_utils import upload_bytes_to_firebase_storage_with_metadata
from storage_tracking import ensure_storage_available, register_storage_asset
from brand_kits import resolve_brand_kit
from performance_intelligence.service import generation_profile as get_intelligence_generation_profile
from video_jobs import compile_video_brand_direction, compact_video_intelligence

router = APIRouter(prefix="/video-v2", tags=["video-v2"])

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_TEXT_MODEL = (os.getenv("OPENAI_TEXT_MODEL") or "gpt-5.5").strip()
OPENAI_TTS_MODEL = (os.getenv("OPENAI_TTS_MODEL") or "gpt-4o-mini-tts").strip()
FAL_KEY = (os.getenv("FAL_KEY") or "").strip()
FAL_KLING_I2V = (os.getenv("FAL_KLING_I2V_MODEL") or "fal-ai/kling-video/v3/pro/image-to-video").strip()
FAL_KLING_T2V = (os.getenv("FAL_KLING_T2V_MODEL") or "fal-ai/kling-video/v3/pro/text-to-video").strip()

FULL_AD_CREDITS = {10: 3, 15: 4}
FULL_LAYOUTS = {10: [3, 3, 4], 15: [4, 4, 4, 3]}
QUICK_CREDITS = {6: 1, 10: 2}
NEGATIVE_PROMPT = (
    "extra fingers, malformed hands, fused fingers, missing fingers, distorted hands, "
    "deformed face, warped mouth, duplicate limbs, exaggerated facial expressions, excessive gestures, "
    "unnatural head movement, head bobbing, jitter, flicker, blur, low quality, unreadable product label"
)

# Voice names remain stable in the UI. Character Dialogue is generated natively by
# Kling; these descriptors give the selected profile a repeatable vocal target.
CHARACTER_VOICE_PROFILES = {
    ("female", "natural"): "natural adult female voice, conversational and believable delivery",
    ("female", "warm"): "warm adult female voice, friendly premium commercial delivery",
    ("female", "confident"): "confident adult female voice, polished modern commercial delivery",
    ("male", "natural"): "natural adult male voice, conversational and believable delivery",
    ("male", "warm"): "warm adult male voice, friendly premium commercial delivery",
    ("male", "confident"): "confident adult male voice, polished modern commercial delivery",
}
NARRATOR_OPENAI_VOICES = {
    "Leslie": "marin",
    "Maya": "coral",
    "Mark": "cedar",
    "Rachel": "shimmer",
    "Benjamin": "onyx",
    "Ella": "nova",
}

RATIO_TO_KLING = {
    "720:1280": "9:16", "1080:1920": "9:16",
    "1280:720": "16:9", "1920:1080": "16:9",
    "1080:1080": "1:1", "960:960": "1:1", "1440:1440": "1:1",
}

CAMPAIGN_STRUCTURES = {
    "product": ["Hook", "Product", "Demo", "CTA"],
    "service": ["Hook", "Problem", "Service", "CTA"],
    "software": ["Hook", "Problem", "Interface", "CTA"],
    "real_estate": ["Hook", "Property", "Feature", "CTA"],
    "restaurant": ["Hook", "Experience", "Feature", "CTA"],
    "event": ["Hook", "Experience", "Offer", "CTA"],
    "promotion": ["Hook", "Offer", "Benefit", "CTA"],
    "brand": ["Hook", "Lifestyle", "Brand", "CTA"],
    "other": ["Hook", "Solution", "Benefit", "CTA"],
}


class StoryboardScene(BaseModel):
    id: str
    title: str = Field(max_length=80)
    purpose: str = Field(max_length=120)
    duration: int = Field(ge=1, le=15)
    visualPrompt: str = Field(min_length=3, max_length=1200)
    voiceover: Optional[str] = Field(default=None, max_length=180)
    dialogue: Optional[str] = Field(default=None, max_length=140)
    actionWhileSpeaking: Optional[str] = Field(default=None, max_length=320)
    performanceMode: Literal["speaking", "silent", "no_person"] = "no_person"
    performanceBeat: Optional[str] = Field(default=None, max_length=420)
    caption: Optional[str] = Field(default=None, max_length=120)


class Storyboard(BaseModel):
    conceptTitle: str = Field(max_length=100)
    conceptSummary: str = Field(max_length=500)
    continuity: str = Field(max_length=800)
    scenes: List[StoryboardScene]
    voiceoverScript: Optional[str] = Field(default=None, max_length=2400)


class FullAdBrief(BaseModel):
    companyName: Optional[str] = Field(default=None, max_length=120)
    campaignType: str = Field(default="product", max_length=60)
    subjectName: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=4000)
    audience: Optional[str] = Field(default=None, max_length=800)
    offer: Optional[str] = Field(default=None, max_length=400)
    goal: Optional[str] = Field(default="conversions", max_length=80)
    platform: Optional[str] = Field(default="TikTok / Reels / Shorts", max_length=100)
    visualStyle: Optional[str] = Field(default="lifestyle", max_length=100)
    tone: Optional[str] = Field(default="confident", max_length=100)
    callToAction: Optional[str] = Field(default=None, max_length=180)
    creativeDirection: Optional[str] = Field(default=None, max_length=2400)
    duration: Literal[10, 15] = 15
    ratio: str = "720:1280"
    referenceImageUrl: Optional[str] = None
    useBrandKit: bool = True
    brandKitId: Optional[str] = None
    usePerformanceIntelligence: bool = False
    voiceMode: Literal["none", "voiceover", "character_dialogue"] = "voiceover"
    presetVoice: str = Field(default="Leslie", max_length=80)
    characterVoice: str = Field(default="natural_female", max_length=80)
    characterGender: Literal["female", "male"] = "female"
    musicAndEffects: bool = True
    captions: bool = True
    endCard: bool = True


class StoryboardRequest(FullAdBrief): pass
class StartFullAdRequest(FullAdBrief): storyboard: Storyboard

class StartFullAdResponse(BaseModel):
    jobId: str
    status: str
    creditsCharged: int

class FullAdStatusResponse(BaseModel):
    jobId: str
    status: str
    phase: str
    progressPercent: int
    progressMessage: str
    finalVideoUrl: Optional[str] = None
    visualMasterUrl: Optional[str] = None
    scenes: List[Dict[str, Any]] = []
    error: Optional[str] = None

class VoiceoverConfig(BaseModel):
    enabled: bool = False
    presetVoice: str = "Leslie"

class AudioConfig(BaseModel):
    voiceMode: Literal["none", "voiceover", "character_dialogue"] = "none"
    characterVoice: str = "natural_female"
    characterGender: Literal["female", "male"] = "female"
    characterAction: Optional[str] = Field(default=None, max_length=500)
    musicAndEffects: bool = False

class StartImageVideoRequest(BaseModel):
    companyName: Optional[str] = Field(default=None, max_length=120)
    promptImageUrl: str
    duration: Literal[6, 10]
    ratio: str = "720:1280"
    promptText: str = Field(min_length=1, max_length=1600)
    useBrandKit: bool = True
    brandKitId: Optional[str] = None
    voiceoverScript: Optional[str] = Field(default=None, max_length=1200)
    model: Optional[str] = None
    voiceover: VoiceoverConfig = VoiceoverConfig()
    audio: AudioConfig = AudioConfig()
    usePerformanceIntelligence: bool = False
    winnerGuidance: Optional[str] = Field(default=None, max_length=1200)
    winnerProfile: Optional[Dict[str, Any]] = None
    winnersApply: Optional[List[str]] = None
    winnersInfluence: Optional[float] = 0.5

class StartPromptVideoRequest(BaseModel):
    companyName: Optional[str] = Field(default=None, max_length=120)
    productName: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1800)
    offer: Optional[str] = Field(default=None, max_length=200)
    audience: Optional[str] = Field(default=None, max_length=240)
    tone: Optional[str] = Field(default=None, max_length=100)
    platform: Optional[str] = Field(default="TikTok / Reels / Shorts", max_length=100)
    goal: Optional[str] = Field(default=None, max_length=60)
    hookStyle: Optional[str] = Field(default=None, max_length=80)
    sceneStyle: Optional[str] = Field(default=None, max_length=80)
    cameraMotion: Optional[str] = Field(default=None, max_length=80)
    lightingStyle: Optional[str] = Field(default=None, max_length=80)
    pace: Optional[str] = Field(default=None, max_length=80)
    callToAction: Optional[str] = Field(default=None, max_length=160)
    controlOverrides: Optional[List[str]] = None
    fullCreativeDirection: Optional[str] = Field(default=None, max_length=1400)
    duration: Literal[6, 10]
    ratio: str = "720:1280"
    userPrompt: Optional[str] = Field(default=None, max_length=1200)
    useBrandKit: bool = True
    brandKitId: Optional[str] = None
    voiceoverScript: Optional[str] = Field(default=None, max_length=1200)
    model: Optional[str] = None
    voiceover: VoiceoverConfig = VoiceoverConfig()
    audio: AudioConfig = AudioConfig()
    usePerformanceIntelligence: bool = False
    winnerGuidance: Optional[str] = Field(default=None, max_length=1200)
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


def _clean(text: Any, limit: int = 2500) -> str:
    value = " ".join(str(text or "").split()).strip()
    if len(value) <= limit: return value
    cut = value[:limit].rstrip()
    sentence = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"))
    return (cut[:sentence+1] if sentence > limit * .55 else cut.rsplit(" ", 1)[0]).strip()


def _json_from_text(text: str) -> Dict[str, Any]:
    raw=(text or "").strip()
    if raw.startswith("```"):
        raw=re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
        raw=re.sub(r"\s*```$", "", raw)
    a,b=raw.find("{"),raw.rfind("}")
    if a>=0 and b>a: raw=raw[a:b+1]
    return json.loads(raw)


def _layout(duration:int)->List[int]: return list(FULL_LAYOUTS[int(duration)])
def _full_credits(duration:int)->int: return FULL_AD_CREDITS[int(duration)]
def _quick_credits(duration:int)->int: return QUICK_CREDITS[int(duration)]
def _kling_ratio(ratio:str)->str: return RATIO_TO_KLING.get(str(ratio), "9:16")


def _campaign_roles(campaign_type:str, count:int)->List[str]:
    base=list(CAMPAIGN_STRUCTURES.get(str(campaign_type or "other"), CAMPAIGN_STRUCTURES["other"]))
    if count==3: return [base[0], base[1], base[-1]]
    if count==4: return base
    return (base+["CTA"]*count)[:count]


def _reserve(db, uid:str, tier:str, credits:int)->Dict[str,Any]:
    result=check_and_increment_video_usage(db, uid, tier, credits)
    if not result.get("allowed"):
        raise HTTPException(status_code=429, detail={"message":"You do not have enough video credits for this generation.","used":result.get("used"),"cap":result.get("cap"),"required":credits})
    result["creditsCharged"]=credits
    return result


def _refund_once(db, ref, job:Dict[str,Any], reason:str)->bool:
    if job.get("usageRefunded"): return True
    credits=int(job.get("creditsReserved") or 0); period=job.get("usagePeriodKey")
    if credits<=0 or not period: return False
    ok=rollback_video_usage(db, str(job.get("uid")), str(period), credits)
    if ok: ref.update({"usageRefunded":True,"usageRefundReason":reason,"usageRefundedAt":int(time.time())})
    return bool(ok)


def _brand_and_intel(db, uid:str, user_doc:Dict[str,Any], *, use_brand:bool, brand_id:Optional[str], use_intel:bool, admin:bool, tier:str, preserve_image:bool)->tuple[str,str]:
    brand=""; intel=""
    if use_brand:
        try: brand=compile_video_brand_direction(resolve_brand_kit(db,uid,brand_id,user_doc) or {})
        except Exception as exc: print('[Video V2 Brand Kit]',repr(exc),flush=True)
    if use_intel and (admin or tier in {"pro_monthly","business_monthly"}):
        try: intel=compact_video_intelligence(get_intelligence_generation_profile(uid) or {}, preserve_source_image=preserve_image, max_chars=650)
        except Exception as exc: print('[Video V2 PI]',repr(exc),flush=True)
    return _clean(brand,700), _clean(intel,650)


def _fal_headers()->Dict[str,str]:
    if not FAL_KEY: raise HTTPException(status_code=503, detail='Video generation is temporarily unavailable.')
    return {"Authorization":f"Key {FAL_KEY}","Content-Type":"application/json"}


async def _fal_submit(model:str, payload:Dict[str,Any])->Dict[str,Any]:
    url=f"https://queue.fal.run/{model}"
    async with httpx.AsyncClient(timeout=45.0) as client:
        r=await client.post(url,headers=_fal_headers(),json=payload)
    if r.status_code>=400:
        print('[video generation Submit Error]',r.status_code,r.text[:1200],flush=True)
        raise RuntimeError('Video generation could not be submitted.')
    data=r.json()
    if not data.get('request_id'): raise RuntimeError('Video generation did not return a request id.')
    return data


async def _fal_status(status_url:str)->Dict[str,Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r=await client.get(status_url,headers={"Authorization":f"Key {FAL_KEY}"},params={"logs":1})
    if r.status_code>=400: raise RuntimeError(f'Video status request failed ({r.status_code}).')
    return r.json()


async def _fal_result(response_url:str)->Dict[str,Any]:
    async with httpx.AsyncClient(timeout=45.0) as client:
        r=await client.get(response_url,headers={"Authorization":f"Key {FAL_KEY}"})
    if r.status_code>=400:
        detail=r.text[:1200]
        print('[video generation Result Error]',r.status_code,detail,flush=True)
        raise RuntimeError(f'Video provider result failed ({r.status_code}): {detail}')
    return r.json()


async def _download(url:str)->bytes:
    async with httpx.AsyncClient(timeout=180.0,follow_redirects=True) as client:
        r=await client.get(url); r.raise_for_status(); return r.content


def _extract_video_url(result:Dict[str,Any])->str:
    data=result.get('data') if isinstance(result.get('data'),dict) else result
    video=data.get('video') if isinstance(data,dict) else None
    if isinstance(video,dict) and video.get('url'): return str(video['url'])
    if isinstance(video,str): return video
    raise RuntimeError('Video generation completed without a video URL.')


def _openai_tts_bytes(text:str, preset:str)->bytes:
    if not OPENAI_API_KEY: raise RuntimeError('Narration service is unavailable.')
    client=OpenAI(api_key=OPENAI_API_KEY)
    voice=NARRATOR_OPENAI_VOICES.get(str(preset), 'marin')
    response=client.audio.speech.create(model=OPENAI_TTS_MODEL, voice=voice, input=_clean(text,3900), response_format='mp3')
    return bytes(response.read()) if hasattr(response,'read') else bytes(response.content)



def _music_direction(brief: Dict[str, Any], storyboard: Dict[str, Any]) -> str:
    concept = _clean((storyboard or {}).get('conceptSummary'), 220)
    style = _clean(brief.get('visualStyle'), 80)
    tone = _clean(brief.get('tone'), 80)
    campaign = _clean(brief.get('campaignType'), 60)
    product = _clean(brief.get('subjectName') or brief.get('description'), 120)
    return _clean(
        f"Instrumental commercial background music for a {campaign or 'brand'} advertisement. "
        f"Product/context: {product}. Visual style: {style or 'polished commercial'}. "
        f"Tone: {tone or 'confident and modern'}. Concept: {concept}. "
        "Subtle, tasteful, supportive underscore; restrained dynamics; clean modern production; "
        "no vocals, no spoken words, no lyrics, no dramatic stingers, no random environmental noises, "
        "no unrelated sound effects. Music must sit behind dialogue and visuals rather than dominate.",
        760,
    )


async def _generate_music_bed(brief: Dict[str, Any], storyboard: Dict[str, Any]) -> bytes:
    submitted = await _fal_submit(
        'fal-ai/lyria2',
        {
            'prompt': _music_direction(brief, storyboard),
            'negative_prompt': (
                'vocals, singing, spoken words, dialogue, loud mastering, aggressive lead melody, '
                'random ambience, footsteps, water sounds, birds, crowd noise, foley, unrelated sound effects'
            ),
        },
    )
    status_url = str(submitted.get('status_url') or '')
    response_url = str(submitted.get('response_url') or '')
    if not status_url or not response_url:
        raise RuntimeError('Music generation did not return queue URLs.')

    for _ in range(60):
        state = await _fal_status(status_url)
        provider = str(state.get('status') or '').upper()
        if provider == 'COMPLETED':
            if state.get('error'):
                raise RuntimeError('Music generation failed.')
            result = await _fal_result(response_url)
            data = result.get('data') if isinstance(result.get('data'), dict) else result
            audio = data.get('audio') if isinstance(data, dict) else None
            url = audio.get('url') if isinstance(audio, dict) else None
            if not url:
                raise RuntimeError('Music generation completed without an audio URL.')
            return await _download(str(url))
        if provider in {'FAILED', 'CANCELED', 'ERROR'}:
            raise RuntimeError('Music generation failed.')
        await asyncio.sleep(1.5)
    raise RuntimeError('Music generation timed out.')


def _mix_music_bed(video_bytes: bytes, music_bytes: bytes, *, duration: int) -> bytes:
    # 0.08 linear gain is roughly -22 dB: deliberately background-level.
    with tempfile.TemporaryDirectory(prefix='adgen-v2-music-') as td:
        td = Path(td)
        video = td / 'video.mp4'
        music = td / 'music.wav'
        output = td / 'mixed.mp4'
        video.write_bytes(video_bytes)
        music.write_bytes(music_bytes)

        fade_out = max(0.0, float(duration) - 0.45)
        filt = (
            f"[1:a]atrim=0:{float(duration):.3f},"
            f"afade=t=in:st=0:d=0.35,afade=t=out:st={fade_out:.3f}:d=0.45,"
            "volume=0.08[music];"
            "[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[a]"
        )
        cmd = [
            'ffmpeg', '-y', '-i', str(video), '-i', str(music),
            '-filter_complex', filt,
            '-map', '0:v:0', '-map', '[a]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
            '-shortest', '-movflags', '+faststart', str(output),
        ]
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if p.returncode != 0:
            raise RuntimeError('Music mix failed: ' + p.stderr[-900:])
        return output.read_bytes()


def _mix_voiceover(video_bytes:bytes, narration:bytes, *, keep_original_audio:bool)->bytes:
    with tempfile.TemporaryDirectory(prefix='adgen-kling-vo-') as td:
        v=Path(td)/'video.mp4'; a=Path(td)/'voice.mp3'; o=Path(td)/'out.mp4'
        v.write_bytes(video_bytes); a.write_bytes(narration)
        if keep_original_audio:
            filt='[0:a]volume=0.28[bed];[1:a]volume=1.0[vo];[bed][vo]amix=inputs=2:duration=first:dropout_transition=2[a]'
            cmd=['ffmpeg','-y','-i',str(v),'-i',str(a),'-filter_complex',filt,'-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','160k','-shortest',str(o)]
        else:
            cmd=['ffmpeg','-y','-i',str(v),'-i',str(a),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','160k','-shortest',str(o)]
        p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        if p.returncode!=0: raise RuntimeError('Voiceover mix failed: '+p.stderr[-700:])
        return o.read_bytes()


def _font(size:int):
    candidates=[
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/Library/Fonts/Arial Bold.ttf',
    ]
    for path in candidates:
        if Path(path).exists():
            try: return ImageFont.truetype(path,size=size)
            except Exception: pass
    return ImageFont.load_default()


def _wrap_text(draw:ImageDraw.ImageDraw,text:str,font,max_width:int)->List[str]:
    words=str(text or '').split()
    lines=[]; current=''
    for word in words:
        candidate=(current+' '+word).strip()
        box=draw.textbbox((0,0),candidate,font=font)
        if current and box[2]-box[0] > max_width:
            lines.append(current); current=word
        else: current=candidate
    if current: lines.append(current)
    return lines[:3]


def _video_size(video_path:Path)->tuple[int,int]:
    cmd=['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=s=x:p=0',str(video_path)]
    p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if p.returncode!=0 or 'x' not in p.stdout: return (720,1280)
    try:
        w,h=p.stdout.strip().split('x',1); return max(2,int(w)),max(2,int(h))
    except Exception: return (720,1280)


def _overlay_png(width:int,height:int,text:str,*,cta:bool=False,brand:Optional[str]=None)->bytes:
    image=Image.new('RGBA',(width,height),(0,0,0,0)); draw=ImageDraw.Draw(image)
    font=_font(max(22,int(width*0.045 if not cta else width*0.052)))
    small=_font(max(16,int(width*0.025)))
    safe=_clean(text,180)
    max_width=int(width*0.82)
    lines=_wrap_text(draw,safe,font,max_width)
    line_h=max(28,int(font.size*1.25) if hasattr(font,'size') else 34)
    block_h=line_h*len(lines)+34
    y=int(height*0.78)-block_h//2 if not cta else int(height*0.72)-block_h//2
    x=int(width*0.09)
    box=(x-18,y-16,width-x+18,y+block_h)
    draw.rounded_rectangle(box,radius=18,fill=(5,10,22,185))
    for i,line in enumerate(lines): draw.text((x,y+i*line_h),line,font=font,fill=(255,255,255,255))
    if cta and brand:
        draw.text((x,y-34),_clean(brand,80),font=small,fill=(220,214,254,255))
    out=io.BytesIO(); image.save(out,format='PNG'); return out.getvalue()


def _apply_finishing(video_bytes:bytes, *, storyboard:Dict[str,Any], captions:bool, end_card:bool, cta:Optional[str], brand:Optional[str], duration:int)->bytes:
    if not captions and not end_card: return video_bytes
    with tempfile.TemporaryDirectory(prefix='adgen-v2-finish-') as td:
        td=Path(td); source=td/'source.mp4'; source.write_bytes(video_bytes)
        width,height=_video_size(source)
        overlays=[]; timing=[]; cursor=0.0
        if captions:
            for scene in (storyboard or {}).get('scenes') or []:
                seconds=float(scene.get('duration') or 0); start=cursor; end=max(start,cursor+seconds); cursor=end
                text=_clean(scene.get('caption') or scene.get('dialogue') or scene.get('voiceover'),120)
                if not text: continue
                path=td/f'caption_{len(overlays)}.png'; path.write_bytes(_overlay_png(width,height,text))
                overlays.append(path); timing.append((start,end))
        if end_card and _clean(cta,180):
            path=td/f'cta_{len(overlays)}.png'; path.write_bytes(_overlay_png(width,height,_clean(cta,180),cta=True,brand=brand))
            overlays.append(path); timing.append((max(0.0,float(duration)-1.8),float(duration)))
        if not overlays: return video_bytes
        cmd=['ffmpeg','-y','-i',str(source)]
        for path in overlays: cmd += ['-loop','1','-i',str(path)]
        filters=[]; prev='[0:v]'
        for i,(start,end) in enumerate(timing,1):
            out=f'[v{i}]'; filters.append(f"{prev}[{i}:v]overlay=0:0:enable='between(t,{start:.3f},{end:.3f})'{out}"); prev=out
        output=td/'finished.mp4'
        cmd += ['-filter_complex',';'.join(filters),'-map',prev,'-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','18','-c:a','copy','-movflags','+faststart',str(output)]
        p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        if p.returncode!=0:
            print('[Video V2 Finishing Warning]',p.stderr[-1200:],flush=True)
            return video_bytes
        return output.read_bytes()


def _save_video(db,uid:str,tier:str,data:bytes,*,folder:str)->Dict[str,Any]:
    ensure_storage_available(db,uid,tier,len(data))
    stored=upload_bytes_to_firebase_storage_with_metadata(data,uid,'video/mp4',folder=folder,filename_hint='output.mp4')
    register_storage_asset(db,uid,size_bytes=stored['fileSizeBytes'],asset_type='video')
    return stored


def _mirror_full(db, job_id:str, job:Dict[str,Any])->None:
    if not job.get('finalVideoUrl'): return
    db.collection('video_jobs').document(job_id).set({
        'uid':job.get('uid'),'status':'succeeded','kind':'full_video_ad_v2','source':'video_v2_kling',
        'productName':job.get('productName'),'description':job.get('description'),'duration':job.get('duration'),
        'ratio':job.get('ratio'),'finalVideoUrl':job.get('finalVideoUrl'),'storyboard':job.get('storyboard'),
        'creditsReserved':job.get('creditsReserved'),'createdAt':job.get('createdAt'),'updatedAt':int(time.time()),
        'progressStage':'succeeded','progressPercent':100,'progressMessage':'Your Full Video Ad is ready.',
        'provider':'kling_v3_pro','falRequestId':job.get('falRequestId'),
    },merge=True)


def _voice_style(value:str)->str:
    raw=str(value or 'natural').lower().strip()
    for style in ('natural','warm','confident'):
        if raw.startswith(style): return style
    return 'natural'


def _speech_word_limit(duration_sec: Any, mode: str) -> int:
    try:
        seconds = max(1.0, float(duration_sec or 3))
    except Exception:
        seconds = 3.0
    rate = 2.25 if mode == "character_dialogue" else 2.55
    return max(3, int(seconds * rate))


def _clamp_scene_speech(value: Any, duration_sec: Any, mode: str) -> str:
    words = str(value or "").strip().split()
    if not words:
        return ""
    return " ".join(words[:_speech_word_limit(duration_sec, mode)])


def _speech_instruction(mode:str, dialogue:Optional[str], voice:str, gender:str, action:Optional[str])->str:
    if mode!='character_dialogue' or not dialogue:
        return 'No spoken dialogue in this shot. Visible people keep natural closed-mouth expressions and do not mouth words.'
    gender_key='male' if str(gender).lower()=='male' else 'female'
    style=_voice_style(voice)
    profile=CHARACTER_VOICE_PROFILES[(gender_key,style)]
    action_text=_clean(action,280) or 'continue the physical action naturally throughout the line'
    return f'The on-screen character {action_text} and naturally says: "{_clean(dialogue,220)}". Voice direction: {profile}. Speech is part of the original performance with accurate natural lip synchronization and conversational timing.'


def _product_motion_rule(campaign_type:str, purpose:str)->str:
    if str(campaign_type).lower()!='product': return ''
    role=str(purpose or '').lower()
    if role in {'product','demo','hook','cta','benefit'}:
        return ('Keep the exact advertised product clearly recognizable and naturally integrated. '
                'Use continuous purposeful motion: camera push, arc, parallax, hand interaction or product use as appropriate. '
                'Never hold on a static still-image shot. Preserve packaging, proportions, colors and defining label details; do not substitute another product.')
    return ''


def _shot_prompt(scene:StoryboardScene, brief:FullAdBrief, storyboard:Storyboard, brand:str, intel:str)->str:
    parts=[_clean(scene.visualPrompt,1100),f'Shot role: {scene.purpose}.',f'Advertised subject: {brief.subjectName}.']
    if brief.companyName: parts.append(f'Brand: {brief.companyName}.')
    if storyboard.continuity: parts.append('Continuity: '+_clean(storyboard.continuity,420))
    if scene.performanceBeat: parts.append('Performance beat in order: '+_clean(scene.performanceBeat,380))
    parts.append(_product_motion_rule(brief.campaignType,scene.purpose))
    if brief.voiceMode=='character_dialogue':
        parts.append(_speech_instruction(brief.voiceMode,_clamp_scene_speech(scene.dialogue,scene.duration,'character_dialogue'),brief.characterVoice,brief.characterGender,scene.actionWhileSpeaking or scene.performanceBeat))
    elif brief.voiceMode=='voiceover':
        parts.append('No on-screen person speaks. Keep visible people nonverbal; narration is added separately by ADGen.')
    else:
        parts.append('No spoken dialogue. Keep any visible people nonverbal.')
    if brief.musicAndEffects and brief.voiceMode!='voiceover': parts.append('Include realistic scene ambience and restrained commercial sound design; no unrelated vocals.')
    if brand: parts.append(brand)
    if intel: parts.append(intel)
    if brief.creativeDirection: parts.append('Additional direction: '+_clean(brief.creativeDirection,600))
    parts.append('Photorealistic commercial quality. Natural anatomy and hands. Restrained expressions and gestures. Smooth intentional camera movement. No jitter or visual morphing.')
    return _clean(' '.join(p for p in parts if p),2450)



def _provider_safe_shot_prompt(scene: StoryboardScene, req: StartFullAdRequest, storyboard: Storyboard, brand: str, intel: str) -> str:
    """
    Hard 512-character scene compiler.
    Priority: exact dialogue/action > core visual/product interaction >
    reference preservation > Brand Kit > Performance Intelligence >
    continuity > non-speaking guardrails.
    """
    chunks: List[str] = []

    if req.voiceMode == 'character_dialogue' and scene.dialogue:
        spoken = _clean(scene.dialogue, 170)
        action = _clean(scene.actionWhileSpeaking or scene.performanceBeat, 110)
        chunks.append(f'Say exactly: "{spoken}"')
        if action:
            chunks.append('While speaking: ' + action)

    visual = _clean(scene.visualPrompt, 245)
    if visual:
        chunks.append(visual)

    if req.referenceImageUrl:
        chunks.append('Preserve referenced product shape, packaging, colors and logo placement; show purposeful product interaction.')

    # Full context already shaped the storyboard; reserve concise render-time cues too.
    if brand:
        chunks.append('Brand: ' + _clean(brand, 62))
    if intel:
        chunks.append('Performance cue: ' + _clean(intel, 62))

    continuity = _clean(storyboard.continuity, 58)
    if continuity:
        chunks.append('Continuity: ' + continuity)

    if req.voiceMode == 'voiceover':
        chunks.append('Visible people stay nonverbal; do not mouth narration.')
    elif req.voiceMode == 'none':
        chunks.append('No speech; visible people stay naturally nonverbal.')

    packed = ''
    for chunk in chunks:
        chunk = chunk.strip(' .')
        if not chunk:
            continue
        candidate = chunk if not packed else packed + '. ' + chunk
        if len(candidate) <= 512:
            packed = candidate
            continue
        remaining = 512 - len(packed) - (2 if packed else 0)
        if remaining >= 28:
            clipped = _clean(chunk, remaining)
            if clipped:
                packed = clipped if not packed else packed + '. ' + clipped
        break

    return (packed or _clean(scene.visualPrompt, 512))[:512].rstrip()



def _full_payload(req:StartFullAdRequest, brand:str, intel:str)->tuple[str,Dict[str,Any]]:
    multi=[]
    for scene in req.storyboard.scenes:
        prompt=_provider_safe_shot_prompt(scene,req,req.storyboard,brand,intel)
        if len(prompt) > 512:
            raise RuntimeError('Compiled video scene prompt exceeded the provider limit.')
        multi.append({'prompt':prompt,'duration':str(int(scene.duration))})
    generate_audio = req.voiceMode=='character_dialogue' or (req.voiceMode=='none' and req.musicAndEffects) or (req.voiceMode=='voiceover' and req.musicAndEffects)
    common={'multi_prompt':multi,'duration':str(req.duration),'generate_audio':bool(generate_audio),'shot_type':'customize','negative_prompt':NEGATIVE_PROMPT,'cfg_scale':0.5}
    if req.referenceImageUrl:
        common['start_image_url']=req.referenceImageUrl
        return FAL_KLING_I2V,common
    common['aspect_ratio']=_kling_ratio(req.ratio)
    return FAL_KLING_T2V,common



def _extract_requested_dialogue(req: StoryboardRequest) -> Optional[str]:
    """
    Extract an exact user-supplied spoken line from creative direction/description.
    We prioritize explicit phrases such as "spoken line:" and then quoted speech.
    """
    combined = " ".join(
        str(v or "")
        for v in [req.creativeDirection, req.description]
        if v
    ).strip()
    if not combined:
        return None

    # First: explicit spoken-line/dialogue instructions. Handles straight and curly quotes.
    explicit_patterns = [
        r'(?:spoken line|dialogue|character says|she says|he says)\s*[:\-]\s*["“]?([^"”\n]{3,220})',
        r'(?:include|use|say|says|speaks?)\s+(?:the\s+)?(?:natural\s+)?(?:spoken\s+)?line\s*[:\-]?\s*["“]?([^"”\n]{3,220})',
    ]
    for pattern in explicit_patterns:
        m = re.search(pattern, combined, flags=re.I)
        if m:
            candidate = _clean(m.group(1), 220)
            # Remove a trailing closing quote/punctuation artifact only, preserving wording.
            candidate = candidate.strip().strip('"“”').strip()
            if len(candidate.split()) >= 3:
                return candidate

    # Second: quoted speech. Prefer sentence-like quoted text.
    quoted = re.findall(r'["“]([^"”]{3,220})["”]', combined)
    for candidate in quoted:
        candidate = _clean(candidate, 220).strip()
        if len(candidate.split()) >= 3:
            return candidate

    return None

def _scene_action_match_score(scene: Dict[str, Any], req: StoryboardRequest) -> int:
    """
    Score which planned scene best matches the user's requested speaking action.
    Product-use/demo/application scenes are favored for product campaigns, but
    no scene index is hard-coded.
    """
    text = " ".join(
        str(scene.get(k) or "")
        for k in ("title", "purpose", "visualPrompt", "performanceBeat", "actionWhileSpeaking")
    ).lower()

    source = " ".join(
        str(v or "")
        for v in (req.creativeDirection, req.description)
        if v
    ).lower()

    action_terms = [
        "apply", "applying", "spread", "spreading", "use", "using", "demo",
        "demonstrate", "demonstrating", "hold", "holding", "pick up", "picks up",
        "pour", "pouring", "drink", "drinking", "wear", "wearing", "walk",
        "walking", "exercise", "exercising", "cook", "cooking", "work", "working",
        "tour", "touring", "show", "showing", "interact", "interaction",
    ]

    score = 0
    for term in action_terms:
        if term in source and term in text:
            score += 3

    purpose = str(scene.get("purpose") or "").lower()
    if req.campaignType == "product" and purpose in {"product", "demo", "benefit"}:
        score += 4
    if purpose == "cta":
        score -= 2

    if any(term in text for term in ("static", "beauty shot", "hero pose", "final pose")):
        score -= 2

    return score


def _anchor_supplied_dialogue_to_action_scene(
    req: StoryboardRequest,
    scenes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Preserve exact user-supplied dialogue and attach it to the scene that best
    matches the requested physical action. This runs after AI scene normalization
    so no later planner cleanup can silently discard the line.
    """
    if req.voiceMode != "character_dialogue" or not scenes:
        return scenes

    requested_line = _extract_requested_dialogue(req)
    if not requested_line:
        return scenes

    ranked = sorted(
        enumerate(scenes),
        key=lambda pair: _scene_action_match_score(pair[1], req),
        reverse=True,
    )
    target_index, target_scene = ranked[0]
    best_score = _scene_action_match_score(target_scene, req)

    # If no action term matches, prefer a product/demo/use-like scene rather than
    # dropping the supplied line. Still avoid a generic CTA/final beauty shot.
    if best_score <= 0:
        preferred = []
        for i, scene in enumerate(scenes):
            purpose = str(scene.get("purpose") or "").lower()
            title = str(scene.get("title") or "").lower()
            visual = str(scene.get("visualPrompt") or "").lower()
            if purpose in {"product", "demo", "benefit", "service", "experience"}:
                preferred.append((i, scene))
            elif any(term in f"{title} {visual}" for term in ("use", "using", "apply", "applying", "demo", "demonstrat")):
                preferred.append((i, scene))
        if preferred:
            target_index, target_scene = preferred[0]

    duration = int(target_scene.get("duration") or 3)
    final_line = _clamp_scene_speech(
        requested_line,
        duration,
        "character_dialogue",
    )

    # Clear other speaking assignments so the intended moment is unambiguous.
    for i, scene in enumerate(scenes):
        if i == target_index:
            continue
        scene["dialogue"] = None
        scene["actionWhileSpeaking"] = None
        if scene.get("performanceMode") == "speaking":
            scene["performanceMode"] = "silent"

    target_scene["dialogue"] = final_line
    target_scene["performanceMode"] = "speaking"

    if not _clean(target_scene.get("performanceBeat"), 420):
        target_scene["performanceBeat"] = (
            _clean(target_scene.get("visualPrompt"), 420)
            or "Continue the described physical action naturally."
        )

    if not _clean(target_scene.get("actionWhileSpeaking"), 320):
        target_scene["actionWhileSpeaking"] = (
            _clean(target_scene.get("performanceBeat"), 320)
            or "Continue the described physical action naturally while speaking."
        )

    # Store a small internal marker that survives until response validation.
    target_scene["_dialogueAnchoredByUser"] = True
    return scenes


def _build_storyboard_prompt(req:StoryboardRequest,brand:str,intel:str)->str:
    durations=_layout(req.duration); roles=_campaign_roles(req.campaignType,len(durations))
    voice={
      'none':'No speech. Do not write voiceover or dialogue in any scene. Any visible people must remain naturally nonverbal with closed-mouth expressions and no speech-like gestures. Make every shot visually active.',
      'voiceover':'Write concise off-screen narration per shot only. Do not write on-screen dialogue. Any visible people must remain nonverbal and must not mouth the narration or perform speech-like gestures. Keep narration at or below about 2.55 spoken words per second of that shot.',
      'character_dialogue':'Use native on-screen dialogue in at most two shots. If the user supplied an exact spoken line or explicitly tied speech to an action, preserve that wording and place it in the scene performing that action. Do not move action-linked dialogue to a generic hook, CTA, beauty shot, or final pose. Speaking characters must keep performing a meaningful physical action while speaking. Keep dialogue at or below about 2.25 spoken words per second of that shot.'
    }[req.voiceMode]
    product_rule = ('For a PRODUCT campaign, product visibility is a first-class requirement: show the exact referenced product clearly in relevant shots, include real product interaction/use, give hero shots visible camera/parallax motion, and never plan a static reference-image hold.' if req.campaignType=='product' else 'Treat the reference according to campaign type; do not force a physical-product structure.')
    return f"""Plan one continuous {req.duration}-second commercial for a multi-shot video generation.
Brand: {req.companyName or 'Not supplied'}
Campaign type: {req.campaignType}
Advertised subject: {req.subjectName}
Description: {req.description}
Audience: {req.audience or 'Not supplied'}
Offer: {req.offer or 'None'}
Goal: {req.goal}; Platform: {req.platform}; Style: {req.visualStyle}; Tone: {req.tone}; CTA: {req.callToAction or 'None'}
Extra direction: {req.creativeDirection or 'None'}
Reference image supplied: {'yes' if req.referenceImageUrl else 'no'}
Brand direction: {brand or 'None'}
Performance learnings: {intel or 'None'}
Voice behavior: {voice}
{product_rule}

Required shot durations: {durations}. Required roles in order: {roles}.
Every shot must have actual motion: camera movement, subject movement, environmental movement, or physical product interaction. Do not describe a static still.
If the user's creative direction says dialogue happens during a specific physical action, the speaking scene MUST be the scene containing that action. Preserve supplied dialogue wording whenever it fits the timing limit. Do not relocate it to the final payoff/CTA just because that scene is visually prominent.
Keep the same recurring person, wardrobe, environment and product identity where continuity calls for it.
Use restrained natural expressions, realistic hands/fingers, physically believable movement and commercial cinematography.
Do not put captions or CTA text into generated frames; ADGen handles UI/finishing separately.

Return ONLY JSON:
{{"conceptTitle":"...","conceptSummary":"...","continuity":"...","voiceoverScript":"... or null","scenes":[{{"id":"scene_1","title":"...","purpose":"...","duration":{durations[0]},"visualPrompt":"...","voiceover":"... or null","dialogue":"... or null","actionWhileSpeaking":"... or null","performanceMode":"speaking|silent|no_person","performanceBeat":"... or null","caption":"... or null"}}]}}
""".strip()



async def _moderate_compiled_video_payload(
    db,
    uid: str,
    *,
    text_parts: Iterable[Optional[str]],
    image_url: Optional[str] = None,
) -> None:
    """
    Final safety gate for system-compiled generation instructions after Brand Kit
    and Performance Intelligence have been injected.

    User input was already moderated earlier, so a system-generated/compiled safety
    rejection does not increment the user's policy-violation counter.
    """
    await moderate_video_request(
        db,
        uid,
        text_parts=text_parts,
        image_url=image_url,
        record_violation=False,
    )


@router.post('/storyboard',response_model=Storyboard)
async def create_storyboard(req:StoryboardRequest,authorization:str|None=Header(default=None)):
    uid,_email,claims=require_user(authorization); admin=is_admin(claims); db=get_db()
    user_doc=db.collection('users').document(uid).get().to_dict() or {}; require_active_account(user_doc); tier,_=get_tier_and_status(user_doc)
    await moderate_video_request(db,uid,text_parts=[req.subjectName,req.description,req.audience,req.offer,req.creativeDirection],image_url=req.referenceImageUrl)
    if not OPENAI_API_KEY: raise HTTPException(status_code=503,detail='Storyboard generation is temporarily unavailable.')
    brand,intel=_brand_and_intel(db,uid,user_doc,use_brand=req.useBrandKit,brand_id=req.brandKitId,use_intel=req.usePerformanceIntelligence,admin=admin,tier=tier,preserve_image=bool(req.referenceImageUrl))
    storyboard_prompt=_build_storyboard_prompt(req,brand,intel)
    await _moderate_compiled_video_payload(
        db,
        uid,
        text_parts=[storyboard_prompt],
        image_url=req.referenceImageUrl,
    )
    client=OpenAI(api_key=OPENAI_API_KEY)
    try:
        response=await asyncio.to_thread(lambda: client.chat.completions.create(model=OPENAI_TEXT_MODEL,messages=[{'role':'system','content':'Return valid JSON only.'},{'role':'user','content':storyboard_prompt}]))
        data=_json_from_text(response.choices[0].message.content or '{}')
    except Exception as exc:
        print('[Video V2 Storyboard Error]',repr(exc),flush=True); raise HTTPException(status_code=502,detail='ADGen could not build the storyboard. Please try again.')
    durations=_layout(req.duration); scenes=data.get('scenes') or []
    if len(scenes)!=len(durations): raise HTTPException(status_code=502,detail='Storyboard returned the wrong number of scenes.')
    roles=_campaign_roles(req.campaignType,len(durations)); speaking=0
    for i,(scene,seconds) in enumerate(zip(scenes,durations)):
        scene['id']=f'scene_{i+1}'; scene['duration']=seconds; scene['purpose']=roles[i]
        scene['visualPrompt']=_clean(scene.get('visualPrompt'),1200)
        scene['performanceBeat']=_clean(scene.get('performanceBeat'),420) or None
        if req.voiceMode=='character_dialogue':
            dialogue=_clamp_scene_speech(_clean(scene.get('dialogue'),140),seconds,'character_dialogue')
            allow=(i==0 or i==len(scenes)-1) and bool(dialogue) and speaking<2
            if allow:
                speaking+=1; scene['dialogue']=dialogue; scene['performanceMode']='speaking'
                scene['actionWhileSpeaking']=_clean(scene.get('actionWhileSpeaking'),320) or scene['performanceBeat'] or 'continue the relevant physical action naturally while speaking'
                scene['performanceBeat']=scene['performanceBeat'] or scene['actionWhileSpeaking']
            else:
                scene['dialogue']=None; scene['actionWhileSpeaking']=None
                human=any(x in roles[i].lower() for x in ('hook','demo','service','experience','lifestyle','proof','cta'))
                scene['performanceMode']='silent' if human else 'no_person'
                if human and not scene['performanceBeat']: scene['performanceBeat']='Perform the described action naturally with no speech-like mouth movement.'
        else:
            scene['dialogue']=None; scene['actionWhileSpeaking']=None; scene['performanceMode']='no_person'
        if req.voiceMode=='voiceover':
            scene['voiceover']=_clamp_scene_speech(_clean(scene.get('voiceover'),180),seconds,'voiceover') or None
        else:
            scene['voiceover']=None
    if req.voiceMode=='voiceover':
        data['voiceoverScript']=' '.join(_clamp_scene_speech(s.get('voiceover'),s.get('duration'),'voiceover') for s in scenes if s.get('voiceover')).strip() or None

    # IMPORTANT: run exact user-dialogue anchoring after every other scene cleanup.
    # Nothing after this point is allowed to reclassify or clear the speaking scene.
    scenes=_anchor_supplied_dialogue_to_action_scene(req, scenes)

    # Remove internal-only marker before schema validation / client response.
    for scene in scenes:
        scene.pop('_dialogueAnchoredByUser', None)

    data['scenes']=scenes

    # Final invariant: explicit user-supplied character dialogue has absolute
    # precedence over planner-written dialogue. The action-linked speaking scene
    # must return the user's requested line (subject only to the existing duration
    # clamp); merely having some AI-written dialogue is not sufficient.
    if req.voiceMode == 'character_dialogue':
        requested_line = _extract_requested_dialogue(req)
        if requested_line:
            speaking_indexes = [
                i for i, scene in enumerate(scenes)
                if scene.get('performanceMode') == 'speaking'
            ]

            if speaking_indexes:
                target_index = max(
                    speaking_indexes,
                    key=lambda i: _scene_action_match_score(scenes[i], req),
                )
            else:
                target_index = max(
                    range(len(scenes)),
                    key=lambda i: _scene_action_match_score(scenes[i], req),
                )

            target_scene = scenes[target_index]
            exact_line = _clamp_scene_speech(
                requested_line,
                int(target_scene.get('duration') or 3),
                'character_dialogue',
            )

            # Absolute precedence: overwrite any planner-authored line.
            for i, scene in enumerate(scenes):
                if i != target_index:
                    scene['dialogue'] = None
                    scene['actionWhileSpeaking'] = None
                    if scene.get('performanceMode') == 'speaking':
                        scene['performanceMode'] = 'silent'

            target_scene['performanceMode'] = 'speaking'
            target_scene['dialogue'] = exact_line
            if not _clean(target_scene.get('actionWhileSpeaking'), 320):
                target_scene['actionWhileSpeaking'] = (
                    _clean(target_scene.get('performanceBeat'), 320)
                    or 'Continue the described physical action naturally while speaking.'
                )

            data['scenes'] = scenes

            if _clean(target_scene.get('dialogue'), 220) != _clean(exact_line, 220):
                raise HTTPException(
                    status_code=502,
                    detail='ADGen could not preserve the requested on-screen dialogue exactly. Please regenerate.'
                )

    return Storyboard.model_validate(data)


@router.post('/start',response_model=StartFullAdResponse)
async def start_full(req:StartFullAdRequest,authorization:str|None=Header(default=None)):
    # Enforce timing-aware speech limits again server-side before generation.
    for scene in req.storyboard.scenes:
        if req.voiceMode == 'voiceover':
            scene.voiceover = _clamp_scene_speech(scene.voiceover, scene.duration, 'voiceover') or None
            scene.dialogue = None
        elif req.voiceMode == 'character_dialogue':
            scene.dialogue = _clamp_scene_speech(scene.dialogue, scene.duration, 'character_dialogue') or None
            scene.voiceover = None
        else:
            scene.voiceover = None
            scene.dialogue = None

    uid,_email,claims=require_user(authorization)
    admin=is_admin(claims)
    db=get_db()
    user_doc=db.collection('users').document(uid).get().to_dict() or {}
    require_active_account(user_doc)
    tier,_=get_tier_and_status(user_doc)

    # Direct user/request safety gate.
    await moderate_video_request(
        db,
        uid,
        text_parts=[
            req.companyName,
            req.subjectName,
            req.description,
            req.audience,
            req.offer,
            req.creativeDirection,
        ]
        + [s.visualPrompt for s in req.storyboard.scenes]
        + [s.dialogue for s in req.storyboard.scenes if s.dialogue]
        + [s.voiceover for s in req.storyboard.scenes if s.voiceover],
        image_url=req.referenceImageUrl,
    )

    if not admin:
        require_no_active_video_job(db, uid)

    # Compile Brand Kit / Performance Intelligence before charging credits so the
    # final provider instructions can pass safety screening first.
    brand,intel=_brand_and_intel(
        db,
        uid,
        user_doc,
        use_brand=req.useBrandKit,
        brand_id=req.brandKitId,
        use_intel=req.usePerformanceIntelligence,
        admin=admin,
        tier=tier,
        preserve_image=bool(req.referenceImageUrl),
    )
    model,payload=_full_payload(req,brand,intel)
    await _moderate_compiled_video_payload(
        db,
        uid,
        text_parts=[item.get('prompt') for item in payload.get('multi_prompt', [])],
        image_url=req.referenceImageUrl,
    )

    credits=_full_credits(req.duration)
    reservation={'periodKey':None,'creditsCharged':0}
    submission_guarded=False

    if not admin:
        enforce_user_submission_window(db, uid)
        submission_guarded=True
        try:
            reservation=_reserve(db,uid,tier,credits)
        except Exception:
            rollback_user_submission_window(db, uid)
            raise

    job_id=uuid.uuid4().hex
    ref=db.collection('video_v2_jobs').document(job_id)
    ref.set({
        'uid':uid,
        'createdAt':int(time.time()),
        'updatedAt':int(time.time()),
        'status':'running',
        'phase':'building_prompt',
        'progressPercent':8,
        'progressMessage':'Compiling your storyboard.',
        'duration':req.duration,
        'ratio':req.ratio,
        'productName':req.subjectName,
        'description':req.description,
        'brief':req.model_dump(exclude={'storyboard'}),
        'storyboard':req.storyboard.model_dump(),
        'scenes':[s.model_dump() for s in req.storyboard.scenes],
        'creditsReserved':credits if not admin else 0,
        'usagePeriodKey':reservation.get('periodKey') or reservation.get('month'),
        'usageRefunded':False,
        'provider':'kling_v3_pro',
        'falRequestId':None,
        'finalVideoUrl':None,
        'error':None,
    })
    try:
        submitted=await _fal_submit(model,payload)
        ref.update({
            'phase':'rendering_video',
            'progressPercent':18,
            'progressMessage':'Generating your complete multi-shot ad. Most Full Video Ads finish in about 5–10 minutes.',
            'falModel':model,
            'falRequestId':submitted['request_id'],
            'falStatusUrl':submitted.get('status_url'),
            'falResponseUrl':submitted.get('response_url'),
            'compiledKlingPayload':payload,
            'compiledBrandDirection':_clean(brand,700) or None,
            'compiledPerformanceDirection':_clean(intel,650) or None,
            'updatedAt':int(time.time()),
        })
        return StartFullAdResponse(jobId=job_id,status='running',creditsCharged=credits)
    except Exception as exc:
        latest=ref.get().to_dict() or {}
        refunded=True if admin else _refund_once(db,ref,latest,'kling_submit_failed')
        if submission_guarded:
            rollback_user_submission_window(db, uid)
        ref.update({
            'status':'failed',
            'phase':'failed',
            'progressPercent':100,
            'progressMessage':'Video generation failed.',
            'error':'ADGen could not start the video generation.'
                    + (' Your credits were returned.' if refunded and not admin else ''),
            'lastProviderError':str(exc)[:800],
            'updatedAt':int(time.time()),
        })
        raise HTTPException(
            status_code=502,
            detail='ADGen could not start the Full Video Ad. Credits were returned.',
        )


async def _finish_full(job_id:str,job:Dict[str,Any],ref,db)->Dict[str,Any]:
    result=await _fal_result(str(job.get('falResponseUrl'))); video_url=_extract_video_url(result)
    ref.update({'phase':'processing_video','progressPercent':74,'progressMessage':'Processing the completed video.','klingOutputUrl':video_url,'updatedAt':int(time.time())})
    data=await _download(video_url); final=data
    brief=job.get('brief') or {}; voice_mode=str(brief.get('voiceMode') or 'none')
    if voice_mode=='voiceover':
        script=_clean((job.get('storyboard') or {}).get('voiceoverScript'),2400)
        if script:
            ref.update({'phase':'adding_voiceover','progressPercent':80,'progressMessage':'Adding the selected AI narration.','updatedAt':int(time.time())})
            narration=await asyncio.to_thread(_openai_tts_bytes,script,str(brief.get('presetVoice') or 'Leslie'))
            final=await asyncio.to_thread(_mix_voiceover,final,narration,keep_original_audio=bool(brief.get('musicAndEffects')))
    if bool(brief.get('musicAndEffects')):
        ref.update({'phase':'adding_music','progressPercent':84,'progressMessage':'Creating and mixing subtle campaign-matched background music.','updatedAt':int(time.time())})
        try:
            music=await _generate_music_bed(brief,job.get('storyboard') or {})
            final=await asyncio.to_thread(_mix_music_bed,final,music,duration=int(job.get('duration') or 10))
        except Exception as exc:
            print('[Video V2 Music Warning]',repr(exc),flush=True)
            ref.update({'musicWarning':str(exc)[:800],'updatedAt':int(time.time())})
    if bool(brief.get('captions')) or bool(brief.get('endCard')):
        ref.update({'phase':'finalizing','progressPercent':89,'progressMessage':'Applying selected captions and CTA finishing.','updatedAt':int(time.time())})
        final=await asyncio.to_thread(
            _apply_finishing,
            final,
            storyboard=job.get('storyboard') or {},
            captions=bool(brief.get('captions')),
            end_card=bool(brief.get('endCard')),
            cta=brief.get('callToAction'),
            brand=brief.get('companyName') or job.get('productName'),
            duration=int(job.get('duration') or 10),
        )
    ref.update({'phase':'uploading_video','progressPercent':93,'progressMessage':'Uploading your finished ad.','updatedAt':int(time.time())})
    user_doc=db.collection('users').document(str(job.get('uid'))).get().to_dict() or {}; tier,_=get_tier_and_status(user_doc)
    stored=await asyncio.to_thread(_save_video,db,str(job.get('uid')),tier,final,folder='generated_video_ads_v2')
    ref.update({'phase':'saving_library','progressPercent':98,'progressMessage':'Saving your Full Video Ad to the Library.','updatedAt':int(time.time())})
    ref.update({'status':'succeeded','phase':'succeeded','progressPercent':100,'progressMessage':'Your Full Video Ad is ready.','finalVideoUrl':stored['url'],'finalStoragePath':stored.get('storagePath'),'fileSizeBytes':stored.get('fileSizeBytes'),'updatedAt':int(time.time())})
    latest=ref.get().to_dict() or {}; _mirror_full(db,job_id,latest); return latest


@router.get('/status/{job_id}',response_model=FullAdStatusResponse)
async def full_status(job_id:str,authorization:str|None=Header(default=None)):
    uid,_email,claims=require_user(authorization); admin=is_admin(claims); db=get_db(); ref=db.collection('video_v2_jobs').document(job_id); job=ref.get().to_dict()
    if not job: raise HTTPException(status_code=404,detail='Full Video Ad not found.')
    if not admin and job.get('uid')!=uid: raise HTTPException(status_code=403,detail='Forbidden.')
    if job.get('status') in {'succeeded','failed','canceled'}:
        return FullAdStatusResponse(jobId=job_id,status=job.get('status'),phase=job.get('phase') or job.get('status'),progressPercent=int(job.get('progressPercent') or 100),progressMessage=str(job.get('progressMessage') or ''),finalVideoUrl=job.get('finalVideoUrl'),scenes=job.get('scenes') or [],error=job.get('error'))
    try:
        status=await _fal_status(str(job.get('falStatusUrl'))); provider=str(status.get('status') or '').upper()
        if provider=='IN_QUEUE':
            pos=status.get('queue_position'); ref.update({'phase':'rendering_video','progressPercent':20,'progressMessage':f'Your video is queued{f" · position {pos}" if pos is not None else ""}.','providerStatus':provider,'updatedAt':int(time.time())})
        elif provider=='IN_PROGRESS':
            # Queue state is real; percentage remains bounded inside the rendering phase.
            ref.update({'phase':'rendering_video','progressPercent':45,'progressMessage':'Generating video, motion and native audio together. Most Full Video Ads finish in about 5–10 minutes.','providerStatus':provider,'updatedAt':int(time.time())})
        elif provider=='COMPLETED':
            if status.get('error'):
                latest=ref.get().to_dict() or job; refunded=_refund_once(db,ref,latest,'kling_provider_failed')
                ref.update({'status':'failed','phase':'failed','progressPercent':100,'progressMessage':'Video generation failed.','error':'ADGen could not complete this generation.'+(' Your credits were returned.' if refunded else ''),'providerError':str(status.get('error'))[:800],'updatedAt':int(time.time())})
            else:
                job=ref.get().to_dict() or job
                if not job.get('finalVideoUrl'): await _finish_full(job_id,job,ref,db)
    except Exception as exc:
        message=str(exc)
        print('[Video V2 video generation Status Error]',repr(exc),flush=True)
        permanent_provider_error = (
            'Video provider result failed (4' in message
            or 'Prompt must not exceed' in message
            or 'value_error' in message
        )
        if permanent_provider_error:
            latest=ref.get().to_dict() or job
            refunded=True if admin else _refund_once(db,ref,latest,'kling_provider_validation_failed')
            ref.update({
                'status':'failed',
                'phase':'failed',
                'progressPercent':100,
                'progressMessage':'Video generation failed.',
                'error':'ADGen could not complete this generation.'+(' Your credits were returned.' if refunded and not admin else ''),
                'lastProviderError':message[:800],
                'updatedAt':int(time.time()),
            })
        else:
            ref.update({'lastStatusError':message[:800],'progressMessage':'Your video is still being checked.','updatedAt':int(time.time())})
    job=ref.get().to_dict() or job
    return FullAdStatusResponse(jobId=job_id,status=str(job.get('status') or 'running'),phase=str(job.get('phase') or 'rendering_video'),progressPercent=int(job.get('progressPercent') or 20),progressMessage=str(job.get('progressMessage') or 'Generating your Full Video Ad.'),finalVideoUrl=job.get('finalVideoUrl'),scenes=job.get('scenes') or [],error=job.get('error'))


# ---------------- QUICK CLIP ----------------

def _quick_brand_intel(db,uid,user_doc,req,admin,tier,preserve):
    return _brand_and_intel(db,uid,user_doc,use_brand=bool(req.useBrandKit),brand_id=req.brandKitId,use_intel=bool(req.usePerformanceIntelligence),admin=admin,tier=tier,preserve_image=preserve)


def _quick_prompt(req:Any,base_prompt:str,brand:str,intel:str)->str:
    audio=req.audio; mode=audio.voiceMode
    parts=[base_prompt]
    if getattr(req, "companyName", None):
        parts.append("Company / brand: " + _clean(req.companyName, 120) + ".")
    if brand: parts.append(brand)
    if intel: parts.append(intel)
    if mode=='character_dialogue':
        gender_key='male' if str(audio.characterGender).lower()=='male' else 'female'; profile=CHARACTER_VOICE_PROFILES[(gender_key,_voice_style(audio.characterVoice))]
        action=_clean(audio.characterAction,420) or 'continue the requested physical action naturally throughout the line'
        line=_clean(req.voiceoverScript,500)
        if line: parts.append(f'On-screen character action while speaking: {action}. The character naturally says: "{line}". Voice: {profile}. The dialogue is part of the original performance with accurate lip synchronization and natural conversational timing. Do not stop for a static talking-head shot.')
        parts.append('Use restrained realistic facial expressions, relaxed eyes and eyebrows, minimal head bobbing, realistic hands and purposeful body motion.')
    elif mode=='voiceover':
        parts.append('No visible person speaks or mouths words. Generate only visual action and scene ambience; ADGen adds the selected off-screen narrator after rendering.')
    else:
        parts.append('No spoken dialogue. Visible people remain naturally nonverbal with relaxed mouths and no speech-like gestures.')
    if not audio.musicAndEffects and mode!='character_dialogue': parts.append('Do not create vocals or spoken audio.')
    parts.append('Continuous meaningful motion; never freeze the supplied reference into a static still. Preserve product identity, packaging and proportions when a product is present. Natural anatomy, realistic fingers, smooth commercial cinematography, no jitter.')
    return _clean(' '.join(parts),2450)


def _quick_prompt_base(req:StartPromptVideoRequest)->str:
    parts=[f'Create a polished {req.duration}-second advertisement for {req.productName}.']
    if req.companyName:
        parts.append(f'Company / brand: {_clean(req.companyName, 120)}.')
    parts.append(req.description)
    if req.audience: parts.append('Audience: '+req.audience+'.')
    if req.offer: parts.append('Offer: '+req.offer+'.')
    if req.goal: parts.append('Goal: '+req.goal+'.')
    if req.sceneStyle: parts.append('Visual style: '+req.sceneStyle+'.')
    if req.cameraMotion: parts.append('Camera movement: '+req.cameraMotion+'.')
    if req.lightingStyle: parts.append('Lighting: '+req.lightingStyle+'.')
    if req.pace: parts.append('Pacing: '+req.pace+'.')
    if req.callToAction: parts.append('End with a clear visual reason to '+req.callToAction+'. Do not render CTA text into the frame.')
    if req.fullCreativeDirection: parts.append('Additional direction: '+req.fullCreativeDirection)
    return _clean(' '.join(parts),1700)


async def _start_quick_common(req:Any,authorization:str|None,*,image_url:Optional[str],base_prompt:str)->StartVideoResponse:
    uid,_email,claims=require_user(authorization)
    admin=is_admin(claims)
    db=get_db()
    user_doc=db.collection('users').document(uid).get().to_dict() or {}
    require_active_account(user_doc)
    tier,status=get_tier_and_status(user_doc)

    # Direct user/request safety gate.
    await moderate_video_request(
        db,
        uid,
        text_parts=[
            getattr(req,'companyName',None),
            base_prompt,
            getattr(req,'voiceoverScript',None),
            getattr(req.audio,'characterAction',None),
        ],
        image_url=image_url,
    )

    if not admin:
        require_no_active_video_job(db, uid)

    # Compile all contextual injections before charging credits, then moderate the
    # exact final generation prompt that will be sent to the provider.
    brand,intel=_quick_brand_intel(db,uid,user_doc,req,admin,tier,bool(image_url))
    prompt=_quick_prompt(req,base_prompt,brand,intel)
    await _moderate_compiled_video_payload(
        db,
        uid,
        text_parts=[prompt],
        image_url=image_url,
    )

    generate_audio=req.audio.voiceMode=='character_dialogue' or bool(req.audio.musicAndEffects)
    payload={
        'prompt':prompt,
        'duration':str(req.duration),
        'generate_audio':bool(generate_audio),
        'negative_prompt':NEGATIVE_PROMPT,
        'cfg_scale':0.5,
    }
    if image_url:
        payload['start_image_url']=image_url
        model=FAL_KLING_I2V
    else:
        payload['aspect_ratio']=_kling_ratio(req.ratio)
        model=FAL_KLING_T2V

    credits=_quick_credits(req.duration)
    reservation={'periodKey':None}
    submission_guarded=False

    if not admin:
        enforce_user_submission_window(db, uid)
        submission_guarded=True
        try:
            reservation=_reserve(db,uid,tier,credits)
        except Exception:
            rollback_user_submission_window(db, uid)
            raise

    job_id=uuid.uuid4().hex
    ref=db.collection('video_jobs').document(job_id)
    ref.set({
        'uid':uid,
        'createdAt':int(time.time()),
        'updatedAt':int(time.time()),
        'status':'running',
        'kind':'quick_clip_v2',
        'source':'video_v2_kling',
        'companyName':getattr(req,'companyName',None),
        'duration':req.duration,
        'ratio':req.ratio,
        'creditsReserved':credits if not admin else 0,
        'usagePeriodKey':reservation.get('periodKey') or reservation.get('month'),
        'usageRefunded':False,
        'provider':'kling_v3_pro',
        'falRequestId':None,
        'finalVideoUrl':None,
        'audio':req.audio.model_dump(),
        'voiceover':req.voiceover.model_dump(),
        'voiceoverScript':_clean(req.voiceoverScript,1200) or None,
        'progressStage':'building_prompt',
        'progressPercent':10,
        'progressMessage':'Building creative direction.',
        'error':None,
    })
    try:
        submitted=await _fal_submit(model,payload)
        ref.update({
            'progressStage':'rendering_video',
            'progressPercent':18,
            'progressMessage':'Generating your Quick Clip.',
            'falModel':model,
            'falRequestId':submitted['request_id'],
            'falStatusUrl':submitted.get('status_url'),
            'falResponseUrl':submitted.get('response_url'),
            'compiledKlingPrompt':prompt,
            'compiledBrandDirection':_clean(brand,700) or None,
            'compiledPerformanceDirection':_clean(intel,650) or None,
            'updatedAt':int(time.time()),
        })
        return StartVideoResponse(
            jobId=job_id,
            status='running',
            progressStage='rendering_video',
            progressMessage='Generating your Quick Clip.',
            progressPercent=18,
        )
    except Exception as exc:
        latest=ref.get().to_dict() or {}
        refunded=True if admin else _refund_once(db,ref,latest,'kling_submit_failed')
        if submission_guarded:
            rollback_user_submission_window(db, uid)
        ref.update({
            'status':'failed',
            'progressStage':'failed',
            'progressPercent':100,
            'error':'Video generation could not start.'
                    + (' Your credits were returned.' if refunded and not admin else ''),
            'lastProviderError':str(exc)[:800],
            'updatedAt':int(time.time()),
        })
        raise HTTPException(
            status_code=502,
            detail='ADGen could not start the video. Credits were returned.',
        )


@router.post('/quick/start-image',response_model=StartVideoResponse)
async def quick_start_image(req:StartImageVideoRequest,authorization:str|None=Header(default=None)):
    return await _start_quick_common(req,authorization,image_url=req.promptImageUrl,base_prompt=_clean(req.promptText,1500))

@router.post('/quick/start-prompt',response_model=StartVideoResponse)
async def quick_start_prompt(req:StartPromptVideoRequest,authorization:str|None=Header(default=None)):
    return await _start_quick_common(req,authorization,image_url=None,base_prompt=_quick_prompt_base(req))


async def _finish_quick(job_id:str,job:Dict[str,Any],ref,db)->Dict[str,Any]:
    result=await _fal_result(str(job.get('falResponseUrl'))); video_url=_extract_video_url(result); ref.update({'progressStage':'processing_video','progressPercent':74,'progressMessage':'Processing the completed video.','klingOutputUrl':video_url,'updatedAt':int(time.time())}); data=await _download(video_url); final=data
    audio=job.get('audio') or {}; voice_mode=str(audio.get('voiceMode') or 'none')
    if voice_mode=='voiceover' and job.get('voiceoverScript'):
        ref.update({'progressStage':'adding_voiceover','progressPercent':82,'progressMessage':'Adding the selected AI narration.','updatedAt':int(time.time())})
        narration=await asyncio.to_thread(_openai_tts_bytes,str(job.get('voiceoverScript')),str((job.get('voiceover') or {}).get('presetVoice') or 'Leslie'))
        final=await asyncio.to_thread(_mix_voiceover,final,narration,keep_original_audio=True)
    if bool(audio.get('musicAndEffects')):
        ref.update({'progressStage':'adding_music','progressPercent':88,'progressMessage':'Adding subtle campaign-matched background music.','updatedAt':int(time.time())})
        quick_brief={'campaignType':'quick clip','subjectName':job.get('companyName'),'description':job.get('companyName'),'visualStyle':'commercial','tone':'campaign-matched'}
        try:
            music=await _generate_music_bed(quick_brief,{})
            final=await asyncio.to_thread(_mix_music_bed,final,music,duration=int(job.get('duration') or 6))
        except Exception as exc:
            print('[Video V2 Quick Music Warning]',repr(exc),flush=True)
            ref.update({'musicWarning':str(exc)[:800],'updatedAt':int(time.time())})
    ref.update({'progressStage':'uploading_video','progressPercent':94,'progressMessage':'Uploading your finished video.','updatedAt':int(time.time())}); user_doc=db.collection('users').document(str(job.get('uid'))).get().to_dict() or {}; tier,_=get_tier_and_status(user_doc); stored=await asyncio.to_thread(_save_video,db,str(job.get('uid')),tier,final,folder='generated_video_ads')
    ref.update({'progressStage':'saving_library','progressPercent':98,'progressMessage':'Saving your video to the Library.','updatedAt':int(time.time())}); ref.update({'status':'succeeded','progressStage':'succeeded','progressPercent':100,'progressMessage':'Your Quick Clip is ready.','finalVideoUrl':stored['url'],'storagePath':stored.get('storagePath'),'fileSizeBytes':stored.get('fileSizeBytes'),'updatedAt':int(time.time())}); return ref.get().to_dict() or job


@router.get('/quick/status/{job_id}',response_model=VideoStatusResponse)
async def quick_status(job_id:str,authorization:str|None=Header(default=None)):
    uid,_email,claims=require_user(authorization); admin=is_admin(claims); db=get_db(); ref=db.collection('video_jobs').document(job_id); job=ref.get().to_dict()
    if not job: raise HTTPException(status_code=404,detail='Video job not found.')
    if not admin and job.get('uid')!=uid: raise HTTPException(status_code=403,detail='Forbidden.')
    if job.get('status') in {'succeeded','failed'}: return VideoStatusResponse(jobId=job_id,status=job.get('status'),finalVideoUrl=job.get('finalVideoUrl'),error=job.get('error'),progressStage=job.get('progressStage'),progressMessage=job.get('progressMessage'),progressPercent=job.get('progressPercent'))
    try:
        st=await _fal_status(str(job.get('falStatusUrl'))); provider=str(st.get('status') or '').upper()
        if provider=='IN_QUEUE': ref.update({'progressStage':'rendering_video','progressPercent':20,'progressMessage':'Your video is queued for rendering.','providerStatus':provider,'updatedAt':int(time.time())})
        elif provider=='IN_PROGRESS': ref.update({'progressStage':'rendering_video','progressPercent':46,'progressMessage':'Generating your video.','providerStatus':provider,'updatedAt':int(time.time())})
        elif provider=='COMPLETED':
            if st.get('error'):
                latest=ref.get().to_dict() or job; refunded=_refund_once(db,ref,latest,'kling_provider_failed'); ref.update({'status':'failed','progressStage':'failed','progressPercent':100,'error':'ADGen could not complete this generation.'+(' Your credits were returned.' if refunded else ''),'providerError':str(st.get('error'))[:800]})
            else:
                job=ref.get().to_dict() or job
                if not job.get('finalVideoUrl'): await _finish_quick(job_id,job,ref,db)
    except Exception as exc:
        print('[Quick V2 video generation Status Error]',repr(exc),flush=True); ref.update({'lastStatusError':str(exc)[:800],'progressMessage':'Your video is still being checked.','updatedAt':int(time.time())})
    job=ref.get().to_dict() or job
    return VideoStatusResponse(jobId=job_id,status=str(job.get('status') or 'running'),finalVideoUrl=job.get('finalVideoUrl'),error=job.get('error'),progressStage=str(job.get('progressStage') or 'rendering_video'),progressMessage=str(job.get('progressMessage') or 'Generating your video.'),progressPercent=int(job.get('progressPercent') or 20))


@router.post('/quick/tts/preview')
async def quick_tts_preview(req:TTSPreviewRequest,authorization:str|None=Header(default=None)):
    uid,_email,_claims=require_user(authorization)
    db=get_db()
    user_doc=db.collection('users').document(uid).get().to_dict() or {}
    require_active_account(user_doc)
    await moderate_video_request(
        db,
        uid,
        text_parts=[req.text],
        image_url=None,
    )
    try:
        audio=await asyncio.to_thread(_openai_tts_bytes,req.text,str(req.presetVoice or 'Leslie'))
        stored=upload_bytes_to_firebase_storage_with_metadata(audio,uid,'audio/mpeg',folder='tts_previews',filename_hint='preview.mp3')
        return {'audioUrl':stored['url'],'cached':False}
    except Exception as exc:
        print('[Quick V2 TTS Preview]',repr(exc),flush=True); raise HTTPException(status_code=502,detail='The voice preview is temporarily unavailable.')


@router.get('/quick/download/{job_id}')
async def quick_download(job_id:str,authorization:str|None=Header(default=None)):
    from fastapi.responses import Response
    uid,_email,claims=require_user(authorization); admin=is_admin(claims); db=get_db(); job=db.collection('video_jobs').document(job_id).get().to_dict()
    if not job: raise HTTPException(status_code=404,detail='Video not found.')
    if not admin and job.get('uid')!=uid: raise HTTPException(status_code=403,detail='Forbidden.')
    url=str(job.get('finalVideoUrl') or '')
    if not url: raise HTTPException(status_code=409,detail='Video is not ready.')
    data=await _download(url); return Response(content=data,media_type='video/mp4',headers={'Content-Disposition':f'attachment; filename="adgen-{job_id}.mp4"'})
