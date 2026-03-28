"""Trading Lab Write API Routes.

Endpoints for creating and updating trading signals, hypotheses, positions,
watchlist items, research notes, daily briefs, and performance snapshots.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import trading_lab_service as svc

router = APIRouter(prefix="/api/v1/trading", tags=["trading-lab"])


# ── Pydantic Request Models ─────────────────────────────────────────────────


class CreateSignalBody(BaseModel):
    model_config = {"extra": "forbid"}
    theme_id: str
    name: str
    description: str
    category: str
    direction: str
    strength: int = 50
    source: str
    asset_class: str
    tickers: list[str] = Field(default_factory=list)
    evidence: dict | None = None
    decay_rate: float = 0
    expires_at: str | None = None


class UpdateSignalBody(BaseModel):
    model_config = {"extra": "forbid"}
    name: str | None = None
    description: str | None = None
    category: str | None = None
    direction: str | None = None
    strength: int | None = None
    status: str | None = None
    evidence: dict | None = None
    decay_rate: float | None = None
    expires_at: str | None = None


class CreateHypothesisBody(BaseModel):
    model_config = {"extra": "forbid"}
    thesis: str
    rationale: str
    expected_outcome: str
    timeframe: str
    confidence: int = 50
    proves_right: list[str] = Field(default_factory=list)
    proves_wrong: list[str] = Field(default_factory=list)
    invalidation_level: float = 0
    tags: list[str] = Field(default_factory=list)


class UpdateHypothesisBody(BaseModel):
    model_config = {"extra": "forbid"}
    thesis: str | None = None
    rationale: str | None = None
    expected_outcome: str | None = None
    timeframe: str | None = None
    confidence: int | None = None
    status: str | None = None
    outcome_notes: str | None = None
    outcome_score: int | None = None
    resolved_at: str | None = None
    tags: list[str] | None = None


class CreatePositionBody(BaseModel):
    model_config = {"extra": "forbid"}
    hypothesis_id: str
    ticker: str
    asset_name: str
    asset_class: str
    direction: str
    entry_price: float
    size: float
    notional: float
    stop_loss: float | None = None
    take_profit: float | None = None
    notes: str | None = None
    entry_at: str | None = None


class UpdatePositionBody(BaseModel):
    model_config = {"extra": "forbid"}
    current_price: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    notes: str | None = None
    status: str | None = None


class ClosePositionBody(BaseModel):
    model_config = {"extra": "forbid"}
    exit_price: float
    exit_at: str | None = None


class CreateWatchlistBody(BaseModel):
    model_config = {"extra": "forbid"}
    ticker: str
    asset_name: str
    asset_class: str
    notes: str | None = None
    alert_above: float | None = None
    alert_below: float | None = None


class UpdateWatchlistBody(BaseModel):
    model_config = {"extra": "forbid"}
    asset_name: str | None = None
    asset_class: str | None = None
    current_price: float | None = None
    price_change_1d: float | None = None
    price_change_1w: float | None = None
    notes: str | None = None
    alert_above: float | None = None
    alert_below: float | None = None
    is_active: bool | None = None


class CreateResearchNoteBody(BaseModel):
    model_config = {"extra": "forbid"}
    title: str
    content: str
    note_type: str
    signal_id: str | None = None
    hypothesis_id: str | None = None
    position_id: str | None = None
    theme_id: str | None = None
    ticker: str | None = None
    tags: list[str] = Field(default_factory=list)


class UpdateResearchNoteBody(BaseModel):
    model_config = {"extra": "forbid"}
    title: str | None = None
    content: str | None = None
    note_type: str | None = None
    tags: list[str] | None = None


class CreateDailyBriefBody(BaseModel):
    model_config = {"extra": "forbid"}
    brief_date: str
    regime_label: str
    regime_change: bool
    market_summary: str
    key_moves: list[dict] = Field(default_factory=list)
    signals_fired: list[dict] = Field(default_factory=list)
    hypotheses_at_risk: list[dict] = Field(default_factory=list)
    position_pnl_summary: list[dict] = Field(default_factory=list)
    what_changed: str = ""
    top_risks: list[str] = Field(default_factory=list)
    recommended_actions: list[dict] = Field(default_factory=list)


class CreatePerformanceBody(BaseModel):
    model_config = {"extra": "forbid"}
    snapshot_date: str
    total_pnl: float
    unrealized_pnl: float
    realized_pnl: float
    open_positions: int
    closed_positions: int
    win_count: int
    loss_count: int
    win_rate: float
    avg_win: float
    avg_loss: float
    best_trade_pnl: float
    worst_trade_pnl: float
    equity_value: float
    metadata: dict | None = None


# ── Signal Routes ────────────────────────────────────────────────────────────


@router.post("/signals")
def create_signal(body: CreateSignalBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.create_signal(tid, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/signals/{signal_id}")
def update_signal(signal_id: UUID, body: UpdateSignalBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.update_signal(tid, signal_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Hypothesis Routes ────────────────────────────────────────────────────────


@router.post("/hypotheses")
def create_hypothesis(body: CreateHypothesisBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.create_hypothesis(tid, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/hypotheses/{hypothesis_id}")
def update_hypothesis(hypothesis_id: UUID, body: UpdateHypothesisBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.update_hypothesis(tid, hypothesis_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Position Routes ──────────────────────────────────────────────────────────


@router.post("/positions")
def create_position(body: CreatePositionBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.create_position(tid, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/positions/{position_id}")
def update_position(position_id: UUID, body: UpdatePositionBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.update_position(tid, position_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/positions/{position_id}/close")
def close_position(position_id: UUID, body: ClosePositionBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.close_position(tid, position_id, body.exit_price, body.exit_at)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Watchlist Routes ─────────────────────────────────────────────────────────


@router.post("/watchlist")
def create_watchlist(body: CreateWatchlistBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.create_watchlist_item(tid, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/watchlist/{watchlist_id}")
def update_watchlist(watchlist_id: UUID, body: UpdateWatchlistBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.update_watchlist_item(tid, watchlist_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Research Notes ───────────────────────────────────────────────────────────


@router.post("/research")
def create_research(body: CreateResearchNoteBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.create_research_note(tid, body.model_dump(exclude_none=True))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/research/{note_id}")
def update_research(note_id: UUID, body: UpdateResearchNoteBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.update_research_note(tid, note_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Daily Briefs & Performance ───────────────────────────────────────────────


@router.post("/briefs")
def create_brief(body: CreateDailyBriefBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.create_daily_brief(tid, body.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/performance")
def create_performance(body: CreatePerformanceBody, tenant_id: UUID | None = Query(default=None)):
    tid = tenant_id or _default_tenant()
    try:
        return svc.create_performance_snapshot(tid, body.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Helpers ──────────────────────────────────────────────────────────────────


def _default_tenant() -> UUID:
    """Fallback tenant for single-tenant deployments."""
    return UUID("00000000-0000-0000-0000-000000000000")
