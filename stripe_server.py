# stripe_server.py
import os
import json
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from dotenv import load_dotenv
import stripe

# Firebase Admin
# stripe_server.py
import os
import json
from typing import Optional, Dict

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from dotenv import load_dotenv
import stripe

# Firebase Admin
import firebase_admin
from firebase_admin import credentials, firestore


# ---------------- FastAPI app ----------------
app = FastAPI()

FRONTEND_FALLBACK = "http://localhost:3000"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_FALLBACK, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- Env + settings ----------------
STRIPE_SECRET_KEY = None
WEBHOOK_SECRET = None
FRONTEND_URL = None
FIREBASE_SA_PATH = None

PRICE_MAP_JSON = None
PRICE_MAP: Dict[str, str] = {}

def _load_settings_from_env():
    """Load .env and refresh all runtime settings + Stripe key."""
    global STRIPE_SECRET_KEY, WEBHOOK_SECRET, FRONTEND_URL, FIREBASE_SA_PATH
    global PRICE_MAP_JSON, PRICE_MAP

    load_dotenv(override=True)

    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
    WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")  # must be set in production
    FRONTEND_URL = os.getenv("FRONTEND_URL", FRONTEND_FALLBACK)
    FIREBASE_SA_PATH = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

    PRICE_MAP_JSON = os.getenv("STRIPE_PRICE_MAP_JSON")

    if not STRIPE_SECRET_KEY:
        raise RuntimeError("Missing STRIPE_SECRET_KEY")
    if not FIREBASE_SA_PATH or not os.path.exists(FIREBASE_SA_PATH):
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON path is missing or invalid")
    if not PRICE_MAP_JSON:
        raise RuntimeError("Missing STRIPE_PRICE_MAP_JSON")

    try:
        PRICE_MAP = json.loads(PRICE_MAP_JSON)
    except Exception:
        raise RuntimeError("STRIPE_PRICE_MAP_JSON must be valid JSON")

    required = {"trial_monthly", "starter_monthly", "pro_monthly", "business_monthly"}
    missing = required - set(PRICE_MAP.keys())
    if missing:
        raise RuntimeError(f"STRIPE_PRICE_MAP_JSON missing keys: {sorted(missing)}")

    stripe.api_key = STRIPE_SECRET_KEY
    print("ENV reloaded:", {"FRONTEND_URL": FRONTEND_URL, "WEBHOOK_SECRET?": bool(WEBHOOK_SECRET)})

@app.on_event("startup")
def on_startup_reload_env():
    _load_settings_from_env()


# ---------------- Firebase init ----------------
def init_firebase_once():
    try:
        firebase_admin.get_app()
    except ValueError:
        cred = credentials.Certificate(FIREBASE_SA_PATH)
        firebase_admin.initialize_app(cred)

def get_db():
    init_firebase_once()
    return firestore.client()


# ---------------- Models ----------------
class CheckoutPayload(BaseModel):
    uid: str
    email: Optional[str] = None
    tier: str  # "trial_monthly" | "starter_monthly" | "pro_monthly" | "business_monthly"

class PortalPayload(BaseModel):
    customer_id: str


# ---------------- Helpers ----------------
def price_id_to_tier(price_id: Optional[str]) -> Optional[str]:
    if not price_id:
        return None
    for k, v in PRICE_MAP.items():
        if v == price_id:
            return k
    return None


# ---------------- Routes ----------------
@app.get("/health")
def health():
    return {"ok": True}


@app.post("/create-checkout-session")
def create_checkout_session(body: CheckoutPayload):
    """
    Creates a Stripe Checkout Session for a subscription for a specific tier/price.
    Also writes:
      - reverse index: stripe_customers/{customerId} -> { uid }
      - users/{uid}.stripe.customerId + status = 'pending'
    """
    try:
        if body.tier not in PRICE_MAP:
            raise HTTPException(status_code=400, detail="Invalid tier")

        selected_price_id = PRICE_MAP[body.tier]

        db = get_db()

        # 1) Create or fetch Stripe Customer mapped to this uid
        user_ref = db.collection("users").document(body.uid)
        user_data = user_ref.get().to_dict() or {}
        stripe_info = user_data.get("stripe") or {}
        customer_id = stripe_info.get("customerId")

        if not customer_id:
            customer = stripe.Customer.create(
                email=body.email or None,
                metadata={"firebase_uid": body.uid},
            )
            customer_id = customer.id

        # 2) Reverse index & pending status (store chosen tier for your UI)
        db.collection("stripe_customers").document(customer_id).set({"uid": body.uid}, merge=True)
        user_ref.set(
            {"stripe": {"customerId": customer_id, "status": "pending", "requestedTier": body.tier}},
            merge=True,
        )

        # 3) Create Checkout Session
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": selected_price_id, "quantity": 1}],
            success_url=f"{FRONTEND_URL}/subscribe?success=1&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/subscribe?canceled=1",
            allow_promotion_codes=True,
            automatic_tax={"enabled": True},
            billing_address_collection="required",
            customer_update={"address": "auto", "shipping": "auto"},
        )

        return {"url": session.url}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/create-portal-session")
