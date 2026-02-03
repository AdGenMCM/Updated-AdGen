import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { createPortalSession } from "../api/payments";
import { auth } from "../firebaseConfig"; // adjust ONLY if your firebaseConfig path differs
import "./MyAccount.css";

export default function MyAccount() {
  const navigate = useNavigate();
  const { currentUser, stripe } = useAuth();

  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");

  // Usage state
  const [usage, setUsage] = useState(null); // { used, cap, month, remaining }
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");

  // API base
  const apiBase = (process.env.REACT_APP_API_BASE_URL || "").trim();

  async function fetchUsage() {
    setUsageError("");
    setUsageLoading(true);

    try {
      if (!apiBase) {
        throw new Error("Missing REACT_APP_API_BASE_URL at build time. Rebuild frontend.");
      }

      const user = auth.currentUser;
      if (!user) {
        throw new Error("Not logged in.");
      }

      const token = await user.getIdToken();

      const res = await fetch(`${apiBase}/usage`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // ignore parse error
      }

      if (!res.ok) {
        const detail = data?.detail || data?.message || `Failed to load usage (${res.status})`;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      setUsage(data);
    } catch (e) {
      setUsage(null);
      setUsageError(e?.message || "Failed to load usage.");
    } finally {
      setUsageLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser) return;
    // Fetch usage when account page loads
    fetchUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

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
          "No Stripe customer found yet. If you just subscribed, refresh in 10 seconds or visit Pricing."
        );
      }

      const { url } = await createPortalSession(customerId);
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

        {/* ✅ Usage section from GET /usage */}
        <div className="acctSection">
          <h2 className="acctH2">Usage</h2>

          {usageError && <div className="acctErr">{usageError}</div>}

          <div className="acctActions">
            <button className="acctBtn" onClick={fetchUsage} disabled={usageLoading}>
              {usageLoading ? "Refreshing..." : "Refresh Usage"}
            </button>
          </div>

          {usage ? (
            <>
              <div className="acctRow">
                <span className="acctLabel">This month</span>
                <span className="acctValue">{usage.month || "—"}</span>
              </div>

              <div className="acctRow">
                <span className="acctLabel">Used</span>
                <span className="acctValue">
                  {usage.used}/{usage.cap}
                </span>
              </div>

              <div className="acctRow">
                <span className="acctLabel">Remaining</span>
                <span className="acctValue">{usage.remaining}</span>
              </div>

              {usage.remaining === 0 && (
                <p className="acctTiny">
                  You’ve reached your limit. Upgrade to continue generating ads this month.
                </p>
              )}
            </>
          ) : (
            <p className="acctTiny">
              {usageLoading ? "Loading usage…" : "Usage data not available yet."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}



