import React, { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

const TIER_OPTIONS = [
  { value: "", label: "(none)" },
  { value: "trial_monthly", label: "trial_monthly" },
  { value: "starter_monthly", label: "starter_monthly" },
  { value: "pro_monthly", label: "pro_monthly" },
  { value: "business_monthly", label: "business_monthly" },
  { value: "early_access", label: "early_access" },
];

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  // controls
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(50);

  // pagination
  const [cursor, setCursor] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [pageStack, setPageStack] = useState([]);

  const API_BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

  const authedFetch = useCallback(
    async (path, options = {}) => {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("Not logged in.");

      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Request failed (${res.status}). ${msg}`);
      }

      return res;
    },
    [API_BASE]
  );

  const fetchUsers = useCallback(
    async (opts = {}) => {
      try {
        setLoading(true);
        setErr(null);

        const params = new URLSearchParams();
        params.set("q", opts.q ?? q);
        params.set("tier", opts.tier ?? tier);
        params.set("status", opts.status ?? status);
        params.set("limit", String(opts.limit ?? limit));
        if (opts.cursor) params.set("page_token", opts.cursor);

        const res = await authedFetch(`/admin/users?${params.toString()}`);
        const data = await res.json();

        setRows(data.users || []);
        setNextCursor(data.nextCursor || "");
      } catch (e) {
        setErr(e.message);
        setRows([]);
        setNextCursor("");
      } finally {
        setLoading(false);
      }
    },
    [q, tier, status, limit, authedFetch]
  );

  useEffect(() => {
    fetchUsers({ cursor: "" });
    setCursor("");
    setPageStack([]);
  }, [fetchUsers]);

  const onApply = async (e) => {
    e.preventDefault();
    setCursor("");
    setNextCursor("");
    setPageStack([]);
    await fetchUsers({ cursor: "", q, tier, status, limit });
  };

  const onNext = async () => {
    if (!nextCursor) return;
    setPageStack((s) => [...s, cursor]);
    setCursor(nextCursor);
    await fetchUsers({ cursor: nextCursor });
  };

  const onPrev = async () => {
    if (pageStack.length === 0) return;
    const prevCursor = pageStack[pageStack.length - 1];
    setPageStack((s) => s.slice(0, -1));
    setCursor(prevCursor);
    await fetchUsers({ cursor: prevCursor });
  };

  const displayRows = useMemo(() => {
    return rows.map((u) => {
      const first = u.firstName || "";
      const last = u.lastName || "";
      const fullName = `${first} ${last}`.trim() || "-";

      const used =
        typeof u.used === "number"
          ? u.used
          : typeof u.monthlyUsage === "number"
          ? u.monthlyUsage
          : 0;

      const cap = typeof u.cap === "number" ? u.cap : 0;

      const usagePct =
        typeof u.usagePct === "number"
          ? u.usagePct
          : cap > 0
          ? Math.round((used / cap) * 100)
          : 0;

      const createdAtPretty = formatDate(u.createdAt);

      return {
        ...u,
        fullName,
        createdAtPretty,
        usedSafe: used,
        capSafe: cap,
        usagePctSafe: usagePct,
        requestedTierSafe: u.requestedTier || "",
        customerIdSafe: u.customerId || "",
      };
    });
  }, [rows]);

  const copy = async (text) => {
    try {
      if (!text) return alert("Nothing to copy.");
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      alert("Copy failed.");
    }
  };

  const usageCellStyle = (pct) => {
    if (pct >= 100) return { background: "rgba(255,0,0,0.10)", fontWeight: 700 };
    if (pct >= 80) return { background: "rgba(255,200,0,0.18)", fontWeight: 700 };
    return {};
  };

  const setRequestedTierLocal = (uid, val) => {
    setRows((prev) => prev.map((x) => (x.uid === uid ? { ...x, requestedTier: val } : x)));
  };

  const requestTier = async (u) => {
    const requestedTier = (u.requestedTier || "").trim();
    if (!requestedTier) return alert("Choose a requested tier first.");

    if (
      !window.confirm(
        `Request plan change to "${requestedTier}" for ${u.email || u.uid}?\n\nUser will need to confirm via billing.`
      )
    ) {
      return;
    }

    await authedFetch(`/admin/users/${u.uid}/tier/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedTier }),
    });

    await fetchUsers({ cursor });
    alert("Requested tier saved.");
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Admin: Users</h2>

      <form
        onSubmit={onApply}
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <input
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: 8, minWidth: 240 }}
        />

        <select value={tier} onChange={(e) => setTier(e.target.value)} style={{ padding: 8 }}>
          <option value="all">All tiers</option>
          <option value="trial_monthly">trial_monthly</option>
          <option value="starter_monthly">starter_monthly</option>
          <option value="pro_monthly">pro_monthly</option>
          <option value="business_monthly">business_monthly</option>
          <option value="early_access">early_access</option>
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8 }}>
          <option value="all">All statuses</option>
          <option value="active">active</option>
          <option value="trialing">trialing</option>
          <option value="inactive">inactive</option>
          <option value="canceled">canceled</option>
          <option value="past_due">past_due</option>
        </select>

        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ padding: 8 }}>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>

        <button type="submit" style={{ padding: "8px 12px" }} disabled={loading}>
          Apply
        </button>

        <button
          type="button"
          onClick={() => {
            setQ("");
            setTier("all");
            setStatus("all");
            setLimit(50);
            setCursor("");
            setNextCursor("");
            setPageStack([]);
            fetchUsers({ cursor: "", q: "", tier: "all", status: "all", limit: 50 });
          }}
          style={{ padding: "8px 12px" }}
          disabled={loading}
        >
          Reset
        </button>
      </form>

      {err && <div style={{ marginBottom: 12 }}>Error: {err}</div>}
      {loading && <div style={{ marginBottom: 12 }}>Loading…</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button type="button" onClick={onPrev} disabled={pageStack.length === 0 || loading}>
          Prev
        </button>
        <button type="button" onClick={onNext} disabled={!nextCursor || loading}>
          Next
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table cellPadding="10" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Name</th>
              <th>Email</th>
              <th>Signed Up</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Usage</th>
              <th>Requested Tier</th>
              <th>Customer ID</th>
              <th>UID</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {displayRows.map((u) => (
              <tr key={u.uid} style={{ borderTop: "1px solid #eee" }}>
                <td>{u.fullName}</td>
                <td>{u.email || "-"}</td>
                <td>{u.createdAtPretty}</td>
                <td>{u.tier || "-"}</td>
                <td>{u.stripeStatus || "-"}</td>

                <td style={usageCellStyle(u.usagePctSafe)}>
                  {u.capSafe > 0 ? (
                    <>
                      {u.usedSafe} / {u.capSafe} ({u.usagePctSafe}%)
                    </>
                  ) : (
                    u.usedSafe
                  )}
                </td>

                <td>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      value={u.requestedTierSafe}
                      onChange={(e) => setRequestedTierLocal(u.uid, e.target.value)}
                      style={{ padding: 6 }}
                    >
                      {TIER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <button type="button" onClick={() => requestTier(u)}>
                      Request
                    </button>
                  </div>
                </td>

                <td style={{ fontFamily: "monospace" }}>
                  {u.customerIdSafe || "-"}
                  {u.customerIdSafe ? (
                    <button
                      type="button"
                      style={{ marginLeft: 8 }}
                      onClick={() => copy(u.customerIdSafe)}
                    >
                      Copy
                    </button>
                  ) : null}
                </td>

                <td style={{ fontFamily: "monospace" }}>{u.uid}</td>

                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Grant +5 credits to ${u.email || u.uid}?`)) return;
                        await authedFetch(`/admin/users/${u.uid}/usage/grant?credits=5`, { method: "POST" });
                        await fetchUsers({ cursor });
                      }}
                    >
                      +5 Credits
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Reset usage for ${u.email || u.uid}?`)) return;
                        await authedFetch(`/admin/users/${u.uid}/usage/reset`, { method: "POST" });
                        await fetchUsers({ cursor });
                      }}
                    >
                      Reset Usage
                    </button>

                    <button type="button" onClick={() => copy(u.uid)}>
                      Copy UID
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && displayRows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 16 }}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


