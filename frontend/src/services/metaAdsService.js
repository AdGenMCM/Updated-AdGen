import { auth } from "../firebaseConfig";

const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000"
).trim();

async function token() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in.");
  return user.getIdToken(true);
}

async function request(path, options = {}) {
  const idToken = await token();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : body?.detail?.error?.message ||
          body?.detail?.message ||
          "Meta Ads request failed.";

    throw new Error(detail);
  }

  return body;
}

export function getMetaAdsStatus() {
  return request("/integrations/meta-ads/status");
}

export async function connectMetaAds() {
  const result = await request(
    "/integrations/meta-ads/oauth/start",
    { method: "POST" }
  );

  if (!result.authorizationUrl) {
    throw new Error("Meta did not return an authorization URL.");
  }

  window.location.assign(result.authorizationUrl);
}

export function disconnectMetaAds() {
  return request("/integrations/meta-ads/connection", {
    method: "DELETE",
  });
}

export function listMetaAdsAccounts() {
  return request("/integrations/meta-ads/accounts");
}

export function selectMetaAdsAccount(account) {
  return request("/integrations/meta-ads/account", {
    method: "POST",
    body: JSON.stringify({
      adAccountId: account.adAccountId,
      adAccountName: account.name || null,
      businessId: account.businessId || null,
      businessName: account.businessName || null,
    }),
  });
}


export function syncMetaAds(dateRange = "LAST_30_DAYS") {
  const range = encodeURIComponent(dateRange);
  return request(`/integrations/meta-ads/sync?date_range=${range}`, {
    method: "POST",
  });
}


export function syncMetaAdsCreatives(dateRange = "LAST_30_DAYS") {
  const range = encodeURIComponent(dateRange);
  return request(`/integrations/meta-ads/creative-sync?date_range=${range}`, {
    method: "POST",
  });
}

export function getMetaAdsCreatives(limit = 500) {
  return request(`/integrations/meta-ads/creatives?limit=${encodeURIComponent(limit)}`);
}
