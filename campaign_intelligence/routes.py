from fastapi import APIRouter, Depends, HTTPException

from .auth import require_campaign_intelligence_user
from .models import CampaignBriefingResponse
from .service import build_briefing


router = APIRouter(
    prefix="/campaign-intelligence",
    tags=["Campaign Intelligence"],
)


@router.get("/briefing", response_model=CampaignBriefingResponse)
def campaign_intelligence_briefing(
    user=Depends(require_campaign_intelligence_user),
):
    try:
        return build_briefing(user["uid"])
    except HTTPException:
        raise
    except Exception as exc:
        print("CAMPAIGN INTELLIGENCE ERROR:", repr(exc), flush=True)
        raise HTTPException(
            status_code=500,
            detail="Campaign Intelligence could not prepare the briefing.",
        ) from exc
