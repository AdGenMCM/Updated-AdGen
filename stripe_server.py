# stripe_server.py
import os
import json
import logging
from typing import Optional, Dict, Any

import stripe
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import firebase_admin
from firebase_admin import credentials, firestore

# ----------------------------
# Logging
# ----------------------------
logger = logging.getLogger("stripe_server")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)


stripe_router = APIRouter()

# ----------------------------
# Firebase Admin (robust init)
# ----------------------------
def _init_firebase_once():
    """
    Supports FIREBASE_SERVICE_ACCOUNT_JSON as:
    - file path (Render Secret Files => /etc/secrets/xxx.json)
    - OR raw JSON string
    """
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    sa_value = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not sa_value:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not set.")

    # Case 1: file path
    if os.path.exists(sa_value):
        cred = credentials.Certificate(sa_value)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin initialized via file path.")
        return

    # Case 2: raw JSON
    try:
        sa_dict = json.loads(sa_value)
        cred = credentials.Certificate(sa_dict)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin initialized via JSON content.")
        return
    except Exception:
        pass

    raise RuntimeError(
        "FIREBASE_SERVICE_ACCOUNT_JSON must be a valid file path on the server "
        "or a JSON string containing the service account."
    )


def _db():
    _init_firebase_once()
    return firestore.client()

# ----------------------------
# Stripe config (lazy cache)
# ----------------------------
_price_map_cache: Optional[Dict[str, str]] = None


def _get_config() -> tuple[str, str, str, Dict[str, str]]:
    """
    Returns: (stripe_secret_key, webhook_secret, frontend_url, price_map)
    Lazily validates so Render doesn't crash at import time unless route is hit.
    """
    global _price_map_cache

    stripe_secret_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    webhook_secret = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()
    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    price_map_json = (os.getenv("STRIPE_PRICE_MAP_JSON") or "").strip()

    if not stripe_secret_key:
        raise HTTPException(status_code=500, detail="Server misconfigured: STRIPE_SECRET_KEY missing.")
    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Server misconfigured: STRIPE_WEBHOOK_SECRET missing.")
    if not price_map_json:
        raise HTTPException(status_code=500, detail="Server misconfigured: STRIPE_PRICE_MAP_JSON missing.")
    if not frontend_url:
        raise HTTPException(status_code=500, detail="Server misconfigured: FRONTEND_URL missing.")

    if _price_map_cache is None:
        try:
            _price_map_cache = json.loads(price_map_json)
        except Exception:
            raise HTTPException(status_code=500, detail="Server misconfigured: STRIPE_PRICE_MAP_JSON invalid JSON.")

        required = {"trial_monthly", "starter_monthly", "pro_monthly", "business_monthly"}
        missing = required - set(_price_map_cache.keys())
        if missing:
            raise HTTPException(
                status_code=500,
                detail=f"Server misconfigured: STRIPE_PRICE_MAP_JSON missing keys: {sorted(missing)}",
            )

    stripe.api_key = stripe_secret_key
    return stripe_secret_key, webhook_secret, frontend_url, _price_map_cache


def _price_id_to_tier(price_id: Optional[str], price_map: Dict[str, str]) -> Optional[str]:
    if not price_id:
        return None
    for tier, pid in price_map.items():
        if pid == price_id:
            return tier
    return None

# ----------------------------
# API Models
# ----------------------------
class CheckoutPayload(BaseModel):
    uid: str
    email: Optional[str] = None
    tier: str  # trial_monthly | starter_monthly | pro_monthly | business_monthly


class PortalPayload(BaseModel):
    customer_id: str

# ----------------------------
# Routes
# ----------------------------
@stripe_router.post("/create-checkout-session")
def create_checkout_session(body: CheckoutPayload):
    """
    Creates a Stripe Checkout session and returns { url }.
    """
    try:
        _, _, frontend_url, price_map = _get_config()

        if body.tier not in price_map:
            raise HTTPException(status_code=400, detail="Invalid tier")

        price_id = price_map[body.tier]
        db = _db()

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

        # Map customer -> uid
        db.collection("stripe_customers").document(customer_id).set({"uid": body.uid}, merge=True)

        # Save pending state
        user_ref.set(
            {"stripe": {"customerId": customer_id, "status": "pending", "requestedTier": body.tier}},
            merge=True,
        )

        try:
            session = stripe.checkout.Session.create(
                mode="subscription",
                customer=customer_id,
                line_items=[{"price": price_id, "quantity": 1}],
                success_url=f"{frontend_url}/subscribe?success=1&session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{frontend_url}/subscribe?canceled=1",
                allow_promotion_codes=True,
                automatic_tax={"enabled": True},
                billing_address_collection="required",
                customer_update={"address": "auto"},  # ✅ FIX: save address from Checkout onto Customer
            )
        except stripe.error.StripeError as e:
            msg = getattr(e, "user_message", None) or str(e)
            logger.exception("Stripe error creating checkout session: %s", msg)
            raise HTTPException(status_code=400, detail=f"Stripe error: {msg}")

        return {"url": session.url}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Server error in create_checkout_session: %r", e)
        raise HTTPException(status_code=500, detail=f"Server error: {repr(e)}")


