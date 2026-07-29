import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  Eye,
  FileSpreadsheet,
  Info,
  Library,
  LockKeyhole,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { useWorkspace } from "../context/WorkspaceContext";

import {
  downloadReport,
  loadReportPreview,
  loadReportingStatus,
} from "../services/reportingService";

import "./Reports.css";

const REPORT_TYPES = [
  {
    id: "executive",
    icon: BriefcaseBusiness,
    label: "Executive overview",
    title: "How did everything perform?",
    defaultMetrics: [
      "impressions",
      "clicks",
      "ctr",
      "spend",
      "conversions",
      "cpa",
      "roas",
    ],
  },
  {
    id: "campaign",
    icon: BarChart3,
    label: "Campaign performance",
    title: "How did my campaigns perform?",
    defaultMetrics: [
      "impressions",
      "clicks",
      "ctr",
      "spend",
      "cpc",
      "conversions",
      "cpa",
      "roas",
    ],
  },
  {
    id: "creative",
    icon: Sparkles,
    label: "Creative performance",
    title: "Which creatives performed best?",
    defaultMetrics: [
      "impressions",
      "clicks",
      "ctr",
      "spend",
      "conversions",
      "conversionValue",
      "cpa",
      "roas",
    ],
  },
  {
    id: "library",
    icon: Library,
    label: "Library performance",
    title: "How did my saved Library assets perform?",
    defaultMetrics: [
      "impressions",
      "clicks",
      "ctr",
      "spend",
      "conversions",
      "conversionValue",
      "cpa",
      "roas",
    ],
  },
  {
    id: "learning",
    icon: Brain,
    label: "Learning health",
    title: "What has ADGen learned?",
    defaultMetrics: [],
  },
];

const DATE_PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last_7_days", "Previous 7 days"],
  ["last_30_days", "Previous 30 days"],
  ["last_90_days", "Previous 90 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["maximum", "Maximum history"],
  ["custom", "Custom dates"],
];

const COMPARISON_OPTIONS = [
  ["none", "No comparison"],
  ["previous_period", "Previous period"],
  ["previous_month", "Previous month"],
  ["previous_year", "Previous year"],
];

const SPLIT_OPTIONS = [
  ["none", "No split"],
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
  ["platform", "Platform"],
  ["campaign", "Campaign"],
  ["ad_group", "Ad group / ad set"],
  ["creative", "Creative"],
  ["device", "Device"],
  ["country", "Country"],
  ["placement", "Placement"],
];

const METRIC_GROUPS = [
  {
    id: "reach",
    label: "Reach and traffic",
    description: "Volume and engagement across the selected sources.",
    metrics: [
      ["impressions", "Impressions"],
      ["clicks", "Clicks"],
      ["ctr", "CTR"],
    ],
  },
  {
    id: "cost",
    label: "Cost and efficiency",
    description: "Spend and unit-cost performance.",
    metrics: [
      ["spend", "Spend"],
      ["cpc", "CPC"],
      ["cpm", "CPM"],
      ["cpa", "CPA"],
    ],
  },
  {
    id: "results",
    label: "Results and return",
    description: "Conversions, value, and return on spend.",
    metrics: [
      ["conversions", "Conversions"],
      ["conversionValue", "Conversion value"],
      ["conversionRate", "Conversion rate"],
      ["roas", "ROAS"],
    ],
  },
];

const METRIC_LABELS = new Map(
  METRIC_GROUPS.flatMap((group) => group.metrics)
);

function number(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function formatMetric(key, value) {
  if (["spend", "cpc", "cpm", "cpa", "conversionValue"].includes(key)) {
    return money(value);
  }
  if (["ctr", "conversionRate"].includes(key)) {
    return `${number(value)}%`;
  }
  return number(value);
}

function formatSync(value) {
  if (!value) return "Not synced yet";
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
    : new Date(value);

  if (Number.isNaN(date.getTime())) return "Synced";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resolveDateRange(preset) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);

  switch (preset) {
    case "today":
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "last_7_days":
      start.setDate(start.getDate() - 7);
      end.setDate(end.getDate() - 1);
      break;
    case "last_30_days":
      start.setDate(start.getDate() - 30);
      end.setDate(end.getDate() - 1);
      break;
    case "last_90_days":
      start.setDate(start.getDate() - 90);
      end.setDate(end.getDate() - 1);
      break;
    case "this_month":
      start.setDate(1);
      break;
    case "last_month":
      start.setMonth(start.getMonth() - 1, 1);
      end.setDate(0);
      break;
    default:
      return { startDate: "", endDate: "" };
  }

  const toInput = (date) => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000)
      .toISOString()
      .slice(0, 10);
  };

  return { startDate: toInput(start), endDate: toInput(end) };
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="reports-field">
      <span>{label}</span>
      <div className="reports-select-wrap">
        <select value={value} onChange={onChange}>
          {children}
        </select>
        <ChevronDown size={15} />
      </div>
    </label>
  );
}

