"""FastAPI routes for Risk Scoring + IC Memo + LP Reports (Phase 6)."""

from fastapi import APIRouter, HTTPException
from app.observability.logger import emit_log

router = APIRouter(prefix="/api/re")


@router.post("/risk-score/compute")
def compute_risk_score(req: dict):
    """Compute composite risk score for an asset quarter."""
    from app.services import re_risk_scoring as svc
    try:
        return svc.compute(
            fin_asset_investment_id=req["fin_asset_investment_id"],
            quarter=req["quarter"],
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_reports",
                 action="risk_score.compute_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk-score/{asset_id}/{quarter}")
def get_risk_score(asset_id: str, quarter: str):
    """Get risk score for an asset quarter."""
    from app.services import re_risk_scoring as svc
    try:
        return svc.get_score(asset_id, quarter)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/reports/ic-memo")
def generate_ic_memo(req: dict):
    """Generate IC memo for a fund or asset."""
    from app.services import re_reports as svc
    try:
        return svc.generate_ic_memo(
            target_type=req.get("target_type", "fund"),
            target_id=req["target_id"],
            quarter=req["quarter"],
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_reports",
                 action="ic_memo.generate_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reports/lp-report")
def generate_lp_report(req: dict):
    """Generate LP report for an investor."""
    from app.services import re_reports as svc
    try:
        return svc.generate_lp_report(
            investor_id=req["investor_id"],
            fund_id=req["fund_id"],
            quarter=req["quarter"],
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_reports",
                 action="lp_report.generate_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))
