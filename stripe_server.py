# stripe_server.py
import os
import json
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Request, Query, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

import stripe

from firebase_admin import firestore
from auth_helpers import get_db, get_bearer_token, verify_firebase_token
from notification_utils import create_notification
from customer_intelligence.event_service import track_event


stripe_router = APIRouter()


# ---------------- Env + settings ----------------
STRIPE_SECRET_KEY: Optional[str] = None
WEBHOOK_SECRET: Optional[str] = None
FRONTEND_URL: str = "http://localhost:3000"
FIREBASE_SA_PATH: Optional[str] = None

PRICE_MAP: Dict[str, str] = {}
LEGACY_PRICE_MAP: Dict[str, str] = {}
PRICE_TO_TIER: Dict[str, str] = {}


def _load_settings_from_env() -> None:
    global STRIPE_SECRET_KEY, WEBHOOK_SECRET, FRONTEND_URL, FIREBASE_SA_PATH
    global PRICE_MAP, LEGACY_PRICE_MAP, PRICE_TO_TIER

    load_dotenv(override=True)

    STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()
    FRONTEND_URL = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    FIREBASE_SA_PATH = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()

    price_map_json = (os.getenv("STRIPE_PRICE_MAP_JSON") or "").strip()
    legacy_price_map_json = (os.getenv("STRIPE_LEGACY_PRICE_MAP_JSON") or "{}").strip()

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

    try:
        LEGACY_PRICE_MAP = json.loads(legacy_price_map_json)
    except Exception:
        raise RuntimeError("STRIPE_LEGACY_PRICE_MAP_JSON must be valid JSON")

    if not isinstance(PRICE_MAP, dict):
        raise RuntimeError("STRIPE_PRICE_MAP_JSON must be a JSON object")

    if not isinstance(LEGACY_PRICE_MAP, dict):
        raise RuntimeError("STRIPE_LEGACY_PRICE_MAP_JSON must be a JSON object")

    required = {"trial_monthly", "starter_monthly", "pro_monthly", "business_monthly"}
    missing = required - set(PRICE_MAP.keys())
    if missing:
        raise RuntimeError(f"STRIPE_PRICE_MAP_JSON missing keys: {sorted(missing)}")

    PRICE_TO_TIER = {
        str(price_id).strip(): str(tier).strip()
        for tier, price_id in PRICE_MAP.items()
        if str(price_id or "").strip() and str(tier or "").strip()
    }

    for price_id, tier in LEGACY_PRICE_MAP.items():
        normalized_price_id = str(price_id or "").strip()
        normalized_tier = str(tier or "").strip()
        if normalized_price_id and normalized_tier:
            PRICE_TO_TIER[normalized_price_id] = normalized_tier

    stripe.api_key = STRIPE_SECRET_KEY


_load_settings_from_env()



# ---------------- Models ----------------
class CheckoutPayload(BaseModel):
    email: Optional[str] = None
    tier: str


# ---------------- Helpers ----------------
def _require_authenticated_user(
    authorization: Optional[str],
) -> tuple[str, Optional[str], Dict[str, Any]]:
    token = get_bearer_token(authorization)

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization Bearer token.",
        )

    try:
        claims = verify_firebase_token(token)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired auth token.",
        )

    uid = claims.get("uid")
    email = claims.get("email")

    if not uid:
        raise HTTPException(
            status_code=401,
            detail="Invalid auth token (no uid).",
        )

    return uid, email, claims


def _get_user_stripe_customer(
    db,
    uid: str,
) -> tuple[Dict[str, Any], str]:
    user_ref = db.collection("users").document(uid)
    user_data = user_ref.get().to_dict() or {}
    stripe_info = user_data.get("stripe") or {}
    customer_id = str(stripe_info.get("customerId") or "").strip()

    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="No Stripe customer is associated with this account.",
        )

    resolved_uid = _resolve_uid_for_customer(
        db,
        customer_id,
        expected_uid=uid,
    )

    if resolved_uid and resolved_uid != uid:
        raise HTTPException(
            status_code=403,
            detail=(
                "Stripe customer ownership could not be verified for "
                "this account."
            ),
        )

    return user_data, customer_id


