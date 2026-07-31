from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
import time
from typing import Any

from integrations.google_ads.store import (
    get_connection as get_google_connection,
    list_daily_campaign_performance as list_google_daily,
)
from integrations.meta_ads.store import (
    get_connection as get_meta_connection,
    list_daily_campaign_performance as list_meta_daily,
)

MIN_IMPRESSIONS = 100
MIN_CLICKS = 5
MIN_SPEND = 5.0
MIN_CONVERSIONS_FOR_CPA = 2.0
MEANINGFUL_CHANGE = 0.20
LARGE_CHANGE = 0.35


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else default)
    except (TypeError, ValueError):
        return default


def _integer(value: Any, default: int = 0) -> int:
    try:
        return int(float(value if value not in (None, "") else default))
    except (TypeError, ValueError):
        return default


def _money(value: Any) -> str:
    return f"${_num(value):,.2f}"


def _pct(value: Any) -> str:
    return f"{_num(value):,.2f}%"


def _change(current: float, previous: float) -> float | None:
    if previous == 0:
        return None
    return (current - previous) / abs(previous)


def _change_label(change: float | None) -> str:
    if change is None:
        return "not comparable"
    return f"{abs(change) * 100:.0f}% {'higher' if change > 0 else 'lower'}"


def _aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    impressions = sum(_integer(row.get("impressions")) for row in rows)
    clicks = sum(_integer(row.get("clicks")) for row in rows)
    spend = sum(_num(row.get("spend")) for row in rows)
    conversions = sum(_num(row.get("conversions")) for row in rows)
    conversion_value = sum(_num(row.get("conversionValue")) for row in rows)

    return {
        "impressions": impressions,
        "clicks": clicks,
        "spend": round(spend, 2),
        "conversions": round(conversions, 2),
        "conversionValue": round(conversion_value, 2),
        "ctr": round((clicks / impressions) * 100, 4) if impressions else 0,
        "cpc": round(spend / clicks, 4) if clicks else 0,
        "cpa": round(spend / conversions, 4) if conversions else None,
        "roas": round(conversion_value / spend, 4) if spend else None,
    }


def _period_rows(
    rows: list[dict[str, Any]],
    *,
    start: date,
    end: date,
) -> list[dict[str, Any]]:
    selected = []
    for row in rows:
        raw = str(row.get("date") or row.get("reportDate") or "")
        try:
            row_date = date.fromisoformat(raw)
        except ValueError:
            continue
        if start <= row_date <= end:
            selected.append(row)
    return selected


def _confidence(current: dict[str, Any], previous: dict[str, Any]) -> str:
    impressions = _integer(current.get("impressions")) + _integer(previous.get("impressions"))
    clicks = _integer(current.get("clicks")) + _integer(previous.get("clicks"))
    spend = _num(current.get("spend")) + _num(previous.get("spend"))
    conversions = _num(current.get("conversions")) + _num(previous.get("conversions"))

    if impressions >= 1000 and clicks >= 40 and spend >= 25 and conversions >= 4:
        return "high"
    if impressions >= 200 and clicks >= 10 and spend >= 10:
        return "medium"
    return "low"


def _finding_id(platform: str, campaign_id: str, signal: str) -> str:
    return f"{platform}:{campaign_id}:{signal}".replace(" ", "_").lower()


def _base_finding(
    *,
    platform: str,
    platform_label: str,
    campaign_id: str,
    campaign_name: str,
    category: str,
    severity: str,
    confidence: str,
    signal: str,
    title: str,
    summary: str,
    why: str,
    interpretation: str,
    review_items: list[str],
    evidence: list[dict[str, str]],
    current: dict[str, Any],
    previous: dict[str, Any],
    creative_related: bool = False,
) -> dict[str, Any]:
    return {
        "id": _finding_id(platform, campaign_id, signal),
        "platform": platform,
        "platformLabel": platform_label,
        "campaignId": campaign_id,
        "campaignName": campaign_name,
        "category": category,
        "severity": severity,
        "confidence": confidence,
        "title": title,
        "summary": summary,
        "whyItMatters": why,
        "interpretation": interpretation,
        "reviewItems": review_items,
        "evidence": evidence,
        "currentPeriod": current,
        "previousPeriod": previous,
        "creativeRelated": creative_related,
        "readOnly": True,
    }


