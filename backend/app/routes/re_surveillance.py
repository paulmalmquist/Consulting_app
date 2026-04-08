"""FastAPI routes for CMBS-style Surveillance (Phase 4)."""

from fastapi import APIRouter, HTTPException
from app.observability.logger import emit_log

router = APIRouter(prefix="/api/re")


@router.post("/surveillance/compute")
def compute_surveillance(req: dict):
    """Compute surveillance snapshot for an asset quarter.

    Accepts asset_id (canonical) or fin_asset_investment_id (legacy compat).
    """
    from app.services import re_surveillance as svc
    try:
        asset_id = req.get("asset_id") or req.get("fin_asset_investment_id")
        if not asset_id:
            raise HTTPException(status_code=422, detail="asset_id or fin_asset_investment_id required")
        return svc.compute(
            asset_id=asset_id,
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
