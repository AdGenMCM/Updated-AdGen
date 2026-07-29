from __future__ import annotations
from typing import Any

METRICS = {
 "impressions":"Impressions","clicks":"Clicks","ctr":"CTR","spend":"Spend","cpc":"CPC","cpm":"CPM",
 "conversions":"Conversions","conversionValue":"Conversion Value","conversionRate":"Conversion Rate","cpa":"CPA","roas":"ROAS"
}
ADDITIVE = ("impressions","clicks","spend","conversions","conversionValue")

def num(value: Any) -> float:
    try: return float(value or 0)
    except (TypeError, ValueError): return 0.0

def derive(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    imp, clicks, spend, conv, value = [num(out.get(k)) for k in ADDITIVE]
    out.update({"impressions":int(imp),"clicks":int(clicks),"spend":spend,"conversions":conv,"conversionValue":value,
      "ctr":clicks/imp*100 if imp else 0,"cpc":spend/clicks if clicks else 0,"cpm":spend/imp*1000 if imp else 0,
      "conversionRate":conv/clicks*100 if clicks else 0,"cpa":spend/conv if conv else 0,"roas":value/spend if spend else 0})
    return out

def aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return derive({k:sum(num(r.get(k)) for r in rows) for k in ADDITIVE})
