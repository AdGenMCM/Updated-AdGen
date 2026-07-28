from pydantic import BaseModel, Field


class OAuthStartResponse(BaseModel):
    authorizationUrl: str


class SelectCustomerBody(BaseModel):
    customerId: str = Field(min_length=1, max_length=32)
    customerName: str | None = Field(default=None, max_length=160)
    loginCustomerId: str | None = Field(default=None, max_length=32)
    manager: bool = False
