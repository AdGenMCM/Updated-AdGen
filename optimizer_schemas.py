# optimizer_schemas.py
from pydantic import BaseModel
from typing import Optional, Literal, List

AudienceTemp = Literal["cold", "warm", "retargeting"]
Platform = Literal["meta", "google", "tiktok", "linkedin", "other"]
Confidence = Literal["low", "medium", "high"]

class OptimizationMetrics(BaseModel):
    # percent (e.g., 1.2 for 1.2%)
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

    # Extra optimization inputs
    flight_start: Optional[str] = None  # "YYYY-MM-DD"
    flight_end: Optional[str] = None    # "YYYY-MM-DD"
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

    # Uploaded creative(s) (Firebase Storage URLs)
    creative_image_urls: Optional[List[str]] = None

    metrics: OptimizationMetrics = OptimizationMetrics()

class OptimizeAdResponse(BaseModel):
    summary: str
    likely_issues: List[str]
    recommended_changes: List[str]
    improved_headline: str
    improved_primary_text: str
    improved_cta: str
    improved_image_prompt: str
    confidence: Confidence = "medium"






