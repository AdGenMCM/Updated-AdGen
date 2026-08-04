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


def _finding_actionability(
    *,
    signal: str,
    category: str,
    severity: str,
    title: str,
    review_items: list[str],
    creative_related: bool,
) -> tuple[str, str]:
    """Return a cautious action level and a concrete read-only next step."""
    text = f"{signal} {category} {title}".lower()

    if severity in {"healthy", "info"} or category == "learning":
        return (
            "monitor",
            "Keep the campaign stable and continue collecting data before making a material change.",
        )

    if "budget" in text or "lost_share" in text:
        return (
            "review",
            "Confirm CPA, ROAS, lead quality, and search-term relevance first. If efficiency is acceptable and the campaign consistently reaches its budget, test a modest 10–20% budget increase rather than making a large change at once.",
        )

    if "rank" in text or "impression share" in text:
        return (
            "review",
            "Review ad relevance, landing-page alignment, expected CTR, and bid competitiveness before increasing spend. Improve the weakest quality or relevance signal first.",
        )

    if "frequency" in text or "fatigue" in text:
        return (
            "test",
            "Prepare one new creative variation for the affected audience or ad set, then compare it against the current creative without changing several variables at once.",
        )

    if "delivery" in text or "status" in text or "limited" in text:
        return (
            "review",
            "Check the campaign or ad set delivery status, budget, schedule, audience size, and policy notices before changing bids or creative.",
        )

    if "tracking" in text or "conversion" in text and "rate" not in text:
        return (
            "review",
            "Verify that the primary conversion action is firing correctly and that recorded conversions match the business outcome you want to optimize.",
        )

    if "cpa" in text or "roas" in text or "conversion rate" in text:
        return (
            "review",
            "Review traffic quality, landing-page alignment, and conversion tracking before changing the bidding strategy. Make one controlled adjustment only after confirming the efficiency signal is reliable.",
        )

    if creative_related or "creative" in text or "ctr" in text or "engagement" in text:
        return (
            "test",
            "Create one controlled creative variation based on the strongest known brand and performance signals, then compare it against the current version before replacing the existing creative.",
        )

    if severity == "opportunity":
        return (
            "test",
            "Preserve the current setup and test one deliberate variation so you can identify whether the positive signal is repeatable.",
        )

    if review_items:
        return (
            "review",
            f"Review {review_items[0].lower()} first, then make only one measured change if the evidence supports it.",
        )

    return (
        "review",
        "Review the supporting evidence and campaign context before making a change. Prioritize one measured adjustment rather than changing several settings at once.",
    )


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
    action_level, recommended_action = _finding_actionability(
        signal=signal,
        category=category,
        severity=severity,
        title=title,
        review_items=review_items,
        creative_related=creative_related,
    )

    return {
        "id": _finding_id(platform, campaign_id, signal),
        "signal": signal,
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
        "actionLevel": action_level,
        "recommendedAction": recommended_action,
        "evidence": evidence,
        "currentPeriod": current,
        "previousPeriod": previous,
        "creativeRelated": creative_related,
        "readOnly": True,
    }




def _context_finding(
    *, platform: str, platform_label: str, campaign_id: str, campaign_name: str,
    signal: str, category: str, severity: str, confidence: str,
    title: str, summary: str, why: str, interpretation: str,
    review_items: list[str], evidence: list[dict[str, str]],
    current: dict[str, Any], previous: dict[str, Any],
) -> dict[str, Any]:
    return _base_finding(
        platform=platform,
        platform_label=platform_label,
        campaign_id=campaign_id,
        campaign_name=campaign_name,
        category=category,
        severity=severity,
        confidence=confidence,
        signal=signal,
        title=title,
        summary=summary,
        why=why,
        interpretation=interpretation,
        review_items=review_items,
        evidence=evidence,
        current=current,
        previous=previous,
    )


