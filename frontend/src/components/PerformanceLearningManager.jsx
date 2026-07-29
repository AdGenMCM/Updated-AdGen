import React, { useEffect, useMemo, useState } from "react";
import {
  getPerformanceRefreshStatus,
  rebuildPerformanceIntelligence,
} from "../services/performanceIntelligenceService";
import "./PerformanceLearningManager.css";

const DATE_RANGES = [
  ["LAST_7_DAYS", "Last 7 days"],
  ["LAST_14_DAYS", "Last 14 days"],
  ["LAST_30_DAYS", "Last 30 days"],
  ["LAST_90_DAYS", "Last 90 days"],
  ["THIS_MONTH", "This month"],
  ["LAST_MONTH", "Last month"],
  ["MAXIMUM", "Maximum available"],
  ["CUSTOM", "Custom range"],
];

function formatTime(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Never";
  return new Date(parsed * 1000).toLocaleString();
}

function sourceResult(result, key) {
  const value = result?.[key] || {};
  return {
    added: Number(value.added || 0),
    updated: Number(value.updated || 0),
    unchanged: Number(value.unchanged || 0),
    processed: Number(value.processed || value.imported || 0),
    failed: Array.isArray(value.failures) ? value.failures.length : 0,
    status: value.status || "completed",
  };
}