def _campaign_findings(
    *,
    platform: str,
    platform_label: str,
    campaign_id: str,
    campaign_name: str,
    current: dict[str, Any],
    previous: dict[str, Any],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    confidence = _confidence(current, previous)

    current_impressions = _integer(current.get("impressions"))
    current_clicks = _integer(current.get("clicks"))
    current_spend = _num(current.get("spend"))
    current_conversions = _num(current.get("conversions"))

    previous_ctr = _num(previous.get("ctr"))
    current_ctr = _num(current.get("ctr"))
    ctr_change = _change(current_ctr, previous_ctr)

    if (
        ctr_change is not None
        and ctr_change <= -MEANINGFUL_CHANGE
        and current_impressions >= MIN_IMPRESSIONS
        and current_clicks >= MIN_CLICKS
    ):
        severity = "warning" if ctr_change > -LARGE_CHANGE else "critical"
        findings.append(
            _base_finding(
                platform=platform,
                platform_label=platform_label,
                campaign_id=campaign_id,
                campaign_name=campaign_name,
                category="creative",
                severity=severity,
                confidence=confidence,
                signal="ctr_decline",
                title=f"Engagement declined in {campaign_name}",
                summary=f"CTR was {_change_label(ctr_change)} than the preceding seven-day period.",
                why="Fewer people are engaging with the ads relative to the number of impressions served.",
                interpretation=(
                    "This can point to weaker message relevance, changing search or audience intent, "
                    "or creative fatigue. It does not by itself prove which cause is responsible."
                ),
                review_items=[
                    "Recent search terms or audience quality",
                    "Headline, primary message, and offer relevance",
                    "Keyword-to-ad or audience-to-creative alignment",
                    "Whether the same creative has been running for an extended period",
                ],
                evidence=[
                    {"label": "Current CTR", "value": _pct(current_ctr)},
                    {"label": "Previous CTR", "value": _pct(previous_ctr)},
                    {"label": "Current impressions", "value": f"{current_impressions:,}"},
                    {"label": "Current clicks", "value": f"{current_clicks:,}"},
                ],
                current=current,
                previous=previous,
                creative_related=True,
            )
        )

    previous_cpc = _num(previous.get("cpc"))
    current_cpc = _num(current.get("cpc"))
    cpc_change = _change(current_cpc, previous_cpc)
    if (
        cpc_change is not None
        and cpc_change >= MEANINGFUL_CHANGE
        and current_clicks >= MIN_CLICKS
        and current_spend >= MIN_SPEND
    ):
        findings.append(
            _base_finding(
                platform=platform,
                platform_label=platform_label,
                campaign_id=campaign_id,
                campaign_name=campaign_name,
                category="performance",
                severity="warning" if cpc_change < LARGE_CHANGE else "critical",
                confidence=confidence,
                signal="cpc_rise",
                title=f"Click costs increased in {campaign_name}",
                summary=f"Average CPC was {_change_label(cpc_change)} than the preceding seven-day period.",
                why="Higher click costs reduce the amount of traffic the same budget can produce.",
                interpretation=(
                    "Competition, targeting mix, quality, placements, or bidding conditions may have changed. "
                    "Review the platform details before adjusting spend."
                ),
                review_items=[
                    "Search terms, audiences, or placements receiving spend",
                    "Ad relevance and engagement trends",
                    "Recent bidding or targeting changes made in the ad platform",
                ],
                evidence=[
                    {"label": "Current CPC", "value": _money(current_cpc)},
                    {"label": "Previous CPC", "value": _money(previous_cpc)},
                    {"label": "Current spend", "value": _money(current_spend)},
                ],
                current=current,
                previous=previous,
            )
        )

    previous_conversions = _num(previous.get("conversions"))
    conversion_change = _change(current_conversions, previous_conversions)
    if (
        conversion_change is not None
        and conversion_change <= -MEANINGFUL_CHANGE
        and current_spend >= MIN_SPEND
        and previous_conversions >= 1
    ):
        findings.append(
            _base_finding(
                platform=platform,
                platform_label=platform_label,
                campaign_id=campaign_id,
                campaign_name=campaign_name,
                category="performance",
                severity="warning" if conversion_change > -LARGE_CHANGE else "critical",
                confidence=confidence,
                signal="conversion_decline",
                title=f"Conversion volume declined in {campaign_name}",
                summary=f"Conversions were {_change_label(conversion_change)} than the preceding seven-day period.",
                why="The campaign is producing fewer recorded outcomes than it did in the comparison period.",
                interpretation=(
                    "The cause may be traffic quality, landing-page performance, offer strength, tracking, "
                    "or normal short-term variation."
                ),
                review_items=[
                    "Conversion tracking and selected conversion actions",
                    "Landing-page experience and offer consistency",
                    "Traffic mix and recent campaign changes",
                ],
                evidence=[
                    {"label": "Current conversions", "value": f"{current_conversions:.2f}"},
                    {"label": "Previous conversions", "value": f"{previous_conversions:.2f}"},
                    {"label": "Current spend", "value": _money(current_spend)},
                ],
                current=current,
                previous=previous,
            )
        )

    current_cpa = current.get("cpa")
    previous_cpa = previous.get("cpa")
    if (
        current_cpa is not None
        and previous_cpa is not None
        and current_conversions >= MIN_CONVERSIONS_FOR_CPA
        and previous_conversions >= MIN_CONVERSIONS_FOR_CPA
    ):
        cpa_change = _change(_num(current_cpa), _num(previous_cpa))
        if cpa_change is not None and cpa_change >= MEANINGFUL_CHANGE:
            findings.append(
                _base_finding(
                    platform=platform,
                    platform_label=platform_label,
                    campaign_id=campaign_id,
                    campaign_name=campaign_name,
                    category="performance",
                    severity="warning" if cpa_change < LARGE_CHANGE else "critical",
                    confidence=confidence,
                    signal="cpa_rise",
                    title=f"Acquisition efficiency weakened in {campaign_name}",
                    summary=f"CPA was {_change_label(cpa_change)} than the preceding seven-day period.",
                    why="The campaign is spending more for each recorded conversion.",
                    interpretation=(
                        "Review both pre-click and post-click performance before deciding whether the issue "
                        "is campaign delivery, traffic quality, creative, or the landing experience."
                    ),
                    review_items=[
                        "CTR and CPC movement during the same period",
                        "Conversion rate and landing-page behavior",
                        "Recent search terms, audiences, placements, or offer changes",
                    ],
                    evidence=[
                        {"label": "Current CPA", "value": _money(current_cpa)},
                        {"label": "Previous CPA", "value": _money(previous_cpa)},
                        {"label": "Current conversions", "value": f"{current_conversions:.2f}"},
                    ],
                    current=current,
                    previous=previous,
                )
            )

    if current_spend >= max(MIN_SPEND, 10.0) and current_conversions == 0:
        findings.append(
            _base_finding(
                platform=platform,
                platform_label=platform_label,
                campaign_id=campaign_id,
                campaign_name=campaign_name,
                category="tracking",
                severity="warning",
                confidence="medium" if current_clicks >= 10 else "low",
                signal="spend_no_conversions",
                title=f"Spend produced no recorded conversions in {campaign_name}",
                summary=f"The campaign spent {_money(current_spend)} in the latest seven-day period without a recorded conversion.",
                why="Meaningful spend without outcomes deserves review, but it may reflect tracking, attribution lag, or genuinely weak performance.",
                interpretation="Confirm measurement first, then review traffic quality and the post-click experience.",
                review_items=[
                    "Conversion action and tracking health",
                    "Attribution delay or conversion lag",
                    "Search terms, audience quality, and landing page",
                ],
                evidence=[
                    {"label": "Spend", "value": _money(current_spend)},
                    {"label": "Clicks", "value": f"{current_clicks:,}"},
                    {"label": "Conversions", "value": "0"},
                ],
                current=current,
                previous=previous,
            )
        )

    if not findings and current_impressions >= MIN_IMPRESSIONS:
        previous_roas = previous.get("roas")
        current_roas = current.get("roas")
        roas_change = (
            _change(_num(current_roas), _num(previous_roas))
            if current_roas is not None and previous_roas not in (None, 0)
            else None
        )
        if roas_change is not None and roas_change >= MEANINGFUL_CHANGE:
            findings.append(
                _base_finding(
                    platform=platform,
                    platform_label=platform_label,
                    campaign_id=campaign_id,
                    campaign_name=campaign_name,
                    category="opportunity",
                    severity="opportunity",
                    confidence=confidence,
                    signal="roas_improvement",
                    title=f"Return improved in {campaign_name}",
                    summary=f"ROAS was {_change_label(roas_change)} than the preceding seven-day period.",
                    why="The campaign generated more conversion value for each dollar spent.",
                    interpretation="Review what changed and preserve the variables that may be contributing to the improvement.",
                    review_items=[
                        "Recent creative, audience, offer, or landing-page changes",
                        "Whether conversion volume is sufficient to sustain the signal",
                    ],
                    evidence=[
                        {"label": "Current ROAS", "value": f"{_num(current_roas):.2f}x"},
                        {"label": "Previous ROAS", "value": f"{_num(previous_roas):.2f}x"},
                    ],
                    current=current,
                    previous=previous,
                )
            )

    return findings


def _platform_data(uid: str) -> tuple[list[dict[str, Any]], list[str], list[str], int]:
    all_findings: list[dict[str, Any]] = []
    platforms: list[str] = []
    notes: list[str] = []
    campaigns_analyzed: set[str] = set()

    today = date.today()
    current_end = today - timedelta(days=1)
    current_start = current_end - timedelta(days=6)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=6)

    sources = [
        (
            "google_ads",
            "Google Ads",
            get_google_connection(uid) or {},
            list_google_daily,
            "selectedCustomerId",
        ),
        (
            "meta_ads",
            "Meta Ads",
            get_meta_connection(uid) or {},
            list_meta_daily,
            "selectedAdAccountId",
        ),
    ]

    for platform, label, connection, list_daily, account_key in sources:
        if connection.get("status") != "connected":
            notes.append(f"{label} is not connected.")
            continue
        account_id = connection.get(account_key)
        if not account_id:
            notes.append(f"{label} has no selected advertiser account.")
            continue

        rows = list_daily(uid, account_id=account_id, limit=20000)
        if not rows:
            notes.append(f"{label} does not have saved daily campaign history yet. Refresh it manually first.")
            continue

        platforms.append(label)
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        names: dict[str, str] = {}
        for row in rows:
            campaign_id = str(row.get("campaignId") or row.get("id") or "").strip()
            if not campaign_id:
                continue
            grouped[campaign_id].append(row)
            names[campaign_id] = str(row.get("campaignName") or row.get("name") or "Campaign")

        for campaign_id, campaign_rows in grouped.items():
            current_rows = _period_rows(campaign_rows, start=current_start, end=current_end)
            previous_rows = _period_rows(campaign_rows, start=previous_start, end=previous_end)
            if not current_rows and not previous_rows:
                continue

            campaigns_analyzed.add(f"{platform}:{campaign_id}")
            current = _aggregate(current_rows)
            previous = _aggregate(previous_rows)
            all_findings.extend(
                _campaign_findings(
                    platform=platform,
                    platform_label=label,
                    campaign_id=campaign_id,
                    campaign_name=names[campaign_id],
                    current=current,
                    previous=previous,
                )
            )

    return all_findings, platforms, notes, len(campaigns_analyzed)