def _campaign_context_findings(
    *, platform: str, platform_label: str, campaign_id: str, campaign_name: str,
    current: dict[str, Any], previous: dict[str, Any], connection: dict[str, Any],
) -> list[dict[str, Any]]:
    """Generate read-only findings from the richer platform context saved at sync time."""
    findings: list[dict[str, Any]] = []
    confidence = _confidence(current, previous)
    campaign_rows = connection.get("campaigns") or []
    campaign = next((row for row in campaign_rows if str(row.get("id") or row.get("campaignId") or "") == campaign_id), {})

    if platform == "google_ads" and campaign:
        impression_share = campaign.get("searchImpressionShare")
        budget_lost = campaign.get("searchBudgetLostImpressionShare")
        rank_lost = campaign.get("searchRankLostImpressionShare")
        budget = campaign.get("dailyBudget")
        bid = campaign.get("biddingStrategyType")
        campaign_type = campaign.get("campaignType")
        conversion_rate = campaign.get("conversionRate")

        if _num(budget_lost) >= 20 and _integer(current.get("impressions")) >= MIN_IMPRESSIONS:
            findings.append(_context_finding(
                platform=platform, platform_label=platform_label, campaign_id=campaign_id,
                campaign_name=campaign_name, signal="budget_lost_share", category="delivery",
                severity="warning" if _num(budget_lost) < 40 else "critical", confidence=confidence,
                title=f"Budget is limiting eligible Search reach in {campaign_name}",
                summary=f"Google reports {_num(budget_lost):.1f}% of eligible Search impression share was lost to budget.",
                why="A meaningful portion of eligible Search traffic was unavailable because of budget constraints.",
                interpretation="This does not automatically mean the budget should be raised. First confirm that the campaign is producing acceptable conversion efficiency and that additional traffic is desirable.",
                review_items=["Current CPA or ROAS before increasing spend", "Budget allocation across campaigns", "Whether the campaign is consistently reaching its daily budget"],
                evidence=[{"label":"Budget-lost share","value":f"{_num(budget_lost):.1f}%"},{"label":"Daily budget","value":_money(budget)},{"label":"Bidding strategy","value":str(bid or "Unknown")}],
                current=current, previous=previous,
            ))
        if _num(rank_lost) >= 20 and _integer(current.get("impressions")) >= MIN_IMPRESSIONS:
            findings.append(_context_finding(
                platform=platform, platform_label=platform_label, campaign_id=campaign_id,
                campaign_name=campaign_name, signal="rank_lost_share", category="delivery",
                severity="warning", confidence=confidence,
                title=f"Ad rank is limiting Search visibility in {campaign_name}",
                summary=f"Google reports {_num(rank_lost):.1f}% of eligible Search impression share was lost to rank.",
                why="The campaign is missing eligible impressions because ad rank is not competitive enough in some auctions.",
                interpretation="Ad rank can reflect bid competitiveness, expected CTR, ad relevance, and landing-page experience. Increasing budget alone would not address this signal.",
                review_items=["Ad and keyword relevance", "Landing-page experience", "Bid strategy and target settings in Google Ads", "Quality and engagement of the active ads"],
                evidence=[{"label":"Rank-lost share","value":f"{_num(rank_lost):.1f}%"},{"label":"Search impression share","value":f"{_num(impression_share):.1f}%"},{"label":"Campaign type","value":str(campaign_type or "Unknown")}],
                current=current, previous=previous,
            ))
        if conversion_rate is not None and _num(current.get("clicks")) >= MIN_CLICKS:
            # Context-only opportunity when engagement is healthy but post-click rate is weak.
            if _num(conversion_rate) < 2 and _num(current.get("ctr")) >= 3:
                findings.append(_context_finding(
                    platform=platform, platform_label=platform_label, campaign_id=campaign_id,
                    campaign_name=campaign_name, signal="post_click_gap", category="opportunity",
                    severity="opportunity", confidence=confidence,
                    title=f"Post-click performance deserves review in {campaign_name}",
                    summary=f"The campaign's conversion rate is {_num(conversion_rate):.2f}% while ad engagement remains comparatively healthy.",
                    why="People are clicking, but a relatively small share of those interactions become recorded conversions.",
                    interpretation="The next review should focus after the click: landing-page relevance, conversion tracking, offer clarity, and the conversion action being optimized.",
                    review_items=["Landing-page message match", "Conversion action configuration", "Page speed and mobile experience", "Offer and form friction"],
                    evidence=[{"label":"Conversion rate","value":f"{_num(conversion_rate):.2f}%"},{"label":"CTR","value":_pct(current.get("ctr"))},{"label":"Bidding strategy","value":str(bid or "Unknown")}],
                    current=current, previous=previous,
                ))

    if platform == "meta_ads":
        ad_sets = [row for row in (connection.get("adSets") or []) if str(row.get("campaignId") or "") == campaign_id]
        if ad_sets:
            total_spend = sum(_num(row.get("spend")) for row in ad_sets)
            highest_frequency = max((_num(row.get("frequency")) for row in ad_sets), default=0)
            if highest_frequency >= 4 and _integer(current.get("impressions")) >= MIN_IMPRESSIONS:
                findings.append(_context_finding(
                    platform=platform, platform_label=platform_label, campaign_id=campaign_id,
                    campaign_name=campaign_name, signal="high_frequency", category="creative",
                    severity="warning" if highest_frequency < 7 else "critical", confidence=confidence,
                    title=f"Audience frequency is elevated in {campaign_name}",
                    summary=f"At least one Meta ad set reached a frequency of {highest_frequency:.2f} during the selected period.",
                    why="Repeated exposure can eventually reduce engagement and increase the likelihood of creative fatigue, especially in prospecting audiences.",
                    interpretation="Frequency should be interpreted alongside audience type, CTR trend, and campaign objective. Retargeting campaigns can reasonably run at a higher frequency than prospecting campaigns.",
                    review_items=["Whether the ad set is prospecting or retargeting", "CTR and CPA trend for the same ad set", "Creative age and number of active variations", "Audience size and overlap"],
                    evidence=[{"label":"Highest ad-set frequency","value":f"{highest_frequency:.2f}"},{"label":"Ad sets reviewed","value":str(len(ad_sets))}],
                    current=current, previous=previous,
                ))
            if total_spend >= MIN_SPEND and len(ad_sets) >= 2:
                leader = max(ad_sets, key=lambda row: _num(row.get("spend")))
                share = _num(leader.get("spend")) / total_spend if total_spend else 0
                others = [row for row in ad_sets if row is not leader and _num(row.get("spend")) > 0]
                if share >= 0.70 and others:
                    findings.append(_context_finding(
                        platform=platform, platform_label=platform_label, campaign_id=campaign_id,
                        campaign_name=campaign_name, signal="adset_spend_concentration", category="delivery",
                        severity="opportunity", confidence=confidence,
                        title=f"Meta delivery is concentrated in one ad set for {campaign_name}",
                        summary=f"{leader.get('adSetName') or 'One ad set'} received {share * 100:.0f}% of recorded campaign spend.",
                        why="Heavy concentration can be intentional, but it can also mean other ad sets are not gathering enough delivery to be evaluated fairly.",
                        interpretation="Meta allocates delivery dynamically. Review efficiency before forcing a more even split; the leading ad set may simply be stronger.",
                        review_items=["CPA and ROAS by ad set", "Optimization goal and bid strategy", "Audience overlap", "Whether low-delivery ad sets have enough time and budget to learn"],
                        evidence=[{"label":"Leading ad set","value":str(leader.get("adSetName") or "Ad set")},{"label":"Spend share","value":f"{share * 100:.0f}%"},{"label":"Optimization goal","value":str(leader.get("optimizationGoal") or "Unknown")}],
                        current=current, previous=previous,
                    ))
            inactive = [row for row in ad_sets if str(row.get("effectiveStatus") or row.get("status") or "").upper() not in {"ACTIVE", "PAUSED", "CAMPAIGN_PAUSED"}]
            if inactive:
                findings.append(_context_finding(
                    platform=platform, platform_label=platform_label, campaign_id=campaign_id,
                    campaign_name=campaign_name, signal="adset_delivery_status", category="tracking",
                    severity="info", confidence=confidence,
                    title=f"Some ad sets have restricted or inactive delivery in {campaign_name}",
                    summary=f"{len(inactive)} ad set{'s' if len(inactive) != 1 else ''} reported a non-active delivery status.",
                    why="Delivery status can explain why spend or conversion volume is lower than expected.",
                    interpretation="Review the exact status in Meta Ads Manager. ADGen is reporting the saved status only and does not change delivery.",
                    review_items=["Ad-set delivery status and policy notices", "Campaign and ad status", "Schedule and budget availability"],
                    evidence=[{"label":"Affected ad sets","value":str(len(inactive))}],
                    current=current, previous=previous,
                ))
    return findings


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


