import { bosFetch } from "@/lib/bos-api";

export const MERIDIAN_DEMO_ENV_ID = "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f101";
export const MERIDIAN_DEMO_NAME = "Meridian Capital Management – Institutional Demo";
export const MERIDIAN_DEMO_FUND_ID = "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f201";
export const MERIDIAN_DEMO_BASE_SCENARIO_ID = "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f203";
export const MERIDIAN_DEMO_DOWNSIDE_SCENARIO_ID = "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f204";

export type InstitutionalDemoContext = {
  env_id: string;
  client_name: string;
  business_id?: string | null;
  ready: boolean;
};

export type KbDocumentChunk = {
  chunk_id: string;
  chunk_index: number;
  content: string;
  page_number: number;
  anchor_label: string;
  citation_href: string;
  char_start: number;
  char_end: number;
};

export type KbDocumentSummary = {
  document_id: string;
  title: string;
  virtual_path?: string | null;
  status: string;
  doc_type: string;
  author?: string | null;
  verification_status: string;
  source_type: string;
  linked_entities: Array<{ type: string; id: string }>;
  metadata: Record<string, unknown>;
  latest_version: {
    version_id: string;
    version_number: number;
    mime_type?: string | null;
    size_bytes?: number | null;
    created_at?: string | null;
  };
  analysis: {
    processing_status?: string | null;
    detected_definitions: string[];
    detected_tables: Array<Record<string, unknown>>;
    detected_metrics: string[];
    linked_structured_refs: Array<Record<string, unknown>>;
  };
};

export type KbDocumentDetail = KbDocumentSummary;

export type KbSearchResult = {
  document_id: string;
  title: string;
  doc_type: string;
  verification_status: string;
  version_id: string;
  chunk_id: string;
  snippet: string;
  anchor_label: string;
  anchor_href: string;
  score: number;
};

export type KbDefinitionChangeRequest = {
  id: string;
  proposed_definition_text: string;
  proposed_formula_text?: string | null;
  created_by: string;
  created_at: string;
  status: string;
  impact_summary: {
    message?: string;
    summary_lines?: string[];
    impacts?: Array<{ type: string; id: string }>;
  };
  approved_by?: string | null;
  approved_at?: string | null;
};

export type KbDefinitionSummary = {
  definition_id: string;
  term: string;
  definition_text: string;
  formula_text?: string | null;
  structured_metric_key?: string | null;
  owner: string;
  status: string;
  version: number;
  created_at: string;
  approved_at?: string | null;
  dependency_count: number;
  stale_count: number;
};

export type KbDefinitionDetail = {
  definition_id: string;
  term: string;
  definition_text: string;
  formula_text?: string | null;
  structured_metric_key?: string | null;
  owner: string;
  status: string;
  version: number;
  created_at: string;
  approved_at?: string | null;
  sources: Array<{
    document_id: string;
    chunk_id: string;
    title: string;
    quoted_snippet: string;
    anchor_href: string;
  }>;
  dependencies: Array<{ type: string; id: string }>;
  change_requests: KbDefinitionChangeRequest[];
  stale_dependencies: Array<{
    object_type: string;
    object_id: string;
    reason: string;
    created_at: string;
  }>;
};

export type StructuredQueryPlan = {
  title: string;
  prompt: string;
  view_key: "asset_metrics_qtr" | "fund_metrics_qtr" | "document_catalog" | "definition_registry";
  select: string[];
  filters?: Record<string, unknown> | Array<Record<string, unknown>>;
  sort?: Record<string, unknown> | Array<Record<string, unknown>>;
  limit: number;
};

export type StructuredQueryResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  metadata: {
    view_key: string;
    execution_time_ms: number;
    row_count: number;
    audit_trace_id: string;
  };
};

export type ScenarioApplyResult = {
  scenario_id: string;
  run_id: string;
  base_metrics: Record<string, number>;
  scenario_metrics: Record<string, number>;
  delta: {
    asset_value: number;
    fund_nav: number;
    tvpi: number;
    irr: number;
  };
  audit_trace_id: string;
};

