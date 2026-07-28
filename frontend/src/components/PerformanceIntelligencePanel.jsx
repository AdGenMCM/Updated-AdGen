import React, { useEffect, useMemo, useState } from "react";
import {
  getGenerationProfile,
  getPerformanceIntelligence,
  rebuildPerformanceIntelligence,
  recalculatePerformanceIntelligence,
} from "../services/performanceIntelligenceService";
import "./PerformanceIntelligencePanel.css";

function percent(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0%";
  const normalized = number <= 1 ? number * 100 : number;
  return `${normalized.toFixed(digits)}%`;
}

function number(value, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function formatTime(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Not calculated yet";
  return new Date(parsed * 1000).toLocaleString();
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstValue(items) {
  return Array.isArray(items) && items.length ? items[0]?.value : null;
}

function topValues(items, limit = 4) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, limit);
}

function learningStatus(confidence, evidenceCount, qualifiedCount) {
  const score = Number(confidence || 0);
  if (!evidenceCount) {
    return {
      label: "Waiting for data",
      detail: "Add performance data or connect Google Ads to begin learning.",
      className: "waiting",
    };
  }
  if (!qualifiedCount) {
    return {
      label: "Learning",
      detail: "Evidence is being collected, but more volume is needed.",
      className: "learning",
    };
  }
  if (score >= 0.75) {
    return {
      label: "Strong signal",
      detail: "ADGen has enough qualified evidence to guide generation.",
      className: "strong",
    };
  }
  if (score >= 0.4) {
    return {
      label: "Growing",
      detail: "Patterns are forming and confidence will improve with more results.",
      className: "growing",
    };
  }
  return {
    label: "Early learning",
    detail: "ADGen has started identifying patterns from your results.",
    className: "learning",
  };
}