def _period_bounds(date_range: str) -> tuple[date, date, date, date, str]:
    requested = str(date_range or "LAST_30_DAYS").upper()
    today = date.today()

    if requested == "TODAY":
        current_start = current_end = today
        previous_start = previous_end = today - timedelta(days=1)
        label = "today versus yesterday"
    elif requested == "YESTERDAY":
        current_start = current_end = today - timedelta(days=1)
        previous_start = previous_end = today - timedelta(days=2)
        label = "yesterday versus the prior day"
    elif requested == "THIS_MONTH":
        current_start = today.replace(day=1)
        current_end = today
        days = max(1, (current_end - current_start).days + 1)
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days - 1)
        label = "this month versus the preceding equal-length period"
    elif requested == "LAST_MONTH":
        current_end = today.replace(day=1) - timedelta(days=1)
        current_start = current_end.replace(day=1)
        days = (current_end - current_start).days + 1
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days - 1)
        label = "last month versus the prior month"
    else:
        days = {
            "LAST_7_DAYS": 7,
            "LAST_14_DAYS": 14,
            "LAST_30_DAYS": 30,
            "LAST_90_DAYS": 90,
            "MAXIMUM": 90,
        }.get(requested, 30)
        current_end = today - timedelta(days=1)
        current_start = current_end - timedelta(days=days - 1)
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days - 1)
        label = ("all available history split into two comparable periods" if requested == "MAXIMUM" else f"the latest {days} days versus the preceding {days} days")

    return current_start, current_end, previous_start, previous_end, label