def create_portal_session(body: PortalPayload):
    """Returns a Billing Portal URL for the given customer."""
    try:
        session = stripe.billing_portal.Session.create(
            customer=body.customer_id,
            return_url=f"{FRONTEND_URL}/subscribe",
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Handles Stripe events:
      - checkout.session.completed
      - customer.subscription.created|updated|deleted
    Uses reverse index to update users/{uid}.stripe
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        if WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)
        else:
            # OK for local dev only; do not rely on this in production.
            event = json.loads(payload.decode("utf-8"))
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"Webhook error: {e}"})

    db = get_db()

    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {})

    # We primarily trust subscription.* events for plan/status
    if event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "checkout.session.completed",
    }:
        customer_id = None
        sub_id = None
        status = None
        price_id = None
        tier = None
        current_period_end = None

        if event_type == "checkout.session.completed":
            # Helpful, but not the source of truth for plan; subscription events will follow.
            customer_id = obj.get("customer")
            sub_id = obj.get("subscription")
            status = "active"
        elif event_type in {"customer.subscription.created", "customer.subscription.updated"}:
            customer_id = obj.get("customer")
            sub_id = obj.get("id")
            sub_status = obj.get("status")

            active_like = {"active", "trialing", "past_due"}
            status = "active" if sub_status in active_like else "inactive"

            # Extract price id from subscription items
            items = obj.get("items", {}).get("data", [])
            if items and items[0].get("price"):
                price_id = items[0]["price"].get("id")

            tier = price_id_to_tier(price_id)
            current_period_end = obj.get("current_period_end")  # unix seconds
        else:  # deleted
            customer_id = obj.get("customer")
            sub_id = obj.get("id")
            status = "inactive"

        if customer_id:
            # Prefer reverse index, fall back to customer metadata if needed
            uid = None
            m = db.collection("stripe_customers").document(customer_id).get()
            if m.exists:
                uid = (m.to_dict() or {}).get("uid")
            if not uid:
                try:
                    cust = stripe.Customer.retrieve(customer_id)
                    uid = (cust.metadata or {}).get("firebase_uid")
                    if uid:
                        db.collection("stripe_customers").document(customer_id).set({"uid": uid}, merge=True)
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

                # Only store tier/priceId when we have it (subscription events)
                if price_id:
                    update["stripe"]["priceId"] = price_id
                if tier:
                    update["stripe"]["tier"] = tier
                if current_period_end:
                    update["stripe"]["currentPeriodEnd"] = current_period_end  # unix seconds

                db.collection("users").document(uid).set(update, merge=True)

    print("WEBHOOK OK:", event.get("type"))
    return {"received": True}


# -------- OPTIONAL: success-page fallback (accepts session_id OR customer_id)
@app.get("/sync-subscription")
def sync_subscription(
    uid: str = Query(...),
    session_id: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
):
    """
    Confirms/repairs subscription state after Checkout.
    - If session_id (cs_...) is provided: fetch Checkout Session + subscription.
    - Else if customer_id (cus_...) is provided: fetch customer's latest subscription.
    Updates users/{uid}.stripe to 'active' if paid/active, and maintains reverse index.
    """
    try:
        db = get_db()

        resolved_customer = None
        resolved_sub_id = None
        resolved_sub_status = None
        resolved_session_status = None
        resolved_payment_status = None
        resolved_price_id = None
        resolved_tier = None
        resolved_period_end = None

        if session_id:
            session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
            resolved_customer = session.get("customer")
            subscription = session.get("subscription") or {}
            resolved_sub_id = subscription.get("id")
            resolved_sub_status = subscription.get("status")
            resolved_session_status = session.get("status")
            resolved_payment_status = session.get("payment_status")

            # Get price from expanded subscription if present
            items = (subscription.get("items") or {}).get("data") or []
            if items and items[0].get("price"):
                resolved_price_id = items[0]["price"].get("id")
                resolved_tier = price_id_to_tier(resolved_price_id)

            resolved_period_end = subscription.get("current_period_end")

            active_like = {"active", "trialing", "past_due"}
            status = "active" if (
                resolved_sub_status in active_like or
                (resolved_session_status == "complete" and resolved_payment_status == "paid")
            ) else "pending"

        elif customer_id:
            subs = stripe.Subscription.list(customer=customer_id, status="all", limit=1)
            if subs.data:
                latest = subs.data[0]
                resolved_customer = latest.get("customer")
                resolved_sub_id = latest.get("id")
                resolved_sub_status = latest.get("status")

                items = (latest.get("items") or {}).get("data") or []
                if items and items[0].get("price"):
                    resolved_price_id = items[0]["price"].get("id")
                    resolved_tier = price_id_to_tier(resolved_price_id)

                resolved_period_end = latest.get("current_period_end")

            active_like = {"active", "trialing", "past_due"}
            status = "active" if (resolved_sub_status in active_like) else "pending"
        else:
            raise HTTPException(status_code=400, detail="Provide session_id (cs_...) or customer_id (cus_...).")

        if resolved_customer:
            db.collection("stripe_customers").document(resolved_customer).set({"uid": uid}, merge=True)

        stripe_update = {
            "customerId": resolved_customer,
            "subscriptionId": resolved_sub_id,
            "status": status,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if resolved_price_id:
            stripe_update["priceId"] = resolved_price_id
        if resolved_tier:
            stripe_update["tier"] = resolved_tier
        if resolved_period_end:
            stripe_update["currentPeriodEnd"] = resolved_period_end

        db.collection("users").document(uid).set({"stripe": stripe_update}, merge=True)

        return {
            "ok": True,
            "status": status,
            "subscription_status": resolved_sub_status,
            "session_status": resolved_session_status,
            "payment_status": resolved_payment_status,
            "price_id": resolved_price_id,
            "tier": resolved_tier,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))








