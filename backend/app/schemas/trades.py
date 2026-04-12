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
    top_analog_id: UUID | None = None
    scenario_probabilities_json: dict[str, Any] = Field(default_factory=dict)
    thesis_snapshot_json: dict[str, Any] = Field(default_factory=dict)
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


class QuoteProvenanceOut(BaseModel):
    symbol: str
    source: str | None = None
    quote_timestamp: datetime | None = None
    freshness_state: str | None = None
    data_class: str | None = None


class PortfolioHeroSnapshotOut(BaseModel):
    business_id: UUID
    account_mode: str
    as_of: datetime | None = None
    portfolio_value: float
    day_pnl: float
    total_pnl: float
    total_return_pct: float
    unrealized_pnl: float
    realized_pnl: float
    cash: float
    gross_exposure: float
    net_exposure: float
    win_rate: float
    max_drawdown_pct: float
    benchmark_relative_return_pct: float | None = None
    benchmark_relative_return_since_inception_pct: float | None = None
    freshness_state: str
    seed_mode_label: str | None = None
    seed_badge_required: bool = False
    stale_warning: str | None = None
    quote_provenance: list[QuoteProvenanceOut] = Field(default_factory=list)


class PortfolioSnapshotPointOut(BaseModel):
    as_of: datetime
    portfolio_value: float
    cash: float
    gross_exposure: float
    net_exposure: float
    realized_pnl: float
    unrealized_pnl: float
    day_pnl: float
    benchmark_spy: float | None = None
    benchmark_btc: float | None = None
    freshness_state: str | None = None
    source: str | None = None
    seed_input_count: int = 0
    mock_input_count: int = 0


class OpenPortfolioPositionOut(BaseModel):
    portfolio_position_id: UUID
    business_id: UUID
    symbol: str
    asset_class: str | None = None
    direction: str
    quantity: float
    entry_price: float | None = None
    current_price: float | None = None
    market_value: float | None = None
    unrealized_pnl: float | None = None
    unrealized_return_pct: float | None = None
    realized_pnl: float | None = None
    days_held: int | None = None
    thesis_summary: str | None = None
    invalidation_condition: str | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    quote_timestamp: datetime | None = None
    quote_source: str | None = None
    quote_freshness_state: str | None = None
    quote_data_class: str | None = None
    forecast_id: UUID | None = None
    top_analog_id: UUID | None = None
    scenario_probabilities_json: dict[str, Any] = Field(default_factory=dict)
    thesis_snapshot_json: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime


class ClosedPortfolioPositionOut(BaseModel):
    portfolio_closed_position_id: UUID
    business_id: UUID
    symbol: str
    asset_class: str | None = None
    direction: str
    quantity: float
    entry_price: float
    exit_price: float
    realized_pnl: float
    realized_return_pct: float | None = None
    holding_period_days: int | None = None
    close_reason: str | None = None
    thesis_summary: str | None = None
    closed_at: datetime
    forecast_id: UUID | None = None
    top_analog_id: UUID | None = None
    scenario_probabilities_json: dict[str, Any] = Field(default_factory=dict)
    thesis_snapshot_json: dict[str, Any] = Field(default_factory=dict)


class PortfolioAttributionOut(BaseModel):
    best_contributors: list[dict[str, Any]] = Field(default_factory=list)
    worst_contributors: list[dict[str, Any]] = Field(default_factory=list)
    realized_vs_unrealized: dict[str, float] = Field(default_factory=dict)
    contribution_by_asset_class: list[dict[str, Any]] = Field(default_factory=list)
    contribution_by_strategy: list[dict[str, Any]] = Field(default_factory=list)
    largest_position_share_pct: float = 0
    long_short_split: dict[str, float] = Field(default_factory=dict)


class PortfolioAccountabilityOut(BaseModel):
    recent_reviews: list[PostTradeReviewOut] = Field(default_factory=list)
    resolved_count: int = 0
    unresolved_count: int = 0
    win_rate: float = 0
    avg_brier_score: float | None = None
    confidence_deserves_trust: bool = False
    promotion_ready: bool = False
    promotion_notes: list[str] = Field(default_factory=list)


class PortfolioDecisionSummaryOut(BaseModel):
    recommended_action: str
    confidence: float
    sizing_guidance: str | None = None
    invalidation_trigger: str | None = None
    current_regime: str | None = None
    bull_probability: float | None = None
    base_probability: float | None = None
    bear_probability: float | None = None
    trap_warning: str | None = None
    top_analog_name: str | None = None
    rhyme_score: float | None = None
    divergence_note: str | None = None
    calibration_summary: str | None = None
    action_posture: str | None = None
    action_posture_reasons: list[str] = Field(default_factory=list)
    size_multiplier: float | None = None
    state_staleness_status: str | None = None
    effective_scope_chain: list[dict[str, Any]] = Field(default_factory=list)
    forecast_confidence: float | None = None
    scenario_dispersion_score: float | None = None
    adversarial_risk: float | None = None
    confidence_delta: dict[str, Any] = Field(default_factory=dict)
