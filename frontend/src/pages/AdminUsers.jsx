import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Database,
  Eye,
  HardDrive,
  Image,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import { auth } from "../firebaseConfig";
import "./AdminUsers.css";

const TIER_OPTIONS = [
  { value: "", label: "No request" },
  { value: "trial_monthly", label: "Trial" },
  { value: "starter_monthly", label: "Starter" },
  { value: "pro_monthly", label: "Pro" },
  { value: "business_monthly", label: "Business" },
];

const TIER_LABELS = {
  trial_monthly: "Trial",
  starter_monthly: "Starter",
  pro_monthly: "Pro",
  business_monthly: "Business",
  free: "Free",
};

const STATUS_LABELS = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  pending: "Pending",
  inactive: "Inactive",
  canceled: "Canceled",
};

function formatDate(value, includeTime = true) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime
      ? {
          hour: "numeric",
          minute: "2-digit",
        }
      : {}),
  });
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);

  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function getTierLabel(value) {
  return TIER_LABELS[value] || value || "No plan";
}

function getStatusLabel(value) {
  return STATUS_LABELS[value] || value || "Inactive";
}

function UsageMeter({
  label,
  used = 0,
  cap = 0,
  percent = 0,
  icon: Icon,
  disabled = false,
}) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const warning = safePercent >= 80 && safePercent < 100;
  const hardLimit = safePercent >= 100;

  return (
    <div
      className={[
        "admin-v2-meter",
        disabled ? "is-disabled" : "",
        warning ? "is-warning" : "",
        hardLimit ? "is-hard-limit" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="admin-v2-meter-top">
        <span>
          <Icon size={14} />
          {label}
        </span>

        <strong>
          {disabled ? "Not included" : `${used} / ${cap}`}
        </strong>
      </div>

      <div className="admin-v2-meter-track" aria-hidden="true">
        <span style={{ width: `${disabled ? 0 : safePercent}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, helper, icon: Icon, tone = "default" }) {
  return (
    <article className={`admin-v2-stat tone-${tone}`}>
      <span className="admin-v2-stat-icon">
        <Icon size={19} />
      </span>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </article>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  variant = "secondary",
  icon: Icon,
}) {
  return (
    <button
      type="button"
      className={`admin-v2-action-btn variant-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && <Icon size={15} />}
      <span>{children}</span>
    </button>
  );
}

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("all");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(50);

  const [cursor, setCursor] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [pageStack, setPageStack] = useState([]);

  const [selectedUser, setSelectedUser] = useState(null);
  const [openActionUid, setOpenActionUid] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [grantValues, setGrantValues] = useState({});
  const [requestedTiers, setRequestedTiers] = useState({});

  const productionApi = "https://updated-adgen.onrender.com";

  const envApi =
    (process.env.REACT_APP_API_URL || "").trim() ||
    (process.env.REACT_APP_API_BASE_URL || "").trim();

  const apiBase = envApi || productionApi || "http://127.0.0.1:8000";

  const authedFetch = useCallback(
    async (path, options = {}) => {
      const token = await auth.currentUser?.getIdToken(true);

      if (!token) {
        throw new Error("You must be signed in as an administrator.");
      }

      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(async () => {
        const text = await response.text().catch(() => "");
        return text ? { detail: text } : null;
      });

      if (!response.ok) {
        const detail =
          data?.detail ||
          data?.message ||
          `Request failed with status ${response.status}.`;

        throw new Error(
          typeof detail === "string" ? detail : JSON.stringify(detail)
        );
      }

      return data;
    },
    [apiBase]
  );

  const fetchUsers = useCallback(
    async (overrides = {}) => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();

        params.set("q", overrides.q ?? query);
        params.set("tier", overrides.tier ?? tier);
        params.set("status", overrides.status ?? status);
        params.set("limit", String(overrides.limit ?? limit));

        const requestedCursor =
          overrides.cursor !== undefined ? overrides.cursor : cursor;

        if (requestedCursor) {
          params.set("page_token", requestedCursor);
        }

        const data = await authedFetch(
          `/admin/users?${params.toString()}`
        );

        const users = data?.users || [];

        setRows(users);
        setNextCursor(data?.nextCursor || "");

        setRequestedTiers((current) => {
          const next = { ...current };

          users.forEach((user) => {
            next[user.uid] = user.requestedTier || "";
          });

          return next;
        });
      } catch (requestError) {
        setRows([]);
        setNextCursor("");
        setError(requestError.message || "Could not load users.");
      } finally {
        setLoading(false);
      }
    },
    [authedFetch, cursor, limit, query, status, tier]
  );

  useEffect(() => {
    fetchUsers({ cursor: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedUser) return;

    const refreshed = rows.find((user) => user.uid === selectedUser.uid);

    if (refreshed) {
      setSelectedUser(refreshed);
    }
  }, [rows, selectedUser]);

  const summary = useMemo(() => {
    const active = rows.filter((user) =>
      ["active", "trialing"].includes(user.stripeStatus)
    ).length;

    const pastDue = rows.filter(
      (user) => user.stripeStatus === "past_due"
    ).length;

    const highUsage = rows.filter(
      (user) =>
        Number(user.usagePct || 0) >= 80 ||
        Number(user.videoUsagePct || 0) >= 80 ||
        Number(user.optimizerUsagePct || 0) >= 80 ||
        Number(user.storageUsagePct || 0) >= 80
    ).length;

    const verified = rows.filter((user) => user.emailVerified).length;

    return {
      total: rows.length,
      active,
      pastDue,
      highUsage,
      verified,
    };
  }, [rows]);

  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => {
      setNotice("");
    }, 4000);
  };

  const setActionBusy = (uid, action) => {
    setBusyAction(`${uid}:${action}`);
  };

  const isActionBusy = (uid, action) =>
    busyAction === `${uid}:${action}`;

  const runAction = async ({
    user,
    action,
    path,
    options,
    successMessage,
  }) => {
    setActionBusy(user.uid, action);
    setError("");

    try {
      await authedFetch(path, options);
      await fetchUsers({ cursor });
      notify(successMessage);
      setOpenActionUid("");
    } catch (actionError) {
      setError(actionError.message || "Action failed.");
    } finally {
      setBusyAction("");
    }
  };

  const applyFilters = async (event) => {
    event.preventDefault();
    setCursor("");
    setNextCursor("");
    setPageStack([]);

    await fetchUsers({
      cursor: "",
      q: query,
      tier,
      status,
      limit,
    });
  };

  const resetFilters = async () => {
    setQuery("");
    setTier("all");
    setStatus("all");
    setLimit(50);
    setCursor("");
    setNextCursor("");
    setPageStack([]);

    await fetchUsers({
      cursor: "",
      q: "",
      tier: "all",
      status: "all",
      limit: 50,
    });
  };

  const goNext = async () => {
    if (!nextCursor) return;

    setPageStack((stack) => [...stack, cursor]);
    setCursor(nextCursor);
    await fetchUsers({ cursor: nextCursor });
  };

  const goPrevious = async () => {
    if (pageStack.length === 0) return;

    const previousCursor = pageStack[pageStack.length - 1];

    setPageStack((stack) => stack.slice(0, -1));
    setCursor(previousCursor);
    await fetchUsers({ cursor: previousCursor });
  };

  const copyText = async (value, label) => {
    if (!value) {
      setError(`${label} is not available.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const getGrantValue = (uid, resource, fallback) => {
    const key = `${uid}:${resource}`;
    const value = Number(grantValues[key]);

    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  const setGrantValue = (uid, resource, value) => {
    setGrantValues((current) => ({
      ...current,
      [`${uid}:${resource}`]: value,
    }));
  };

  const confirmAction = (message) => window.confirm(message);

  const grantCredits = async (user, resource) => {
    const config = {
      images: {
        label: "image credits",
        fallback: 5,
        path: (amount) =>
          `/admin/users/${user.uid}/usage/grant?credits=${amount}`,
      },
      video: {
        label: "video credits",
        fallback: 1,
        path: (amount) =>
          `/admin/users/${user.uid}/video/usage/grant?credits=${amount}`,
      },
      optimizer: {
        label: "Optimizer runs",
        fallback: 5,
        path: (amount) =>
          `/admin/users/${user.uid}/optimizer/usage/grant?credits=${amount}`,
      },
    }[resource];

    const amount = getGrantValue(
      user.uid,
      resource,
      config.fallback
    );

    if (
      !confirmAction(
        `Grant ${amount} ${config.label} to ${user.email || user.uid}?`
      )
    ) {
      return;
    }

    await runAction({
      user,
      action: `grant-${resource}`,
      path: config.path(amount),
      options: { method: "POST" },
      successMessage: `${amount} ${config.label} granted to ${
        user.email || "the user"
      }.`,
    });
  };

  const resetUsage = async (user, resource) => {
    const config = {
      images: {
        label: "image usage",
        path: `/admin/users/${user.uid}/usage/reset`,
      },
      video: {
        label: "video usage",
        path: `/admin/users/${user.uid}/video/usage/reset`,
      },
      optimizer: {
        label: "Optimizer usage",
        path: `/admin/users/${user.uid}/optimizer/usage/reset`,
      },
      all: {
        label: "all current-period usage",
        path: `/admin/users/${user.uid}/usage/reset-all`,
      },
    }[resource];

    if (
      !confirmAction(
        `Reset ${config.label} for ${user.email || user.uid}?`
      )
    ) {
      return;
    }

    await runAction({
      user,
      action: `reset-${resource}`,
      path: config.path,
      options: { method: "POST" },
      successMessage: `${config.label} reset for ${
        user.email || "the user"
      }.`,
    });
  };

  const requestTierChange = async (user) => {
    const requestedTier = requestedTiers[user.uid] || "";

    if (!requestedTier) {
      setError("Choose a requested plan first.");
      return;
    }

    if (
      !confirmAction(
        `Request ${getTierLabel(requestedTier)} for ${
          user.email || user.uid
        }? The user will still need to confirm the billing change.`
      )
    ) {
      return;
    }

    await runAction({
      user,
      action: "request-tier",
      path: `/admin/users/${user.uid}/tier/request`,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedTier }),
      },
      successMessage: `Plan request saved for ${
        user.email || "the user"
      }.`,
    });
  };

  const clearTierRequest = async (user) => {
    if (
      !confirmAction(
        `Clear the pending plan request for ${
          user.email || user.uid
        }?`
      )
    ) {
      return;
    }

    await runAction({
      user,
      action: "clear-tier",
      path: `/admin/users/${user.uid}/tier/clear-request`,
      options: { method: "POST" },
      successMessage: `Pending plan request cleared for ${
        user.email || "the user"
      }.`,
    });
  };

  const syncSubscription = async (user) => {
    if (
      !confirmAction(
        `Sync the current billing subscription for ${
          user.email || user.uid
        }?`
      )
    ) {
      return;
    }

    await runAction({
      user,
      action: "sync-subscription",
      path: `/admin/users/${user.uid}/subscription/sync`,
      options: { method: "POST" },
      successMessage: `Subscription synced for ${
        user.email || "the user"
      }.`,
    });
  };

  const renderActionMenu = (user) => {
    const isOpen = openActionUid === user.uid;

    return (
      <div className="admin-v2-row-actions">
        <button
          type="button"
          className="admin-v2-icon-button"
          onClick={() => setSelectedUser(user)}
          aria-label={`View ${user.email || "user"} details`}
          title="View details"
        >
          <Eye size={16} />
        </button>

        <div className="admin-v2-more-wrap">
          <button
            type="button"
            className="admin-v2-icon-button"
            onClick={() =>
              setOpenActionUid((current) =>
                current === user.uid ? "" : user.uid
              )
            }
            aria-label={`Open actions for ${user.email || "user"}`}
            aria-expanded={isOpen}
          >
            <MoreHorizontal size={17} />
          </button>

          {isOpen && (
            <div className="admin-v2-row-menu">
              <button
                type="button"
                onClick={() => syncSubscription(user)}
                disabled={isActionBusy(user.uid, "sync-subscription")}
              >
                <RefreshCw size={15} />
                Sync subscription
              </button>

              <button
                type="button"
                onClick={() => resetUsage(user, "all")}
                disabled={isActionBusy(user.uid, "reset-all")}
              >
                <Database size={15} />
                Reset all usage
              </button>

              <button
                type="button"
                onClick={() => copyText(user.uid, "UID")}
              >
                <Copy size={15} />
                Copy UID
              </button>

              {user.customerId && (
                <button
                  type="button"
                  onClick={() =>
                    copyText(user.customerId, "Customer ID")
                  }
                >
                  <Copy size={15} />
                  Copy customer ID
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="admin-v2-page">
      <div className="admin-v2-bg" aria-hidden="true" />

      <div className="admin-v2-shell">
        <header className="admin-v2-header">
          <div>
            <span className="admin-v2-eyebrow">Operations</span>
            <h1>Admin Control Center</h1>
            <p>
              Review customers, subscriptions, usage, and account health from
              one workspace.
            </p>
          </div>

          <div className="admin-v2-header-actions">
            <ActionButton
              variant="secondary"
              icon={RefreshCw}
              onClick={() => fetchUsers({ cursor })}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </ActionButton>
          </div>
        </header>

        <section className="admin-v2-stats" aria-label="User summary">
          <StatCard
            label="Users shown"
            value={summary.total}
            helper={`Page ${pageStack.length + 1}`}
            icon={Users}
          />

          <StatCard
            label="Active access"
            value={summary.active}
            helper="Active or trialing"
            icon={UserCheck}
            tone="success"
          />

          <StatCard
            label="Past due"
            value={summary.pastDue}
            helper="Billing attention"
            icon={AlertTriangle}
            tone="warning"
          />

          <StatCard
            label="High usage"
            value={summary.highUsage}
            helper="80% or greater"
            icon={BarChart3}
            tone="purple"
          />

          <StatCard
            label="Verified"
            value={summary.verified}
            helper="Verified email"
            icon={ShieldCheck}
            tone="blue"
          />
        </section>

        <form className="admin-v2-filters" onSubmit={applyFilters}>
          <label className="admin-v2-search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Search name, email, UID, or customer ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <select
            value={tier}
            onChange={(event) => setTier(event.target.value)}
            aria-label="Filter by plan"
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="trial_monthly">Trial</option>
            <option value="starter_monthly">Starter</option>
            <option value="pro_monthly">Pro</option>
            <option value="business_monthly">Business</option>
          </select>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by subscription status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="pending">Pending</option>
            <option value="past_due">Past due</option>
            <option value="inactive">Inactive</option>
            <option value="canceled">Canceled</option>
          </select>

          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            aria-label="Rows per page"
          >
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>

          <button
            type="submit"
            className="admin-v2-filter-primary"
            disabled={loading}
          >
            Apply filters
          </button>

          <button
            type="button"
            className="admin-v2-filter-secondary"
            onClick={resetFilters}
            disabled={loading}
          >
            Reset
          </button>
        </form>

        {notice && (
          <div className="admin-v2-notice success" role="status">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className="admin-v2-notice error" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={15} />
            </button>
          </div>
        )}

        <section className="admin-v2-table-card">
          <div className="admin-v2-table-head">
            <div>
              <span>Customer directory</span>
              <strong>
                {loading
                  ? "Loading users…"
                  : `${rows.length} user${rows.length === 1 ? "" : "s"} on this page`}
              </strong>
            </div>

            <div className="admin-v2-pagination">
              <button
                type="button"
                onClick={goPrevious}
                disabled={pageStack.length === 0 || loading}
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <span>Page {pageStack.length + 1}</span>

              <button
                type="button"
                onClick={goNext}
                disabled={!nextCursor || loading}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="admin-v2-table-wrap">
            <table className="admin-v2-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Usage</th>
                  <th>Account</th>
                  <th>Last sign-in</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>

              <tbody>
                {rows.map((user) => {
                  const displayName =
                    user.fullName ||
                    [user.firstName, user.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                    user.displayName ||
                    "AdGen user";

                  return (
                    <tr key={user.uid}>
                      <td>
                        <button
                          type="button"
                          className="admin-v2-user-cell"
                          onClick={() => setSelectedUser(user)}
                        >
                          <span className="admin-v2-user-avatar">
                            {(displayName || user.email || "U")
                              .trim()
                              .charAt(0)
                              .toUpperCase()}
                          </span>

                          <span>
                            <strong>{displayName}</strong>
                            <small>{user.email || "No email"}</small>
                          </span>
                        </button>
                      </td>

                      <td>
                        <span
                          className={`admin-v2-tier tier-${
                            user.tier || "none"
                          }`}
                        >
                          {getTierLabel(user.tier)}
                        </span>

                        {user.requestedTier && (
                          <small className="admin-v2-requested">
                            Requested: {getTierLabel(user.requestedTier)}
                          </small>
                        )}
                      </td>

                      <td>
                        <span
                          className={`admin-v2-status status-${
                            user.stripeStatus || "inactive"
                          }`}
                        >
                          {getStatusLabel(user.stripeStatus)}
                        </span>
                      </td>

                      <td>
                        <div className="admin-v2-usage-stack">
                          <UsageMeter
                            label="Images"
                            icon={Image}
                            used={user.used || 0}
                            cap={user.cap || 0}
                            percent={user.usagePct || 0}
                            disabled={Number(user.cap || 0) <= 0}
                          />

                          <UsageMeter
                            label="Video"
                            icon={Video}
                            used={user.videoUsed || 0}
                            cap={user.videoCap || 0}
                            percent={user.videoUsagePct || 0}
                            disabled={Number(user.videoCap || 0) <= 0}
                          />

                          <UsageMeter
                            label="Optimizer"
                            icon={Sparkles}
                            used={user.optimizerUsed || 0}
                            cap={user.optimizerCap || 0}
                            percent={user.optimizerUsagePct || 0}
                            disabled={Number(user.optimizerCap || 0) <= 0}
                          />
                        </div>
                      </td>

                      <td>
                        <div className="admin-v2-account-flags">
                          <span className={user.emailVerified ? "is-good" : ""}>
                            <Mail size={13} />
                            {user.emailVerified ? "Verified" : "Unverified"}
                          </span>

                          <span className={user.disabled ? "is-bad" : "is-good"}>
                            <ShieldCheck size={13} />
                            {user.disabled ? "Disabled" : "Enabled"}
                          </span>

                          <span>
                            <HardDrive size={13} />
                            {formatBytes(user.storageUsedBytes)}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="admin-v2-date-cell">
                          <Clock3 size={14} />
                          <span>{formatDate(user.lastSignInAt)}</span>
                        </div>
                      </td>

                      <td>{renderActionMenu(user)}</td>
                    </tr>
                  );
                })}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="admin-v2-empty">
                        <Users size={26} />
                        <h3>No users found</h3>
                        <p>Try changing the current filters or search query.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedUser && (
        <div className="admin-v2-drawer-layer">
          <button
            type="button"
            className="admin-v2-drawer-backdrop"
            onClick={() => setSelectedUser(null)}
            aria-label="Close user details"
          />

          <aside className="admin-v2-drawer">
            <div className="admin-v2-drawer-head">
              <div>
                <span className="admin-v2-eyebrow">User operations</span>
                <h2>
                  {selectedUser.fullName ||
                    [selectedUser.firstName, selectedUser.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                    selectedUser.displayName ||
                    "AdGen user"}
                </h2>
                <p>{selectedUser.email || "No email available"}</p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                aria-label="Close user details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-v2-drawer-scroll">
              <section className="admin-v2-drawer-section">
                <div className="admin-v2-section-title">
                  <UserCheck size={17} />
                  <h3>Account</h3>
                </div>

                <div className="admin-v2-detail-list">
                  <div>
                    <span>Email</span>
                    <strong>{selectedUser.email || "—"}</strong>
                  </div>

                  <div>
                    <span>Email verified</span>
                    <strong>
                      {selectedUser.emailVerified ? "Yes" : "No"}
                    </strong>
                  </div>

                  <div>
                    <span>Account state</span>
                    <strong>
                      {selectedUser.disabled ? "Disabled" : "Enabled"}
                    </strong>
                  </div>

                  <div>
                    <span>Created</span>
                    <strong>{formatDate(selectedUser.createdAt)}</strong>
                  </div>

                  <div>
                    <span>Last sign-in</span>
                    <strong>{formatDate(selectedUser.lastSignInAt)}</strong>
                  </div>
                </div>
              </section>

              <section className="admin-v2-drawer-section">
                <div className="admin-v2-section-title">
                  <CircleDollarSign size={17} />
                  <h3>Subscription</h3>
                </div>

                <div className="admin-v2-subscription-block">
                  <div>
                    <span>Current plan</span>
                    <strong>{getTierLabel(selectedUser.tier)}</strong>
                  </div>

                  <div>
                    <span>Status</span>
                    <strong>{getStatusLabel(selectedUser.stripeStatus)}</strong>
                  </div>

                  <div>
                    <span>Billing period</span>
                    <strong>
                      {selectedUser.currentPeriodStart &&
                      selectedUser.currentPeriodEnd
                        ? `${formatDate(
                            selectedUser.currentPeriodStart * 1000,
                            false
                          )} – ${formatDate(
                            selectedUser.currentPeriodEnd * 1000,
                            false
                          )}`
                        : "—"}
                    </strong>
                  </div>
                </div>

                <div className="admin-v2-tier-request">
                  <label htmlFor={`tier-${selectedUser.uid}`}>
                    Requested plan
                  </label>

                  <div>
                    <select
                      id={`tier-${selectedUser.uid}`}
                      value={requestedTiers[selectedUser.uid] || ""}
                      onChange={(event) =>
                        setRequestedTiers((current) => ({
                          ...current,
                          [selectedUser.uid]: event.target.value,
                        }))
                      }
                    >
                      {TIER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <ActionButton
                      variant="primary"
                      onClick={() => requestTierChange(selectedUser)}
                      disabled={isActionBusy(
                        selectedUser.uid,
                        "request-tier"
                      )}
                    >
                      Save request
                    </ActionButton>
                  </div>

                  {selectedUser.requestedTier && (
                    <ActionButton
                      variant="ghost"
                      onClick={() => clearTierRequest(selectedUser)}
                      disabled={isActionBusy(
                        selectedUser.uid,
                        "clear-tier"
                      )}
                    >
                      Clear pending request
                    </ActionButton>
                  )}
                </div>

                <ActionButton
                  icon={RefreshCw}
                  onClick={() => syncSubscription(selectedUser)}
                  disabled={isActionBusy(
                    selectedUser.uid,
                    "sync-subscription"
                  )}
                >
                  Sync subscription
                </ActionButton>
              </section>

              <section className="admin-v2-drawer-section">
                <div className="admin-v2-section-title">
                  <BarChart3 size={17} />
                  <h3>Usage controls</h3>
                </div>

                {[
                  {
                    key: "images",
                    label: "Images",
                    icon: Image,
                    used: selectedUser.used || 0,
                    cap: selectedUser.cap || 0,
                    percent: selectedUser.usagePct || 0,
                    fallback: 5,
                  },
                  {
                    key: "video",
                    label: "Video credits",
                    icon: Video,
                    used: selectedUser.videoUsed || 0,
                    cap: selectedUser.videoCap || 0,
                    percent: selectedUser.videoUsagePct || 0,
                    fallback: 1,
                  },
                  {
                    key: "optimizer",
                    label: "Optimizer runs",
                    icon: Sparkles,
                    used: selectedUser.optimizerUsed || 0,
                    cap: selectedUser.optimizerCap || 0,
                    percent: selectedUser.optimizerUsagePct || 0,
                    fallback: 5,
                  },
                ].map((resource) => (
                  <div
                    key={resource.key}
                    className="admin-v2-resource-control"
                  >
                    <UsageMeter
                      label={resource.label}
                      icon={resource.icon}
                      used={resource.used}
                      cap={resource.cap}
                      percent={resource.percent}
                      disabled={resource.cap <= 0}
                    />

                    <div className="admin-v2-resource-actions">
                      <input
                        type="number"
                        min="1"
                        value={
                          grantValues[
                            `${selectedUser.uid}:${resource.key}`
                          ] ?? resource.fallback
                        }
                        onChange={(event) =>
                          setGrantValue(
                            selectedUser.uid,
                            resource.key,
                            event.target.value
                          )
                        }
                        aria-label={`Grant ${resource.label}`}
                      />

                      <ActionButton
                        variant="secondary"
                        onClick={() =>
                          grantCredits(selectedUser, resource.key)
                        }
                        disabled={isActionBusy(
                          selectedUser.uid,
                          `grant-${resource.key}`
                        )}
                      >
                        Grant
                      </ActionButton>

                      <ActionButton
                        variant="ghost"
                        onClick={() =>
                          resetUsage(selectedUser, resource.key)
                        }
                        disabled={isActionBusy(
                          selectedUser.uid,
                          `reset-${resource.key}`
                        )}
                      >
                        Reset
                      </ActionButton>
                    </div>
                  </div>
                ))}

                <ActionButton
                  variant="danger"
                  icon={Database}
                  onClick={() => resetUsage(selectedUser, "all")}
                  disabled={isActionBusy(
                    selectedUser.uid,
                    "reset-all"
                  )}
                >
                  Reset all current-period usage
                </ActionButton>
              </section>

              <section className="admin-v2-drawer-section">
                <div className="admin-v2-section-title">
                  <HardDrive size={17} />
                  <h3>Storage</h3>
                </div>

                <UsageMeter
                  label="Creative storage"
                  icon={HardDrive}
                  used={formatBytes(selectedUser.storageUsedBytes)}
                  cap={formatBytes(selectedUser.storageLimitBytes)}
                  percent={selectedUser.storageUsagePct || 0}
                  disabled={Number(selectedUser.storageLimitBytes || 0) <= 0}
                />

                <p className="admin-v2-storage-note">
                  {selectedUser.storageAssetCount || 0} tracked assets
                </p>
              </section>

              <section className="admin-v2-drawer-section">
                <div className="admin-v2-section-title">
                  <Database size={17} />
                  <h3>Technical identifiers</h3>
                </div>

                {[
                  ["UID", selectedUser.uid],
                  ["Customer ID", selectedUser.customerId],
                  ["Subscription ID", selectedUser.subscriptionId],
                  ["Price ID", selectedUser.priceId],
                ].map(([label, value]) => (
                  <div key={label} className="admin-v2-copy-row">
                    <div>
                      <span>{label}</span>
                      <code>{value || "—"}</code>
                    </div>

                    {value && (
                      <button
                        type="button"
                        onClick={() => copyText(value, label)}
                        aria-label={`Copy ${label}`}
                      >
                        <Copy size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </section>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}



