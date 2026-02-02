# stripe_server.py
import os
import json
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

import stripe

import firebase_admin
from firebase_admin import credentials, firestore


stripe_router = APIRouter()


# ---------------- Env + settings ----------------
STRIPE_SECRET_KEY: Optional[str] = None
WEBHOOK_SECRET: Optional[str] = None
FRONTEND_URL: str = "http://localhost:3000"
FIREBASE_SA_PATH: Optional[str] = None

PRICE_MAP: Dict[str, str] = {}  # e.g. {"trial_monthly":"price_...", ...}


def _load_settings_from_env() -> None:
    global STRIPE_SECRET_KEY, WEBHOOK_SECRET, FRONTEND_URL, FIREBASE_SA_PATH, PRICE_MAP

    load_dotenv(override=True)

    STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()  # live webhook secret
    FRONTEND_URL = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    FIREBASE_SA_PATH = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()

    price_map_json = (os.getenv("STRIPE_PRICE_MAP_JSON") or "").strip()

    if not STRIPE_SECRET_KEY:
        raise RuntimeError("Missing STRIPE_SECRET_KEY")
    if not FIREBASE_SA_PATH or not os.path.exists(FIREBASE_SA_PATH):
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON path is missing or invalid")
    if not price_map_json:
        raise RuntimeError("Missing STRIPE_PRICE_MAP_JSON")

    try:
        PRICE_MAP = json.loads(price_map_json)
    except Exception:
        raise RuntimeError("STRIPE_PRICE_MAP_JSON must be valid JSON")

    required = {"trial_monthly", "starter_monthly", "pro_monthly", "business_monthly"}
    missing = required - set(PRICE_MAP.keys())
    if missing:
        raise RuntimeError(f"STRIPE_PRICE_MAP_JSON missing keys: {sorted(missing)}")

    stripe.api_key = STRIPE_SECRET_KEY


_load_settings_from_env()


# ---------------- Firebase init ----------------
def init_firebase_once() -> None:
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
    tier: str  # trial_monthly | starter_monthly | pro_monthly | business_monthly


class PortalPayload(BaseModel):
    customer_id: str


# ---------------- Helpers ----------------
def price_id_to_tier(price_id: Optional[str]) -> Optional[str]:
    if not price_id:
        return None
    for tier, pid in PRICE_MAP.items():
        if pid == price_id:
            return tier
    return None


# ---------------- Routes ----------------
@stripe_router.get("/health")
def health():
    return {"ok": True}


@stripe_router.post("/create-checkout-session")
def create_checkout_session(body: CheckoutPayload):
    """
    Creates a Stripe Checkout Session for a subscription tier.
    Writes:
      - stripe_customers/{customerId} -> { uid }
      - users/{uid}.stripe.customerId + status='pending' + requestedTier
    """
    try:
        if body.tier not in PRICE_MAP:
            raise HTTPException(status_code=400, detail="Invalid tier")

        price_id = PRICE_MAP[body.tier]
        db = get_db()

        # 1) Fetch existing Stripe customer for this uid (if any)
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

        # 2) Reverse index + pending status
        db.collection("stripe_customers").document(customer_id).set({"uid": body.uid}, merge=True)
        user_ref.set(
            {"stripe": {"customerId": customer_id, "status": "pending", "requestedTier": body.tier}},
            merge=True,
        )

        # 3) Checkout session
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
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


@stripe_router.post("/create-portal-session")
def create_portal_session(body: PortalPayload):
    """Returns a Billing Portal URL for the given customer."""
    try:
        session = stripe.billing_portal.Session.create(
            customer=body.customer_id,
            return_url=f"{FRONTEND_URL}/account",
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@stripe_router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Handles Stripe events and writes users/{uid}.stripe:
      - status, tier, priceId
      - subscriptionId
      - currentPeriodStart/currentPeriodEnd  ✅ for billing-cycle caps
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        if WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)
        else:
            # local dev only
            event = json.loads(payload.decode("utf-8"))
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"Webhook error: {e}"})

    db = get_db()
    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {})

    if event_type in {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        customer_id = None
        sub_id = None
        status = None
        price_id = None
        tier = None
        period_start = None
        period_end = None

        if event_type == "checkout.session.completed":
            customer_id = obj.get("customer")
            sub_id = obj.get("subscription")
            status = "active"

        elif event_type in {"customer.subscription.created", "customer.subscription.updated"}:
            customer_id = obj.get("customer")
            sub_id = obj.get("id")
            sub_status = obj.get("status") or "inactive"
            status = "active" if sub_status in {"active", "trialing", "past_due"} else "inactive"

            items = obj.get("items", {}).get("data", []) or []
            if items and items[0].get("price"):
                price_id = items[0]["price"].get("id")
                tier = price_id_to_tier(price_id)

            # ✅ Stripe billing cycle boundaries
            period_start = obj.get("current_period_start")
            period_end = obj.get("current_period_end")

        else:  # deleted
            customer_id = obj.get("customer")
            sub_id = obj.get("id")
            status = "inactive"

        if customer_id:
            # resolve uid from reverse index or customer metadata
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
                update: Dict[str, Any] = {
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
                if period_start:
                    update["stripe"]["currentPeriodStart"] = int(period_start)
                if period_end:
                    update["stripe"]["currentPeriodEnd"] = int(period_end)

                db.collection("users").document(uid).set(update, merge=True)

    return {"received": True}


@stripe_router.get("/sync-subscription")
def sync_subscription(
    uid: str = Query(...),
    session_id: Optional[str] = Query(default=None),
    customer_id: Optional[str] = Query(default=None),
):
    """
    Repairs subscription state after checkout.
    Writes tier/priceId + currentPeriodStart/End ✅
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
        resolved_period_start = None
        resolved_period_end = None

        if session_id:
            session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
            resolved_customer = session.get("customer")
            subscription = session.get("subscription") or {}

            resolved_sub_id = subscription.get("id")
            resolved_sub_status = subscription.get("status")
            resolved_session_status = session.get("status")
            resolved_payment_status = session.get("payment_status")

            items = (subscription.get("items") or {}).get("data") or []
            if items and items[0].get("price"):
                resolved_price_id = items[0]["price"].get("id")
                resolved_tier = price_id_to_tier(resolved_price_id)

            resolved_period_start = subscription.get("current_period_start")
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

                resolved_period_start = latest.get("current_period_start")
                resolved_period_end = latest.get("current_period_end")

            status = "active" if (resolved_sub_status in {"active", "trialing", "past_due"}) else "pending"

        else:
            raise HTTPException(status_code=400, detail="Provide session_id (cs_...) or customer_id (cus_...).")

        if resolved_customer:
            db.collection("stripe_customers").document(resolved_customer).set({"uid": uid}, merge=True)

        stripe_update: Dict[str, Any] = {
            "customerId": resolved_customer,
            "subscriptionId": resolved_sub_id,
            "status": status,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if resolved_price_id:
            stripe_update["priceId"] = resolved_price_id
        if resolved_tier:
            stripe_update["tier"] = resolved_tier
        if resolved_period_start:
            stripe_update["currentPeriodStart"] = int(resolved_period_start)
        if resolved_period_end:
            stripe_update["currentPeriodEnd"] = int(resolved_period_end)

        db.collection("users").document(uid).set({"stripe": stripe_update}, merge=True)

        return {
            "ok": True,
            "status": status,
            "subscription_status": resolved_sub_status,
            "session_status": resolved_session_status,
            "payment_status": resolved_payment_status,
            "price_id": resolved_price_id,
            "tier": resolved_tier,
            "current_period_start": resolved_period_start,
            "current_period_end": resolved_period_end,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))













