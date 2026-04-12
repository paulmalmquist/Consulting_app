export interface TradeRiskCheck {
  risk_check_id: string;
  trade_intent_id: string;
  business_id: string;
  final_decision: "pass" | "reduce" | "block";
  portfolio_exposure_check: string;
  concentration_check: string;
  max_loss_check: string;
  liquidity_check: string;
  volatility_check: string;
  broker_connectivity_check: string;
  regime_check: string;
  trap_risk_check: string;
  live_gate_check: string;
  adjustment_notes?: string | null;
  size_explanation?: string | null;
  recommended_size?: number | null;
  recommended_notional?: number | null;
  expected_max_loss?: number | null;
  risk_budget_used_pct?: number | null;
  created_at: string;
}

export interface ExecutionOrder {
  execution_order_id: string;
  trade_intent_id: string;
  business_id: string;
  broker: string;
  broker_account_mode: "paper" | "live";
  broker_order_id?: string | null;
  symbol: string;
  order_type: string;
  side: string;
  quantity: number;
  limit_price?: number | null;
  stop_price?: number | null;
  tif: string;
  last_status: string;
  submitted_at?: string | null;
  updated_at: string;
  events?: ExecutionEvent[];
}

export interface TradeIntent {
  trade_intent_id: string;
  business_id: string;
  env_id?: string | null;
  source_type: string;
  source_ref_id?: string | null;
  symbol: string;
  side: string;
  order_type: string;
  thesis_summary: string;
  invalidation_condition: string;
  expected_scenario: string;
  confidence_score: number;
  trap_risk_score: number;
  top_analog_id?: string | null;
  scenario_probabilities_json?: Record<string, unknown>;
  thesis_snapshot_json?: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at?: string | null;
  latest_risk_check?: TradeRiskCheck | null;
  orders?: ExecutionOrder[] | null;
}

export interface PortfolioPosition {
  portfolio_position_id: string;
  business_id: string;
  broker: string;
  account_mode: string;
  symbol: string;
  asset_class?: string | null;
  quantity: number;
  avg_cost?: number | null;
  market_price?: number | null;
  market_value?: number | null;
  unrealized_pnl?: number | null;
  realized_pnl?: number | null;
  risk_bucket?: string | null;
  thesis_ref_id?: string | null;
  opened_at?: string | null;
  updated_at: string;
}

export interface ExecutionEvent {
  execution_event_id: string;
  business_id: string;
  trade_intent_id?: string | null;
  execution_order_id?: string | null;
  created_at: string;
  event_type: string;
  event_message: string;
  severity: "info" | "warning" | "error" | "critical";
  broker_payload_json: Record<string, unknown>;
}

export interface ExecutionControlState {
  execution_control_state_id: string;
  business_id: string;
  current_mode: "paper" | "live_disabled" | "live_enabled";
  kill_switch_active: boolean;
  reason?: string | null;
  changed_by: string;
  changed_at: string;
}

export interface AccountSummary {
  business_id: string;
  account_mode: string;
  broker_connected: boolean;
  kill_switch_active: boolean;
  open_orders: number;
  positions_count: number;
  unrealized_pnl: number | string;
  realized_pnl: number | string;
  risk_utilization_pct: number | string;
  broker_summary: Record<string, unknown>;
  limits: Record<string, string>;
}

export interface PostTradeReview {
  post_trade_review_id: string;
  trade_intent_id: string;
  business_id: string;
  env_id?: string | null;
  thesis_quality_score?: number | null;
  timing_quality_score?: number | null;
  sizing_quality_score?: number | null;
  execution_quality_score?: number | null;
  discipline_score?: number | null;
  trap_realized_flag: boolean;
  notes?: string | null;
  created_at: string;
}

export interface PromotionChecklistItem {
  key: string;
  label: string;
  current: number | string | null;
  required: number | string;
  passed: boolean;
  note?: string;
}

export interface PromotionChecklist {
  business_id: string;
  ready_for_live: boolean;
  items: PromotionChecklistItem[];
  generated_at: string;
}

export interface QuoteProvenance {
  symbol: string;
  source?: string | null;
  quote_timestamp?: string | null;
  freshness_state?: string | null;
  data_class?: string | null;
}

