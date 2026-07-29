from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from .date_ranges import comparison_window, parse_row_date, resolve_window
from .metrics import METRICS, aggregate

SOURCE_KEYS = {"googleAds": "googleAds", "metaAds": "metaAds", "libraryPerformance": "libraryPerformance"}
TIME_SPLITS = {"day", "week", "month", "quarter", "year"}


def _period(d: date, split: str) -> str:
    if split == "day":
        return d.isoformat()
    if split == "week":
        monday = d.fromordinal(d.toordinal() - d.weekday())
        sunday = d.fromordinal(monday.toordinal() + 6)
        return f"{monday:%b %d} – {sunday:%b %d, %Y}"
    if split == "month":
        return d.strftime("%B %Y")
    if split == "quarter":
        return f"Q{((d.month - 1) // 3) + 1} {d.year}"
    return str(d.year)


def _split_value(row: dict[str, Any], split: str) -> str:
    if split in TIME_SPLITS:
        parsed = parse_row_date(row)
        return _period(parsed, split) if parsed else "Date not available"
    return {
        "platform": row.get("providerLabel") or row.get("platform") or "Unknown",
        "campaign": row.get("campaignName") or "Untitled campaign",
        "ad_group": row.get("adGroupName") or "Not available",
        "creative": row.get("creativeName") or "Not available",
        "device": row.get("device") or "Not available",
        "country": row.get("country") or "Not available",
        "placement": row.get("placement") or "Not available",
    }.get(split, "All")


def _needs_daily(date_preset: str, comparison: str, splits: list[str]) -> bool:
    return (
        date_preset.lower() != "maximum"
        or comparison != "none"
        or any(split in TIME_SPLITS for split in splits)
    )


def _source_rows(snapshot: dict[str, Any], providers: list[str], *, needs_daily: bool) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    missing_daily: list[str] = []
    for key in providers:
        payload = snapshot.get(SOURCE_KEYS.get(key, key)) or {}
        if key == "libraryPerformance":
            rows.extend(payload.get("creatives") or [])
            continue
        if needs_daily:
            daily = payload.get("dailyCampaignPerformance") or []
            if not daily:
                missing_daily.append(payload.get("accountName") or key)
            rows.extend(daily)
        else:
            rows.extend(payload.get("campaigns") or [])
    return rows, missing_daily


def _filter(rows: list[dict[str, Any]], window) -> list[dict[str, Any]]:
    if not window.start or not window.end:
        return rows
    result = []
    for row in rows:
        parsed = parse_row_date(row)
        if parsed and window.start <= parsed <= window.end:
            result.append(row)
    return result


def _group(rows: list[dict[str, Any]], splits: list[str], metrics: list[str]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[tuple(_split_value(row, split) for split in splits)].append(row)

    result: list[dict[str, Any]] = []
    for key, group in grouped.items():
        totals = aggregate(group)
        item: dict[str, Any] = {"rowCount": len(group)}
        for index, split in enumerate(splits):
            item[split] = key[index]
        item.update({metric: totals.get(metric, 0) for metric in metrics if metric in METRICS})
        result.append(item)
    result.sort(key=lambda row: tuple(str(row.get(split, "")) for split in splits))
    return result


def _comparison_values(current: dict[str, Any], previous: dict[str, Any], metrics: list[str]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for metric in metrics:
        if metric not in METRICS:
            continue
        current_value = float(current.get(metric) or 0)
        previous_value = float(previous.get(metric) or 0)
        output[f"{metric}Comparison"] = previous_value
        output[f"{metric}Change"] = current_value - previous_value
        output[f"{metric}ChangePercent"] = ((current_value - previous_value) / previous_value * 100) if previous_value else None
    return output


def build_report(
    snapshot: dict[str, Any],
    *,
    report_type: str,
    providers: list[str],
    metrics: list[str],
    date_preset: str,
    start_date: str | None,
    end_date: str | None,
    comparison: str,
    splits: list[str],
) -> dict[str, Any]:
    window = resolve_window(date_preset, start_date, end_date)
    compare_window = comparison_window(window, comparison)
    clean_splits = [split for split in splits if split and split != "none"][:2]
    if not clean_splits:
        if report_type == "campaign":
            clean_splits = ["campaign"]
        elif report_type in {"creative", "library"}:
            clean_splits = ["creative"]
        else:
            clean_splits = ["platform"]

    needs_daily = _needs_daily(date_preset, comparison, clean_splits)
    source_rows, missing_daily = _source_rows(snapshot, providers, needs_daily=needs_daily)
    filtered = _filter(source_rows, window)
    comparison_rows = _filter(source_rows, compare_window) if compare_window else []

    notices: list[str] = []
    if missing_daily:
        notices.append(
            "Daily history is not available for: " + ", ".join(missing_daily) +
            ". Refresh those providers once to populate date-segmented reporting data."
        )
    if needs_daily and not source_rows and any(provider != "libraryPerformance" for provider in providers):
        notices.append("No date-segmented provider rows are stored for the selected sources and period.")

    result = _group(filtered, clean_splits, metrics)
    totals = aggregate(filtered)
    comparison_totals = aggregate(comparison_rows) if compare_window else {}
    comparison_summary = _comparison_values(totals, comparison_totals, metrics) if compare_window else {}

    sheets = [
        {"id": "executive_summary", "name": "Executive Summary", "description": "Reporting period, sources, totals, comparison, and data notes.", "rowCount": 1},
        {"id": "performance", "name": "Performance", "description": "Selected metrics organized by your report splits.", "rowCount": len(result)},
    ]
    if "libraryPerformance" in providers:
        sheets.append({"id": "library", "name": "Library Performance", "description": "Manual performance recorded on ADGen Library assets.", "rowCount": len(snapshot.get("libraryPerformance", {}).get("creatives", []))})

    return {
        "reportType": report_type,
        "dateRange": {
            "preset": date_preset,
            "label": window.label,
            "startDate": window.start.isoformat() if window.start else None,
            "endDate": window.end.isoformat() if window.end else None,
        },
        "comparison": {
            "type": comparison,
            "label": compare_window.label if compare_window else None,
            "totals": {metric: comparison_totals.get(metric, 0) for metric in metrics if metric in METRICS},
            "changes": comparison_summary,
        },
        "providers": providers,
        "metrics": metrics,
        "splits": clean_splits,
        "totals": {metric: totals.get(metric, 0) for metric in metrics if metric in METRICS},
        "columns": [*clean_splits, *[metric for metric in metrics if metric in METRICS]],
        "rows": result,
        "sheets": sheets,
        "notices": notices,
        "sourceRowCount": len(filtered),
        "comparisonSourceRowCount": len(comparison_rows),
    }
