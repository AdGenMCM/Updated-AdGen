export const AD_DATA_FRESHNESS_MS = 15 * 60 * 1000;

export function syncTimestampMs(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isAdDataStale(value, freshnessMs = AD_DATA_FRESHNESS_MS) {
  const timestamp = syncTimestampMs(value);
  if (!timestamp) return true;
  return Date.now() - timestamp >= freshnessMs;
}

export function freshnessLabel(value, freshnessMs = AD_DATA_FRESHNESS_MS) {
  if (!value) return "Not synced yet";
  return isAdDataStale(value, freshnessMs) ? "Refresh recommended" : "Current";
}
