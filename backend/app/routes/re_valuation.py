"""FastAPI routes for Real Estate Fund Valuation Engine.

All routes under /api/re/valuation/* and /api/re/asset/*.
No calculation logic here — delegates entirely to service layer.
"""

from fastapi import APIRouter, HTTPException
from app.observability.logger import emit_log
from app.schemas.re_valuation import (
    CreateAssumptionSetRequest,
    CreateLoanRequest,
    RunQuarterRequest,
    RunQuarterResponse,
    UpsertQuarterlyFinancialsRequest,
)
from app.services import re_valuation as svc

router = APIRouter(prefix="/api/re")


# ---------------------------------------------------------------------------
# Assumption Sets
# ---------------------------------------------------------------------------

@router.post("/valuation/assumption-sets")
def create_assumption_set(req: CreateAssumptionSetRequest):
    """Create a new versioned assumption set."""
    try:
        result = svc.create_assumption_set(**req.model_dump())
        return result
    except Exception as e:
        emit_log(level="error", service="re_valuation", action="assumption_set.create_failed",
                 message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/valuation/assumption-sets/{assumption_set_id}")
def get_assumption_set(assumption_set_id: str):
    """Get a specific assumption set."""
    try:
        return svc.get_assumption_set(assumption_set_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Quarterly Financials
# ---------------------------------------------------------------------------

@router.post("/valuation/quarterly-financials")
def upsert_quarterly_financials(req: UpsertQuarterlyFinancialsRequest):
    """Insert or update quarterly operating data for an asset."""
    try:
        return svc.upsert_quarterly_financials(**req.model_dump())
    except Exception as e:
        emit_log(level="error", service="re_valuation",
                 action="quarterly_financials.upsert_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/valuation/quarterly-financials/{asset_id}/{quarter}")
def get_quarterly_financials(asset_id: str, quarter: str):
    """Get quarterly financials for an asset."""
    try:
        return svc.get_quarterly_financials(asset_id, quarter)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Loans
# ---------------------------------------------------------------------------

@router.post("/valuation/loans")
def create_loan(req: CreateLoanRequest):
    """Create a loan for an asset."""
    try:
        return svc.create_loan(**req.model_dump())
    except Exception as e:
        emit_log(level="error", service="re_valuation",
                 action="loan.create_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/valuation/loans/{asset_id}")
def get_loans(asset_id: str):
    """Get all loans for an asset."""
    return svc.get_loans_for_asset(asset_id)


# ---------------------------------------------------------------------------
# Valuation Run
# ---------------------------------------------------------------------------

@router.post("/valuation/run-quarter", response_model=RunQuarterResponse)
def run_quarter(req: RunQuarterRequest):
    """Execute a quarterly valuation run for one asset.

    This is the core endpoint. It reads financials + loans, applies the
    assumption set, and produces an immutable valuation snapshot and
    asset financial state.
    """
    try:
        cashflows = None
        if req.cashflows_for_irr:
            cashflows = [(cf[0], cf[1]) for cf in req.cashflows_for_irr]
        result = svc.run_quarter(
            fin_asset_investment_id=req.fin_asset_investment_id,
            quarter=req.quarter,
            assumption_set_id=req.assumption_set_id,
            fin_fund_id=req.fin_fund_id,
            forward_noi_override=req.forward_noi_override,
            accrued_pref=req.accrued_pref,
            deduct_pref_from_nav=req.deduct_pref_from_nav,
            cumulative_contributions=req.cumulative_contributions,
            cumulative_distributions=req.cumulative_distributions,
            cashflows_for_irr=cashflows,
        )
        return result
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        emit_log(level="error", service="re_valuation",
                 action="valuation.run_quarter_failed", message=str(e), error=e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Asset State Queries
# ---------------------------------------------------------------------------

@router.get("/asset/{asset_id}/quarter/{quarter}")
def get_asset_state(asset_id: str, quarter: str):
    """Get the most recent asset financial state for a quarter."""
    try:
        return svc.get_asset_financial_state(asset_id, quarter)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/asset/{asset_id}/snapshots")
def list_snapshots(asset_id: str, limit: int = 20):
    """List valuation snapshots for an asset."""
    return svc.list_valuation_snapshots(asset_id, limit)


@router.get("/fund/{fund_id}/assets/{quarter}")
def get_fund_asset_states(fund_id: str, quarter: str):
    """Get all asset financial states for a fund in a given quarter."""
    return svc.get_asset_financial_states_for_fund(fund_id, quarter)
