/**
 * Winston Trading Lab Type Definitions
 * Matches database schema exactly for trading themes, signals, hypotheses, positions, and performance tracking
 */

// ============================================================================
// Trading Themes
// ============================================================================

export type ThemeCategory =
  | "macro"
  | "sector"
  | "technical"
  | "fundamental"
  | "geopolitical"
  | "structural";

export type ThemeStatus = "active" | "watching" | "invalidated" | "archived";

export interface TradingTheme {
  theme_id: string;
  tenant_id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  status: ThemeStatus;
  confidence: number; // 0-100
  tags: string[];
  cross_vertical: Record<string, unknown>; // jsonb
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

export interface CreateTradingThemeInput {
  name: string;
  description: string;
  category: ThemeCategory;
  confidence?: number;
  tags?: string[];
  cross_vertical?: Record<string, unknown>;
}

export interface UpdateTradingThemeInput {
  name?: string;
  description?: string;
  category?: ThemeCategory;
  status?: ThemeStatus;
  confidence?: number;
  tags?: string[];
  cross_vertical?: Record<string, unknown>;
}

// ============================================================================
// Trading Signals
// ============================================================================

export type SignalCategory =
  | "macro"
  | "sector"
  | "technical"
  | "alt_data"
  | "fundamental"
  | "sentiment"
  | "onchain";

export type SignalDirection = "bullish" | "bearish" | "neutral";

export type SignalSource = "manual" | "model" | "ingestion" | "ai_generated";

export type SignalStatus = "active" | "fading" | "expired" | "invalidated";

export interface TradingSignal {
  signal_id: string;
  tenant_id: string;
  theme_id: string;
  name: string;
  description: string;
  category: SignalCategory;
  direction: SignalDirection;
  strength: number; // 0-100
  source: SignalSource;
  asset_class: string;
  tickers: string[];
  evidence: Record<string, unknown>; // jsonb
  decay_rate: number;
  hit_count: number;
  miss_count: number;
  status: SignalStatus;
  expires_at: string | null; // ISO timestamp
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

export interface CreateTradingSignalInput {
  theme_id: string;
  name: string;
  description: string;
  category: SignalCategory;
  direction: SignalDirection;
  strength?: number;
  source: SignalSource;
  asset_class: string;
  tickers: string[];
  evidence?: Record<string, unknown>;
  decay_rate?: number;
  expires_at?: string;
}

export interface UpdateTradingSignalInput {
  name?: string;
  description?: string;
  category?: SignalCategory;
  direction?: SignalDirection;
  strength?: number;
  status?: SignalStatus;
  evidence?: Record<string, unknown>;
  decay_rate?: number;
  expires_at?: string;
}

// ============================================================================
// Trading Hypotheses
// ============================================================================

export type HypothesisTimeframe =
  | "intraday"
  | "1-5 days"
  | "1-4 weeks"
  | "1-3 months"
  | "3-12 months"
  | "1y+";

export type HypothesisStatus =
  | "draft"
  | "active"
  | "partially_confirmed"
  | "confirmed"
  | "invalidated"
  | "expired";

export interface TradingHypothesis {
  hypothesis_id: string;
  tenant_id: string;
  thesis: string;
  rationale: string;
  expected_outcome: string;
  timeframe: HypothesisTimeframe;
  confidence: number; // 0-100
  proves_right: string[];
  proves_wrong: string[];
  invalidation_level: number; // threshold for invalidation
  status: HypothesisStatus;
  outcome_notes: string | null;
  outcome_score: number | null; // -100 to 100
  tags: string[];
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  resolved_at: string | null; // ISO timestamp
}

export interface CreateTradingHypothesisInput {
  thesis: string;
  rationale: string;
  expected_outcome: string;
  timeframe: HypothesisTimeframe;
  confidence?: number;
  proves_right?: string[];
  proves_wrong?: string[];
  invalidation_level?: number;
  tags?: string[];
}

export interface UpdateTradingHypothesisInput {
  thesis?: string;
  rationale?: string;
  expected_outcome?: string;
  timeframe?: HypothesisTimeframe;
  confidence?: number;
  status?: HypothesisStatus;
  outcome_notes?: string;
  outcome_score?: number;
  resolved_at?: string;
  tags?: string[];
}

// ============================================================================
// Trading Positions
// ============================================================================

export type AssetClass =
  | "equity"
  | "etf"
  | "index"
  | "crypto"
  | "bond"
  | "commodity"
  | "option"
  | "reit"
  | "other";

export type PositionDirection = "long" | "short";

export type PositionStatus = "open" | "closed" | "stopped_out";

export interface TradingPosition {
  position_id: string;
  tenant_id: string;
  hypothesis_id: string;
  ticker: string;
  asset_name: string;
  asset_class: AssetClass;
  direction: PositionDirection;
  entry_price: number;
  current_price: number | null;
  exit_price: number | null;
  size: number;
  notional: number;
  unrealized_pnl: number | null;
  realized_pnl: number | null;
  return_pct: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  notes: string | null;
  status: PositionStatus;
  entry_at: string; // ISO timestamp
  exit_at: string | null; // ISO timestamp
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

export interface CreateTradingPositionInput {
  hypothesis_id: string;
  ticker: string;
  asset_name: string;
  asset_class: AssetClass;
  direction: PositionDirection;
  entry_price: number;
  size: number;
  notional: number;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
  entry_at?: string;
}

export interface UpdateTradingPositionInput {
  current_price?: number;
  exit_price?: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  return_pct?: number;
  status?: PositionStatus;
  stop_loss?: number;
  take_profit?: number;
  notes?: string;
  exit_at?: string;
}

// ============================================================================
// Trading Performance Snapshots
// ============================================================================

export interface TradingPerformanceSnapshot {
  perf_id: string;
  tenant_id: string;
  snapshot_date: string; // ISO date
  total_pnl: number;
  unrealized_pnl: number;
  realized_pnl: number;
  open_positions: number;
  closed_positions: number;
  win_count: number;
  loss_count: number;
  win_rate: number; // percentage 0-100
  avg_win: number;
  avg_loss: number;
  best_trade_pnl: number;
  worst_trade_pnl: number;
  equity_value: number;
  metadata: Record<string, unknown>; // jsonb
}

export interface CreatePerformanceSnapshotInput {
  snapshot_date: string;
  total_pnl: number;
  unrealized_pnl: number;
  realized_pnl: number;
  open_positions: number;
  closed_positions: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  best_trade_pnl: number;
  worst_trade_pnl: number;
  equity_value: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Trading Research Notes
// ============================================================================

export type ResearchNoteType =
  | "observation"
  | "analysis"
  | "thesis_update"
  | "trade_journal"
  | "market_comment"
  | "lesson";

export interface TradingResearchNote {
  note_id: string;
  tenant_id: string;
  title: string;
  content: string;
  note_type: ResearchNoteType;
  signal_id: string | null;
  hypothesis_id: string | null;
  position_id: string | null;
  theme_id: string | null;
  ticker: string | null;
  tags: string[];
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

export interface CreateResearchNoteInput {
  title: string;
  content: string;
  note_type: ResearchNoteType;
  signal_id?: string;
  hypothesis_id?: string;
  position_id?: string;
  theme_id?: string;
  ticker?: string;
  tags?: string[];
}

export interface UpdateResearchNoteInput {
  title?: string;
  content?: string;
  note_type?: ResearchNoteType;
  tags?: string[];
}

// ============================================================================
// Trading Daily Briefs
// ============================================================================

export interface DailyBriefKeyMove {
  asset: string;
  change_pct: number;
  notes?: string;
}

export interface DailyBriefSignalFired {
  signal_id: string;
  signal_name: string;
  direction: SignalDirection;
  strength: number;
}

export interface DailyBriefHypothesisAtRisk {
  hypothesis_id: string;
  thesis: string;
  status: HypothesisStatus;
  risk_level: "low" | "medium" | "high";
}

export interface DailyBriefPositionPnL {
  position_id: string;
  ticker: string;
  pnl: number;
  return_pct: number;
}

export interface DailyBriefRecommendedAction {
  action: string;
  rationale: string;
  priority: "low" | "medium" | "high";
}

export interface TradingDailyBrief {
  brief_id: string;
  tenant_id: string;
  brief_date: string; // ISO date
  regime_label: string;
  regime_change: boolean;
  market_summary: string;
  key_moves: DailyBriefKeyMove[];
  signals_fired: DailyBriefSignalFired[];
  hypotheses_at_risk: DailyBriefHypothesisAtRisk[];
  position_pnl_summary: DailyBriefPositionPnL[];
  what_changed: string;
  top_risks: string[];
  recommended_actions: DailyBriefRecommendedAction[];
}

export interface CreateDailyBriefInput {
  brief_date: string;
  regime_label: string;
  regime_change: boolean;
  market_summary: string;
  key_moves: DailyBriefKeyMove[];
  signals_fired: DailyBriefSignalFired[];
  hypotheses_at_risk: DailyBriefHypothesisAtRisk[];
  position_pnl_summary: DailyBriefPositionPnL[];
  what_changed: string;
  top_risks: string[];
  recommended_actions: DailyBriefRecommendedAction[];
}

// ============================================================================
// Trading Watchlist
// ============================================================================

export interface TradingWatchlistItem {
  watchlist_id: string;
  tenant_id: string;
  ticker: string;
  asset_name: string;
  asset_class: AssetClass;
  current_price: number | null;
  price_change_1d: number | null;
  price_change_1w: number | null;
  notes: string | null;
  alert_above: number | null;
  alert_below: number | null;
  is_active: boolean;
}

export interface CreateWatchlistItemInput {
  ticker: string;
  asset_name: string;
  asset_class: AssetClass;
  notes?: string;
  alert_above?: number;
  alert_below?: number;
}

export interface UpdateWatchlistItemInput {
  asset_name?: string;
  asset_class?: AssetClass;
  current_price?: number;
  price_change_1d?: number;
  price_change_1w?: number;
  notes?: string;
  alert_above?: number;
  alert_below?: number;
  is_active?: boolean;
}

// ============================================================================
// Aggregated Page Load Data
// ============================================================================

export interface TradingLabData {
  themes: TradingTheme[];
  signals: TradingSignal[];
  hypotheses: TradingHypothesis[];
  positions: TradingPosition[];
  latestPerformance: TradingPerformanceSnapshot | null;
  researchNotes: TradingResearchNote[];
  latestBrief: TradingDailyBrief | null;
  watchlist: TradingWatchlistItem[];
}

// ============================================================================
// Convenience Types for Common Queries
// ============================================================================

export interface ThemesWithSignals extends TradingTheme {
  signals: TradingSignal[];
}

export interface HypothesisWithPositions extends TradingHypothesis {
  positions: TradingPosition[];
}

export interface SignalWithContext extends TradingSignal {
  theme?: TradingTheme;
  hitRate?: number; // hit_count / (hit_count + miss_count)
}

export interface PositionWithContext extends TradingPosition {
  hypothesis?: TradingHypothesis;
  theme?: TradingTheme;
  pnlStatus: "winning" | "losing" | "breakeven";
}

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  bestTrade: number;
  worstTrade: number;
  totalPnL: number;
  unrealizedPnL: number;
  realizedPnL: number;
}