def _select_relevant_subscription(customer_id: str):
    subscriptions = stripe.Subscription.list(
        customer=customer_id,
        status="all",
        limit=10,
        expand=["data.items.data.price"],
    )

    items = list(subscriptions.data or [])
    active_like = {"active", "trialing", "past_due"}

    for subscription in items:
        if subscription.get("status") in active_like:
            return subscription

    return items[0] if items else None


def price_id_to_tier(price_id: Optional[str]) -> Optional[str]:
    if not price_id:
        return None
    return PRICE_TO_TIER.get(str(price_id).strip())


def extract_subscription_period(subscription: Dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    """
    Stripe may return billing period fields either on the subscription itself
    or on the first subscription item depending on API/version shape.
    """
    if not subscription:
        return None, None

    period_start = subscription.get("current_period_start")
    period_end = subscription.get("current_period_end")

    items = (subscription.get("items") or {}).get("data") or []

    if items:
        first_item = items[0] or {}

        if not period_start:
            period_start = first_item.get("current_period_start")

        if not period_end:
            period_end = first_item.get("current_period_end")

    try:
        period_start = int(period_start) if period_start else None
    except Exception:
        period_start = None

    try:
        period_end = int(period_end) if period_end else None
    except Exception:
        period_end = None

    return period_start, period_end




def _tier_label(tier: Optional[str]) -> str:
    labels = {
        "trial_monthly": "Trial",
        "starter_monthly": "Starter",
        "pro_monthly": "Pro",
        "business_monthly": "Business",
        "early_access": "Early Access",
    }
    return labels.get(str(tier or "").strip(), str(tier or "your plan"))


def _resolve_uid_for_customer(
    db,
    customer_id: Optional[str],
    *,
    expected_uid: Optional[str] = None,
) -> Optional[str]:
    """
    Resolve the Firebase owner for a Stripe customer.

    Stripe customer metadata is treated as the authoritative ownership signal.
    The Firestore stripe_customers mapping is repaired when it is stale.

    expected_uid is used only when the authenticated user's own Firestore
    document already references this exact customer ID. In that case, an empty
    Stripe metadata value can be safely repaired to the authenticated UID.
    """
    if not customer_id:
        return None

    mapping_ref = db.collection("stripe_customers").document(customer_id)
    mapping = mapping_ref.get()
    mapped_uid = (
        (mapping.to_dict() or {}).get("uid")
        if mapping.exists
        else None
    )

    try:
        customer = stripe.Customer.retrieve(customer_id)
        metadata_uid = str(
            (customer.metadata or {}).get("firebase_uid") or ""
        ).strip()

        if metadata_uid:
            if mapped_uid != metadata_uid:
                mapping_ref.set(
                    {"uid": metadata_uid},
                    merge=True,
                )
            return metadata_uid

        if expected_uid:
            stripe.Customer.modify(
                customer_id,
                metadata={"firebase_uid": expected_uid},
            )
            mapping_ref.set(
                {"uid": expected_uid},
                merge=True,
            )
            return expected_uid

        return mapped_uid
    except Exception as exc:
        print(
            "STRIPE CUSTOMER OWNERSHIP LOOKUP ERROR:",
            customer_id,
            repr(exc),
        )
        return mapped_uid


def _create_billing_notification(
    db,
    uid: Optional[str],
    *,
    event_key: str,
    title: str,
    body: str,
    notification_type: str,
    link: str = "/account",
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    if not uid:
        return

    try:
        create_notification(
            db,
            uid,
            event_key=event_key,
            title=title,
            body=body,
            notification_type=notification_type,
            link=link,
            metadata=metadata or {},
        )
    except Exception as exc:
        # Billing state must still update even if a notification write fails.
        print("STRIPE NOTIFICATION ERROR:", repr(exc))


# ---------------- Routes ----------------
@stripe_router.get("/health")
def health():
    return {"ok": True}


@stripe_router.post("/create-checkout-session")
def create_checkout_session(
    body: CheckoutPayload,
    authorization: Optional[str] = Header(default=None),
):
    """
    Create a new Stripe Checkout subscription for the authenticated user.

    Existing active subscribers must change plans through the Billing Portal,
    which prevents accidental duplicate Stripe subscriptions.
    """
    try:
        uid, token_email, _claims = _require_authenticated_user(authorization)

        allowed_checkout_tiers = {
            "trial_monthly",
            "starter_monthly",
            "pro_monthly",
            "business_monthly",
        }

        if body.tier not in allowed_checkout_tiers or body.tier not in PRICE_MAP:
            raise HTTPException(
                status_code=400,
                detail="Invalid or unavailable tier.",
            )

        price_id = PRICE_MAP[body.tier]
        db = get_db()
        user_ref = db.collection("users").document(uid)
        user_data = user_ref.get().to_dict() or {}
        stripe_info = user_data.get("stripe") or {}
        customer_id = stripe_info.get("customerId")
        subscription_id = stripe_info.get("subscriptionId")
        subscription_status = str(stripe_info.get("status") or "").lower()

        if (
            subscription_id
            and subscription_status in {"active", "trialing", "past_due"}
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "message": (
                        "This account already has an active subscription. "
                        "Use the secure billing portal to change plans."
                    ),
                    "code": "ACTIVE_SUBSCRIPTION_EXISTS",
                    "upgradePath": "/account?billing=1",
                },
            )

        if not customer_id:
            customer = stripe.Customer.create(
                email=body.email or token_email or None,
                metadata={"firebase_uid": uid},
            )
            customer_id = customer.id
        else:
            try:
                stripe.Customer.modify(
                    customer_id,
                    metadata={"firebase_uid": uid},
                )
            except Exception:
                pass

        db.collection("stripe_customers").document(customer_id).set(
            {"uid": uid},
            merge=True,
        )

        user_ref.set(
            {
                "stripe": {
                    "customerId": customer_id,
                    "status": "pending",
                    "requestedTier": body.tier,
                }
            },
            merge=True,
        )

        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            client_reference_id=uid,
            metadata={
                "firebase_uid": uid,
                "requested_tier": body.tier,
            },
            subscription_data={
                "metadata": {
                    "firebase_uid": uid,
                    "requested_tier": body.tier,
                }
            },
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=(
                f"{FRONTEND_URL}/subscribe"
                "?success=1&session_id={{CHECKOUT_SESSION_ID}}"
            ),
            cancel_url=f"{FRONTEND_URL}/subscribe?canceled=1",
            allow_promotion_codes=True,
            automatic_tax={"enabled": True},
            billing_address_collection="required",
            customer_update={"address": "auto", "shipping": "auto"},
        )

        return {"url": session.url}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@stripe_router.post("/create-portal-session")
