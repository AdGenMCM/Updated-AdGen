# optimizer_schemas.py
from pydantic import BaseModel, Field
from typing import Optional, Literal, List

AudienceTemp = Literal["cold", "warm", "retargeting"]
Platform = Literal["meta", "google", "tiktok", "linkedin", "other"]

class OptimizationMetrics(BaseModel):
    ctr: Optional[float] = None
    cpc: Optional[float] = None
    cpa: Optional[float] = None
    spend: Optional[float] = None
    impressions: Optional[int] = None
    clicks: Optional[int] = None
    conversions: Optional[int] = None
    roas: Optional[float] = None
    frequency: Optional[float] = None
    cpm: Optional[float] = None

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

    # Extra optimizer inputs (match Optimizer.js)
    flight_start: Optional[str] = None
    flight_end: Optional[str] = None
    placements: Optional[str] = None
    objective: Optional[str] = None
    audience_size: Optional[int] = None
    budget_type: Optional[str] = None
    conversion_event: Optional[str] = None
    geo: Optional[str] = None
    device: Optional[str] = None

    # Current creative (paste)
    current_headline: Optional[str] = None
    current_primary_text: Optional[str] = None
    current_cta: Optional[str] = None
    current_image_prompt: Optional[str] = None

    # Uploaded creatives (URLs from /upload-creatives)
    creative_image_urls: Optional[List[str]] = None

    # Metrics
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




