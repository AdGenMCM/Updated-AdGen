from pydantic import BaseModel, Field
from typing import Optional, Literal, List

AudienceTemp = Literal["cold", "warm", "retargeting"]
Platform = Literal["meta", "google", "tiktok", "linkedin", "other"]
AnalysisSource = Literal["manual", "library", "google_ads", "meta_ads"]
Confidence = Literal["low", "medium", "high"]
Impact = Literal["low", "medium", "high"]
AuditStatus = Literal["strong", "watch", "weak"]


class OptimizationMetrics(BaseModel):
    # Percent values use their displayed value, e.g. 1.2 means 1.2%.
    ctr: Optional[float] = None
    cpc: Optional[float] = None
    cpa: Optional[float] = None
    spend: Optional[float] = None
    revenue: Optional[float] = None
    impressions: Optional[int] = None
    clicks: Optional[int] = None
    conversions: Optional[int] = None
    roas: Optional[float] = None
    frequency: Optional[float] = None
    cpm: Optional[float] = None


class OptimizeAdRequest(BaseModel):
    # The source architecture is intentionally generic so future connectors do
    # not require a second Optimizer redesign.
    analysis_source: AnalysisSource = "manual"
    source_label: Optional[str] = None
    source_campaign_id: Optional[str] = None
    source_ad_id: Optional[str] = None
    source_creative_id: Optional[str] = None

    # Campaign and product context
    product_name: str
    description: str
    audience: str
    tone: str
    platform: Platform = "meta"
    offer: Optional[str] = None
    goal: Optional[str] = None
    audience_temp: AudienceTemp = "cold"
    notes: Optional[str] = None

    useBrandKit: bool = True
    brandKitId: Optional[str] = None

    # Extra optimization inputs
    flight_start: Optional[str] = None
    flight_end: Optional[str] = None
    placements: Optional[str] = None
    objective: Optional[str] = None
    audience_size: Optional[int] = None
    budget_type: Optional[str] = None
    conversion_event: Optional[str] = None
    geo: Optional[str] = None
    device: Optional[str] = None

    # Current creative
    current_headline: Optional[str] = None
    current_primary_text: Optional[str] = None
    current_cta: Optional[str] = None
    current_image_prompt: Optional[str] = None
    creative_image_urls: Optional[List[str]] = None

    metrics: OptimizationMetrics = Field(default_factory=OptimizationMetrics)


class AuditDimension(BaseModel):
    name: str
    score: int
    status: AuditStatus
    finding: str


class PriorityRecommendation(BaseModel):
    title: str
    reason: str
    action: str
    impact: Impact


class OptimizeAdResponse(BaseModel):
    summary: str
    overall_score: int = 70
    biggest_opportunity: str = "Creative clarity"
    audit_dimensions: List[AuditDimension] = Field(default_factory=list)
    priority_recommendations: List[PriorityRecommendation] = Field(default_factory=list)

    # Existing fields remain for frontend/backward compatibility.
    likely_issues: List[str]
    recommended_changes: List[str]
    improved_headline: str
    improved_primary_text: str
    improved_cta: str
    improved_image_prompt: str
    confidence: Confidence = "medium"






