import React, { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import "./AdminUsers.css";

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

  const PROD_API = "https://updated-adgen.onrender.com";

  // Use either env var name (so you don’t get burned by mismatch)
  const envApi =
    (process.env.REACT_APP_API_URL || "").trim() ||
    (process.env.REACT_APP_API_BASE_URL || "").trim();

  const API_BASE = envApi || PROD_API || "http://127.0.0.1:8000";

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

      const imgUsed =
        typeof u.used === "number"
          ? u.used
          : typeof u.monthlyUsage === "number"
          ? u.monthlyUsage
          : 0;

      const imgCap = typeof u.cap === "number" ? u.cap : 0;
      const imgPct =
        typeof u.usagePct === "number"
          ? u.usagePct
          : imgCap > 0
          ? Math.round((imgUsed / imgCap) * 100)
          : 0;

      const vidUsed = typeof u.videoUsed === "number" ? u.videoUsed : 0;
      const vidCap = typeof u.videoCap === "number" ? u.videoCap : 0;
      const vidPct =
        typeof u.videoUsagePct === "number"
          ? u.videoUsagePct
          : vidCap > 0
          ? Math.round((vidUsed / vidCap) * 100)
          : 0;

      return {
        ...u,
        fullName,
        createdAtPretty: formatDate(u.createdAt),

        imgUsedSafe: imgUsed,
        imgCapSafe: imgCap,
        imgPctSafe: imgPct,

        vidUsedSafe: vidUsed,
        vidCapSafe: vidCap,
        vidPctSafe: vidPct,

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

  const usageCellClass = (pct) => {
    if (pct >= 100) return "usageCell usageHard";
    if (pct >= 80) return "usageCell usageWarn";
    return "usageCell";
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

  const grantImageCredits = async (u) => {
    if (!window.confirm(`Grant +5 image credits to ${u.email || u.uid}?`)) return;
    await authedFetch(`/admin/users/${u.uid}/usage/grant?credits=5`, { method: "POST" });
    await fetchUsers({ cursor });
  };

  const resetImageUsage = async (u) => {
    if (!window.confirm(`Reset image usage for ${u.email || u.uid}?`)) return;
    await authedFetch(`/admin/users/${u.uid}/usage/reset`, { method: "POST" });
    await fetchUsers({ cursor });
  };

  const grantVideoCredits = async (u) => {
    if (!window.confirm(`Grant +1 video credit to ${u.email || u.uid}?`)) return;
    await authedFetch(`/admin/users/${u.uid}/video/usage/grant?credits=1`, { method: "POST" });
    await fetchUsers({ cursor });
  };

  const resetVideoUsage = async (u) => {
    if (!window.confirm(`Reset video usage for ${u.email || u.uid}?`)) return;
    await authedFetch(`/admin/users/${u.uid}/video/usage/reset`, { method: "POST" });
    await fetchUsers({ cursor });
  };

  return (
    <div className="adminUsers">
      <div className="adminHeader">
        <h2>Admin: Users</h2>

        <div className="pager">
          <button type="button" onClick={onPrev} disabled={pageStack.length === 0 || loading}>
            Prev
          </button>
          <button type="button" onClick={onNext} disabled={!nextCursor || loading}>
            Next
          </button>
        </div>
      </div>

      <form className="filters" onSubmit={onApply}>
        <input
          className="input"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select className="select" value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="all">All tiers</option>
          <option value="trial_monthly">trial_monthly</option>
          <option value="starter_monthly">starter_monthly</option>
          <option value="pro_monthly">pro_monthly</option>
          <option value="business_monthly">business_monthly</option>
          <option value="early_access">early_access</option>
        </select>

        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">active</option>
          <option value="trialing">trialing</option>
          <option value="inactive">inactive</option>
          <option value="canceled">canceled</option>
          <option value="past_due">past_due</option>
        </select>

        <select className="select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>

        <button className="btn btnPrimary" type="submit" disabled={loading}>
          Apply
        </button>

        <button
          className="btn"
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
          disabled={loading}
        >
          Reset
        </button>
      </form>

      {err && <div className="notice error">Error: {err}</div>}
      {loading && <div className="notice">Loading…</div>}

      <div className="tableWrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Signed Up</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Image Usage</th>
              <th>Video Usage</th>
              <th>Requested Tier</th>
              <th>Customer ID</th>
              <th>UID</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {displayRows.map((u) => (
              <tr key={u.uid}>
                <td>{u.fullName}</td>
                <td>{u.email || "-"}</td>
                <td>{u.createdAtPretty}</td>
                <td>{u.tier || "-"}</td>
                <td>{u.stripeStatus || "-"}</td>

                <td className={usageCellClass(u.imgPctSafe)}>
                  {u.imgCapSafe > 0 ? `${u.imgUsedSafe} / ${u.imgCapSafe} (${u.imgPctSafe}%)` : u.imgUsedSafe}
                </td>

                <td
                  className={
                    u.vidCapSafe > 0
                      ? usageCellClass(u.vidPctSafe)
                      : "usageCell usageOff"
                  }
                >
                  {u.vidCapSafe > 0
                    ? `${u.vidUsedSafe} / ${u.vidCapSafe} (${u.vidPctSafe}%)`
                    : "Not Available"}
                </td>

                <td>
                  <div className="inline">
                    <select
                      className="select"
                      value={u.requestedTierSafe}
                      onChange={(e) => setRequestedTierLocal(u.uid, e.target.value)}
                    >
                      {TIER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <button className="btn" type="button" onClick={() => requestTier(u)}>
                      Request
                    </button>
                  </div>
                </td>

                <td className="mono">
                  {u.customerIdSafe || "-"}
                  {u.customerIdSafe ? (
                    <button className="btn btnTiny" type="button" onClick={() => copy(u.customerIdSafe)}>
                      Copy
                    </button>
                  ) : null}
                </td>

                <td className="mono">
                  {u.uid}
                  <button className="btn btnTiny" type="button" onClick={() => copy(u.uid)}>
                    Copy
                  </button>
                </td>

                <td>
                  <div className="actions">
                    <button className="btn" type="button" onClick={() => grantImageCredits(u)}>
                      +5 Img
                    </button>
                    <button className="btn" type="button" onClick={() => resetImageUsage(u)}>
                      Reset Img
                    </button>

                    <button className="btn btnPrimary" type="button" onClick={() => grantVideoCredits(u)}>
                      +1 Vid
                    </button>
                    <button className="btn" type="button" onClick={() => resetVideoUsage(u)}>
                      Reset Vid
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && displayRows.length === 0 && (
              <tr>
                <td colSpan={11} className="empty">
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


