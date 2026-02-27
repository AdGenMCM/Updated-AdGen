import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import { createPortalSession } from "../api/payments";
import { auth } from "../firebaseConfig";
import "./MyAccount.css";

export default function MyAccount() {
  const navigate = useNavigate();
  const { currentUser, stripe } = useAuth();

  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");

  // Image usage state
  const [usage, setUsage] = useState(null); // { used, cap, month, remaining }
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");

  // ✅ Video usage state
  const [videoUsage, setVideoUsage] = useState(null); // { used, cap, month, remaining, enabled, tier }
  const [videoUsageLoading, setVideoUsageLoading] = useState(false);
  const [videoUsageError, setVideoUsageError] = useState("");

  // ✅ Dismiss state
  const [dismissing, setDismissing] = useState(false);

  // API base
  const apiBase = (process.env.REACT_APP_API_BASE_URL || "").trim();

  const TIER_LABELS = useMemo(
    () => ({
      trial_monthly: "Trial",
      early_access: "Early Access",
      starter_monthly: "Starter",
      pro_monthly: "Pro",
      business_monthly: "Business",
    }),
    []
  );

  async function fetchUsage() {
    setUsageError("");
    setUsageLoading(true);

    try {
      if (!apiBase) throw new Error("Missing REACT_APP_API_BASE_URL at build time. Rebuild frontend.");

      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in.");

      const token = await user.getIdToken();

      const res = await fetch(`${apiBase}/usage`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      let data = null;
      try { data = await res.json(); } catch {}

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

  async function fetchVideoUsage() {
    setVideoUsageError("");
    setVideoUsageLoading(true);

    try {
      if (!apiBase) throw new Error("Missing REACT_APP_API_BASE_URL at build time. Rebuild frontend.");

      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in.");

      const token = await user.getIdToken();

      const res = await fetch(`${apiBase}/video/usage`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        const detail = data?.detail || data?.message || `Failed to load video usage (${res.status})`;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      setVideoUsage(data);
    } catch (e) {
      setVideoUsage(null);
      setVideoUsageError(e?.message || "Failed to load video usage.");
    } finally {
      setVideoUsageLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser) return;
    fetchUsage();
    fetchVideoUsage();
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

  const status = (stripe?.status ?? "inactive").toLowerCase();
  const tier = stripe?.tier ?? "—";
  const customerId = stripe?.customerId ?? null;

  const requestedTier = (stripe?.requestedTier || "").trim();
  const hasRequestedTier = !!requestedTier;
  const requestedLabel = TIER_LABELS[requestedTier] || requestedTier;
  const currentLabel = TIER_LABELS[tier] || tier;

  const isActiveOrTrial = status === "active" || status === "trialing";
  const shouldShowRequestBanner = hasRequestedTier && requestedTier !== tier;

  // ✅ FIXED: Works with BOTH createPortalSession(customerId) and createPortalSession(apiBase, token)
  async function openBillingPortal() {
    setError("");
    setLoadingPortal(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in.");

      const token = await user.getIdToken(true);

      let url;

      // Detect signature:
      // - old: createPortalSession(customerId) -> {url}
      // - new: createPortalSession(apiBase, token) -> url OR {url}
      const arity = typeof createPortalSession === "function" ? createPortalSession.length : 0;

      if (arity >= 2) {
        const resp = await createPortalSession(apiBase, token);
        url = resp?.url || resp;
      } else {
        if (!customerId) {
          throw new Error(
            "No Stripe customer found yet. If you just subscribed, refresh in 10 seconds or visit Pricing."
          );
        }
        const resp = await createPortalSession(customerId);
        url = resp?.url || resp;
      }

      if (!url) throw new Error("No billing portal URL returned.");

      // ✅ Use same-tab navigation (avoids popup blockers)
      window.location.href = url;
    } catch (e) {
      setError(e?.message || "Could not open billing portal.");
    } finally {
      setLoadingPortal(false);
    }
  }

  const confirmRequestedTier = async () => {
    if (isActiveOrTrial) {
      await openBillingPortal();
    } else {
      navigate(`/subscribe?tier=${encodeURIComponent(requestedTier)}`);
    }
  };

  // ✅ Dismiss + clear requestedTier server-side
  const dismissRequestedTier = async () => {
    setError("");

    try {
      if (!apiBase) throw new Error("Missing REACT_APP_API_BASE_URL at build time. Rebuild frontend.");
      if (!window.confirm("Dismiss this plan change request?")) return;

      setDismissing(true);

      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in.");

      const token = await user.getIdToken(true);

      const res = await fetch(`${apiBase}/users/me/tier/clear-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        const detail = data?.detail || data?.message || `Failed to dismiss request (${res.status})`;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
    } catch (e) {
      setError(e?.message || "Failed to dismiss request.");
    } finally {
      setDismissing(false);
    }
  };

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

          {shouldShowRequestBanner && (
            <div
              style={{
                border: "1px solid rgba(15,23,42,0.15)",
                background: "rgba(15,23,42,0.04)",
                padding: 12,
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Plan change requested</div>

              <div style={{ marginBottom: 10 }}>
                An admin requested that your plan be changed to <b>{requestedLabel}</b>.
                {tier && tier !== "—" ? (
                  <>
                    {" "}
                    Your current plan is <b>{currentLabel}</b>.
                  </>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="acctBtn acctBtnPrimary"
                  type="button"
                  onClick={confirmRequestedTier}
                  disabled={!requestedTier || loadingPortal || dismissing}
                >
                  {isActiveOrTrial ? "Confirm in Billing (Stripe)" : "Confirm & Subscribe"}
                </button>

                <button
                  className="acctBtn"
                  type="button"
                  onClick={dismissRequestedTier}
                  disabled={dismissing || loadingPortal}
                >
                  {dismissing ? "Dismissing..." : "Dismiss"}
                </button>

                <button className="acctBtn" type="button" onClick={() => navigate("/pricing")}>
                  View Plans
                </button>
              </div>

              <p className="acctTiny" style={{ marginTop: 8 }}>
                {isActiveOrTrial
                  ? "This opens the Stripe billing portal so you can confirm the change."
                  : "You’ll be taken to the subscribe page with the requested plan pre-selected."}
              </p>
            </div>
          )}

          <div className="acctRow">
            <span className="acctLabel">Status</span>
            <span className="acctValue">{status}</span>
          </div>

          <div className="acctRow">
            <span className="acctLabel">Tier</span>
            <span className="acctValue">{currentLabel}</span>
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
              title={!customerId ? "Subscribe first to create a customer (if you’re on the old portal flow)." : ""}
            >
              {loadingPortal ? "Opening..." : "Manage Billing (Stripe)"}
            </button>
          </div>

          <p className="acctTiny">Billing portal opens in this tab.</p>
        </div>

        {/* ✅ Image usage */}
        <div className="acctSection">
          <h2 className="acctH2">Image Generation Usage</h2>

          {usageError && <div className="acctErr">{usageError}</div>}

          <div className="acctActions">
            <button className="acctBtn" onClick={fetchUsage} disabled={usageLoading}>
              {usageLoading ? "Refreshing..." : "Refresh Image Usage"}
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

              <div className="acctRow">
                <span className="acctLabel">
                  <i>* Usage resets on the first of each month *</i>
                </span>
              </div>
            </>
          ) : (
            <p className="acctTiny">{usageLoading ? "Loading usage…" : "Usage data not available yet."}</p>
          )}
        </div>

        {/* ✅ Video usage */}
        <div className="acctSection">
          <h2 className="acctH2">Video Generation Usage</h2>

          {videoUsageError && <div className="acctErr">{videoUsageError}</div>}

          <div className="acctActions">
            <button className="acctBtn" onClick={fetchVideoUsage} disabled={videoUsageLoading}>
              {videoUsageLoading ? "Refreshing..." : "Refresh Video Usage"}
            </button>
          </div>

          {videoUsage ? (
            <>
              <div className="acctRow">
                <span className="acctLabel">This month</span>
                <span className="acctValue">{videoUsage.month || "—"}</span>
              </div>

              <div className="acctRow">
                <span className="acctLabel">Used</span>
                <span className="acctValue">
                  {videoUsage ? (
                  <>
                    {videoUsage.enabled ? (
                      <>
                        <div className="acctRow">
                          <span className="acctLabel">This month</span>
                          <span className="acctValue">{videoUsage.month || "—"}</span>
                        </div>

                        <div className="acctRow">
                          <span className="acctLabel">Used</span>
                          <span className="acctValue">
                            {videoUsage.used}/{videoUsage.cap}
                          </span>
                        </div>

                        <div className="acctRow">
                          <span className="acctLabel">Remaining</span>
                          <span className="acctValue">{videoUsage.remaining}</span>
                        </div>

                        <div className="acctRow">
                          <span className="acctLabel">
                            <i>* Usage resets on the first of each month *</i>
                          </span>
                        </div>

                        {videoUsage.remaining === 0 && (
                          <p className="acctTiny">
                            You’ve reached your video limit. Upgrade to generate more this month.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="acctTiny" style={{ marginTop: 8 }}>
                        Video Ads are available on Early Access, Pro, and Business plans.
                      </div>
                    )}
                  </>
                ) : (
                  <p className="acctTiny">
                    {videoUsageLoading ? "Loading video usage…" : "Video usage data not available yet."}
                  </p>
                )}
                </span>
              </div>

              <div className="acctRow">
                <span className="acctLabel">Remaining</span>
                <span className="acctValue">{videoUsage.remaining ?? 0}</span>
              </div>

              <div className="acctRow">
                <span className="acctLabel">
                  <i>* Usage resets on the first of each month *</i>
                </span>
              </div>

              {!videoUsage.enabled && (
                <p className="acctTiny">
                  Video Ads are available on Early Access, Pro, and Business plans.
                </p>
              )}
            </>
          ) : (
            <p className="acctTiny">
              {videoUsageLoading ? "Loading video usage…" : "Video usage data not available yet."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}





