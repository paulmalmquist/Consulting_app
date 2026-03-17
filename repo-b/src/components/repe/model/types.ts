export type ModelStatus = "draft" | "official_base_case" | "archived";

export interface ReModel {
  model_id: string;
  primary_fund_id: string | null;
  fund_id?: string | null;
  env_id: string | null;
  name: string;
  description: string | null;
  status: ModelStatus;
  model_type: string | null;
  strategy_type: string | null;
  created_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface ModelScenario {
  id: string;
  model_id: string;
  name: string;
  description: string | null;
  is_base: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScenarioAsset {
  id: string;
  scenario_id: string;
  asset_id: string;
  source_fund_id: string | null;
  source_investment_id: string | null;
  added_at: string;
  asset_name: string;
  asset_type: string | null;
  fund_name: string | null;
}

export interface ScenarioOverride {
  id: string;
  scenario_id: string;
  scope_type: string;
  scope_id: string;
  key: string;
  value_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface ScenarioRunResult {
  run_id: string;
  scenario_id: string;
  model_id: string;
  status: string;
  assets_processed: number;
  summary: ScenarioSummary;
}

export interface ScenarioSummary {
  asset_count: number;
  total_noi_cash: number;
  total_noi_gaap: number;
  avg_noi_cash_per_asset: number;
  avg_noi_gaap_per_asset: number;
  total_revenue: number;
  total_expense: number;
  period_count: number;
  by_fund: Record<string, { fund_name: string; noi_cash: number; noi_gaap: number; asset_count: number }>;
}

export interface ScenarioComparison {
  scenarios: Array<{
    scenario_id: string;
    scenario_name: string;
    run_id: string;
    summary: ScenarioSummary;
  }>;
  comparison: Array<{
    base_scenario: string;
    compare_scenario: string;
    variance: Record<string, { base: number; compare: number; delta: number; delta_pct: number }>;
  }> | null;
}

export interface ReModelScope {
  id: string;
  model_id: string;
  scope_type: string;
  scope_node_id: string;
  include: boolean;
  created_at: string;
}

export interface ReModelOverride {
  id: string;
  model_id: string;
  scope_node_type: string;
  scope_node_id: string;
  key: string;
  value_type: string;
  value_decimal: number | null;
  value_int: number | null;
  value_text: string | null;
  reason: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Asset {
  asset_id: string;
  name: string;
  asset_type?: string;
  sector?: string;
  city?: string;
  state?: string;
  msa?: string;
  market?: string;
  units?: number;
  square_feet?: number;
  status?: string;
  investment_id?: string;
  investment_name?: string;
  fund_id?: string;
  fund_name?: string;
  latest_noi?: number;
  latest_occupancy?: number;
  latest_value?: number;
  latest_quarter?: string;
  created_at?: string;
}

export interface SurgeryOverrides {
  cash_flow: {
    rent_growth?: number;
    expense_growth?: number;
    vacancy?: number;
    forward_noi?: number;
  };
  exit: {
    sale_year?: number;
    cap_rate?: number;
    disposition_pct?: number;
    notes?: string;
  };
}

export interface AssetPeriod {
  quarter: string;
  revenue: number | null;
  opex: number | null;
  noi: number | null;
  occupancy: number | null;
  asset_value: number | null;
  cap_rate: number | null;
  capex: number | null;
  debt_service: number | null;
  debt_balance: number | null;
}

/* ── API helpers ─────────────────────────────────────────── */

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const errorCode = err.error_code as string | undefined;
    const message = (err.message ?? err.error ?? `HTTP ${res.status}`) as string;
    const error = new Error(message);
    if (errorCode) (error as Error & { errorCode?: string }).errorCode = errorCode;
    throw error;
  }
  return res.json();
}
