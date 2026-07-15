import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  HardDrive,
  Image,
  LogIn,
  Mail,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { useAuth } from "../AuthProvider";
import { createPortalSession } from "../api/payments";
import { auth } from "../firebaseConfig";
import "./MyAccount.css";

const SECTION_IDS = {
  account: "account",
  subscription: "subscription",
  usage: "usage",
};

function formatStorageValue(bytes = 0) {
  const safeBytes = Math.max(0, Number(bytes) || 0);
  const KB = 1024;
  const MB = 1024 ** 2;
  const GB = 1024 ** 3;

  if (safeBytes >= GB) return `${(safeBytes / GB).toFixed(2)} GB`;
  if (safeBytes >= MB) return `${(safeBytes / MB).toFixed(2)} MB`;
  if (safeBytes >= KB) return `${(safeBytes / KB).toFixed(1)} KB`;
  return `${Math.round(safeBytes)} B`;
}

function UsageRow({
  icon: Icon,
  label,
  value,
  used = 0,
  cap = 0,
  helper,
  warning = false,
}) {
  const safeCap = Math.max(0, Number(cap) || 0);
  const safeUsed = Math.max(0, Number(used) || 0);
  const percent = safeCap > 0 ? Math.min(100, Math.round((safeUsed / safeCap) * 100)) : 0;

  return (
    <div className={`acct-v2-usage-row ${warning ? "is-warning" : ""}`}>
      <div className="acct-v2-usage-icon">
        <Icon size={18} />
      </div>

      <div className="acct-v2-usage-main">
        <div className="acct-v2-usage-top">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>

        <div className="acct-v2-progress" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>

        {helper && <p>{helper}</p>}
      </div>
    </div>
  );
}

