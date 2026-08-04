import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { auth } from "../firebaseConfig";
import "./CampaignIntelligencePanel.css";

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timeLabel(value) {
  if (!value) return "just now";
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? "just now" : date.toLocaleString();
}

function dateRangeLabel(value) {
  const labels = {
    TODAY: "Today",
    YESTERDAY: "Yesterday",
    LAST_7_DAYS: "Last 7 days",
    LAST_14_DAYS: "Last 14 days",
    LAST_30_DAYS: "Last 30 days",
    LAST_90_DAYS: "Last 90 days",
    THIS_MONTH: "This month",
    LAST_MONTH: "Last month",
    MAXIMUM: "Maximum available",
  };
  return labels[value] || "Last 30 days";
}

function actionLevelLabel(value) {
  const labels = {
    do_now: "Do this now",
    test: "Consider testing",
    review: "Review first",
    monitor: "Monitor for now",
  };
  return labels[value] || "Review first";
}

async function authorizedFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in.");
  const token = await user.getIdToken(true);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : "Could not prepare Campaign Intelligence."
    );
  }
  return body;
}

export default function CampaignIntelligencePanel({ dateRange: initialDateRange = "LAST_30_DAYS" }) {
  const [briefing, setBriefing] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [expandedAssessmentId, setExpandedAssessmentId] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [dateRange, setDateRange] = useState(initialDateRange || "LAST_30_DAYS");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState("");
  const [platformResults, setPlatformResults] = useState([]);
  const [analysisWarning, setAnalysisWarning] = useState("");
  const findingDrawerRef = useRef(null);

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const body = await authorizedFetch(
        `/campaign-intelligence/briefing?date_range=${encodeURIComponent(dateRange)}&platforms=${encodeURIComponent(platformFilter)}`
      );
      setBriefing(body || {});
      setExpandedId(null);
      setExpandedAssessmentId(null);
      const historyBody = await authorizedFetch("/campaign-intelligence/history?limit=30");
      setHistory(Array.isArray(historyBody?.items) ? historyBody.items : []);
    } catch (err) {
      setBriefing(null);
      setError(err?.message || "Could not prepare Campaign Intelligence.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const analyzeCampaigns = async () => {
    setAnalyzing(true);
    setAnalysisWarning("");
    setError("");
    setPlatformResults([]);

    try {
      setAnalysisStage(platformFilter === "google_ads" ? "Refreshing Google Ads…" : platformFilter === "meta_ads" ? "Refreshing Meta Ads…" : "Refreshing Google and Meta…");
      const result = await authorizedFetch("/campaign-intelligence/analyze", {
        method: "POST",
        body: JSON.stringify({ dateRange, platforms: platformFilter }),
      });

      setPlatformResults(Array.isArray(result?.platformResults) ? result.platformResults : []);
      setAnalysisStage("Building campaign briefing…");
      if (result?.briefing) {
        setBriefing(result.briefing);
        setExpandedId(null);
        setExpandedAssessmentId(null);
      }
      if (result?.partial) {
        const failures = (result?.platformResults || [])
          .filter((item) => item.status === "error" || item.status === "skipped")
          .map((item) => `${item.platform === "google_ads" ? "Google Ads" : "Meta Ads"}: ${item.message || item.status}`);
        setAnalysisWarning(failures.join(" · "));
      }
      const historyBody = await authorizedFetch("/campaign-intelligence/history?limit=30");
      setHistory(Array.isArray(historyBody?.items) ? historyBody.items : []);
      setAnalysisStage("Analysis complete");
    } catch (err) {
      setError(err?.message || "Could not analyze campaigns.");
    } finally {
      setAnalyzing(false);
      window.setTimeout(() => setAnalysisStage(""), 2500);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, platformFilter]);

  useLayoutEffect(() => {
    if (!expandedId) return;

    const drawer = findingDrawerRef.current;
    if (!drawer) return;

    drawer.scrollTop = 0;
    drawer.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [expandedId]);

  useEffect(() => {
    if (!expandedId) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expandedId]);

  const findings = useMemo(
    () => (Array.isArray(briefing?.findings) ? briefing.findings : []),
    [briefing]
  );

  const campaignAssessments = useMemo(
    () => (Array.isArray(briefing?.campaignAssessments) ? briefing.campaignAssessments : []),
    [briefing]
  );

  const filteredHistory = useMemo(() => {
    if (timelineFilter === "all") return history;
    return history.filter((item) =>
      (item.findings || []).some(
        (finding) =>
          finding.category === timelineFilter || finding.platform === timelineFilter
      )
    );
  }, [history, timelineFilter]);

  if (loading) {
    return <div className="ci-state">Preparing your campaign briefing…</div>;
  }

  if (error) {
    return (
      <section className="ci-panel">
        <div className="ci-error">{error}</div>
        <button type="button" className="ci-refresh" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const health = briefing?.health || {};
  const hasCompletedAnalysis = Boolean(briefing?.generatedAt);

  return (
    <section className="ci-panel">
      <section className="ci-analysisControl">
        <div className="ci-analysisControlIntro">
          <span>Analyze my campaigns</span>
          <strong>Choose the history and platforms ADGen should review</strong>
          <p>Refreshing performs a new read-only sync before rebuilding the briefing.</p>
        </div>

        <div className="ci-analysisFields">
          <label>
            <span>Lookback</span>
            <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} disabled={analyzing}>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7_DAYS">Last 7 days</option>
              <option value="LAST_14_DAYS">Last 14 days</option>
              <option value="LAST_30_DAYS">Last 30 days</option>
              <option value="LAST_90_DAYS">Last 90 days</option>
              <option value="THIS_MONTH">This month</option>
              <option value="LAST_MONTH">Last month</option>
              <option value="MAXIMUM">Maximum available</option>
            </select>
          </label>

          <label>
            <span>Platforms</span>
            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} disabled={analyzing}>
              <option value="all">Google + Meta</option>
              <option value="google_ads">Google only</option>
              <option value="meta_ads">Meta only</option>
            </select>
          </label>

          <button type="button" className="ci-analyzeButton" onClick={analyzeCampaigns} disabled={analyzing}>
            {analyzing
              ? "Analyzing campaigns…"
              : hasCompletedAnalysis
              ? "Reanalyze Campaigns"
              : "Analyze Campaigns"}
          </button>
        </div>

        {(analysisStage || platformResults.length > 0) && (
          <div className="ci-analysisProgress" aria-live="polite">
            {analysisStage && <strong>{analysisStage}</strong>}
            <div>
              {platformResults.map((item) => (
                <span key={item.platform} className={item.status}>
                  {item.status === "success" ? "✓" : item.status === "error" ? "!" : "○"} {item.platform === "google_ads" ? "Google Ads" : "Meta Ads"}
                </span>
              ))}
            </div>
          </div>
        )}
        {analysisWarning && <div className="ci-analysisWarning">{analysisWarning}</div>}
      </section>

      <header className="ci-header">
        <div>
          <span className="ci-eyebrow">Read-only campaign briefing</span>
          <h3>{briefing?.headline || "Your campaign briefing"}</h3>
          <p>{briefing?.summary}</p>
          <small>
            {dateRangeLabel(briefing?.dateRange || dateRange)} · Last analyzed {timeLabel(briefing?.generatedAt)}
          </small>
        </div>

        <div className="ci-headerActions">
          <button type="button" className="ci-secondaryButton" onClick={() => setTimelineOpen((value) => !value)}>
            {timelineOpen ? "Hide timeline" : "View timeline"}
          </button>
        </div>
      </header>

      <section className="ci-analysisMeta" aria-label="Analysis details">
        <div><small>Lookback</small><strong>{dateRangeLabel(briefing?.dateRange || dateRange)}</strong></div>
        <div><small>Platforms</small><strong>{platformFilter === "all" ? "Google + Meta" : platformFilter === "google_ads" ? "Google Ads" : "Meta Ads"}</strong></div>
        <div><small>Campaigns</small><strong>{briefing?.campaignsAnalyzed || 0}</strong></div>
        <div><small>Impressions reviewed</small><strong>{Number(briefing?.analysisMetadata?.impressionsReviewed || 0).toLocaleString()}</strong></div>
        <div><small>Confidence</small><strong>{titleCase(briefing?.health?.confidence || briefing?.executiveBriefing?.confidence || "Learning")}</strong></div>
        <div><small>Last analyzed</small><strong>{timeLabel(briefing?.generatedAt)}</strong></div>
      </section>

      <div className="ci-readOnly">
        ADGen provides recommendations only. It never changes budgets, bids,
        targeting, keywords, campaign status, or settings.
      </div>

      <div className={`ci-health ${health.status || "learning"}`}>
        <div>
          <span>Campaign health</span>
          <strong>{health.label || "Learning"}</strong>
        </div>
        <div className="ci-healthCounts">
          <span>{health.priorityCampaigns || 0} priority</span>
          <span>{health.attentionCampaigns || 0} needs attention</span>
          <span>{health.opportunities || 0} opportunities</span>
          <span>{health.healthy || 0} healthy</span>
          {!!health.learning && <span>{health.learning} still learning</span>}
        </div>
      </div>

      <div className="ci-priority">
        <span>If you review one thing</span>
        <strong>{briefing?.topPriorityText}</strong>
      </div>

      <section className="ci-reviewGuide" aria-label="How to review this briefing">
        <div>
          <span>1</span>
          <p>
            <strong>Start with the priority</strong>
            See the single issue ADGen recommends reviewing first.
          </p>
        </div>

        <div>
          <span>2</span>
          <p>
            <strong>Review the campaign</strong>
            Open the affected campaign to understand its strengths and concerns.
          </p>
        </div>

        <div>
          <span>3</span>
          <p>
            <strong>Check the evidence</strong>
            Open a detailed finding only when you want the metrics and reasoning.
          </p>
        </div>
      </section>

      {briefing?.executiveBriefing && (
        <section className="ci-analystBriefing">
          <div className="ci-analystBriefingTop">
            <div>
              <span>AI analyst briefing</span>
              <h4>{briefing.executiveBriefing.greeting || "Campaign briefing"}</h4>
              <p>{briefing.executiveBriefing.overview}</p>
            </div>
            <small>{briefing.executiveBriefing.estimatedReviewTime || "30–60 seconds"}</small>
          </div>

          <div className="ci-briefingColumns">
            <div>
              <span>What changed</span>
              {(briefing.executiveBriefing.whatChanged || []).map((item, index) => (
                <p key={`changed-${index}`}><strong>{item.campaignName || "Account"}</strong>{item.text ? ` — ${item.text}` : ""}</p>
              ))}
            </div>
            <div>
              <span>What is working</span>
              {(briefing.executiveBriefing.whatIsWorking || []).length ? (
                (briefing.executiveBriefing.whatIsWorking || []).map((item, index) => (
                  <p key={`working-${index}`}><strong>{item.campaignName || "Account"}</strong>{item.text ? ` — ${item.text}` : ""}</p>
                ))
              ) : <p>No positive conclusion is strong enough yet.</p>}
            </div>
            <div>
              <span>What to test next</span>
              {(briefing.executiveBriefing.whatToTest || []).map((item, index) => (
                <p key={`test-${index}`}><strong>{item.campaignName || "Account"}</strong>{item.text ? ` — ${item.text}` : ""}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      {!!briefing?.crossPlatformInsights?.length && (
        <section className="ci-crossPlatform">
          <div className="ci-sectionHeading">
            <span>Cross-platform intelligence</span>
            <strong>What Google and Meta indicate together</strong>
          </div>
          <div className="ci-crossPlatformList">
            {briefing.crossPlatformInsights.map((item, index) => (
              <article key={`cross-${index}`} className={item.status || "learning"}>
                <span>{titleCase(item.category)}</span>
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
                <small>{titleCase(item.confidence || "low")} confidence</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {!!briefing?.campaignMemory?.length && (
        <section className="ci-memory">
          <div className="ci-sectionHeading">
            <span>Campaign memory</span>
            <strong>How campaign status changed since the previous briefing</strong>
          </div>
          {briefing.campaignMemory.map((item, index) => (
            <div key={`memory-${index}`}>
              <span>{item.platformLabel}</span>
              <strong>{item.campaignName}</strong>
              <p>{item.message}</p>
            </div>
          ))}
        </section>
      )}

      {briefing?.performanceIntelligence && (
        <section className="ci-piConnection">
          <div className="ci-sectionHeading">
            <span>Performance Intelligence connection</span>
            <strong>Creative traits ADGen can use when a finding is creative-related</strong>
          </div>
          {briefing.performanceIntelligence.available ? (
            <>
              <div className="ci-piTraits">
                {(briefing.performanceIntelligence.traits || []).map((trait) => (
                  <div key={`${trait.label}-${trait.value}`}>
                    <small>{trait.label}</small>
                    <strong>{trait.value}</strong>
                  </div>
                ))}
              </div>
              <p>{briefing.performanceIntelligence.recommendation}</p>
              <small>
                {briefing.performanceIntelligence.qualifiedCount || 0} qualified results · {briefing.performanceIntelligence.positiveCount || 0} positive results
              </small>
            </>
          ) : (
            <p>{briefing.performanceIntelligence.recommendation}</p>
          )}
        </section>
      )}

      {!!campaignAssessments.length && (
        <section className="ci-campaignBreakdown">
          <div className="ci-campaignBreakdownHeader">
            <div>
              <span>Campaign review</span>
              <strong>Start with campaigns that need attention</strong>
              <p>
                Priority campaigns appear first. Open a campaign to see what is
                working, what needs attention, and why ADGen reached that conclusion.
              </p>
            </div>
            <span className="ci-campaignCount">{campaignAssessments.length} analyzed</span>
          </div>

          <div className="ci-campaignAssessmentList">
            {campaignAssessments.map((assessment) => {
              const assessmentExpanded = expandedAssessmentId === assessment.id;
              return (
                <article
                  key={assessment.id}
                  className={`ci-campaignAssessment ${assessment.status || "learning"}`}
                >
                  <button
                    type="button"
                    className="ci-campaignAssessmentTop"
                    onClick={() =>
                      setExpandedAssessmentId(assessmentExpanded ? null : assessment.id)
                    }
                    aria-expanded={assessmentExpanded}
                  >
                    <span className={`ci-campaignStatus ${assessment.status || "learning"}`}>
                      {assessment.statusLabel || titleCase(assessment.status)}
                    </span>
                    <span className="ci-campaignAssessmentCopy">
                      <small>{assessment.platformLabel}</small>
                      <strong>{assessment.campaignName}</strong>
                      <p>{assessment.summary}</p>
                    </span>
                    <span className={`ci-confidence ${assessment.confidence || "low"}`}>
                      {titleCase(assessment.confidence || "low")} confidence
                    </span>
                    <span className="ci-expandLabel">
                      {assessmentExpanded ? "Close review" : "Review this campaign"}
                    </span>
                  </button>

                  {assessmentExpanded && (
                    <div className="ci-campaignAssessmentDetails">
                      <div className="ci-campaignAssessmentHeadline">
                        <span>Campaign conclusion</span>
                        <strong>{assessment.headline}</strong>
                      </div>

                      <div className={`ci-campaignNextAction ${assessment.actionLevel || "review"}`}>
                        <div>
                          <span>{actionLevelLabel(assessment.actionLevel)}</span>
                          <strong>If you change one thing, start here</strong>
                        </div>
                        <p>
                          {assessment.recommendedAction ||
                            "Review the supporting evidence before making a campaign change."}
                        </p>
                      </div>

                      {!!assessment.evidence?.length && (
                        <div className="ci-campaignEvidence">
                          {assessment.evidence.map((item) => (
                            <div key={`${assessment.id}-${item.label}`}>
                              <small>{item.label}</small>
                              <strong>{item.value}</strong>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="ci-campaignAssessmentGrid">
                        <div className="ci-campaignAssessmentSection positive">
                          <span>What is working</span>
                          {assessment.strengths?.length ? (
                            <ul>
                              {assessment.strengths.map((item) => (
                                <li key={`${assessment.id}-strength-${item}`}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>No positive conclusion is strong enough yet.</p>
                          )}
                        </div>

                        <div className="ci-campaignAssessmentSection concern">
                          <span>What needs attention</span>
                          {assessment.concerns?.length ? (
                            <ul>
                              {assessment.concerns.map((item) => (
                                <li key={`${assessment.id}-concern-${item}`}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>No material campaign issue crossed the current thresholds.</p>
                          )}
                        </div>

                        <div className="ci-campaignAssessmentSection test">
                          <span>What to consider next</span>
                          <ul>
                            {(assessment.opportunities || []).map((item) => (
                              <li key={`${assessment.id}-opportunity-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {!!assessment.findingIds?.length && (
                        <div className="ci-relatedFindings">
                          <div className="ci-relatedFindingsHeader">
                            <span>Why ADGen flagged this campaign</span>
                            <strong>
                              Review {assessment.findingIds.length} reason
                              {assessment.findingIds.length === 1 ? "" : "s"} behind this conclusion
                            </strong>
                          </div>

                          <div className="ci-relatedFindingsList">
                            {assessment.findingIds.map((findingId) => {
                              const relatedFinding = findings.find(
                                (finding) => finding.id === findingId
                              );

                              if (!relatedFinding) return null;

                              return (
                                <button
                                  key={`${assessment.id}-${findingId}`}
                                  type="button"
                                  className="ci-relatedFindingButton"
                                  onClick={() => setExpandedId(findingId)}
                                >
                                  <span>{titleCase(relatedFinding.category)}</span>
                                  <strong>{relatedFinding.title}</strong>
                                  <small>
                                    {actionLevelLabel(relatedFinding.actionLevel)} · View evidence and recommended checks →
                                  </small>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {timelineOpen && (
        <div className="ci-timelinePanel">
          <div className="ci-timelineHeader">
            <div>
              <span>Campaign Intelligence history</span>
              <strong>How your briefings have changed</strong>
            </div>
            <div className="ci-timelineFilters">
              {["all", "performance", "creative", "tracking", "google_ads", "meta_ads"].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={timelineFilter === filter ? "active" : ""}
                  onClick={() => setTimelineFilter(filter)}
                >
                  {filter === "google_ads" ? "Google" : filter === "meta_ads" ? "Meta" : titleCase(filter)}
                </button>
              ))}
            </div>
          </div>

          {!filteredHistory.length ? (
            <div className="ci-timelineEmpty">No saved briefings match this filter yet.</div>
          ) : (
            <div className="ci-timeline">
              {filteredHistory.map((item) => {
                const first = item.findings?.[0];
                return (
                  <article key={item.historyId || `${item.generatedAt}-${item.dateRange}`}>
                    <div className="ci-timelineDot" />
                    <div>
                      <small>{timeLabel(item.generatedAt)} · {dateRangeLabel(item.dateRange)}</small>
                      <strong>{first?.title || item.headline}</strong>
                      <p>{first?.summary || item.summary}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!findings.length ? (
        briefing?.healthyAnalysis && Object.keys(briefing.healthyAnalysis).length ? (
          <div className="ci-healthyBriefing">
            <div className="ci-healthyIntro">
              <div>
                <span>What this means</span>
                <h4>No material campaign declines were detected</h4>
                <p>{briefing.healthyAnalysis.whatThisMeans}</p>
              </div>
              <span className={`ci-healthyConfidence ${briefing.healthyAnalysis.confidence || "low"}`}>
                {titleCase(briefing.healthyAnalysis.confidence || "low")} confidence
              </span>
            </div>

            {!!briefing.healthyAnalysis.evidence?.length && (
              <div className="ci-healthyEvidence">
                {briefing.healthyAnalysis.evidence.map((item) => (
                  <div key={`healthy-${item.label}`}>
                    <small>{item.label}</small>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className="ci-healthyGrid">
              <div className="ci-healthySection working">
                <span>What is working well</span>
                <ul>
                  {(briefing.healthyAnalysis.workingWell || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="ci-healthySection opportunities">
                <span>Things worth testing</span>
                <ul>
                  {(briefing.healthyAnalysis.opportunities || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {briefing.healthyAnalysis.strongestCampaign?.campaignName && (
              <div className="ci-strongestCampaign">
                <div>
                  <span>Strongest current campaign signal</span>
                  <strong>{briefing.healthyAnalysis.strongestCampaign.campaignName}</strong>
                  <p>
                    {briefing.healthyAnalysis.strongestCampaign.platformLabel} · {briefing.healthyAnalysis.strongestCampaign.summary}
                  </p>
                </div>
              </div>
            )}

            <div className="ci-analystRecommendation">
              <span>ADGen recommendation</span>
              <p>{briefing.healthyAnalysis.recommendation}</p>
            </div>

            {!!briefing.healthyAnalysis.actions?.length && (
              <div className="ci-actions ci-healthyActions">
                {briefing.healthyAnalysis.actions.map((action) => (
                  <a
                    key={`healthy-${action.label}`}
                    href={action.href}
                    className={action.kind || "secondary"}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            )}

            {!!briefing?.dataNotes?.length && (
              <div className="ci-notes ci-healthyNotes">
                {briefing.dataNotes.map((note) => <span key={note}>{note}</span>)}
              </div>
            )}
          </div>
        ) : (
          <div className="ci-empty">
            <h4>Campaign Intelligence is still learning</h4>
            <p>
              Refresh Google Ads or Meta Ads so ADGen has saved daily campaign history to review.
            </p>
            {!!briefing?.dataNotes?.length && (
              <div className="ci-notes">
                {briefing.dataNotes.map((note) => <span key={note}>{note}</span>)}
              </div>
            )}
          </div>
        )
      ) : null}

      {expandedId && createPortal((() => {
        const selectedFinding = findings.find((finding) => finding.id === expandedId);
        if (!selectedFinding) return null;

        return (
          <div
            className="ci-findingDrawerBackdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setExpandedId(null);
              }
            }}
          >
            <aside
              ref={(node) => {
                findingDrawerRef.current = node;
                if (node) {
                  node.scrollTop = 0;
                }
              }}
              className="ci-findingDrawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`ci-finding-title-${selectedFinding.id}`}
            >
              <div className="ci-findingDrawerHeader">
                <div>
                  <span>{titleCase(selectedFinding.category)}</span>
                  <small>
                    {selectedFinding.platformLabel} · {selectedFinding.campaignName}
                  </small>
                  <h4 id={`ci-finding-title-${selectedFinding.id}`}>
                    {selectedFinding.title}
                  </h4>
                  <p>{selectedFinding.summary}</p>
                </div>
                <button
                  type="button"
                  className="ci-findingDrawerClose"
                  onClick={() => setExpandedId(null)}
                  aria-label="Close detailed finding"
                >
                  ×
                </button>
              </div>

              <div className="ci-findingQuickSummary">
                <div>
                  <small>Detected</small>
                  <strong>{selectedFinding.summary}</strong>
                </div>

                <div className={`ci-primaryRecommendation ${selectedFinding.actionLevel || "review"}`}>
                  <small>{actionLevelLabel(selectedFinding.actionLevel)}</small>
                  <strong>
                    {selectedFinding.recommendedAction ||
                      "Review the campaign context before making a change."}
                  </strong>
                </div>
              </div>

              <div className="ci-findingDrawerMeta">
                <span className={`ci-confidence ${selectedFinding.confidence}`}>
                  {titleCase(selectedFinding.confidence)} confidence
                </span>
              </div>

              <div className="ci-confidenceNote">
                Confidence is based on available impressions, clicks, spend, and conversion volume. Low-volume signals are intentionally treated cautiously.
              </div>

              <div className="ci-explanationGrid">
                <div><span>Why it matters</span><p>{selectedFinding.whyItMatters}</p></div>
                <div><span>How to interpret it</span><p>{selectedFinding.interpretation}</p></div>
              </div>

              {!!selectedFinding.evidence?.length && (
                <div className="ci-evidence">
                  {selectedFinding.evidence.map((item) => (
                    <div key={`${selectedFinding.id}-${item.label}`}>
                      <small>{item.label}</small>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              )}

              {!!selectedFinding.reviewItems?.length && (
                <div className="ci-review">
                  <span>Supporting checklist</span>
                  <ul>
                    {selectedFinding.reviewItems.map((item) => (
                      <li key={`${selectedFinding.id}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!selectedFinding.actions?.length && (
                <div className="ci-actions">
                  {selectedFinding.actions.map((action) => (
                    <a key={`${selectedFinding.id}-${action.label}`} href={action.href} className={action.kind || "secondary"}>
                      {action.label}
                    </a>
                  ))}
                </div>
              )}

              {findings.length > 1 && (
                <div className="ci-findingDrawerNav">
                  <span>Other findings</span>
                  <div>
                    {findings.map((finding) => (
                      <button
                        key={`drawer-${finding.id}`}
                        type="button"
                        className={finding.id === selectedFinding.id ? "active" : ""}
                        onClick={() => setExpandedId(finding.id)}
                      >
                        {finding.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        );
      })(), document.body)}

    </section>
  );
}
