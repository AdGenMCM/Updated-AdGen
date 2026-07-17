from typing import Literal, Optional

from pydantic import BaseModel, Field


InventoryChannel = Literal["web", "email", "mobile_app"]
InventoryFormat = Literal["image"]


class InventoryTemplate(BaseModel):
    id: str
    name: str
    channel: InventoryChannel
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    format: InventoryFormat = "image"
    description: Optional[str] = None
    active: bool = True
    max_file_size_mb: int = 10
    accepted_mime_types: list[str] = Field(
        default_factory=lambda: ["image/jpeg", "image/png", "image/webp", "image/gif"]
    )
    supports_click_url: bool = True
    supports_tracking_pixels: bool = True


class InventoryTemplateListResponse(BaseModel):
    items: list[InventoryTemplate]
    count: int


class InventoryAssignment(BaseModel):
    inventory_id: str
    asset_ids: list[str] = Field(default_factory=list)


class LineItemInventoryItem(InventoryTemplate):
    compatible_asset_ids: list[str] = Field(default_factory=list)
    selected_asset_ids: list[str] = Field(default_factory=list)
    selected: bool = False
    needs_attention: bool = False


class LineItemInventoryResponse(BaseModel):
    items: list[LineItemInventoryItem]
    count: int
    compatible_count: int
    selected_count: int


class LineItemInventoryUpdate(BaseModel):
    assignments: list[InventoryAssignment] = Field(default_factory=list, max_length=100)