function buildExecutiveSummary(preview, reportLabel, dateLabel) {
  const totals = preview?.totals || {};
  const impressions = Number(totals.impressions || 0);
  const clicks = Number(totals.clicks || 0);
  const spend = Number(totals.spend || 0);
  const conversions = Number(totals.conversions || 0);
  const ctr = Number(totals.ctr || 0);

  if (!preview) {
    return "Select your report settings to generate a finished report preview.";
  }

  const performanceParts = [];
  if (impressions > 0) performanceParts.push(`${number(impressions)} impressions`);
  if (clicks > 0) performanceParts.push(`${number(clicks)} clicks`);
  if (spend > 0) performanceParts.push(`${money(spend)} in spend`);
  if (conversions > 0) performanceParts.push(`${number(conversions)} conversions`);

  const performanceText = performanceParts.length
    ? performanceParts.join(", ")
    : "no recorded performance activity";

  const ctrText = ctr > 0 ? ` The blended CTR was ${number(ctr)}%.` : "";

  return `${reportLabel} for ${dateLabel} includes ${performanceText}.${ctrText}`;
}


function ReportsUpgradeCard({ currentPlan }) {
  return (
    <section className="reports-upgrade-card" aria-labelledby="reports-upgrade-title">
      <div className="reports-upgrade-glow" aria-hidden="true" />

      <div className="reports-upgrade-icon" aria-hidden="true">
        <LockKeyhole size={24} />
      </div>

      <div className="reports-upgrade-copy">
        <span>PRO REPORTING</span>
        <h2 id="reports-upgrade-title">
          Turn connected performance data into export-ready reports.
        </h2>
        <p>
          Reports is available on Pro and Business. Upgrade to combine your
          connected channels, compare reporting periods, analyze creative
          performance, and generate polished workbooks from one workspace.
        </p>

        <div className="reports-upgrade-features">
          <div>
            <Check size={15} />
            <span>Multi-source performance reporting</span>
          </div>
          <div>
            <Check size={15} />
            <span>Campaign, creative, and Library breakdowns</span>
          </div>
          <div>
            <Check size={15} />
            <span>Custom metrics, comparisons, and exports</span>
          </div>
        </div>
      </div>

      <div className="reports-upgrade-action">
        <div className="reports-upgrade-plan">
          <small>Current plan</small>
          <strong>{currentPlan || "Free"}</strong>
        </div>

        <Link to="/subscribe?upgrade=reports" className="reports-upgrade-button">
          View Pro plans
          <TrendingUp size={17} />
        </Link>

        <small className="reports-upgrade-note">
          Business includes the same reporting access with higher platform
          limits.
        </small>
      </div>
    </section>
  );
}

