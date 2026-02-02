# main.py
import os
import json
import base64
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

import stripe
import firebase_admin
from firebase_admin import credentials, firestore

from openai import OpenAI

# ✅ IMPORTANT:
# If your repo actually has providers/ideogram.py, keep this import.
# If ideogram.py sits next to main.py, use: from ideogram import generate_ideogram
from providers.ideogram import generate_ideogram

load_dotenv(override=True)

# ----------------------------
# App
# ----------------------------
app = FastAPI()

@app.get("/")
def root():
  return {"status": "ok", "service": "AdGen backend (merged)", "message": "Backend is running"}

# ----------------------------
# CORS
# ----------------------------
FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")

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
  allow_credentials=True,   # your current setup expects this
  allow_methods=["*"],
  allow_headers=["*"],
)

# ----------------------------
# OpenAI
# ----------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
IDEOGRAM_API_KEY = os.getenv("IDEOGRAM_API_KEY", "").strip()

if not OPENAI_API_KEY:
  raise RuntimeError("OPENAI_API_KEY is missing.")
if not IDEOGRAM_API_KEY:
  raise RuntimeError("IDEOGRAM_API_KEY is missing.")

client = OpenAI(api_key=OPENAI_API_KEY)

# ----------------------------
# Firebase Admin (robust)
# ----------------------------
def init_firebase_once():
  """
  Supports FIREBASE_SERVICE_ACCOUNT_JSON as:
  - a file path (Render Secret Files -> /etc/secrets/xxx.json)
  - OR raw JSON content
  """
  try:
    firebase_admin.get_app()
    return
  except ValueError:
    pass

  sa_value = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
  if not sa_value:
    raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")

  # path?
  if os.path.exists(sa_value):
    cred = credentials.Certificate(sa_value)
    firebase_admin.initialize_app(cred)
    return

  # raw json?
  try:
    sa_dict = json.loads(sa_value)
    cred = credentials.Certificate(sa_dict)
    firebase_admin.initialize_app(cred)
    return
  except Exception:
    pass

  raise RuntimeError(
    "FIREBASE_SERVICE_ACCOUNT_JSON must be a valid file path on the server "
    "or a JSON string containing the service account."
  )

def db():
  init_firebase_once()
  return firestore.client()

# ----------------------------
# Stripe settings
# ----------------------------
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
PRICE_MAP_JSON = os.getenv("STRIPE_PRICE_MAP_JSON", "").strip()

if not STRIPE_SECRET_KEY:
  raise RuntimeError("Missing STRIPE_SECRET_KEY")
if not PRICE_MAP_JSON:
  raise RuntimeError("Missing STRIPE_PRICE_MAP_JSON")

try:
  PRICE_MAP: Dict[str, str] = json.loads(PRICE_MAP_JSON)
except Exception:
  raise RuntimeError("STRIPE_PRICE_MAP_JSON must be valid JSON")

required_keys = {"trial_monthly", "starter_monthly", "pro_monthly", "business_monthly"}
missing = required_keys - set(PRICE_MAP.keys())
if missing:
  raise RuntimeError(f"STRIPE_PRICE_MAP_JSON missing keys: {sorted(missing)}")

stripe.api_key = STRIPE_SECRET_KEY

def price_id_to_tier(price_id: Optional[str]) -> Optional[str]:
  if not price_id:
    return None
  for tier, pid in PRICE_MAP.items():
    if pid == price_id:
      return tier
  return None

# ----------------------------
# Generate Ad
# ----------------------------
class AdRequest(BaseModel):
  product_name: str
  description: str
  audience: str
  tone: str
  platform: str
  imageSize: str  # "1024x1024" | "1024x1792" | "1792x1024"

def size_to_aspect_ratio(size: str) -> str:
  s = size.lower().replace(" ", "")
  if s in ("1024x1792", "720x1280", "1080x1920"):
    return "9x16"
  if s in ("1792x1024", "1280x720", "1920x1080"):
    return "16x9"
  return "1x1"

