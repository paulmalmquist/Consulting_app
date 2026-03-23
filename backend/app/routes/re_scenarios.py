"""FastAPI routes for Refinance + Stress Tests (Phase 3)."""

from fastapi import APIRouter, HTTPException
from app.observability.logger import emit_log

router = APIRouter(prefix="/api/re")


@router.post("/refinance/simulate")
def simulate_refinance(req: dict):
    """Simulate refinance scenario for an asset."""
    from app.services import re_refinance as svc
    try:
        return svc.simulate(**req)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_scenarios",
                 action="refinance.simulate_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stress/run")
def run_stress(req: dict):
    """Run stress scenarios for an asset quarter."""
    from app.services import re_stress as svc
    try:
        return svc.run(**req)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_scenarios",
                 action="stress.run_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))
