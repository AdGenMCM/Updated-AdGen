import { auth } from "../firebaseConfig";

const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000"
).trim();

async function getToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be logged in.");
  }
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
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(
      payload?.detail ||
        payload?.message ||
        "Performance Intelligence request failed."
    );
  }

  return payload;
}

export function getPerformanceIntelligence() {
  return request("/performance-intelligence");
}

export function getGenerationProfile() {
  return request("/performance-intelligence/generation-profile");
}

export function recalculatePerformanceIntelligence() {
  return request("/performance-intelligence/recalculate", {
    method: "POST",
  });
}

export function rebuildPerformanceIntelligence({
  includeManual = true,
  includeGoogleAds = true,
  googleDateRange = "LAST_30_DAYS",
  analyzeMedia = false,
} = {}) {
  return request("/performance-intelligence/rebuild", {
    method: "POST",
    body: JSON.stringify({
      include_manual: includeManual,
      include_google_ads: includeGoogleAds,
      google_date_range: googleDateRange,
      analyze_media: analyzeMedia,
    }),
  });
}
