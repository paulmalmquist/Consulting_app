export interface ReModel {
  model_id: string;
  fund_id: string;
  name: string;
  description: string | null;
  status: string;
  strategy_type: string | null;
  created_by: string | null;
  approved_at: string | null;
  created_at: string;
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
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}
