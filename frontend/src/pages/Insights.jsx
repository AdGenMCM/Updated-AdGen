import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import "./Insights.css";

import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import InfoTip from "../components/ui/InfoTip";
import FieldLabel from "../components/ui/FieldLabel";

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

  const summary = useMemo(() => data?.summary ?? {}, [data]);
  const top = useMemo(() => data?.top ?? {}, [data]);
  const guidance = useMemo(() => data?.guidance ?? "", [data]);

  const highlights = useMemo(() => {
    const patterns = data?.patterns || {};

    return [
      { label: "Platform", value: patterns?.platform?.best?.value || "—", detail: "Best source" },
      { label: "Tone", value: patterns?.tone?.best?.value || "—", detail: "Winning voice" },
      { label: "Style", value: patterns?.image_stylePreset?.best?.value || "—", detail: "Creative direction" },
      { label: "Ratio", value: patterns?.ratio?.best?.value || "—", detail: "Best format" },
    ];
  }, [data]);

  const intelligenceScore = useMemo(() => {
    const tracked = Number(summary.count_with_performance || 0);
    const ctr = Number(summary.avg_ctr || 0);
    const roas = Number(summary.weighted_roas || 0);

    let score = 35;

    if (tracked >= 1) score += 15;
    if (tracked >= 5) score += 10;
    if (tracked >= 15) score += 10;
    if (ctr >= 1) score += 10;
    if (ctr >= 2) score += 5;
    if (roas >= 2) score += 10;
    if (roas >= 4) score += 5;

    return Math.min(100, score);
  }, [summary]);

  const aiNarrative = useMemo(() => {
    const platform = highlights[0]?.value;
    const tone = highlights[1]?.value;
    const style = highlights[2]?.value;
    const ratio = highlights[3]?.value;

    if (
      platform &&
      platform !== "—" &&
      tone &&
      tone !== "—" &&
      style &&
      style !== "—" &&
      ratio &&
      ratio !== "—"
    ) {
      return `Your strongest creative pattern currently combines ${tone} messaging, ${style} creative direction, and ${ratio} formatting on ${platform}. Continue generating similar variants while testing new offers, CTAs, and hooks.`;
    }

    if (guidance) return guidance;

    return "Add performance data in the Library to let AdGen identify which platforms, styles, tones, and formats are driving your best results.";
  }, [guidance, highlights]);

  const aiRecommendations = useMemo(() => {
    const recs = [];

    if (highlights[0]?.value && highlights[0].value !== "—") {
      recs.push(`Generate more creatives for ${highlights[0].value}.`);
    }

    if (highlights[2]?.value && highlights[2].value !== "—") {
      recs.push(`Continue testing ${highlights[2].value} creative direction.`);
    }

    if (highlights[3]?.value && highlights[3].value !== "—") {
      recs.push(`Prioritize ${highlights[3].value} formats for future tests.`);
    }

    if (summary.avg_ctr) {
      recs.push("Use the Optimizer on creatives below your average CTR.");
    }

    if (summary.weighted_roas) {
      recs.push("Generate variations from your highest ROAS creatives.");
    }

    if (!recs.length) {
      recs.push("Add performance data in the Library to unlock AI recommendations.");
      recs.push("Mark successful creatives so AdGen can learn from winners.");
      recs.push("Connect Meta or Google Ads later to automate performance syncing.");
    }

    return recs.slice(0, 5);
  }, [highlights, summary]);

  const renderTopList = (title, items, metricLabel) => (
    <Card className="ins-card">
      <div className="ins-cardTitle">
        {title}
        <InfoTip text="This leaderboard uses performance data saved in your Library." />
      </div>

      {!items || items.length === 0 ? (
        <div className="ins-muted">No data yet.</div>
      ) : (
        <div className="ins-list">
          {items.map((it, index) => (
            <div key={`${it.kind}-${it.id}`} className="ins-row">
              <div className="ins-rank">#{index + 1}</div>

              <div className="ins-rowLeft">
                <div className="ins-badges">
                  <span className="ins-badge">{String(it.kind || "").toUpperCase()}</span>
                  {it.performance?.marked_successful === true && (
                    <span className="ins-badge ins-win">WINNER</span>
                  )}
                </div>

                <div className="ins-name">{it.title || `${it.kind} creative`}</div>
              </div>

              <div className="ins-rowRight">
                <div className="ins-metric">
                  <span className="ins-metricLabel">{metricLabel}</span>
                  <span className="ins-metricValue">
                    {metricLabel === "CTR"
                      ? pct(it.performance?.ctr)
                      : metricLabel === "CPA"
                      ? money(it.performance?.cpa)
                      : metricLabel === "CPM"
                      ? money(it.performance?.cpm)
                      : metricLabel === "ROAS"
                      ? fmt(it.performance?.roas, 2)
                      : "—"}
                  </span>
                </div>

                {it.url && (
                  <a className="ins-link" href="/library">
                    View in Library →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="ins-page">
      <PageHeader
        eyebrow="AI CREATIVE INTELLIGENCE"
        title="Understand what actually drives performance"
        description="Track winners, identify patterns, and prepare for automatic Meta and Google Ads performance syncing."
        actions={
          <Button type="button" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Insights"}
          </Button>
        }
      />

      <Card className="ins-sourcePanel">
        <div className="ins-sourceHeader">
          <div>
            <h2>
              Performance Sources
              <InfoTip text="Manual tracking is live today. Meta and Google Ads integrations are planned so AdGen can automatically sync campaign and creative performance." />
            </h2>
            <p>
              AdGen currently uses manually entered Library performance data.
              Connected ad accounts will unlock automatic campaign intelligence.
            </p>
          </div>
        </div>

        <div className="ins-sourceGrid">
          <div className="ins-sourceCard connected">
            <span>Connected</span>
            <h3>AdGen Manual Tracking</h3>
            <p>CTR, CPA, ROAS, CPM, spend, and winner labels from your Library.</p>
          </div>

          <div className="ins-sourceCard coming">
            <span>Coming Soon</span>
            <h3>Meta Ads</h3>
            <p>Auto-sync campaigns, creatives, impressions, clicks, spend, and conversions.</p>
            <button type="button" disabled>Connect Meta</button>
          </div>

          <div className="ins-sourceCard coming">
            <span>Coming Soon</span>
            <h3>Google Ads</h3>
            <p>Import creative and campaign performance for smarter AI recommendations.</p>
            <button type="button" disabled>Connect Google</button>
          </div>
        </div>

        <div className="ins-syncBenefits">
          <span>Automatic sync will unlock:</span>
          <p>Campaign import • Spend • Clicks • Impressions • Conversions • Automatic winner detection</p>
        </div>
      </Card>

      <Card className="ins-toolbar">
        <div className="ins-controls">
          <div className="ins-field">
            <FieldLabel
              htmlFor="insLimit"
              label="Lookback"
              info="How many recent creatives AdGen should analyze for this Insights view."
            />
            <select id="insLimit" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={100}>100 creatives</option>
              <option value={200}>200 creatives</option>
              <option value={500}>500 creatives</option>
            </select>
          </div>

          <div className="ins-field">
            <FieldLabel
              htmlFor="insSpend"
              label="Min Spend"
              info="Filters out creatives with low spend so insights focus on more meaningful performance data."
            />
            <input
              id="insSpend"
              type="number"
              step="0.01"
              value={minSpend}
              onChange={(e) => setMinSpend(Number(e.target.value))}
            />
          </div>
        </div>
      </Card>

      {err && (
        <Card className="ins-error">
          <h3>Insights Locked</h3>
          <p>{err}</p>
          <Button type="button" onClick={() => (window.location.href = "/account")}>
            Upgrade Plan
          </Button>
        </Card>
      )}

      {!err && loading && (
        <Card className="ins-stateCard">Loading creative intelligence...</Card>
      )}

      {!err && !loading && !data && (
        <Card className="ins-stateCard">No insights available yet.</Card>
      )}

      {!err && data && (
        <>
          <div className="ins-statGrid">
            <Card className="ins-statCard score">
              <span>Creative Intelligence Score</span>
              <strong>{intelligenceScore}/100</strong>
              <p>{intelligenceScore >= 80 ? "Excellent signal quality" : intelligenceScore >= 60 ? "Good foundation" : "Needs more performance data"}</p>
            </Card>

            <Card className="ins-statCard">
              <span>Tracked Creatives</span>
              <strong>{summary.count_with_performance ?? 0}</strong>
              <p>Creatives with performance data</p>
            </Card>

            <Card className="ins-statCard">
              <span>Weighted ROAS</span>
              <strong>{fmt(summary.weighted_roas, 2)}</strong>
              <p>Revenue efficiency across tracked spend</p>
            </Card>

            <Card className="ins-statCard">
              <span>Average CTR</span>
              <strong>{pct(summary.avg_ctr, 2)}</strong>
              <p>Average click-through rate</p>
            </Card>
          </div>

          <div className="ins-mainGrid">
            <Card className="ins-card ins-aiSummary">
              <div className="ins-cardTitle">
                AI Summary
                <InfoTip text="A plain-English summary based on your tracked creative performance." />
              </div>

              <p>{aiNarrative}</p>

              <div className="ins-recommendations">
                {aiRecommendations.map((rec) => (
                  <div key={rec}>✓ {rec}</div>
                ))}
              </div>
            </Card>

            <Card className="ins-card">
              <div className="ins-cardTitle">Winning Patterns</div>

              <div className="ins-highlights">
                {highlights.map((h) => (
                  <div key={h.label} className="ins-highlight">
                    <div className="ins-highlightLabel">{h.label}</div>
                    <div className="ins-highlightValue">{h.value}</div>
                    <div className="ins-highlightDetail">{h.detail}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="ins-leaderboards">
            {renderTopList("Top by ROAS", top.by_roas, "ROAS")}
            {renderTopList("Top by CTR", top.by_ctr, "CTR")}
            {renderTopList("Lowest CPA", top.lowest_cpa, "CPA")}
            {renderTopList("Lowest CPM", top.lowest_cpm, "CPM")}
          </div>
        </>
      )}
    </div>
  );
}