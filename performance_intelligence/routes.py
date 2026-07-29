import io
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from .auth import require_intelligence_user
from .models import AnalyzeCreativeRequest, QualificationThresholds, RebuildRequest
from .reporting import ALLOWED_METRICS, ALLOWED_SECTIONS, build_csv_zip, build_excel_report
from .service import (
    analyze_one,
    generation_profile,
    get_summary,
    get_thresholds,
    rebuild_intelligence,
    rebuild_summary,
    refresh_status,
    save_thresholds,
)
from .store import get_evidence, get_refresh_sessions

router = APIRouter(prefix="/performance-intelligence", tags=["Performance Intelligence"])


@router.get("")
def intelligence_summary(user=Depends(require_intelligence_user)):
    return get_summary(user["uid"])


@router.get("/generation-profile")
def intelligence_generation_profile(user=Depends(require_intelligence_user)):
    return generation_profile(user["uid"])


@router.get("/refresh-status")
def intelligence_refresh_status(user=Depends(require_intelligence_user)):
    return refresh_status(user["uid"])


@router.get("/learning-timeline")
def intelligence_learning_timeline(
    limit: int = Query(default=25, ge=1, le=200),
    user=Depends(require_intelligence_user),
):
    items = get_refresh_sessions(user["uid"], limit=limit)
    return {"count": len(items), "sessions": items}


@router.get("/evidence")
def intelligence_evidence(
    limit: int = Query(default=250, ge=1, le=1000),
    status: str | None = Query(default=None),
    source: str | None = Query(default=None),
    user=Depends(require_intelligence_user),
):
    items = get_evidence(user["uid"], limit=limit)
    if status:
        items = [item for item in items if item.get("evidence_status") == status]
    if source:
        items = [item for item in items if item.get("source") == source]
    return {"count": len(items), "evidence": items}


@router.post("/analyze")
def intelligence_analyze(payload: AnalyzeCreativeRequest, user=Depends(require_intelligence_user)):
    try:
        return analyze_one(uid=user["uid"], payload=payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Creative analysis failed: {str(exc)[:300]}") from exc


@router.post("/rebuild")
def intelligence_rebuild(payload: RebuildRequest, user=Depends(require_intelligence_user)):
    try:
        return rebuild_intelligence(uid=user["uid"], payload=payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Intelligence rebuild failed: {str(exc)[:300]}") from exc


@router.post("/recalculate")
def intelligence_recalculate(user=Depends(require_intelligence_user)):
    return rebuild_summary(user["uid"])


@router.get("/thresholds")
def intelligence_thresholds(user=Depends(require_intelligence_user)):
    return get_thresholds(user["uid"]).model_dump()


@router.put("/thresholds")
def update_intelligence_thresholds(payload: QualificationThresholds, user=Depends(require_intelligence_user)):
    save_thresholds(user["uid"], payload)
    summary = rebuild_summary(user["uid"])
    return {"ok": True, "thresholds": payload.model_dump(), "summary": summary}


def _report_args(payload: dict) -> dict:
    metrics = payload.get("metrics") or []
    sections = payload.get("sections") or []
    invalid_metrics = sorted(set(metrics) - ALLOWED_METRICS)
    invalid_sections = sorted(set(sections) - ALLOWED_SECTIONS)
    if invalid_metrics:
        raise HTTPException(status_code=400, detail=f"Unsupported metrics: {', '.join(invalid_metrics)}")
    if invalid_sections:
        raise HTTPException(status_code=400, detail=f"Unsupported report sections: {', '.join(invalid_sections)}")
    return {
        "metrics": metrics,
        "sections": sections,
        "sources": payload.get("sources") or [],
        "statuses": payload.get("statuses") or [],
        "updated_start": payload.get("updated_start"),
        "updated_end": payload.get("updated_end"),
    }


@router.post("/report/export.xlsx")
def intelligence_export_excel(
    payload: dict = Body(default={}),
    user=Depends(require_intelligence_user),
):
    try:
        content, filename = build_excel_report(user["uid"], **_report_args(payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(exc)[:300]}") from exc
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/report/export.csv")
def intelligence_export_csv(
    payload: dict = Body(default={}),
    user=Depends(require_intelligence_user),
):
    try:
        content, filename = build_csv_zip(user["uid"], **_report_args(payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(exc)[:300]}") from exc
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
