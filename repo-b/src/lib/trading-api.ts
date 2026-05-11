import { bosFetch } from "@/lib/bos-api";

export type Availability = {
  available: boolean;
  unavailable_reason?: string | null;
  warnings?: string[];
};

export type TradingLayerStatus = {
  name: "Bronze" | "Silver" | "Gold" | string;
  definition: string;
  status: "available" | "unavailable" | string;
  row_count?: number;
  feature_rows?: number;
  feature_count?: number;
  analytics_run_count?: number;
  memo_count?: number;
  unavailable_reason?: string | null;
  tool_readiness?: Record<string, boolean>;
};

export type TradingSeriesStatus = Availability & {
  symbol: string;
  label: string;
  row_count: number;
  missing_values: number;
  date_range: { start: string | null; end: string | null };
  latest_value: number | null;
  unit: string;
  source: string | null;
  staleness_status: string;
  staleness_days?: number;
};

export type TradingMarketCard = Availability & {
  symbol: string;
  label: string;
  value: number | null;
  unit: string;
  source: string | null;
};

export type TradingFreshness = {
  series_source?: string;
  latest_observation_date?: string | null;
  staleness_days?: number;
  staleness_status?: string;
};

export type TradingHealth = Availability & {
  env_id: string;
  source_mode: string;
  generated_at?: string;
  freshness: TradingFreshness;
  layers: TradingLayerStatus[];
  series: TradingSeriesStatus[];
  market_overview: TradingMarketCard[];
  unavailable_sources: Array<{ symbol: string; reason: string }>;
};

export type TradingSeriesRow = {
  symbol: string;
  asset_class: string;
  source: string;
  observation_date: string;
  value: number;
  unit: string;
  series_type: string;
};

export type TradingSeriesResponse = Availability & {
  env_id: string;
  symbols: string[];
  rows: TradingSeriesRow[];
  latest_by_symbol: Record<string, TradingSeriesRow>;
  unavailable_symbols: Array<{ symbol: string; reason: string }>;
  source: TradingFreshness;
};

export type TradingSeasonality = Availability & {
  env_id: string;
  symbol: string;
  label: string;
  lookback_years: number;
  prior_years: number[];
  current_year: number;
  date_range: { start: string; end: string };
  latest: { date: string; value: number; unit: string; seasonal_percentile: number | null };
  chart: Array<{ date: string; day_of_year: number; current: number | null; historical_avg: number | null; p10: number | null; p90: number | null }>;
  source: TradingFreshness;
  run_id?: string | null;
};

export type TradingCorrelation = Availability & {
  env_id: string;
  symbol_a: string;
  symbol_b: string;
  window_days: number;
  n_obs: number;
  date_range: { start: string; end: string };
  chart: Array<{ date: string; correlation: number | null }>;
  stats: { latest: number | null; average: number | null; min: number | null; max: number | null };
  source: TradingFreshness;
  run_id?: string | null;
};

export type TradingRegression = Availability & {
  env_id: string;
  dependent_symbol: string;
  factor_symbols: string[];
  lookback_days: number;
  n_obs: number;
  date_range: { start: string; end: string };
  intercept: number | null;
  r_squared: number | null;
  coefficients: Array<{ factor: string; coefficient: number | null; p_value: number | null; p_value_unavailable_reason?: string }>;
  method: string;
  source: TradingFreshness;
  run_id?: string | null;
};

export type TradingScenario = Availability & {
  env_id: string;
  base_symbol: string;
  latest_price: number | null;
  unit: string;
  shocks: Record<string, number>;
  estimated_return_impact_pct: number | null;
  estimated_price_impact: number | null;
  directional_pressure: "bullish" | "bearish" | "neutral" | string;
  sensitivity_table: Array<{ factor: string; label: string; shock: number; unit: string; impact_per_unit_pct: number; estimated_return_impact_pct: number | null }>;
  caveats: string[];
  source: TradingFreshness;
  run_id?: string | null;
};

export type TradingAnalogs = Availability & {
  env_id: string;
  target_symbol: string;
  lookback_days: number;
  n_obs: number;
  engine_label: string;
  current_state: Record<string, number>;
  analogs: Array<{
    start_date: string;
    end_date: string;
    score: number | null;
    cosine_similarity: number | null;
    distance: number | null;
    matching_features: string[];
    divergent_features: string[];
    forward_30d_return_pct: number | null;
  }>;
  source: TradingFreshness;
  run_id?: string | null;
};

export type TradingMemo = Availability & {
  id?: string | null;
  run_id?: string | null;
  title: string;
  question: string;
  memo_md: string;
  evidence: Record<string, unknown>;
  confidence: string;
  created_at?: string | null;
};

export type TradingMemosResponse = Availability & {
  env_id: string;
  memos: TradingMemo[];
};

export type TradingCopilotResponse = {
  tool_used: "seasonality" | "rolling_correlation" | "regression" | "scenario" | "analogs" | "memo" | "unsupported";
  available: boolean;
  result: Record<string, unknown>;
  warnings: string[];
  source: TradingFreshness;
  ai_available: boolean;
  unsupported_capabilities: string[];
};

const base = (envId: string) => `/api/trading/v1/environments/${envId}`;

export function getTradingHealth(envId: string) {
  return bosFetch<TradingHealth>(`${base(envId)}/health`);
}

export function getTradingSeries(envId: string, args: { symbols: string[]; latest?: boolean; startDate?: string; endDate?: string }) {
  return bosFetch<TradingSeriesResponse>(`${base(envId)}/series`, {
    params: {
      symbols: args.symbols.join(","),
      latest: args.latest ? "true" : undefined,
      start_date: args.startDate,
      end_date: args.endDate,
    },
  });
}

export function getTradingSeasonality(envId: string, symbol = "HH_GAS", lookbackYears = 5) {
  return bosFetch<TradingSeasonality>(`${base(envId)}/seasonality`, {
    params: { symbol, lookback_years: String(lookbackYears) },
  });
}

export function getTradingCorrelation(envId: string, symbolA = "WTI", symbolB = "BRENT", windowDays = 60) {
  return bosFetch<TradingCorrelation>(`${base(envId)}/correlation`, {
    params: { symbol_a: symbolA, symbol_b: symbolB, window_days: String(windowDays) },
  });
}

export function runTradingRegression(envId: string, args: { dependent_symbol: string; factor_symbols: string[]; lookback_days: number }) {
  return bosFetch<TradingRegression>(`${base(envId)}/regression`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function runTradingScenario(envId: string, args: { base_symbol: string; shocks: Record<string, number> }) {
  return bosFetch<TradingScenario>(`${base(envId)}/scenario`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function getTradingAnalogs(envId: string, targetSymbol = "WTI", lookbackDays = 60, topN = 5) {
  return bosFetch<TradingAnalogs>(`${base(envId)}/analogs`, {
    params: { target_symbol: targetSymbol, lookback_days: String(lookbackDays), top_n: String(topN) },
  });
}

export function createTradingMemo(envId: string, args: { question: string; analytics_payload: Record<string, unknown>; run_id?: string | null }) {
  return bosFetch<TradingMemo>(`${base(envId)}/memo`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function listTradingMemos(envId: string, limit = 10) {
  return bosFetch<TradingMemosResponse>(`${base(envId)}/memo`, {
    params: { limit: String(limit) },
  });
}

export function askTradingCopilot(envId: string, args: { question: string; analytics_payload?: Record<string, unknown> | null }) {
  return bosFetch<TradingCopilotResponse>(`${base(envId)}/copilot`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}
