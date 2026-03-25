"""FastAPI routes for Waterfall Engine (Phase 1)."""

from fastapi import APIRouter, HTTPException
from app.observability.logger import emit_log

router = APIRouter(prefix="/api/re")


@router.post("/waterfall/run-shadow")
def run_shadow_waterfall(req: dict):
    """Run shadow liquidation waterfall for a fund quarter."""
    from app.services import re_waterfall as svc
    try:
        result = svc.run_shadow(
            fin_fund_id=req["fin_fund_id"],
            quarter=req["quarter"],
            waterfall_style=req.get("waterfall_style", "european"),
            fin_rule_version_id=req.get("fin_rule_version_id"),
            sale_costs_pct=req.get("sale_costs_pct", 0.02),
        )
        return result
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_waterfall",
                 action="waterfall.run_shadow_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/investor/{investor_id}/statement/{fund_id}/{quarter}")
def get_investor_statement(investor_id: str, fund_id: str, quarter: str):
    """Get investor capital account statement."""
    from app.services import re_capital_accounts as svc
    try:
        return svc.get_investor_statement(investor_id, fund_id, quarter)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
