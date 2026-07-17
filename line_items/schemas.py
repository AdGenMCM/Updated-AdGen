from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


LineItemStatus = Literal[
    "draft",
    "scheduled",
    "active",
    "paused",
    "completed",
    "archived",
]

BillingModel = Literal["cpm", "cpc"]
BudgetType = Literal["daily", "lifetime"]
DeliveryChannel = Literal["web", "email", "mobile_app"]
FrequencyWindow = Literal["day", "7_days"]


class LineItemBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    billing_model: BillingModel = "cpm"
    budget_type: BudgetType = "lifetime"
    budget_amount: float = Field(gt=0)
    bid_amount: float = Field(gt=0)
    currency: Literal["USD"] = "USD"

    start_at: datetime
    end_at: datetime
    status: LineItemStatus = "draft"

    channels: list[DeliveryChannel] = Field(default_factory=list, min_length=1, max_length=3)
    inventory_assignments: list[dict] = Field(default_factory=list)

    frequency_cap_count: Optional[int] = Field(default=None, ge=1, le=100)
    frequency_cap_window: Optional[FrequencyWindow] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Line-item name is required.")
        return cleaned

    @field_validator("channels")
    @classmethod
    def deduplicate_channels(
        cls,
        values: list[DeliveryChannel],
    ) -> list[DeliveryChannel]:
        return list(dict.fromkeys(values))

    @model_validator(mode="after")
    def validate_line_item(self):
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be later than start_at.")

        has_count = self.frequency_cap_count is not None
        has_window = self.frequency_cap_window is not None
        if has_count != has_window:
            raise ValueError(
                "frequency_cap_count and frequency_cap_window must be provided together."
            )

        return self


class LineItemCreate(LineItemBase):
    pass


class LineItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    billing_model: Optional[BillingModel] = None
    budget_type: Optional[BudgetType] = None
    budget_amount: Optional[float] = Field(default=None, gt=0)
    bid_amount: Optional[float] = Field(default=None, gt=0)
    currency: Optional[Literal["USD"]] = None

    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    status: Optional[LineItemStatus] = None

    channels: Optional[list[DeliveryChannel]] = Field(
        default=None,
        min_length=1,
        max_length=3,
    )
    inventory_assignments: Optional[list[dict]] = None

    frequency_cap_count: Optional[int] = Field(default=None, ge=1, le=100)
    frequency_cap_window: Optional[FrequencyWindow] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Line-item name cannot be blank.")
        return cleaned

    @field_validator("channels")
    @classmethod
    def deduplicate_channels(
        cls,
        values: Optional[list[DeliveryChannel]],
    ) -> Optional[list[DeliveryChannel]]:
        if values is None:
            return None
        return list(dict.fromkeys(values))


class LineItemResponse(LineItemBase):
    id: str
    campaign_id: str
    uid: str
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None


class LineItemListResponse(BaseModel):
    items: list[LineItemResponse]
    count: int
