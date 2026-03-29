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