export interface PortfolioHeroSnapshot {
  business_id: string;
  account_mode: string;
  as_of?: string | null;
  portfolio_value: number;
  day_pnl: number;
  total_pnl: number;
  total_return_pct: number;
  unrealized_pnl: number;
  realized_pnl: number;
  cash: number;
  gross_exposure: number;
  net_exposure: number;
  win_rate: number;
  max_drawdown_pct: number;
  benchmark_relative_return_pct?: number | null;
  benchmark_relative_return_since_inception_pct?: number | null;
  freshness_state: string;
  seed_mode_label?: string | null;
  seed_badge_required: boolean;
  stale_warning?: string | null;
  quote_provenance: QuoteProvenance[];
}

export interface PortfolioSnapshotPoint {
  as_of: string;
  portfolio_value: number;
  cash: number;
  gross_exposure: number;
  net_exposure: number;
  realized_pnl: number;
  unrealized_pnl: number;
  day_pnl: number;
  benchmark_spy?: number | null;
  benchmark_btc?: number | null;
  freshness_state?: string | null;
  source?: string | null;
  seed_input_count: number;
  mock_input_count: number;
}

export interface OpenPortfolioPosition {
  portfolio_position_id: string;
  business_id: string;
  symbol: string;
  asset_class?: string | null;
  direction: string;
  quantity: number;
  entry_price?: number | null;
  current_price?: number | null;
  market_value?: number | null;
  unrealized_pnl?: number | null;
  unrealized_return_pct?: number | null;
  realized_pnl?: number | null;
  days_held?: number | null;
  thesis_summary?: string | null;
  invalidation_condition?: string | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  quote_timestamp?: string | null;
  quote_source?: string | null;
  quote_freshness_state?: string | null;
  quote_data_class?: string | null;
  forecast_id?: string | null;
  top_analog_id?: string | null;
  scenario_probabilities_json?: Record<string, unknown>;
  thesis_snapshot_json?: Record<string, unknown>;
  updated_at: string;
}

export interface ClosedPortfolioPosition {
  portfolio_closed_position_id: string;
  business_id: string;
  symbol: string;
  asset_class?: string | null;
  direction: string;
  quantity: number;
  entry_price: number;
  exit_price: number;
  realized_pnl: number;
  realized_return_pct?: number | null;
  holding_period_days?: number | null;
  close_reason?: string | null;
  thesis_summary?: string | null;
  closed_at: string;
  forecast_id?: string | null;
  top_analog_id?: string | null;
  scenario_probabilities_json?: Record<string, unknown>;
  thesis_snapshot_json?: Record<string, unknown>;
}

export interface PortfolioAttribution {
  best_contributors: Array<Record<string, unknown>>;
  worst_contributors: Array<Record<string, unknown>>;
  realized_vs_unrealized: Record<string, number>;
  contribution_by_asset_class: Array<Record<string, unknown>>;
  contribution_by_strategy: Array<Record<string, unknown>>;
  largest_position_share_pct: number;
  long_short_split: Record<string, number>;
}

export interface PortfolioAccountability {
  recent_reviews: PostTradeReview[];
  resolved_count: number;
  unresolved_count: number;
  win_rate: number;
  avg_brier_score?: number | null;
  confidence_deserves_trust: boolean;
  promotion_ready: boolean;
  promotion_notes: string[];
}

export interface PortfolioDecisionSummary {
  recommended_action: "add" | "reduce" | "hold" | "hedge" | "abstain" | "paper_trade_only";
  confidence: number;
  sizing_guidance?: string | null;
  invalidation_trigger?: string | null;
  current_regime?: string | null;
  bull_probability?: number | null;
  base_probability?: number | null;
  bear_probability?: number | null;
  trap_warning?: string | null;
  top_analog_name?: string | null;
  rhyme_score?: number | null;
  divergence_note?: string | null;
  calibration_summary?: string | null;
  action_posture?: string | null;
  action_posture_reasons?: string[];
  size_multiplier?: number | null;
  state_staleness_status?: string | null;
  effective_scope_chain?: Array<Record<string, unknown>>;
  forecast_confidence?: number | null;
  scenario_dispersion_score?: number | null;
  adversarial_risk?: number | null;
  confidence_delta?: Record<string, unknown>;
}

export interface PortfolioOverview {
  hero: PortfolioHeroSnapshot;
  decision: PortfolioDecisionSummary;
  history_rhymes: PortfolioDecisionSummary;
  accountability: PortfolioAccountability;
}
