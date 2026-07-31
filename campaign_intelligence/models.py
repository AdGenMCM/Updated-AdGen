from typing import Any, Literal

from pydantic import BaseModel, Field


class EvidenceItem(BaseModel):
    label: str
    value: str


class CampaignFinding(BaseModel):
    id: str
    platform: Literal["google_ads", "meta_ads"]
    platformLabel: str
    campaignId: str | None = None
    campaignName: str
    category: Literal[
        "performance",
        "delivery",
        "creative",
        "tracking",
        "opportunity",
    ]
    severity: Literal["critical", "warning", "opportunity", "healthy", "info"]
    confidence: Literal["low", "medium", "high"]
    title: str
    summary: str
    whyItMatters: str
    interpretation: str
    reviewItems: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    currentPeriod: dict[str, Any] = Field(default_factory=dict)
    previousPeriod: dict[str, Any] = Field(default_factory=dict)
    creativeRelated: bool = False
    readOnly: bool = True


class CampaignBriefingResponse(BaseModel):
    generatedAt: int
    readOnly: bool = True
    headline: str
    summary: str
    topPriorityId: str | None = None
    topPriorityText: str
    campaignsAnalyzed: int
    platformsAnalyzed: list[str] = Field(default_factory=list)
    findings: list[CampaignFinding] = Field(default_factory=list)
    dataNotes: list[str] = Field(default_factory=list)
