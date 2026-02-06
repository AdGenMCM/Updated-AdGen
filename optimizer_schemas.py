# optimizer_schemas.py
from pydantic import BaseModel, Field
from typing import Optional, Literal, List

AudienceTemp = Literal["cold", "warm", "retargeting"]
Platform = Literal["meta", "google", "tiktok", "linkedin", "other"]

class OptimizationMetrics(BaseModel):
    ctr: Optional[float] = None      # percent (e.g., 1.2 for 1.2%)
    cpc: Optional[float] = None
    cpa: Optional[float] = None
    spend: Optional[float] = None
    impressions: Optional[int] = None
    clicks: Optional[int] = None
    conversions: Optional[int] = None
    roas: Optional[float] = None
    frequency: Optional[float] = None

class OptimizeAdRequest(BaseModel):
    # Context
    product_name: str
    description: str
    audience: str
    tone: str
    platform: Platform = "meta"
    offer: Optional[str] = None
    goal: Optional[str] = None
    audience_temp: AudienceTemp = "cold"
    notes: Optional[str] = None

    # Current creative
    current_headline: Optional[str] = None
    current_primary_text: Optional[str] = None
    current_cta: Optional[str] = None
    current_image_prompt: Optional[str] = None

    metrics: OptimizationMetrics = Field(default_factory=OptimizationMetrics)

class OptimizeAdResponse(BaseModel):
    summary: str
    likely_issues: List[str]
    recommended_changes: List[str]
    improved_headline: str
    improved_primary_text: str
    improved_cta: str
    improved_image_prompt: str
    confidence: Literal["low", "medium", "high"] = "medium"