@app.post("/generate-ad")
def generate_ad(payload: AdRequest):
  prompt = (
    f"Create a compelling {payload.tone.lower()} ad for {payload.product_name}, "
    f"described as: \"{payload.description}\". "
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

  aspect_ratio = size_to_aspect_ratio(payload.imageSize)

  visual_prompt = (
    f"Studio product photograph for a {payload.tone.lower()} {payload.platform} ad "
    f"featuring {payload.product_name}. Clean composition, brand-safe, "
    f"gradient or soft background, negative space reserved for headline area, "
    f"no overlays, no labels on background, natural lighting, high contrast, balanced framing."
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

  return {"text": ad_text, "imageUrl": data_url}

# ----------------------------
# Stripe: API Models
# ----------------------------
class CheckoutPayload(BaseModel):
  uid: str
  email: Optional[str] = None
  tier: str  # trial_monthly | starter_monthly | pro_monthly | business_monthly

class PortalPayload(BaseModel):
  customer_id: str

# ----------------------------
# Stripe: Endpoints
# ----------------------------
@app.post("/create-checkout-session")
def create_checkout_session(body: CheckoutPayload):
  if body.tier not in PRICE_MAP:
    raise HTTPException(status_code=400, detail="Invalid tier")

  price_id = PRICE_MAP[body.tier]
  d = db()

  user_ref = d.collection("users").document(body.uid)
  user_data = user_ref.get().to_dict() or {}
  stripe_info = user_data.get("stripe") or {}
  customer_id = stripe_info.get("customerId")

  if not customer_id:
    customer = stripe.Customer.create(
      email=body.email or None,
      metadata={"firebase_uid": body.uid},
    )
    customer_id = customer.id

  # map customer -> uid
  d.collection("stripe_customers").document(customer_id).set({"uid": body.uid}, merge=True)

  # store pending state immediately
  user_ref.set(
    {"stripe": {"customerId": customer_id, "status": "pending", "requestedTier": body.tier}},
    merge=True,
  )

  session = stripe.checkout.Session.create(
    mode="subscription",
    customer=customer_id,
    line_items=[{"price": price_id, "quantity": 1}],
    success_url=f"{FRONTEND_URL}/subscribe?success=1&session_id={{CHECKOUT_SESSION_ID}}",
    cancel_url=f"{FRONTEND_URL}/subscribe?canceled=1",
    allow_promotion_codes=True,
    automatic_tax={"enabled": True},
    billing_address_collection="required",
  )

  return {"url": session.url}


@app.post("/create-portal-session")
def create_portal_session(body: PortalPayload):
  session = stripe.billing_portal.Session.create(
    customer=body.customer_id,
    return_url=f"{FRONTEND_URL}/subscribe",
  )
  return {"url": session.url}


@app.get("/sync-subscription")
def sync_subscription(uid: str, session_id: Optional[str] = None, customer_id: Optional[str] = None):
  """
  Repairs/syncs Firestore after checkout.
  Call with:
   - ?uid=...&session_id=cs_...
   OR
   - ?uid=...&customer_id=cus_...
  """
  d = db()

  resolved_customer = None
  resolved_sub = None
  resolved_status = None
  resolved_price_id = None
  resolved_tier = None
  resolved_period_end = None

  if session_id:
    session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
    resolved_customer = session.get("customer")
    sub = session.get("subscription") or {}
    resolved_sub = sub.get("id")
    resolved_status = sub.get("status")

    items = (sub.get("items") or {}).get("data") or []
    if items and items[0].get("price"):
      resolved_price_id = items[0]["price"].get("id")
      resolved_tier = price_id_to_tier(resolved_price_id)

    resolved_period_end = sub.get("current_period_end")

  elif customer_id:
    subs = stripe.Subscription.list(customer=customer_id, status="all", limit=1)
    if subs.data:
      sub = subs.data[0]
      resolved_customer = sub.get("customer")
      resolved_sub = sub.get("id")
      resolved_status = sub.get("status")

      items = (sub.get("items") or {}).get("data") or []
      if items and items[0].get("price"):
        resolved_price_id = items[0]["price"].get("id")
        resolved_tier = price_id_to_tier(resolved_price_id)

      resolved_period_end = sub.get("current_period_end")
  else:
    raise HTTPException(status_code=400, detail="Provide session_id or customer_id")

  active_like = {"active", "trialing", "past_due"}
  status = "active" if (resolved_status in active_like) else "pending"

  if resolved_customer:
    d.collection("stripe_customers").document(resolved_customer).set({"uid": uid}, merge=True)

  stripe_update: Dict[str, Any] = {
    "customerId": resolved_customer,
    "subscriptionId": resolved_sub,
    "status": status,
    "updatedAt": firestore.SERVER_TIMESTAMP,
  }
  if resolved_price_id:
    stripe_update["priceId"] = resolved_price_id
  if resolved_tier:
    stripe_update["tier"] = resolved_tier
  if resolved_period_end:
    stripe_update["currentPeriodEnd"] = resolved_period_end

  d.collection("users").document(uid).set({"stripe": stripe_update}, merge=True)

  return {"ok": True, "status": status, "tier": resolved_tier, "price_id": resolved_price_id}


@app.post("/webhook")
async def webhook(request: Request):
  payload = await request.body()
  sig_header = request.headers.get("stripe-signature")

  try:
    event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
  except Exception as e:
    return JSONResponse(status_code=400, content={"error": f"Webhook error: {e}"})

  d = db()
  event_type = event.get("type")
  obj = event.get("data", {}).get("object", {})

  # Handle subscription changes
  if event_type in {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  }:
    customer_id = obj.get("customer")
    sub_id = obj.get("subscription") or obj.get("id")

    tier = None
    price_id = None
    period_end = None
    status = "inactive"

    if event_type == "checkout.session.completed":
      status = "active"

    if event_type in {"customer.subscription.created", "customer.subscription.updated"}:
      sub_status = obj.get("status")
      active_like = {"active", "trialing", "past_due"}
      status = "active" if sub_status in active_like else "inactive"
      period_end = obj.get("current_period_end")

      items = obj.get("items", {}).get("data", [])
      if items and items[0].get("price"):
        price_id = items[0]["price"].get("id")
        tier = price_id_to_tier(price_id)

    if event_type == "customer.subscription.deleted":
      status = "inactive"

    if customer_id:
      # Resolve uid
      uid = None
      doc = d.collection("stripe_customers").document(customer_id).get()
      if doc.exists:
        uid = (doc.to_dict() or {}).get("uid")

      # fallback: try Stripe metadata
      if not uid:
        try:
          cust = stripe.Customer.retrieve(customer_id)
          uid = (cust.metadata or {}).get("firebase_uid")
          if uid:
            d.collection("stripe_customers").document(customer_id).set({"uid": uid}, merge=True)
        except Exception:
          uid = None

      if uid:
        update = {
          "stripe": {
            "customerId": customer_id,
            "subscriptionId": sub_id,
            "status": status,
            "updatedAt": firestore.SERVER_TIMESTAMP,
          }
        }
        if price_id:
          update["stripe"]["priceId"] = price_id
        if tier:
          update["stripe"]["tier"] = tier
        if period_end:
          update["stripe"]["currentPeriodEnd"] = period_end

        d.collection("users").document(uid).set(update, merge=True)

  return {"received": True}