export type WinstonAssistantAnswer = {
  answer: string;
  citations: KbSearchResult[];
  sources: Array<{ title: string; doc_type: string }>;
  audit_trace_id: string;
};

export type SystemAuditEntry = {
  id: string;
  actor: string;
  action_type: string;
  object_type: string;
  object_id?: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
};

export const MERIDIAN_DEMO_ASSETS = [
  { asset_id: "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f301", name: "Aurora Residences", property_type: "multifamily", noi: 1180000, asset_value: 27500000, debt_balance: 16750000, dscr: 1.58 },
  { asset_id: "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f302", name: "Cedar Grove Senior Living", property_type: "senior_housing", noi: 980000, asset_value: 21800000, debt_balance: 13400000, dscr: 1.44 },
  { asset_id: "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f303", name: "Northgate Student Commons", property_type: "student_housing", noi: 1060000, asset_value: 24100000, debt_balance: 15200000, dscr: 1.51 },
  { asset_id: "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f304", name: "Meridian Medical Pavilion", property_type: "mob", noi: 1340000, asset_value: 30900000, debt_balance: 17900000, dscr: 1.92 },
  { asset_id: "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f305", name: "Foundry Logistics Center", property_type: "industrial", noi: 1260000, asset_value: 28400000, debt_balance: 16100000, dscr: 1.86 },
] as const;

export async function ensureWinstonDemoEnvironment(envId: string, selectedEnv?: Record<string, unknown> | null): Promise<InstitutionalDemoContext> {
  const result = await bosFetch<Record<string, unknown>>(`/api/winston-demo/environments/${envId}/ensure`, {
    method: "POST",
    body: JSON.stringify({ selected_env: selectedEnv || undefined }),
  });
  return {
    env_id: String(result.env_id || envId),
    client_name: String(result.client_name || selectedEnv?.client_name || MERIDIAN_DEMO_NAME),
    business_id: result.business_id ? String(result.business_id) : null,
    ready: true,
  };
}

export async function seedMeridianDemo(envId: string) {
  return bosFetch<Record<string, unknown>>(`/api/winston-demo/environments/${envId}/seed-meridian`, {
    method: "POST",
  });
}

export async function listWinstonDocuments(envId: string, filters?: { doc_type?: string; asset_id?: string; verification_status?: string }) {
  return bosFetch<KbDocumentSummary[]>(`/api/winston-demo/environments/${envId}/documents`, {
    params: {
      doc_type: filters?.doc_type,
      asset_id: filters?.asset_id,
      verification_status: filters?.verification_status,
    },
  });
}

export async function uploadWinstonDocument(envId: string, payload: {
  file: File;
  doc_type: string;
  author?: string;
  verification_status?: string;
  source_type?: string;
  linked_entities?: Array<{ type: string; id: string }>;
}) {
  const form = new FormData();
  form.set("file", payload.file);
  form.set("doc_type", payload.doc_type);
  form.set("author", payload.author || "Winston Demo User");
  form.set("verification_status", payload.verification_status || "draft");
  form.set("source_type", payload.source_type || "upload");
  form.set("linked_entities_json", JSON.stringify(payload.linked_entities || []));
  return bosFetch<Record<string, unknown>>(`/api/winston-demo/environments/${envId}/documents/upload`, {
    method: "POST",
    body: form,
  });
}

export async function getWinstonDocumentDetail(envId: string, documentId: string) {
  return bosFetch<KbDocumentDetail>(`/api/winston-demo/environments/${envId}/documents/${documentId}`);
}

export async function getWinstonDocumentChunks(envId: string, documentId: string) {
  return bosFetch<KbDocumentChunk[]>(`/api/winston-demo/environments/${envId}/documents/${documentId}/chunks`);
}

