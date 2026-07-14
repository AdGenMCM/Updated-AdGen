// src/pages/Subscribe.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { doc, onSnapshot, getFirestore } from "firebase/firestore";
import {
  createCheckoutSession,
  createPortalSession,
  syncSubscription,
} from "../api/payments";
import { useNavigate, useLocation } from "react-router-dom";

const db = getFirestore();

const PLAN_OPTIONS = [
  { id: "trial_monthly", label: "Trial", price: 9.99 },
  { id: "starter_monthly", label: "Starter", price: 34.99 },
  { id: "pro_monthly", label: "Pro", price: 79.99 },
  { id: "business_monthly", label: "Business", price: 199.99 },
];

const ALLOWED_TIERS = new Set(PLAN_OPTIONS.map((plan) => plan.id));

export default function Subscribe() {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState("checking");
  const [stripeInfo, setStripeInfo] = useState(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [tier, setTier] = useState("starter_monthly");

  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );

  const sessionId = params.get("session_id");
  const success = params.get("success") === "1";
  const from = location.state?.from?.pathname || "/adgenerator";
  const pollRef = useRef(null);
  const purchaseFiredRef = useRef(false);

  const selectedPlan =
    PLAN_OPTIONS.find((plan) => plan.id === tier) || PLAN_OPTIONS[1];

  useEffect(() => {
    const requestedTier = (params.get("tier") || "").trim();

    if (requestedTier && ALLOWED_TIERS.has(requestedTier)) {
      setTier(requestedTier);
    }
  }, [params]);

  useEffect(() => {
    const sid = params.get("session_id");

    if (!currentUser && sid) {
      localStorage.setItem("pending_session_id", sid);
    }
  }, [currentUser, params]);

  useEffect(() => {
    if (!currentUser) return;

    const sid = localStorage.getItem("pending_session_id");

    if (!sid) return;

    (async () => {
      try {
        await syncSubscription({
          uid: currentUser.uid,
          sessionId: sid,
        });
      } finally {
        localStorage.removeItem("pending_session_id");
      }
    })();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !success || !sessionId) return;

    (async () => {
      try {
        setSyncing(true);

        await syncSubscription({
          uid: currentUser.uid,
          sessionId,
        });
      } catch (syncError) {
        console.error("sync-subscription (initial) failed:", syncError);
      } finally {
        setSyncing(false);
      }
    })();
  }, [currentUser, success, sessionId]);

  useEffect(() => {
    if (!currentUser) return undefined;

    const ref = doc(db, "users", currentUser.uid);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.data();
        const nextStatus = data?.stripe?.status || "inactive";

        setStatus(nextStatus);
        setStripeInfo(data?.stripe || null);

        if (nextStatus === "active") {
          if (!purchaseFiredRef.current && window.fbq) {
            purchaseFiredRef.current = true;

            window.fbq("track", "Purchase", {
              currency: "USD",
              value: selectedPlan.price,
            });
          }

          navigate(from, { replace: true });
        }
      },
      (snapshotError) => {
        console.error("Firestore onSnapshot error:", snapshotError);
        setError("Unable to read subscription status. Please refresh.");
        setStatus("inactive");
      }
    );

    return () => unsubscribe && unsubscribe();
  }, [currentUser, navigate, from, selectedPlan.price]);

  useEffect(() => {
    if (!currentUser || !sessionId || status !== "pending") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      return undefined;
    }

    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts += 1;

      try {
        await syncSubscription({
          uid: currentUser.uid,
          sessionId,
        });
      } catch {
        // Keep polling briefly while Stripe and Firestore finish syncing.
      }

      if (attempts >= 10 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [currentUser, sessionId, status]);

  if (!currentUser) {
    return (
      <div className="auth-container" style={{ minHeight: "60vh" }}>
        <div style={{ maxWidth: 520 }}>
          <h2>Sign in to continue</h2>
          <p>Please log in or create an account before selecting your plan.</p>
          <button type="button" onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const openInNewTab = (url) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const startSubscription = async () => {
    setError("");

    try {
      const { url } = await createCheckoutSession({
        uid: currentUser.uid,
        email: currentUser.email,
        tier,
      });

      openInNewTab(url);
    } catch (checkoutError) {
      console.error(checkoutError);
      setError(checkoutError.message || "Failed to start checkout.");
    }
  };

  const openBilling = async () => {
    setError("");

    try {
      if (!stripeInfo?.customerId) {
        setError("No Stripe customer is on file yet. Please subscribe first.");
        return;
      }

      const { url } = await createPortalSession(stripeInfo.customerId);
      openInNewTab(url);
    } catch (portalError) {
      console.error(portalError);
      setError(portalError.message || "Failed to open billing portal.");
    }
  };

  const manualRefresh = async () => {
    if (!currentUser || !sessionId) return;

    try {
      setSyncing(true);

      await syncSubscription({
        uid: currentUser.uid,
        sessionId,
      });
    } catch {
      setError("Refresh failed. Try again in a moment.");
    } finally {
      setSyncing(false);
    }
  };

  const showSpinner =
    status === "checking" || syncing || status === "pending";
  const isActive = status === "active";

  return (
    <div className="auth-container" style={{ minHeight: "60vh" }}>
      <form onSubmit={(event) => event.preventDefault()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginBottom: 8 }}>Choose your AdGen plan</h2>

        <p style={{ marginBottom: 18 }}>
          {showSpinner
            ? "Finalizing your subscription…"
            : isActive
            ? "Your subscription is active."
            : "Select a monthly plan, then continue to secure Stripe checkout."}
        </p>

        {error && (
          <p style={{ color: "crimson", marginBottom: 12 }}>
            {error}
          </p>
        )}

        {!isActive && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 7 }}>
              Plan
            </label>

            <select
              value={tier}
              onChange={(event) => setTier(event.target.value)}
              style={{ width: "100%", padding: 11, borderRadius: 8 }}
              disabled={showSpinner}
            >
              {PLAN_OPTIONS.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label} Monthly — ${plan.price.toFixed(2)}
                </option>
              ))}
            </select>

            <p style={{ margin: "9px 0 0", fontSize: 13, opacity: 0.76 }}>
              Selected: {selectedPlan.label} at ${selectedPlan.price.toFixed(2)}/month
            </p>
          </div>
        )}

        {showSpinner ? (
          <button type="button" disabled>
            Processing…
          </button>
        ) : !isActive ? (
          <button type="button" onClick={startSubscription}>
            Continue to Stripe
          </button>
        ) : (
          <button type="button" onClick={openBilling}>
            Manage Billing
          </button>
        )}

        {status === "pending" && !syncing && (
          <button
            type="button"
            onClick={manualRefresh}
            style={{ marginTop: 8 }}
          >
            Refresh access
          </button>
        )}

        <div style={{ marginTop: 18, fontSize: 12, opacity: 0.62 }}>
          <div>Status: {status}</div>
          <div>Selected plan: {selectedPlan.label}</div>
          <div>Customer: {stripeInfo?.customerId || "—"}</div>
        </div>
      </form>
    </div>
  );
}





