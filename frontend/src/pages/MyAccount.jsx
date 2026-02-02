import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { createPortalSession } from "../api/payments"; // <-- keep this path consistent with your repo
import "./MyAccount.css";

export default function MyAccount() {
  const navigate = useNavigate();
  const { currentUser, stripe } = useAuth();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");

  if (!currentUser) {
    return (
      <div className="acctPage">
        <div className="acctCard">
          <h1 className="acctTitle">My Account</h1>
          <p className="acctMuted">Please log in to view your account.</p>
          <button className="acctBtn acctBtnPrimary" onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const status = stripe?.status ?? "inactive";
  const tier = stripe?.tier ?? "—";
  const customerId = stripe?.customerId ?? null;

  async function openBillingPortal() {
    setError("");
    setLoadingPortal(true);

    try {
      if (!customerId) {
        throw new Error(
          "No Stripe customer found yet. If you just subscribed, refresh in 10 seconds or visit Subscribe."
        );
      }

      const { url } = await createPortalSession(customerId);

      // ✅ open portal in a new tab
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e?.message || "Could not open billing portal.");
    } finally {
      setLoadingPortal(false);
    }
  }

  return (
    <div className="acctPage">
      <div className="acctCard">
        <h1 className="acctTitle">My Account</h1>
        <p className="acctMuted">Billing + account details</p>

        {error && <div className="acctErr">{error}</div>}

        <div className="acctSection">
          <h2 className="acctH2">Account</h2>
          <div className="acctRow">
            <span className="acctLabel">Email</span>
            <span className="acctValue">{currentUser.email || "—"}</span>
          </div>
          <div className="acctRow">
            <span className="acctLabel">Email Verified</span>
            <span className="acctValue">{currentUser.emailVerified ? "Yes" : "No"}</span>
          </div>
          <div className="acctRow">
            <span className="acctLabel">User ID</span>
            <span className="acctValue acctMono">{currentUser.uid}</span>
          </div>
        </div>

        <div className="acctSection">
          <h2 className="acctH2">Subscription</h2>

          <div className="acctRow">
            <span className="acctLabel">Status</span>
            <span className="acctValue">{status}</span>
          </div>

          <div className="acctRow">
            <span className="acctLabel">Tier</span>
            <span className="acctValue">{tier}</span>
          </div>

          <div className="acctRow">
            <span className="acctLabel">Customer</span>
            <span className="acctValue acctMono">{customerId || "—"}</span>
          </div>

          <div className="acctActions">
            <button className="acctBtn" onClick={() => navigate("/pricing")}>
              View Plans
            </button>

            <button
              className="acctBtn acctBtnPrimary"
              onClick={openBillingPortal}
              disabled={loadingPortal}
              title={!customerId ? "Subscribe first to create a customer" : ""}
            >
              {loadingPortal ? "Opening..." : "Manage Billing (Stripe)"}
            </button>
          </div>

          <p className="acctTiny">Billing portal opens in a new tab.</p>
        </div>
      </div>
    </div>
  );
}
