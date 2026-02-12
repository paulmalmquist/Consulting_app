const API_BASE =
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000";

async function financeFetch<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string | undefined> } = {}
): Promise<T> {
  const url = new URL(path, API_BASE);
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }

  const res = await fetch(url.toString(), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = `Finance API request failed (${res.status})`;
    try {
      const payload = await res.json();
      msg = payload.detail || payload.message || msg;
    } catch {
      // no-op
    }
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

export type FinancePartner = {
  id: string;
  name: string;
  role: "GP" | "LP" | "JV_PARTNER";
  tax_type?: string | null;
  commitment_amount: number;
  ownership_pct: number;
  has_promote: boolean;
};

export type WaterfallTier = {
  id?: string;
  tier_order: number;
  tier_type: "return_of_capital" | "preferred_return" | "catch_up" | "split";
  hurdle_irr?: number | null;
  hurdle_multiple?: number | null;
  pref_rate?: number | null;
  catch_up_pct?: number | null;
  split_lp?: number | null;
  split_gp?: number | null;
  notes?: string | null;
};

export type Waterfall = {
  id: string;
  deal_id: string;
  name: string;
  distribution_frequency: "monthly" | "quarterly";
  promote_structure_type: "american" | "european";
  tiers: WaterfallTier[];
};

export type ScenarioAssumption = {
  id?: string;
  key: string;
  value_num?: number | null;
  value_text?: string | null;
  value_json?: unknown;
};

export type Scenario = {
  id: string;
  deal_id: string;
  name: string;
  description?: string | null;
  as_of_date: string;
  assumptions: ScenarioAssumption[];
};

export type DealDetails = {
  deal: {
    id: string;
    name: string;
    strategy?: string | null;
    start_date: string;
    default_scenario_id?: string | null;
    fund_id: string;
    fund_name: string;
    currency: string;
  };
  partners: FinancePartner[];
  properties: Array<Record<string, unknown>>;
  waterfalls: Waterfall[];
  scenarios: Scenario[];
};

export type CreateDealPayload = {
  fund_name: string;
  deal_name: string;
  strategy?: string;
  start_date: string;
  currency?: string;
  partners: Array<{
    name: string;
    role: "GP" | "LP" | "JV_PARTNER";
    commitment_amount: number;
    ownership_pct: number;
    has_promote: boolean;
    tax_type?: string;
  }>;
  waterfall?: {
    name: string;
    distribution_frequency: "monthly" | "quarterly";
    promote_structure_type: "american" | "european";
    tiers: WaterfallTier[];
  };
  property?: {
    name: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    property_type?: string;
  };
  seed_default_scenario?: boolean;
};

export type RunModelResponse = {
  model_run_id: string;
  status: "started" | "completed" | "failed";
  reused_existing: boolean;
  run_hash: string;
  engine_version: string;
};

export type RunSummaryResponse = {
  model_run_id: string;
  deal_id: string;
  scenario_id: string;
  waterfall_id: string;
  run_hash: string;
  engine_version: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  metrics: Record<string, number>;
  meta: Record<string, unknown>;
};

export type RunDistributionsResponse = {
  model_run_id: string;
  group_by: "partner" | "tier" | "date";
  grouped: Array<{ group_key: string; amount: number }>;
  details: Array<{
    date: string;
    tier_id?: string | null;
    partner_id: string;
    partner_name?: string | null;
    tier_order?: number | null;
    tier_type?: string | null;
    distribution_amount: number;
    distribution_type: string;
    lineage_json: Record<string, unknown>;
  }>;
};

export type ExplainResponse = {
  model_run_id: string;
  partner_id: string;
  date: string;
  rows: Array<{
    date: string;
    tier_id?: string | null;
    tier_order?: number | null;
    tier_type?: string | null;
    distribution_amount: number;
    distribution_type: string;
    lineage_json: Record<string, unknown>;
  }>;
};

export function listFinanceDeals() {
  return financeFetch<Array<Record<string, unknown>>>("/api/finance/deals");
}

export function createFinanceDeal(payload: CreateDealPayload) {
  return financeFetch<{
    deal_id: string;
    fund_id: string;
    waterfall_id?: string | null;
    default_scenario_id?: string | null;
  }>("/api/finance/deals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getFinanceDeal(dealId: string) {
  return financeFetch<DealDetails>(`/api/finance/deals/${dealId}`);
}

export function createFinanceScenario(dealId: string, payload: {
  name: string;
  description?: string;
  as_of_date: string;
  assumptions: ScenarioAssumption[];
}) {
  return financeFetch<{ id: string }>(`/api/finance/deals/${dealId}/scenarios`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFinanceScenario(scenarioId: string, payload: {
  name?: string;
  description?: string;
  as_of_date?: string;
  assumptions: ScenarioAssumption[];
}) {
  return financeFetch<{ id: string }>(`/api/finance/scenarios/${scenarioId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function importFinanceCashflows(dealId: string, payload: {
  scenario_id: string;
  events: Array<{
    date: string;
    event_type:
      | "capital_call"
      | "operating_cf"
      | "capex"
      | "debt_service"
      | "refinance_proceeds"
      | "sale_proceeds"
      | "fee";
    amount: number;
    property_id?: string;
    metadata?: Record<string, unknown>;
  }>;
}) {
  return financeFetch<{ inserted: number }>(`/api/finance/deals/${dealId}/cashflows/import`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runFinanceModel(dealId: string, payload: { scenario_id: string; waterfall_id: string }) {
  return financeFetch<RunModelResponse>(`/api/finance/deals/${dealId}/runs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getFinanceRunSummary(runId: string) {
  return financeFetch<RunSummaryResponse>(`/api/finance/runs/${runId}/summary`);
}

export function getFinanceRunDistributions(runId: string, groupBy: "partner" | "tier" | "date") {
  return financeFetch<RunDistributionsResponse>(`/api/finance/runs/${runId}/distributions`, {
    params: { group_by: groupBy },
  });
}

export function getFinanceRunExplain(runId: string, partnerId: string, dateValue?: string) {
  return financeFetch<ExplainResponse>(`/api/finance/runs/${runId}/explain`, {
    params: {
      partner_id: partnerId,
      date: dateValue,
    },
  });
}
