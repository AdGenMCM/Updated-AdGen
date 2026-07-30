from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from .date_ranges import comparison_window, parse_row_date, resolve_window
from .metrics import METRICS, aggregate

SOURCE_KEYS = {
    "googleAds": "googleAds",
    "metaAds": "metaAds",
    "libraryPerformance": "libraryPerformance",
}
TIME_SPLITS = {"day", "week", "month", "quarter", "year"}
NON_TIME_SPLITS = {
    "platform",
    "campaign",
    "ad_group",
    "creative",
    "device",
    "country",
    "placement",
}
SUPPORTED_SPLITS = TIME_SPLITS | NON_TIME_SPLITS


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

    values = {
        "platform": (
            row.get("providerLabel")
            or row.get("platform")
            or row.get("provider")
            or "Unknown"
        ),
        "campaign": (
            row.get("campaignName")
            or row.get("name")
            or "Untitled campaign"
        ),
        "ad_group": (
            row.get("adGroupName")
            or row.get("adSetName")
            or row.get("adsetName")
            or "Not available"
        ),
        "creative": (
            row.get("creativeName")
            or row.get("adName")
            or row.get("title")
            or "Not available"
        ),
        "device": row.get("device") or "Not available",
        "country": row.get("country") or "Not available",
        "placement": row.get("placement") or "Not available",
    }
    return str(values.get(split, "All"))


def _requires_daily_rows(
    date_preset: str,
    comparison: str,
    splits: list[str],
) -> bool:
    return (
        date_preset.lower() != "maximum"
        or comparison != "none"
        or any(split in TIME_SPLITS for split in splits)
    )


def _can_fallback_to_campaign_snapshot(splits: list[str]) -> bool:
    return not any(split in TIME_SPLITS for split in splits)