def create_portal_session(
    authorization: Optional[str] = Header(default=None),
):
    """Return a Billing Portal URL for the authenticated user's customer."""
    try:
        uid, _email, _claims = _require_authenticated_user(authorization)
        db = get_db()
        _user_data, customer_id = _get_user_stripe_customer(db, uid)

        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{FRONTEND_URL}/account?billing_return=1",
        )

        return {"url": session.url}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@stripe_router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Handles Stripe subscription and invoice events.

    Writes users/{uid}.stripe and creates idempotent billing notifications.
    Notification failures never block Stripe state synchronization.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        if WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(
                payload,
                sig_header,
                WEBHOOK_SECRET,
            )
        else:
            event = json.loads(payload.decode("utf-8"))
    except Exception as exc:
        return JSONResponse(
            status_code=400,
            content={"error": f"Webhook error: {exc}"},
        )

    db = get_db()
    event_id = str(event.get("id") or "")
    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {}) or {}

    subscription_events = {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }

    if event_type in subscription_events:
        customer_id = None
        sub_id = None
        status = None
        price_id = None
        tier = None
        period_start = None
        period_end = None
        sub_status = None

        if event_type == "checkout.session.completed":
            customer_id = obj.get("customer")
            sub_id = obj.get("subscription")

            checkout_status = obj.get("status")
            payment_status = obj.get("payment_status")

            status = (
                "active"
                if (
                    checkout_status == "complete"
                    and payment_status in {"paid", "no_payment_required"}
                )
                else "pending"
            )

            if sub_id:
                try:
                    subscription = stripe.Subscription.retrieve(
                        sub_id,
                        expand=["items.data.price"],
                    )

                    sub_status = (
                        subscription.get("status")
                        or "inactive"
                    )

                    status = (
                        "active"
                        if sub_status in {"active", "trialing", "past_due"}
                        else "inactive"
                    )

                    items = (
                        subscription.get("items")
                        or {}
                    ).get("data") or []

                    if items and items[0].get("price"):
                        price_id = items[0]["price"].get("id")
                        tier = price_id_to_tier(price_id)

                    period_start, period_end = (
                        extract_subscription_period(subscription)
                    )

                except Exception as exc:
                    print(
                        "CHECKOUT SUBSCRIPTION RETRIEVAL ERROR:",
                        repr(exc),
                    )

        elif event_type in {
            "customer.subscription.created",
            "customer.subscription.updated",
        }:
            customer_id = obj.get("customer")
            sub_id = obj.get("id")
            sub_status = obj.get("status") or "inactive"

            status = (
                "active"
                if sub_status in {"active", "trialing", "past_due"}
                else "inactive"
            )

            items = obj.get("items", {}).get("data", []) or []

            if items and items[0].get("price"):
                price_id = items[0]["price"].get("id")
                tier = price_id_to_tier(price_id)

            period_start, period_end = extract_subscription_period(obj)

        else:
            customer_id = obj.get("customer")
            sub_id = obj.get("id")
            sub_status = obj.get("status") or "canceled"
            status = "inactive"

        uid = _resolve_uid_for_customer(db, customer_id)

        if uid:
            user_ref = db.collection("users").document(uid)
            previous_user = user_ref.get().to_dict() or {}
            previous_stripe = previous_user.get("stripe") or {}
            previous_tier = previous_stripe.get("tier")
            previous_status = previous_stripe.get("status")

            stripe_update: Dict[str, Any] = {
                "customerId": customer_id,
                "subscriptionId": sub_id,
                "status": status,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }

            if price_id:
                stripe_update["priceId"] = price_id

            if tier:
                stripe_update["tier"] = tier
                stripe_update["tierSyncError"] = firestore.DELETE_FIELD
            elif price_id:
                stripe_update["tierSyncError"] = (
                    f"Unmapped Stripe price ID: {price_id}"
                )
                print(
                    "STRIPE PRICE MAP ERROR:",
                    price_id,
                    "is not present in STRIPE_PRICE_MAP_JSON or "
                    "STRIPE_LEGACY_PRICE_MAP_JSON",
                )

            if period_start:
                stripe_update["currentPeriodStart"] = int(period_start)

            if period_end:
                stripe_update["currentPeriodEnd"] = int(period_end)

            user_ref.set({"stripe": stripe_update}, merge=True)

            metadata = {
                "stripeEventId": event_id,
                "customerId": customer_id,
                "subscriptionId": sub_id,
                "tier": tier,
                "status": status,
            }

            if event_type == "customer.subscription.deleted":
                track_event(
                    db,
                    uid,
                    "subscription.canceled",
                    event_id=f"stripe:{event_id or sub_id}:canceled",
                    metadata={
                        **metadata,
                        "previousTier": previous_tier,
                    },
                )
                _create_billing_notification(
                    db,
                    uid,
                    event_key=f"subscription_canceled_{sub_id or event_id}",
                    title="Subscription canceled",
                    body=(
                        "Your subscription has been canceled. "
                        "You can choose a new plan anytime from My Account."
                    ),
                    notification_type="subscription_canceled",
                    metadata=metadata,
                )

            elif (
                event_type == "customer.subscription.updated"
                and tier
                and previous_tier
                and tier != previous_tier
            ):
                track_event(
                    db,
                    uid,
                    "subscription.plan_changed",
                    event_id=f"stripe:{event_id or sub_id}:plan_changed",
                    metadata={
                        **metadata,
                        "previousTier": previous_tier,
                    },
                )
                _create_billing_notification(
                    db,
                    uid,
                    event_key=f"plan_changed_{event_id or sub_id}",
                    title="Plan updated",
                    body=(
                        f"Your workspace is now on the "
                        f"{_tier_label(tier)} plan."
                    ),
                    notification_type="plan_changed",
                    metadata={
                        **metadata,
                        "previousTier": previous_tier,
                    },
                )

            elif (
                status == "active"
                and previous_status not in {"active", "trialing", "past_due"}
            ):
                track_event(
                    db,
                    uid,
                    "subscription.activated",
                    event_id=f"stripe:{event_id or sub_id}:activated",
                    metadata=metadata,
                )
                _create_billing_notification(
                    db,
                    uid,
                    event_key=f"subscription_activated_{sub_id or customer_id}",
                    title="Subscription activated",
                    body=(
                        f"Your {_tier_label(tier)} workspace is active. "
                        "You can start creating now."
                    ),
                    notification_type="subscription_activated",
                    link="/dashboard",
                    metadata=metadata,
                )

    elif event_type == "invoice.payment_failed":
        customer_id = obj.get("customer")
        uid = _resolve_uid_for_customer(db, customer_id)

        invoice_id = obj.get("id")
        subscription_id = obj.get("subscription")
        amount_due = obj.get("amount_due")
        currency = str(obj.get("currency") or "usd").upper()

        if uid:
            db.collection("users").document(uid).set(
                {
                    "stripe": {
                        "status": "past_due",
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    }
                },
                merge=True,
            )

            amount_text = ""
            try:
                amount_text = (
                    f" {currency} {int(amount_due or 0) / 100:,.2f}"
                )
            except Exception:
                amount_text = ""

            track_event(
                db,
                uid,
                "subscription.payment_failed",
                event_id=f"stripe:{event_id or invoice_id}:payment_failed",
                metadata={
                    "stripeEventId": event_id,
                    "invoiceId": invoice_id,
                    "customerId": customer_id,
                    "subscriptionId": subscription_id,
                    "amountDue": amount_due,
                    "currency": currency,
                },
            )

            _create_billing_notification(
                db,
                uid,
                event_key=f"payment_failed_{invoice_id or event_id}",
                title="Payment needs attention",
                body=(
                    f"We could not process your subscription payment"
                    f"{amount_text}. Update your billing method to avoid "
                    "interrupting workspace access."
                ),
                notification_type="payment_attention",
                metadata={
                    "stripeEventId": event_id,
                    "invoiceId": invoice_id,
                    "customerId": customer_id,
                    "subscriptionId": subscription_id,
                    "amountDue": amount_due,
                    "currency": currency,
                },
            )

    elif event_type == "invoice.paid":
        customer_id = obj.get("customer")
        uid = _resolve_uid_for_customer(db, customer_id)

        if uid:
            user_ref = db.collection("users").document(uid)
            current = user_ref.get().to_dict() or {}
            current_status = (current.get("stripe") or {}).get("status")

            if current_status == "past_due":
                user_ref.set(
                    {
                        "stripe": {
                            "status": "active",
                            "updatedAt": firestore.SERVER_TIMESTAMP,
                        }
                    },
                    merge=True,
                )

                track_event(
                    db,
                    uid,
                    "subscription.payment_recovered",
                    event_id=(
                        f"stripe:{event_id or obj.get('id')}:payment_recovered"
                    ),
                    metadata={
                        "stripeEventId": event_id,
                        "invoiceId": obj.get("id"),
                        "customerId": customer_id,
                    },
                )

                _create_billing_notification(
                    db,
                    uid,
                    event_key=f"payment_recovered_{obj.get('id') or event_id}",
                    title="Payment received",
                    body=(
                        "Your subscription payment was received and "
                        "your workspace remains active."
                    ),
                    notification_type="billing_resolved",
                    metadata={
                        "stripeEventId": event_id,
                        "invoiceId": obj.get("id"),
                        "customerId": customer_id,
                    },
                )

    return {"received": True}


