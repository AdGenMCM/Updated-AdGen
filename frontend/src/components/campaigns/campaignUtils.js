export const EMPTY_CAMPAIGN_FORM = {
  name: "",
  brand_id: "",
  objective: "sales",
  budget_type: "daily",
  budget: "",
  start_at: "",
  end_at: "",
  description: "",
};

export const EMPTY_LINE_ITEM_FORM = {
  name: "",
  billing_model: "cpm",
  budget_type: "lifetime",
  budget_amount: "",
  bid_amount: "",
  start_at: "",
  end_at: "",
  channels: [],
  frequency_cap_key: "none",
};

export const EMPTY_ASSET_FORM = {
  name: "",
  file: null,
  alt_text: "",
  click_through_url: "",
  tracking_pixel_1: "",
  tracking_pixel_2: "",
  status: "active",
};

export const CHANNEL_OPTIONS = [
  ["web", "Web"],
  ["email", "Email"],
  ["mobile_app", "Mobile App"],
];

export const CHANNEL_LABELS = Object.fromEntries(CHANNEL_OPTIONS);

export const FREQUENCY_CAP_OPTIONS = [
  { value: "none", label: "No frequency cap", count: null, window: null },
  { value: "1_day", label: "1 impression per day", count: 1, window: "day" },
  { value: "2_day", label: "2 impressions per day", count: 2, window: "day" },
  { value: "3_day", label: "3 impressions per day", count: 3, window: "day" },
  {
    value: "1_7_days",
    label: "1 impression every 7 days",
    count: 1,
    window: "7_days",
  },
  {
    value: "2_7_days",
    label: "2 impressions every 7 days",
    count: 2,
    window: "7_days",
  },
  {
    value: "3_7_days",
    label: "3 impressions every 7 days",
    count: 3,
    window: "7_days",
  },
];

export const OBJECTIVE_LABELS = {
  awareness: "Awareness",
  traffic: "Traffic",
  engagement: "Engagement",
  leads: "Leads",
  sales: "Sales",
  app_installs: "App installs",
  other: "Other",
};

export async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export function formatDate(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCurrency(value, currency = "USD") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function calculateStatus(startAt, endAt, currentStatus = "") {
  if (["paused", "archived"].includes(currentStatus)) return currentStatus;
  const now = new Date();
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (now < start) return "scheduled";
  if (now > end) return "completed";
  return "active";
}

export function frequencyKeyFromValues(count, window) {
  if (!count || !window) return "none";
  return `${count}_${window}`;
}

export function frequencyValuesFromKey(key) {
  return (
    FREQUENCY_CAP_OPTIONS.find((option) => option.value === key) ||
    FREQUENCY_CAP_OPTIONS[0]
  );
}

export function formatFrequencyCap(count, window) {
  const option = FREQUENCY_CAP_OPTIONS.find(
    (entry) => entry.count === count && entry.window === window,
  );
  return option?.label || "No frequency cap";
}
