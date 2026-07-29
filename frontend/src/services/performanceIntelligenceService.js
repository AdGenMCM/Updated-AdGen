import { auth } from "../firebaseConfig";

const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000"
).trim();

async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in.");
  return user.getIdToken(true);
}

async function request(path, options = {}) {
  const token = await getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const detail = typeof payload?.detail === "string"
      ? payload.detail
      : payload?.detail?.message || payload?.message || "Performance Intelligence request failed.";
    throw new Error(detail);
  }
  return payload;
}

export function getPerformanceIntelligence() {
  return request("/performance-intelligence");
}

export function getGenerationProfile() {
  return request("/performance-intelligence/generation-profile");
}

export function getPerformanceRefreshStatus() {
  return request("/performance-intelligence/refresh-status");
}

export function getLearningTimeline(limit = 25) {
  return request(`/performance-intelligence/learning-timeline?limit=${encodeURIComponent(limit)}`);
}

export function recalculatePerformanceIntelligence() {
  return request("/performance-intelligence/recalculate", { method: "POST" });
}

export function rebuildPerformanceIntelligence({
  includeManual = true,
  includeGoogleAds = true,
  includeMetaAds = true,
  googleDateRange = "MAXIMUM",
  googleStartDate = null,
  googleEndDate = null,
  metaDateRange = "MAXIMUM",
  metaStartDate = null,
  metaEndDate = null,
  syncSources = true,
  analyzeMedia = false,
} = {}) {
  return request("/performance-intelligence/rebuild", {
    method: "POST",
    body: JSON.stringify({
      include_manual: includeManual,
      include_google_ads: includeGoogleAds,
      include_meta_ads: includeMetaAds,
      google_date_range: googleDateRange,
      google_start_date: googleStartDate,
      google_end_date: googleEndDate,
      meta_date_range: metaDateRange,
      meta_start_date: metaStartDate,
      meta_end_date: metaEndDate,
      sync_sources: syncSources,
      analyze_media: analyzeMedia,
    }),
  });
}

async function download(path, payload, fallbackName) {
  const token = await getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) {
    let detail = "Could not generate the performance report.";
    try {
      const body = await response.json();
      detail = typeof body?.detail === "string" ? body.detail : detail;
    } catch { /* use fallback */ }
    throw new Error(detail);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export function downloadPerformanceReport(payload = {}) {
  return download(
    "/performance-intelligence/report/export.xlsx",
    payload,
    "ADGen_Performance_Report.xlsx"
  );
}

export function downloadPerformanceCsvReport(payload = {}) {
  return download(
    "/performance-intelligence/report/export.csv",
    payload,
    "ADGen_Performance_Report.zip"
  );
}