@stripe_router.get("/sync-subscription")
def sync_subscription(
    session_id: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    Synchronize the authenticated user's current Stripe subscription.

    - Checkout return: provide session_id.
    - Billing Portal return: omit session_id; the customer is derived securely
      from the authenticated user's Firestore record.
    """
    try:
        uid, _email, _claims = _require_authenticated_user(authorization)
        db = get_db()
        user_ref = db.collection("users").document(uid)
        user_data = user_ref.get().to_dict() or {}

        resolved_customer = None
        subscription = None
        resolved_session_status = None
        resolved_payment_status = None

        if session_id:
            session = stripe.checkout.Session.retrieve(
                session_id,
                expand=["subscription.items.data.price"],
            )

            session_uid = (
                session.get("client_reference_id")
                or (session.get("metadata") or {}).get("firebase_uid")
            )

            if session_uid and session_uid != uid:
                raise HTTPException(
                    status_code=403,
                    detail="Checkout session does not belong to this account.",
                )

            resolved_customer = session.get("customer")
            subscription = session.get("subscription") or None
            resolved_session_status = session.get("status")
            resolved_payment_status = session.get("payment_status")

            if resolved_customer:
                resolved_uid = _resolve_uid_for_customer(
                    db,
                    resolved_customer,
                    expected_uid=uid,
                )
                if resolved_uid and resolved_uid != uid:
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            "Checkout customer ownership could not be "
                            "verified for this account."
                        ),
                    )
        else:
            _stored_user, resolved_customer = _get_user_stripe_customer(db, uid)
            subscription = _select_relevant_subscription(resolved_customer)

        if not subscription and resolved_customer:
            subscription = _select_relevant_subscription(resolved_customer)

        if not subscription:
            raise HTTPException(
                status_code=404,
                detail="No Stripe subscription was found for this account.",
            )

        resolved_sub_id = subscription.get("id")
        resolved_sub_status = subscription.get("status") or "inactive"

        if not resolved_customer:
            resolved_customer = subscription.get("customer")

        items = (subscription.get("items") or {}).get("data") or []
        resolved_price_id = None

        if items and items[0].get("price"):
            resolved_price_id = items[0]["price"].get("id")

        resolved_tier = price_id_to_tier(resolved_price_id)

        if resolved_price_id and not resolved_tier:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": (
                        "Stripe returned a price that ADGen cannot map to a plan. "
                        "Update STRIPE_PRICE_MAP_JSON on the backend."
                    ),
                    "code": "UNMAPPED_STRIPE_PRICE",
                    "priceId": resolved_price_id,
                },
            )

        resolved_period_start, resolved_period_end = (
            extract_subscription_period(subscription)
        )

        active_like = {"active", "trialing", "past_due"}
        status = (
            "active"
            if resolved_sub_status in active_like
            else "inactive"
        )

        if resolved_customer:
            db.collection("stripe_customers").document(
                resolved_customer
            ).set({"uid": uid}, merge=True)

        stripe_update: Dict[str, Any] = {
            "customerId": resolved_customer,
            "subscriptionId": resolved_sub_id,
            "status": status,
            "updatedAt": firestore.SERVER_TIMESTAMP,
            "tierSyncError": firestore.DELETE_FIELD,
            "requestedTier": firestore.DELETE_FIELD,
        }

        if resolved_price_id:
            stripe_update["priceId"] = resolved_price_id
        if resolved_tier:
            stripe_update["tier"] = resolved_tier
        if resolved_period_start:
            stripe_update["currentPeriodStart"] = int(resolved_period_start)
        if resolved_period_end:
            stripe_update["currentPeriodEnd"] = int(resolved_period_end)

        user_ref.set({"stripe": stripe_update}, merge=True)

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

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

