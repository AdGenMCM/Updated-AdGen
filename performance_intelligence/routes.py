from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import require_intelligence_user
from .models import (
    AnalyzeCreativeRequest,
    QualificationThresholds,
    RebuildRequest,
)
from .service import (
    analyze_one,
    generation_profile,
    get_summary,
    get_thresholds,
    rebuild_intelligence,
    rebuild_summary,
    save_thresholds,
)
from .store import get_evidence


router = APIRouter(
    prefix="/performance-intelligence",
    tags=["Performance Intelligence"],
)


@router.get("")
def intelligence_summary(
    user=Depends(require_intelligence_user),
):
    return get_summary(user["uid"])


@router.get("/generation-profile")
def intelligence_generation_profile(
    user=Depends(require_intelligence_user),
):
    return generation_profile(user["uid"])


@router.get("/evidence")
def intelligence_evidence(
    limit: int = Query(default=250, ge=1, le=1000),
    status: str | None = Query(default=None),
    source: str | None = Query(default=None),
    user=Depends(require_intelligence_user),
):
    items = get_evidence(user["uid"], limit=limit)

    if status:
        items = [
            item
            for item in items
            if item.get("evidence_status") == status
        ]
    if source:
        items = [
            item
            for item in items
            if item.get("source") == source
        ]

    return {
        "count": len(items),
        "evidence": items,
    }


@router.post("/analyze")
def intelligence_analyze(
    payload: AnalyzeCreativeRequest,
    user=Depends(require_intelligence_user),
):
    try:
        return analyze_one(
            uid=user["uid"],
            payload=payload,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Creative analysis failed: {str(exc)[:300]}",
        ) from exc


@router.post("/rebuild")
def intelligence_rebuild(
    payload: RebuildRequest,
    user=Depends(require_intelligence_user),
):
    try:
        return rebuild_intelligence(
            uid=user["uid"],
            payload=payload,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Intelligence rebuild failed: {str(exc)[:300]}",
        ) from exc


@router.post("/recalculate")
def intelligence_recalculate(
    user=Depends(require_intelligence_user),
):
    return rebuild_summary(user["uid"])


@router.get("/thresholds")
def intelligence_thresholds(
    user=Depends(require_intelligence_user),
):
    return get_thresholds(user["uid"]).model_dump()


@router.put("/thresholds")
def update_intelligence_thresholds(
    payload: QualificationThresholds,
    user=Depends(require_intelligence_user),
):
    save_thresholds(user["uid"], payload)
    summary = rebuild_summary(user["uid"])
    return {
        "ok": True,
        "thresholds": payload.model_dump(),
        "summary": summary,
    }
