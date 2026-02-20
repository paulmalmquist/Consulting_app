"""FastAPI routes for Fund Aggregation (Phase 2)."""

from fastapi import APIRouter, HTTPException
from app.observability.logger import emit_log

router = APIRouter(prefix="/api/re")


@router.post("/fund/compute-summary")
def compute_fund_summary(req: dict):
    """Compute fund-level quarterly summary."""
    from app.services import re_fund_aggregation as svc
    try:
        return svc.compute(
            fin_fund_id=req["fin_fund_id"],
            quarter=req["quarter"],
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_fund",
                 action="fund.compute_summary_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fund/{fund_id}/summary/{quarter}")
def get_fund_summary(fund_id: str, quarter: str):
    """Get stored fund summary for a quarter."""
    from app.services import re_fund_aggregation as svc
    try:
        return svc.get_fund_summary(fund_id, quarter)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