export default function Reports() {
  const {
    planLabel,
    isAdmin,
    loading: workspaceLoading,
  } = useWorkspace() || {};

  const normalizedPlan = String(planLabel || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  const hasReportsAccess =
    Boolean(isAdmin) ||
    normalizedPlan.includes("pro") ||
    normalizedPlan.includes("business");

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [metricsOpen, setMetricsOpen] = useState(true);

  const [reportType, setReportType] = useState("campaign");
  const [providers, setProviders] = useState([]);
  const [datePreset, setDatePreset] = useState("last_30_days");
  const initialDates = resolveDateRange("last_30_days");
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);
  const [comparison, setComparison] = useState("none");
  const [primarySplit, setPrimarySplit] = useState("none");
  const [secondarySplit, setSecondarySplit] = useState("none");
  const [metrics, setMetrics] = useState(
    REPORT_TYPES.find((item) => item.id === "campaign").defaultMetrics
  );

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const next = await loadReportingStatus();
      setData(next);

      const available = [];
      if (next?.googleAds?.selected) available.push("googleAds");
      if (next?.metaAds?.selected) available.push("metaAds");
      if (next?.libraryPerformance?.selected) {
        available.push("libraryPerformance");
      }
      setProviders(available);
    } catch (nextError) {
      setError(nextError?.message || "Could not load your report data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceLoading || !hasReportsAccess) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceLoading, hasReportsAccess]);

  const selectedReport = REPORT_TYPES.find((item) => item.id === reportType);

  const sources = useMemo(
    () => [
      {
        id: "googleAds",
        label: "Google Ads",
        icon: Target,
        data: data?.googleAds,
      },
      {
        id: "metaAds",
        label: "Meta Ads",
        icon: BarChart3,
        data: data?.metaAds,
      },
      {
        id: "libraryPerformance",
        label: "Library",
        icon: Library,
        data: data?.libraryPerformance,
      },
    ],
    [data]
  );

  const chooseReport = (report) => {
    setReportType(report.id);
    setMetrics(report.defaultMetrics);

    if (report.id === "creative" || report.id === "library") {
      setProviders(
        data?.libraryPerformance?.selected ? ["libraryPerformance"] : []
      );
      setPrimarySplit(report.id === "creative" ? "creative" : "none");
      setSecondarySplit("none");
      return;
    }

    const nextProviders = [];
    if (data?.googleAds?.selected) nextProviders.push("googleAds");
    if (data?.metaAds?.selected) nextProviders.push("metaAds");
    if (report.id === "executive" || report.id === "learning") {
      if (data?.libraryPerformance?.selected) {
        nextProviders.push("libraryPerformance");
      }
    }
    setProviders(nextProviders);
    setPrimarySplit("none");
    setSecondarySplit("none");
  };

  const toggleProvider = (source) => {
    if (!source.data?.selected) return;
    setProviders((current) =>
      current.includes(source.id)
        ? current.filter((item) => item !== source.id)
        : [...current, source.id]
    );
  };

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    if (preset !== "custom" && preset !== "maximum") {
      const next = resolveDateRange(preset);
      setStartDate(next.startDate);
      setEndDate(next.endDate);
    }
    if (preset === "maximum") {
      setStartDate("");
      setEndDate("");
    }
  };

  const toggleMetric = (metric) => {
    setMetrics((current) =>
      current.includes(metric)
        ? current.filter((item) => item !== metric)
        : [...current, metric]
    );
  };

  const customDatesValid =
    datePreset !== "custom" ||
    (Boolean(startDate) && Boolean(endDate) && startDate <= endDate);

  const canDownload =
    !downloading &&
    providers.length > 0 &&
    customDatesValid &&
    (reportType === "learning" || metrics.length > 0);

  const previewOptions = useMemo(
    () => ({
      reportType,
      providers,
      metrics,
      datePreset,
      startDate,
      endDate,
      comparison,
      splits: [primarySplit, secondarySplit].filter(
        (value) => value && value !== "none"
      ),
    }),
    [
      reportType,
      providers,
      metrics,
      datePreset,
      startDate,
      endDate,
      comparison,
      primarySplit,
      secondarySplit,
    ]
  );

  useEffect(() => {
    if (
      workspaceLoading ||
      !hasReportsAccess ||
      !providers.length ||
      !customDatesValid ||
      (reportType !== "learning" && !metrics.length)
    ) {
      setPreview(null);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        setPreview(await loadReportPreview(previewOptions));
      } catch (nextError) {
        setPreviewError(nextError?.message || "Could not build the preview.");
      } finally {
        setPreviewLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    previewOptions,
    providers.length,
    customDatesValid,
    reportType,
    metrics.length,
    workspaceLoading,
    hasReportsAccess,
  ]);

  const handleDownload = async () => {
    setDownloading(true);
    setError("");

    try {
      await downloadReport(previewOptions);
    } catch (nextError) {
      setError(nextError?.message || "Could not generate your report.");
    } finally {
      setDownloading(false);
    }
  };

  const selectedDateLabel =
    DATE_PRESETS.find(([id]) => id === datePreset)?.[1] || "Reporting period";

  const selectedPrimaryLabel =
    SPLIT_OPTIONS.find(([id]) => id === primarySplit)?.[1] || "No split";

  const selectedSecondaryLabel =
    SPLIT_OPTIONS.find(([id]) => id === secondarySplit)?.[1] || "No split";

  const executiveSummary = buildExecutiveSummary(
    preview,
    selectedReport?.label || "Report",
    selectedDateLabel
  );

  return (
    <div className="reports-page">
      <header className="reports-hero">
        <div>
          <span>REPORTING WORKSPACE</span>
          <h1>Build the report. See the answer immediately.</h1>
          <p>
            Configure the report on the left and review a finished, export-ready
            report on the right.
          </p>
        </div>
        {hasReportsAccess && !workspaceLoading && (
          <button
            type="button"
            className="reports-refresh"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} /> {loading ? "Refreshing…" : "Refresh data"}
          </button>
        )}
      </header>

      {workspaceLoading ? (
        <section className="reports-access-loading" aria-live="polite">
          <RefreshCw size={18} />
          <span>Checking reporting access…</span>
        </section>
      ) : !hasReportsAccess ? (
        <ReportsUpgradeCard currentPlan={planLabel} />
      ) : (
        <>
          {error && (
            <div className="reports-alert error" role="alert">
              {error}
            </div>
          )}

          <div className="reports-workspace">
        <aside className="reports-builder">
          <section className="reports-builder-card">
            <div className="reports-builder-heading">
              <span className="reports-builder-icon">
                <BarChart3 size={16} />
              </span>
              <div>
                <strong>Report type</strong>
                <small>Choose the question this report should answer.</small>
              </div>
            </div>

            <div className="reports-type-list">
              {REPORT_TYPES.map((report) => {
                const Icon = report.icon;
                const selected = reportType === report.id;
                return (
                  <button
                    key={report.id}
                    type="button"
                    className={selected ? "selected" : ""}
                    onClick={() => chooseReport(report)}
                  >
                    <span className="reports-type-icon">
                      <Icon size={16} />
                    </span>
                    <span>
                      <strong>{report.label}</strong>
                      <small>{report.title}</small>
                    </span>
                    {selected && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="reports-builder-card">
            <div className="reports-builder-heading">
              <span className="reports-builder-icon">
                <Target size={16} />
              </span>
              <div>
                <strong>Data sources</strong>
                <small>Select the platforms included in this report.</small>
              </div>
            </div>

            <div className="reports-source-list">
              {sources.map((source) => {
                const Icon = source.icon;
                const selected = providers.includes(source.id);
                const available = Boolean(source.data?.selected);
                return (
                  <button
                    key={source.id}
                    type="button"
                    className={`${selected ? "selected" : ""} ${
                      !available ? "unavailable" : ""
                    }`}
                    onClick={() => toggleProvider(source)}
                    disabled={!available}
                  >
                    <span className="reports-source-check">
                      {selected && <Check size={13} />}
                    </span>
                    <span className="reports-source-logo">
                      <Icon size={16} />
                    </span>
                    <span>
                      <strong>{source.label}</strong>
                      <small>
                        {available
                          ? `Updated ${formatSync(source.data?.lastSyncedAt)}`
                          : "Connect or sync first"}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="reports-builder-card">
            <div className="reports-builder-heading">
              <span className="reports-builder-icon">
                <SlidersHorizontal size={16} />
              </span>
              <div>
                <strong>Report configuration</strong>
                <small>Set the reporting period, grouping, and output metrics.</small>
              </div>
            </div>

            <div className="reports-config-section">
              <div className="reports-config-title">
                <CalendarDays size={14} />
                <span>Reporting period</span>
              </div>

              <div className="reports-form-grid">
                <SelectField
                  label="Date range"
                  value={datePreset}
                  onChange={(event) => applyDatePreset(event.target.value)}
                >
                  {DATE_PRESETS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  label="Compare to"
                  value={comparison}
                  onChange={(event) => setComparison(event.target.value)}
                >
                  {COMPARISON_OPTIONS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>

              {datePreset === "custom" && (
                <div className="reports-custom-dates">
                  <label>
                    <span>Start date</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      max={endDate || undefined}
                    />
                  </label>
                  <label>
                    <span>End date</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      min={startDate || undefined}
                    />
                  </label>
                </div>
              )}

              {!customDatesValid && (
                <div className="reports-inline-error">
                  The start date must be on or before the end date.
                </div>
              )}
            </div>

            <div className="reports-config-section">
              <div className="reports-config-title">
                <BarChart3 size={14} />
                <span>Group report rows</span>
              </div>

              <div className="reports-form-grid">
                <SelectField
                  label="Primary split"
                  value={primarySplit}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPrimarySplit(value);
                    if (secondarySplit === value) setSecondarySplit("none");
                  }}
                >
                  {SPLIT_OPTIONS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  label="Secondary split"
                  value={secondarySplit}
                  onChange={(event) => setSecondarySplit(event.target.value)}
                >
                  {SPLIT_OPTIONS.filter(
                    ([id]) => id === "none" || id !== primarySplit
                  ).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            <div className="reports-config-section reports-metrics-section">
              <button
                type="button"
                className={`reports-metrics-toggle ${metricsOpen ? "open" : ""}`}
                onClick={() => setMetricsOpen((current) => !current)}
              >
                <span>
                  <strong>Metrics</strong>
                  <small>
                    {reportType === "learning"
                      ? "Learning fields are included automatically"
                      : `${metrics.length} selected`}
                  </small>
                </span>
                <ChevronDown size={16} />
              </button>

              {metricsOpen && reportType !== "learning" && (
                <div className="reports-metrics-panel">
                  {METRIC_GROUPS.map((group) => (
                    <div key={group.id} className="reports-metric-group">
                      <div className="reports-metric-group-copy">
                        <strong>{group.label}</strong>
                        <small>{group.description}</small>
                      </div>
                      <div className="reports-metric-options">
                        {group.metrics.map(([id, label]) => {
                          const selected = metrics.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              className={selected ? "selected" : ""}
                              onClick={() => toggleMetric(id)}
                            >
                              <span className="reports-metric-checkbox">
                                {selected && <Check size={12} />}
                              </span>
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="reports-builder-summary">
            <div className="reports-builder-summary-copy">
              <span>{selectedReport?.label}</span>
              <div>
                <small>{providers.length} source{providers.length === 1 ? "" : "s"}</small>
                <small>{selectedDateLabel}</small>
                <small>{reportType === "learning" ? "Automatic fields" : `${metrics.length} metrics`}</small>
              </div>
            </div>
            <button type="button" onClick={handleDownload} disabled={!canDownload}>
              <FileSpreadsheet size={17} />
              {downloading ? "Generating…" : "Generate report"}
            </button>
          </div>
        </aside>

        <main className="reports-preview-shell">
          <div className="reports-preview-toolbar">
            <div>
              <span>REPORT PREVIEW</span>
              <p>Formatted to match the generated workbook.</p>
            </div>
            <span className={`reports-preview-status ${previewLoading ? "loading" : ""}`}>
              <Eye size={14} />
              {previewLoading ? "Updating…" : "Live"}
            </span>
          </div>

          {previewError && (
            <div className="reports-alert error">{previewError}</div>
          )}

          {!preview && !previewLoading ? (
            <div className="reports-preview-empty">
              <Eye size={28} />
              <strong>Your report preview will appear here.</strong>
              <p>Select at least one available source and metric.</p>
            </div>
          ) : (
            <article className={`reports-document ${previewLoading ? "is-loading" : ""}`}>
              <header className="reports-document-header">
                <div>
                  <span>ADGen MCM REPORT</span>
                  <h2>{selectedReport?.label}</h2>
                  <p>{selectedDateLabel}</p>
                </div>
                <div className="reports-document-meta">
                  <small>Sources</small>
                  <strong>{providers.length}</strong>
                </div>
              </header>

              <section className="reports-document-summary">
                <span>Executive summary</span>
                <p>{executiveSummary}</p>
              </section>

              <section className="reports-document-details">
                <div>
                  <small>Primary split</small>
                  <strong>{selectedPrimaryLabel}</strong>
                </div>
                <div>
                  <small>Secondary split</small>
                  <strong>{selectedSecondaryLabel}</strong>
                </div>
                <div>
                  <small>Comparison</small>
                  <strong>
                    {COMPARISON_OPTIONS.find(([id]) => id === comparison)?.[1] || "No comparison"}
                  </strong>
                </div>
              </section>

              <section className="reports-document-kpis">
                {Object.entries(preview?.totals || {})
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <div key={key}>
                      <small>{METRIC_LABELS.get(key) || key}</small>
                      <strong>{formatMetric(key, value)}</strong>
                    </div>
                  ))}
              </section>

              {(preview?.notices || []).map((notice) => (
                <div key={notice} className="reports-preview-notice">
                  <Info size={15} />
                  <span>{notice}</span>
                </div>
              ))}

              <section className="reports-preview-table-wrap">
                <div className="reports-preview-table-head">
                  <div>
                    <strong>Performance detail</strong>
                    <small>
                      Showing up to 10 rows · {preview?.sourceRowCount || 0} source rows analyzed
                    </small>
                  </div>
                  <span>{preview?.rows?.length || 0} rows</span>
                </div>

                <div className="reports-preview-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {(preview?.columns || []).map((column) => (
                          <th key={column}>
                            {METRIC_LABELS.get(column) ||
                              column
                                .replace(/_/g, " ")
                                .replace(/([A-Z])/g, " $1")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(preview?.rows || []).slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          {(preview?.columns || []).map((column) => (
                            <td key={column}>
                              {typeof row[column] === "number"
                                ? formatMetric(column, row[column])
                                : row[column] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </article>
          )}
        </main>
          </div>
        </>
      )}
    </div>
  );
}
