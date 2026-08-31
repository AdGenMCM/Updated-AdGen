import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareText,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { auth } from "../firebaseConfig";
import "./AdminFeedback.css";

const PRODUCTION_API = "https://updated-adgen.onrender.com";
const API_BASE = (
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  PRODUCTION_API
).trim();

const REASON_LABELS = {
  no_need: "No current need",
  results: "Results",
  complexity: "Too complicated",
  missing_feature: "Missing feature",
  pricing: "Pricing/plans",
  other: "Other",
};

function formatDate(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminFeedback() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totalResponses: 0, withComments: 0, breakdown: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("all");
  const [days, setDays] = useState(0);

  const load = useCallback(async (overrides = {}) => {
    setLoading(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("You must be signed in as an administrator.");

      const params = new URLSearchParams({
        q: overrides.q ?? query,
        reason: overrides.reason ?? reason,
        days: String(overrides.days ?? days),
        limit: "250",
      });

      const response = await fetch(`${API_BASE}/admin/feedback?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || `Request failed (${response.status}).`);

      setItems(Array.isArray(data?.items) ? data.items : []);
      setSummary(data?.summary || { totalResponses: 0, withComments: 0, breakdown: [] });
    } catch (requestError) {
      setItems([]);
      setError(requestError?.message || "Could not load feedback.");
    } finally {
      setLoading(false);
    }
  }, [days, query, reason]);

  useEffect(() => {
    load({ q: "", reason: "all", days: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topReason = useMemo(() => {
    const rows = Array.isArray(summary.breakdown) ? summary.breakdown : [];
    return [...rows].sort((a, b) => Number(b.count || 0) - Number(a.count || 0))[0] || null;
  }, [summary.breakdown]);

  const applyFilters = (event) => {
    event.preventDefault();
    load();
  };

  const resetFilters = () => {
    setQuery("");
    setReason("all");
    setDays(0);
    load({ q: "", reason: "all", days: 0 });
  };

  return (
    <main className="admin-feedback-page">
      <div className="admin-feedback-bg" aria-hidden="true" />
      <div className="admin-feedback-shell">
        <header className="admin-feedback-header">
          <div>
            <span>Customer voice</span>
            <h1>Feedback</h1>
            <p>See why activated users stopped creating and use their comments to prioritize the next product improvements.</p>
          </div>
          <button type="button" onClick={() => load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "is-spinning" : ""} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </header>

        <section className="admin-feedback-stats">
          <article><Users size={19} /><span><small>Total responses</small><strong>{summary.totalResponses || 0}</strong></span></article>
          <article><MessageSquareText size={19} /><span><small>Written comments</small><strong>{summary.withComments || 0}</strong></span></article>
          <article><CheckCircle2 size={19} /><span><small>Top reason</small><strong className="is-text">{topReason?.label || "—"}</strong></span></article>
        </section>

        <section className="admin-feedback-breakdown">
          <div className="admin-feedback-section-head">
            <div><span>Retention reasons</span><strong>Why users stopped generating</strong></div>
            <small>All recorded responses</small>
          </div>
          <div className="admin-feedback-breakdown-grid">
            {(summary.breakdown || []).map((item) => (
              <article key={item.reason}>
                <div><span>{REASON_LABELS[item.reason] || item.label}</span><strong>{item.count || 0}</strong></div>
                <div className="admin-feedback-meter"><span style={{ width: `${Math.max(0, Math.min(100, Number(item.percent || 0)))}%` }} /></div>
                <small>{item.percent || 0}% of responses</small>
              </article>
            ))}
          </div>
        </section>

        <form className="admin-feedback-filters" onSubmit={applyFilters}>
          <label className="admin-feedback-search">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, email, comment, or plan" />
          </label>
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="all">All reasons</option>
            {Object.entries(REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={0}>All time</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button type="submit" disabled={loading}>Apply</button>
          <button type="button" className="is-secondary" onClick={resetFilters} disabled={loading}>Reset</button>
        </form>

        {error && <div className="admin-feedback-error"><AlertTriangle size={17} /><span>{error}</span></div>}

        <section className="admin-feedback-table-card">
          <div className="admin-feedback-table-head">
            <div><span>Responses</span><strong>{loading ? "Loading feedback…" : `${items.length} response${items.length === 1 ? "" : "s"}`}</strong></div>
          </div>
          <div className="admin-feedback-table-wrap">
            <table className="admin-feedback-table">
              <thead><tr><th>User</th><th>Reason</th><th>Comment</th><th>Plan</th><th>Submitted</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id || item.uid}>
                    <td><div className="admin-feedback-user"><span>{(item.displayName || item.email || "U").trim().charAt(0).toUpperCase()}</span><div><strong>{item.displayName || "ADGen user"}</strong><small>{item.email || item.uid || "—"}</small></div></div></td>
                    <td><span className={`admin-feedback-reason reason-${item.reason || "other"}`}>{REASON_LABELS[item.reason] || item.reasonLabel || "Other"}</span></td>
                    <td><p className="admin-feedback-comment">{item.comment || "No written comment."}</p></td>
                    <td><span className="admin-feedback-plan">{item.tier || "Unknown"}</span></td>
                    <td><span className="admin-feedback-date">{formatDate(item.updatedAt || item.createdAt)}</span></td>
                  </tr>
                ))}
                {!loading && !items.length && (
                  <tr><td colSpan={5}><div className="admin-feedback-empty"><MessageSquareText size={28} /><strong>No feedback found</strong><span>Responses will appear here after users answer the retention email.</span></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