def _platform_data(uid: str, date_range: str = "LAST_30_DAYS", platform_filter: str = "all") -> tuple[list[dict[str, Any]], list[str], list[str], int, str, list[dict[str, Any]]]:
    all_findings: list[dict[str, Any]] = []
    platforms: list[str] = []
    notes: list[str] = []
    campaigns_analyzed: set[str] = set()
    campaign_snapshots: list[dict[str, Any]] = []

    current_start, current_end, previous_start, previous_end, comparison_label = _period_bounds(date_range)

    sources = [
        ("google_ads", "Google Ads", get_google_connection(uid) or {}, list_google_daily, "selectedCustomerId"),
        ("meta_ads", "Meta Ads", get_meta_connection(uid) or {}, list_meta_daily, "selectedAdAccountId"),
    ]
    if platform_filter in {"google_ads", "meta_ads"}:
        sources = [source for source in sources if source[0] == platform_filter]

    for platform, label, connection, list_daily, account_key in sources:
        if connection.get("status") != "connected":
            notes.append(f"{label} is not connected.")
            continue
        account_id = connection.get(account_key)
        if not account_id:
            notes.append(f"{label} has no selected advertiser account.")
            continue

        rows = list_daily(uid, account_id=account_id, limit=20000)
        if platform == "google_ads" and connection.get("campaignContextWarning"):
            notes.append("Google campaign-setting context was unavailable for the latest sync; core performance analysis is still available.")
        if platform == "meta_ads" and connection.get("adSetContextWarning"):
            notes.append("Meta ad-set context was unavailable for the latest sync; campaign-level analysis is still available.")
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
            campaign_current_start = current_start
            campaign_current_end = current_end
            campaign_previous_start = previous_start
            campaign_previous_end = previous_end

            if str(date_range).upper() == "MAXIMUM":
                available_dates = []
                for row in campaign_rows:
                    raw_date = str(row.get("date") or row.get("reportDate") or "")
                    try:
                        available_dates.append(date.fromisoformat(raw_date))
                    except ValueError:
                        continue
                available_dates = sorted(set(available_dates))
                if len(available_dates) >= 2:
                    midpoint = max(1, len(available_dates) // 2)
                    previous_dates = available_dates[:midpoint]
                    current_dates = available_dates[midpoint:]
                    if current_dates and previous_dates:
                        campaign_current_start = current_dates[0]
                        campaign_current_end = current_dates[-1]
                        campaign_previous_start = previous_dates[0]
                        campaign_previous_end = previous_dates[-1]

            current_rows = _period_rows(campaign_rows, start=campaign_current_start, end=campaign_current_end)
            previous_rows = _period_rows(campaign_rows, start=campaign_previous_start, end=campaign_previous_end)
            if not current_rows and not previous_rows:
                continue

            campaigns_analyzed.add(f"{platform}:{campaign_id}")
            current = _aggregate(current_rows)
            previous = _aggregate(previous_rows)
            campaign_snapshots.append({
                "platform": platform,
                "platformLabel": label,
                "campaignId": campaign_id,
                "campaignName": names[campaign_id],
                "current": current,
                "previous": previous,
                "confidence": _confidence(current, previous),
            })
            findings = _campaign_findings(
                platform=platform,
                platform_label=label,
                campaign_id=campaign_id,
                campaign_name=names[campaign_id],
                current=current,
                previous=previous,
            )
            findings.extend(_campaign_context_findings(
                platform=platform,
                platform_label=label,
                campaign_id=campaign_id,
                campaign_name=names[campaign_id],
                current=current,
                previous=previous,
                connection=connection,
            ))
            for finding in findings:
                finding["comparisonLabel"] = comparison_label
                finding["actions"] = [
                    {"label": "Open Optimizer", "href": "/optimizer", "kind": "primary"},
                    {"label": "Generate variation", "href": "/adgenerator", "kind": "secondary"},
                ] if finding.get("creativeRelated") else [
                    {"label": f"Review in {label}", "href": "/insights", "kind": "secondary"}
                ]
            all_findings.extend(findings)

    return all_findings, platforms, notes, len(campaigns_analyzed), comparison_label, campaign_snapshots



def _healthy_analysis(
    snapshots: list[dict[str, Any]],
    platforms: list[str],
    campaign_count: int,
) -> dict[str, Any]:
    if not snapshots:
        return {}

    current_total = _aggregate([item["current"] for item in snapshots])
    previous_total = _aggregate([item["previous"] for item in snapshots])
    overall_confidence = _confidence(current_total, previous_total)

    positives: list[str] = []
    ctr_change = _change(_num(current_total.get("ctr")), _num(previous_total.get("ctr")))
    conversion_change = _change(_num(current_total.get("conversions")), _num(previous_total.get("conversions")))
    cpc_change = _change(_num(current_total.get("cpc")), _num(previous_total.get("cpc")))

    if ctr_change is None or abs(ctr_change) < MEANINGFUL_CHANGE:
        positives.append("Engagement remained within the expected range for the comparison period.")
    if conversion_change is None or abs(conversion_change) < MEANINGFUL_CHANGE:
        positives.append("Recorded conversion volume did not show a material decline.")
    if cpc_change is None or cpc_change < MEANINGFUL_CHANGE:
        positives.append("Click costs remained stable enough that no cost warning was triggered.")
    if len(platforms) > 1:
        positives.append("No broad decline was detected across both connected advertising platforms.")
    if not positives:
        positives.append("No campaign exceeded ADGen's current evidence thresholds for a material negative change.")

    strongest = max(
        snapshots,
        key=lambda item: (
            _num(item["current"].get("conversions")),
            _num(item["current"].get("conversionValue")),
            _num(item["current"].get("ctr")),
            _num(item["current"].get("impressions")),
        ),
    )

    opportunities = [
        "Keep monitoring the campaigns while the current performance pattern remains stable.",
        "Review Performance Intelligence for creative patterns worth repeating.",
        "Generate a controlled variation from a proven creative instead of changing several variables at once.",
    ]
    if _num(current_total.get("conversions")) < 4:
        opportunities.append("Collect more conversion data before making aggressive campaign decisions.")
    else:
        opportunities.append("Compare your strongest campaign with lower-performing campaigns to identify repeatable differences.")

    evidence = [
        {"label": "Campaigns analyzed", "value": f"{campaign_count:,}"},
        {"label": "Impressions reviewed", "value": f"{_integer(current_total.get('impressions')):,}"},
        {"label": "Clicks reviewed", "value": f"{_integer(current_total.get('clicks')):,}"},
        {"label": "Conversions reviewed", "value": f"{_num(current_total.get('conversions')):.2f}"},
    ]

    strongest_metrics = strongest.get("current") or {}
    strongest_reason = []
    if _num(strongest_metrics.get("conversions")) > 0:
        strongest_reason.append(f"{_num(strongest_metrics.get('conversions')):.2f} conversions")
    if _num(strongest_metrics.get("ctr")) > 0:
        strongest_reason.append(f"{_pct(strongest_metrics.get('ctr'))} CTR")
    if _num(strongest_metrics.get("roas")) > 0:
        strongest_reason.append(f"{_num(strongest_metrics.get('roas')):.2f}x ROAS")

    return {
        "confidence": overall_confidence,
        "whatThisMeans": (
            "Performance is moving within ADGen's current evidence thresholds. "
            "This does not mean every campaign is fully optimized; it means no material negative trend was strong enough to require immediate attention."
        ),
        "workingWell": positives[:4],
        "opportunities": opportunities[:4],
        "evidence": evidence,
        "strongestCampaign": {
            "platformLabel": strongest.get("platformLabel"),
            "campaignName": strongest.get("campaignName"),
            "summary": ", ".join(strongest_reason) if strongest_reason else "Most established delivery in the current period.",
        },
        "recommendation": (
            "Keep the account stable, preserve what is working, and use Performance Intelligence to create one deliberate new test rather than making broad campaign changes."
        ),
        "actions": [
            {"label": "Open Performance Intelligence", "href": "/insights", "kind": "primary"},
            {"label": "Generate a variation", "href": "/adgenerator", "kind": "secondary"},
            {"label": "Open Library", "href": "/library", "kind": "secondary"},
        ],
    }


def _campaign_assessment(snapshot: dict[str, Any], findings: list[dict[str, Any]]) -> dict[str, Any]:
    current = snapshot.get("current") or {}
    previous = snapshot.get("previous") or {}
    campaign_name = str(snapshot.get("campaignName") or "Campaign")
    confidence = str(snapshot.get("confidence") or "low")

    critical = [item for item in findings if item.get("severity") == "critical"]
    warnings = [item for item in findings if item.get("severity") == "warning"]
    opportunities_found = [item for item in findings if item.get("severity") == "opportunity"]

    impressions = _integer(current.get("impressions"))
    clicks = _integer(current.get("clicks"))
    conversions = _num(current.get("conversions"))
    spend = _num(current.get("spend"))

    if critical:
        status, status_label = "priority", "Priority"
        headline = critical[0].get("title") or f"{campaign_name} needs immediate review"
        summary = critical[0].get("summary") or "A material negative change crossed ADGen's priority threshold."
    elif warnings:
        status, status_label = "attention", "Needs attention"
        headline = warnings[0].get("title") or f"{campaign_name} deserves review"
        summary = warnings[0].get("summary") or "A meaningful change crossed ADGen's review threshold."
    elif opportunities_found:
        status, status_label = "opportunity", "Opportunity"
        headline = opportunities_found[0].get("title") or f"{campaign_name} has a positive signal"
        summary = opportunities_found[0].get("summary") or "Performance improved enough to create a learning opportunity."
    elif impressions >= MIN_IMPRESSIONS or clicks >= MIN_CLICKS or spend >= MIN_SPEND:
        status, status_label = "healthy", "Healthy"
        headline = f"{campaign_name} is performing within its expected range"
        summary = "No material decline crossed ADGen's evidence thresholds for this campaign."
    else:
        status, status_label = "learning", "Still learning"
        headline = f"{campaign_name} needs more delivery data"
        summary = "The campaign does not yet have enough recent volume for a reliable performance conclusion."

    strengths: list[str] = []
    concerns = [str(item.get("summary") or item.get("title") or "") for item in [*critical, *warnings] if item.get("summary") or item.get("title")]

    ctr_change = _change(_num(current.get("ctr")), _num(previous.get("ctr")))
    conversion_change = _change(_num(current.get("conversions")), _num(previous.get("conversions")))
    cpc_change = _change(_num(current.get("cpc")), _num(previous.get("cpc")))
    roas_change = None
    if current.get("roas") is not None and previous.get("roas") not in (None, 0):
        roas_change = _change(_num(current.get("roas")), _num(previous.get("roas")))

    if ctr_change is not None and ctr_change >= MEANINGFUL_CHANGE:
        strengths.append(f"CTR improved {abs(ctr_change) * 100:.0f}% versus the comparison period.")
    elif ctr_change is None or abs(ctr_change) < MEANINGFUL_CHANGE:
        strengths.append("Engagement remained within the expected range.")

    if conversion_change is not None and conversion_change >= MEANINGFUL_CHANGE:
        strengths.append(f"Conversion volume improved {abs(conversion_change) * 100:.0f}%.")
    elif conversions > 0 and (conversion_change is None or abs(conversion_change) < MEANINGFUL_CHANGE):
        strengths.append("Recorded conversion volume remained stable.")

    if cpc_change is not None and cpc_change <= -MEANINGFUL_CHANGE:
        strengths.append(f"Average CPC improved {abs(cpc_change) * 100:.0f}%.")
    elif cpc_change is None or cpc_change < MEANINGFUL_CHANGE:
        strengths.append("Click costs did not trigger a material cost warning.")

    if roas_change is not None and roas_change >= MEANINGFUL_CHANGE:
        strengths.append(f"ROAS improved {abs(roas_change) * 100:.0f}%.")

    opportunities: list[str] = []
    if status in {"priority", "attention"}:
        opportunities.append("Review the detailed finding before making broad campaign changes.")
        if any(item.get("creativeRelated") for item in findings):
            opportunities.append("Use the Optimizer or generate one controlled creative variation.")
        else:
            opportunities.append(f"Review this campaign inside {snapshot.get('platformLabel') or 'the ad platform'}." )
    elif status == "opportunity":
        opportunities.append("Identify what changed and preserve the variables associated with the improvement.")
        opportunities.append("Create a controlled variation while the positive signal is active.")
    elif status == "healthy":
        opportunities.append("Preserve the current setup while testing only one deliberate variable at a time.")
        opportunities.append("Compare this campaign with weaker campaigns to identify repeatable differences.")
    else:
        opportunities.append("Allow more impressions, clicks, and conversion data to accumulate before drawing conclusions.")

    evidence = [
        {"label": "Impressions", "value": f"{impressions:,}"},
        {"label": "Clicks", "value": f"{clicks:,}"},
        {"label": "CTR", "value": _pct(current.get("ctr"))},
        {"label": "Conversions", "value": f"{conversions:.2f}"},
    ]
    if spend > 0:
        evidence.append({"label": "Spend", "value": _money(spend)})
    if current.get("cpa") is not None:
        evidence.append({"label": "CPA", "value": _money(current.get("cpa"))})
    if current.get("roas") is not None:
        evidence.append({"label": "ROAS", "value": f"{_num(current.get('roas')):.2f}x"})

    primary_finding = (critical or warnings or opportunities_found or findings or [None])[0]
    if primary_finding:
        top_action_level = str(primary_finding.get("actionLevel") or "review")
        top_action = str(
            primary_finding.get("recommendedAction")
            or "Review the detailed evidence before making a campaign change."
        )
    elif status == "healthy":
        top_action_level = "monitor"
        top_action = "Keep this campaign stable and test only one deliberate variable at a time."
    else:
        top_action_level = "monitor"
        top_action = "Allow more delivery and conversion data to accumulate before making a material change."

    return {
        "id": f"{snapshot.get('platform')}:{snapshot.get('campaignId')}:assessment",
        "platform": snapshot.get("platform"),
        "platformLabel": snapshot.get("platformLabel"),
        "campaignId": str(snapshot.get("campaignId") or ""),
        "campaignName": campaign_name,
        "status": status,
        "statusLabel": status_label,
        "confidence": confidence,
        "headline": headline,
        "summary": summary,
        "actionLevel": top_action_level,
        "recommendedAction": top_action,
        "strengths": strengths[:4],
        "concerns": concerns[:4],
        "opportunities": opportunities[:3],
        "evidence": evidence,
        "currentPeriod": current,
        "previousPeriod": previous,
        "findingIds": [str(item.get("id")) for item in findings if item.get("id")],
        "readOnly": True,
    }


def _campaign_assessments(snapshots: list[dict[str, Any]], findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for item in findings:
        grouped[(str(item.get("platform") or ""), str(item.get("campaignId") or ""))].append(item)

    assessments = [
        _campaign_assessment(
            snapshot,
            grouped.get((str(snapshot.get("platform") or ""), str(snapshot.get("campaignId") or "")), []),
        )
        for snapshot in snapshots
    ]
    status_order = {"priority": 0, "attention": 1, "opportunity": 2, "healthy": 3, "learning": 4}
    confidence_order = {"high": 0, "medium": 1, "low": 2}
    assessments.sort(
        key=lambda item: (
            status_order.get(str(item.get("status")), 99),
            confidence_order.get(str(item.get("confidence")), 99),
            str(item.get("campaignName") or "").lower(),
        )
    )
    return assessments



def _performance_intelligence_context(uid: str) -> dict[str, Any]:
    """Read the existing creative profile without rebuilding or changing it."""
    try:
        from performance_intelligence.service import generation_profile

        result = generation_profile(uid) or {}
        profile = result.get("profile") or {}

        def top_value(key: str) -> str | None:
            values = profile.get(key) or []
            if isinstance(values, dict):
                values = values.get("items") or values.get("values") or []
            if not isinstance(values, list) or not values:
                return None
            first = values[0]
            if isinstance(first, dict):
                return str(first.get("value") or first.get("label") or first.get("name") or "").strip() or None
            return str(first or "").strip() or None

        traits = []
        trait_map = [
            ("Visual style", "top_visual_styles"),
            ("Composition", "top_compositions"),
            ("CTA opener", "top_cta_openers"),
            ("Headline opener", "top_headline_openers"),
            ("Background", "top_backgrounds"),
            ("Imagery", "top_imagery_types"),
        ]
        for label, key in trait_map:
            value = top_value(key)
            if value:
                traits.append({"label": label, "value": value.replace("_", " ")})

        return {
            "available": bool(traits),
            "confidence": result.get("confidence", 0),
            "evidenceCount": int(result.get("evidenceCount") or 0),
            "qualifiedCount": int(result.get("qualifiedCount") or 0),
            "positiveCount": int(result.get("positiveCount") or 0),
            "traits": traits[:6],
            "recommendation": (
                "Use these learned traits as controlled inputs when a campaign finding points to a creative issue."
                if traits
                else "Performance Intelligence needs more qualified creative evidence before it can guide campaign-specific creative tests."
            ),
        }
    except Exception as exc:
        return {
            "available": False,
            "confidence": 0,
            "evidenceCount": 0,
            "qualifiedCount": 0,
            "positiveCount": 0,
            "traits": [],
            "recommendation": "Performance Intelligence is unavailable for this briefing.",
            "note": str(exc)[:180],
        }


def _cross_platform_insights(snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_platform: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in snapshots:
        by_platform[str(item.get("platform") or "")].append(item)
    if not by_platform.get("google_ads") or not by_platform.get("meta_ads"):
        return []

    totals = {
        platform: {
            "current": _aggregate([item.get("current") or {} for item in items]),
            "previous": _aggregate([item.get("previous") or {} for item in items]),
        }
        for platform, items in by_platform.items()
    }
    g, m = totals["google_ads"], totals["meta_ads"]
    g_ctr = _change(_num(g["current"].get("ctr")), _num(g["previous"].get("ctr")))
    m_ctr = _change(_num(m["current"].get("ctr")), _num(m["previous"].get("ctr")))
    g_conv = _change(_num(g["current"].get("conversions")), _num(g["previous"].get("conversions")))
    m_conv = _change(_num(m["current"].get("conversions")), _num(m["previous"].get("conversions")))
    rows: list[dict[str, Any]] = []

    if g_ctr is not None and m_ctr is not None:
        if g_ctr <= -MEANINGFUL_CHANGE and m_ctr <= -MEANINGFUL_CHANGE:
            rows.append({
                "category": "creative",
                "status": "attention",
                "title": "Engagement weakened across both platforms",
                "summary": "Google and Meta both recorded a meaningful CTR decline. A shared creative or offer issue becomes more plausible, although audience and delivery differences still need review.",
                "confidence": "medium",
            })
        elif g_ctr <= -MEANINGFUL_CHANGE and abs(m_ctr) < MEANINGFUL_CHANGE:
            rows.append({
                "category": "performance",
                "status": "learning",
                "title": "The engagement decline appears isolated to Google",
                "summary": "Meta engagement remained comparatively stable while Google CTR declined. Search intent, keyword-to-ad alignment, or Google-specific delivery deserves more attention than a broad creative conclusion.",
                "confidence": "medium",
            })
        elif m_ctr <= -MEANINGFUL_CHANGE and abs(g_ctr) < MEANINGFUL_CHANGE:
            rows.append({
                "category": "performance",
                "status": "learning",
                "title": "The engagement decline appears isolated to Meta",
                "summary": "Google engagement remained comparatively stable while Meta CTR declined. Audience mix, frequency, placements, or Meta-specific creative delivery deserves review.",
                "confidence": "medium",
            })
        elif g_ctr >= MEANINGFUL_CHANGE and m_ctr >= MEANINGFUL_CHANGE:
            rows.append({
                "category": "opportunity",
                "status": "opportunity",
                "title": "Engagement improved across both platforms",
                "summary": "Google and Meta both moved positively. Review recent creative, offer, and messaging changes for patterns worth preserving.",
                "confidence": "medium",
            })

    if g_conv is not None and m_conv is not None and g_conv * m_conv < 0:
        improving = "Google" if g_conv > 0 else "Meta"
        weakening = "Meta" if g_conv > 0 else "Google"
        rows.append({
            "category": "performance",
            "status": "learning",
            "title": f"Conversion direction differs by platform",
            "summary": f"{improving} conversion volume improved while {weakening} moved lower. Treat the issue as platform-specific until more evidence suggests a shared cause.",
            "confidence": "medium",
        })
    return rows[:4]


def _campaign_memory(uid: str, assessments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        from .store import list_briefings
        history = list_briefings(uid, limit=8)
    except Exception:
        return []
    previous = history[0] if history else None
    if not previous:
        return []
    old_by_id = {
        f"{item.get('platform')}:{item.get('campaignId')}": item
        for item in (previous.get("campaignAssessments") or [])
    }
    memory = []
    for item in assessments:
        key = f"{item.get('platform')}:{item.get('campaignId')}"
        old = old_by_id.get(key)
        if not old:
            continue
        old_status, new_status = old.get("status"), item.get("status")
        if old_status == new_status:
            if new_status in {"priority", "attention"}:
                message = "This campaign remains flagged from the previous saved briefing."
            else:
                continue
        elif old_status in {"priority", "attention"} and new_status in {"healthy", "opportunity"}:
            message = "This campaign improved from its previous flagged state."
        elif old_status in {"healthy", "opportunity"} and new_status in {"priority", "attention"}:
            message = "This campaign newly moved into a review state."
        else:
            message = f"Campaign status changed from {old.get('statusLabel') or old_status} to {item.get('statusLabel') or new_status}."
        memory.append({
            "platformLabel": item.get("platformLabel"),
            "campaignName": item.get("campaignName"),
            "previousStatus": old_status,
            "currentStatus": new_status,
            "message": message,
        })
    return memory[:8]


def _briefing_sections(assessments: list[dict[str, Any]], findings: list[dict[str, Any]]) -> dict[str, Any]:
    working = []
    attention = []
    tests = []
    for item in assessments:
        if item.get("status") in {"healthy", "opportunity"}:
            working.append({
                "platformLabel": item.get("platformLabel"),
                "campaignName": item.get("campaignName"),
                "text": (item.get("strengths") or [item.get("summary")])[0],
            })
        if item.get("status") in {"priority", "attention"}:
            attention.append({
                "platformLabel": item.get("platformLabel"),
                "campaignName": item.get("campaignName"),
                "text": item.get("summary"),
            })
        for opportunity in (item.get("opportunities") or [])[:1]:
            tests.append({
                "platformLabel": item.get("platformLabel"),
                "campaignName": item.get("campaignName"),
                "text": opportunity,
            })
    return {"working": working[:5], "attention": attention[:5], "tests": tests[:5]}

SEVERITY_ORDER = {"critical": 0, "warning": 1, "opportunity": 2, "healthy": 3, "info": 4}
CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}


def _health(
    findings: list[dict[str, Any]],
    campaign_count: int,
    assessments: list[dict[str, Any]],
) -> dict[str, Any]:
    critical = sum(1 for item in findings if item.get("severity") == "critical")
    warnings = sum(1 for item in findings if item.get("severity") == "warning")
    opportunities = sum(1 for item in assessments if item.get("status") == "opportunity")
    healthy = sum(1 for item in assessments if item.get("status") == "healthy")
    learning = sum(1 for item in assessments if item.get("status") == "learning")
    priority_campaigns = sum(1 for item in assessments if item.get("status") == "priority")
    attention_campaigns = sum(1 for item in assessments if item.get("status") == "attention")

    if priority_campaigns:
        status, label = "priority", "Priority"
    elif attention_campaigns:
        status, label = "attention", "Needs attention"
    elif campaign_count:
        status, label = "healthy", "Stable"
    else:
        status, label = "learning", "Learning"

    return {
        "status": status,
        "label": label,
        "critical": critical,
        "warnings": warnings,
        "opportunities": opportunities,
        "healthy": healthy,
        "learning": learning,
        "priorityCampaigns": priority_campaigns,
        "attentionCampaigns": attention_campaigns,
        "campaignsAnalyzed": campaign_count,
    }


def build_briefing(uid: str, date_range: str = "LAST_30_DAYS", platform_filter: str = "all") -> dict[str, Any]:
    from .store import save_briefing

    normalized_range = str(date_range or "LAST_30_DAYS").upper()
    findings, platforms, notes, campaign_count, comparison_label, snapshots = _platform_data(uid, normalized_range, platform_filter)
    findings.sort(key=lambda item: (SEVERITY_ORDER.get(item.get("severity"), 99), CONFIDENCE_ORDER.get(item.get("confidence"), 99), item.get("campaignName") or ""))

    assessments = _campaign_assessments(snapshots, findings)
    top = findings[0] if findings else None
    urgent_count = sum(1 for item in assessments if item.get("status") in {"priority", "attention"})
    opportunity_count = sum(1 for item in assessments if item.get("status") == "opportunity")
    healthy_count = sum(1 for item in assessments if item.get("status") == "healthy")
    learning_count = sum(1 for item in assessments if item.get("status") == "learning")
    health = _health(findings, campaign_count, assessments)
    healthy_analysis = _healthy_analysis(snapshots, platforms, campaign_count) if platforms and not findings else {}

    if not platforms:
        headline = "Connect campaign data to begin"
        summary = "Campaign Intelligence needs saved Google Ads or Meta Ads history before it can prepare a briefing."
    elif not findings:
        headline = "Performance is stable"
        status_parts = []
        if healthy_count:
            status_parts.append(f"{healthy_count} healthy")
        if learning_count:
            status_parts.append(f"{learning_count} still learning")
        status_text = ", ".join(status_parts) if status_parts else "stable overall"
        summary = (
            f"ADGen reviewed {campaign_count} campaign{'s' if campaign_count != 1 else ''} across {', '.join(platforms)}. "
            f"Campaign-by-campaign status: {status_text}. No material negative change crossed the evidence thresholds for {comparison_label}."
        )
    else:
        headline = "Your campaign briefing"
        parts = []
        if urgent_count:
            parts.append(f"{urgent_count} campaign{'s' if urgent_count != 1 else ''} deserve attention")
        if opportunity_count:
            parts.append(f"{opportunity_count} campaign opportunity{'ies' if opportunity_count != 1 else 'y'} appeared")
        if healthy_count:
            parts.append(f"{healthy_count} campaign{'s remain' if healthy_count != 1 else ' remains'} healthy")
        if learning_count:
            parts.append(f"{learning_count} campaign{'s need' if learning_count != 1 else ' needs'} more data")
        summary = (
            f"ADGen reviewed {campaign_count} campaign{'s' if campaign_count != 1 else ''} across {', '.join(platforms)}. "
            + (", ".join(parts) if parts else f"{len(findings)} notable changes were found")
            + "."
        )

    pi_context = _performance_intelligence_context(uid)
    cross_platform = _cross_platform_insights(snapshots)
    memory = _campaign_memory(uid, assessments)
    sections = _briefing_sections(assessments, findings)

    executive_briefing = {
        "greeting": "Campaign briefing",
        "overview": summary,
        "whatChanged": (
            sections.get("attention", [])[:3]
            if sections.get("attention")
            else [{"text": "No material negative campaign change crossed ADGen's current thresholds."}]
        ),
        "whatIsWorking": sections.get("working", [])[:3],
        "whatToTest": sections.get("tests", [])[:3],
        "estimatedReviewTime": "30–60 seconds",
    }

    briefing = {
        "generatedAt": int(time.time()),
        "readOnly": True,
        "dateRange": normalized_range,
        "platformFilter": platform_filter,
        "analysisMetadata": {
            "lookback": normalized_range,
            "platformFilter": platform_filter,
            "campaignsAnalyzed": campaign_count,
            "platformsAnalyzed": platforms,
            "impressionsReviewed": sum(int((item.get("currentPeriod") or {}).get("impressions") or 0) for item in assessments),
            "clicksReviewed": sum(int((item.get("currentPeriod") or {}).get("clicks") or 0) for item in assessments),
            "conversionsReviewed": round(sum(float((item.get("currentPeriod") or {}).get("conversions") or 0) for item in assessments), 2),
            "engineVersion": "Campaign Intelligence 2B.3",
        },
        "comparisonLabel": comparison_label,
        "headline": headline,
        "summary": summary,
        "health": health,
        "topPriorityId": top.get("id") if top else None,
        "topPriorityText": f"Review {top.get('campaignName')}: {top.get('title')}." if top else "No single campaign requires immediate attention based on the available evidence.",
        "campaignsAnalyzed": campaign_count,
        "platformsAnalyzed": platforms,
        "campaignAssessments": assessments,
        "findings": findings[:40],
        "dataNotes": notes,
        "healthyAnalysis": healthy_analysis,
        "executiveBriefing": executive_briefing,
        "crossPlatformInsights": cross_platform,
        "performanceIntelligence": pi_context,
        "campaignMemory": memory,
        "briefingSections": sections,
    }
    save_briefing(uid, briefing)
    return briefing