def _source_rows(
    snapshot: dict[str, Any],
    providers: list[str],
    *,
    needs_daily: bool,
    allow_snapshot_fallback: bool,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    rows: list[dict[str, Any]] = []
    missing_daily: list[str] = []
    fallback_sources: list[str] = []

    for key in providers:
        payload = snapshot.get(SOURCE_KEYS.get(key, key)) or {}

        if key == "libraryPerformance":
            rows.extend(payload.get("creatives") or [])
            continue

        if needs_daily:
            daily = payload.get("dailyCampaignPerformance") or []
            if daily:
                rows.extend(daily)
                continue

            source_label = payload.get("accountName") or key
            missing_daily.append(source_label)

            if allow_snapshot_fallback:
                campaign_rows = payload.get("campaigns") or []
                if campaign_rows:
                    rows.extend(campaign_rows)
                    fallback_sources.append(source_label)
            continue

        rows.extend(payload.get("campaigns") or [])

    return rows, missing_daily, fallback_sources


def _filter(
    rows: list[dict[str, Any]],
    window,
    *,
    allow_undated_rows: bool = False,
) -> list[dict[str, Any]]:
    if not window.start or not window.end:
        return rows

    result: list[dict[str, Any]] = []
    for row in rows:
        parsed = parse_row_date(row)
        if parsed and window.start <= parsed <= window.end:
            result.append(row)
        elif allow_undated_rows and parsed is None:
            result.append(row)
    return result


def _group(
    rows: list[dict[str, Any]],
    splits: list[str],
    metrics: list[str],
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)

    for row in rows:
        key = tuple(_split_value(row, split) for split in splits)
        grouped[key].append(row)

    result: list[dict[str, Any]] = []
    for key, group in grouped.items():
        totals = aggregate(group)
        item: dict[str, Any] = {"rowCount": len(group)}

        for index, split in enumerate(splits):
            item[split] = key[index]

        item.update(
            {
                metric: totals.get(metric, 0)
                for metric in metrics
                if metric in METRICS
            }
        )
        result.append(item)

    result.sort(
        key=lambda row: tuple(
            str(row.get(split, "")).lower()
            for split in splits
        )
    )
    return result


def _comparison_values(
    current: dict[str, Any],
    previous: dict[str, Any],
    metrics: list[str],
) -> dict[str, Any]:
    output: dict[str, Any] = {}

    for metric in metrics:
        if metric not in METRICS:
            continue

        current_value = float(current.get(metric) or 0)
        previous_value = float(previous.get(metric) or 0)

        output[f"{metric}Comparison"] = previous_value
        output[f"{metric}Change"] = current_value - previous_value
        output[f"{metric}ChangePercent"] = (
            ((current_value - previous_value) / previous_value) * 100
            if previous_value
            else None
        )

    return output


def _dimension_has_values(
    rows: list[dict[str, Any]],
    split: str,
) -> bool:
    if split in TIME_SPLITS:
        return any(parse_row_date(row) is not None for row in rows)

    for row in rows:
        value = _split_value(row, split)
        if value not in {
            "",
            "All",
            "Unknown",
            "Not available",
            "Date not available",
        }:
            return True

    return False


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

    clean_splits = [
        split
        for split in splits
        if split and split != "none" and split in SUPPORTED_SPLITS
    ][:2]

    if not clean_splits:
        if report_type == "campaign":
            clean_splits = ["campaign"]
        elif report_type in {"creative", "library"}:
            clean_splits = ["creative"]
        else:
            clean_splits = ["platform"]

    needs_daily = _requires_daily_rows(
        date_preset,
        comparison,
        clean_splits,
    )
    allow_snapshot_fallback = _can_fallback_to_campaign_snapshot(
        clean_splits
    )

    source_rows, missing_daily, fallback_sources = _source_rows(
        snapshot,
        providers,
        needs_daily=needs_daily,
        allow_snapshot_fallback=allow_snapshot_fallback,
    )

    using_fallback = bool(fallback_sources)
    filtered = _filter(
        source_rows,
        window,
        allow_undated_rows=using_fallback,
    )

    comparison_rows = (
        _filter(source_rows, compare_window)
        if compare_window and not using_fallback
        else []
    )

    notices: list[str] = []

    if fallback_sources:
        notices.append(
            "Daily history is not available for: "
            + ", ".join(fallback_sources)
            + ". This preview is using the latest stored campaign snapshot, "
              "so the selected date range and comparison cannot be applied "
              "precisely until those sources are refreshed."
        )
    elif missing_daily:
        notices.append(
            "Daily history is not available for: "
            + ", ".join(missing_daily)
            + ". Refresh those providers once to populate date-segmented "
              "reporting data."
        )

    if (
        needs_daily
        and not source_rows
        and any(
            provider != "libraryPerformance"
            for provider in providers
        )
    ):
        notices.append(
            "No date-segmented provider rows are stored for the selected "
            "sources and period."
        )

    unavailable_splits = [
        split
        for split in clean_splits
        if not _dimension_has_values(filtered, split)
    ]
    if unavailable_splits:
        readable = ", ".join(
            split.replace("_", " ").title()
            for split in unavailable_splits
        )
        notices.append(
            f"{readable} data is not available for the selected sources. "
            "Rows may be grouped under ‘Not available’ until that dimension "
            "is collected during provider sync."
        )

    result = _group(filtered, clean_splits, metrics)
    totals = aggregate(filtered)

    comparison_totals = (
        aggregate(comparison_rows)
        if compare_window and comparison_rows
        else {}
    )
    comparison_summary = (
        _comparison_values(totals, comparison_totals, metrics)
        if compare_window and comparison_rows
        else {}
    )

    sheets = [
        {
            "id": "executive_summary",
            "name": "Executive Summary",
            "description": (
                "Reporting period, sources, totals, comparison, and data notes."
            ),
            "rowCount": 1,
        },
        {
            "id": "performance",
            "name": "Performance",
            "description": (
                "Selected metrics organized by your report splits."
            ),
            "rowCount": len(result),
        },
    ]

    if "libraryPerformance" in providers:
        sheets.append(
            {
                "id": "library",
                "name": "Library Performance",
                "description": (
                    "Manual performance recorded on ADGen Library assets."
                ),
                "rowCount": len(
                    snapshot
                    .get("libraryPerformance", {})
                    .get("creatives", [])
                ),
            }
        )

    return {
        "reportType": report_type,
        "dateRange": {
            "preset": date_preset,
            "label": window.label,
            "startDate": (
                window.start.isoformat()
                if window.start
                else None
            ),
            "endDate": (
                window.end.isoformat()
                if window.end
                else None
            ),
        },
        "comparison": {
            "type": comparison,
            "label": (
                compare_window.label
                if compare_window
                else None
            ),
            "totals": {
                metric: comparison_totals.get(metric, 0)
                for metric in metrics
                if metric in METRICS
            },
            "changes": comparison_summary,
        },
        "providers": providers,
        "metrics": metrics,
        "splits": clean_splits,
        "totals": {
            metric: totals.get(metric, 0)
            for metric in metrics
            if metric in METRICS
        },
        "columns": [
            *clean_splits,
            *[
                metric
                for metric in metrics
                if metric in METRICS
            ],
        ],
        "rows": result,
        "sheets": sheets,
        "notices": notices,
        "sourceRowCount": len(filtered),
        "comparisonSourceRowCount": len(comparison_rows),
        "usedSnapshotFallback": using_fallback,
    }
