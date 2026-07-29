from __future__ import annotations
from fastapi import APIRouter, Header, Query
from fastapi.responses import StreamingResponse
from auth_helpers import require_user
from .engine import build_report
from .export import build_workbook
from .service import reporting_snapshot
router=APIRouter(prefix="/reports",tags=["Reports"])

def _uid(auth:str|None)->str:
    result=require_user(auth)
    if isinstance(result,tuple): return result[0]
    if isinstance(result,dict) and result.get("uid"): return result["uid"]
    raise RuntimeError("Unsupported require_user return value.")

def _request(uid,report_type,providers,metrics,date_preset,start_date,end_date,comparison,splits):
    return build_report(reporting_snapshot(uid),report_type=report_type,providers=[x for x in providers.split(",") if x],metrics=[x for x in metrics.split(",") if x],date_preset=date_preset,start_date=start_date,end_date=end_date,comparison=comparison,splits=[x for x in splits.split(",") if x])

@router.get("/status")
def status(authorization:str|None=Header(default=None)): return reporting_snapshot(_uid(authorization))

@router.get("/preview")
def preview(report_type:str=Query("campaign"),providers:str=Query("googleAds,metaAds"),metrics:str=Query("impressions,clicks,ctr,spend,conversions,cpa,roas"),date_preset:str=Query("last_30_days"),start_date:str|None=Query(None),end_date:str|None=Query(None),comparison:str=Query("none"),splits:str=Query(""),authorization:str|None=Header(default=None)):
    return _request(_uid(authorization),report_type,providers,metrics,date_preset,start_date,end_date,comparison,splits)

@router.get("/export.xlsx")
def export_xlsx(report_type:str=Query("campaign"),providers:str=Query("googleAds,metaAds"),metrics:str=Query("impressions,clicks,ctr,spend,conversions,cpa,roas"),date_preset:str=Query("last_30_days"),start_date:str|None=Query(None),end_date:str|None=Query(None),comparison:str=Query("none"),splits:str=Query(""),authorization:str|None=Header(default=None)):
    report=_request(_uid(authorization),report_type,providers,metrics,date_preset,start_date,end_date,comparison,splits)
    return StreamingResponse(build_workbook(report),media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":'attachment; filename="ADGen_Performance_Report.xlsx"'})
