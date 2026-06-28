"use client";

import { apiFetch } from "@/lib/api";
import { TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "./api";

const BASE = "/api/agent-builder";

// The Agent Builder backend resolves tenant context from session headers when present,
// and otherwise falls back to allowlisted query params (the headerless telemetry reviewer
// login). Mirror the Control Tower pattern: always send the demo scope as query params so
// the page works under the reviewer login. For a real platform session the backend ignores
// these params and uses the header-derived tenant. Sent on every method (the backend reads
// scope from query params for GET/POST/PATCH alike, so typed POST bodies stay untouched).
const scope = { env_id: TELEMETRY_DEMO_ENV_ID, business_id: TELEMETRY_DEMO_BUSINESS_ID };

export type AgentNodeType =
  | "manual_trigger"
  | "context_loader"
  | "mcp_tool"
  | "prompt_llm"
  | "policy_gate"
  | "cost_guardrail"
  | "human_approval"
  | "receipt_writer"
  | "output"
  | "eval_assertion";

export interface AgentGraphNode {
  id: string;
  type: AgentNodeType;
  label?: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface AgentGraphEdge {
  id?: string;
  source: string;
  target: string;
  source_handle?: string | null;
  target_handle?: string | null;
  data_type?: string;
}

export interface AgentGraph {
  schema_version: "agent-graph/v1";
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  limits: {
    max_runtime_seconds: number;
    max_tool_calls: number;
    max_cost_usd: number;
  };
  model_route_policy: Record<string, unknown>;
}

export interface PaletteNode {
  type: AgentNodeType;
  label: string;
  category: string;
  description: string;
}

export interface McpTool {
  name: string;
  description: string;
  module: string;
  permission: string;
  effective_permission: string;
  side_effect_class: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown> | null;
  schema_digest: string;
  enabled: boolean;
  disabled_reason: string | null;
}

export interface ValidationIssue {
  code: string;
  message: string;
  node_id?: string | null;
  severity: string;
}

export interface ValidationResult {
  status: "pass" | "fail";
  checks: Record<string, boolean>;
  issues: ValidationIssue[];
  topological_order: string[];
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string | null;
  status: string;
  tags: string[];
  is_template: boolean;
  template_key: string | null;
  version_id: string;
  version_number: number;
  validation_status: string;
  validation_results: ValidationResult;
  publish_status: string;
  last_run_status: string | null;
  eval_overall_status: "staged_ready" | "blocked" | null;
  eval_summary: EvalSummary | null;
  updated_at: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  graph: AgentGraph;
  versions: Array<{
    id: string;
    version_number: number;
    validation_status: string;
    publish_status: string;
    publish_blockers: Array<Record<string, unknown>>;
    published_by: string | null;
    published_at: string | null;
    created_by: string | null;
    created_at: string;
  }>;
  published_by: string | null;
  published_at: string | null;
  publish_blockers: Array<Record<string, unknown>>;
}

export interface AgentRunStep {
  id: string;
  node_id: string;
  node_type: string;
  status: string;
  tool_name: string | null;
  model_name: string | null;
  output_json: Record<string, unknown> | null;
  error_json: Record<string, unknown> | null;
  receipt_id: string | null;
}

export interface AgentReceipt {
  id: string;
  node_id: string;
  receipt_type: string;
  tools_called: string[];
  model_used: string | null;
  terminal_status: string;
  failure_reason: string | null;
  created_at: string;
}

export interface AgentRun {
  id: string;
  workflow_id: string;
  workflow_name: string;
  workflow_version_id: string;
  version_number: number;
  status: string;
  terminal_reason: string | null;
  started_at: string;
  finished_at: string | null;
  actual_cost: string | number;
  output_json?: Record<string, unknown>;
  steps?: AgentRunStep[];
  receipts?: AgentReceipt[];
}

export interface EvalSummary {
  overall_status: "staged_ready" | "blocked";
  by_class: Record<string, "pass" | "fail" | "not_applicable" | "not_run">;
  blockers: Array<{ eval_class: string; reason: string }>;
  counts: {
    pass: number;
    fail: number;
    not_applicable: number;
    total: number;
  };
}

export interface AgentEvalResult {
  id: string;
  eval_case_id: string;
  case_key: string;
  eval_class: string;
  title: string;
  source: string;
  status: "pass" | "fail" | "not_applicable";
  input_json: Record<string, unknown>;
  expected_json: Record<string, unknown>;
  actual_json: Record<string, unknown>;
  failed_assertion: string | null;
  trace_run_id: string | null;
}

export interface AgentEvalRun {
  id?: string;
  workflow_id: string;
  workflow_version_id: string;
  workflow_name?: string;
  version_number: number;
  status: string;
  overall_status: "staged_ready" | "blocked";
  summary_json: EvalSummary;
  started_at?: string;
  finished_at?: string | null;
  results: AgentEvalResult[];
}

const post = <T>(path: string, body: Record<string, unknown> = {}) =>
  apiFetch<T>(`${BASE}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    params: scope,
    timeoutMs: 120_000,
  });

export const getPalette = () =>
  apiFetch<{ schema_version: string; nodes: PaletteNode[] }>(`${BASE}/palette`, { params: scope });

export const getMcpTools = () =>
  apiFetch<{ tools: McpTool[] }>(`${BASE}/mcp-tools`, { params: scope });

export const getWorkflows = () =>
  apiFetch<{ workflows: WorkflowSummary[] }>(`${BASE}/workflows`, { params: scope, timeoutMs: 60_000 });

export const getWorkflow = (workflowId: string) =>
  apiFetch<WorkflowDetail>(`${BASE}/workflows/${workflowId}`, { params: scope });

export const createWorkflow = (body: {
  name: string;
  description?: string;
  graph: AgentGraph;
  tags?: string[];
}) => post<WorkflowDetail>("/workflows", body);

export const saveWorkflowDraft = (
  workflowId: string,
  body: { base_version_number: number; graph: AgentGraph; name?: string; description?: string },
) =>
  apiFetch<WorkflowDetail>(`${BASE}/workflows/${workflowId}/draft`, {
    method: "PATCH",
    body: JSON.stringify(body),
    params: scope,
  });

export const validateWorkflow = (workflowId: string) =>
  post<ValidationResult>(`/workflows/${workflowId}/validate`);

export const dryRunWorkflow = (workflowId: string, input: Record<string, unknown>) =>
  post<AgentRun>(`/workflows/${workflowId}/dry-run`, { input });

export const getRuns = () =>
  apiFetch<{ runs: AgentRun[] }>(`${BASE}/runs`, { params: scope });

export const getRun = (runId: string) =>
  apiFetch<AgentRun>(`${BASE}/runs/${runId}`, { params: scope });

export const getWorkflowEvals = (workflowId: string) =>
  apiFetch<AgentEvalRun>(`${BASE}/workflows/${workflowId}/evals`, { params: scope });

export const runWorkflowEvals = (workflowId: string) =>
  post<AgentEvalRun>(`/workflows/${workflowId}/evals/run`);

export const getEvalRun = (evalRunId: string) =>
  apiFetch<AgentEvalRun>(`${BASE}/eval-runs/${evalRunId}`, { params: scope });

export const stageWorkflow = (workflowId: string) =>
  post<WorkflowDetail>(`/workflows/${workflowId}/publish`, { status: "staged" });

export const promoteRunFailure = (runId: string) =>
  post<{ source_run_id: string; already_promoted: boolean }>(`/runs/${runId}/promote-failure`);