export default function PerformanceLearningManager({ onComplete }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [includeManual, setIncludeManual] = useState(true);
  const [includeGoogle, setIncludeGoogle] = useState(true);
  const [includeMeta, setIncludeMeta] = useState(true);
  const [googleRange, setGoogleRange] = useState("MAXIMUM");
  const [googleStartDate, setGoogleStartDate] = useState("");
  const [googleEndDate, setGoogleEndDate] = useState("");
  const [metaRange, setMetaRange] = useState("MAXIMUM");
  const [metaStartDate, setMetaStartDate] = useState("");
  const [metaEndDate, setMetaEndDate] = useState("");

  const loadStatus = async () => {
    setLoading(true);
    try {
      setStatus(await getPerformanceRefreshStatus());
    } catch (err) {
      setError(err?.message || "Could not load learning refresh status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const googleReady = Boolean(
    status?.googleAds?.connected && status?.googleAds?.selected,
  );
  const metaReady = Boolean(
    status?.metaAds?.connected && status?.metaAds?.selected,
  );

  useEffect(() => {
    if (!loading) {
      if (!googleReady) setIncludeGoogle(false);
      if (!metaReady) setIncludeMeta(false);
    }
  }, [loading, googleReady, metaReady]);

  const selectedCount = [includeManual, includeGoogle, includeMeta].filter(
    Boolean,
  ).length;
  const customDatesMissing =
    (includeGoogle && googleRange === "CUSTOM" && (!googleStartDate || !googleEndDate)) ||
    (includeMeta && metaRange === "CUSTOM" && (!metaStartDate || !metaEndDate));

  const totals = useMemo(() => {
    if (!result) return null;
    const sources = [
      sourceResult(result, "manual"),
      sourceResult(result, "googleAds"),
      sourceResult(result, "metaAds"),
    ];
    return sources.reduce(
      (total, item) => ({
        added: total.added + item.added,
        updated: total.updated + item.updated,
        unchanged: total.unchanged + item.unchanged,
        processed: total.processed + item.processed,
        failed: total.failed + item.failed,
      }),
      { added: 0, updated: 0, unchanged: 0, processed: 0, failed: 0 },
    );
  }, [result]);

  const refresh = async () => {
    if (!selectedCount) return;
    setRefreshing(true);
    setError("");
    setResult(null);

    try {
      const next = await rebuildPerformanceIntelligence({
        includeManual,
        includeGoogleAds: includeGoogle,
        includeMetaAds: includeMeta,
        googleDateRange: googleRange,
        googleStartDate: googleRange === "CUSTOM" ? googleStartDate : null,
        googleEndDate: googleRange === "CUSTOM" ? googleEndDate : null,
        metaDateRange: metaRange,
        metaStartDate: metaRange === "CUSTOM" ? metaStartDate : null,
        metaEndDate: metaRange === "CUSTOM" ? metaEndDate : null,
        syncSources: true,
        analyzeMedia: false,
      });
      setResult(next || {});
      await loadStatus();
      if (onComplete) await onComplete(next || {});
    } catch (err) {
      setError(err?.message || "Could not refresh learning.");
    } finally {
      setRefreshing(false);
    }
  };

  const beforeConfidence = Number(result?.before?.confidence || 0) * 100;
  const afterConfidence = Number(result?.after?.confidence || 0) * 100;
  const confidenceDelta = afterConfidence - beforeConfidence;

  return (
    <section className="plm-card">
      <div className="plm-header">
        <div>
          <span className="plm-eyebrow">Learning Manager</span>
          <h3>Refresh ADGen's accumulated intelligence</h3>
          <p>
            Refresh Learning imports new and updated results from the selected
            sources. Existing evidence is preserved, known creatives are
            updated instead of duplicated, and no historical learning is
            removed.
          </p>
        </div>
        <button
          type="button"
          className="plm-refresh"
          onClick={refresh}
          disabled={refreshing || !selectedCount || loading || customDatesMissing}
        >
          {refreshing ? (
            <span className="plm-loading">
              <span className="plm-spinner" />
              Refreshing learning
            </span>
          ) : (
            "Refresh Learning"
          )}
        </button>
      </div>

      {error && <div className="plm-error">{error}</div>}

      <div className="plm-preserveNote">
        <strong>Additive learning is on.</strong>
        <span>
          Date ranges control what ADGen checks. They never delete evidence
          collected by an earlier refresh.
        </span>
      </div>

      <div className="plm-sourceGrid">
        <article className={`plm-source ${includeManual ? "selected" : ""}`}>
          <div className="plm-sourceTop">
            <label>
              <input
                type="checkbox"
                checked={includeManual}
                onChange={(event) => setIncludeManual(event.target.checked)}
                disabled={refreshing}
              />
              <span>
                <strong>Library Performance</strong>
                <small>Saved image and video performance</small>
              </span>
            </label>
            <span className="plm-state ready">Always available</span>
          </div>
          <div className="plm-sourceMeta">
            <span>Latest learning update</span>
            <strong>{formatTime(status?.learningUpdatedAt)}</strong>
          </div>
        </article>

        <article className={`plm-source ${includeGoogle ? "selected" : ""}`}>
          <div className="plm-sourceTop">
            <label>
              <input
                type="checkbox"
                checked={includeGoogle}
                onChange={(event) => setIncludeGoogle(event.target.checked)}
                disabled={refreshing || !googleReady}
              />
              <span>
                <strong>Google Ads</strong>
                <small>Campaign and creative asset performance</small>
              </span>
            </label>
            <span className={`plm-state ${googleReady ? "ready" : "waiting"}`}>
              {googleReady ? "Ready" : "Connect account"}
            </span>
          </div>
          <label className="plm-range">
            <span>Import range</span>
            <select
              value={googleRange}
              onChange={(event) => setGoogleRange(event.target.value)}
              disabled={refreshing || !includeGoogle || !googleReady}
            >
              {DATE_RANGES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {googleRange === "CUSTOM" && (
            <div className="plm-customDates">
              <label><span>Start date</span><input type="date" value={googleStartDate} onChange={(event) => setGoogleStartDate(event.target.value)} disabled={refreshing} /></label>
              <label><span>End date</span><input type="date" value={googleEndDate} onChange={(event) => setGoogleEndDate(event.target.value)} disabled={refreshing} /></label>
            </div>
          )}
          <div className="plm-sourceMeta">
            <span>Last Google sync</span>
            <strong>{formatTime(status?.googleAds?.lastSyncAt)}</strong>
          </div>
        </article>

        <article className={`plm-source ${includeMeta ? "selected" : ""}`}>
          <div className="plm-sourceTop">
            <label>
              <input
                type="checkbox"
                checked={includeMeta}
                onChange={(event) => setIncludeMeta(event.target.checked)}
                disabled={refreshing || !metaReady}
              />
              <span>
                <strong>Meta Ads</strong>
                <small>Campaign, ad set, ad, and creative performance</small>
              </span>
            </label>
            <span className={`plm-state ${metaReady ? "ready" : "waiting"}`}>
              {metaReady ? "Ready" : "Connect account"}
            </span>
          </div>
          <label className="plm-range">
            <span>Import range</span>
            <select
              value={metaRange}
              onChange={(event) => setMetaRange(event.target.value)}
              disabled={refreshing || !includeMeta || !metaReady}
            >
              {DATE_RANGES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {metaRange === "CUSTOM" && (
            <div className="plm-customDates">
              <label><span>Start date</span><input type="date" value={metaStartDate} onChange={(event) => setMetaStartDate(event.target.value)} disabled={refreshing} /></label>
              <label><span>End date</span><input type="date" value={metaEndDate} onChange={(event) => setMetaEndDate(event.target.value)} disabled={refreshing} /></label>
            </div>
          )}
          <div className="plm-sourceMeta">
            <span>Last Meta creative sync</span>
            <strong>{formatTime(status?.metaAds?.lastCreativeSyncAt)}</strong>
          </div>
        </article>
      </div>

      <div className="plm-statusStrip">
        <div>
          <span>Last intelligence refresh</span>
          <strong>{formatTime(status?.latestRefresh?.finishedAt)}</strong>
        </div>
        <div>
          <span>Refresh status</span>
          <strong>{status?.latestRefresh?.status || "Not run yet"}</strong>
        </div>
        <div>
          <span>Sources selected</span>
          <strong>{selectedCount}</strong>
        </div>
      </div>

      {result && totals && (
        <div className="plm-result">
          <div className="plm-resultHeader">
            <div>
              <span className="plm-eyebrow">Learning updated</span>
              <h4>
                {result.status === "partial"
                  ? "Refresh completed with a source warning"
                  : "ADGen finished rebuilding its intelligence profile"}
              </h4>
            </div>
            <span className={`plm-resultState ${result.status || "completed"}`}>
              {result.status || "completed"}
            </span>
          </div>

          <div className="plm-resultGrid">
            <div><small>New evidence</small><strong>{totals.added}</strong></div>
            <div><small>Updated evidence</small><strong>{totals.updated}</strong></div>
            <div><small>Unchanged</small><strong>{totals.unchanged}</strong></div>
            <div><small>Failures</small><strong>{totals.failed}</strong></div>
          </div>

          <div className="plm-learningChange">
            <span>Confidence</span>
            <strong>
              {beforeConfidence.toFixed(0)}% → {afterConfidence.toFixed(0)}%
            </strong>
            <small>
              {confidenceDelta > 0
                ? `Increased ${confidenceDelta.toFixed(0)} percentage points`
                : confidenceDelta < 0
                  ? `Changed ${confidenceDelta.toFixed(0)} percentage points as newer metrics were evaluated`
                  : "Current confidence was maintained"}
            </small>
          </div>

          <div className="plm-insightChanges">
            <div><small>Qualified results</small><strong>{Number(result?.before?.qualifiedCount || 0)} → {Number(result?.after?.qualifiedCount || 0)}</strong></div>
            <div><small>Positive signals</small><strong>{Number(result?.before?.positiveCount || 0)} → {Number(result?.after?.positiveCount || 0)}</strong></div>
            <div><small>Total retained evidence</small><strong>{Number(result?.after?.evidenceCount || 0)}</strong></div>
          </div>

          <p className="plm-historyConfirmation">
            Historical evidence removed: <strong>0</strong>. The intelligence
            profile was recalculated from the complete retained evidence set.
          </p>
        </div>
      )}
    </section>
  );
}
