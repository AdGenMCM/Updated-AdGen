import { auth } from "../firebaseConfig";

const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "http://localhost:8000"
).trim();

async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in.");
  return user.getIdToken();
}

function readableError(detail, fallback) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || "Invalid request")
      .join(" ");
  }
  if (detail && typeof detail === "object") {
    return detail.msg || detail.message || fallback;
  }
  return fallback;
}

export async function loadReportingStatus() {
  const response = await fetch(`${API_BASE}/reports/status`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      readableError(data?.detail, "Could not load your report data.")
    );
  }

  return data;
}


function reportQuery({
  reportType, providers, metrics, datePreset, startDate, endDate, comparison, splits = [],
}) {
  const query = new URLSearchParams({
    report_type: reportType,
    providers: providers.join(","),
    metrics: metrics.join(","),
    date_preset: datePreset || "maximum",
    comparison: comparison || "none",
    splits: splits.join(","),
  });
  if (startDate) query.set("start_date", startDate);
  if (endDate) query.set("end_date", endDate);
  return query;
}

export async function loadReportPreview(options) {
  const response = await fetch(`${API_BASE}/reports/preview?${reportQuery(options).toString()}`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readableError(data?.detail, "Could not build the report preview."));
  }
  return data;
}

export async function downloadReport({
  reportType,
  providers,
  metrics,
  datePreset,
  startDate,
  endDate,
  comparison,
  splits = [],
}) {
  const query = reportQuery({ reportType, providers, metrics, datePreset, startDate, endDate, comparison, splits });

  const response = await fetch(
    `${API_BASE}/reports/export.xlsx?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${await getToken()}` },
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      readableError(data?.detail, "Could not generate your report.")
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ADGen_Performance_Report.xlsx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
