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

export default function Subscribe() {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState("checking"); // checking | inactive | pending | active
  const [stripeInfo, setStripeInfo] = useState(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const sessionId = params.get("session_id");
  const success = params.get("success") === "1";
  const from = location.state?.from?.pathname || "/adgenerator";
  const pollRef = useRef(null);

  // Cache session_id if user isn't logged in yet (so we don't lose it at login screen)
  useEffect(() => {
    const sid = params.get("session_id");
    if (!currentUser && sid) {
      localStorage.setItem("pending_session_id", sid);
    }
  }, [currentUser, params]);

  // After login, if we cached a session id, try syncing once
  useEffect(() => {
    if (!currentUser) return;
    const sid = localStorage.getItem("pending_session_id");
    if (sid) {
      (async () => {
        try { await syncSubscription({ uid: currentUser.uid, sessionId: sid }); }
        finally { localStorage.removeItem("pending_session_id"); }
      })();
    }
  }, [currentUser]);

  // One-shot sync immediately after redirect
  useEffect(() => {
    if (!currentUser || !success || !sessionId) return;
    (async () => {
      try {
        setSyncing(true);
        await syncSubscription({ uid: currentUser.uid, sessionId });
      } catch (e) {
        console.error("sync-subscription (initial) failed:", e);
      } finally {
        setSyncing(false);
      }
    })();
  }, [currentUser, success, sessionId]);

  // Live Firestore listener
  useEffect(() => {
    if (!currentUser) return;
    const ref = doc(db, "users", currentUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const s = data?.stripe?.status || "inactive";
        setStatus(s);
        setStripeInfo(data?.stripe || null);

        if (s === "active") {
          // Clean URL and go to the gated page
          navigate(from, { replace: true });
        }
      },
      (err) => {
        console.error("Firestore onSnapshot error:", err);
        setError("Unable to read subscription status. Please refresh.");
        setStatus("inactive");
      }
    );
    return () => unsub && unsub();
  }, [currentUser, navigate, from]);

  // Poll sync while status is pending (helps if webhook is delayed)
  useEffect(() => {
    if (!currentUser || !sessionId || status !== "pending") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        await syncSubscription({ uid: currentUser.uid, sessionId });
      } catch {
        /* ignore */
      }
      if (attempts >= 10) {
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

  if (!currentUser) return <p>Please log in first.</p>;

  const startSubscription = async () => {
    setError("");
    try {
      const { url } = await createCheckoutSession({
        uid: currentUser.uid,
        email: currentUser.email,
      });
      window.location.href = url;
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to start checkout.");
    }
  };

  const openBilling = async () => {
    setError("");
    try {
      if (!stripeInfo?.customerId) {
        setError("No Stripe customer on file yet. Please subscribe first.");
        return;
      }
      const { url } = await createPortalSession(stripeInfo.customerId);
      window.location.href = url;
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to open billing portal.");
    }
  };

  const manualRefresh = async () => {
    if (!currentUser || !sessionId) return;
    try {
      setSyncing(true);
      await syncSubscription({ uid: currentUser.uid, sessionId });
    } catch (e) {
      setError("Refresh failed. Try again in a moment.");
    } finally {
      setSyncing(false);
    }
  };

  const showSpinner = status === "checking" || syncing || status === "pending";

  return (
    <div className="auth-container" style={{ minHeight: "60vh" }}>
      <form onSubmit={(e) => e.preventDefault()} style={{ maxWidth: 480 }}>
        <h2 style={{ marginBottom: 8 }}>Subscribe</h2>

        <p style={{ marginBottom: 12 }}>
          {showSpinner
            ? "Finalizing your subscription…"
            : status === "active"
            ? "Subscription active!"
            : "Get access to Ad Generator & Text Editor."}
        </p>

        {error && <p style={{ color: "crimson", marginBottom: 12 }}>{error}</p>}

        {showSpinner ? (
          <button type="button" disabled>Processing…</button>
        ) : status !== "active" ? (
          <button type="button" onClick={startSubscription}>Subscribe with Stripe</button>
        ) : (
          <button type="button" onClick={openBilling}>Manage Billing</button>
        )}

        {status === "pending" && !showSpinner && (
          <button type="button" onClick={manualRefresh} style={{ marginTop: 8 }}>
            Refresh access
          </button>
        )}

        {/* Debug (safe to remove) */}
        <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
          <div>UID: {currentUser.uid}</div>
          <div>Status: {status}</div>
          <div>Customer: {stripeInfo?.customerId || "—"}</div>
          <div>Sub: {stripeInfo?.subscriptionId || "—"}</div>
          <div>Session: {sessionId || "—"}</div>
        </div>
      </form>
    </div>
  );
}




