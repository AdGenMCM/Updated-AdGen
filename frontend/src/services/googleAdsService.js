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
          "Google Ads request failed.";
    throw new Error(detail);
  }

  return body;
}

export function getGoogleAdsStatus() {
  return request("/integrations/google-ads/status");
}

export async function connectGoogleAds() {
  const result = await request(
    "/integrations/google-ads/oauth/start",
    { method: "POST" }
  );

  if (!result.authorizationUrl) {
    throw new Error("Google did not return an authorization URL.");
  }

  window.location.assign(result.authorizationUrl);
}

export function disconnectGoogleAds() {
  return request("/integrations/google-ads/connection", {
    method: "DELETE",
  });
}

export function listGoogleAdsCustomers() {
  return request("/integrations/google-ads/customers");
}

export function selectGoogleAdsCustomer(customer) {
  return request("/integrations/google-ads/customer", {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.customerId,
      customerName: customer.name || null,
      loginCustomerId: customer.loginCustomerId || null,
      manager: Boolean(customer.manager),
    }),
  });
}

export function syncGoogleAds(dateRange = "LAST_30_DAYS") {
  const range = encodeURIComponent(dateRange);
  return request(`/integrations/google-ads/sync?date_range=${range}`, {
    method: "POST",
  });
}


export function getGoogleAdsAssets(dateRange = "LAST_30_DAYS") {
  const range = encodeURIComponent(dateRange);
  return request(`/integrations/google-ads/assets?date_range=${range}`);
}
