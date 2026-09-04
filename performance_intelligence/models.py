from typing import Any, Literal

from pydantic import BaseModel, Field


EvidenceStatus = Literal[
    "insufficient",
    "learning",
    "qualified",
    "strong",
    "winner",
    "underperformer",
]


class QualificationThresholds(BaseModel):
    min_impressions: int = Field(default=500, ge=0)
    min_clicks: int = Field(default=25, ge=0)
    min_conversions: float = Field(default=2.0, ge=0)
    min_spend: float = Field(default=10.0, ge=0)
    winner_min_roas: float = Field(default=2.0, ge=0)
    strong_min_roas: float = Field(default=1.25, ge=0)
    underperformer_max_roas: float = Field(default=0.75, ge=0)
    winner_min_ctr_percent: float = Field(default=3.0, ge=0)
    strong_min_ctr_percent: float = Field(default=1.5, ge=0)


class CreativeFeatures(BaseModel):
    copy: dict[str, Any] = Field(default_factory=dict)
    image: dict[str, Any] = Field(default_factory=dict)
    video: dict[str, Any] = Field(default_factory=dict)
    source_metadata: dict[str, Any] = Field(default_factory=dict)


class PerformanceEvidence(BaseModel):
    source: str
    source_account_id: str | None = None
    campaign_id: str | None = None
    campaign_name: str | None = None
    ad_group_id: str | None = None
    external_asset_id: str | None = None
    creative_id: str
    deployment_id: str | None = None
    performance_unit_id: str | None = None
    kind: Literal["image", "video", "copy", "mixed"]
    asset_role: str | None = None

    impressions: int = 0
    clicks: int = 0
    spend: float = 0.0
    conversions: float = 0.0
    revenue: float = 0.0
    ctr_percent: float | None = None
    cpc: float | None = None
    cpa: float | None = None
    cpm: float | None = None
    roas: float | None = None

    # Video-native metrics already supported by ADGen Library performance
    # tracking. They are optional so existing evidence remains valid.
    thumb_stop_rate: float | None = None
    view_3s: float | None = None
    view_6s: float | None = None
    hold_rate: float | None = None
    conversion_rate: float | None = None

    platform_label: str | None = None
    attribution_confidence: float = Field(default=1.0, ge=0, le=1)
    evidence_status: EvidenceStatus = "insufficient"
    qualification_score: float = Field(default=0.0, ge=0, le=1)
    features: CreativeFeatures = Field(default_factory=CreativeFeatures)
    raw_metadata: dict[str, Any] = Field(default_factory=dict)


class RebuildRequest(BaseModel):
    include_manual: bool = True
    include_google_ads: bool = True
    include_meta_ads: bool = True

    google_date_range: str = "LAST_30_DAYS"
    google_start_date: str | None = None
    google_end_date: str | None = None

    meta_date_range: str = "LAST_30_DAYS"
    meta_start_date: str | None = None
    meta_end_date: str | None = None

    # Retained for frontend compatibility. The existing adapters decide whether
    # provider synchronization is required/available.
    sync_sources: bool = True
    analyze_media: bool = True


class AnalyzeCreativeRequest(BaseModel):
    creative_id: str
    kind: Literal["image", "video", "copy", "mixed"]
    image_url: str | None = None
    video_url: str | None = None
    headline: str | None = None
    body: str | None = None
    cta: str | None = None
    source: str = "manual"
    source_metadata: dict[str, Any] = Field(default_factory=dict)
