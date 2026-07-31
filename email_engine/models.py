from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class TestWelcomeEmailRequest(BaseModel):
    allowRepeat: bool = Field(
        default=False,
        description=(
            "When false, the same authenticated account can receive only one "
            "test welcome email. Set true only when intentionally retesting."
        ),
    )


class CompleteOnboardingRequest(BaseModel):
    authProvider: str = Field(
        default="email",
        max_length=40,
        description="Authentication provider used to create the account.",
    )


class EmailStatusResponse(BaseModel):
    configured: bool
    sender: Optional[str] = None
    appUrl: str


class EmailSendResponse(BaseModel):
    sent: bool
    skipped: bool = False
    reason: Optional[str] = None
    deliveryId: Optional[str] = None
    providerMessageId: Optional[str] = None


class CompleteOnboardingResponse(EmailSendResponse):
    ok: bool = True
    intelligenceEventRecorded: bool = False


class LifecycleTestRequest(BaseModel):
    campaign: Optional[str] = Field(default=None, max_length=80)
    bypassCooldown: bool = False


class LifecycleRunRequest(BaseModel):
    limit: Optional[int] = Field(default=None, ge=1, le=5000)
