from typing import Any, Literal
from pydantic import BaseModel, Field


class EvidenceItem(BaseModel):
    label: str
    value: str


class ActionItem(BaseModel):
    label: str
    href: str
    kind: str = "secondary"


class CampaignFinding(BaseModel):
    id: str
    platform: Literal["google_ads", "meta_ads"]
    platformLabel: str
    campaignId: str | None = None
    campaignName: str
    category: Literal["performance", "delivery", "creative", "tracking", "opportunity", "learning"]
    severity: Literal["critical", "warning", "opportunity", "healthy", "info"]
    confidence: Literal["low", "medium", "high"]
    title: str
    summary: str
    whyItMatters: str
    interpretation: str
    reviewItems: list[str] = Field(default_factory=list)
    actionLevel: Literal["do_now", "test", "review", "monitor"] = "review"
    recommendedAction: str = "Review the supporting evidence before making a change."
    whyThisAction: str | None = None
    watchNext: str | None = None
    evidence: list[EvidenceItem] = Field(default_factory=list)
    currentPeriod: dict[str, Any] = Field(default_factory=dict)
    previousPeriod: dict[str, Any] = Field(default_factory=dict)
    creativeRelated: bool = False
    readOnly: bool = True
    comparisonLabel: str | None = None
    actions: list[ActionItem] = Field(default_factory=list)


class CampaignAssessment(BaseModel):
    id: str
    platform: Literal["google_ads", "meta_ads"]
    platformLabel: str
    campaignId: str
    campaignName: str
    status: Literal[
        "priority",
        "attention",
        "opportunity",
        "healthy",
        "learning",
        "paused",
        "ended",
    ]
    statusLabel: str
    analysisStatus: Literal["priority", "attention", "opportunity", "healthy", "learning"] | None = None
    analysisStatusLabel: str | None = None
    campaignDeliveryStatus: Literal["active", "paused", "ended", "unknown"] = "unknown"
    campaignDeliveryLabel: str | None = None
    rawCampaignStatus: str | None = None
    isActive: bool = True
    confidence: Literal["low", "medium", "high"]
    headline: str
    summary: str
    historicalHeadline: str | None = None
    historicalSummary: str | None = None
    actionLevel: Literal["do_now", "test", "review", "monitor"] = "review"
    recommendedAction: str = "Review the supporting evidence before making a change."
    whyThisAction: str | None = None
    watchNext: str | None = None
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    opportunities: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    currentPeriod: dict[str, Any] = Field(default_factory=dict)
    previousPeriod: dict[str, Any] = Field(default_factory=dict)
    findingIds: list[str] = Field(default_factory=list)
    readOnly: bool = True


class CampaignAnalysisRequest(BaseModel):
    dateRange: Literal[
        "TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_14_DAYS",
        "LAST_30_DAYS", "LAST_90_DAYS", "THIS_MONTH", "LAST_MONTH", "MAXIMUM"
    ] = "LAST_30_DAYS"
    platforms: Literal["all", "google_ads", "meta_ads"] = "all"

class CampaignBriefingResponse(BaseModel):
    generatedAt: int
    readOnly: bool = True
    dateRange: str = "LAST_30_DAYS"
    platformFilter: str = "all"
    analysisMetadata: dict[str, Any] = Field(default_factory=dict)
    comparisonLabel: str | None = None
    headline: str
    summary: str
    health: dict[str, Any] = Field(default_factory=dict)
    topPriorityId: str | None = None
    topPriorityText: str
    topRecommendation: dict[str, Any] = Field(default_factory=dict)
    campaignsAnalyzed: int
    platformsAnalyzed: list[str] = Field(default_factory=list)
    campaignAssessments: list[CampaignAssessment] = Field(default_factory=list)
    findings: list[CampaignFinding] = Field(default_factory=list)
    dataNotes: list[str] = Field(default_factory=list)
    healthyAnalysis: dict[str, Any] = Field(default_factory=dict)
    executiveBriefing: dict[str, Any] = Field(default_factory=dict)
    crossPlatformInsights: list[dict[str, Any]] = Field(default_factory=list)
    performanceIntelligence: dict[str, Any] = Field(default_factory=dict)
    campaignMemory: list[dict[str, Any]] = Field(default_factory=list)
    briefingSections: dict[str, Any] = Field(default_factory=dict)