export default function MyAccount() {
  const navigate = useNavigate();
  const { currentUser, stripe, userDoc } = useAuth();

  const [activeSection, setActiveSection] = useState(SECTION_IDS.account);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [videoUsage, setVideoUsage] = useState(null);
  const [videoUsageLoading, setVideoUsageLoading] = useState(false);
  const [videoUsageError, setVideoUsageError] = useState("");
  const [storageUsage, setStorageUsage] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const apiBase = (process.env.REACT_APP_API_BASE_URL || "").trim();

  const tierLabels = useMemo(
    () => ({
      trial_monthly: "Trial",
      early_access: "Early Access",
      starter_monthly: "Starter",
      pro_monthly: "Pro",
      business_monthly: "Business",
    }),
    []
  );

  const statusLabels = useMemo(
    () => ({
      active: "Active",
      trialing: "Trialing",
      past_due: "Past due",
      pending: "Pending",
      inactive: "Inactive",
      canceled: "Canceled",
    }),
    []
  );

  const formatUnixDate = (seconds) => {
    if (!seconds) return "—";

    return new Date(seconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatBillingPeriod = (data) => {
    if (!data) return "—";

    if (data.periodSource === "stripe" && data.periodStart && data.periodEnd) {
      return `${formatUnixDate(data.periodStart)} – ${formatUnixDate(data.periodEnd)}`;
    }

    return data.month || "—";
  };

  const formatResetText = (data) => {
    if (!data) return "Usage reset date unavailable";

    if (data.periodSource === "stripe" && data.periodEnd) {
      return `Resets ${formatUnixDate(data.periodEnd)}`;
    }

    return "Resets monthly";
  };

  const getToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Not logged in.");
    return user.getIdToken();
  };

  async function fetchUsage() {
    setUsageError("");
    setUsageLoading(true);

    try {
      if (!apiBase) {
        throw new Error(
          "Missing REACT_APP_API_BASE_URL at build time. Rebuild frontend."
        );
      }

      const token = await getToken();
      const response = await fetch(`${apiBase}/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          data?.detail ||
          data?.message ||
          `Failed to load usage (${response.status})`;

        throw new Error(
          typeof detail === "string" ? detail : JSON.stringify(detail)
        );
      }

      setUsage(data);
    } catch (requestError) {
      setUsage(null);
      setUsageError(requestError?.message || "Failed to load usage.");
    } finally {
      setUsageLoading(false);
    }
  }

  async function fetchVideoUsage() {
    setVideoUsageError("");
    setVideoUsageLoading(true);

    try {
      if (!apiBase) {
        throw new Error(
          "Missing REACT_APP_API_BASE_URL at build time. Rebuild frontend."
        );
      }

      const token = await getToken();
      const response = await fetch(`${apiBase}/video/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          data?.detail ||
          data?.message ||
          `Failed to load video usage (${response.status})`;

        throw new Error(
          typeof detail === "string" ? detail : JSON.stringify(detail)
        );
      }

      setVideoUsage(data);
    } catch (requestError) {
      setVideoUsage(null);
      setVideoUsageError(
        requestError?.message || "Failed to load video usage."
      );
    } finally {
      setVideoUsageLoading(false);
    }
  }

  async function fetchStorageUsage() {
    setStorageLoading(true);

    try {
      if (!apiBase) return;

      const token = await getToken();
      const response = await fetch(`${apiBase}/storage/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setStorageUsage(await response.json());
      }
    } catch {
      setStorageUsage(null);
    } finally {
      setStorageLoading(false);
    }
  }

  const refreshUsage = async () => {
    await Promise.all([
      fetchUsage(),
      fetchVideoUsage(),
      fetchStorageUsage(),
    ]);
  };

  useEffect(() => {
    if (!currentUser?.uid) return;

    refreshUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  if (!currentUser) {
    return (
      <main className="acct-v2-page">
        <section className="acct-v2-login-state">
          <div className="acct-v2-login-card">
            <span className="acct-v2-login-icon">
              <LogIn size={22} />
            </span>
            <h1>Sign in to view your account.</h1>
            <p>
              Access your subscription, billing details, and usage limits.
            </p>
            <button type="button" onClick={() => navigate("/login")}>
              Go to sign in
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>
    );
  }

  const status = (stripe?.status ?? "inactive").toLowerCase();
  const tier = stripe?.tier ?? "—";
  const customerId = stripe?.customerId ?? null;
  const requestedTier = (stripe?.requestedTier || "").trim();
  const hasRequestedTier = Boolean(requestedTier);
  const requestedLabel = tierLabels[requestedTier] || requestedTier;
  const currentLabel = tierLabels[tier] || tier;
  const statusLabel = statusLabels[status] || status;
  const isActiveOrTrial =
    status === "active" ||
    status === "trialing" ||
    status === "past_due";

  const shouldShowRequestBanner =
    hasRequestedTier && requestedTier !== tier;

  const displayName =
    currentUser.displayName ||
    [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(" ") ||
    "AdGen user";

  const signInMethod =
    currentUser.providerData?.[0]?.providerId === "google.com"
      ? "Google"
      : "Email and password";

  const imageUsed = Number(usage?.used || 0);
  const imageCap = Number(usage?.cap || 0);
  const videoUsed = Number(videoUsage?.used || 0);
  const videoCap = Number(videoUsage?.cap || 0);
  const optimizerUsed = Number(usage?.optimizerUsed || 0);
  const optimizerCap = Number(usage?.optimizerCap || 0);
  const storageUsedBytes = Number(storageUsage?.usedBytes || 0);
  const storageLimitBytes = Number(storageUsage?.limitBytes || 0);

  async function openBillingPortal() {
    setError("");
    setLoadingPortal(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in.");

      const token = await user.getIdToken(true);
      let url;

      const arity =
        typeof createPortalSession === "function"
          ? createPortalSession.length
          : 0;

      if (arity >= 2) {
        const response = await createPortalSession(apiBase, token);
        url = response?.url || response;
      } else {
        if (!customerId) {
          throw new Error(
            "No Stripe customer found yet. Subscribe first or try again shortly."
          );
        }

        const response = await createPortalSession(customerId);
        url = response?.url || response;
      }

      if (!url) throw new Error("No billing portal URL returned.");

      window.location.href = url;
    } catch (portalError) {
      setError(portalError?.message || "Could not open billing portal.");
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

  const dismissRequestedTier = async () => {
    setError("");

    try {
      if (!apiBase) {
        throw new Error(
          "Missing REACT_APP_API_BASE_URL at build time. Rebuild frontend."
        );
      }

      if (!window.confirm("Dismiss this plan change request?")) return;

      setDismissing(true);

      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch(
        `${apiBase}/users/me/tier/clear-request`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          data?.detail ||
          data?.message ||
          `Failed to dismiss request (${response.status})`;

        throw new Error(
          typeof detail === "string" ? detail : JSON.stringify(detail)
        );
      }
    } catch (dismissError) {
      setError(
        dismissError?.message || "Failed to dismiss the plan request."
      );
    } finally {
      setDismissing(false);
    }
  };

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);

    document
      .getElementById(`acct-v2-${sectionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="acct-v2-page">
      <div className="acct-v2-background" aria-hidden="true" />

      <div className="acct-v2-shell">
        <header className="acct-v2-header">
          <div>
            <span className="acct-v2-eyebrow">Account settings</span>
            <h1>My Account</h1>
            <p>
              Manage your profile, subscription, billing, and usage limits.
            </p>
          </div>

          <div className="acct-v2-plan-badge">
            <span>{currentLabel}</span>
            <strong className={`status-${status}`}>{statusLabel}</strong>
          </div>
        </header>

        {error && (
          <div className="acct-v2-error" role="alert">
            <span>!</span>
            <p>{error}</p>
          </div>
        )}

        <div className="acct-v2-layout">
          <aside className="acct-v2-sidebar">
            <div className="acct-v2-sidebar-card">
              <span className="acct-v2-sidebar-label">Settings</span>

              {[
                {
                  id: SECTION_IDS.account,
                  label: "Account",
                  icon: Settings,
                },
                {
                  id: SECTION_IDS.subscription,
                  label: "Subscription & billing",
                  icon: CreditCard,
                },
                {
                  id: SECTION_IDS.usage,
                  label: "Usage & limits",
                  icon: HardDrive,
                },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={activeSection === id ? "is-active" : ""}
                  onClick={() => scrollToSection(id)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="acct-v2-help-card">
              <ShieldCheck size={20} />
              <h2>Need account help?</h2>
              <p>
                Contact billing@adgenmcm.com for subscription or payment support.
              </p>
              <a href="mailto:billing@adgenmcm.com">Contact billing</a>
               <p>
                Contact support@adgenmcm.com for account support.
              </p>
              <a href="mailto:support@adgenmcm.com">Contact support</a>
            </div>
          </aside>

          <div className="acct-v2-content">
            <section
              id="acct-v2-account"
              className="acct-v2-panel"
            >
              <div className="acct-v2-panel-head">
                <div>
                  <span className="acct-v2-panel-kicker">Profile</span>
                  <h2>Account information</h2>
                  <p>
                    The identity and sign-in details associated with your AdGen account.
                  </p>
                </div>

                <span className="acct-v2-panel-icon">
                  <Settings size={20} />
                </span>
              </div>

              <div className="acct-v2-profile">
                <div className="acct-v2-avatar">
                  {displayName.charAt(0).toUpperCase()}
                </div>

                <div>
                  <h3>{displayName}</h3>
                  <p>{currentUser.email || "—"}</p>
                </div>

                <span className="acct-v2-verified">
                  <BadgeCheck size={15} />
                  {currentUser.emailVerified ? "Verified" : "Not verified"}
                </span>
              </div>

              <div className="acct-v2-detail-list">
                <div>
                  <span>Email address</span>
                  <strong>{currentUser.email || "—"}</strong>
                </div>

                <div>
                  <span>Sign-in method</span>
                  <strong>{signInMethod}</strong>
                </div>

                <div>
                  <span>Email verification</span>
                  <strong>
                    {currentUser.emailVerified ? "Verified" : "Pending"}
                  </strong>
                </div>
              </div>
            </section>

            <section
              id="acct-v2-subscription"
              className="acct-v2-panel"
            >
              <div className="acct-v2-panel-head">
                <div>
                  <span className="acct-v2-panel-kicker">Plan & payments</span>
                  <h2>Subscription & billing</h2>
                  <p>
                    Review your plan, renewal details, invoices, and payment settings.
                  </p>
                </div>

                <span className="acct-v2-panel-icon">
                  <CreditCard size={20} />
                </span>
              </div>

              {shouldShowRequestBanner && (
                <div className="acct-v2-request">
                  <div>
                    <span>Plan change requested</span>
                    <h3>{requestedLabel}</h3>
                    <p>
                      Your current plan is {currentLabel}. Confirm the requested
                      change or dismiss it.
                    </p>
                  </div>

                  <div className="acct-v2-request-actions">
                    <button
                      type="button"
                      className="acct-v2-primary"
                      onClick={confirmRequestedTier}
                      disabled={
                        !requestedTier ||
                        loadingPortal ||
                        dismissing
                      }
                    >
                      {isActiveOrTrial
                        ? "Confirm in billing"
                        : "Confirm and subscribe"}
                    </button>

                    <button
                      type="button"
                      className="acct-v2-secondary"
                      onClick={dismissRequestedTier}
                      disabled={dismissing || loadingPortal}
                    >
                      {dismissing ? "Dismissing…" : "Dismiss"}
                    </button>
                  </div>
                </div>
              )}

              <div className="acct-v2-subscription-summary">
                <div className="acct-v2-subscription-main">
                  <span>Current plan</span>
                  <h3>{currentLabel}</h3>
                  <p>
                    {isActiveOrTrial
                      ? "Your workspace has active access."
                      : "Choose a plan to activate your workspace."}
                  </p>
                </div>

                <div className="acct-v2-subscription-status">
                  <span>Status</span>
                  <strong className={`status-${status}`}>
                    {statusLabel}
                  </strong>
                </div>
              </div>

              <div className="acct-v2-detail-list">
                <div>
                  <span>Billing period</span>
                  <strong>{formatBillingPeriod(usage)}</strong>
                </div>

                <div>
                  <span>Renewal or reset date</span>
                  <strong>
                    {usage?.periodEnd
                      ? formatUnixDate(usage.periodEnd)
                      : "—"}
                  </strong>
                </div>
              </div>

              <div className="acct-v2-actions">
                <button
                  type="button"
                  className="acct-v2-primary"
                  onClick={openBillingPortal}
                  disabled={loadingPortal}
                >
                  {loadingPortal
                    ? "Opening billing…"
                    : "Open secure billing portal"}
                  {!loadingPortal && <ArrowRight size={17} />}
                </button>

                <button
                  type="button"
                  className="acct-v2-secondary"
                  onClick={() => navigate("/pricing")}
                >
                  Compare plans
                </button>
              </div>

              <div className="acct-v2-secure-billing">
                <div className="acct-v2-billing-icon">
                  <ShieldCheck size={21} />
                </div>

                <div>
                  <h3>Secure billing portal</h3>
                  <p>
                    Update your payment method, view invoices, or change your
                    subscription securely.
                  </p>
                </div>
              </div>

              <div className="acct-v2-billing-note">
                <Mail size={16} />
                <span>
                  Billing questions? Contact{" "}
                  <a href="mailto:billing@adgenmcm.com">
                    billing@adgenmcm.com
                  </a>
                  .
                </span>
              </div>
            </section>

            <section
              id="acct-v2-usage"
              className="acct-v2-panel"
            >
              <div className="acct-v2-panel-head">
                <div>
                  <span className="acct-v2-panel-kicker">Capacity</span>
                  <h2>Usage & limits</h2>
                  <p>
                    Monitor the monthly limits included with your plan.
                  </p>
                </div>

                <button
                  type="button"
                  className="acct-v2-refresh"
                  onClick={refreshUsage}
                  disabled={
                    usageLoading ||
                    videoUsageLoading ||
                    storageLoading
                  }
                >
                  <RefreshCw
                    size={16}
                    className={
                      usageLoading ||
                      videoUsageLoading ||
                      storageLoading
                        ? "is-spinning"
                        : ""
                    }
                  />
                  Refresh
                </button>
              </div>

              {(usageError || videoUsageError) && (
                <div className="acct-v2-inline-error">
                  {usageError || videoUsageError}
                </div>
              )}

              <div className="acct-v2-usage-list">
                <UsageRow
                  icon={Image}
                  label="Image generations"
                  value={
                    usage
                      ? `${imageUsed} / ${imageCap}`
                      : "Unavailable"
                  }
                  used={imageUsed}
                  cap={imageCap}
                  helper={formatResetText(usage)}
                  warning={imageCap > 0 && imageUsed / imageCap >= 0.8}
                />

                <UsageRow
                  icon={Video}
                  label="Video credits"
                  value={
                    videoUsage
                      ? `${videoUsed} / ${videoCap}`
                      : "Unavailable"
                  }
                  used={videoUsed}
                  cap={videoCap}
                  helper={
                    videoUsage?.enabled === false
                      ? "Not included with this plan"
                      : formatResetText(videoUsage)
                  }
                  warning={
                    videoCap > 0 && videoUsed / videoCap >= 0.8
                  }
                />

                <UsageRow
                  icon={Sparkles}
                  label="Optimizer runs"
                  value={
                    optimizerCap > 0
                      ? `${optimizerUsed} / ${optimizerCap}`
                      : "Not included"
                  }
                  used={optimizerUsed}
                  cap={optimizerCap}
                  helper={
                    optimizerCap > 0
                      ? formatResetText(usage)
                      : "Available on Pro and Business"
                  }
                  warning={
                    optimizerCap > 0 &&
                    optimizerUsed / optimizerCap >= 0.8
                  }
                />

                <UsageRow
                  icon={HardDrive}
                  label="Creative storage"
                  value={
                    storageUsage
                      ? `${formatStorageValue(
                          storageUsedBytes
                        )} / ${formatStorageValue(
                          storageLimitBytes
                        )}`
                      : "Unavailable"
                  }
                  used={storageUsedBytes}
                  cap={storageLimitBytes}
                  helper={
                    storageUsage
                      ? `${storageUsage.assetCount || 0} stored assets`
                      : "Storage data is not available yet"
                  }
                  warning={Boolean(storageUsage?.warning)}
                />
              </div>
            </section>

          </div>
        </div>
      </div>
    </main>
  );
}




