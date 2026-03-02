"""UW vs Actual report endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.observability.logger import emit_log
from app.schemas.re_institutional import (
    ReAttributionBridgeOut,
    ReUwVsActualPortfolioOut,
)
from app.services import re_uw_vs_actual

router = APIRouter(prefix="/api/re/v2/reports", tags=["re-reports-uw"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def _log(action: str, msg: str, **ctx):
    emit_log(level="info", service="backend", action=action, message=msg, context=ctx)


# ── Portfolio Scorecard ──────────────────────────────────────────────────────

@router.get("/uw-vs-actual", response_model=ReUwVsActualPortfolioOut)
def get_uw_vs_actual(
    fundId: UUID = Query(...),
    asof: str = Query(..., pattern=r"^\d{4}Q[1-4]$"),
    baseline: str = Query("IO", pattern=r"^(IO|CF)$"),
    level: str = Query("investment"),
):
    try:
        return re_uw_vs_actual.compute_portfolio_scorecard(
            fund_id=fundId, quarter=asof, baseline=baseline, level=level,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Detail ───────────────────────────────────────────────────────────────────

@router.get("/uw-vs-actual/{level}/{entity_id}")
def get_uw_vs_actual_detail(
    level: str,
    entity_id: UUID,
    asof: str = Query(..., pattern=r"^\d{4}Q[1-4]$"),
    baseline: str = Query("IO", pattern=r"^(IO|CF)$"),
):
    try:
        return re_uw_vs_actual.compute_detail(
            level=level, entity_id=entity_id, quarter=asof, baseline=baseline,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Attribution Bridge ───────────────────────────────────────────────────────

@router.post("/uw-vs-actual/{level}/{entity_id}/bridge", response_model=ReAttributionBridgeOut)
def compute_bridge(
    level: str,
    entity_id: UUID,
    asof: str = Query(..., pattern=r"^\d{4}Q[1-4]$"),
    baseline: str = Query("IO", pattern=r"^(IO|CF)$"),
    mode: str = Query("fast", pattern=r"^(fast|precise)$"),
):
    try:
        _log("re.report.bridge", f"Computing {mode} bridge for {level}/{entity_id}")
        if mode == "fast":
            return re_uw_vs_actual.compute_bridge_fast(
                level=level, entity_id=entity_id, quarter=asof, baseline=baseline,
            )
        raise ValueError("Precise bridge mode not yet implemented")
    except Exception as exc:
        raise _to_http(exc)
