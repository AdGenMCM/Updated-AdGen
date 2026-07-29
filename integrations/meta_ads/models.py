from pydantic import BaseModel, Field


class OAuthStartResponse(BaseModel):
    authorizationUrl: str


class SelectAdAccountBody(BaseModel):
    adAccountId: str = Field(min_length=1, max_length=64)
    adAccountName: str | None = Field(default=None, max_length=180)
    businessId: str | None = Field(default=None, max_length=64)
    businessName: str | None = Field(default=None, max_length=180)
