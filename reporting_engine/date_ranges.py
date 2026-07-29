from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

@dataclass(frozen=True)
class DateWindow:
    start: date | None
    end: date | None
    label: str


def _parse(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def resolve_window(preset: str, start_date: str | None = None, end_date: str | None = None) -> DateWindow:
    today = date.today()
    preset = (preset or "maximum").lower()
    if preset == "custom":
        start, end = _parse(start_date), _parse(end_date)
        if not start or not end:
            raise ValueError("Custom reports require both a start date and an end date.")
        if start > end:
            raise ValueError("The report start date must be on or before the end date.")
        return DateWindow(start, end, f"{start:%b %-d, %Y} – {end:%b %-d, %Y}")
    if preset == "maximum": return DateWindow(None, None, "Maximum history")
    if preset == "today": start = end = today
    elif preset == "yesterday": start = end = today - timedelta(days=1)
    elif preset == "last_7_days": start, end = today - timedelta(days=6), today
    elif preset == "last_30_days": start, end = today - timedelta(days=29), today
    elif preset == "last_90_days": start, end = today - timedelta(days=89), today
    elif preset == "this_month": start, end = today.replace(day=1), today
    elif preset == "last_month":
        end = today.replace(day=1) - timedelta(days=1); start = end.replace(day=1)
    else: raise ValueError("Unsupported reporting period.")
    return DateWindow(start, end, f"{start:%b %-d, %Y} – {end:%b %-d, %Y}")


def comparison_window(window: DateWindow, comparison: str) -> DateWindow | None:
    if comparison == "none" or not window.start or not window.end: return None
    if comparison == "previous_period":
        days = (window.end - window.start).days + 1
        end = window.start - timedelta(days=1); start = end - timedelta(days=days - 1)
    elif comparison == "previous_month":
        end = window.start.replace(day=1) - timedelta(days=1); start = end.replace(day=1)
    elif comparison == "previous_year":
        try: start, end = window.start.replace(year=window.start.year-1), window.end.replace(year=window.end.year-1)
        except ValueError: start, end = window.start - timedelta(days=365), window.end - timedelta(days=365)
    else: return None
    return DateWindow(start, end, f"{start:%b %-d, %Y} – {end:%b %-d, %Y}")


def parse_row_date(row: dict[str, Any]) -> date | None:
    for key in ("date", "reportDate", "performanceDate", "day", "createdAt", "created_at", "updatedAt", "updated_at"):
        value = row.get(key)
        if value in (None, ""): continue
        try:
            if isinstance(value, (int, float)):
                return datetime.fromtimestamp(value / 1000 if value > 10_000_000_000 else value).date()
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
        except Exception: pass
    return None