export default function PerformanceIntelligencePanel() {
  const [summary, setSummary] = useState(null);
  const [profileResponse, setProfileResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryResult, profileResult] = await Promise.all([
        getPerformanceIntelligence(),
        getGenerationProfile(),
      ]);
      setSummary(summaryResult || {});
      setProfileResponse(profileResult || {});
    } catch (err) {
      setError(err?.message || "Could not load Performance Intelligence.");
      setSummary(null);
      setProfileResponse(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refreshLearning = async () => {
    setRebuilding(true);
    setError("");
    setSuccess("");

    try {
      const result = await rebuildPerformanceIntelligence({
        includeManual: true,
        includeGoogleAds: true,
        googleDateRange: "LAST_30_DAYS",
        analyzeMedia: false,
      });

      const nextSummary =
        result?.summary || (await recalculatePerformanceIntelligence());
      const nextProfile = await getGenerationProfile();

      setSummary(nextSummary || {});
      setProfileResponse(nextProfile || {});

      const manualImported = Number(result?.manual?.imported || 0);
      const googleImported = Number(result?.googleAds?.imported || 0);
      setSuccess(
        `Learning refreshed from ${manualImported + googleImported} creative ${
          manualImported + googleImported === 1 ? "record" : "records"
        }.`
      );
      window.setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err?.message || "Could not refresh Performance Intelligence.");
    } finally {
      setRebuilding(false);
    }
  };

  const profile = useMemo(
    () =>
      profileResponse?.profile ||
      summary?.generationProfile ||
      {},
    [profileResponse, summary]
  );

  const confidence = Number(
    profileResponse?.confidence ?? summary?.confidence ?? 0
  );
  const evidenceCount = Number(
    profileResponse?.evidenceCount ?? summary?.evidenceCount ?? 0
  );
  const qualifiedCount = Number(
    profileResponse?.qualifiedCount ?? summary?.qualifiedCount ?? 0
  );
  const positiveCount = Number(
    profileResponse?.positiveCount ?? summary?.positiveCount ?? 0
  );
  const underperformerCount = Number(summary?.underperformerCount || 0);
  const status = learningStatus(
    confidence,
    evidenceCount,
    qualifiedCount
  );

  const dna = useMemo(
    () => [
      {
        label: "Best Colors",
        value: firstValue(profile.top_colors),
        items: topValues(profile.top_colors),
      },
      {
        label: "Visual Style",
        value: firstValue(profile.top_visual_styles),
        items: topValues(profile.top_visual_styles),
      },
      {
        label: "Composition",
        value: firstValue(profile.top_compositions),
        items: topValues(profile.top_compositions),
      },
      {
        label: "Background",
        value: firstValue(profile.top_backgrounds),
        items: topValues(profile.top_backgrounds),
      },
      {
        label: "Imagery Type",
        value: firstValue(profile.top_imagery_types),
        items: topValues(profile.top_imagery_types),
      },
      {
        label: "Emotional Tone",
        value: firstValue(profile.top_emotional_tones),
        items: topValues(profile.top_emotional_tones),
      },
      {
        label: "CTA Opener",
        value: firstValue(profile.top_cta_openers),
        items: topValues(profile.top_cta_openers),
      },
      {
        label: "Headline Opener",
        value: firstValue(profile.top_headline_openers),
        items: topValues(profile.top_headline_openers),
      },
    ],
    [profile]
  );

  const recommendations = useMemo(() => {
    const items = [];
    const topColor = firstValue(profile.top_colors);
    const topStyle = firstValue(profile.top_visual_styles);
    const topComposition = firstValue(profile.top_compositions);
    const topCta = firstValue(profile.top_cta_openers);
    const headlineLength = Number(
      profile.average_winning_headline_length
    );

    if (topStyle) {
      items.push(`Generate more ${titleCase(topStyle)} creative variations.`);
    }
    if (topColor) {
      items.push(`Keep ${titleCase(topColor)} prominent in upcoming tests.`);
    }
    if (topComposition) {
      items.push(`Prioritize ${titleCase(topComposition)} compositions.`);
    }
    if (topCta) {
      items.push(`Test more CTAs that begin with “${titleCase(topCta)}.”`);
    }
    if (Number.isFinite(headlineLength) && headlineLength > 0) {
      items.push(
        `Aim for headlines near ${Math.round(
          headlineLength
        )} characters based on current winners.`
      );
    }

    if (!items.length) {
      return [
        "Add impressions, clicks, conversions, spend, and revenue to Library creatives.",
        "Refresh Google Ads data so ADGen can collect campaign evidence.",
        "Mark successful creatives to strengthen the learning signal.",
      ];
    }

    return items.slice(0, 5);
  }, [profile]);

  const sourceEntries = Object.entries(
    profileResponse?.sources || summary?.sources || {}
  );

  if (loading) {
    return (
      <section className="pi-panel">
        <div className="pi-state">Loading Performance Intelligence…</div>
      </section>
    );
  }

  return (
    <section className="pi-panel">
      <header className="pi-header">
        <div>
          <span className="pi-eyebrow">ADGen Learning Engine</span>
          <h2>Performance Intelligence</h2>
          <p>
            ADGen learns from qualified creative results and turns those
            patterns into practical guidance for future generations.
          </p>
        </div>

        <button
          type="button"
          className="pi-refresh"
          onClick={refreshLearning}
          disabled={rebuilding}
        >
          {rebuilding ? (
            <span className="pi-loading">
              <span className="pi-spinner" />
              Refreshing learning
            </span>
          ) : (
            "Refresh Learning"
          )}
        </button>
      </header>

      {error && <div className="pi-error">{error}</div>}
      {success && <div className="pi-success">✓ {success}</div>}

      <div className="pi-statGrid">
        <article className="pi-statCard confidence">
          <span>Confidence</span>
          <strong>{percent(confidence)}</strong>
          <p>Strength of the current learning signal</p>
        </article>

        <article className="pi-statCard">
          <span>Creatives Learned</span>
          <strong>{evidenceCount}</strong>
          <p>Performance evidence collected</p>
        </article>

        <article className="pi-statCard">
          <span>Qualified Results</span>
          <strong>{qualifiedCount}</strong>
          <p>Evidence with meaningful delivery volume</p>
        </article>

        <article className={`pi-statCard status ${status.className}`}>
          <span>Learning Status</span>
          <strong>{status.label}</strong>
          <p>{status.detail}</p>
        </article>
      </div>

      <div className="pi-summaryGrid">
        <article className="pi-card pi-learningSummary">
          <div className="pi-cardTitle">
            <div>
              <span className="pi-eyebrow">What ADGen has learned</span>
              <h3>Creative Learning Summary</h3>
            </div>
            <span className="pi-updated">
              Updated {formatTime(summary?.updatedAt)}
            </span>
          </div>

          {positiveCount > 0 ? (
            <p>
              ADGen has identified <strong>{positiveCount}</strong>{" "}
              high-performing creative{" "}
              {positiveCount === 1 ? "signal" : "signals"} from{" "}
              <strong>{qualifiedCount}</strong> qualified results. The patterns
              below represent the strongest characteristics currently associated
              with positive performance.
            </p>
          ) : (
            <p>
              ADGen is collecting evidence, but it has not identified a
              statistically meaningful positive pattern yet. Continue adding
              performance data and refreshing connected ad sources.
            </p>
          )}

          <div className="pi-signalStrip">
            <div>
              <small>Positive signals</small>
              <strong>{positiveCount}</strong>
            </div>
            <div>
              <small>Underperformers</small>
              <strong>{underperformerCount}</strong>
            </div>
            <div>
              <small>Average winning CTR</small>
              <strong>
                {summary?.averagePositiveCtrPercent == null
                  ? "—"
                  : `${number(summary.averagePositiveCtrPercent, 2)}%`}
              </strong>
            </div>
            <div>
              <small>Average winning ROAS</small>
              <strong>{number(summary?.averagePositiveRoas, 2)}</strong>
            </div>
          </div>

          {sourceEntries.length > 0 && (
            <div className="pi-sources">
              <span>Learning sources</span>
              <div>
                {sourceEntries.map(([source, count]) => (
                  <span key={source}>
                    {titleCase(source)} · {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </article>

        <article className="pi-card">
          <div className="pi-cardTitle">
            <div>
              <span className="pi-eyebrow">Next creative decisions</span>
              <h3>Recommendations</h3>
            </div>
          </div>

          <div className="pi-recommendations">
            {recommendations.map((recommendation) => (
              <div key={recommendation}>
                <span>✓</span>
                <p>{recommendation}</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="pi-card pi-dnaCard">
        <div className="pi-cardTitle">
          <div>
            <span className="pi-eyebrow">Winning creative profile</span>
            <h3>Creative DNA</h3>
          </div>
          <p>
            The most common traits found across qualified, positive-performing
            creatives.
          </p>
        </div>

        <div className="pi-dnaGrid">
          {dna.map((item) => (
            <div className="pi-dnaItem" key={item.label}>
              <span>{item.label}</span>
              <strong>
                {item.value ? titleCase(item.value) : "Learning"}
              </strong>

              {item.items.length > 0 ? (
                <div className="pi-chips">
                  {item.items.map((entry) => (
                    <span key={`${item.label}-${entry.value}`}>
                      {titleCase(entry.value)}
                    </span>
                  ))}
                </div>
              ) : (
                <small>More qualified winners needed</small>
              )}
            </div>
          ))}
        </div>

        <div className="pi-formatMetrics">
          <div>
            <span>Winning headline length</span>
            <strong>
              {profile.average_winning_headline_length == null
                ? "Learning"
                : `${Math.round(
                    Number(profile.average_winning_headline_length)
                  )} characters`}
            </strong>
          </div>
          <div>
            <span>Winning product prominence</span>
            <strong>
              {profile.average_winning_product_prominence_percent == null
                ? "Learning"
                : `${number(
                    profile.average_winning_product_prominence_percent,
                    0
                  )}%`}
            </strong>
          </div>
        </div>
      </article>

      <article className="pi-card pi-progressCard">
        <div className="pi-cardTitle">
          <div>
            <span className="pi-eyebrow">Learning progress</span>
            <h3>Confidence Growth</h3>
          </div>
          <strong>{percent(confidence)}</strong>
        </div>

        <div
          className="pi-progressTrack"
          role="progressbar"
          aria-label="Performance Intelligence confidence"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(confidence * 100)}
        >
          <span style={{ width: `${Math.min(100, confidence * 100)}%` }} />
        </div>

        <div className="pi-progressLabels">
          <span>Collecting data</span>
          <span>Patterns forming</span>
          <span>Generation ready</span>
        </div>
      </article>
    </section>
  );
}
