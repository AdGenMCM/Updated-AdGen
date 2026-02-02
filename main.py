# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# new: for reading the image and encoding as data URL
import base64

# IMPORTANT: adjust this import to match your file layout.
# If your file is at providers/ideogram.py, use:
from providers.ideogram import generate_ideogram
# If ideogram.py sits next to main.py, use:
# from ideogram import generate_ideogram

load_dotenv()

# --- API key checks ---
openai_key = os.getenv("OPENAI_API_KEY")
if not openai_key:
    raise RuntimeError("OPENAI_API_KEY is missing. Check your .env file.")

ideogram_key = os.getenv("IDEOGRAM_API_KEY")
if not ideogram_key:
    raise RuntimeError("IDEOGRAM_API_KEY is missing. Check your .env file.")

# Initialize OpenAI client
client = OpenAI(api_key=openai_key)


app = FastAPI()

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "AdGen backend",
        "message": "Backend is running"
    }

# CORS for your local frontend (add your prod origin when you deploy)
FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://adgenmcm.com",
    "https://www.adgenmcm.com",
]

# Keep env var too (optional, but fine)
if FRONTEND_URL:
    origins.append(FRONTEND_URL)

# Deduplicate in case FRONTEND_URL matches one above
origins = list(dict.fromkeys(origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# OpenAI stays for ad copy
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class AdRequest(BaseModel):
    product_name: str
    description: str
    audience: str
    tone: str
    platform: str
    imageSize: str  # "1024x1024" | "1024x1792" | "1792x1024"

def size_to_aspect_ratio(size: str) -> str:
    """
    Map your UI's size to Ideogram's aspect ratios.
    """
    s = size.lower().replace(" ", "")
    if s in ("1024x1792", "720x1280", "1080x1920"):
        return "9x16"
    if s in ("1792x1024", "1280x720", "1920x1080"):
        return "16x9"
    return "1x1"

@app.post("/generate-ad")
def generate_ad(request: AdRequest):
    # 1) Generate ad copy (OpenAI)
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

    # 2) Generate the image via Ideogram provider
    aspect_ratio = size_to_aspect_ratio(request.imageSize)

    # If you DON'T want text rendered in the image, remove the quotes & ad_text here.

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
        # providers/ideogram.py returns a list of local file paths
        paths = generate_ideogram(
            prompt=visual_prompt,
            aspect_ratio=aspect_ratio,
            rendering_speed="DEFAULT",
            num_images=1
        )
        if not paths:
            raise HTTPException(status_code=502, detail="Ideogram returned no images")
        image_path = paths[0]
        # read file and return as base64 data URL (so your frontend <img src=...> works)
        with open(image_path, "rb") as f:
            img_bytes = f.read()
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        data_url = f"data:image/png;base64,{b64}"
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ideogram image generation failed: {e}")

    return {"text": ad_text, "imageUrl": data_url}