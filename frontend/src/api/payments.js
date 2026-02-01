// src/api/payments.js

const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:4242";

export async function createCheckoutSession({ uid, email, tier }) {
  const res = await fetch(`${API_BASE}/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, email, tier }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { url }
}

export async function createPortalSession(customerId) {
  const res = await fetch(`${API_BASE}/create-portal-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: customerId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { url }
}

export async function syncSubscription({ uid, sessionId, customerId }) {
  const url = new URL(`${API_BASE}/sync-subscription`);
  url.searchParams.set("uid", uid);
  if (sessionId) url.searchParams.set("session_id", sessionId);
  if (customerId) url.searchParams.set("customer_id", customerId);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { ok, status, ... }
}



