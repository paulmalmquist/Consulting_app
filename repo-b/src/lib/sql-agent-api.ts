/**
 * SQL Agent API client.
 *
 * Talks to /api/v1/sql-agent which proxies to the backend FastAPI
 * SQL agent endpoints.
 */

import { apiFetch } from "./api";

// ── Types ───────────────────────────────────────────────────────────

export type SqlAgentQueryResult = {
  query_type: string;
  domain: string;
  confidence: number;
  sql: string | null;
  sql_params: Record<string, string>;
  sql_source: "template" | "llm" | "none";
  template_key: string | null;
  validation: {
    valid: boolean;
    error: string | null;
    warnings: string[] | null;
  } | null;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  execution_time_ms: number;
  chart: ChartBlock | null;
  chart_alternatives: ChartBlock[];
  answer_summary: string | null;
  follow_up_suggestions: string[];
  total_time_ms: number;
  error: string | null;
  warnings: string[];
};

export type ChartBlock = {
  type: "chart";
  chart_type: string;
  x_key: string;
  y_keys: string[];
  data: Record<string, unknown>[];
  format?: string;
  series_key?: string | null;
};

export type QueryTemplate = {
  key: string;
  description: string;
  domain: string;
  query_type: string;
  default_chart: string | null;
  required_params: string[];
  optional_params: string[];
};

export type ExplainResult = {
  query_type: string;
  domain: string;
  confidence: number;
  signals: Record<string, unknown>;
  template_match: {
    key: string | null;
    description: string | null;
    default_chart: string | null;
  } | null;
  would_use_llm: boolean;
};

// ── API functions ───────────────────────────────────────────────────

export async function sqlAgentQuery(params: {
  question: string;
  business_id: string;
  env_id?: string;
  quarter?: string;
  tenant_id?: string;
  entity_id?: string;
  row_limit?: number;
}): Promise<SqlAgentQueryResult> {
  return apiFetch<SqlAgentQueryResult>("/api/v1/sql-agent", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sqlAgentExplain(
  question: string,
): Promise<ExplainResult> {
  return apiFetch<ExplainResult>("/api/v1/sql-agent/explain", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export async function sqlAgentTemplates(
  domain?: string,
): Promise<{ templates: QueryTemplate[]; count: number }> {
  const params: Record<string, string | undefined> = {};
  if (domain) params.domain = domain;
  return apiFetch<{ templates: QueryTemplate[]; count: number }>(
    "/api/v1/sql-agent/templates",
    { params },
  );
}

export async function sqlAgentRunTemplate(params: {
  template_key: string;
  business_id: string;
  env_id?: string;
  quarter?: string;
  tenant_id?: string;
  row_limit?: number;
}): Promise<SqlAgentQueryResult> {
  return apiFetch<SqlAgentQueryResult>("/api/v1/sql-agent/templates", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sqlAgentSchema(
  domain?: string,
): Promise<Record<string, unknown>> {
  const params: Record<string, string | undefined> = {};
  if (domain) params.domain = domain;
  return apiFetch<Record<string, unknown>>("/api/v1/sql-agent/schema", {
    params,
  });
}
