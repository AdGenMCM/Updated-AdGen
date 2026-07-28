from .models import PerformanceEvidence, QualificationThresholds


POSITIVE_LABELS = {"BEST", "GOOD"}
NEGATIVE_LABELS = {"LOW"}


def _safe_ratio(value: float, threshold: float) -> float:
    if threshold <= 0:
        return 1.0
    return min(max(value / threshold, 0.0), 1.0)


def qualify_evidence(
    evidence: PerformanceEvidence,
    thresholds: QualificationThresholds,
) -> PerformanceEvidence:
    impressions = max(int(evidence.impressions or 0), 0)
    clicks = max(int(evidence.clicks or 0), 0)
    conversions = max(float(evidence.conversions or 0), 0.0)
    spend = max(float(evidence.spend or 0), 0.0)
    revenue = max(float(evidence.revenue or 0), 0.0)

    ctr = evidence.ctr_percent
    if ctr is None and impressions > 0:
        ctr = (clicks / impressions) * 100.0

    roas = evidence.roas
    if roas is None and spend > 0:
        roas = revenue / spend

    cpc = evidence.cpc
    if cpc is None and clicks > 0:
        cpc = spend / clicks

    cpa = evidence.cpa
    if cpa is None and conversions > 0:
        cpa = spend / conversions

    cpm = evidence.cpm
    if cpm is None and impressions > 0:
        cpm = (spend / impressions) * 1000.0

    evidence.ctr_percent = round(ctr, 4) if ctr is not None else None
    evidence.roas = round(roas, 4) if roas is not None else None
    evidence.cpc = round(cpc, 4) if cpc is not None else None
    evidence.cpa = round(cpa, 4) if cpa is not None else None
    evidence.cpm = round(cpm, 4) if cpm is not None else None

    volume_parts = [
        _safe_ratio(impressions, thresholds.min_impressions),
        _safe_ratio(clicks, thresholds.min_clicks),
        _safe_ratio(conversions, thresholds.min_conversions),
        _safe_ratio(spend, thresholds.min_spend),
    ]
    volume_score = sum(volume_parts) / len(volume_parts)

    platform_label = str(evidence.platform_label or "").upper()
    performance_score = 0.0

    if roas is not None:
        performance_score = max(
            performance_score,
            _safe_ratio(roas, thresholds.winner_min_roas),
        )
    if ctr is not None:
        performance_score = max(
            performance_score,
            _safe_ratio(ctr, thresholds.winner_min_ctr_percent),
        )
    if platform_label in POSITIVE_LABELS:
        performance_score = max(
            performance_score,
            1.0 if platform_label == "BEST" else 0.75,
        )

    confidence = min(max(evidence.attribution_confidence, 0.0), 1.0)
    evidence.qualification_score = round(
        (volume_score * 0.65 + performance_score * 0.35) * confidence,
        4,
    )

    volume_ready = (
        impressions >= thresholds.min_impressions
        and (
            clicks >= thresholds.min_clicks
            or conversions >= thresholds.min_conversions
            or spend >= thresholds.min_spend
        )
    )

    if not volume_ready:
        evidence.evidence_status = (
            "learning"
            if impressions > 0 or clicks > 0 or spend > 0
            else "insufficient"
        )
        return evidence

    if platform_label in NEGATIVE_LABELS:
        evidence.evidence_status = "underperformer"
        return evidence

    if roas is not None and roas <= thresholds.underperformer_max_roas:
        evidence.evidence_status = "underperformer"
        return evidence

    if (
        platform_label == "BEST"
        or (
            roas is not None
            and roas >= thresholds.winner_min_roas
            and conversions >= thresholds.min_conversions
        )
        or (
            ctr is not None
            and ctr >= thresholds.winner_min_ctr_percent
            and clicks >= thresholds.min_clicks
        )
    ):
        evidence.evidence_status = "winner"
        return evidence

    if (
        platform_label == "GOOD"
        or (roas is not None and roas >= thresholds.strong_min_roas)
        or (
            ctr is not None
            and ctr >= thresholds.strong_min_ctr_percent
        )
    ):
        evidence.evidence_status = "strong"
        return evidence

    evidence.evidence_status = "qualified"
    return evidence
