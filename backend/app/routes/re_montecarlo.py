"""FastAPI routes for Monte Carlo Risk Simulation (Phase 5)."""

from fastapi import APIRouter, HTTPException
from app.observability.logger import emit_log

router = APIRouter(prefix="/api/re")


@router.post("/montecarlo/run")
def run_monte_carlo(req: dict):
    """Run seeded Monte Carlo simulation for an asset."""
    from app.services import re_monte_carlo as svc
    try:
        return svc.run(
            fin_asset_investment_id=req["fin_asset_investment_id"],
            quarter=req["quarter"],
            n_sims=req.get("n_sims", 1000),
            seed=req.get("seed", 42),
            distribution_params=req.get("distribution_params", {}),
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_montecarlo",
                 action="montecarlo.run_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/montecarlo/{run_id}")
def get_monte_carlo_result(run_id: str):
    """Get Monte Carlo run results."""
    from app.services import re_monte_carlo as svc
    try:
        return svc.get_result(run_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
