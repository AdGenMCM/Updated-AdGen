import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import "./Insights.css";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function fmt(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

function pct(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

function money(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toFixed(digits)}`;
}

export default function Insights() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // simple controls
  const [limit, setLimit] = useState(200);
  const [minSpend, setMinSpend] = useState(0);

  const getToken = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be logged in.");
    return await user.getIdToken(true);
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const token = await getToken();
      const qs = new URLSearchParams({
        limit: String(limit),
        min_spend: String(minSpend),
      }).toString();

      const res = await fetch(`${API_BASE}/creative-insights?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await safeJson(res);

      if (!res.ok) {
        // Friendly gating
        if (res.status === 402 || res.status === 403) {
          setErr("Insights are available on Pro and Business plans.");
          setData(null);
          return;
        }
        setErr(json?.detail || "Failed to load insights.");
        setData(null);
        return;
      }

      setData(json);
    } catch (e) {
      setErr(e?.message || "Failed to load insights.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = data?.summary || {};
  const top = data?.top || {};
  const guidance = data?.guidance || "";

  const highlights = useMemo(() => {
  const patterns = data?.patterns || {};

  const bestPlatform = patterns?.platform?.best?.value;
  const bestTone = patterns?.tone?.best?.value;
  const bestStyle = patterns?.image_stylePreset?.best?.value;
  const bestRatio = patterns?.ratio?.best?.value;

  return [
    { label: "Best platform", value: bestPlatform || "—" },
    { label: "Best tone", value: bestTone || "—" },
    { label: "Best image style", value: bestStyle || "—" },
    { label: "Best ratio", value: bestRatio || "—" },
  ];
}, [data]);

  const renderTopList = (title, items, metricLabel) => (
    <div className="ins-card">
      <div className="ins-cardTitle">{title}</div>
      {(!items || items.length === 0) ? (
        <div className="ins-muted">No data yet.</div>
      ) : (
        <div className="ins-list">
          {items.map((it) => (
            <div key={`${it.kind}-${it.id}`} className="ins-row">
              <div className="ins-rowLeft">
                <div className="ins-badges">
                  <span className="ins-badge">{String(it.kind || "").toUpperCase()}</span>
                  {it.performance?.marked_successful === true && <span className="ins-badge ins-win">WINNER</span>}
                </div>
                <div className="ins-name">{it.title || `${it.kind} creative`}</div>
              </div>
              <div className="ins-rowRight">
                <div className="ins-metric">
                  <span className="ins-metricLabel">{metricLabel}</span>
                  <span className="ins-metricValue">
                    {metricLabel === "CTR" ? pct(it.performance?.ctr) :
                     metricLabel === "CPA" ? money(it.performance?.cpa) :
                     metricLabel === "ROAS" ? fmt(it.performance?.roas, 2) :
                     "—"}
                  </span>
                </div>
                {it.url && (
                  <a className="ins-link" href={it.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="ins-wrap">
      <div className="ins-header">
        <div>
          <h1 className="ins-title">Insights</h1>
          <div className="ins-subtitle">
            Summarizes performance across your image + video creatives.
          </div>
        </div>

        <div className="ins-controls">
          <label className="ins-field">
            <span>Lookback</span>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </label>

          <label className="ins-field">
            <span>Min spend ($)</span>
            <input
              type="number"
              step="0.01"
              value={minSpend}
              onChange={(e) => setMinSpend(Number(e.target.value))}
            />
          </label>

          <button className="ins-btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err && <div className="ins-error">{err}</div>}

      {!err && !loading && !data && (
        <div className="ins-muted">No insights available yet.</div>
      )}

      {!err && data && (
        <>
          <div className="ins-grid">
            <div className="ins-card">
              <div className="ins-cardTitle">Summary</div>
              <div className="ins-kpis">
                <div className="ins-kpi">
                  <div className="ins-kpiLabel">Creatives w/ performance</div>
                  <div className="ins-kpiValue">{summary.count_with_performance ?? 0}</div>
                </div>
                <div className="ins-kpi">
                  <div className="ins-kpiLabel">Weighted ROAS</div>
                  <div className="ins-kpiValue">{fmt(summary.weighted_roas, 2)}</div>
                </div>
                <div className="ins-kpi">
                  <div className="ins-kpiLabel">Avg CTR</div>
                  <div className="ins-kpiValue">{pct(summary.avg_ctr, 2)}</div>
                </div>
                <div className="ins-kpi">
                  <div className="ins-kpiLabel">Avg CPA</div>
                  <div className="ins-kpiValue">{money(summary.avg_cpa, 2)}</div>
                </div>
              </div>

              {guidance ? (
                <div className="ins-guidance">
                  <div className="ins-guidanceTitle">What’s working</div>
                  <div className="ins-guidanceText">{guidance}</div>
                </div>
              ) : (
                <div className="ins-muted">Add performance data to see “what’s working”.</div>
              )}
            </div>

            <div className="ins-card">
              <div className="ins-cardTitle">Highlights</div>
              <div className="ins-highlights">
                {highlights.map((h) => (
                  <div key={h.label} className="ins-highlight">
                    <div className="ins-highlightLabel">{h.label}</div>
                    <div className="ins-highlightValue">{h.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ins-grid2">
            {renderTopList("Top by ROAS", top.by_roas, "ROAS")}
            {renderTopList("Top by CTR", top.by_ctr, "CTR")}
            {renderTopList("Lowest CPA", top.lowest_cpa, "CPA")}
          </div>
        </>
      )}
    </div>
  );
}