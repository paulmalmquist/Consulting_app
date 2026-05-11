"""Trading Analytics Copilot API routes."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from app.auth.platform import require_environment_access
from app.schemas.trading import CopilotRequest, MemoRequest, RegressionRequest, ScenarioRequest
from app.services import trading_analytics as svc

router = APIRouter(prefix="/api/trading/v1", tags=["trading-analytics"])


def _require_env(request: Request, env_id: UUID, *, write: bool = False) -> None:
    require_environment_access(
        request,
        env_id=env_id,
        allowed_roles={"owner", "admin", "member"} if write else None,
    )


@router.get("/environments/{env_id}/health")
def get_health(env_id: UUID, request: Request):
    _require_env(request, env_id)
    return svc.get_pipeline_health(env_id)


@router.get("/environments/{env_id}/series")
def get_series(
    env_id: UUID,
    request: Request,
    symbols: str = Query(default="WTI,BRENT,HH_GAS,BRENT_WTI_SPREAD,DXY_PROXY,UST10Y,VIX,CRUDE_INVENTORY_PROXY,GAS_STORAGE_PROXY,RIG_COUNT_PROXY"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    latest: bool = Query(default=False),
):
    _require_env(request, env_id)
    parsed = [part.strip() for part in symbols.split(",") if part.strip()]
    return svc.get_series(env_id, parsed, start_date=start_date, end_date=end_date, latest=latest)


@router.get("/environments/{env_id}/seasonality")
def get_seasonality(
    env_id: UUID,
    request: Request,
    symbol: str = Query(default="HH_GAS"),
    lookback_years: int = Query(default=5, ge=3, le=10),
):
    _require_env(request, env_id)
    return svc.compute_seasonality(env_id, symbol, lookback_years, persist=True)


@router.get("/environments/{env_id}/correlation")
def get_correlation(
    env_id: UUID,
    request: Request,
    symbol_a: str = Query(default="WTI"),
    symbol_b: str = Query(default="BRENT"),
    window_days: int = Query(default=60, ge=5, le=252),
):
    _require_env(request, env_id)
    return svc.compute_rolling_correlation(env_id, symbol_a, symbol_b, window_days, persist=True)


@router.post("/environments/{env_id}/regression")
def post_regression(env_id: UUID, request: Request, body: RegressionRequest):
    _require_env(request, env_id)
    return svc.run_factor_regression(
        env_id,
        body.dependent_symbol,
        body.factor_symbols,
        body.lookback_days,
        persist=True,
    )


@router.post("/environments/{env_id}/scenario")
def post_scenario(env_id: UUID, request: Request, body: ScenarioRequest):
    _require_env(request, env_id)
    return svc.run_scenario_model(env_id, body.base_symbol, body.shocks, persist=True)


@router.get("/environments/{env_id}/analogs")
def get_analogs(
    env_id: UUID,
    request: Request,
    target_symbol: str = Query(default="WTI"),
    lookback_days: int = Query(default=60, ge=20, le=252),
    top_n: int = Query(default=5, ge=1, le=10),
):
    _require_env(request, env_id)
    return svc.find_historical_analogs(env_id, target_symbol, lookback_days, top_n, persist=True)


@router.post("/environments/{env_id}/memo")
def post_memo(env_id: UUID, request: Request, body: MemoRequest):
    _require_env(request, env_id, write=True)
    if not body.analytics_payload:
        raise HTTPException(status_code=400, detail="analytics_payload is required to generate a memo")
    return svc.generate_desk_memo(env_id, body.question, body.analytics_payload, run_id=body.run_id)


@router.get("/environments/{env_id}/memo")
def get_memos(env_id: UUID, request: Request, limit: int = Query(default=10, ge=1, le=50)):
    _require_env(request, env_id)
    return svc.list_memos(env_id, limit=limit)


@router.post("/environments/{env_id}/copilot")
def post_copilot(env_id: UUID, request: Request, body: CopilotRequest):
    _require_env(request, env_id)
    return svc.ask_trading_copilot(env_id, body.question, analytics_payload=body.analytics_payload)
