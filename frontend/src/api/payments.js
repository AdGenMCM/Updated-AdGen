// src/api/payments.js
export async function createCheckoutSession({ uid, email }) {
  const res = await fetch("http://localhost:4242/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, email }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { url }
}

export async function createPortalSession(customerId) {
  const res = await fetch("http://localhost:4242/create-portal-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: customerId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { url }
}

export async function syncSubscription({ uid, sessionId, customerId }) {
  const url = new URL("http://localhost:4242/sync-subscription");
  url.searchParams.set("uid", uid);
  if (sessionId) url.searchParams.set("session_id", sessionId);
  if (customerId) url.searchParams.set("customer_id", customerId);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { ok, status, ... }
}



