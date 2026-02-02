// src/api/payments.js

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const API_BASE =
  (process.env.REACT_APP_API_BASE_URL || "").trim() ||
  (isLocalhost ? "http://localhost:4242" : "https://updated-adgen.onrender.com");

// Helper: try endpoint at root first, then /stripe if 404
async function fetchWithStripeFallback(path, options) {
  let res = await fetch(`${API_BASE}${path}`, options);
  if (res.status === 404) {
    res = await fetch(`${API_BASE}/stripe${path}`, options);
  }
  return res;
}

async function readError(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    if (j?.detail) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    if (j?.error) return j.error;
    return JSON.stringify(j);
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

export async function createCheckoutSession({ uid, email, tier }) {
  const res = await fetchWithStripeFallback(`/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ uid, email, tier }),
  });

  if (!res.ok) throw new Error(await readError(res));
  return res.json(); // { url }
}

export async function createPortalSession(customerId) {
  const res = await fetchWithStripeFallback(`/create-portal-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ customer_id: customerId }),
  });

  if (!res.ok) throw new Error(await readError(res));
  return res.json(); // { url }
}

export async function syncSubscription({ uid, sessionId, customerId }) {
  const url = new URL(`${API_BASE}/sync-subscription`);
  url.searchParams.set("uid", uid);
  if (sessionId) url.searchParams.set("session_id", sessionId);
  if (customerId) url.searchParams.set("customer_id", customerId);

  let res = await fetch(url.toString(), { method: "GET", credentials: "include" });

  if (res.status === 404) {
    const url2 = new URL(`${API_BASE}/stripe/sync-subscription`);
    url2.searchParams.set("uid", uid);
    if (sessionId) url2.searchParams.set("session_id", sessionId);
    if (customerId) url2.searchParams.set("customer_id", customerId);
    res = await fetch(url2.toString(), { method: "GET", credentials: "include" });
  }

  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}