SEVERITY_ORDER = {
    "critical": 0,
    "warning": 1,
    "opportunity": 2,
    "healthy": 3,
    "info": 4,
}
CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}


def build_briefing(uid: str) -> dict[str, Any]:
    findings, platforms, notes, campaign_count = _platform_data(uid)
    findings.sort(
        key=lambda item: (
            SEVERITY_ORDER.get(item.get("severity"), 99),
            CONFIDENCE_ORDER.get(item.get("confidence"), 99),
            item.get("campaignName") or "",
        )
    )

    top = findings[0] if findings else None
    urgent_count = sum(1 for item in findings if item.get("severity") in {"critical", "warning"})
    opportunity_count = sum(1 for item in findings if item.get("severity") == "opportunity")

    if not platforms:
        headline = "Connect campaign data to begin"
        summary = "Campaign Intelligence needs saved Google Ads or Meta Ads history before it can prepare a briefing."
    elif not findings:
        headline = "No urgent changes detected"
        summary = (
            f"ADGen reviewed {campaign_count} campaign{'s' if campaign_count != 1 else ''} "
            "and did not find a material seven-day change that met the current evidence thresholds."
        )
    else:
        headline = "Your campaign briefing"
        parts = []
        if urgent_count:
            parts.append(f"{urgent_count} area{'s' if urgent_count != 1 else ''} deserve attention")
        if opportunity_count:
            parts.append(f"{opportunity_count} improvement signal{'s' if opportunity_count != 1 else ''} appeared")
        summary = (
            f"ADGen reviewed {campaign_count} campaign{'s' if campaign_count != 1 else ''} across "
            f"{', '.join(platforms)} and found " + (" and ".join(parts) if parts else f"{len(findings)} notable changes") + "."
        )

    return {
        "generatedAt": int(time.time()),
        "readOnly": True,
        "headline": headline,
        "summary": summary,
        "topPriorityId": top.get("id") if top else None,
        "topPriorityText": (
            f"If you review one thing, review {top.get('campaignName')}: {top.get('title')}."
            if top
            else "No single campaign requires immediate attention based on the available evidence."
        ),
        "campaignsAnalyzed": campaign_count,
        "platformsAnalyzed": platforms,
        "findings": findings[:20],
        "dataNotes": notes,
    }
