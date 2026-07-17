from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


CampaignStatus = Literal[
    "draft",
    "scheduled",
    "active",
    "paused",
    "completed",
    "archived",
]

CampaignObjective = Literal[
    "awareness",
    "traffic",
    "engagement",
    "leads",
    "sales",
    "conversions",
    "app_installs",
    "other",
]

BudgetType = Literal["daily", "lifetime"]


class CampaignBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    brand_id: Optional[str] = Field(default=None, max_length=128)
    objective: CampaignObjective = "sales"
    status: CampaignStatus = "draft"

    budget_type: BudgetType = "daily"
    budget: Optional[float] = Field(default=None, ge=0)
    currency: Literal["USD"] = "USD"

    start_at: datetime
    end_at: datetime

    description: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Campaign name is required.")

        return cleaned

    @field_validator("brand_id", "description")
    @classmethod
    def clean_optional_text(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be later than start_at.")

        return self


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=120,
    )
    brand_id: Optional[str] = Field(default=None, max_length=128)
    objective: Optional[CampaignObjective] = None
    status: Optional[CampaignStatus] = None

    budget_type: Optional[BudgetType] = None
    budget: Optional[float] = Field(default=None, ge=0)
    currency: Optional[Literal["USD"]] = None

    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None

    description: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def clean_name(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Campaign name cannot be blank.")

        return cleaned

    @field_validator("brand_id", "description")
    @classmethod
    def clean_optional_text(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        cleaned = value.strip()
        return cleaned or None


class CampaignResponse(BaseModel):
    """
    Response model remains backward-compatible with campaigns created before
    scheduling dates became required. New creates still require both dates
    through CampaignCreate.
    """

    id: str
    uid: str

    name: str = Field(min_length=1, max_length=120)
    brand_id: Optional[str] = Field(default=None, max_length=128)
    objective: CampaignObjective = "sales"
    status: CampaignStatus = "draft"

    budget_type: BudgetType = "daily"
    budget: Optional[float] = Field(default=None, ge=0)
    currency: Literal["USD"] = "USD"

    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None

    description: Optional[str] = Field(default=None, max_length=2000)

    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None


class CampaignListResponse(BaseModel):
    items: list[CampaignResponse]
    count: int