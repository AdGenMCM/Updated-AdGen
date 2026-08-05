// src/api/payments.js

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const API_BASE =
  (process.env.REACT_APP_API_BASE_URL || "").trim() ||
  (isLocalhost
    ? "http://localhost:4242"
    : "https://updated-adgen-1.onrender.com");

async function fetchWithStripeFallback(path, options) {
  let response = await fetch(`${API_BASE}${path}`, options);

  if (response.status === 404) {
    response = await fetch(`${API_BASE}/stripe${path}`, options);
  }

  return response;
}

async function readError(response) {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text);
    const detail = parsed?.detail;

    if (detail) {
      if (typeof detail === "string") return detail;
      return detail?.message || JSON.stringify(detail);
    }

    if (parsed?.error) return parsed.error;
    return JSON.stringify(parsed);
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

function authenticatedHeaders(token, includeJson = false) {
  if (!token) {
    throw new Error("A valid sign-in token is required.");
  }

  return {
    Authorization: `Bearer ${token}`,
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

export async function createCheckoutSession({
  email,
  tier,
  token,
}) {
  const response = await fetchWithStripeFallback(
    "/create-checkout-session",
    {
      method: "POST",
      headers: authenticatedHeaders(token, true),
      credentials: "include",
      body: JSON.stringify({ email, tier }),
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function createPortalSession(token) {
  const response = await fetchWithStripeFallback(
    "/create-portal-session",
    {
      method: "POST",
      headers: authenticatedHeaders(token),
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function syncSubscription({
  sessionId,
  token,
} = {}) {
  const url = new URL(`${API_BASE}/sync-subscription`);

  if (sessionId) {
    url.searchParams.set("session_id", sessionId);
  }

  let response = await fetch(url.toString(), {
    method: "GET",
    headers: authenticatedHeaders(token),
    credentials: "include",
  });

  if (response.status === 404) {
    const fallbackUrl = new URL(
      `${API_BASE}/stripe/sync-subscription`
    );

    if (sessionId) {
      fallbackUrl.searchParams.set("session_id", sessionId);
    }

    response = await fetch(fallbackUrl.toString(), {
      method: "GET",
      headers: authenticatedHeaders(token),
      credentials: "include",
    });
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}
