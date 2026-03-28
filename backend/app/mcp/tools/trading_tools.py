"""Trading / Market Intelligence MCP tools."""

from __future__ import annotations

from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.trading_tools import (
    CreateTradingSignalInput,
    GetBtcSpxCorrelationInput,
    GetHypothesisStatusInput,
    GetMarketRegimeInput,
    GetOpenPositionsInput,
    GetRegimeHistoryInput,
    GetTradingSignalsInput,
    GetWatchlistAlertsInput,
    UpdatePositionPriceInput,
)

_DEFAULT_TENANT = UUID("00000000-0000-0000-0000-000000000000")


def _tid(inp_tenant: UUID | None) -> UUID:
    return inp_tenant or _DEFAULT_TENANT


# ── Read handlers ────────────────────────────────────────────────────────────


def _get_market_regime(ctx: McpContext, inp: GetMarketRegimeInput) -> dict:
    from app.services.market_regime_engine import get_latest_regime
    snapshot = get_latest_regime(tenant_id=_tid(inp.tenant_id))
    if snapshot is None:
        return {"regime_label": "transitional", "confidence": 0.0, "message": "No snapshot computed yet"}
    return {
        "snapshot_id": snapshot.snapshot_id,
        "calculated_at": snapshot.calculated_at,
        "regime_label": snapshot.regime_label,
        "confidence": snapshot.confidence,
        "signal_breakdown": snapshot.signal_breakdown,
        "cross_vertical_implications": snapshot.cross_vertical_implications,
    }


def _get_regime_history(ctx: McpContext, inp: GetRegimeHistoryInput) -> dict:
    from app.services.market_regime_engine import list_regime_history
    snapshots = list_regime_history(tenant_id=_tid(inp.tenant_id), days=inp.days)
    return {
        "count": len(snapshots),
        "snapshots": [
            {
                "calculated_at": s.calculated_at,
                "regime_label": s.regime_label,
                "confidence": s.confidence,
            }
            for s in snapshots
        ],
    }


def _get_btc_spx_correlation(ctx: McpContext, inp: GetBtcSpxCorrelationInput) -> dict:
    from app.services.btc_spx_correlation_service import get_latest_correlation
    row = get_latest_correlation(tenant_id=_tid(inp.tenant_id))
    if row is None:
        return {"correlation_30d": None, "message": "No correlation data yet"}
    return {
        "correlation_id": row.correlation_id,
        "calculated_date": row.calculated_date,
        "correlation_30d": row.correlation_30d,
        "btc_return_30d": row.btc_return_30d,
        "spx_return_30d": row.spx_return_30d,
        "zero_crossing": row.zero_crossing,
        "crossing_direction": row.crossing_direction,
    }


def _get_trading_signals(ctx: McpContext, inp: GetTradingSignalsInput) -> dict:
    from app.services.trading_lab_service import list_signals
    signals = list_signals(
        tenant_id=_tid(inp.tenant_id),
        status=inp.status,
        category=inp.category,
        direction=inp.direction,
        min_strength=inp.min_strength,
    )
    return {"count": len(signals), "signals": signals}


def _get_open_positions(ctx: McpContext, inp: GetOpenPositionsInput) -> dict:
    from app.services.trading_lab_service import list_open_positions
    positions = list_open_positions(tenant_id=_tid(inp.tenant_id))
    return {"count": len(positions), "positions": positions}


def _get_hypothesis_status(ctx: McpContext, inp: GetHypothesisStatusInput) -> dict:
    from app.services.trading_lab_service import get_hypothesis_status
    return get_hypothesis_status(tenant_id=_tid(inp.tenant_id), hypothesis_id=inp.hypothesis_id)


def _get_watchlist_alerts(ctx: McpContext, inp: GetWatchlistAlertsInput) -> dict:
    from app.services.trading_lab_service import get_watchlist_alerts
    alerts = get_watchlist_alerts(tenant_id=_tid(inp.tenant_id))
    return {"count": len(alerts), "alerts": alerts}


# ── Write handlers ───────────────────────────────────────────────────────────


def _create_trading_signal(ctx: McpContext, inp: CreateTradingSignalInput) -> dict:
    from app.services.trading_lab_service import create_signal
    data = inp.model_dump(exclude={"tenant_id"}, exclude_none=True)
    return create_signal(tenant_id=_tid(inp.tenant_id), data=data)


def _update_position_price(ctx: McpContext, inp: UpdatePositionPriceInput) -> dict:
    from app.services.trading_lab_service import update_position_price
    return update_position_price(
        tenant_id=_tid(inp.tenant_id),
        position_id=inp.position_id,
        current_price=inp.current_price,
    )


# ── Registration ─────────────────────────────────────────────────────────────


def register_trading_tools():
    _tags = frozenset({"trading", "market"})

    # Read tools
    registry.register(ToolDef(
        name="trading.get_market_regime",
        description="Get current market regime classification (risk_on/risk_off/transitional/stress) with confidence and cross-vertical implications",
        module="trading",
        permission="read",
        input_model=GetMarketRegimeInput,
        handler=_get_market_regime,
        tags=_tags,
    ))
    registry.register(ToolDef(
        name="trading.get_regime_history",
        description="Get N-day history of market regime snapshots for trend analysis",
        module="trading",
        permission="read",
        input_model=GetRegimeHistoryInput,
        handler=_get_regime_history,
        tags=_tags,
    ))
    registry.register(ToolDef(
        name="trading.get_btc_spx_correlation",
        description="Get latest BTC-SPX 30-day rolling correlation with zero-crossing detection",
        module="trading",
        permission="read",
        input_model=GetBtcSpxCorrelationInput,
        handler=_get_btc_spx_correlation,
        tags=_tags,
    ))
    registry.register(ToolDef(
        name="trading.get_trading_signals",
        description="Query active trading signals filtered by status, category, direction, or minimum strength",
        module="trading",
        permission="read",
        input_model=GetTradingSignalsInput,
        handler=_get_trading_signals,
        tags=_tags,
    ))
    registry.register(ToolDef(
        name="trading.get_open_positions",
        description="Get all open trading positions with current PnL",
        module="trading",
        permission="read",
        input_model=GetOpenPositionsInput,
        handler=_get_open_positions,
        tags=_tags,
    ))
    registry.register(ToolDef(
        name="trading.get_hypothesis_status",
        description="Check status of a trading hypothesis including open position count",
        module="trading",
        permission="read",
        input_model=GetHypothesisStatusInput,
        handler=_get_hypothesis_status,
        tags=_tags,
    ))
    registry.register(ToolDef(
        name="trading.get_watchlist_alerts",
        description="Get watchlist items where price has breached alert levels",
        module="trading",
        permission="read",
        input_model=GetWatchlistAlertsInput,
        handler=_get_watchlist_alerts,
        tags=_tags,
    ))

    # Write tools
    registry.register(ToolDef(
        name="trading.create_signal",
        description="Create a new trading signal from AI research or manual observation",
        module="trading",
        permission="write",
        input_model=CreateTradingSignalInput,
        handler=_create_trading_signal,
        tags=_tags,
    ))
    registry.register(ToolDef(
        name="trading.update_position_price",
        description="Mark a position to current market price and recalculate unrealized PnL",
        module="trading",
        permission="write",
        input_model=UpdatePositionPriceInput,
        handler=_update_position_price,
        tags=_tags,
    ))
