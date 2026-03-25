"""FastAPI routes for CMBS-style Surveillance (Phase 4)."""

from fastapi import APIRouter, HTTPException
from app.observability.logger import emit_log

router = APIRouter(prefix="/api/re")


@router.post("/surveillance/compute")
def compute_surveillance(req: dict):
    """Compute surveillance snapshot for an asset quarter."""
    from app.services import re_surveillance as svc
    try:
        return svc.compute(
            fin_asset_investment_id=req["fin_asset_investment_id"],
            quarter=req["quarter"],
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_surveillance",
                 action="surveillance.compute_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/surveillance/{asset_id}/{quarter}")
def get_surveillance(asset_id: str, quarter: str):
    """Get surveillance snapshot."""
    from app.services import re_surveillance as svc
    try:
        return svc.get_snapshot(asset_id, quarter)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
