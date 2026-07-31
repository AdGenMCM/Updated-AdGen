import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import "./CampaignIntelligencePanel.css";

const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000"
).trim();

function timeLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "Not analyzed yet";
  return new Date(number * 1000).toLocaleString();
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function CampaignIntelligencePanel() {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be logged in.");

      const token = await user.getIdToken(true);
      const response = await fetch(`${API_BASE}/campaign-intelligence/briefing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await safeJson(response);

      if (!response.ok) {
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "Could not prepare Campaign Intelligence."
        );
      }

      setBriefing(body || {});
      if (body?.topPriorityId) setExpandedId(body.topPriorityId);
    } catch (err) {
      setBriefing(null);
      setError(err?.message || "Could not prepare Campaign Intelligence.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const findings = useMemo(
    () => (Array.isArray(briefing?.findings) ? briefing.findings : []),
    [briefing]
  );

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

  return (
    <section className="ci-panel">
      <header className="ci-header">
        <div>
          <span className="ci-eyebrow">Read-only campaign briefing</span>
          <h3>{briefing?.headline || "Your campaign briefing"}</h3>
          <p>{briefing?.summary}</p>
          <small>Last analyzed {timeLabel(briefing?.generatedAt)}</small>
        </div>

        <button type="button" className="ci-refresh" onClick={load}>
          Refresh briefing
        </button>
      </header>

      <div className="ci-readOnly">
        ADGen provides recommendations only. It never changes budgets, bids,
        targeting, keywords, campaign status, or settings.
      </div>

      <div className="ci-priority">
        <span>If you review one thing</span>
        <strong>{briefing?.topPriorityText}</strong>
      </div>

      {!findings.length ? (
        <div className="ci-empty">
          <h4>No material campaign changes detected</h4>
          <p>
            {briefing?.platformsAnalyzed?.length
              ? "ADGen did not find a seven-day change that met the current evidence thresholds."
              : "Refresh Google Ads or Meta Ads manually so ADGen has saved daily campaign history to review."}
          </p>

          {!!briefing?.dataNotes?.length && (
            <div className="ci-notes">
              {briefing.dataNotes.map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="ci-findings">
          {findings.map((finding) => {
            const expanded = expandedId === finding.id;

            return (
              <article
                key={finding.id}
                className={`ci-finding ${finding.severity || "info"}`}
              >
                <button
                  type="button"
                  className="ci-findingTop"
                  onClick={() => setExpandedId(expanded ? null : finding.id)}
                  aria-expanded={expanded}
                >
                  <span className="ci-severity">
                    {titleCase(finding.category)}
                  </span>

                  <span className="ci-findingCopy">
                    <small>
                      {finding.platformLabel} · {finding.campaignName}
                    </small>
                    <strong>{finding.title}</strong>
                    <p>{finding.summary}</p>
                  </span>

                  <span className="ci-confidence">
                    {titleCase(finding.confidence)} confidence
                  </span>

                  <span className="ci-expandLabel">
                    {expanded ? "Hide details" : "Show me why"}
                  </span>
                </button>

                {expanded && (
                  <div className="ci-details">
                    <div className="ci-explanationGrid">
                      <div>
                        <span>Why it matters</span>
                        <p>{finding.whyItMatters}</p>
                      </div>
                      <div>
                        <span>How to interpret it</span>
                        <p>{finding.interpretation}</p>
                      </div>
                    </div>

                    {!!finding.evidence?.length && (
                      <div className="ci-evidence">
                        {finding.evidence.map((item) => (
                          <div key={`${finding.id}-${item.label}`}>
                            <small>{item.label}</small>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    )}

                    {!!finding.reviewItems?.length && (
                      <div className="ci-review">
                        <span>Things worth reviewing</span>
                        <ul>
                          {finding.reviewItems.map((item) => (
                            <li key={`${finding.id}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {finding.creativeRelated && (
                      <div className="ci-actions">
                        <a href="/optimizer">Open Optimizer</a>
                        <a href="/adgenerator">Generate a variation</a>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
