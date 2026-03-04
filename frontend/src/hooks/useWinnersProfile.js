// src/hooks/useWinnersProfile.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

const safeDetailMessage = (detail) => {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (typeof detail === "object") return detail.message || detail.error || JSON.stringify(detail);
  return String(detail);
};

const compactGuidanceFromProfile = (profile) => {
  if (!profile || typeof profile !== "object") return "";
  const parts = [
    profile.top_platform ? `Platform: ${profile.top_platform}` : null,
    profile.top_ratio ? `Ratio: ${profile.top_ratio}` : null,
    profile.top_tone ? `Tone: ${profile.top_tone}` : null,
  ].filter(Boolean);

  return parts.join(" • ");
};

/**
 * Shared hook to power "Use My Winners" across pages.
 *
 * @param {Object} params
 * @param {"image"|"video"|null} params.kind
 * @param {boolean} params.enabled - whether to fetch winners
 * @param {string} params.apiBase - API base URL (required)
 * @param {number} [params.limit=200]
 * @param {number} [params.minSpend=0]
 */
export function useWinnersProfile({ kind, enabled, apiBase, limit = 200, minSpend = 0 }) {
  const [winnersProfile, setWinnersProfile] = useState(null);
  const [winnerGuidance, setWinnerGuidance] = useState("");
  const [winnersLoading, setWinnersLoading] = useState(false);
  const [winnersError, setWinnersError] = useState(null);

  const url = useMemo(() => {
    if (!apiBase) return null;
    const k = kind ? `kind=${encodeURIComponent(kind)}` : "";
    const l = `limit=${encodeURIComponent(limit)}`;
    const m = `min_spend=${encodeURIComponent(minSpend)}`;
    const qs = [k, l, m].filter(Boolean).join("&");
    return `${apiBase}/winners/profile?${qs}`;
  }, [apiBase, kind, limit, minSpend]);

  const refreshWinners = useCallback(async () => {
    if (!url) throw new Error("Config error: API URL is missing. App must be rebuilt.");

    const user = auth.currentUser;
    if (!user) throw new Error("You must be logged in.");

    const token = await user.getIdToken(true);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await safeJson(res);

    if (!res.ok) {
      const msg =
        safeDetailMessage(data?.detail) ||
        `Winners profile request failed (${res.status})`;
      throw new Error(msg);
    }

    const profile = data?.profile || null;
    setWinnersProfile(profile);
    const g = compactGuidanceFromProfile(profile);
    setWinnerGuidance(g);

    return profile;
  }, [url]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setWinnersError(null);

      if (!enabled) {
        setWinnersProfile(null);
        setWinnerGuidance("");
        setWinnersLoading(false);
        return;
      }

      setWinnersLoading(true);
      try {
        await refreshWinners();
      } catch (e) {
        if (!cancelled) {
          setWinnersError(e?.message || "Failed to load winners.");
          setWinnersProfile(null);
          setWinnerGuidance("");
        }
      } finally {
        if (!cancelled) setWinnersLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshWinners]);

  return {
    winnersProfile,
    winnerGuidance,
    winnersLoading,
    winnersError,
    refreshWinners,
  };
}