from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


AssetStatus = Literal["draft", "active", "paused", "archived"]
AssetType = Literal["image"]


class AssetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    alt_text: Optional[str] = Field(default=None, max_length=500)
    click_through_url: Optional[HttpUrl] = None
    tracking_pixels: Optional[list[HttpUrl]] = Field(default=None, max_length=2)
    status: Optional[AssetStatus] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Asset name cannot be blank.")
        return cleaned

    @field_validator("alt_text")
    @classmethod
    def clean_alt_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("tracking_pixels")
    @classmethod
    def validate_tracking_pixels(
        cls,
        values: Optional[list[HttpUrl]],
    ) -> Optional[list[HttpUrl]]:
        if values is None:
            return None

        normalized = [str(value) for value in values]
        if len(set(normalized)) != len(normalized):
            raise ValueError("Tracking pixel URLs must be unique.")
        if any(not value.startswith("https://") for value in normalized):
            raise ValueError("Tracking pixel URLs must use HTTPS.")
        return values


class AssetResponse(BaseModel):
    id: str
    campaign_id: str
    line_item_id: str
    uid: str
    name: str
    asset_type: AssetType = "image"
    file_url: str
    storage_path: str
    mime_type: str
    file_size: int
    original_filename: str
    width: int = 0
    height: int = 0
    aspect_ratio: float = 0
    alt_text: Optional[str] = None
    click_through_url: str
    tracking_pixels: list[str] = Field(default_factory=list)
    status: AssetStatus = "active"
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None


class AssetListResponse(BaseModel):
    items: list[AssetResponse]
    count: int