export async function searchWinstonDocuments(envId: string, query: string, filters?: { doc_type?: string; asset_id?: string; verified_only?: boolean; limit?: number }) {
  return bosFetch<KbSearchResult[]>(`/api/winston-demo/environments/${envId}/documents/search`, {
    params: {
      query,
      doc_type: filters?.doc_type,
      asset_id: filters?.asset_id,
      verified_only: filters?.verified_only ? "true" : undefined,
      limit: filters?.limit ? String(filters.limit) : undefined,
    },
  });
}

export async function listWinstonDefinitions(envId: string) {
  return bosFetch<KbDefinitionSummary[]>(`/api/winston-demo/environments/${envId}/definitions`);
}

export async function getWinstonDefinitionDetail(envId: string, definitionId: string) {
  return bosFetch<KbDefinitionDetail>(`/api/winston-demo/environments/${envId}/definitions/${definitionId}`);
}

export async function createWinstonChangeRequest(envId: string, definitionId: string, payload: { proposed_definition_text: string; proposed_formula_text?: string; created_by?: string }) {
  return bosFetch<Record<string, unknown>>(`/api/winston-demo/environments/${envId}/definitions/${definitionId}/change-requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveWinstonChangeRequest(changeRequestId: string, approved_by = "winston_demo_approver") {
  return bosFetch<Record<string, unknown>>(`/api/winston-demo/change-requests/${changeRequestId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved_by }),
  });
}

export async function rejectWinstonChangeRequest(changeRequestId: string, rejected_by = "winston_demo_approver") {
  return bosFetch<Record<string, unknown>>(`/api/winston-demo/change-requests/${changeRequestId}/reject`, {
    method: "POST",
    body: JSON.stringify({ rejected_by }),
  });
}

export async function askWinston(envId: string, payload: { question: string; doc_type?: string; asset_id?: string; verified_only?: boolean; limit?: number }) {
  return bosFetch<WinstonAssistantAnswer>(`/api/winston-demo/environments/${envId}/assistant/ask`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function runStructuredQuery(plan: StructuredQueryPlan, envId: string) {
  return bosFetch<StructuredQueryResult>("/api/query/run", {
    method: "POST",
    body: JSON.stringify({
      env_id: envId,
      view_key: plan.view_key,
      select: plan.select,
      filters: plan.filters,
      sort: plan.sort,
      limit: plan.limit,
    }),
  });
}

export async function applyWinstonScenario(envId: string, payload: { fund_id: string; base_scenario_id: string; change_type: string; lever_patch: Record<string, unknown>; quarter?: string }) {
  return bosFetch<ScenarioApplyResult>(`/api/winston-demo/environments/${envId}/assistant/scenario/apply`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listWinstonAudit(envId: string, limit = 100) {
  return bosFetch<SystemAuditEntry[]>(`/api/winston-demo/environments/${envId}/audit`, {
    params: { limit: String(limit) },
  });
}

export function buildStructuredQueryPlan(prompt: string): StructuredQueryPlan {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("fund") || normalized.includes("tvpi") || normalized.includes("nav")) {
    return {
      title: "Fund Quarter Metrics",
      prompt,
      view_key: "fund_metrics_qtr",
      select: ["fund_name", "quarter", "portfolio_nav", "total_called", "total_distributed", "tvpi", "net_irr"],
      filters: { quarter: "2026Q1" },
      sort: { column: "quarter", direction: "asc" },
      limit: 10,
    };
  }
  return {
    title: "NOI By Asset Q1 2026",
    prompt,
    view_key: "asset_metrics_qtr",
    select: ["asset_name", "property_type", "quarter", "noi", "asset_value", "debt_balance", "dscr"],
    filters: { quarter: "2026Q1" },
    sort: { column: "asset_name", direction: "asc" },
    limit: 10,
  };
}

export function buildScenarioPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  const capRateBps = normalized.includes("75") ? 75 : 50;
  return {
    title: `Downside Cap Rate +${capRateBps}bps`,
    prompt,
    change_type: "downside_cap_rate_shift",
    lever_patch: {
      exit_cap_rate_delta_bps: capRateBps,
    },
  };
}