@stripe_router.post("/create-portal-session")
def create_portal_session(body: PortalPayload):
    try:
        _, _, frontend_url, _ = _get_config()

        try:
            session = stripe.billing_portal.Session.create(
                customer=body.customer_id,
                return_url=f"{frontend_url}/subscribe",
            )
        except stripe.error.StripeError as e:
            msg = getattr(e, "user_message", None) or str(e)
            logger.exception("Stripe error creating billing portal session: %s", msg)
            raise HTTPException(status_code=400, detail=f"Stripe error: {msg}")

        return {"url": session.url}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Server error in create_portal_session: %r", e)
        raise HTTPException(status_code=500, detail=f"Server error: {repr(e)}")


@stripe_router.get("/sync-subscription")
def sync_subscription(uid: str, session_id: Optional[str] = None, customer_id: Optional[str] = None):
    """
    Repairs/syncs Firestore after checkout.
    Call with:
      - ?uid=...&session_id=cs_...
      OR
      - ?uid=...&customer_id=cus_...
    """
    try:
        _, _, _, price_map = _get_config()
        db = _db()

        resolved_customer = None
        resolved_sub = None
        resolved_status = None
        resolved_price_id = None
        resolved_tier = None
        resolved_period_end = None

        if session_id:
            try:
                session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
            except stripe.error.StripeError as e:
                msg = getattr(e, "user_message", None) or str(e)
                logger.exception("Stripe error retrieving checkout session: %s", msg)
                raise HTTPException(status_code=400, detail=f"Stripe error: {msg}")

            resolved_customer = session.get("customer")
            sub = session.get("subscription") or {}
            resolved_sub = sub.get("id")
            resolved_status = sub.get("status")

            items = (sub.get("items") or {}).get("data") or []
            if items and items[0].get("price"):
                resolved_price_id = items[0]["price"].get("id")
                resolved_tier = _price_id_to_tier(resolved_price_id, price_map)

            resolved_period_end = sub.get("current_period_end")

        elif customer_id:
            try:
                subs = stripe.Subscription.list(customer=customer_id, status="all", limit=1)
            except stripe.error.StripeError as e:
                msg = getattr(e, "user_message", None) or str(e)
                logger.exception("Stripe error listing subscriptions: %s", msg)
                raise HTTPException(status_code=400, detail=f"Stripe error: {msg}")

            if subs.data:
                sub = subs.data[0]
                resolved_customer = sub.get("customer")
                resolved_sub = sub.get("id")
                resolved_status = sub.get("status")

                items = (sub.get("items") or {}).get("data") or []
                if items and items[0].get("price"):
                    resolved_price_id = items[0]["price"].get("id")
                    resolved_tier = _price_id_to_tier(resolved_price_id, price_map)

                resolved_period_end = sub.get("current_period_end")

        else:
            raise HTTPException(status_code=400, detail="Provide session_id or customer_id")

        active_like = {"active", "trialing", "past_due"}
        status = "active" if (resolved_status in active_like) else "pending"

        if resolved_customer:
            db.collection("stripe_customers").document(resolved_customer).set({"uid": uid}, merge=True)

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

        db.collection("users").document(uid).set({"stripe": stripe_update}, merge=True)

        return {"ok": True, "status": status, "tier": resolved_tier, "price_id": resolved_price_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Server error in sync_subscription: %r", e)
        raise HTTPException(status_code=500, detail=f"Server error: {repr(e)}")


@stripe_router.post("/webhook")
async def webhook(request: Request):
    try:
        _, webhook_secret, _, price_map = _get_config()
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")

        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        except Exception as e:
            logger.exception("Webhook signature/construct error: %r", e)
            return JSONResponse(status_code=400, content={"error": f"Webhook error: {e}"})

        db = _db()
        event_type = event.get("type")
        obj = event.get("data", {}).get("object", {})

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
                    tier = _price_id_to_tier(price_id, price_map)

            if event_type == "customer.subscription.deleted":
                status = "inactive"

            if customer_id:
                uid = None
                doc = db.collection("stripe_customers").document(customer_id).get()
                if doc.exists:
                    uid = (doc.to_dict() or {}).get("uid")

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
                    if period_end:
                        update["stripe"]["currentPeriodEnd"] = period_end

                    db.collection("users").document(uid).set(update, merge=True)

        return {"received": True}

    except Exception as e:
        logger.exception("Server error in webhook: %r", e)
        return JSONResponse(status_code=500, content={"error": f"Server error: {repr(e)}"})












