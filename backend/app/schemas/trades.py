from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


OrderType = Literal["market", "limit", "stop", "stop_limit"]
TradeSide = Literal["buy", "sell", "short", "cover"]
BrokerAccountMode = Literal["paper", "live"]
ControlMode = Literal["paper", "live_disabled", "live_enabled"]


class TradeIntentCreateRequest(BaseModel):
    business_id: UUID
    env_id: UUID | None = None
    created_by: str | None = None
    source_type: str
    source_ref_id: str | None = None
    asset_class: str | None = None
    symbol: str
    instrument_type: str = "stock"
    side: TradeSide
    thesis_title: str | None = None
    thesis_summary: str
    confidence_score: float
    time_horizon: str
    signal_strength: float | None = None
    trap_risk_score: float
    crowding_score: float | None = None
    meta_game_level: str | None = None
    forecast_ref_id: UUID | None = None
    invalidation_condition: str
    invalidation_level: float | None = None
    expected_scenario: str
    order_type: OrderType = "market"
    entry_price: float | None = None
    desired_quantity: float | None = None
    desired_notional: float | None = None
    limit_price: float | None = None
    stop_price: float | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class TradeRiskCheckRequest(BaseModel):
    business_id: UUID


class TradeApprovalRequest(BaseModel):
    business_id: UUID
    approved_by: str
    approval_notes: str | None = None


class TradeSubmitRequest(BaseModel):
    business_id: UUID
    actor: str
    tif: str = "DAY"
    broker: str = "ibkr"
    broker_account_mode: BrokerAccountMode | None = None
    quantity: float | None = None
    limit_price: float | None = None
    stop_price: float | None = None


class TradeCancelRequest(BaseModel):
    business_id: UUID
    actor: str


class KillSwitchRequest(BaseModel):
    business_id: UUID
    activate: bool
    reason: str
    changed_by: str


class ModeChangeRequest(BaseModel):
    business_id: UUID
    target_mode: ControlMode
    changed_by: str
    reason: str | None = None
    confirmation_phrase: str | None = None


class PostTradeReviewCreateRequest(BaseModel):
    business_id: UUID
    trade_intent_id: UUID
    env_id: UUID | None = None
    thesis_quality_score: float | None = None
    timing_quality_score: float | None = None
    sizing_quality_score: float | None = None
    execution_quality_score: float | None = None
    discipline_score: float | None = None
    trap_realized_flag: bool = False
    notes: str | None = None


class TradeIntentOut(BaseModel):
    trade_intent_id: UUID
    business_id: UUID
    env_id: UUID | None = None
    source_type: str
    source_ref_id: str | None = None
    symbol: str
    side: str
    order_type: str
    thesis_summary: str
    invalidation_condition: str
    expected_scenario: str
    confidence_score: float
    trap_risk_score: float
    status: str
    created_at: datetime
    updated_at: datetime | None = None
    latest_risk_check: dict[str, Any] | None = None
    orders: list[dict[str, Any]] | None = None


class TradeRiskCheckOut(BaseModel):
    risk_check_id: UUID
    trade_intent_id: UUID
    business_id: UUID
    final_decision: str
    portfolio_exposure_check: str
    concentration_check: str
    max_loss_check: str
    liquidity_check: str
    volatility_check: str
    broker_connectivity_check: str
    regime_check: str
    trap_risk_check: str
    live_gate_check: str
    adjustment_notes: str | None = None
    size_explanation: str | None = None
    recommended_size: float | None = None
    recommended_notional: float | None = None
    expected_max_loss: float | None = None
    risk_budget_used_pct: float | None = None
    created_at: datetime


class ExecutionOrderOut(BaseModel):
    execution_order_id: UUID
    trade_intent_id: UUID
    business_id: UUID
    broker: str
    broker_account_mode: str
    broker_order_id: str | None = None
    symbol: str
    order_type: str
    side: str
    quantity: float
    limit_price: float | None = None
    stop_price: float | None = None
    tif: str
    last_status: str
    submitted_at: datetime | None = None
    updated_at: datetime
    events: list[dict[str, Any]] | None = None


class PortfolioPositionOut(BaseModel):
    portfolio_position_id: UUID
    business_id: UUID
    broker: str
    account_mode: str
    symbol: str
    asset_class: str | None = None
    quantity: float
    avg_cost: float | None = None
    market_price: float | None = None
    market_value: float | None = None
    unrealized_pnl: float | None = None
    realized_pnl: float | None = None
    risk_bucket: str | None = None
    thesis_ref_id: UUID | None = None
    opened_at: datetime | None = None
    updated_at: datetime


class ControlStateOut(BaseModel):
    execution_control_state_id: UUID
    business_id: UUID
    current_mode: str
    kill_switch_active: bool
    reason: str | None = None
    changed_by: str
    changed_at: datetime


class PostTradeReviewOut(BaseModel):
    post_trade_review_id: UUID
    trade_intent_id: UUID
    business_id: UUID
    env_id: UUID | None = None
    thesis_quality_score: float | None = None
    timing_quality_score: float | None = None
    sizing_quality_score: float | None = None
    execution_quality_score: float | None = None
    discipline_score: float | None = None
    trap_realized_flag: bool
    notes: str | None = None
    created_at: datetime


class AccountSummaryOut(BaseModel):
    business_id: str
    account_mode: str
    broker_connected: bool
    kill_switch_active: bool
    open_orders: int
    positions_count: int
    unrealized_pnl: float | int | str
    realized_pnl: float | int | str
    risk_utilization_pct: float | int | str
    broker_summary: dict[str, Any]
    limits: dict[str, str]


class PromotionChecklistOut(BaseModel):
    business_id: str
    ready_for_live: bool
    items: list[dict[str, Any]]
    generated_at: str


class ExecutionEventOut(BaseModel):
    execution_event_id: UUID
    business_id: UUID
    trade_intent_id: UUID | None = None
    execution_order_id: UUID | None = None
    created_at: datetime
    event_type: str
    event_message: str
    severity: str
    broker_payload_json: dict[str, Any]
