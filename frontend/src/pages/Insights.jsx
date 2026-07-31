import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import "./Insights.css";

import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import InfoTip from "../components/ui/InfoTip";
import FieldLabel from "../components/ui/FieldLabel";
import GoogleAdsInsightsPanel from "../components/GoogleAdsInsightsPanel";
import MetaAdsInsightsPanel from "../components/MetaAdsInsightsPanel";
import PerformanceIntelligencePanel from "../components/PerformanceIntelligencePanel";
import CampaignIntelligencePanel from "../components/CampaignIntelligencePanel";

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
  const [activeSource, setActiveSource] = useState("intelligence");
  const [campaignDateRange, setCampaignDateRange] = useState("LAST_30_DAYS");
  const [me, setMe] = useState({
    tier: null,
    status: null,
    isAdmin: false,
  });

  const canUsePerformanceFeatures = useMemo(() => {
    if (me.isAdmin) return true;

    const tier = String(me.tier || "").toLowerCase();
    return [
      "pro",
      "pro_monthly",
      "business",
      "business_monthly",
    ].includes(tier);
  }, [me]);

  const currentPlanLabel = useMemo(() => {
    const tier = String(me.tier || "").toLowerCase();

    if (me.isAdmin) return "Admin";
    if (tier.includes("business")) return "Business";
    if (tier.includes("pro")) return "Pro";
    if (tier.includes("starter")) return "Starter";
    if (tier.includes("trial")) return "Trial";
    if (tier.includes("free")) return "Free";
    return "Current";
  }, [me]);

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

      const meRes = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meData = await safeJson(meRes);

      const nextMe = meRes.ok
        ? {
            tier: meData?.tier || null,
            status: meData?.status || null,
            isAdmin: !!meData?.isAdmin,
          }
        : {
            tier: null,
            status: null,
            isAdmin: false,
          };

      setMe(nextMe);

      const nextTier = String(nextMe.tier || "").toLowerCase();
      const hasAccess =
        nextMe.isAdmin ||
        [
          "pro",
          "pro_monthly",
          "business",
          "business_monthly",
        ].includes(nextTier);

      if (!hasAccess) {
        setData(null);
        setErr("");
        return;
      }

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

        setErr(
          typeof json?.detail === "string"
            ? json.detail
            : "Failed to load insights.",
        );
        setData(null);
        return;
      }

      setData(json);
    } catch (e) {
      setErr(
        typeof e?.message === "string"
          ? e.message
          : "Failed to load insights.",
      );
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

    return "Add performance data in the Library to let ADGen identify which platforms, styles, tones, and formats are driving your best results.";
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
      recs.push("Mark successful creatives so ADGen can learn from winners.");
      recs.push("Connect Meta or Google Ads later to automate performance syncing.");
    }

    return recs.slice(0, 5);
  }, [highlights, summary]);

  const renderLockedFeature = ({
    eyebrow,
    title,
    description,
    benefits,
  }) => (
    <div className="ins-proGate">
      <div className="ins-proGateHero">
        <div>
          <span className="ins-proGateEyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="ins-proGateBadge">Pro & Business</span>
      </div>

      <div className="ins-proGateBody">
        <div className="ins-proGateBenefits">
          {benefits.map((benefit) => (
            <div key={benefit}>
              <span>✓</span>
              <p>{benefit}</p>
            </div>
          ))}
        </div>

        <div className="ins-proGatePlan">
          <span>Your plan</span>
          <strong>{currentPlanLabel}</strong>
          <p>
            Upgrade to unlock performance tracking, connected ad data, and
            learning that improves future image and video generations.
          </p>
          <Button
            type="button"
            onClick={() => (window.location.href = "/account")}
          >
            Upgrade to Pro
          </Button>
        </div>
      </div>

      <div className="ins-proGateNote">
        You can continue generating and saving creatives on your current plan.
        Performance learning begins after Pro or Business access is activated.
      </div>
    </div>
  );

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
        description="See what ADGen has learned, review connected campaign performance, and turn real results into better future creative."
      />

      <Card className="ins-sourcePanel ins-sourceHub">
        <div className="ins-sourceHeader ins-sourceHubHeader">
          <div>
            <h2>
              Performance Sources
              <InfoTip text="Switch between manually tracked creative performance and connected advertising platforms." />
            </h2>
            <p>
              Choose Performance Intelligence to see what ADGen has learned, or open a connected data source for detailed reporting.
            </p>
          </div>
        </div>

        <div
          className="ins-sourceTabs"
          role="tablist"
          aria-label="Performance sources"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSource === "intelligence"}
            className={`ins-sourceTab ${
              activeSource === "intelligence" ? "active" : ""
            }`}
            onClick={() => setActiveSource("intelligence")}
          >
            <span className="ins-sourceTabIcon intelligence">PI</span>
            <span className="ins-sourceTabCopy">
              <strong>Performance Intelligence</strong>
              <small>
                {canUsePerformanceFeatures
                  ? "What ADGen has learned"
                  : "Available on Pro & Business"}
              </small>
            </span>
            <span
              className={`ins-sourceTabStatus ${
                canUsePerformanceFeatures ? "intelligence" : "locked"
              }`}
            >
              {canUsePerformanceFeatures ? "Learning" : "Pro"}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSource === "campaign-intelligence"}
            className={`ins-sourceTab ${
              activeSource === "campaign-intelligence" ? "active" : ""
            }`}
            onClick={() => setActiveSource("campaign-intelligence")}
          >
            <span className="ins-sourceTabIcon intelligence">CI</span>
            <span className="ins-sourceTabCopy">
              <strong>Campaign Intelligence</strong>
              <small>
                {canUsePerformanceFeatures
                  ? "What deserves attention now"
                  : "Available on Pro & Business"}
              </small>
            </span>
            <span
              className={`ins-sourceTabStatus ${
                canUsePerformanceFeatures ? "intelligence" : "locked"
              }`}
            >
              {canUsePerformanceFeatures ? "Briefing" : "Pro"}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSource === "manual"}
            className={`ins-sourceTab ${
              activeSource === "manual" ? "active" : ""
            }`}
            onClick={() => setActiveSource("manual")}
          >
            <span className="ins-sourceTabIcon">A</span>
            <span className="ins-sourceTabCopy">
              <strong>Manual Tracking</strong>
              <small>
                {canUsePerformanceFeatures
                  ? "Connected"
                  : "Available on Pro & Business"}
              </small>
            </span>
            <span
              className={`ins-sourceTabStatus ${
                canUsePerformanceFeatures ? "connected" : "locked"
              }`}
            >
              {canUsePerformanceFeatures ? "Live" : "Pro"}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSource === "google"}
            className={`ins-sourceTab ${
              activeSource === "google" ? "active" : ""
            }`}
            onClick={() => setActiveSource("google")}
          >
            <span className="ins-sourceTabIcon google">G</span>
            <span className="ins-sourceTabCopy">
              <strong>Google Ads</strong>
              <small>
                {canUsePerformanceFeatures
                  ? "Campaign and creative intelligence"
                  : "Available on Pro & Business"}
              </small>
            </span>
            <span
              className={`ins-sourceTabStatus ${
                canUsePerformanceFeatures ? "available" : "locked"
              }`}
            >
              {canUsePerformanceFeatures ? "Open" : "Pro"}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSource === "meta"}
            className={`ins-sourceTab ${
              activeSource === "meta" ? "active" : ""
            }`}
            onClick={() => setActiveSource("meta")}
          >
            <span className="ins-sourceTabIcon meta">M</span>
            <span className="ins-sourceTabCopy">
              <strong>Meta Ads</strong>
              <small>{canUsePerformanceFeatures ? "Campaign account connection" : "Available on Pro & Business"}</small>
            </span>
            <span className={`ins-sourceTabStatus ${canUsePerformanceFeatures ? "available" : "locked"}`}>{canUsePerformanceFeatures ? "Open" : "Pro"}</span>
          </button>
        </div>

        <div className="ins-sourceDetail">
          {activeSource === "intelligence" && (
            <div className="ins-sourceDetailInner ins-intelligenceDetail">
              {canUsePerformanceFeatures ? (
                <PerformanceIntelligencePanel />
              ) : (
                renderLockedFeature({
                  eyebrow: "Creative Intelligence",
                  title: "Every campaign can make your next creative smarter",
                  description:
                    "On Pro and Business, ADGen learns from qualified campaign results and applies winning patterns to future image and video generations.",
                  benefits: [
                    "Learn from manually tracked performance and Google Ads results.",
                    "Identify winning colors, styles, compositions, messaging, and CTAs.",
                    "Build a brand-specific Creative DNA profile over time.",
                    "Apply learned patterns inside Image Generator and Video Generator.",
                  ],
                })
              )}
            </div>
          )}

          {activeSource === "campaign-intelligence" && (
            <div className="ins-sourceDetailInner ins-intelligenceDetail">
              {canUsePerformanceFeatures ? (
                <CampaignIntelligencePanel dateRange={campaignDateRange} />
              ) : (
                renderLockedFeature({
                  eyebrow: "Campaign Intelligence",
                  title: "Know what deserves attention before opening the ad platform",
                  description:
                    "ADGen reviews saved Google Ads and Meta Ads campaign history and prepares a read-only briefing with prioritized findings and supporting evidence.",
                  benefits: [
                    "Compare recent campaign performance with the preceding period.",
                    "Identify engagement, efficiency, conversion, and tracking signals.",
                    "See why each finding appeared and what deserves review.",
                    "Keep all connected campaigns completely read-only.",
                  ],
                })
              )}
            </div>
          )}

          {activeSource === "manual" && (
            <div className="ins-sourceDetailInner">
              {canUsePerformanceFeatures ? (
                <>
                  <div className="ins-sourceDetailIntro">
                    <div>
                      <div className="ins-sourceEyebrow">
                        ADGen Manual Tracking
                      </div>
                      <h3>Library performance is connected</h3>
                      <p>
                        ADGen is analyzing impressions, clicks, conversions,
                        CTR, CPA, ROAS, CPM, spend, and manually selected
                        winners across saved image and video creatives.
                      </p>
                    </div>

                    <a className="ins-detailLink" href="/library">
                      Open Library →
                    </a>
                  </div>

                  <div className="ins-sourceMetricStrip">
                    <div>
                      <small>Tracked creatives</small>
                      <strong>{summary.count_with_performance ?? 0}</strong>
                    </div>
                    <div>
                      <small>Average CTR</small>
                      <strong>{pct(summary.avg_ctr, 2)}</strong>
                    </div>
                    <div>
                      <small>Weighted ROAS</small>
                      <strong>{fmt(summary.weighted_roas, 2)}</strong>
                    </div>
                    <div>
                      <small>Minimum spend</small>
                      <strong>{money(minSpend)}</strong>
                    </div>
                  </div>
                </>
              ) : (
                renderLockedFeature({
                  eyebrow: "Manual Performance Tracking",
                  title: "Turn Library results into reusable creative intelligence",
                  description:
                    "Pro and Business users can add delivery and outcome metrics to saved creatives so ADGen can identify reliable winners and underperformers.",
                  benefits: [
                    "Track impressions, clicks, conversions, spend, and revenue.",
                    "Automatically calculate CTR, CPC, CPA, CPM, and ROAS.",
                    "Qualify creatives using meaningful delivery volume.",
                    "Feed successful results into future creative generations.",
                  ],
                })
              )}
            </div>
          )}

          {activeSource === "google" && (
            <div className="ins-sourceDetailInner">
              {canUsePerformanceFeatures ? (
                <GoogleAdsInsightsPanel
                  isActive={activeSource === "google"}
                  selectedDateRange={campaignDateRange}
                  onDateRangeChange={setCampaignDateRange}
                />
              ) : (
                renderLockedFeature({
                  eyebrow: "Google Ads Integration",
                  title: "Connect campaign results directly to ADGen",
                  description:
                    "Pro and Business users can sync Google Ads campaign and creative performance into the same intelligence system.",
                  benefits: [
                    "Import campaign delivery, clicks, spend, and conversions.",
                    "Review campaign and creative performance inside Insights.",
                    "Reduce manual data entry for active campaigns.",
                    "Use real advertising results to strengthen Creative Intelligence.",
                  ],
                })
              )}
            </div>
          )}

          {activeSource === "meta" && (
            <div className="ins-sourceDetailInner">
              {canUsePerformanceFeatures ? (
                <MetaAdsInsightsPanel
                  isActive={activeSource === "meta"}
                  selectedDateRange={campaignDateRange}
                  onDateRangeChange={setCampaignDateRange}
                />
              ) : (
                renderLockedFeature({
                  eyebrow: "Meta Ads Integration",
                  title: "Connect Meta campaign results directly to ADGen",
                  description:
                    "Pro and Business users can connect a Meta advertiser account before campaign and creative performance syncing is enabled.",
                  benefits: [
                    "Connect Meta using secure, read-only advertising access.",
                    "Choose the advertiser account ADGen should analyze.",
                    "Prepare campaign and creative performance for Insights.",
                    "Use Meta results to strengthen Performance Intelligence.",
                  ],
                })
              )}
            </div>
          )}
        </div>
      </Card>

      {activeSource === "manual" && canUsePerformanceFeatures && (
        <>
        <Card className="ins-toolbar">
          <div className="ins-controls">
            <div className="ins-field">
              <FieldLabel
                htmlFor="insLimit"
                label="Lookback"
                info="How many recent creatives ADGen should analyze for this Insights view."
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
        </>
      )}
    </div>
  );
}