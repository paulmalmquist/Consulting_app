/**
 * Business OS API client.
 *
 * In production, calls default to the same-origin Next.js proxy at
 * /bos/[...path]/route.ts (e.g. /bos/api/repe/context) to avoid CORS issues.
 * If NEXT_PUBLIC_BOS_API_BASE_URL (or NEXT_PUBLIC_API_BASE_URL) is explicitly
 * configured, the browser calls that backend directly.
 *
 * In development (localhost), calls go directly to the FastAPI backend
 * at http://localhost:8000 for simpler debugging.
 */
import { logError, logInfo } from "@/lib/logging/logger";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import type { AccountSummary, ExecutionControlState, ExecutionEvent, ExecutionOrder, PortfolioPosition, PostTradeReview, PromotionChecklist, TradeIntent, TradeRiskCheck } from "@/lib/trades/types";
import type {
  PdsAttentionAction,
  PdsAttentionProject,
  PdsBudgetLine,
  PdsBudgetSummary,
  PdsChangeOrder,
  PdsContractorClaim,
  PdsDocument,
  PdsFinancialHealth,
  PdsExecutiveBriefingPack,
  PdsExecutiveConnectorRun,
  PdsExecutiveMemory,
  PdsExecutiveNarrativeDraft,
  PdsExecutiveOverview,
  PdsExecutiveQueueActionResult,
  PdsExecutiveQueueItem,
  PdsPermit,
  PdsPortfolioDashboard,
  PdsPortfolioHealth,
  PdsPortfolioKpis,
  PdsPortfolioSummary,
  PdsProject,
  PdsProjectOverview,
  PdsReportPackRun,
  PdsRfi,
  PdsScheduleItem,
  PdsSiteReport,
  PdsSnapshotRun,
  PdsStatusMetric,
  PdsSubmittal,
  PdsUpcomingMilestone,
  PdsUserActionQueueItem,
  PdsVendor,
} from "@/types/pds";

/**
 * Resolve the BOS API base origin and whether to use the /bos proxy prefix.
 *
 * In development (localhost), we call the backend directly.
 * In production, explicit browser API base URLs are honored when configured.
 * Otherwise we route through the same-origin /bos proxy.
 */
const _bosConfig = (() => {
  const configuredRaw =
    process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "";
  const configured =
    typeof window !== "undefined" && configuredRaw.startsWith("/")
      ? window.location.origin
      : configuredRaw.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    const looksLocalApi =
      configured.includes("localhost") || configured.includes("127.0.0.1");

    // If an explicit browser-safe backend URL is configured, prefer it.
    // This supports deployments where route handlers (/bos/*) are unavailable.
    if (configured) {
      // Guardrail: ignore localhost API URLs in production.
      if (!isLocalHost && looksLocalApi) {
        return { origin: window.location.origin, proxyPrefix: "/bos" };
      }
      return { origin: configured, proxyPrefix: "" };
    }

    if (isLocalHost) {
      return { origin: "http://localhost:8000", proxyPrefix: "" };
    }

    // Production: same-origin proxy at /bos/*
    return { origin: window.location.origin, proxyPrefix: "/bos" };
  }

  return { origin: configured || "http://localhost:8000", proxyPrefix: "" };
})();

const API_BASE = _bosConfig.origin;

export type BosApiError = Error & {
  status?: number;
  requestId?: string;
  detail?: unknown;
};

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function getRunIdForRequest(): string | null {
  const mode = process.env.NODE_ENV;
  if (mode === "production") return null;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("bm_run_id");
  } catch {
    return null;
  }
}

export async function bosFetch<T>(path: string, options: RequestInit & { params?: Record<string, string | undefined> } = {}): Promise<T> {
  const requestId = makeRequestId();
  const runId = getRunIdForRequest();
  const startedAt = Date.now();
  // In production, prepend /bos proxy prefix so paths like /api/repe/context
  // become /bos/api/repe/context and route through the same-origin proxy.
  const effectivePath = _bosConfig.proxyPrefix
    ? `${_bosConfig.proxyPrefix}${path}`
    : path;
  const url = new URL(effectivePath, API_BASE);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const payloadSize =
    typeof options.body === "string"
      ? options.body.length
      : options.body
        ? JSON.stringify(options.body).length
        : 0;
  logInfo("api.request_start", "API request start", {
    path,
    method: options.method || "GET",
    request_id: requestId,
    run_id: runId,
    payload_size: payloadSize,
  });

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const reqHeaders: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    "X-Request-Id": requestId,
    ...(runId ? { "X-Run-Id": runId } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url.toString(), {
    ...options,
    headers: reqHeaders,
  });
  const durationMs = Date.now() - startedAt;
  const responseRequestId = res.headers.get("X-Request-Id") || undefined;

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let payload: unknown;
    const contentType = res.headers.get("content-type") || "";
    try {
      payload = await res.json();
      if (payload && typeof payload === "object") {
        const detail = (payload as Record<string, unknown>).detail;
        const message = (payload as Record<string, unknown>).message;
        if (typeof detail === "string") {
          msg = detail;
        } else if (detail && typeof detail === "object") {
          // Structured error: { error_code, message, detail }
          const structured = detail as Record<string, unknown>;
          if (typeof structured.message === "string") msg = structured.message;
          else if (typeof structured.error_code === "string") msg = structured.error_code;
        } else if (typeof message === "string") {
          msg = message;
        }
      }
    } catch {
      payload = undefined;
    }

    if (payload === undefined) {
      let bodySnippet = "";
      try {
        bodySnippet = (await res.clone().text()).slice(0, 220);
      } catch {
        bodySnippet = "";
      }
      if (
        contentType.includes("text/html") &&
        (res.status === 404 || res.status === 405)
      ) {
        msg =
          "Business OS API route is not available in this deployment. Check /bos route handlers or NEXT_PUBLIC_BOS_API_BASE_URL.";
        payload = {
          error_code: "PROXY_ROUTE_MISSING",
          message: msg,
          detail: { path, method: options.method || "GET" },
          body_snippet: bodySnippet,
        };
      } else if (bodySnippet) {
        payload = {
          error_code: "NON_JSON_ERROR_RESPONSE",
          message: msg,
          detail: { path, method: options.method || "GET" },
          body_snippet: bodySnippet,
        };
      }
    }
    logError("api.request_error", "API request failed", {
      path,
      method: options.method || "GET",
      request_id: requestId,
      run_id: runId,
      status: res.status,
      content_type: contentType || undefined,
      response_request_id: responseRequestId,
      duration_ms: durationMs,
    });
    const error = new Error(
      responseRequestId ? `${msg} (req: ${responseRequestId})` : msg
    ) as BosApiError;
    error.status = res.status;
    error.requestId = responseRequestId || requestId;
    error.detail = payload;
    throw error;
  }
  logInfo("api.request_end", "API request completed", {
    path,
    method: options.method || "GET",
    request_id: requestId,
    run_id: runId,
    status: res.status,
    response_request_id: responseRequestId,
    duration_ms: durationMs,
  });
  return res.json() as Promise<T>;
}

/**
 * Direct same-origin fetch for Next.js API routes that query Supabase directly.
 * These routes bypass the /bos proxy entirely and work even when the Python
 * backend is not deployed.
 */
async function directFetch<T>(path: string, options: RequestInit & { params?: Record<string, string | undefined> } = {}): Promise<T> {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const url = new URL(path, origin);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
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
    const error = new Error(`Direct API request failed (${res.status})`) as BosApiError;
    error.status = res.status;
    throw error;
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────

export interface Department {
  department_id: string;
  key: string;
  label: string;
  icon: string;
  sort_order: number;
  enabled?: boolean;
  sort_order_override?: number | null;
}

export interface Capability {
  capability_id: string;
  department_id: string;
  department_key: string;
  key: string;
  label: string;
  kind: string; // "action" | "document_view" | "history"
  sort_order: number;
  metadata_json: Record<string, unknown>;
  enabled?: boolean;
  sort_order_override?: number | null;
}

export interface Template {
  key: string;
  label: string;
  description: string;
  departments: string[];
}

export interface BusinessCreateResult {
  business_id: string;
  slug: string;
}

export interface BusinessItem {
  business_id: string;
  tenant_id: string;
  name: string;
  slug: string;
  region: string;
  created_at?: string | null;
}

export interface DocumentItem {
  document_id: string;
  business_id: string | null;
  department_id: string | null;
  title: string;
  virtual_path: string | null;
  status: string;
  created_at: string;
  latest_version_number: number | null;
  latest_content_type: string | null;
  latest_size_bytes: number | null;
}

export interface DocumentVersion {
  version_id: string;
  document_id: string;
  version_number: number;
  state: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  content_hash: string | null;
  created_at: string;
}

export interface InitUploadResult {
  document_id: string;
  version_id: string;
  storage_key: string;
  signed_upload_url: string;
}

export type DocumentEntityType =
  | "fund"
  | "investment"
  | "asset"
  | "pds_project"
  | "pds_program"
  | "credit_case"
  | "legal_matter"
  | "medical_property"
  | "medical_tenant";

export interface ExecutionItem {
  execution_id: string;
  business_id: string;
  department_id: string | null;
  capability_id: string | null;
  status: string;
  inputs_json: Record<string, unknown>;
  outputs_json: Record<string, unknown>;
  created_at: string;
}

export interface RunResult {
  run_id: string;
  status: string;
  outputs_json: Record<string, unknown>;
}

export interface ReTrust {
  trust_id: string;
  business_id: string;
  name: string;
  external_ids: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
}

export interface ReLoan {
  loan_id: string;
  trust_id: string;
  business_id: string;
  loan_identifier: string;
  external_ids: Record<string, unknown>;
  original_balance_cents: number;
  current_balance_cents: number;
  rate_decimal?: number | null;
  maturity_date?: string | null;
  servicer_status: string;
  metadata_json: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
}

export interface ReSurveillance {
  surveillance_id: string;
  loan_id: string;
  business_id: string;
  period_end_date: string;
  metrics_json: Record<string, unknown>;
  dscr?: number | null;
  occupancy?: number | null;
  noi_cents?: number | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface ReUnderwriteRun {
  underwrite_run_id: string;
  loan_id: string;
  business_id: string;
  execution_id?: string | null;
  run_at: string;
  inputs_json: Record<string, unknown>;
  outputs_json: Record<string, unknown>;
  document_ids: string[];
  diff_from_run_id?: string | null;
  created_by?: string | null;
  version: number;
  created_at: string;
}

export interface ReWorkoutAction {
  action_id: string;
  case_id: string;
  business_id: string;
  action_type: string;
  status: string;
  due_date?: string | null;
  owner?: string | null;
  summary?: string | null;
  audit_log_json: Record<string, unknown>;
  document_ids: string[];
  created_by?: string | null;
  created_at: string;
}

export interface ReWorkoutCase {
  case_id: string;
  loan_id: string;
  business_id: string;
  case_status: string;
  opened_at: string;
  closed_at?: string | null;
  assigned_to?: string | null;
  summary?: string | null;
  created_by?: string | null;
  created_at: string;
  actions: ReWorkoutAction[];
}

export interface ReEvent {
  event_id: string;
  loan_id: string;
  business_id: string;
  event_type: string;
  event_date: string;
  severity: string;
  description: string;
  document_ids: string[];
  created_by?: string | null;
  created_at: string;
}

export interface ReLoanDetail {
  loan: ReLoan;
  borrowers: Array<Record<string, unknown>>;
  properties: Array<Record<string, unknown>>;
  latest_surveillance?: Record<string, unknown> | null;
}

export interface ExtractedDocument {
  id: string;
  document_id: string;
  document_version_id: string;
  doc_type: string;
  status: string;
  created_at: string;
}

export interface ExtractedField {
  id: string;
  extracted_document_id: string;
  field_key: string;
  field_value_json: unknown;
  confidence: number | null;
  evidence_json: { page?: number; snippet?: string };
  created_at: string;
}

export interface ExtractionDetail {
  extracted_document: ExtractedDocument;
  latest_run?: { status: string; error?: string | null } | null;
  fields: ExtractedField[];
}

// ── Templates ────────────────────────────────────────────────────────

export function getTemplates(): Promise<Template[]> {
  return bosFetch("/api/templates");
}

// ── Catalog (all departments/capabilities for onboarding) ────────────

export function getAllDepartments(): Promise<Department[]> {
  return bosFetch("/api/departments");
}

export function getCatalogCapabilities(deptKey: string): Promise<Capability[]> {
  return bosFetch(`/api/departments/${deptKey}/capabilities`);
}

// ── Business ─────────────────────────────────────────────────────────

export function createBusiness(name: string, slug: string, region: string): Promise<BusinessCreateResult> {
  return bosFetch("/api/businesses", {
    method: "POST",
    body: JSON.stringify({ name, slug, region }),
  });
}

export function listBusinesses(): Promise<BusinessItem[]> {
  return bosFetch("/api/businesses");
}

export function applyTemplate(businessId: string, templateKey: string, departments: string[], capabilities: string[]): Promise<{ ok: boolean }> {
  return bosFetch(`/api/businesses/${businessId}/apply-template`, {
    method: "POST",
    body: JSON.stringify({
      template_key: templateKey,
      enabled_departments: departments,
      enabled_capabilities: capabilities,
    }),
  });
}

export function applyCustom(businessId: string, departments: string[], capabilities: string[]): Promise<{ ok: boolean }> {
  return bosFetch(`/api/businesses/${businessId}/apply-custom`, {
    method: "POST",
    body: JSON.stringify({
      enabled_departments: departments,
      enabled_capabilities: capabilities,
    }),
  });
}

// ── Business config (enabled departments/capabilities) ───────────────

export function getBusinessDepartments(businessId: string): Promise<Department[]> {
  return bosFetch(`/api/businesses/${businessId}/departments`);
}

export function getDepartmentCapabilities(businessId: string, deptKey: string): Promise<Capability[]> {
  return bosFetch(`/api/businesses/${businessId}/departments/${deptKey}/capabilities`);
}

// ── Documents ────────────────────────────────────────────────────────

export function initUpload(body: {
  business_id: string;
  department_id?: string | null;
  filename: string;
  content_type: string;
  title?: string;
  virtual_path?: string;
  entity_type?: DocumentEntityType;
  entity_id?: string;
  env_id?: string;
}): Promise<InitUploadResult> {
  return bosFetch("/api/documents/init-upload", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function completeUpload(body: {
  document_id: string;
  version_id: string;
  sha256: string;
  byte_size: number;
  entity_type?: DocumentEntityType;
  entity_id?: string;
  env_id?: string;
}): Promise<{ ok: boolean }> {
  return bosFetch("/api/documents/complete-upload", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listDocuments(
  businessId: string,
  departmentId?: string,
  entityContext?: {
    env_id?: string;
    entity_type?: DocumentEntityType;
    entity_id?: string;
  }
): Promise<DocumentItem[]> {
  return bosFetch("/api/documents", {
    params: {
      business_id: businessId,
      department_id: departmentId,
      env_id: entityContext?.env_id,
      entity_type: entityContext?.entity_type,
      entity_id: entityContext?.entity_id,
    },
  });
}

export function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  return bosFetch(`/api/documents/${documentId}/versions`);
}

export function getDownloadUrl(documentId: string, versionId: string): Promise<{ signed_download_url: string }> {
  return bosFetch(`/api/documents/${documentId}/versions/${versionId}/download-url`);
}

// ── Executions ───────────────────────────────────────────────────────

export function runExecution(body: {
  business_id: string;
  department_id?: string;
  capability_id?: string;
  execution_type?: string;
  inputs_json: Record<string, unknown>;
}): Promise<RunResult> {
  return bosFetch("/api/executions/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listExecutions(businessId: string, departmentId?: string, capabilityId?: string): Promise<ExecutionItem[]> {
  return bosFetch("/api/executions", {
    params: {
      business_id: businessId,
      department_id: departmentId,
      capability_id: capabilityId,
    },
  });
}

// ── PDS Command ──────────────────────────────────────────────────────

export interface DomainContext {
  env_id: string;
  business_id: string;
  created: boolean;
  source: string;
  diagnostics: Record<string, unknown>;
}

export interface OpportunityModelRun {
  run_id: string;
  env_id: string;
  business_id: string;
  run_type: string;
  mode: string;
  model_version: string;
  status: string;
  business_lines: string[];
  triggered_by?: string | null;
  input_hash?: string | null;
  parameters_json: Record<string, unknown>;
  metrics_json: Record<string, unknown>;
  error_summary?: string | null;
  started_at: string;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunitySignal {
  market_signal_id: string;
  run_id: string;
  signal_source: string;
  source_market_id: string;
  signal_key: string;
  signal_name: string;
  canonical_topic: string;
  business_line: string;
  sector?: string | null;
  geography?: string | null;
  signal_direction?: string | null;
  probability: number;
  signal_strength: number;
  confidence?: number | null;
  observed_at?: string | null;
  expires_at?: string | null;
  metadata_json: Record<string, unknown>;
  explanation_json: Record<string, unknown>;
  created_at?: string | null;
}

export interface OpportunityRecommendation {
  recommendation_id: string;
  run_id: string;
  opportunity_score_id?: string | null;
  business_line: string;
  entity_type: string;
  entity_id?: string | null;
  entity_key: string;
  recommendation_type: string;
  title: string;
  summary?: string | null;
  suggested_action?: string | null;
  action_owner?: string | null;
  priority: string;
  sector?: string | null;
  geography?: string | null;
  confidence: number;
  why_json: Record<string, unknown>;
  driver_summary?: string | null;
  created_at: string;
  updated_at: string;
  score?: number | null;
  probability?: number | null;
  expected_value?: number | null;
  rank_position?: number | null;
  model_version?: string | null;
  fallback_mode?: string | null;
}

export interface OpportunityExplanation {
  driver_key: string;
  driver_label: string;
  driver_value?: number | null;
  contribution_score?: number | null;
  rank_position?: number | null;
  explanation_text?: string | null;
}

export interface OpportunityScoreHistoryPoint {
  as_of_date: string;
  score?: number | null;
  probability?: number | null;
}

export interface OpportunityRecommendationDetail extends OpportunityRecommendation {
  drivers: OpportunityExplanation[];
  score_history: OpportunityScoreHistoryPoint[];
  linked_signals: OpportunitySignal[];
  linked_forecasts: Array<Record<string, unknown>>;
}

export interface OpportunityDashboard {
  latest_run: OpportunityModelRun | null;
  recommendation_counts: Record<string, number>;
  top_recommendations: OpportunityRecommendation[];
  top_signals: OpportunitySignal[];
  run_history: OpportunityModelRun[];
}

export type PdsV2Lens = "market" | "account" | "project" | "resource" | "business_line";
export type PdsV2Horizon = "MTD" | "QTD" | "YTD" | "Forecast";
export type PdsV2RolePreset = "executive" | "market_leader" | "account_director" | "project_lead" | "business_line_leader";

export interface PdsV2BusinessLine {
  business_line_id: string;
  line_code: string;
  line_name: string;
  line_category: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface PdsV2LeaderCoverage {
  leader_coverage_id: string;
  resource_id: string;
  resource_name: string;
  market_id: string;
  market_name: string;
  business_line_id: string;
  business_line_name: string;
  coverage_role: string;
  effective_from: string;
  effective_to: string | null;
  is_primary: boolean;
}

export interface PdsV2Context extends DomainContext {
  workspace_template_key: string;
}

export interface PdsV2MetricCard {
  key: string;
  label: string;
  value: string | number;
  comparison_label?: string | null;
  comparison_value?: string | number | null;
  delta_value?: string | number | null;
  tone: string;
  unit?: string | null;
}

export interface PdsV2PerformanceRow {
  entity_id: string;
  entity_label: string;
  owner_label?: string | null;
  health_status: string;
  fee_plan?: string | number;
  fee_actual?: string | number;
  fee_variance?: string | number;
  gaap_plan?: string | number;
  gaap_actual?: string | number;
  gaap_variance?: string | number;
  ci_plan?: string | number;
  ci_actual?: string | number;
  ci_variance?: string | number;
  backlog?: string | number;
  forecast?: string | number;
  red_projects?: number;
  client_risk_accounts?: number;
  satisfaction_score?: string | number | null;
  utilization_pct?: string | number | null;
  timecard_compliance_pct?: string | number | null;
  collections_lag?: string | number | null;
  writeoff_leakage?: string | number | null;
  reason_codes: string[];
  href?: string | null;
}

export interface PdsV2PerformanceTable {
  lens: PdsV2Lens;
  horizon: PdsV2Horizon;
  columns: string[];
  rows: PdsV2PerformanceRow[];
}

export interface PdsV2DeliveryRiskItem {
  project_id: string;
  project_name: string;
  account_name?: string | null;
  market_name?: string | null;
  issue_summary: string;
  severity: string;
  risk_score: string | number;
  reason_codes: string[];
  recommended_action: string;
  recommended_owner?: string | null;
  href: string;
}

export interface PdsV2ResourceHealthItem {
  resource_id: string;
  resource_name: string;
  title?: string | null;
  market_name?: string | null;
  utilization_pct: string | number;
  billable_mix_pct: string | number;
  delinquent_timecards: number;
  overload_flag: boolean;
  staffing_gap_flag: boolean;
  reason_codes: string[];
}

export interface PdsV2TimecardHealthItem {
  resource_id?: string | null;
  resource_name: string;
  submitted_pct: string | number;
  delinquent_count: number;
  overdue_hours: string | number;
  reason_codes: string[];
}

export interface PdsV2ForecastPoint {
  forecast_month: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  current_value: string | number;
  prior_value: string | number;
  delta_value: string | number;
  override_value?: string | number | null;
  override_reason?: string | null;
  confidence_score: string | number;
}

export interface PdsV2SatisfactionItem {
  account_id: string;
  account_name: string;
  client_name?: string | null;
  average_score: string | number;
  trend_delta: string | number;
  response_count: number;
  repeat_award_score: string | number;
  risk_state: string;
  reason_codes: string[];
}

export interface PdsV2CloseoutItem {
  project_id: string;
  project_name: string;
  closeout_target_date?: string | null;
  substantial_completion_date?: string | null;
  actual_closeout_date?: string | null;
  closeout_aging_days: number;
  blocker_count: number;
  final_billing_status: string;
  survey_status: string;
  lessons_learned_status: string;
  risk_state: string;
  reason_codes: string[];
  href: string;
}

export interface PdsV2AccountAlert {
  key: string;
  label: string;
  count: number;
  description?: string | null;
  tone: string;
}

export interface PdsV2AccountDashboardRow {
  account_id: string;
  account_name: string;
  owner_name?: string | null;
  health_score: number;
  health_band: "healthy" | "watch" | "at_risk";
  trend: "improving" | "stable" | "deteriorating";
  fee_plan: string | number;
  fee_actual: string | number;
  plan_variance_pct: string | number;
  ytd_revenue: string | number;
  staffing_score: number;
  team_utilization_pct?: string | number | null;
  overloaded_resources: number;
  staffing_gap_resources: number;
  timecard_compliance_pct?: string | number | null;
  satisfaction_score?: string | number | null;
  satisfaction_trend_delta?: string | number | null;
  red_projects: number;
  collections_lag: string | number;
  writeoff_leakage: string | number;
  reason_codes: string[];
  primary_issue_code?: string | null;
  impact_label?: string | null;
  recommended_action?: string | null;
  recommended_owner?: string | null;
}

export interface PdsV2AccountActionItem {
  account_id: string;
  account_name: string;
  owner_name?: string | null;
  health_score: number;
  health_band: "healthy" | "watch" | "at_risk";
  issue: string;
  impact_label: string;
  recommended_action: string;
  recommended_owner?: string | null;
  severity_rank: number;
}

export interface PdsV2AccountDashboard {
  alerts: PdsV2AccountAlert[];
  distribution: Record<string, number>;
  accounts: PdsV2AccountDashboardRow[];
  actions: PdsV2AccountActionItem[];
}

export interface PdsV2AccountPreviewProjectRisk {
  project_id: string;
  project_name: string;
  severity: string;
  risk_score: string | number;
  issue_summary: string;
  recommended_action?: string | null;
  href: string;
}

export interface PdsV2AccountPreview {
  account_id: string;
  account_name: string;
  owner_name?: string | null;
  health_score: number;
  health_band: "healthy" | "watch" | "at_risk";
  trend: "improving" | "stable" | "deteriorating";
  fee_plan: string | number;
  fee_actual: string | number;
  plan_variance_pct: string | number;
  ytd_revenue: string | number;
  score_breakdown: Record<string, string | number>;
  team_utilization_pct?: string | number | null;
  staffing_score: number;
  overloaded_resources: number;
  staffing_gap_resources: number;
  timecard_compliance_pct?: string | number | null;
  satisfaction_score?: string | number | null;
  satisfaction_trend_delta?: string | number | null;
  red_projects: number;
  collections_lag: string | number;
  writeoff_leakage: string | number;
  primary_issue_code?: string | null;
  impact_label?: string | null;
  recommended_action?: string | null;
  recommended_owner?: string | null;
  reason_codes: string[];
  top_project_risks: PdsV2AccountPreviewProjectRisk[];
}

export interface PdsV2Briefing {
  generated_at: string;
  lens: PdsV2Lens;
  horizon: PdsV2Horizon;
  role_preset: PdsV2RolePreset;
  headline: string;
  summary_lines: string[];
  recommended_actions: string[];
}

export interface PdsV2ReportPacket {
  packet_type: string;
  generated_at: string;
  title: string;
  sections: Array<Record<string, unknown>>;
  narrative?: string | null;
}

export interface PdsV2PipelineDeal {
  deal_id: string;
  account_id?: string | null;
  deal_name: string;
  account_name?: string | null;
  stage: string;
  deal_value: number | string;
  probability_pct: number | string;
  expected_close_date?: string | null;
  owner_name?: string | null;
  notes?: string | null;
  lost_reason?: string | null;
  stage_entered_at?: string | null;
  last_activity_at?: string | null;
  days_in_stage: number;
  days_to_close?: number | null;
  health_state: "neutral" | "positive" | "warn" | "danger";
  attention_reasons: string[];
  is_closed: boolean;
}

export interface PdsV2PipelineMetric {
  key: string;
  label: string;
  value?: number | string | null;
  delta_value?: number | string | null;
  delta_label?: string | null;
  tone: "neutral" | "positive" | "warn" | "danger";
  context?: string | null;
  empty_hint?: string | null;
}

export interface PdsV2PipelineAttentionItem {
  deal_id: string;
  deal_name: string;
  account_name?: string | null;
  stage: string;
  deal_value: number | string;
  probability_pct: number | string;
  expected_close_date?: string | null;
  issue_type: string;
  issue: string;
  action: string;
  tone: "neutral" | "positive" | "warn" | "danger";
}

export interface PdsV2PipelineStage {
  stage: string;
  label?: string | null;
  count: number;
  weighted_value: number | string;
  unweighted_value: number | string;
  avg_days_in_stage?: number | string | null;
  conversion_to_next_pct?: number | string | null;
  dropoff_pct?: number | string | null;
  tone: "neutral" | "positive" | "warn" | "danger";
}

export interface PdsV2PipelineTimelinePoint {
  forecast_month: string;
  unweighted_value: number | string;
  weighted_value: number | string;
  deal_count: number;
}

export interface PdsV2PipelineLookupOption {
  value: string;
  label: string;
  meta?: string | null;
}

export interface PdsV2PipelineLookups {
  accounts: PdsV2PipelineLookupOption[];
  owners: PdsV2PipelineLookupOption[];
  stages: PdsV2PipelineLookupOption[];
}

export interface PdsV2PipelineDealDetail {
  deal: PdsV2PipelineDeal;
  history: Array<{
    stage_history_id: string;
    from_stage?: string | null;
    to_stage: string;
    changed_at: string;
    note?: string | null;
  }>;
}

export interface PdsV2PipelineSummary {
  has_deals: boolean;
  empty_state_title?: string | null;
  empty_state_body?: string | null;
  required_fields: string[];
  example_deal?: Record<string, unknown> | null;
  metrics: PdsV2PipelineMetric[];
  attention_items: PdsV2PipelineAttentionItem[];
  stages: PdsV2PipelineStage[];
  timeline: PdsV2PipelineTimelinePoint[];
  deals: PdsV2PipelineDeal[];
  total_pipeline_value: number;
  total_weighted_value: number;
}

export interface PdsV2CommandCenter {
  env_id: string;
  business_id: string;
  workspace_template_key: string;
  lens: PdsV2Lens;
  horizon: PdsV2Horizon;
  role_preset: PdsV2RolePreset;
  generated_at: string;
  metrics_strip: PdsV2MetricCard[];
  performance_table: PdsV2PerformanceTable;
  delivery_risk: PdsV2DeliveryRiskItem[];
  resource_health: PdsV2ResourceHealthItem[];
  timecard_health: PdsV2TimecardHealthItem[];
  forecast_points: PdsV2ForecastPoint[];
  satisfaction: PdsV2SatisfactionItem[];
  closeout: PdsV2CloseoutItem[];
  account_dashboard?: PdsV2AccountDashboard | null;
  briefing: PdsV2Briefing;
}

export type {
  PdsAttentionAction,
  PdsAttentionProject,
  PdsBudgetLine,
  PdsBudgetSummary,
  PdsChangeOrder,
  PdsContractorClaim,
  PdsDocument,
  PdsExecutiveBriefingPack,
  PdsExecutiveConnectorRun,
  PdsExecutiveMemory,
  PdsExecutiveNarrativeDraft,
  PdsExecutiveOverview,
  PdsExecutiveQueueActionResult,
  PdsExecutiveQueueItem,
  PdsFinancialHealth,
  PdsPermit,
  PdsPortfolioDashboard,
  PdsPortfolioHealth,
  PdsPortfolioKpis,
  PdsPortfolioSummary,
  PdsProject,
  PdsProjectOverview,
  PdsReportPackRun,
  PdsRfi,
  PdsScheduleItem,
  PdsSiteReport,
  PdsSnapshotRun,
  PdsStatusMetric,
  PdsSubmittal,
  PdsUpcomingMilestone,
  PdsUserActionQueueItem,
  PdsVendor,
};

export function getPdsContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/pds/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listPdsProjects(
  envId: string,
  businessId?: string,
  filters?: {
    stage?: string;
    status?: string;
    project_manager?: string;
    offset?: number;
    limit?: number;
  },
): Promise<PdsProject[]> {
  return bosFetch("/api/pds/v1/projects", {
    params: {
      env_id: envId,
      business_id: businessId,
      stage: filters?.stage,
      status: filters?.status,
      project_manager: filters?.project_manager,
      offset: filters?.offset?.toString(),
      limit: filters?.limit?.toString(),
    },
  });
}

export function createPdsProject(body: {
  env_id: string;
  business_id?: string;
  project_code?: string;
  name: string;
  description?: string;
  sector?: string;
  project_type?: string;
  stage?: string;
  status?: string;
  project_manager?: string;
  start_date?: string;
  target_end_date?: string;
  approved_budget?: string | number;
  contingency_budget?: string | number;
  currency_code?: string;
  baseline_period?: string;
  baseline_lines?: Array<{ cost_code: string; line_label: string; approved_amount?: string | number }>;
  next_milestone_date?: string;
  created_by?: string;
}): Promise<PdsProject> {
  return bosFetch("/api/pds/v1/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getPdsPortfolio(envId: string, period?: string, businessId?: string): Promise<PdsPortfolioKpis> {
  return bosFetch("/api/pds/v1/portfolio", {
    params: { env_id: envId, period, business_id: businessId },
  });
}

export function getPdsPortfolioDashboard(envId: string, period?: string, businessId?: string): Promise<PdsPortfolioDashboard> {
  return bosFetch("/api/pds/v1/portfolio/dashboard", {
    params: { env_id: envId, period, business_id: businessId },
  });
}

export function getPdsPortfolioHealth(
  envId: string,
  period?: string,
  businessId?: string,
  lookaheadDays = 7,
  milestoneWindowDays = 14,
): Promise<PdsPortfolioHealth> {
  return bosFetch("/api/pds/v1/portfolio/health", {
    params: {
      env_id: envId,
      period,
      business_id: businessId,
      lookahead_days: String(lookaheadDays),
      milestone_window_days: String(milestoneWindowDays),
    },
  });
}

export function getPdsProject(projectId: string, envId: string, businessId?: string): Promise<PdsProject> {
  return bosFetch(`/api/pds/v1/projects/${projectId}`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function updatePdsProject(
  projectId: string,
  body: Record<string, unknown>,
  envId: string,
  businessId?: string,
): Promise<PdsProject> {
  return bosFetch(`/api/pds/v1/projects/${projectId}`, {
    method: "PATCH",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body),
  });
}

export function getPdsProjectOverview(projectId: string, envId: string, businessId?: string): Promise<PdsProjectOverview> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/overview`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getPdsProjectBudget(
  projectId: string,
  envId: string,
  businessId?: string,
): Promise<{
  project_id: string;
  currency_code: string;
  totals: PdsBudgetSummary;
  versions: Array<Record<string, unknown>>;
  lines: PdsBudgetLine[];
  revisions: Array<Record<string, unknown>>;
  commitments: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  forecasts: Array<Record<string, unknown>>;
  change_orders: PdsChangeOrder[];
}> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/budget`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getPdsProjectSchedule(
  projectId: string,
  envId: string,
  businessId?: string,
): Promise<{
  project_id: string;
  schedule_health: string;
  total_slip_days: number;
  critical_flags: number;
  next_milestone_date: string | null;
  items: PdsScheduleItem[];
}> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/schedule`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listPdsProjectContracts(projectId: string, envId: string, businessId?: string): Promise<Array<Record<string, unknown>>> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/contracts`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listPdsProjectChangeOrders(projectId: string, envId: string, businessId?: string): Promise<PdsChangeOrder[]> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/change-orders`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listPdsProjectSiteReports(projectId: string, envId: string, businessId?: string): Promise<PdsSiteReport[]> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/site-reports`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createPdsProjectSiteReport(
  projectId: string,
  body: Record<string, unknown>,
  envId: string,
  businessId?: string,
): Promise<PdsSiteReport> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/site-reports`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body),
  });
}

export function listPdsProjectRfis(projectId: string, envId: string, businessId?: string, status?: string): Promise<PdsRfi[]> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/rfis`, {
    params: { env_id: envId, business_id: businessId, status },
  });
}

export function listPdsProjectSubmittals(projectId: string, envId: string, businessId?: string, status?: string): Promise<PdsSubmittal[]> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/submittals`, {
    params: { env_id: envId, business_id: businessId, status },
  });
}

export function listPdsProjectDocuments(projectId: string, envId: string, businessId?: string, document_type?: string): Promise<PdsDocument[]> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/documents`, {
    params: { env_id: envId, business_id: businessId, document_type },
  });
}

export function listPdsProjectPermits(projectId: string, envId: string, businessId?: string, status?: string): Promise<PdsPermit[]> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/permits`, {
    params: { env_id: envId, business_id: businessId, status },
  });
}

export function createPdsProjectPermit(
  projectId: string,
  body: Record<string, unknown>,
  envId: string,
  businessId?: string,
): Promise<PdsPermit> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/permits`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body),
  });
}

export function listPdsProjectContractorClaims(
  projectId: string,
  envId: string,
  businessId?: string,
  status?: string,
): Promise<PdsContractorClaim[]> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/contractor-claims`, {
    params: { env_id: envId, business_id: businessId, status },
  });
}

export function createPdsProjectContractorClaim(
  projectId: string,
  body: Record<string, unknown>,
  envId: string,
  businessId?: string,
): Promise<PdsContractorClaim> {
  return bosFetch(`/api/pds/v1/projects/${projectId}/contractor-claims`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body),
  });
}

export function listPdsVendors(envId: string, businessId?: string, status?: string): Promise<PdsVendor[]> {
  return bosFetch("/api/pds/v1/vendors", {
    params: { env_id: envId, business_id: businessId, status },
  });
}

export function createPdsVendor(body: Record<string, unknown>, envId: string, businessId?: string): Promise<PdsVendor> {
  return bosFetch("/api/pds/v1/vendors", {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body),
  });
}

export function runPdsSnapshot(body: {
  env_id: string;
  business_id?: string;
  period: string;
  project_id?: string;
  run_id?: string;
  created_by?: string;
}): Promise<PdsSnapshotRun> {
  return bosFetch("/api/pds/v1/snapshot/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runPdsReportPack(body: {
  env_id: string;
  business_id?: string;
  period: string;
  run_id?: string;
  created_by?: string;
}): Promise<PdsReportPackRun> {
  return bosFetch("/api/pds/v1/report-pack/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function seedPdsWorkspace(envId: string, businessId?: string): Promise<{ ok: boolean; seeded: boolean }> {
  return bosFetch("/api/pds/v1/seed", {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
  });
}

export function getPdsV2Context(envId: string, businessId?: string): Promise<PdsV2Context> {
  return bosFetch("/api/pds/v2/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getPdsCommandCenter(
  envId: string,
  options?: {
    business_id?: string;
    lens?: PdsV2Lens;
    horizon?: PdsV2Horizon;
    role_preset?: PdsV2RolePreset;
  },
): Promise<PdsV2CommandCenter> {
  return bosFetch("/api/pds/v2/command-center", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      lens: options?.lens,
      horizon: options?.horizon,
      role_preset: options?.role_preset,
    },
  });
}

export function getPdsAccountPreview(
  envId: string,
  accountId: string,
  options?: { business_id?: string; horizon?: PdsV2Horizon },
): Promise<PdsV2AccountPreview> {
  return bosFetch(`/api/pds/v2/accounts/${accountId}/preview`, {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      horizon: options?.horizon,
    },
  });
}

export function getPdsPipeline(
  envId: string,
  options?: { business_id?: string },
): Promise<PdsV2PipelineSummary> {
  return bosFetch("/api/pds/v2/pipeline", {
    params: { env_id: envId, business_id: options?.business_id },
  });
}

export function getPdsPipelineLookups(
  envId: string,
  options?: { business_id?: string },
): Promise<PdsV2PipelineLookups> {
  return bosFetch("/api/pds/v2/pipeline/lookups", {
    params: { env_id: envId, business_id: options?.business_id },
  });
}

export function getPdsPipelineDeal(
  envId: string,
  dealId: string,
  options?: { business_id?: string },
): Promise<PdsV2PipelineDealDetail> {
  return bosFetch(`/api/pds/v2/pipeline/deals/${dealId}`, {
    params: { env_id: envId, business_id: options?.business_id },
  });
}

export function createPdsPipelineDeal(body: {
  env_id: string;
  business_id?: string;
  deal_name: string;
  account_id?: string | null;
  stage?: string;
  deal_value: number | string;
  probability_pct: number | string;
  expected_close_date?: string | null;
  owner_name?: string | null;
  notes?: string | null;
  lost_reason?: string | null;
}): Promise<PdsV2PipelineDealDetail> {
  return bosFetch("/api/pds/v2/pipeline/deals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePdsPipelineDeal(
  envId: string,
  dealId: string,
  body: {
    deal_name?: string;
    account_id?: string | null;
    stage?: string;
    deal_value?: number | string;
    probability_pct?: number | string;
    expected_close_date?: string | null;
    owner_name?: string | null;
    notes?: string | null;
    lost_reason?: string | null;
    transition_note?: string | null;
  },
  options?: { business_id?: string },
): Promise<PdsV2PipelineDealDetail> {
  return bosFetch(`/api/pds/v2/pipeline/deals/${dealId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    params: { env_id: envId, business_id: options?.business_id },
  });
}

export function getPdsPerformanceTable(
  envId: string,
  options?: { business_id?: string; lens?: PdsV2Lens; horizon?: PdsV2Horizon },
): Promise<PdsV2PerformanceTable> {
  return bosFetch("/api/pds/v2/performance-table", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      lens: options?.lens,
      horizon: options?.horizon,
    },
  });
}

export function getPdsDeliveryRisk(
  envId: string,
  options?: { business_id?: string; horizon?: PdsV2Horizon },
): Promise<PdsV2DeliveryRiskItem[]> {
  return bosFetch("/api/pds/v2/delivery-risk", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      horizon: options?.horizon,
    },
  });
}

export function getPdsResourceHealth(
  envId: string,
  options?: { business_id?: string; horizon?: PdsV2Horizon },
): Promise<PdsV2ResourceHealthItem[]> {
  return bosFetch("/api/pds/v2/resources/health", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      horizon: options?.horizon,
    },
  });
}

export function getPdsTimecardHealth(
  envId: string,
  options?: { business_id?: string; horizon?: PdsV2Horizon },
): Promise<PdsV2TimecardHealthItem[]> {
  return bosFetch("/api/pds/v2/timecards/health", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      horizon: options?.horizon,
    },
  });
}

export function getPdsForecast(
  envId: string,
  options?: { business_id?: string; lens?: PdsV2Lens; horizon?: PdsV2Horizon },
): Promise<PdsV2ForecastPoint[]> {
  return bosFetch("/api/pds/v2/forecast", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      lens: options?.lens,
      horizon: options?.horizon,
    },
  });
}

export function getPdsSatisfaction(
  envId: string,
  options?: { business_id?: string; horizon?: PdsV2Horizon },
): Promise<PdsV2SatisfactionItem[]> {
  return bosFetch("/api/pds/v2/satisfaction", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      horizon: options?.horizon,
    },
  });
}

export function getPdsCloseout(
  envId: string,
  options?: { business_id?: string; horizon?: PdsV2Horizon },
): Promise<PdsV2CloseoutItem[]> {
  return bosFetch("/api/pds/v2/closeout", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      horizon: options?.horizon,
    },
  });
}

export function getPdsExecutiveBriefingV2(
  envId: string,
  options?: {
    business_id?: string;
    lens?: PdsV2Lens;
    horizon?: PdsV2Horizon;
    role_preset?: PdsV2RolePreset;
  },
): Promise<PdsV2Briefing> {
  return bosFetch("/api/pds/v2/briefings/executive", {
    params: {
      env_id: envId,
      business_id: options?.business_id,
      lens: options?.lens,
      horizon: options?.horizon,
      role_preset: options?.role_preset,
    },
  });
}

export function buildPdsReportPacket(body: {
  env_id: string;
  business_id?: string;
  packet_type: string;
  lens?: PdsV2Lens;
  horizon?: PdsV2Horizon;
  role_preset?: PdsV2RolePreset;
  actor?: string;
}): Promise<PdsV2ReportPacket> {
  return bosFetch("/api/pds/v2/reports/packet", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── PDS Executive ────────────────────────────────────────────────────

export function getPdsExecutiveOverview(envId: string, businessId?: string): Promise<PdsExecutiveOverview> {
  return bosFetch("/api/pds/v1/executive/overview", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listPdsExecutiveQueue(
  envId: string,
  businessId?: string,
  filters?: { status?: string; limit?: number },
): Promise<PdsExecutiveQueueItem[]> {
  return bosFetch("/api/pds/v1/executive/queue", {
    params: {
      env_id: envId,
      business_id: businessId,
      status: filters?.status,
      limit: filters?.limit?.toString(),
    },
  });
}

export function actOnPdsExecutiveQueueItem(
  queueItemId: string,
  body: {
    action_type: "approve" | "delegate" | "escalate" | "defer" | "reject" | "close";
    actor?: string;
    rationale?: string;
    delegate_to?: string;
    action_payload_json?: Record<string, unknown>;
  },
  envId: string,
  businessId?: string,
): Promise<PdsExecutiveQueueActionResult> {
  return bosFetch(`/api/pds/v1/executive/queue/${queueItemId}/actions`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body),
  });
}

export function getPdsExecutiveMemory(envId: string, businessId?: string, limit = 100): Promise<PdsExecutiveMemory> {
  return bosFetch("/api/pds/v1/executive/memory", {
    params: { env_id: envId, business_id: businessId, limit: String(limit) },
  });
}

export function runPdsExecutiveConnectors(body: {
  env_id: string;
  business_id?: string;
  connector_keys?: string[];
  run_mode?: "live" | "mock" | "manual";
  force_refresh?: boolean;
  actor?: string;
}): Promise<{ runs: PdsExecutiveConnectorRun[]; connector_keys: string[] }> {
  return bosFetch("/api/pds/v1/executive/runs/connectors", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listPdsExecutiveConnectorRuns(
  envId: string,
  businessId?: string,
  filters?: { connector_key?: string; limit?: number },
): Promise<Array<Record<string, unknown>>> {
  return bosFetch("/api/pds/v1/executive/runs/connectors", {
    params: {
      env_id: envId,
      business_id: businessId,
      connector_key: filters?.connector_key,
      limit: filters?.limit?.toString(),
    },
  });
}

export function runPdsExecutiveDecisionEngine(body: {
  env_id: string;
  business_id?: string;
  include_non_triggered?: boolean;
  actor?: string;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/pds/v1/executive/runs/decision-engine", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runPdsExecutiveFull(body: {
  env_id: string;
  business_id?: string;
  connector_keys?: string[];
  force_refresh?: boolean;
  actor?: string;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/pds/v1/executive/runs/full", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function generatePdsExecutiveMessaging(body: {
  env_id: string;
  business_id?: string;
  draft_types?: string[];
  actor?: string;
  source_run_id?: string;
}): Promise<PdsExecutiveNarrativeDraft[]> {
  return bosFetch("/api/pds/v1/executive/messaging/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listPdsExecutiveDrafts(
  envId: string,
  businessId?: string,
  filters?: { draft_type?: string; status?: string; limit?: number },
): Promise<PdsExecutiveNarrativeDraft[]> {
  return bosFetch("/api/pds/v1/executive/messaging/drafts", {
    params: {
      env_id: envId,
      business_id: businessId,
      draft_type: filters?.draft_type,
      status: filters?.status,
      limit: filters?.limit?.toString(),
    },
  });
}

export function approvePdsExecutiveDraft(
  draftId: string,
  body: { env_id?: string; business_id?: string; actor?: string; edited_body_text?: string },
): Promise<PdsExecutiveNarrativeDraft> {
  return bosFetch(`/api/pds/v1/executive/messaging/${draftId}/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function generatePdsExecutiveBriefing(body: {
  env_id: string;
  business_id?: string;
  briefing_type: "board" | "investor";
  period?: string;
  actor?: string;
  source_run_id?: string;
}): Promise<PdsExecutiveBriefingPack> {
  return bosFetch("/api/pds/v1/executive/briefings/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getPdsExecutiveBriefing(
  briefingPackId: string,
  envId: string,
  businessId?: string,
): Promise<PdsExecutiveBriefingPack> {
  return bosFetch(`/api/pds/v1/executive/briefings/${briefingPackId}`, {
    params: { env_id: envId, business_id: businessId },
  });
}

// ── Credit Risk Hub ──────────────────────────────────────────────────

export interface CreditCase {
  case_id: string;
  env_id: string;
  business_id: string;
  case_number: string;
  borrower_name: string;
  facility_type: string | null;
  stage: string;
  requested_amount: string;
  approved_amount: string;
  risk_grade: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function getCreditContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/credit/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listCreditCases(envId: string, businessId?: string): Promise<CreditCase[]> {
  return bosFetch("/api/credit/v1/cases", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createCreditCase(body: {
  env_id: string;
  business_id?: string;
  case_number: string;
  borrower_name: string;
  facility_type?: string;
  stage?: string;
  requested_amount?: string | number;
  risk_grade?: string;
  created_by?: string;
}): Promise<CreditCase> {
  return bosFetch("/api/credit/v1/cases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Credit Decisioning v2 ────────────────────────────────────────────

export interface CreditPortfolio {
  portfolio_id: string;
  env_id: string;
  business_id: string;
  name: string;
  product_type: string;
  origination_channel: string;
  servicer: string | null;
  status: string;
  vintage_quarter: string | null;
  loan_count: number;
  total_upb: string;
  created_at: string;
  updated_at: string;
}

export interface CreditLoan {
  loan_id: string;
  env_id: string;
  business_id: string;
  portfolio_id: string;
  borrower_id: string;
  loan_ref: string;
  origination_date: string | null;
  original_balance: string;
  current_balance: string;
  interest_rate: string | null;
  term_months: number | null;
  loan_status: string;
  delinquency_bucket: string;
  risk_grade: string | null;
  borrower_ref: string | null;
  fico_at_origination: number | null;
  created_at: string;
}

export interface CreditDecisionLog {
  decision_log_id: string;
  loan_id: string | null;
  policy_id: string;
  decision: string;
  explanation: string;
  rules_evaluated_json: Record<string, unknown>[];
  citation_chain_json: Record<string, unknown>[];
  chain_status: string;
  schema_valid: boolean;
  decided_by: string;
  decided_at: string;
  latency_ms: number | null;
  policy_name: string | null;
  loan_ref: string | null;
  borrower_ref: string | null;
}

export interface CreditException {
  exception_id: string;
  loan_id: string | null;
  decision_log_id: string;
  route_to: string;
  priority: string;
  reason: string;
  failing_rules_json: Record<string, unknown>[];
  status: string;
  resolution: string | null;
  resolution_note: string | null;
  sla_deadline: string | null;
  opened_at: string;
  resolved_at: string | null;
  loan_ref: string | null;
  borrower_ref: string | null;
}

export interface CreditCorpusDocument {
  document_id: string;
  document_ref: string;
  title: string;
  document_type: string;
  passage_count: number;
  status: string;
  ingested_at: string;
}

export interface CreditEnvironmentSnapshot {
  portfolio_count: number;
  total_upb: string;
  total_loan_count: number;
  dq_30plus_rate: string;
  dq_60plus_rate: string;
  dq_90plus_rate: string;
  exception_queue_depth: number;
  corpus_document_count: number;
  policy_count: number;
  decision_count: number;
}

// v2 context
export function getCreditV2Context(envId: string, businessId?: string) {
  return bosFetch<{ env_id: string; business_id: string; credit_initialized: boolean }>("/api/credit/v2/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function initCreditV2Context(envId: string, businessId?: string) {
  return bosFetch("/api/credit/v2/context/init", {
    method: "POST",
    body: JSON.stringify({ env_id: envId, business_id: businessId }),
  });
}

// Portfolios
export function listCreditPortfolios(envId: string, businessId?: string): Promise<CreditPortfolio[]> {
  return bosFetch("/api/credit/v2/portfolios", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getCreditPortfolio(envId: string, portfolioId: string, businessId?: string): Promise<CreditPortfolio> {
  return bosFetch(`/api/credit/v2/portfolios/${portfolioId}`, {
    params: { env_id: envId, business_id: businessId },
  });
}

// Loans
export function listCreditLoans(envId: string, portfolioId: string, businessId?: string): Promise<CreditLoan[]> {
  return bosFetch(`/api/credit/v2/portfolios/${portfolioId}/loans`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getCreditLoan(envId: string, loanId: string, businessId?: string): Promise<CreditLoan> {
  return bosFetch(`/api/credit/v2/loans/${loanId}`, {
    params: { env_id: envId, business_id: businessId },
  });
}

// Decisions
export function listCreditDecisions(envId: string, businessId?: string): Promise<CreditDecisionLog[]> {
  return bosFetch("/api/credit/v2/decisions", {
    params: { env_id: envId, business_id: businessId },
  });
}

// Exceptions
export function listCreditExceptions(envId: string, businessId?: string, status?: string): Promise<CreditException[]> {
  return bosFetch("/api/credit/v2/exceptions", {
    params: { env_id: envId, business_id: businessId, status },
  });
}

export function resolveCreditException(envId: string, exceptionId: string, body: { resolution: string; resolution_note?: string }, businessId?: string) {
  return bosFetch(`/api/credit/v2/exceptions/${exceptionId}/resolve`, {
    method: "PATCH",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body),
  });
}

// Corpus
export function listCreditCorpus(envId: string, businessId?: string): Promise<CreditCorpusDocument[]> {
  return bosFetch("/api/credit/v2/corpus", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function searchCreditCorpus(envId: string, query: string, businessId?: string) {
  return bosFetch("/api/credit/v2/corpus/search", {
    params: { env_id: envId, business_id: businessId, query },
  });
}

// Snapshot
export function getCreditSnapshot(envId: string, businessId?: string): Promise<CreditEnvironmentSnapshot> {
  return bosFetch("/api/credit/v2/snapshot", {
    params: { env_id: envId, business_id: businessId },
  });
}

// Seed
export function seedCreditDemo(envId: string, businessId?: string) {
  return bosFetch("/api/credit/v2/seed", {
    method: "POST",
    body: JSON.stringify({ env_id: envId, business_id: businessId }),
  });
}

// Evaluate
export function evaluateCreditLoan(envId: string, loanId: string, businessId?: string) {
  return bosFetch("/api/credit/v2/evaluate", {
    method: "POST",
    body: JSON.stringify({ env_id: envId, business_id: businessId, loan_id: loanId }),
  });
}

// ── Legal Ops Command ────────────────────────────────────────────────

export interface LegalMatter {
  matter_id: string;
  env_id: string;
  business_id: string;
  matter_number: string;
  title: string;
  matter_type: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  counterparty: string | null;
  outside_counsel: string | null;
  internal_owner: string | null;
  risk_level: string;
  budget_amount: string;
  actual_spend: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export function getLegalOpsContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/legalops/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listLegalMatters(envId: string, businessId?: string): Promise<LegalMatter[]> {
  return bosFetch("/api/legalops/v1/matters", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createLegalMatter(body: {
  env_id: string;
  business_id?: string;
  matter_number: string;
  title: string;
  matter_type: string;
  risk_level?: string;
  budget_amount?: string | number;
  status?: string;
  created_by?: string;
}): Promise<LegalMatter> {
  return bosFetch("/api/legalops/v1/matters", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface LegalDashboardKpis {
  open_matters: number;
  high_risk_matters: number;
  litigation_exposure: string;
  contracts_pending_review: number;
  contracts_expiring_soon: number;
  regulatory_deadlines_30d: number;
  outside_counsel_spend_ytd: string;
  total_budget: string;
}

export interface LegalDashboard {
  kpis: LegalDashboardKpis;
  risk_radar: Array<{
    matter_id: string;
    matter_number: string;
    title: string;
    matter_type: string;
    risk_level: string;
    actual_spend: string;
    internal_owner: string | null;
    status: string;
  }>;
  contract_pipeline: Record<string, number>;
  upcoming_deadlines: Array<{
    deadline_id: string;
    deadline_type: string;
    due_date: string;
    status: string;
    matter_number: string;
    title: string;
  }>;
  spend_summary: { ytd_spend: string; ytd_budget: string };
  governance_alerts: Array<{
    governance_item_id: string;
    item_type: string;
    title: string;
    scheduled_date: string | null;
    status: string;
    owner: string | null;
    entity_name: string | null;
  }>;
}

export interface LegalFirm {
  firm_id: string;
  env_id: string;
  business_id: string;
  firm_name: string;
  primary_contact: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  specialties: string[];
  performance_rating: string | null;
  status: string;
  matter_count: number;
  ytd_spend: string;
  created_at: string;
  updated_at: string;
}

export interface LegalContract {
  legal_contract_id: string;
  env_id: string;
  business_id: string;
  matter_id: string | null;
  contract_ref: string;
  contract_type: string;
  counterparty_name: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  governing_law: string | null;
  auto_renew: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LegalRegulatoryItem {
  regulatory_item_id: string;
  env_id: string;
  business_id: string;
  agency: string;
  regulation_ref: string | null;
  obligation_text: string;
  deadline: string | null;
  frequency: string | null;
  owner: string | null;
  status: string;
  created_at: string;
}

export interface LegalGovernanceItem {
  governance_item_id: string;
  env_id: string;
  business_id: string;
  item_type: string;
  title: string;
  scheduled_date: string | null;
  status: string;
  owner: string | null;
  entity_name: string | null;
  created_at: string;
}

export interface LegalSpendEntry {
  legal_spend_entry_id: string;
  env_id: string;
  business_id: string;
  matter_id: string;
  matter_number: string | null;
  matter_title: string | null;
  outside_counsel: string | null;
  invoice_ref: string | null;
  amount: string;
  incurred_date: string | null;
  created_at: string;
}

export interface LegalLitigationCase {
  litigation_case_id: string;
  env_id: string;
  business_id: string;
  matter_id: string;
  matter_number: string | null;
  matter_title: string | null;
  jurisdiction: string | null;
  claims: string | null;
  exposure_estimate: string;
  reserve_amount: string;
  insurance_carrier: string | null;
  status: string;
  created_at: string;
}

export function getLegalDashboard(envId: string, businessId?: string): Promise<LegalDashboard> {
  return bosFetch("/api/legalops/v1/dashboard", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listLegalFirms(envId: string, businessId?: string): Promise<LegalFirm[]> {
  return bosFetch("/api/legalops/v1/firms", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createLegalFirm(body: {
  env_id: string;
  business_id?: string;
  firm_name: string;
  primary_contact?: string;
  contact_email?: string;
  contact_phone?: string;
  specialties?: string[];
  status?: string;
  created_by?: string;
}): Promise<LegalFirm> {
  return bosFetch("/api/legalops/v1/firms", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listLegalContracts(envId: string, businessId?: string, status?: string): Promise<LegalContract[]> {
  return bosFetch("/api/legalops/v1/contracts", {
    params: { env_id: envId, business_id: businessId, status },
  });
}

export function listLegalRegulatory(envId: string, businessId?: string): Promise<LegalRegulatoryItem[]> {
  return bosFetch("/api/legalops/v1/regulatory", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listLegalGovernance(envId: string, businessId?: string, item_type?: string): Promise<LegalGovernanceItem[]> {
  return bosFetch("/api/legalops/v1/governance", {
    params: { env_id: envId, business_id: businessId, item_type },
  });
}

export function listLegalSpendEntries(envId: string, businessId?: string): Promise<LegalSpendEntry[]> {
  return bosFetch("/api/legalops/v1/spend-entries", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listLegalLitigation(envId: string, businessId?: string): Promise<LegalLitigationCase[]> {
  return bosFetch("/api/legalops/v1/litigation", {
    params: { env_id: envId, business_id: businessId },
  });
}

// ── Medical Office Backoffice ────────────────────────────────────────

export interface MedOfficeProperty {
  property_id: string;
  env_id: string;
  business_id: string;
  property_name: string;
  market: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function getMedOfficeContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/medoffice/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listMedOfficeProperties(envId: string, businessId?: string): Promise<MedOfficeProperty[]> {
  return bosFetch("/api/medoffice/v1/properties", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createMedOfficeProperty(body: {
  env_id: string;
  business_id?: string;
  property_name: string;
  market?: string;
  status?: string;
  created_by?: string;
}): Promise<MedOfficeProperty> {
  return bosFetch("/api/medoffice/v1/properties", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Real Estate (Special Servicing) ─────────────────────────────────

export function listReTrusts(businessId: string): Promise<ReTrust[]> {
  return bosFetch("/api/real-estate/trusts", { params: { business_id: businessId } });
}

export function createReTrust(body: {
  business_id: string;
  name: string;
  external_ids?: Record<string, unknown>;
  created_by?: string;
}): Promise<ReTrust> {
  return bosFetch("/api/real-estate/trusts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listReLoans(businessId: string, trustId?: string): Promise<ReLoan[]> {
  return bosFetch("/api/real-estate/loans", { params: { business_id: businessId, trust_id: trustId } });
}

export function createReLoan(body: {
  business_id: string;
  trust_id: string;
  loan_identifier: string;
  external_ids?: Record<string, unknown>;
  original_balance_cents: number;
  current_balance_cents: number;
  rate_decimal?: number;
  maturity_date?: string;
  servicer_status?: string;
  metadata_json?: Record<string, unknown>;
  borrowers?: Array<Record<string, unknown>>;
  properties?: Array<Record<string, unknown>>;
  created_by?: string;
}): Promise<ReLoan> {
  return bosFetch("/api/real-estate/loans", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getReLoan(loanId: string): Promise<ReLoanDetail> {
  return bosFetch(`/api/real-estate/loans/${loanId}`);
}

export function listReSurveillance(loanId: string): Promise<ReSurveillance[]> {
  return bosFetch(`/api/real-estate/loans/${loanId}/surveillance`);
}

export function createReSurveillance(loanId: string, body: {
  business_id: string;
  period_end_date: string;
  metrics_json?: Record<string, unknown>;
  dscr?: number;
  occupancy?: number;
  noi_cents?: number;
  notes?: string;
  created_by?: string;
}): Promise<ReSurveillance> {
  return bosFetch(`/api/real-estate/loans/${loanId}/surveillance`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listReUnderwriteRuns(loanId: string): Promise<ReUnderwriteRun[]> {
  return bosFetch(`/api/real-estate/loans/${loanId}/underwrite-runs`);
}

export function createReUnderwriteRun(loanId: string, body: {
  business_id: string;
  cap_rate?: number;
  stabilized_noi_cents?: number;
  vacancy_factor?: number;
  expense_growth?: number;
  interest_rate?: number;
  amortization_years?: number;
  created_by?: string;
  document_ids?: string[];
}): Promise<ReUnderwriteRun> {
  return bosFetch(`/api/real-estate/loans/${loanId}/underwrite-runs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listReWorkoutCases(loanId: string): Promise<ReWorkoutCase[]> {
  return bosFetch(`/api/real-estate/loans/${loanId}/workout-cases`);
}

export function createReWorkoutCase(loanId: string, body: {
  business_id: string;
  case_status?: string;
  assigned_to?: string;
  summary?: string;
  created_by?: string;
}): Promise<ReWorkoutCase> {
  return bosFetch(`/api/real-estate/loans/${loanId}/workout-cases`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createReWorkoutAction(caseId: string, body: {
  business_id: string;
  action_type: string;
  status?: string;
  due_date?: string;
  owner?: string;
  summary?: string;
  audit_log_json?: Record<string, unknown>;
  document_ids?: string[];
  created_by?: string;
}): Promise<ReWorkoutAction> {
  return bosFetch(`/api/real-estate/workout-cases/${caseId}/actions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listReEvents(loanId: string): Promise<ReEvent[]> {
  return bosFetch(`/api/real-estate/loans/${loanId}/events`);
}

export function createReEvent(loanId: string, body: {
  business_id: string;
  event_type: string;
  event_date: string;
  severity?: string;
  description: string;
  document_ids?: string[];
  created_by?: string;
}): Promise<ReEvent> {
  return bosFetch(`/api/real-estate/loans/${loanId}/events`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function seedReDemo(businessId: string): Promise<{ trust_id: string; loan_ids: string[] }> {
  return bosFetch("/api/real-estate/dev/seed", { method: "POST", params: { business_id: businessId } });
}

// ── SHA-256 helper (client-side, Web Crypto) ─────────────────────────

export async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}


export function initExtraction(body: { document_id: string; version_id: string; extraction_profile?: string }): Promise<ExtractedDocument> {
  return bosFetch('/api/extract/init', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function runExtraction(body: { extracted_document_id: string }): Promise<ExtractionDetail> {
  return bosFetch('/api/extract/run', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getExtraction(extractedDocumentId: string): Promise<ExtractionDetail> {
  return bosFetch(`/api/extract/${extractedDocumentId}`);
}

export function listExtractionFields(extractedDocumentId: string): Promise<ExtractedField[]> {
  return bosFetch(`/api/extract/${extractedDocumentId}/fields`);
}

export interface FinPartition {
  partition_id: string;
  tenant_id: string;
  business_id: string;
  key: string;
  partition_type: "live" | "snapshot" | "scenario";
  base_partition_id?: string | null;
  is_read_only: boolean;
  status: string;
  created_at: string;
}

export interface FinFund {
  fin_fund_id: string;
  business_id: string;
  partition_id: string;
  fund_code: string;
  name: string;
  strategy: string;
  pref_rate: string;
  carry_rate: string;
  waterfall_style: "american" | "european";
  created_at: string;
}

export interface FinRun {
  fin_run_id: string;
  business_id: string;
  partition_id: string;
  engine_kind: string;
  status: string;
  deterministic_hash: string;
  as_of_date: string;
  idempotency_key: string;
  created_at: string;
  completed_at?: string | null;
}

export interface FinRunResponse {
  run: FinRun;
  result_refs: Array<{ result_table: string; result_id: string; created_at?: string }>;
}

export interface FinParticipant {
  fin_participant_id: string;
  business_id: string;
  name: string;
  participant_type: string;
  external_key?: string | null;
  created_at: string;
}

export interface FinCommitment {
  fin_commitment_id: string;
  fin_participant_id: string;
  participant_name?: string;
  commitment_role: "lp" | "gp" | "co_invest";
  commitment_date: string;
  committed_amount: string;
}

export interface FinCapitalCall {
  fin_capital_call_id: string;
  call_number: number;
  call_date: string;
  due_date?: string | null;
  amount_requested: string;
  purpose?: string | null;
  status: string;
}

export interface FinAssetInvestment {
  fin_asset_investment_id: string;
  asset_name: string;
  acquisition_date?: string | null;
  cost_basis: string;
  current_valuation?: string | null;
  status: string;
}

export interface FinDistributionEvent {
  fin_distribution_event_id: string;
  fin_asset_investment_id?: string | null;
  asset_name?: string | null;
  event_date: string;
  gross_proceeds: string;
  net_distributable: string;
  event_type: string;
  status: string;
  reference?: string | null;
}

export interface FinDistributionPayout {
  fin_distribution_payout_id: string;
  fin_participant_id: string;
  participant_name?: string | null;
  payout_type: string;
  amount: string;
  payout_date: string;
}

export function listFinPartitions(businessId: string): Promise<FinPartition[]> {
  return bosFetch("/api/fin/v1/partitions", {
    params: { business_id: businessId },
  });
}

export function listFinFunds(businessId: string, partitionId: string): Promise<FinFund[]> {
  return bosFetch("/api/fin/v1/funds", {
    params: { business_id: businessId, partition_id: partitionId },
  });
}

export function createFinFund(body: {
  business_id: string;
  partition_id: string;
  fund_code: string;
  name: string;
  strategy: string;
  vintage_date?: string;
  term_years?: number;
  pref_rate: string;
  pref_is_compound?: boolean;
  catchup_rate?: string;
  carry_rate: string;
  waterfall_style: "american" | "european";
}): Promise<FinFund> {
  return bosFetch("/api/fin/v1/funds", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createFinCommitment(fundId: string, body: {
  fin_participant_id: string;
  commitment_role: "lp" | "gp" | "co_invest";
  commitment_date: string;
  committed_amount: string;
  fin_entity_id?: string;
}): Promise<FinCommitment> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/commitments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listFinCommitments(fundId: string): Promise<FinCommitment[]> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/commitments`);
}

export function createFinCapitalCall(fundId: string, body: {
  call_date: string;
  due_date?: string;
  amount_requested: string;
  purpose?: string;
}): Promise<FinCapitalCall> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/capital-calls`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listFinCapitalCalls(fundId: string): Promise<FinCapitalCall[]> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/capital-calls`);
}

export function createFinContribution(fundId: string, body: {
  fin_capital_call_id?: string;
  fin_participant_id: string;
  contribution_date: string;
  amount_contributed: string;
  status?: "pending" | "collected" | "failed" | "waived";
}): Promise<Record<string, unknown>> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/contributions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createFinDistributionEvent(fundId: string, body: {
  event_date: string;
  gross_proceeds: string;
  net_distributable?: string;
  event_type: "sale" | "partial_sale" | "refinance" | "operating_distribution" | "other";
  reference?: string;
  fin_asset_investment_id?: string;
}): Promise<FinDistributionEvent> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/distribution-events`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listFinDistributionEvents(fundId: string): Promise<FinDistributionEvent[]> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/distribution-events`);
}

export function listFinDistributionPayouts(
  fundId: string,
  distributionEventId: string
): Promise<FinDistributionPayout[]> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/distribution-events/${distributionEventId}/payouts`);
}

export function createFinParticipant(body: {
  business_id: string;
  name: string;
  participant_type: "investor" | "gp" | "lp" | "provider" | "subcontractor" | "referral_source" | "other";
  external_key?: string;
}): Promise<FinParticipant> {
  return bosFetch("/api/fin/v1/participants", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listFinParticipants(
  businessId: string,
  participantType?: string
): Promise<FinParticipant[]> {
  return bosFetch("/api/fin/v1/participants", {
    params: { business_id: businessId, participant_type: participantType },
  });
}

export function createFinAsset(fundId: string, body: {
  asset_name: string;
  acquisition_date?: string;
  cost_basis: string;
  current_valuation?: string;
}): Promise<FinAssetInvestment> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/assets`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listFinAssets(fundId: string): Promise<FinAssetInvestment[]> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/assets`);
}

export function runFinWaterfall(fundId: string, body: {
  business_id: string;
  partition_id: string;
  as_of_date: string;
  idempotency_key: string;
  distribution_event_id: string;
}): Promise<FinRunResponse> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/waterfall-runs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runFinCapitalRollforward(fundId: string, body: {
  business_id: string;
  partition_id: string;
  as_of_date: string;
  idempotency_key: string;
}): Promise<FinRunResponse> {
  return bosFetch(`/api/fin/v1/funds/${fundId}/capital-rollforward-runs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listFinCapitalRollforward(fundId: string, asOfDate?: string) {
  return bosFetch(`/api/fin/v1/funds/${fundId}/capital-rollforward`, {
    params: { as_of_date: asOfDate },
  });
}

export function listFinWaterfallAllocations(fundId: string, runId: string) {
  return bosFetch(`/api/fin/v1/funds/${fundId}/waterfall-runs/${runId}/allocations`);
}

export interface RepeFund {
  fund_id: string;
  business_id: string;
  name: string;
  vintage_year: number;
  fund_type: "closed_end" | "open_end" | "sma" | "co_invest";
  strategy: "equity" | "debt";
  sub_strategy?: string | null;
  target_size?: string | null;
  term_years?: number | null;
  status: "fundraising" | "investing" | "harvesting" | "closed";
  base_currency: string;
  inception_date?: string | null;
  quarter_cadence: "monthly" | "quarterly" | "semi_annual" | "annual";
  target_sectors_json?: string[] | null;
  target_geographies_json?: string[] | null;
  target_leverage_min?: string | null;
  target_leverage_max?: string | null;
  target_hold_period_min_years?: number | null;
  target_hold_period_max_years?: number | null;
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
}

export interface RepeFundTerm {
  fund_term_id: string;
  fund_id: string;
  effective_from: string;
  effective_to?: string | null;
  management_fee_rate?: string | null;
  management_fee_basis?: "committed" | "invested" | "nav" | null;
  preferred_return_rate?: string | null;
  carry_rate?: string | null;
  waterfall_style?: "european" | "american" | null;
  catch_up_style?: "none" | "partial" | "full" | null;
  created_at: string;
}

export interface RepeFundDetail {
  fund: RepeFund;
  terms: RepeFundTerm[];
}

export interface RepeDeal {
  deal_id: string;
  fund_id: string;
  name: string;
  deal_type: "equity" | "debt";
  stage: "sourcing" | "underwriting" | "ic" | "closing" | "operating" | "exited";
  sponsor?: string | null;
  target_close_date?: string | null;
  created_at: string;
}

export interface RepeAsset {
  asset_id: string;
  deal_id: string;
  asset_type: "property" | "cmbs";
  name: string;
  jv_id?: string | null;
  acquisition_date?: string | null;
  cost_basis?: string | null;
  asset_status?: string | null;
  created_at: string;
  // Property-specific fields (joined from repe_property_asset)
  property_type?: string | null;
  units?: number | null;
  market?: string | null;
  current_noi?: string | null;
  occupancy?: string | null;
  gross_sf?: string | null;
  year_built?: number | null;
}

export interface RepeAssetDetail {
  asset: RepeAsset;
  details: Record<string, unknown>;
}

export interface RepeEntity {
  entity_id: string;
  business_id: string;
  name: string;
  entity_type: "fund_lp" | "gp" | "holdco" | "spv" | "jv_partner" | "borrower";
  jurisdiction?: string | null;
  created_at: string;
}

export interface RepeOwnershipEdge {
  ownership_edge_id: string;
  from_entity_id: string;
  to_entity_id: string;
  percent: string;
  effective_from: string;
  effective_to?: string | null;
  created_at: string;
}

export interface RepeAssetOwnership {
  asset_id: string;
  as_of_date: string;
  links: Array<Record<string, unknown>>;
  entity_edges: Array<Record<string, unknown>>;
}

export interface RepeContext {
  env_id: string;
  business_id: string;
  created: boolean;
  source: string;
  diagnostics: Record<string, unknown>;
}

export interface ReV1Context {
  env_id: string;
  business_id: string;
  industry: string;
  is_bootstrapped: boolean;
  funds_count: number;
  scenarios_count: number;
}

export function getReV1Context(envId: string): Promise<ReV1Context> {
  return bosFetch("/api/re/v1/context", {
    params: { env_id: envId },
    headers: { "X-Env-Id": envId },
  });
}

export function bootstrapReV1Context(envId: string): Promise<ReV1Context> {
  return bosFetch("/api/re/v1/context/bootstrap", {
    method: "POST",
    params: { env_id: envId },
    headers: { "X-Env-Id": envId },
  });
}

export function getRepeContext(envId?: string, businessId?: string): Promise<RepeContext> {
  return bosFetch("/api/repe/context", {
    params: {
      env_id: envId,
      business_id: businessId,
    },
    headers: envId ? { "X-Env-Id": envId } : undefined,
  });
}

export function initRepeContext(body: { env_id?: string; business_id?: string }): Promise<RepeContext> {
  return bosFetch("/api/repe/context/init", {
    method: "POST",
    body: JSON.stringify(body),
    headers: body.env_id ? { "X-Env-Id": body.env_id } : undefined,
  });
}

export function listRepeFunds(businessId: string): Promise<RepeFund[]> {
  return bosFetch(`/api/repe/businesses/${businessId}/funds`);
}

export function createRepeFund(
  businessId: string,
  body: {
    name: string;
    vintage_year: number;
    fund_type: "closed_end" | "open_end" | "sma" | "co_invest";
    strategy: "equity" | "debt";
    sub_strategy?: string;
    target_size?: string;
    term_years?: number;
    status?: "fundraising" | "investing" | "harvesting" | "closed";
    management_fee_rate?: string;
    management_fee_basis?: "committed" | "invested" | "nav";
    preferred_return_rate?: string;
    carry_rate?: string;
    waterfall_style?: "european" | "american";
    catch_up_style?: "none" | "partial" | "full";
    terms_effective_from?: string;
    base_currency?: string;
    inception_date?: string;
    quarter_cadence?: "monthly" | "quarterly" | "semi_annual" | "annual";
    target_sectors?: string[];
    target_geographies?: string[];
    target_leverage_min?: string;
    target_leverage_max?: string;
    target_hold_period_min_years?: number;
    target_hold_period_max_years?: number;
    gp_entity_name?: string;
    lp_entities?: Array<{ name: string; jurisdiction?: string; ownership_percent?: string }>;
    initial_waterfall_template?: "european" | "american";
  }
): Promise<RepeFund> {
  return bosFetch(`/api/repe/businesses/${businessId}/funds`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listReV1Funds(params: {
  env_id?: string;
  business_id?: string;
}): Promise<RepeFund[]> {
  return directFetch("/api/re/v1/funds", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
    },
  });
}

export function createReV1Fund(body: {
  env_id?: string;
  business_id?: string;
  name: string;
  vintage_year: number;
  fund_type: "closed_end" | "open_end" | "sma" | "co_invest";
  strategy: "equity" | "debt";
  sub_strategy?: string;
  target_size?: string;
  term_years?: number;
  status?: "fundraising" | "investing" | "harvesting" | "closed";
  base_currency?: string;
  inception_date?: string;
  quarter_cadence?: "monthly" | "quarterly" | "semi_annual" | "annual";
  target_sectors?: string[];
  target_geographies?: string[];
  target_leverage_min?: string;
  target_leverage_max?: string;
  target_hold_period_min_years?: number;
  target_hold_period_max_years?: number;
  management_fee_rate?: string;
  management_fee_basis?: "committed" | "invested" | "nav";
  preferred_return_rate?: string;
  carry_rate?: string;
  waterfall_style?: "european" | "american";
  catch_up_style?: "none" | "partial" | "full";
  terms_effective_from?: string;
  gp_entity_name?: string;
  lp_entities?: Array<{ name: string; jurisdiction?: string; ownership_percent?: string }>;
  initial_waterfall_template?: "european" | "american";
  seed_defaults?: boolean;
}): Promise<RepeFund> {
  return bosFetch("/api/re/v1/funds", {
    method: "POST",
    body: JSON.stringify(body),
    headers: body.env_id ? { "X-Env-Id": body.env_id } : undefined,
  });
}

export function getReV1Fund(fundId: string): Promise<RepeFundDetail> {
  return bosFetch(`/api/re/v1/funds/${fundId}`);
}

export function getRepeFund(fundId: string): Promise<RepeFundDetail> {
  return directFetch(`/api/repe/funds/${fundId}`);
}

export function deleteRepeFund(fundId: string): Promise<{
  fund_id: string;
  deleted: {
    investments: number;
    assets: number;
    analytics_rows: number;
    [key: string]: number;
  };
}> {
  return directFetch(`/api/repe/funds/${fundId}`, {
    method: "DELETE",
  });
}

export function listRepeDeals(fundId: string): Promise<RepeDeal[]> {
  return directFetch(`/api/repe/funds/${fundId}/deals`);
}

export function createRepeDeal(
  fundId: string,
  body: {
    name: string;
    deal_type: "equity" | "debt";
    stage?: "sourcing" | "underwriting" | "ic" | "closing" | "operating" | "exited";
    sponsor?: string;
    target_close_date?: string;
  }
): Promise<RepeDeal> {
  return bosFetch(`/api/repe/funds/${fundId}/deals`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getRepeDeal(dealId: string): Promise<RepeDeal> {
  return bosFetch(`/api/repe/deals/${dealId}`);
}

export function listRepeAssets(dealId: string): Promise<RepeAsset[]> {
  return directFetch(`/api/repe/deals/${dealId}/assets`);
}

export function createRepeAsset(
  dealId: string,
  body: {
    asset_type: "property" | "cmbs";
    name: string;
    property_type?: string;
    units?: number;
    market?: string;
    current_noi?: string;
    occupancy?: string;
    tranche?: string;
    rating?: string;
    coupon?: string;
    maturity_date?: string;
    collateral_summary_json?: Record<string, unknown>;
  }
): Promise<RepeAsset> {
  return bosFetch(`/api/repe/deals/${dealId}/assets`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getRepeAsset(assetId: string): Promise<RepeAssetDetail> {
  return bosFetch(`/api/repe/assets/${assetId}`);
}

export function createRepeEntity(body: {
  business_id: string;
  name: string;
  entity_type: "fund_lp" | "gp" | "holdco" | "spv" | "jv_partner" | "borrower";
  jurisdiction?: string;
}): Promise<RepeEntity> {
  return bosFetch("/api/repe/entities", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createRepeOwnershipEdge(body: {
  from_entity_id: string;
  to_entity_id: string;
  percent: string;
  effective_from: string;
  effective_to?: string;
}): Promise<RepeOwnershipEdge> {
  return bosFetch("/api/repe/ownership-edges", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getRepeAssetOwnership(assetId: string, asOfDate?: string): Promise<RepeAssetOwnership> {
  return bosFetch(`/api/repe/assets/${assetId}/ownership`, {
    params: { as_of_date: asOfDate },
  });
}

export function seedRepeBusiness(businessId: string): Promise<{
  business_id: string;
  funds: string[];
  deals: string[];
  assets: string[];
  entities: string[];
}> {
  return bosFetch(`/api/repe/businesses/${businessId}/seed`, {
    method: "POST",
  });
}

export type UnderwritingPropertyType =
  | "multifamily"
  | "industrial"
  | "office"
  | "retail"
  | "medical_office"
  | "senior_housing"
  | "student_housing";

export interface UnderwritingRun {
  run_id: string;
  tenant_id: string;
  business_id: string;
  env_id?: string | null;
  execution_id?: string | null;
  property_name: string;
  property_type: UnderwritingPropertyType;
  status: string;
  research_version: number;
  normalized_version: number;
  model_input_version: number;
  output_version: number;
  model_version: string;
  normalization_version: string;
  contract_version: string;
  input_hash: string;
  dataset_version_id?: string | null;
  rule_version_id?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnderwritingResearchIngestPayload {
  contract_version?: string;
  sources: Array<{
    citation_key: string;
    url: string;
    title?: string | null;
    publisher?: string | null;
    date_accessed: string;
    raw_text_excerpt?: string | null;
    raw_payload?: Record<string, unknown>;
  }>;
  extracted_datapoints: Array<{
    datum_key: string;
    fact_class: "fact" | "assumption" | "inference";
    value: unknown;
    unit?: "pct_decimal" | "usd_cents" | "sf" | "units" | "bps" | "ratio" | "count";
    confidence?: number;
    citation_key?: string | null;
  }>;
  sale_comps: Array<{
    address: string;
    submarket?: string | null;
    close_date?: string | null;
    sale_price: unknown;
    cap_rate?: unknown;
    noi?: unknown;
    size_sf?: unknown;
    citation_key: string;
    confidence?: number;
  }>;
  lease_comps: Array<{
    address: string;
    submarket?: string | null;
    lease_date?: string | null;
    rent_psf: unknown;
    term_months?: number | null;
    size_sf?: unknown;
    concessions?: unknown;
    citation_key: string;
    confidence?: number;
  }>;
  market_snapshot: Array<{
    metric_key: string;
    metric_date?: string | null;
    metric_grain?: string;
    metric_value: unknown;
    unit: "pct_decimal" | "usd_cents" | "sf" | "units" | "bps" | "ratio" | "count";
    citation_key: string;
    confidence?: number;
  }>;
  unknowns?: string[];
  assumption_suggestions?: Array<{
    assumption_key: string;
    value: unknown;
    rationale?: string | null;
  }>;
}

export interface UnderwritingScenarioLevers {
  rent_growth_bps?: number;
  vacancy_bps?: number;
  exit_cap_bps?: number;
  expense_growth_bps?: number;
  opex_ratio_delta?: number;
  ti_lc_per_sf?: number;
  capex_reserve_per_sf?: number;
  debt_rate_bps?: number;
  ltv_delta?: number;
  amort_years?: number;
  io_months?: number;
}

export interface UnderwritingScenarioResult {
  scenario_id: string;
  name: string;
  scenario_type: "base" | "upside" | "downside" | "custom";
  recommendation: "buy" | "pass" | "reprice";
  valuation: Record<string, unknown>;
  returns: Record<string, unknown>;
  debt: Record<string, unknown>;
  sensitivities: Record<string, unknown>;
}

export interface UnderwritingReports {
  run_id: string;
  scenarios: Array<{
    scenario_id?: string | null;
    name: string;
    scenario_type?: "base" | "upside" | "downside" | "custom" | null;
    recommendation?: "buy" | "pass" | "reprice" | null;
    artifacts: Record<
      string,
      {
        artifact_type: "ic_memo_md" | "appraisal_md" | "outputs_json" | "outputs_md" | "sources_ledger_md";
        content_md?: string | null;
        content_json?: Record<string, unknown> | null;
      }
    >;
  }>;
}

export function getUnderwritingResearchContract() {
  return bosFetch<{
    contract_version: string;
    schema: Record<string, unknown>;
  }>("/api/underwriting/contracts/research");
}

export function createUnderwritingRun(body: {
  business_id: string;
  env_id?: string;
  property_name: string;
  property_type: UnderwritingPropertyType;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  submarket?: string;
  gross_area_sf?: number;
  unit_count?: number;
  occupancy_pct?: number;
  in_place_noi_cents?: number;
  purchase_price_cents?: number;
  property_inputs_json?: Record<string, unknown>;
  contract_version?: string;
}): Promise<UnderwritingRun> {
  return bosFetch("/api/underwriting/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listUnderwritingRuns(
  businessId: string,
  options?: { status?: string; limit?: number }
): Promise<UnderwritingRun[]> {
  return bosFetch("/api/underwriting/runs", {
    params: {
      business_id: businessId,
      status: options?.status,
      limit: options?.limit ? String(options.limit) : undefined,
    },
  });
}

export function getUnderwritingRun(runId: string): Promise<UnderwritingRun> {
  return bosFetch(`/api/underwriting/runs/${runId}`);
}

export function ingestUnderwritingResearch(
  runId: string,
  body: UnderwritingResearchIngestPayload
): Promise<{
  run_id: string;
  research_version: number;
  normalized_version: number;
  source_count: number;
  datum_count: number;
  sale_comp_count: number;
  lease_comp_count: number;
  market_metric_count: number;
  assumption_count: number;
  warnings: string[];
}> {
  return bosFetch(`/api/underwriting/runs/${runId}/ingest-research`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runUnderwritingScenarios(
  runId: string,
  body: {
    include_defaults?: boolean;
    custom_scenarios?: Array<{ name: string; levers?: UnderwritingScenarioLevers }>;
  }
): Promise<{
  run_id: string;
  status: string;
  model_input_version: number;
  output_version: number;
  scenarios: UnderwritingScenarioResult[];
}> {
  return bosFetch(`/api/underwriting/runs/${runId}/scenarios/run`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getUnderwritingReports(runId: string): Promise<UnderwritingReports> {
  return bosFetch(`/api/underwriting/runs/${runId}/reports`);
}

export interface MetricDefinition {
  metric_id: string;
  key: string;
  label: string;
  description?: string | null;
  unit?: string | null;
  aggregation: string;
}

export interface MetricDimension {
  key: string;
  label: string;
  source: string;
}

export interface MetricQueryPoint {
  metric_id: string;
  metric_key: string;
  metric_label: string;
  unit?: string | null;
  aggregation: string;
  dimension?: string | null;
  dimension_value?: string | null;
  value: string;
  source_fact_ids: string[];
}

export interface MetricDefinitionsResponse {
  metrics: MetricDefinition[];
  dimensions: MetricDimension[];
}

export interface MetricQueryResponse {
  query_hash: string;
  points: MetricQueryPoint[];
}

export interface Report {
  report_id: string;
  key: string;
  label: string;
  description?: string | null;
  version: number;
  config: Record<string, unknown>;
  created_at: string;
}

export interface ReportRunResponse {
  report_run_id: string;
  run_id?: string | null;
  query_hash: string;
  points: MetricQueryPoint[];
}

export function getMetricDefinitions(businessId: string): Promise<MetricDefinitionsResponse> {
  return bosFetch("/api/metrics/definitions", {
    params: { business_id: businessId },
  });
}

export function queryMetrics(body: {
  business_id: string;
  metric_keys: string[];
  dimension?: string;
  date_from?: string;
  date_to?: string;
  refresh?: boolean;
}): Promise<MetricQueryResponse> {
  return bosFetch("/api/metrics/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createReport(body: {
  business_id: string;
  title: string;
  description?: string;
  query: Record<string, unknown>;
  is_draft?: boolean;
}): Promise<Report> {
  return bosFetch("/api/reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listReports(businessId: string): Promise<Report[]> {
  return bosFetch("/api/reports", {
    params: { business_id: businessId },
  });
}

export function getReport(businessId: string, reportId: string): Promise<Report> {
  return bosFetch(`/api/reports/${reportId}`, {
    params: { business_id: businessId },
  });
}

export function runReport(reportId: string, body: {
  business_id: string;
  refresh?: boolean;
}): Promise<ReportRunResponse> {
  return bosFetch(`/api/reports/${reportId}/run`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function explainReportRun(
  businessId: string,
  reportId: string,
  reportRunId: string
): Promise<{ report_id: string; report_run_id: string; explanation: Array<Record<string, unknown>> }> {
  return bosFetch(`/api/reports/${reportId}/runs/${reportRunId}/explain`, {
    params: { business_id: businessId },
  });
}

export function getBusinessOverviewReport(businessId: string) {
  return bosFetch<{
    business: Record<string, unknown>;
    links: Record<string, string>;
  }>("/api/reports/business-overview", {
    params: { business_id: businessId },
  });
}

export function getDepartmentHealthReport(businessId: string, deptKey?: string) {
  return bosFetch<{
    rows: Array<Record<string, unknown>>;
  }>("/api/reports/department-health", {
    params: { business_id: businessId, deptKey },
  });
}

export function getDocRegisterReport(businessId: string) {
  return bosFetch<{
    rows: Array<Record<string, unknown>>;
  }>("/api/reports/doc-register", {
    params: { business_id: businessId },
  });
}

export function getDocComplianceReport(businessId: string) {
  return bosFetch<{
    rows: Array<Record<string, unknown>>;
  }>("/api/reports/doc-compliance", {
    params: { business_id: businessId },
  });
}

export function getExecutionLedgerReport(businessId: string) {
  return bosFetch<{
    rows: Array<Record<string, unknown>>;
  }>("/api/reports/execution-ledger", {
    params: { business_id: businessId },
  });
}

export function getTemplateAdoptionReport(businessId: string) {
  return bosFetch<{
    template_key: string | null;
    drift: {
      has_drift: boolean;
      missing_departments: string[];
      extra_departments: string[];
      missing_capabilities: string[];
      extra_capabilities: string[];
    };
    deep_link: string;
  }>("/api/reports/template-adoption", {
    params: { business_id: businessId },
  });
}

export function simulateTemplateDrift(businessId: string) {
  return bosFetch<{ ok: boolean; disabled_capability_key: string }>("/api/reports/template-adoption/simulate-drift", {
    method: "POST",
    params: { business_id: businessId },
  });
}

export function getReadinessReport(businessId: string) {
  return bosFetch<{
    score: Record<string, unknown>;
    rows: Array<Record<string, unknown>>;
  }>("/api/reports/readiness", {
    params: { business_id: businessId },
  });
}

export interface CrmAccount {
  crm_account_id: string;
  name: string;
  account_type: string;
  industry?: string | null;
  website?: string | null;
  created_at: string;
}

export interface CrmOpportunity {
  crm_opportunity_id: string;
  name: string;
  amount: string;
  currency_code: string;
  status: string;
  expected_close_date?: string | null;
  actual_close_date?: string | null;
  account_name?: string | null;
  stage_key?: string | null;
  stage_label?: string | null;
  created_at: string;
}

export interface CrmPipelineStage {
  crm_pipeline_stage_id: string;
  key: string;
  label: string;
  stage_order: number;
  win_probability?: string | null;
  is_closed: boolean;
  is_won: boolean;
  created_at: string;
}

export function listCrmAccounts(businessId: string): Promise<CrmAccount[]> {
  return bosFetch("/api/crm/accounts", {
    params: { business_id: businessId },
  });
}

export function createCrmAccount(body: {
  business_id: string;
  name: string;
  account_type?: string;
  industry?: string;
  website?: string;
}): Promise<CrmAccount> {
  return bosFetch("/api/crm/accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listCrmPipelineStages(businessId: string): Promise<CrmPipelineStage[]> {
  return bosFetch("/api/crm/pipeline-stages", {
    params: { business_id: businessId },
  });
}

export function listCrmOpportunities(businessId: string): Promise<CrmOpportunity[]> {
  return bosFetch("/api/crm/opportunities", {
    params: { business_id: businessId },
  });
}

export function createCrmOpportunity(body: {
  business_id: string;
  name: string;
  amount: string;
  crm_account_id?: string;
  crm_pipeline_stage_id?: string;
  expected_close_date?: string;
}): Promise<CrmOpportunity> {
  return bosFetch("/api/crm/opportunities", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// RE Fund Engine API
export interface ReAssetFinancialState {
  id: string;
  fin_asset_investment_id: string;
  fin_fund_id?: string | null;
  quarter: string;
  valuation_snapshot_id: string;
  net_operating_income?: string | number | null;
  implied_gross_value?: string | number | null;
  implied_equity_value?: string | number | null;
  nav_equity?: string | number | null;
  dscr?: string | number | null;
  ltv?: string | number | null;
  debt_yield?: string | number | null;
  loan_balance?: string | number | null;
  debt_service?: string | number | null;
  created_at?: string;
}

export interface ReFundSummary {
  id: string;
  fin_fund_id: string;
  quarter: string;
  portfolio_nav: string | number;
  gross_irr?: string | number | null;
  net_irr?: string | number | null;
  dpi?: string | number | null;
  rvpi?: string | number | null;
  tvpi?: string | number | null;
  weighted_ltv?: string | number | null;
  weighted_dscr?: string | number | null;
  concentration_json?: Record<string, unknown> | null;
  maturity_wall_json?: Record<string, unknown> | null;
  carry_summary_json?: Record<string, unknown> | null;
  waterfall_snapshot_id?: string | null;
  created_at?: string;
}

export interface ReInvestorStatement {
  investor_id: string;
  fund_id: string;
  quarter: string;
  committed: string | number;
  contributions: string | number;
  distributions: string | number;
  nav_share: string | number;
  dpi: string | number;
  rvpi: string | number;
  tvpi: string | number;
}

export interface ReValuationRunResponse {
  valuation_snapshot: Record<string, unknown>;
  asset_financial_state: ReAssetFinancialState;
  input_hash: string;
}

export function runReValuationQuarter(body: {
  fin_asset_investment_id: string;
  quarter: string;
  assumption_set_id: string;
  fin_fund_id?: string;
  forward_noi_override?: number;
  accrued_pref?: number;
  deduct_pref_from_nav?: boolean;
  cumulative_contributions?: number;
  cumulative_distributions?: number;
  cashflows_for_irr?: number[][];
}): Promise<ReValuationRunResponse> {
  return bosFetch("/api/re/valuation/run-quarter", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runReWaterfallShadow(body: {
  fin_fund_id: string;
  quarter: string;
  waterfall_style?: "american" | "european";
  fin_rule_version_id?: string;
  sale_costs_pct?: number;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/re/waterfall/run-shadow", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function computeReFundSummary(body: {
  fin_fund_id: string;
  quarter: string;
}): Promise<ReFundSummary> {
  return bosFetch("/api/re/fund/compute-summary", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runReRefinanceSimulation(body: {
  fin_asset_investment_id: string;
  quarter: string;
  new_rate: number;
  new_term_years?: number;
  new_amort_years?: number;
  max_ltv_constraint?: number;
  min_dscr_constraint?: number;
  prepayment_penalty_pct?: number;
  origination_fee_pct?: number;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/re/refinance/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runReStress(body: {
  fin_asset_investment_id: string;
  quarter: string;
  scenarios?: Array<Record<string, unknown>>;
}): Promise<Array<Record<string, unknown>>> {
  return bosFetch("/api/re/stress/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function computeReSurveillance(body: {
  fin_asset_investment_id: string;
  quarter: string;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/re/surveillance/compute", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runReMonteCarlo(body: {
  fin_asset_investment_id: string;
  quarter: string;
  n_sims?: number;
  seed?: number;
  distribution_params?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/re/montecarlo/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getReAssetQuarterState(assetId: string, quarter: string): Promise<ReAssetFinancialState> {
  return bosFetch(`/api/re/asset/${assetId}/quarter/${quarter}`);
}

export function getReFundSummary(fundId: string, quarter: string): Promise<ReFundSummary> {
  return bosFetch(`/api/re/fund/${fundId}/summary/${quarter}`);
}

export function getReInvestorStatement(investorId: string, fundId: string, quarter: string): Promise<ReInvestorStatement> {
  return bosFetch(`/api/re/investor/${investorId}/statement/${fundId}/${quarter}`);
}

// ── RE V2 Institutional API ──────────────────────────────────────────────────

// Investments
export function listReV2Investments(fundId: string): Promise<ReV2Investment[]> {
  return directFetch(`/api/re/v2/funds/${fundId}/investments`);
}

export function getReV2EnvironmentPortfolioKpis(
  envId: string,
  quarter: string,
  scenarioId?: string
): Promise<ReV2EnvironmentPortfolioKpis> {
  return directFetch(`/api/re/v2/environments/${envId}/portfolio-kpis`, {
    params: { quarter, scenario_id: scenarioId },
  });
}

export function getReV2Investment(investmentId: string): Promise<ReV2Investment> {
  return directFetch(`/api/re/v2/investments/${investmentId}`);
}

export function createReV2Investment(fundId: string, body: {
  name: string;
  deal_type?: string;
  stage?: string;
  sponsor?: string;
  target_close_date?: string;
  committed_capital?: number;
  invested_capital?: number;
}): Promise<ReV2Investment> {
  return bosFetch(`/api/re/v2/funds/${fundId}/investments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2InvestmentsFiltered(params: {
  env_id?: string;
  fund_id?: string;
  stage?: string;
  type?: string;
  sponsor?: string;
  q?: string;
  quarter?: string;
  limit?: number;
  offset?: number;
}): Promise<ReV2FundInvestmentRollupRow[]> {
  const p: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) p[k] = String(v);
  }
  return directFetch("/api/re/v2/investments", { params: p });
}

// JVs
export function listReV2Jvs(investmentId: string): Promise<ReV2Jv[]> {
  return directFetch(`/api/re/v2/investments/${investmentId}/jvs`);
}

export function getReV2Jv(jvId: string): Promise<ReV2Jv> {
  return directFetch(`/api/re/v2/jvs/${jvId}`);
}

export function createReV2Jv(investmentId: string, body: {
  legal_name: string;
  ownership_percent?: number;
  gp_percent?: number;
  lp_percent?: number;
}): Promise<ReV2Jv> {
  return bosFetch(`/api/re/v2/investments/${investmentId}/jvs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2JvAssets(
  jvId: string,
  quarter?: string,
  scenarioId?: string
): Promise<ReV2InvestmentAsset[]> {
  return directFetch(`/api/re/v2/jvs/${jvId}/assets`, {
    params: { quarter, scenario_id: scenarioId },
  });
}

// Partners
export function listReV2Partners(businessId: string): Promise<ReV2Partner[]> {
  return bosFetch(`/api/re/v2/partners`, { params: { business_id: businessId } });
}

export function listReV2FundPartners(fundId: string): Promise<ReV2Partner[]> {
  return bosFetch(`/api/re/v2/funds/${fundId}/partners`);
}

export function createReV2Partner(businessId: string, body: {
  name: string;
  partner_type: string;
  entity_id?: string;
}): Promise<ReV2Partner> {
  return bosFetch(`/api/re/v2/partners`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    params: { business_id: businessId },
  });
}

export function createReV2Commitment(fundId: string, partnerId: string, body: {
  committed_amount: number;
  commitment_date: string;
}): Promise<ReV2Commitment> {
  return bosFetch(`/api/re/v2/funds/${fundId}/partners/${partnerId}/commitments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2Commitments(fundId: string): Promise<ReV2Commitment[]> {
  return bosFetch(`/api/re/v2/funds/${fundId}/commitments`);
}

// Capital Ledger
export function recordReV2CapitalEntry(fundId: string, body: {
  partner_id: string;
  entry_type: string;
  amount: number;
  effective_date: string;
  quarter: string;
  memo?: string;
}): Promise<ReV2CapitalLedgerEntry> {
  return bosFetch(`/api/re/v2/funds/${fundId}/capital-ledger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2CapitalLedger(fundId: string, quarter?: string): Promise<ReV2CapitalLedgerEntry[]> {
  return bosFetch(`/api/re/v2/funds/${fundId}/capital-ledger`, { params: { quarter } });
}

// Quarter State
export function getReV2FundQuarterState(
  fundId: string,
  quarter: string,
  scenarioId?: string,
  versionId?: string
): Promise<ReV2FundQuarterState> {
  const params: Record<string, string | undefined> = {
    scenario_id: scenarioId,
    version_id: versionId,
  };
  return directFetch(`/api/re/v2/funds/${fundId}/quarter-state/${quarter}`, { params });
}

export function getReV2InvestmentQuarterState(
  investmentId: string,
  quarter: string,
  scenarioId?: string,
  versionId?: string
): Promise<ReV2InvestmentQuarterState> {
  return directFetch(`/api/re/v2/investments/${investmentId}/quarter-state/${quarter}`, {
    params: { scenario_id: scenarioId, version_id: versionId },
  });
}

export function getReV2JvQuarterState(jvId: string, quarter: string): Promise<ReV2JvQuarterState> {
  return directFetch(`/api/re/v2/jvs/${jvId}/quarter-state/${quarter}`);
}

export function getReV2AssetQuarterState(
  assetId: string,
  quarter: string,
  scenarioId?: string
): Promise<ReV2AssetQuarterState> {
  return directFetch(`/api/re/v2/assets/${assetId}/quarter-state/${quarter}`, {
    params: { scenario_id: scenarioId },
  });
}

export function getReV2FundInvestmentRollup(
  fundId: string,
  quarter: string,
  scenarioId?: string
): Promise<ReV2FundInvestmentRollupRow[]> {
  return directFetch(`/api/re/v2/funds/${fundId}/investment-rollup/${quarter}`, {
    params: { scenario_id: scenarioId },
  });
}

export function getReV2InvestmentAssets(
  investmentId: string,
  quarter: string,
  scenarioId?: string,
  versionId?: string
): Promise<ReV2InvestmentAsset[]> {
  return directFetch(`/api/re/v2/investments/${investmentId}/assets/${quarter}`, {
    params: { scenario_id: scenarioId, version_id: versionId },
  });
}

export function getReV2InvestmentHistory(
  investmentId: string,
  params?: {
    scenario_id?: string;
    version_id?: string;
    quarter_from?: string;
    quarter_to?: string;
  }
): Promise<ReV2InvestmentHistory> {
  return directFetch(`/api/re/v2/investments/${investmentId}/history`, {
    params,
  });
}

// Metrics
export function getReV2FundMetrics(fundId: string, quarter: string): Promise<ReV2FundMetrics> {
  return directFetch(`/api/re/v2/funds/${fundId}/metrics/${quarter}`);
}

export function getReV2PartnerMetrics(fundId: string, quarter: string): Promise<ReV2PartnerMetrics[]> {
  return bosFetch(`/api/re/v2/funds/${fundId}/partner-metrics/${quarter}`);
}

// Quarter Close
export function runReV2QuarterClose(fundId: string, body: {
  quarter: string;
  scenario_id?: string;
  accounting_basis?: string;
  valuation_method?: string;
  run_waterfall?: boolean;
}): Promise<ReV2QuarterCloseResult> {
  return bosFetch(`/api/re/v2/funds/${fundId}/quarter-close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Waterfall
export function runReV2Waterfall(fundId: string, body: {
  quarter: string;
  scenario_id?: string;
  run_type?: string;
}): Promise<ReV2WaterfallRun> {
  return bosFetch(`/api/re/v2/funds/${fundId}/waterfall/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2WaterfallRuns(fundId: string, quarter?: string): Promise<ReV2WaterfallRun[]> {
  return bosFetch(`/api/re/v2/funds/${fundId}/waterfall/runs`, { params: { quarter } });
}

// Scenarios
export function listReV2Scenarios(fundId: string): Promise<ReV2Scenario[]> {
  return directFetch(`/api/re/v2/funds/${fundId}/scenarios`);
}

export function createReV2Scenario(fundId: string, body: {
  name: string;
  description?: string;
  scenario_type?: string;
  parent_scenario_id?: string;
}): Promise<ReV2Scenario> {
  return bosFetch(`/api/re/v2/funds/${fundId}/scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Models
export function listReV2Models(fundId: string): Promise<ReV2Model[]> {
  return directFetch(`/api/re/v2/funds/${fundId}/models`);
}

export function createReV2Model(fundId: string, body: {
  name: string;
  description?: string;
}): Promise<ReV2Model> {
  return bosFetch(`/api/re/v2/funds/${fundId}/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function approveReV2Model(modelId: string): Promise<ReV2Model> {
  return bosFetch(`/api/re/v2/models/${modelId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
}

// Cross-Fund Models
export function listAllModels(envId?: string): Promise<ReV2Model[]> {
  return bosFetch(`/api/re/v2/models`, { params: { env_id: envId } });
}

export function createCrossFundModel(body: {
  name: string;
  description?: string;
  strategy_type?: string;
  model_type?: string;
  env_id?: string;
  primary_fund_id?: string;
}): Promise<ReV2Model> {
  return bosFetch(`/api/re/v2/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getModel(modelId: string): Promise<ReV2Model> {
  return directFetch(`/api/re/v2/models/${modelId}`);
}

// Model Scenarios
export function listModelScenarios(modelId: string): Promise<ModelScenario[]> {
  return bosFetch(`/api/re/v2/models/${modelId}/scenarios`);
}

export function createModelScenario(modelId: string, body: {
  name: string;
  description?: string;
  is_base?: boolean;
}): Promise<ModelScenario> {
  return bosFetch(`/api/re/v2/models/${modelId}/scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getModelScenario(scenarioId: string): Promise<ModelScenario> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}`);
}

export function cloneModelScenario(scenarioId: string, newName: string): Promise<ModelScenario> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_name: newName }),
  });
}

export function deleteModelScenario(scenarioId: string): Promise<void> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}`, { method: "DELETE" });
}

// Scenario Asset Scope
export function listScenarioAssets(scenarioId: string): Promise<ScenarioAsset[]> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/assets`);
}

export function addScenarioAsset(scenarioId: string, body: {
  asset_id: string;
  source_fund_id?: string;
  source_investment_id?: string;
}): Promise<ScenarioAsset> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function removeScenarioAsset(scenarioId: string, assetId: string): Promise<void> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/assets/${assetId}`, { method: "DELETE" });
}

export function listAvailableAssets(scenarioId: string, envId?: string): Promise<AvailableAsset[]> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/available-assets`, { params: { env_id: envId } });
}

// Scenario Overrides
export function listScenarioOverrides(scenarioId: string): Promise<ScenarioOverride[]> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/overrides`);
}

export function setScenarioOverride(scenarioId: string, body: {
  scope_type: string;
  scope_id: string;
  key: string;
  value_json: unknown;
}): Promise<ScenarioOverride> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/overrides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteScenarioOverride(overrideId: string): Promise<void> {
  return bosFetch(`/api/re/v2/scenario-overrides/${overrideId}`, { method: "DELETE" });
}

export function resetScenarioOverrides(scenarioId: string): Promise<void> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/reset-overrides`, { method: "POST" });
}

// Scenario Run
export function runScenario(scenarioId: string): Promise<ScenarioRunResult> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/run`, { method: "POST" });
}

export function getModelRun(runId: string): Promise<ModelRunDetail> {
  return bosFetch(`/api/re/v2/model-runs/${runId}`);
}

export function compareScenarios(modelId: string, scenarioIds: string[]): Promise<ScenarioCompareResult> {
  return bosFetch(`/api/re/v2/models/${modelId}/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_ids: scenarioIds }),
  });
}

// V2 Scenario Engine
export interface AssetCashflow {
  id: string;
  run_id: string;
  asset_id: string;
  period_date: string;
  revenue: number;
  expenses: number;
  noi: number;
  capex: number;
  debt_service: number;
  net_cash_flow: number;
  sale_proceeds: number;
  equity_cash_flow: number;
}

export interface ReturnMetricsRow {
  id: string;
  run_id: string;
  scope_type: string;
  scope_id: string;
  gross_irr: number | null;
  net_irr: number | null;
  gross_moic: number | null;
  net_moic: number | null;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  ending_nav: number | null;
}

export interface AssetPreview {
  asset_id: string;
  asset_name: string;
  cashflows: Array<{
    period_date: string;
    revenue: number;
    expenses: number;
    noi: number;
    capex: number;
    debt_service: number;
    net_cash_flow: number;
    sale_proceeds: number;
    equity_cash_flow: number;
  }>;
  exit: {
    sale_date: string | null;
    gross_sale_price: number;
    net_sale_proceeds: number;
    equity_proceeds: number;
  } | null;
  metrics: {
    gross_irr: number | null;
    net_irr: number | null;
    gross_moic: number | null;
    net_moic: number | null;
    dpi: number | null;
    rvpi: number | null;
    tvpi: number | null;
    ending_nav: number | null;
  } | null;
  summary: {
    total_noi: number;
    total_equity_cf: number;
    periods: number;
  } | null;
}

export function runScenarioV2(scenarioId: string): Promise<ScenarioRunResult> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/run-v2`, { method: "POST" });
}

export function getRunAssetCashflows(runId: string): Promise<AssetCashflow[]> {
  return bosFetch(`/api/re/v2/model-runs/${runId}/asset-cashflows`);
}

export function getRunReturnMetrics(runId: string): Promise<ReturnMetricsRow[]> {
  return bosFetch(`/api/re/v2/model-runs/${runId}/return-metrics`);
}

export function previewAsset(scenarioId: string, assetId: string): Promise<AssetPreview> {
  return bosFetch(`/api/re/v2/model-scenarios/${scenarioId}/preview-asset/${assetId}`, {
    method: "POST",
  });
}

export function compareScenariosV2(modelId: string, scenarioIds: string[]): Promise<ScenarioCompareResult> {
  return bosFetch(`/api/re/v2/models/${modelId}/compare-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_ids: scenarioIds }),
  });
}

// Scenario Versions
export function listReV2ScenarioVersions(scenarioId: string): Promise<ReV2ScenarioVersion[]> {
  return directFetch(`/api/re/v2/scenarios/${scenarioId}/versions`);
}

export function createReV2ScenarioVersion(scenarioId: string, body: {
  model_id: string;
  label?: string;
  assumption_set_id?: string;
}): Promise<ReV2ScenarioVersion> {
  return bosFetch(`/api/re/v2/scenarios/${scenarioId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function lockReV2ScenarioVersion(versionId: string): Promise<ReV2ScenarioVersion> {
  return bosFetch(`/api/re/v2/scenario-versions/${versionId}/lock`, {
    method: "POST",
  });
}

export function setReV2Override(scenarioId: string, body: {
  scope_node_type: string;
  scope_node_id: string;
  key: string;
  value_type?: string;
  value_decimal?: number;
  reason?: string;
}): Promise<ReV2Override> {
  return bosFetch(`/api/re/v2/scenarios/${scenarioId}/overrides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2Overrides(scenarioId: string): Promise<ReV2Override[]> {
  return bosFetch(`/api/re/v2/scenarios/${scenarioId}/overrides`);
}

// Provenance
export function listReV2Runs(fundId: string, quarter?: string): Promise<ReV2RunProvenance[]> {
  return directFetch(`/api/re/v2/funds/${fundId}/runs`, { params: { quarter } });
}

export function getReV2FundLineage(
  fundId: string,
  quarter: string,
  scenarioId?: string
): Promise<ReV2EntityLineageResponse> {
  return directFetch(`/api/re/v2/funds/${fundId}/lineage/${quarter}`, {
    params: { scenario_id: scenarioId },
  });
}

export function getReV2InvestmentLineage(
  investmentId: string,
  quarter: string,
  scenarioId?: string,
  versionId?: string
): Promise<ReV2EntityLineageResponse> {
  return directFetch(`/api/re/v2/investments/${investmentId}/lineage/${quarter}`, {
    params: { scenario_id: scenarioId, version_id: versionId },
  });
}

export function getReV2JvLineage(
  jvId: string,
  quarter: string,
  scenarioId?: string
): Promise<ReV2EntityLineageResponse> {
  return directFetch(`/api/re/v2/jvs/${jvId}/lineage/${quarter}`, {
    params: { scenario_id: scenarioId },
  });
}

export function getReV2AssetLineage(
  assetId: string,
  quarter: string,
  scenarioId?: string
): Promise<ReV2EntityLineageResponse> {
  return directFetch(`/api/re/v2/assets/${assetId}/lineage/${quarter}`, {
    params: { scenario_id: scenarioId },
  });
}

// Sustainability
export function getReV2SustainabilityOverview(params: {
  env_id: string;
  business_id: string;
  quarter: string;
  scenario_id?: string;
}): Promise<SusOverviewResponse> {
  return bosFetch("/api/re/v2/sustainability/overview", { params });
}

export function getReV2FundPortfolioFootprint(
  fundId: string,
  params: { year: string; scenario_id?: string }
): Promise<SusPortfolioFootprintResponse> {
  return bosFetch(`/api/re/v2/sustainability/funds/${fundId}/portfolio-footprint`, { params });
}

export function getReV2InvestmentFootprint(
  investmentId: string,
  params: { year: string; scenario_id?: string }
): Promise<SusPortfolioFootprintResponse> {
  return bosFetch(`/api/re/v2/sustainability/investments/${investmentId}/footprint`, { params });
}

export function getReV2AssetSustainabilityDashboard(
  assetId: string,
  params: { year?: string; scenario_id?: string } = {}
): Promise<SusAssetDashboardResponse> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/dashboard`, { params });
}

export function getReV2AssetSustainabilityProfile(assetId: string): Promise<SusAssetProfile> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/profile`);
}

export function updateReV2AssetSustainabilityProfile(
  assetId: string,
  body: SusAssetProfileInput
): Promise<SusAssetProfile> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2AssetUtilityAccounts(assetId: string): Promise<SusUtilityAccount[]> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/utility-accounts`);
}

export function createReV2AssetUtilityAccount(
  assetId: string,
  body: SusUtilityAccountInput
): Promise<SusUtilityAccount> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/utility-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2AssetUtilityMonthly(assetId: string): Promise<SusUtilityMonthlyRow[]> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/utility-monthly`);
}

export function createReV2AssetUtilityMonthly(
  assetId: string,
  body: SusUtilityMonthlyInput
): Promise<SusUtilityMonthlyRow> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/utility-monthly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function importReV2UtilityMonthly(
  body: SusUtilityImportRequest
): Promise<SusUtilityImportResult> {
  return bosFetch("/api/re/v2/sustainability/utility-monthly/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2AssetCertifications(assetId: string): Promise<SusCertification[]> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/certifications`);
}

export function createReV2AssetCertification(
  assetId: string,
  body: SusCertificationInput
): Promise<SusCertification> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/certifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2AssetRegulatoryExposure(assetId: string): Promise<SusRegulatoryExposure[]> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/regulatory-exposure`);
}

export function createReV2AssetRegulatoryExposure(
  assetId: string,
  body: SusRegulatoryExposureInput
): Promise<SusRegulatoryExposure> {
  return bosFetch(`/api/re/v2/sustainability/assets/${assetId}/regulatory-exposure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listReV2SustainabilityEmissionFactorSets(): Promise<SusEmissionFactorSet[]> {
  return bosFetch("/api/re/v2/sustainability/emission-factor-sets");
}

export function createReV2SustainabilityEmissionFactorSet(
  body: SusEmissionFactorSetInput
): Promise<SusEmissionFactorSet> {
  return bosFetch("/api/re/v2/sustainability/emission-factor-sets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function runReV2SustainabilityScenario(
  body: SusScenarioRunRequest
): Promise<SusScenarioRunResponse> {
  return bosFetch("/api/re/v2/sustainability/scenarios/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getReV2SustainabilityProjection(
  projectionRunId: string
): Promise<SusProjectionResponse> {
  return bosFetch(`/api/re/v2/sustainability/scenarios/${projectionRunId}`);
}

export function getReV2SustainabilityReport(
  fundId: string,
  reportKey: string,
  params: { scenario_id?: string } = {}
): Promise<SusReportPayload> {
  return bosFetch(`/api/re/v2/sustainability/funds/${fundId}/reports/${reportKey}`, { params });
}

// ── RE V2 Types ──────────────────────────────────────────────────────────────

export type ReV2Investment = {
  investment_id: string;
  fund_id: string;
  name: string;
  investment_type: string;
  stage: string;
  sponsor?: string;
  target_close_date?: string;
  as_of_quarter?: string;
  hold_period_years?: number;
  committed_capital?: number;
  invested_capital?: number;
  realized_distributions?: number;
  nav?: number;
  unrealized_value?: number;
  gross_irr?: number;
  net_irr?: number;
  equity_multiple?: number;
  total_noi?: number;
  gross_asset_value?: number;
  debt_balance?: number;
  ltv?: number;
  cap_rate?: number;
  dscr?: number;
  created_at: string;
};

export type ReV2Jv = {
  jv_id: string;
  investment_id: string;
  legal_name: string;
  ownership_percent: number;
  gp_percent?: number;
  lp_percent?: number;
  promote_structure_id?: string;
  status: string;
  created_at: string;
};

export type ReV2Partner = {
  partner_id: string;
  business_id: string;
  entity_id?: string;
  name: string;
  partner_type: string;
  created_at: string;
  committed_amount?: number;
  commitment_date?: string;
  commitment_status?: string;
};

export type ReV2Commitment = {
  commitment_id: string;
  partner_id: string;
  fund_id: string;
  committed_amount: number;
  commitment_date: string;
  status: string;
  created_at: string;
  partner_name?: string;
  partner_type?: string;
};

export type ReV2CapitalLedgerEntry = {
  entry_id: string;
  fund_id: string;
  partner_id: string;
  entry_type: string;
  amount: number;
  amount_base: number;
  effective_date: string;
  quarter: string;
  memo?: string;
  source: string;
  created_at: string;
};

export type ReV2FundQuarterState = {
  id: string;
  fund_id: string;
  quarter: string;
  scenario_id?: string;
  version_id?: string;
  run_id: string;
  portfolio_nav?: number;
  total_committed?: number;
  total_called?: number;
  total_distributed?: number;
  dpi?: number;
  rvpi?: number;
  tvpi?: number;
  gross_irr?: number;
  net_irr?: number;
  weighted_ltv?: number;
  weighted_dscr?: number;
  inputs_hash: string;
  created_at: string;
};

export type ReV2EnvironmentPortfolioKpis = {
  env_id: string;
  business_id: string;
  quarter: string;
  scenario_id?: string | null;
  fund_count: number;
  total_commitments: string;
  portfolio_nav?: string | null;
  active_assets: number;
  warnings: string[];
};

export type ReV2InvestmentQuarterState = {
  id: string;
  investment_id: string;
  quarter: string;
  scenario_id?: string;
  version_id?: string;
  run_id?: string;
  nav?: number;
  committed_capital?: number;
  invested_capital?: number;
  realized_distributions?: number;
  unrealized_value?: number;
  noi?: number;
  revenue?: number;
  opex?: number;
  occupancy?: number;
  debt_service?: number;
  gross_asset_value?: number;
  debt_balance?: number;
  cash_balance?: number;
  effective_ownership_percent?: number;
  fund_nav_contribution?: number;
  gross_irr?: number;
  net_irr?: number;
  equity_multiple?: number;
  inputs_hash: string;
  created_at: string;
};

export type ReV2JvQuarterState = {
  id: string;
  jv_id: string;
  quarter: string;
  nav?: number;
  noi?: number;
  debt_balance?: number;
  inputs_hash: string;
  created_at: string;
};

export type ReV2AssetQuarterState = {
  id: string;
  asset_id: string;
  quarter: string;
  scenario_id?: string;
  run_id: string;
  accounting_basis: string;
  noi?: number;
  revenue?: number;
  other_income?: number;
  opex?: number;
  capex?: number;
  debt_service?: number;
  leasing_costs?: number;
  tenant_improvements?: number;
  free_rent?: number;
  net_cash_flow?: number;
  occupancy?: number;
  debt_balance?: number;
  cash_balance?: number;
  asset_value?: number;
  implied_equity_value?: number;
  nav?: number;
  ltv?: number;
  dscr?: number;
  debt_yield?: number;
  valuation_method?: string;
  value_source?: string;
  inputs_hash: string;
  created_at: string;
};

export type ReV2FundInvestmentRollupRow = {
  investment_id: string;
  name: string;
  deal_type?: string;
  stage?: string;
  sponsor?: string;
  quarter_state_id?: string;
  run_id?: string;
  nav?: number;
  gross_asset_value?: number;
  debt_balance?: number;
  cash_balance?: number;
  effective_ownership_percent?: number;
  fund_nav_contribution?: number;
  inputs_hash?: string;
  created_at?: string;
  // Enriched rollup fields
  fund_id?: string;
  fund_name?: string;
  asset_count?: number;
  total_noi?: number;
  total_revenue?: number;
  total_asset_value?: number;
  total_debt?: number;
  weighted_occupancy?: number;
  computed_ltv?: number;
  computed_dscr?: number;
  gross_irr?: number;
  net_irr?: number;
  equity_multiple?: number;
  sector_mix?: Record<string, number> | null;
  primary_market?: string | null;
  missing_quarter_state_count?: number;
  committed_capital?: number;
  invested_capital?: number;
  target_close_date?: string;
};

export type ReV2InvestmentAsset = {
  asset_id: string;
  deal_id: string;
  jv_id?: string;
  asset_type: string;
  name: string;
  cost_basis?: number;
  property_type?: string;
  units?: number;
  market?: string;
  city?: string;
  state?: string;
  msa?: string;
  quarter_state_id?: string;
  run_id?: string;
  noi?: number;
  occupancy?: number;
  net_cash_flow?: number;
  debt_balance?: number;
  asset_value?: number;
  nav?: number;
  inputs_hash?: string;
  created_at?: string;
};

export type ReV2InvestmentHistoryPoint = {
  quarter: string;
  noi?: number;
  revenue?: number;
  opex?: number;
  occupancy?: number;
  asset_value?: number;
  debt_balance?: number;
  nav?: number;
  gross_irr?: number;
  net_irr?: number;
  equity_multiple?: number;
  fund_nav_contribution?: number;
};

export type ReV2InvestmentHistory = {
  investment_id: string;
  fund_id: string;
  as_of_quarter: string | null;
  scenario_id?: string | null;
  version_id?: string | null;
  operating_history: ReV2InvestmentHistoryPoint[];
  returns_history: ReV2InvestmentHistoryPoint[];
};

export type ReV2FundMetrics = {
  id: string;
  fund_id: string;
  quarter: string;
  contributed_to_date?: number;
  distributed_to_date?: number;
  nav?: number;
  dpi?: number;
  tvpi?: number;
  irr?: number;
  created_at: string;
};

export type ReV2PartnerMetrics = {
  id: string;
  partner_id: string;
  fund_id: string;
  quarter: string;
  contributed_to_date?: number;
  distributed_to_date?: number;
  nav?: number;
  dpi?: number;
  tvpi?: number;
  irr?: number;
  created_at: string;
};

export type ReV2QuarterCloseResult = {
  run_id: string;
  fund_id: string;
  quarter: string;
  fund_state?: ReV2FundQuarterState;
  fund_metrics?: ReV2FundMetrics;
  waterfall_run?: ReV2WaterfallRun;
  assets_processed: number;
  jvs_processed: number;
  investments_processed: number;
  status: string;
};

export type ReV2WaterfallRun = {
  run_id: string;
  fund_id: string;
  definition_id: string;
  quarter: string;
  run_type: string;
  total_distributable?: number;
  status: string;
  created_at: string;
  results?: ReV2WaterfallResult[];
};

export type ReV2WaterfallResult = {
  result_id: string;
  run_id: string;
  partner_id: string;
  tier_code: string;
  payout_type: string;
  amount: number;
  created_at: string;
};

export type ReV2Scenario = {
  scenario_id: string;
  fund_id: string;
  model_id?: string;
  name: string;
  description?: string;
  scenario_type: string;
  is_base: boolean;
  parent_scenario_id?: string;
  status: string;
  created_at: string;
};

export type ReV2Model = {
  model_id: string;
  primary_fund_id?: string | null;
  env_id?: string | null;
  name: string;
  description?: string;
  status: string;
  model_type?: string;
  strategy_type?: string;
  created_by?: string;
  approved_at?: string;
  approved_by?: string;
  created_at: string;
  updated_at?: string;
  scenario_count?: number;
  last_run_at?: string | null;
  last_run_status?: string | null;
  scope_count?: number;
};

export type ModelScenario = {
  id: string;
  model_id: string;
  name: string;
  description?: string;
  is_base: boolean;
  created_at: string;
  updated_at?: string;
};

export type ScenarioAsset = {
  id: string;
  scenario_id: string;
  asset_id: string;
  source_fund_id?: string | null;
  source_investment_id?: string | null;
  added_at: string;
  asset_name?: string;
  asset_type?: string;
  fund_name?: string;
};

export type AvailableAsset = {
  asset_id: string;
  asset_name?: string;
  asset_type?: string;
  source_fund_id?: string | null;
  source_investment_id?: string | null;
  fund_name?: string;
};

export type ScenarioOverride = {
  id: string;
  scenario_id: string;
  scope_type: string;
  scope_id: string;
  key: string;
  value_json: unknown;
  created_at: string;
  updated_at?: string;
};

export type ScenarioRunResult = {
  run_id: string;
  scenario_id: string;
  model_id: string;
  status: string;
  assets_processed: number;
  summary?: Record<string, unknown>;
};

export type ModelRunDetail = {
  id: string;
  model_version_id?: string | null;
  scenario_id: string;
  status: string;
  started_at?: string;
  finished_at?: string;
  inputs_hash?: string;
  engine_version?: string;
  outputs_json?: unknown;
  summary_json?: unknown;
  created_at: string;
};

export type ScenarioCompareResult = {
  scenarios: Array<Record<string, unknown>>;
  comparison?: Array<Record<string, unknown>> | null;
};

export type ReV2ScenarioVersion = {
  version_id: string;
  scenario_id: string;
  model_id: string;
  version_number: number;
  label?: string;
  assumption_set_id?: string;
  is_locked: boolean;
  locked_at?: string;
  locked_by?: string;
  notes?: string;
  created_at: string;
};

export type ReV2Override = {
  id: string;
  scenario_id: string;
  scope_node_type: string;
  scope_node_id: string;
  key: string;
  value_type: string;
  value_decimal?: number;
  reason?: string;
  is_active: boolean;
  created_at: string;
};

export type ReV2RunProvenance = {
  provenance_id: string;
  run_id: string;
  run_type: string;
  fund_id: string;
  quarter: string;
  status: string;
  triggered_by?: string;
  started_at: string;
  completed_at?: string;
};

export type ReV2EntityLineageWidget = {
  widget_key: string;
  label: string;
  status: "ok" | "missing_data" | "stale" | "fallback" | "schema_error";
  display_value: string | number | null;
  endpoint: string;
  source_table: string;
  source_column: string;
  source_row_ref: string | null;
  run_id: string | null;
  inputs_hash: string | null;
  computed_from: string[];
  propagates_to: string[];
  notes: string[];
};

export type ReV2EntityLineageIssue = {
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  widget_keys: string[];
};

export type ReV2EntityLineageResponse = {
  entity_type: "fund" | "investment" | "jv" | "asset";
  entity_id: string;
  quarter: string;
  scenario_id?: string | null;
  generated_at: string;
  widgets: ReV2EntityLineageWidget[];
  issues: ReV2EntityLineageIssue[];
};

// ── Sustainability Types ─────────────────────────────────────────────────────

export type SusAssetProfileInput = {
  env_id: string;
  business_id: string;
  property_type?: string | null;
  square_feet?: number | null;
  year_built?: number | null;
  last_renovation_year?: number | null;
  hvac_type?: string | null;
  primary_heating_fuel?: string | null;
  primary_cooling_type?: string | null;
  lighting_type?: string | null;
  roof_type?: string | null;
  onsite_generation?: boolean;
  solar_kw_installed?: number | null;
  battery_storage_kwh?: number | null;
  ev_chargers_count?: number | null;
  building_certification?: string | null;
  energy_star_score?: number | null;
  leed_level?: string | null;
  wired_score?: number | null;
  fitwel_score?: number | null;
  last_audit_date?: string | null;
};

export type SusAssetProfile = SusAssetProfileInput & {
  asset_id: string;
  data_quality_status: "complete" | "review" | "blocked";
  last_calculated_at?: string | null;
  created_at: string;
};

export type SusUtilityAccountInput = {
  env_id: string;
  business_id: string;
  utility_type: "electric" | "gas" | "water" | "steam" | "district";
  provider_name: string;
  account_number: string;
  meter_id?: string | null;
  billing_frequency?: string | null;
  rate_structure?: string | null;
  demand_charge_applicable?: boolean;
  is_active?: boolean;
};

export type SusUtilityAccount = SusUtilityAccountInput & {
  utility_account_id: string;
  asset_id: string;
  created_at: string;
};

export type SusUtilityMonthlyInput = {
  env_id: string;
  business_id: string;
  utility_type: "electric" | "gas" | "water" | "steam" | "district";
  year: number;
  month: number;
  utility_account_id?: string | null;
  usage_kwh?: number | null;
  usage_therms?: number | null;
  usage_gallons?: number | null;
  peak_kw?: number | null;
  cost_total?: number | null;
  demand_charges?: number | null;
  supply_charges?: number | null;
  taxes_fees?: number | null;
  scope_1_emissions_tons?: number | null;
  scope_2_emissions_tons?: number | null;
  market_based_emissions?: number | null;
  location_based_emissions?: number | null;
  emission_factor_used?: number | null;
  emission_factor_id?: string | null;
  data_source?: "manual" | "energy_star_api" | "utility_api" | "csv";
  renewable_pct?: number | null;
};

export type SusUtilityMonthlyRow = SusUtilityMonthlyInput & {
  utility_monthly_id: string;
  asset_id: string;
  ingestion_run_id?: string | null;
  usage_kwh_equiv?: number | null;
  quality_status: "complete" | "review" | "blocked";
  created_at: string;
};

export type SusUtilityImportRequest = {
  env_id: string;
  business_id: string;
  filename: string;
  csv_text: string;
  import_mode?: "manual" | "mock" | "live";
  created_by?: string;
};

export type SusUtilityImportResult = {
  ingestion_run_id: string;
  filename: string;
  rows_read: number;
  rows_written: number;
  rows_blocked: number;
  issue_count: number;
  sha256: string;
  status: string;
};

export type SusCertificationInput = {
  env_id: string;
  business_id: string;
  certification_type: string;
  level?: string | null;
  score?: number | null;
  issued_on?: string | null;
  expires_on?: string | null;
  status?: "active" | "expired" | "pending" | "revoked";
  evidence_document_id?: string | null;
};

export type SusCertification = SusCertificationInput & {
  asset_certification_id: string;
  asset_id: string;
  created_at: string;
};

export type SusRegulatoryExposureInput = {
  env_id: string;
  business_id: string;
  regulation_id?: string | null;
  regulation_name: string;
  compliance_status: "compliant" | "monitor" | "at_risk" | "non_compliant" | "not_applicable";
  target_year?: number | null;
  estimated_penalty?: number | null;
  estimated_upgrade_cost?: number | null;
  assessed_at?: string | null;
  methodology_note?: string | null;
};

export type SusRegulatoryExposure = SusRegulatoryExposureInput & {
  regulatory_exposure_id: string;
  asset_id: string;
  created_at: string;
};

export type SusEmissionFactorSetInput = {
  source_name: string;
  version_label: string;
  methodology?: string | null;
  published_at?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
};

export type SusEmissionFactorSet = SusEmissionFactorSetInput & {
  factor_set_id: string;
  created_at: string;
};

export type SusOverviewResponse = {
  quarter: string;
  year: number;
  top_cards: Record<string, number | string | null>;
  audit_timestamp?: string | null;
  open_issues: number;
  context: Record<string, unknown>;
};

export type SusPortfolioFootprintResponse = {
  scope: "fund" | "investment";
  summary: Record<string, number | string | null>;
  investment_rows: Array<Record<string, number | string | null>>;
  asset_rows: Array<Record<string, number | string | null>>;
  issues: Array<Record<string, unknown>>;
};

export type SusAssetDashboardResponse = {
  asset_id: string;
  not_applicable: boolean;
  reason?: string | null;
  cards: Record<string, number | string | null>;
  trends: Record<string, unknown>;
  utility_rows: Array<Record<string, number | string | null>>;
  issues: Array<Record<string, unknown>>;
  profile: Record<string, unknown>;
  audit_timestamp?: string | null;
};

export type SusScenarioRunRequest = {
  fund_id: string;
  scenario_id: string;
  base_quarter: string;
  horizon_years?: number;
  projection_mode?: "base" | "carbon_tax" | "utility_shock" | "retrofit" | "solar" | "custom";
};

export type SusScenarioRunResponse = {
  projection_run_id: string;
  fund_id: string;
  scenario_id: string;
  status: string;
  summary: Record<string, unknown>;
  created_at: string;
};

export type SusProjectionResponse = {
  run: Record<string, unknown>;
  asset_rows: Array<Record<string, number | string | null>>;
  investment_rows: Array<Record<string, number | string | null>>;
  fund_rows: Array<Record<string, number | string | null>>;
};

export type SusReportPayload = {
  report_key: string;
  report_title: string;
  generated_at: string;
  context: Record<string, unknown>;
  sections: Array<Record<string, unknown>>;
  appendix_rows: Array<Record<string, unknown>>;
};

// ── Financial Intelligence Types ──────────────────────────────────────────────

export type FiVarianceItem = {
  id: string;
  run_id: string;
  asset_id: string;
  quarter: string;
  line_code: string;
  actual_amount: number;
  plan_amount: number;
  variance_amount: number;
  variance_pct: number | null;
};

export type FiVarianceResult = {
  items: FiVarianceItem[];
  rollup: {
    total_actual: string;
    total_plan: string;
    total_variance: string;
    total_variance_pct: string | null;
  };
};

export type FiFundMetricsQtr = {
  id: string;
  run_id: string;
  fund_id: string;
  quarter: string;
  gross_irr: number | null;
  net_irr: number | null;
  gross_tvpi: number | null;
  net_tvpi: number | null;
  dpi: number | null;
  rvpi: number | null;
  cash_on_cash: number | null;
  gross_net_spread: number | null;
  inputs_missing: string[] | null;
};

export type FiGrossNetBridge = {
  id: string;
  run_id: string;
  fund_id: string;
  quarter: string;
  gross_return: number;
  mgmt_fees: number;
  fund_expenses: number;
  carry_shadow: number;
  net_return: number;
};

export type FiFundMetricsResult = {
  metrics: FiFundMetricsQtr | null;
  bridge: FiGrossNetBridge | null;
};

export type FiLoan = {
  id: string;
  fund_id: string;
  loan_name: string;
  upb: number;
  rate_type: string;
  rate: number;
  spread: number | null;
  maturity: string | null;
  amort_type: string;
  amortization_period_years: number | null;
  term_years: number | null;
  io_period_months: number | null;
  balloon_flag: boolean | null;
  payment_frequency: string | null;
  created_at: string;
};

export type FiCovenantResult = {
  id: string;
  run_id: string;
  fund_id: string;
  loan_id: string;
  quarter: string;
  dscr: number | null;
  ltv: number | null;
  debt_yield: number | null;
  pass: boolean;
  headroom: number | null;
  breached: boolean;
  created_at: string;
};

export type FiWatchlistEvent = {
  id: string;
  fund_id: string;
  loan_id: string;
  quarter: string;
  severity: string;
  reason: string;
  created_at: string;
};

export type FiRun = {
  id: string;
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter: string;
  run_type: string;
  status: string;
  created_at: string;
  created_by: string | null;
};

export type FiRunQuarterCloseResult = {
  run_id: string;
  fund_id: string;
  quarter: string;
  run_type: string;
  status: string;
  variance?: { items_count: number } | null;
  fee_accrual?: string;
  metrics?: FiFundMetricsQtr | null;
  bridge?: FiGrossNetBridge | null;
  inputs_missing: string[];
};

export type FiUwVersion = {
  id: string;
  env_id: string;
  business_id: string;
  name: string;
  effective_from: string;
  created_at: string;
};

// ── Financial Intelligence API Functions ──────────────────────────────────────

export function getFiNOIVariance(params: {
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter: string;
}): Promise<FiVarianceResult> {
  return directFetch("/api/re/v2/variance/noi", { params });
}

export function getFiFundMetrics(params: {
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter: string;
}): Promise<FiFundMetricsResult> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/metrics-detail`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      quarter: params.quarter,
    },
  });
}

export function getFiLoans(params: {
  env_id: string;
  business_id: string;
  fund_id: string;
}): Promise<FiLoan[]> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/loans`, {
    params: { env_id: params.env_id, business_id: params.business_id },
  });
}

export function getFiCovenantResults(loanId: string, quarter?: string): Promise<FiCovenantResult[]> {
  return directFetch(`/api/re/v2/loans/${loanId}/covenant_results`, { params: { quarter } });
}

export function getFiWatchlist(params: {
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter?: string;
}): Promise<FiWatchlistEvent[]> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/watchlist`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      quarter: params.quarter,
    },
  });
}

export function runFiQuarterClose(body: {
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter: string;
  scenario_id?: string;
  uw_version_id?: string;
}): Promise<FiRunQuarterCloseResult> {
  return bosFetch("/api/re/v2/runs/quarter_close", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runFiCovenantTests(body: {
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter: string;
}): Promise<{ run_id: string; status: string; violations: number; total_tested: number }> {
  return bosFetch("/api/re/v2/runs/covenant_tests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runFiWaterfallShadow(body: {
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter: string;
}): Promise<{ run_id: string; status: string; carry_shadow: string }> {
  return bosFetch("/api/re/v2/runs/waterfall_shadow", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listFiRuns(params: {
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter?: string;
}): Promise<FiRun[]> {
  return bosFetch("/api/re/v2/fi/runs", { params });
}

export function listFiUwVersions(params: {
  env_id: string;
  business_id: string;
}): Promise<FiUwVersion[]> {
  return directFetch("/api/re/v2/budget/uw_versions", { params });
}

export function seedFiData(params: {
  env_id: string;
  business_id: string;
  fund_id: string;
  debt_fund_id?: string;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/re/v2/fi/seed", { method: "POST", params });
}

export function seedReV2Data(params: {
  fund_id: string;
  business_id: string;
}): Promise<Record<string, unknown>> {
  return directFetch("/api/re/v2/seed", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ── IRR Timeline / Capital Timeline / IRR Contribution / Model Preview ────

export type IrrTimelinePoint = {
  quarter: string;
  gross_irr: string | null;
  net_irr: string | null;
  portfolio_nav: string | null;
  dpi: string | null;
  tvpi: string | null;
};

export type CapitalTimelinePoint = {
  quarter: string;
  total_called: string;
  total_distributed: string;
};

export type IrrContributionItem = {
  investment_id: string;
  investment_name: string;
  investment_irr: string | null;
  investment_tvpi: string | null;
  fund_nav_contribution: string | null;
  irr_contribution: string | null;
};

export type ModelPreviewAssumption = {
  investment_id: string;
  cap_rate?: number | null;
  rent_growth?: number | null;
  hold_years?: number | null;
  exit_value?: number | null;
};

export type ModelPreviewResult = {
  fund_id: string;
  quarter: string;
  baseline_nav: string | null;
  projected_nav: string | null;
  projected_dpi: string | null;
  projected_tvpi: string | null;
  projected_gross_irr: string | null;
  projected_net_irr: string | null;
  carry_estimate: string | null;
  assumption_count: number;
};

export function getIrrTimeline(params: {
  fund_id: string;
  env_id: string;
  business_id?: string;
}): Promise<IrrTimelinePoint[]> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/irr-timeline`, {
    params: { env_id: params.env_id, business_id: params.business_id },
  });
}

export function getCapitalTimeline(params: {
  fund_id: string;
  env_id: string;
  business_id?: string;
}): Promise<CapitalTimelinePoint[]> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/capital-timeline`, {
    params: { env_id: params.env_id, business_id: params.business_id },
  });
}

export function getIrrContribution(params: {
  fund_id: string;
  env_id: string;
  business_id?: string;
  quarter: string;
}): Promise<IrrContributionItem[]> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/irr-contribution`, {
    params: { env_id: params.env_id, business_id: params.business_id, quarter: params.quarter },
  });
}

export function computeModelPreview(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
  assumptions: ModelPreviewAssumption[];
}): Promise<ModelPreviewResult> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/model-preview`, {
    method: "POST",
    body: JSON.stringify({
      env_id: params.env_id,
      business_id: params.business_id,
      quarter: params.quarter,
      assumptions: params.assumptions,
    }),
  });
}

// ── Asset Platform v2 ─────────────────────────────────────────────────────

export type ReV2AssetListItem = {
  asset_id: string;
  name: string;
  asset_type: string;
  sector?: string;
  city?: string;
  state?: string;
  msa?: string;
  market?: string;
  address?: string;
  units: number;
  square_feet: number;
  status: string;
  investment_id: string;
  investment_name: string;
  fund_id: string;
  fund_name: string;
  latest_noi?: number;
  latest_occupancy?: number;
  latest_value?: number;
  latest_quarter?: string;
  created_at: string;
};

export type ReV2AssetDetail = {
  asset: {
    asset_id: string;
    name: string;
    asset_type: string;
    acquisition_date?: string;
    cost_basis?: number;
    status: string;
    jv_id?: string;
    created_at: string;
  };
  property: {
    property_type?: string;
    units?: number;
    market?: string;
    city?: string;
    state?: string;
    msa?: string;
    address?: string;
    square_feet?: number;
    year_built?: number;
    current_noi?: number;
    occupancy?: number;
    // Multifamily
    avg_rent_per_unit?: number | null;
    unit_mix_json?: Record<string, unknown> | null;
    // Senior Housing
    beds?: number | null;
    licensed_beds?: number | null;
    care_mix_json?: Record<string, unknown> | null;
    revenue_per_occupied_bed?: number | null;
    // Student Housing
    beds_student?: number | null;
    preleased_pct?: number | null;
    university_name?: string | null;
    // MOB
    leasable_sf?: number | null;
    leased_sf?: number | null;
    walt_years?: number | null;
    anchor_tenant?: string | null;
    health_system_affiliation?: string | null;
    // Industrial
    clear_height_ft?: number | null;
    dock_doors?: number | null;
    rail_served?: boolean | null;
    warehouse_sf?: number | null;
    office_sf?: number | null;
  };
  investment: {
    investment_id: string;
    name: string;
    investment_type?: string;
    stage?: string;
  };
  fund: {
    fund_id: string;
    name: string;
  };
  env: {
    env_id: string;
    business_id: string;
  };
  /** Present only for exited assets — realization/sale data */
  realization?: {
    sale_date: string;
    gross_sale_price: number;
    sale_costs: number;
    debt_payoff: number;
    net_sale_proceeds: number;
    ownership_percent: number;
    realization_type: string;
  };
  /** Present only for exited assets — last meaningful quarter before exit zeroes */
  exit_quarter_state?: {
    quarter: string;
    occupancy: number;
    asset_value: number;
    noi: number;
    revenue: number;
    opex: number;
    debt_balance: number;
    ltv: number;
    dscr: number;
    nav: number;
    debt_service: number;
    net_cash_flow: number;
    capex: number;
  };
};

export type ReV2AssetPeriod = {
  quarter: string;
  revenue?: number;
  opex?: number;
  noi?: number;
  occupancy?: number;
  asset_value?: number;
  cap_rate?: number;
  capex?: number;
  debt_service?: number;
  debt_balance?: number;
  cash_balance?: number;
  nav?: number;
  valuation_method?: string;
};

export type ReV2TrialBalanceRow = {
  account_code: string;
  account_name: string;
  category: string;
  is_balance_sheet: boolean;
  balance: number;
};

export type ReV2PnlRow = {
  line_code: string;
  amount: number;
};

export type ReV2TransactionRow = {
  period_month: string;
  gl_account: string;
  name: string;
  category: string;
  amount: number;
  source?: string;
};

export type ReV2AssetReport = {
  report_type: string;
  quarter: string;
  format: string;
  generated_at: string;
  asset: Record<string, unknown>;
  [key: string]: unknown;
};

export function listReV2Assets(params: {
  env_id: string;
  sector?: string;
  state?: string;
  msa?: string;
  status?: string;
  q?: string;
  investment_id?: string;
  fund_id?: string;
  limit?: string;
  offset?: string;
}): Promise<ReV2AssetListItem[]> {
  return directFetch("/api/re/v2/assets", { params });
}

export function createReV2Asset(body: {
  investment_id: string;
  name: string;
  asset_type?: string;
  property_type?: string;
  city?: string;
  state?: string;
  msa?: string;
  address?: string;
  units?: number;
  square_feet?: number;
}): Promise<ReV2AssetListItem> {
  return directFetch("/api/re/v2/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getReV2AssetDetail(assetId: string): Promise<ReV2AssetDetail> {
  return directFetch(`/api/re/v2/assets/${assetId}`);
}

export function getReV2AssetPeriods(
  assetId: string,
  quarterFrom?: string,
  quarterTo?: string,
  scenarioId?: string
): Promise<ReV2AssetPeriod[]> {
  return directFetch(`/api/re/v2/assets/${assetId}/periods`, {
    params: {
      quarter_from: quarterFrom,
      quarter_to: quarterTo,
      scenario_id: scenarioId,
    },
  });
}

export function getReV2AssetTrialBalance(
  assetId: string,
  quarter: string
): Promise<ReV2TrialBalanceRow[]> {
  return directFetch(`/api/re/v2/assets/${assetId}/accounting/trial-balance`, {
    params: { quarter },
  });
}

export function getReV2AssetPnl(
  assetId: string,
  quarter: string
): Promise<ReV2PnlRow[]> {
  return directFetch(`/api/re/v2/assets/${assetId}/accounting/pnl`, {
    params: { quarter },
  });
}

export function getReV2AssetTransactions(
  assetId: string,
  quarter?: string,
  category?: string,
  limit?: string,
  offset?: string
): Promise<ReV2TransactionRow[]> {
  return directFetch(`/api/re/v2/assets/${assetId}/accounting/transactions`, {
    params: { quarter, category, limit, offset },
  });
}

export function generateReV2AssetReport(
  assetId: string,
  body: { report_type: string; quarter?: string; format?: string }
): Promise<ReV2AssetReport> {
  return directFetch(`/api/re/v2/assets/${assetId}/reports`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Asset Valuation ────────────────────────────────────────────────────────

export type ValuationInputs = {
  cap_rate: number;
  exit_cap_rate?: number;
  discount_rate?: number;
  rent_growth?: number;
  expense_growth?: number;
  vacancy?: number;
  weight_direct_cap?: number;
  weight_dcf?: number;
  forward_noi_override?: number;
  hold_years?: number;
  quarter?: string;
  scenario_id?: string;
};

export type CapRateSensitivityRow = {
  cap_rate_delta_bps: number;
  cap_rate: number;
  implied_value: number;
  equity_value: number;
  ltv: number;
};

export type ValuationResult = {
  forward_noi: number;
  value_direct_cap: number;
  value_dcf: number | null;
  value_blended: number;
  equity_value: number;
  ltv: number | null;
  dscr: number | null;
  debt_yield: number | null;
  sensitivity: CapRateSensitivityRow[];
  valuation_method: string;
};

export type ValuationComputeResponse = {
  asset_id: string;
  quarter: string;
  scenario_id: string | null;
  inputs: ValuationInputs;
  result: ValuationResult;
  current_state: {
    noi: number;
    debt_balance: number;
    debt_service: number;
    asset_value: number;
  } | null;
};

export type ValuationSaveResponse = {
  asset_id: string;
  quarter: string;
  scenario_id: string | null;
  saved: { id: string; run_id: string; created_at: string };
  result: ValuationResult;
};

export function computeAssetValuation(
  assetId: string,
  body: ValuationInputs
): Promise<ValuationComputeResponse> {
  return directFetch(`/api/re/v2/assets/${assetId}/valuation/compute`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function saveAssetValuation(
  assetId: string,
  body: ValuationInputs
): Promise<ValuationSaveResponse> {
  return directFetch(`/api/re/v2/assets/${assetId}/valuation/save`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Valuation Overrides ────────────────────────────────────────────────────

export type ValuationOverride = {
  id: string;
  assumption_set_id: string;
  scope_node_type: string;
  scope_node_id: string;
  field_name: string;
  override_value: string;
  notes: string | null;
  created_at: string;
};

export function getAssetValuationOverrides(
  assetId: string,
  scenarioId: string
): Promise<ValuationOverride[]> {
  return directFetch(`/api/re/v2/assets/${assetId}/valuation/overrides`, {
    params: { scenario_id: scenarioId },
  });
}

export function upsertAssetValuationOverride(
  assetId: string,
  body: { scenario_id: string; field_name: string; override_value: string; notes?: string }
): Promise<ValuationOverride> {
  return directFetch(`/api/re/v2/assets/${assetId}/valuation/overrides`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAssetValuationOverride(
  assetId: string,
  body: { scenario_id: string; field_name: string }
): Promise<{ deleted: boolean }> {
  return directFetch(`/api/re/v2/assets/${assetId}/valuation/overrides`, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

// ── Fund Valuation Rollup ─────────────────────────────────────────────────

export type FundValuationRollup = {
  fund_id: string;
  quarter: string;
  scenario_id: string | null;
  summary: {
    asset_count: number;
    total_portfolio_value: number;
    total_equity: number;
    total_debt: number;
    total_noi: number;
    weighted_avg_cap_rate: number | null;
    weighted_avg_ltv: number | null;
    weighted_avg_occupancy: number | null;
  };
  assets: Array<{
    asset_id: string;
    asset_name: string;
    property_type: string;
    noi: number;
    asset_value: number;
    nav: number;
    debt_balance: number;
    occupancy: number;
    valuation_method: string;
  }>;
};

export function getFundValuationRollup(
  fundId: string,
  quarter: string,
  scenarioId?: string
): Promise<FundValuationRollup> {
  return directFetch(`/api/re/v2/funds/${fundId}/valuation/rollup`, {
    params: { quarter, scenario_id: scenarioId },
  });
}

// ── Sale Scenarios ─────────────────────────────────────────────────────────

export type SaleAssumption = {
  id: number;
  fund_id: string;
  scenario_id: string;
  deal_id: string;
  asset_id?: string;
  sale_price: string;
  sale_date: string;
  buyer_costs: string;
  disposition_fee_pct: string;
  memo?: string;
  created_by?: string;
  created_at: string;
};

export type ScenarioComputeResult = {
  scenario_id: string;
  fund_id: string;
  quarter: string;
  base_gross_irr?: string;
  scenario_gross_irr?: string;
  irr_delta?: string;
  base_gross_tvpi?: string;
  scenario_gross_tvpi?: string;
  tvpi_delta?: string;
  scenario_net_irr?: string;
  scenario_net_tvpi?: string;
  scenario_dpi?: string;
  scenario_rvpi?: string;
  carry_estimate: string;
  total_sale_proceeds: string;
  sale_count: number;
  snapshot_id?: string;
};

export type BaseScenarioLiquidationMode = "current_state" | "hypothetical_sale";

export type BaseScenarioAssetContribution = {
  asset_id: string;
  asset_name: string;
  investment_id: string;
  investment_name: string;
  investment_type: string | null;
  asset_status: string | null;
  status_category: "active" | "disposed" | "pipeline";
  property_type: string | null;
  market: string | null;
  city: string | null;
  state: string | null;
  msa: string | null;
  valuation_method: string | null;
  ownership_percent: number;
  attributable_equity_basis: number;
  gross_asset_value: number;
  debt_balance: number;
  net_asset_value: number;
  attributable_gross_value: number;
  attributable_nav: number;
  attributable_noi: number;
  attributable_net_cash_flow: number;
  gross_sale_price: number;
  sale_costs: number;
  debt_payoff: number;
  net_sale_proceeds: number;
  attributable_realized_proceeds: number;
  attributable_hypothetical_proceeds: number;
  current_value_contribution: number;
  realized_gain_loss: number;
  unrealized_gain_loss: number;
  has_sale_assumption: boolean;
  sale_assumption_id: number | null;
  sale_date: string | null;
  source: string;
  notes: string[];
};

export type BaseScenarioWaterfallAllocation = {
  return_of_capital: number;
  preferred_return: number;
  catch_up: number;
  split: number;
  total: number;
};

export type BaseScenarioPartnerAllocation = {
  partner_id: string;
  name: string;
  partner_type: string;
  committed: number;
  contributed: number;
  distributed: number;
  nav_share: number;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  irr: number | null;
  waterfall_allocation: BaseScenarioWaterfallAllocation;
};

export type BaseScenarioTierSummary = {
  tier_code: string;
  tier_label: string;
  tier_order: number;
  lp_amount: number;
  gp_amount: number;
  total_amount: number;
  remaining_after: number;
  starting_obligation: number;
  effective_lp_split: number | null;
  effective_gp_split: number | null;
  hurdle_rate: number | null;
  definition_split_gp: number | null;
  definition_split_lp: number | null;
  catch_up_percent: number | null;
  is_active: boolean;
  is_fully_satisfied: boolean;
};

export type BaseScenarioBridgeRow = {
  label: string;
  amount: number;
  kind: "base" | "positive" | "negative" | "total";
};

export type FundBaseScenario = {
  fund_id: string;
  fund_name: string | null;
  quarter: string;
  scenario_id: string | null;
  liquidation_mode: BaseScenarioLiquidationMode;
  as_of_date: string;
  summary: {
    active_assets: number;
    disposed_assets: number;
    pipeline_assets: number;
    attributable_nav: number;
    attributable_unrealized_nav: number;
    hypothetical_asset_value: number;
    realized_proceeds: number;
    retained_realized_cash: number;
    current_distributable_proceeds: number;
    remaining_value: number;
    total_value: number;
    paid_in_capital: number;
    distributed_capital: number;
    total_committed: number;
    dpi: number | null;
    rvpi: number | null;
    tvpi: number | null;
    gross_irr: number | null;
    net_irr: number | null;
    net_tvpi: number | null;
    unrealized_gain_loss: number;
    realized_gain_loss: number;
    management_fees: number;
    fund_expenses: number;
    carry_shadow: number;
    lp_historical_distributed: number;
    gp_historical_distributed: number;
    lp_liquidation_allocation: number;
    gp_liquidation_allocation: number;
    promote_earned: number;
    preferred_return_shortfall: number;
    preferred_return_excess: number;
    investment_count?: number;
    jv_count?: number;
    computed_at?: string;
  };
  value_composition: {
    historical_realized_proceeds: number;
    retained_realized_cash: number;
    attributable_unrealized_nav: number;
    hypothetical_liquidation_value: number;
    remaining_value: number;
    total_value: number;
  };
  waterfall: {
    definition_id: string | null;
    waterfall_type: string;
    total_liquidation_value: number;
    lp_total: number;
    gp_total: number;
    promote_total: number;
    tiers: BaseScenarioTierSummary[];
    partner_allocations: BaseScenarioPartnerAllocation[];
  };
  bridge: BaseScenarioBridgeRow[];
  assets: BaseScenarioAssetContribution[];
  assumptions: {
    ownership_model: string;
    realized_allocation_method: string;
    liquidation_mode: BaseScenarioLiquidationMode;
    notes: string[];
  };
  jv_summary?: {
    total_jvs: number;
    weighted_avg_ownership: number;
    jvs: {
      jv_id: string;
      legal_name: string;
      investment_id: string;
      investment_name: string;
      ownership_percent: number;
      gp_percent: number | null;
      lp_percent: number | null;
      asset_count: number;
      nav: number;
    }[];
  };
};

export type FundExposureAllocationRow = {
  label: string;
  value: number;
  pct: number;
  source_count: number;
};

export type FundExposureSummary = {
  total_weight: number;
  classified_weight: number;
  unclassified_weight: number;
  coverage_pct: number;
};

export type FundExposureInsights = {
  fund_id: string;
  quarter: string;
  scenario_id: string | null;
  sector_allocation: FundExposureAllocationRow[];
  geographic_allocation: FundExposureAllocationRow[];
  total_weight: number;
  sector_summary: FundExposureSummary;
  geographic_summary: FundExposureSummary;
  weighting_basis_used: "current_nav" | "current_value" | "cost_basis" | "mixed" | "none";
  debug?: {
    assets_scanned: number;
    investments_scanned: number;
    nav_weight_rows: number;
    current_value_fallback_rows: number;
    cost_basis_fallback_rows: number;
    skipped_zero_weight_rows: number;
    missing_sector_rows: number;
    missing_geography_rows: number;
  };
};

export type WaterfallAllocation = {
  return_of_capital?: string;
  preferred_return?: string;
  carry?: string;
  total?: string;
};

export type LpPartnerSummary = {
  partner_id: string;
  name: string;
  partner_type: string;
  committed: string;
  contributed: string;
  distributed: string;
  nav_share?: string;
  dpi?: string;
  tvpi?: string;
  irr?: string;
  waterfall_allocation?: WaterfallAllocation;
};

export type LpSummary = {
  fund_id: string;
  quarter: string;
  fund_metrics: Record<string, string | null>;
  gross_net_bridge: Record<string, string | null>;
  partners: LpPartnerSummary[];
  total_committed: string;
  total_contributed: string;
  total_distributed: string;
  fund_nav: string;
};

export function createSaleAssumption(
  fundId: string,
  body: {
    scenario_id: string;
    deal_id: string;
    asset_id?: string;
    sale_price: number;
    sale_date: string;
    buyer_costs?: number;
    disposition_fee_pct?: number;
    memo?: string;
  },
): Promise<SaleAssumption> {
  return bosFetch(`/api/re/v2/funds/${fundId}/sale-scenarios`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listSaleAssumptions(
  fundId: string,
  scenarioId: string,
): Promise<SaleAssumption[]> {
  return bosFetch(`/api/re/v2/funds/${fundId}/sale-scenarios`, {
    params: { scenario_id: scenarioId },
  });
}

export function deleteSaleAssumption(assumptionId: number): Promise<void> {
  return bosFetch(`/api/re/v2/sale-scenarios/${assumptionId}`, {
    method: "DELETE",
  });
}

export function getFundBaseScenario(params: {
  fund_id: string;
  quarter: string;
  scenario_id?: string;
  liquidation_mode?: BaseScenarioLiquidationMode;
}): Promise<FundBaseScenario> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/base-scenario`, {
    params: {
      quarter: params.quarter,
      scenario_id: params.scenario_id,
      liquidation_mode: params.liquidation_mode,
    },
  });
}

export function getFundExposureInsights(params: {
  fund_id: string;
  quarter: string;
  scenario_id?: string;
}): Promise<FundExposureInsights> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/exposure`, {
    params: {
      quarter: params.quarter,
      scenario_id: params.scenario_id,
    },
  });
}

export type JvDetailAsset = {
  asset_id: string;
  asset_name: string;
  property_type: string | null;
  nav: number | null;
  noi: number | null;
  ownership_percent: number | null;
};

export type JvDetailPartner = {
  partner_id: string;
  partner_name: string;
  partner_type: string;
  ownership_percent: number;
  share_class: string;
  effective_from: string | null;
  effective_to: string | null;
};

export type JvDetailWaterfallTier = {
  tier_order: number;
  tier_type: string;
  hurdle_rate: number | null;
  split_gp: number | null;
  split_lp: number | null;
  catch_up_percent: number | null;
};

export type JvDetailItem = {
  jv_id: string;
  legal_name: string;
  investment_id: string;
  investment_name: string;
  status: string;
  ownership_percent: number;
  gp_percent: number | null;
  lp_percent: number | null;
  promote_structure_id: string | null;
  nav: number | null;
  noi: number | null;
  debt_balance: number | null;
  cash_balance: number | null;
  asset_count: number;
  assets: JvDetailAsset[];
  partner_shares: JvDetailPartner[];
  waterfall_tiers: JvDetailWaterfallTier[];
};

export type JvDetailResult = {
  fund_id: string;
  quarter: string;
  jvs: JvDetailItem[];
};

export type QuarterlyTimelineRow = {
  quarter: string;
  portfolio_nav: number;
  total_committed: number;
  total_called: number;
  total_distributed: number;
  gross_irr: number | null;
  net_irr: number | null;
  tvpi: number | null;
  dpi: number | null;
  rvpi: number | null;
  contributions: number;
  distributions: number;
  fees_and_expenses: number;
  gross_return: number;
  mgmt_fees: number;
  fund_expenses: number;
  net_return: number;
};

export type QuarterlyTimeline = {
  fund_id: string;
  scenario_id: string | null;
  from_quarter: string;
  to_quarter: string;
  rows: QuarterlyTimelineRow[];
};

export function getQuarterlyTimeline(params: {
  fund_id: string;
  from_quarter: string;
  to_quarter: string;
  scenario_id?: string;
}): Promise<QuarterlyTimeline> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/quarterly-timeline`, {
    params: {
      from_quarter: params.from_quarter,
      to_quarter: params.to_quarter,
      scenario_id: params.scenario_id,
    },
  });
}

export function getJvDetail(params: {
  fund_id: string;
  quarter: string;
  scenario_id?: string;
}): Promise<JvDetailResult> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/jv-detail`, {
    params: {
      quarter: params.quarter,
      scenario_id: params.scenario_id,
    },
  });
}

function toScenarioMetricString(value: number | null | undefined): string | undefined {
  return value == null ? undefined : String(value);
}

export function computeScenarioMetrics(
  fundId: string,
  body: {
    scenario_id: string;
    quarter: string;
    env_id: string;
    business_id: string;
  },
): Promise<ScenarioComputeResult> {
  return Promise.all([
    getFundBaseScenario({
      fund_id: fundId,
      quarter: body.quarter,
      liquidation_mode: "current_state",
    }),
    getFundBaseScenario({
      fund_id: fundId,
      quarter: body.quarter,
      scenario_id: body.scenario_id,
      liquidation_mode: "hypothetical_sale",
    }),
  ]).then(([baseScenario, scenario]) => {
    const saleCount = new Set(
      scenario.assets
        .map((asset) => asset.sale_assumption_id)
        .filter((assumptionId): assumptionId is number => assumptionId != null)
    ).size;
    const totalSaleProceeds = scenario.assets.reduce((sum, asset) => {
      if (!asset.has_sale_assumption) return sum;
      return sum + asset.attributable_hypothetical_proceeds;
    }, 0);

    return {
      scenario_id: body.scenario_id,
      fund_id: fundId,
      quarter: body.quarter,
      base_gross_irr: toScenarioMetricString(baseScenario.summary.gross_irr),
      scenario_gross_irr: toScenarioMetricString(scenario.summary.gross_irr),
      irr_delta:
        baseScenario.summary.gross_irr != null && scenario.summary.gross_irr != null
          ? String(scenario.summary.gross_irr - baseScenario.summary.gross_irr)
          : undefined,
      base_gross_tvpi: toScenarioMetricString(baseScenario.summary.tvpi),
      scenario_gross_tvpi: toScenarioMetricString(scenario.summary.tvpi),
      tvpi_delta:
        baseScenario.summary.tvpi != null && scenario.summary.tvpi != null
          ? String(scenario.summary.tvpi - baseScenario.summary.tvpi)
          : undefined,
      scenario_net_irr: toScenarioMetricString(scenario.summary.net_irr),
      scenario_net_tvpi: toScenarioMetricString(scenario.summary.net_tvpi),
      scenario_dpi: toScenarioMetricString(scenario.summary.dpi),
      scenario_rvpi: toScenarioMetricString(scenario.summary.rvpi),
      carry_estimate: String(scenario.summary.promote_earned),
      total_sale_proceeds: String(totalSaleProceeds),
      sale_count: saleCount,
      snapshot_id: scenario.scenario_id ?? body.scenario_id,
    };
  });
}

export function getLpSummary(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
}): Promise<LpSummary> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/lp_summary`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      quarter: params.quarter,
    },
  });
}

export function seedInstitutionalFund(params: {
  env_id: string;
  business_id: string;
  fund_id: string;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/re/v2/fi/seed-institutional", { method: "POST", params });
}

// ── Investors ─────────────────────────────────────────────────────────────────

export function listInvestors(params: {
  env_id: string;
  business_id?: string;
  partner_type?: string;
  quarter?: string;
}): Promise<{ investors: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/investors", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      partner_type: params.partner_type,
      quarter: params.quarter,
    },
  });
}

export function getInvestor(partnerId: string, params: {
  quarter?: string;
}): Promise<{
  partner: Record<string, unknown> | null;
  commitments: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
  totals: Record<string, string>;
}> {
  return directFetch(`/api/re/v2/investors/${partnerId}`, {
    params: { quarter: params.quarter },
  });
}

export function getInvestorCapitalActivity(partnerId: string, params?: {
  quarter?: string;
  entry_type?: string;
  limit?: string;
}): Promise<{
  entries: Record<string, unknown>[];
  totals: Record<string, string>;
}> {
  return directFetch(`/api/re/v2/investors/${partnerId}/capital-activity`, {
    params: {
      quarter: params?.quarter,
      entry_type: params?.entry_type,
      limit: params?.limit,
    },
  });
}

// ── Capital Calls ──────────────────────────────────────────────────────────

export function listCapitalCalls(params: {
  env_id: string;
  business_id?: string;
  fund_id?: string;
  status?: string;
}): Promise<{ capital_calls: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/capital-calls", { params });
}

export function getCapitalCall(callId: string): Promise<Record<string, unknown>> {
  return directFetch(`/api/re/v2/capital-calls/${callId}`);
}

// ── Distributions ──────────────────────────────────────────────────────────

export function listDistributions(params: {
  env_id: string;
  business_id?: string;
  fund_id?: string;
  status?: string;
  event_type?: string;
}): Promise<{ distributions: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/distributions", { params });
}

export function getDistribution(eventId: string): Promise<Record<string, unknown>> {
  return directFetch(`/api/re/v2/distributions/${eventId}`);
}

// ── Period Close ───────────────────────────────────────────────────────────

export function listPeriodCloseRuns(params: {
  env_id: string;
  business_id?: string;
  fund_id?: string;
  quarter?: string;
}): Promise<{ runs: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/period-close", { params });
}

export function getPeriodCloseDetail(fundId: string, params: {
  env_id: string;
}): Promise<Record<string, unknown>> {
  return directFetch(`/api/re/v2/period-close/${fundId}`, { params });
}

// ── Fees ───────────────────────────────────────────────────────────────────

export function listFees(params: {
  env_id: string;
  business_id?: string;
  fund_id?: string;
}): Promise<{ policies: Record<string, unknown>[]; accruals: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/fees", { params });
}

export function getFundFees(fundId: string, params: {
  env_id: string;
}): Promise<Record<string, unknown>> {
  return directFetch(`/api/re/v2/fees/${fundId}`, { params });
}

// ── Variance ───────────────────────────────────────────────────────────────

export function listVariance(params: {
  env_id: string;
  business_id?: string;
  fund_id?: string;
  quarter?: string;
  asset_id?: string;
}): Promise<{ variance_items: Record<string, unknown>[]; summary: Record<string, unknown> }> {
  return directFetch("/api/re/v2/variance", { params });
}

// ── Waterfall Comparison ───────────────────────────────────────────────────

export function listWaterfallRuns(params: {
  env_id: string;
  fund_id?: string;
}): Promise<{ runs: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/waterfall-runs", { params });
}

export function compareWaterfallRuns(params: {
  run_id_a: string;
  run_id_b: string;
  env_id: string;
}): Promise<Record<string, unknown>> {
  return directFetch("/api/re/v2/waterfall-comparison", { params });
}

// ── Approvals ──────────────────────────────────────────────────────────────

export function listApprovals(params: {
  env_id: string;
  business_id?: string;
  status?: string;
}): Promise<{ approvals: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/approvals", { params });
}

// ── Saved Analyses ─────────────────────────────────────────────────────────

export function listSavedAnalyses(params: {
  env_id: string;
  business_id?: string;
}): Promise<{ analyses: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/saved-analyses", { params });
}

export function getSavedAnalysis(queryId: string): Promise<Record<string, unknown>> {
  return directFetch(`/api/re/v2/saved-analyses/${queryId}`);
}

// ── Documents (RE v2) ─────────────────────────────────────────────────────

export function listReDocuments(params: {
  env_id: string;
  business_id?: string;
  classification?: string;
  domain?: string;
  status?: string;
}): Promise<{ documents: Record<string, unknown>[] }> {
  return directFetch("/api/re/v2/documents", { params });
}

export function getDocument(docId: string): Promise<Record<string, unknown>> {
  return directFetch(`/api/re/v2/documents/${docId}`);
}

// ── Investor Statements ────────────────────────────────────────────────────

export function getInvestorStatementHtml(partnerId: string, params: {
  env_id: string;
  fund_id?: string;
  quarter?: string;
}): Promise<string> {
  const qs = new URLSearchParams();
  qs.set("env_id", params.env_id);
  qs.set("format", "html");
  if (params.fund_id) qs.set("fund_id", params.fund_id);
  if (params.quarter) qs.set("quarter", params.quarter);
  return fetch(`/api/re/v2/investors/${partnerId}/statement?${qs.toString()}`)
    .then(r => r.text());
}

// ── Amortization ────────────────────────────────────────────────────────────

export type AmortizationRow = {
  period_number: number;
  payment_date: string | null;
  beginning_balance: number;
  scheduled_principal: number;
  interest_payment: number;
  total_payment: number;
  ending_balance: number;
};

export function getAmortizationSchedule(loanId: string): Promise<AmortizationRow[]> {
  return bosFetch(`/api/re/v2/loans/${loanId}/amortization`);
}

export function generateAmortizationSchedule(loanId: string): Promise<AmortizationRow[]> {
  return bosFetch(`/api/re/v2/loans/${loanId}/amortization/generate`, { method: "POST" });
}

// ── Property Comps ──────────────────────────────────────────────────────────

export type PropertyComp = {
  id: number;
  env_id: string;
  business_id: string;
  asset_id: string;
  comp_type: "sale" | "lease";
  address: string | null;
  submarket: string | null;
  close_date: string | null;
  sale_price: number | null;
  cap_rate: number | null;
  noi: number | null;
  size_sf: number | null;
  price_per_sf: number | null;
  rent_psf: number | null;
  term_months: number | null;
  source: string | null;
  created_at: string;
};

export function getAssetComps(
  assetId: string,
  compType?: string,
): Promise<PropertyComp[]> {
  return bosFetch(`/api/re/v2/assets/${assetId}/comps`, {
    params: compType ? { comp_type: compType } : undefined,
  });
}

// ── Capital Account Snapshots ───────────────────────────────────────────────

export type CapitalAccountSnapshot = {
  id: number;
  fund_id: string;
  partner_id: string;
  partner_name: string | null;
  partner_type: string | null;
  quarter: string;
  committed: number;
  contributed: number;
  distributed: number;
  unreturned_capital: number;
  pref_accrual: number;
  carry_allocation: number;
  unrealized_gain: number;
  nav_share: number;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  created_at: string;
};

export async function getCapitalSnapshots(params: {
  fund_id: string;
  quarter: string;
}): Promise<CapitalAccountSnapshot[]> {
  const res = await fetch(`/api/re/v2/funds/${params.fund_id}/capital-snapshots?quarter=${encodeURIComponent(params.quarter)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function computeCapitalSnapshots(
  fundId: string,
  quarter: string,
): Promise<CapitalAccountSnapshot[]> {
  const res = await fetch(`/api/re/v2/funds/${fundId}/capital-snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quarter }),
  });
  if (!res.ok) return [];
  return res.json();
}

// ── Waterfall Breakdown ─────────────────────────────────────────────────────

export type WaterfallTierAllocation = {
  tier_code: string;
  partner_name: string;
  partner_type: string;
  amount: number;
};

export type WaterfallBreakdown = {
  fund_id: string;
  quarter: string;
  run_id: string | null;
  allocations: WaterfallTierAllocation[];
};

export function getWaterfallBreakdown(params: {
  fund_id: string;
  quarter: string;
}): Promise<WaterfallBreakdown> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/waterfall-breakdown`, {
    params: { quarter: params.quarter },
  });
}

// ── Waterfall Scenario Run ─────────────────────────────────────────────────

export type WaterfallScenarioMetrics = {
  nav: string | null;
  gross_irr: string | null;
  net_irr: string | null;
  gross_tvpi: string | null;
  net_tvpi: string | null;
  dpi: string | null;
  rvpi: string | null;
};

export type WaterfallScenarioDeltas = {
  nav: string | null;
  gross_irr: string | null;
  net_irr: string | null;
  gross_tvpi: string | null;
};

export type WaterfallScenarioOverrides = {
  cap_rate_delta_bps: string;
  noi_stress_pct: string;
  exit_date_shift_months: number;
};

export type WaterfallScenarioTierAllocation = {
  tier_code: string;
  partner_name: string;
  partner_type: string;
  payout_type: string;
  amount: string;
};

export type MissingIngredient = {
  category: string;
  detail: string;
};

export type WaterfallScenarioRunResult = {
  status: string;
  run_id: string | null;
  waterfall_run_id: string | null;
  fund_id: string;
  scenario_id: string;
  quarter: string;
  mode: string | null;
  error: string | null;
  missing: MissingIngredient[];
  overrides: WaterfallScenarioOverrides | null;
  base: WaterfallScenarioMetrics | null;
  scenario: WaterfallScenarioMetrics | null;
  deltas: WaterfallScenarioDeltas | null;
  carry_estimate: string | null;
  mgmt_fees: string | null;
  fund_expenses: string | null;
  tier_allocations: WaterfallScenarioTierAllocation[];
  snapshot_id: string | null;
};

export type WaterfallScenarioRunListItem = {
  id: string;
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter: string;
  scenario_id: string;
  run_type: string;
  status: string;
  output_hash: string | null;
  created_at: string;
  scenario_name: string | null;
};

export type WaterfallScenarioValidation = {
  ready: boolean;
  missing: MissingIngredient[];
};

export type WaterfallTemplate = {
  name: string;
  description?: string | null;
  cap_rate_delta_bps: number;
  noi_stress_pct: number;
  exit_date_shift_months: number;
  is_system?: boolean;
};

export type WaterfallSummary = {
  run_id: string;
  fund_id: string;
  fund_name?: string | null;
  quarter: string;
  scenario_id?: string | null;
  scenario_name?: string | null;
  created_at?: string | null;
  summary: {
    total_distributable?: number | string | null;
    gp_carry?: number | string | null;
    lp_total?: number | string | null;
    lp_shortfall?: number | string | null;
    net_irr?: number | string | null;
    net_tvpi?: number | string | null;
    nav?: number | string | null;
  };
  allocations?: Array<Record<string, string | number | null>>;
  tier_totals?: Record<string, number>;
};

export type MonteCarloWaterfallResponse = {
  p10: WaterfallSummary;
  p50: WaterfallSummary;
  p90: WaterfallSummary;
  deltas: Record<string, Record<string, number | null>>;
};

export type PortfolioWaterfallResponse = {
  funds: Array<Record<string, string | number | null>>;
  portfolio: Record<string, string | number | null>;
  diversification_score: number;
};

export type CapitalCallImpactResponse = {
  before: WaterfallSummary;
  after: WaterfallSummary;
  deltas: Record<string, number | null>;
  additional_call_amount: number;
};

export type ClawbackRiskResponse = {
  fund_id: string;
  quarter: string;
  risk_level: "none" | "low" | "medium" | "high";
  clawback_liability: number | string;
  clawback_outstanding: number | string;
  promote_outstanding: number | string;
  reference_run_id: string;
};

export type SensitivityMatrixResponse = {
  rows: Array<Array<number | null>>;
  col_headers: string[];
  row_headers: string[];
  metric_name: string;
  base_value: number | null;
};

export type UwVsActualWaterfallResponse = {
  uw: WaterfallSummary;
  actual: WaterfallSummary;
  attribution: {
    nav_attribution: Record<string, number | string | null>;
    irr_attribution: Record<string, number | string | null>;
    tier_attribution: Array<Record<string, number | string>>;
    largest_driver: string;
  };
  narrative_hint: string;
};

export type ConstructionWaterfallResponse = {
  base: WaterfallSummary;
  construction_adjusted: WaterfallSummary;
  stabilization_date: string;
  months_to_stabilization: number;
  exit_shift_applied: number;
  construction_schedule: Array<Record<string, string | number | null>>;
};

export type PipelineRadarResponse = {
  deals: Array<Record<string, unknown>>;
  top_5: Array<Record<string, unknown>>;
  count: number;
};

export async function runWaterfallScenario(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  scenario_id: string;
  quarter: string;
  mode?: string;
  cap_rate_delta_bps?: number;
  noi_stress_pct?: number;
  exit_date_shift_months?: number;
}): Promise<WaterfallScenarioRunResult> {
  // Use Next.js proxy endpoint for waterfall scenarios
  const res = await fetch(`/api/re/v2/funds/${params.fund_id}/waterfall-scenarios/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      env_id: params.env_id,
      business_id: params.business_id,
      scenario_id: params.scenario_id,
      as_of_quarter: params.quarter,
      mode: params.mode || "shadow",
      cap_rate_delta_bps: params.cap_rate_delta_bps,
      noi_stress_pct: params.noi_stress_pct,
      exit_date_shift_months: params.exit_date_shift_months,
    }),
  });
  if (!res.ok) throw new Error("Waterfall scenario run failed");
  return res.json();
}

export function listWaterfallScenarioRuns(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter?: string;
}): Promise<WaterfallScenarioRunListItem[]> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/waterfall-scenarios/runs`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      ...(params.quarter ? { quarter: params.quarter } : {}),
    },
  });
}

export function validateWaterfallScenarioIngredients(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  scenario_id: string;
  quarter: string;
}): Promise<WaterfallScenarioValidation> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/waterfall-scenarios/validate`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      scenario_id: params.scenario_id,
      quarter: params.quarter,
    },
  });
}

export function listWaterfallScenarioTemplates(params: {
  env_id: string;
  business_id: string;
}): Promise<{ templates: WaterfallTemplate[] }> {
  return bosFetch("/api/re/v2/waterfall-scenarios/templates", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
    },
  });
}

export function runMonteCarloWaterfall(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
  p10_nav: number;
  p50_nav: number;
  p90_nav: number;
}): Promise<MonteCarloWaterfallResponse> {
  return directFetch(`/api/re/v2/funds/${params.fund_id}/monte-carlo-waterfall`, {
    method: "POST",
    body: JSON.stringify({
      env_id: params.env_id,
      business_id: params.business_id,
      quarter: params.quarter,
      p10_nav: params.p10_nav,
      p50_nav: params.p50_nav,
      p90_nav: params.p90_nav,
    }),
  });
}

export function getPortfolioWaterfall(params: {
  fund_ids: string[];
  env_id: string;
  business_id: string;
  quarter: string;
}): Promise<PortfolioWaterfallResponse> {
  return directFetch("/api/re/v2/portfolio/waterfall", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function runCapitalCallImpact(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
  additional_call_amount: number;
}): Promise<CapitalCallImpactResponse> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/capital-call-impact`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function getClawbackRisk(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
  scenario_id?: string;
}): Promise<ClawbackRiskResponse> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/clawback-risk`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      quarter: params.quarter,
      scenario_id: params.scenario_id,
    },
  });
}

export function runWaterfallSensitivityMatrix(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
  cap_rate_range_bps: number[];
  noi_stress_range_pct: number[];
  metric?: string;
}): Promise<SensitivityMatrixResponse> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/sensitivity-matrix`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function getUwVsActualWaterfall(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
  model_id?: string;
}): Promise<UwVsActualWaterfallResponse> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/uw-vs-actual-waterfall`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      quarter: params.quarter,
      model_id: params.model_id,
    },
  });
}

export function getConstructionWaterfall(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
  asset_id?: string;
}): Promise<ConstructionWaterfallResponse> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/construction-waterfall`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      quarter: params.quarter,
      asset_id: params.asset_id,
    },
  });
}

export function getPipelineRadar(params: {
  env_id: string;
  business_id: string;
  stage?: string[];
}): Promise<PipelineRadarResponse> {
  const query = new URLSearchParams({
    env_id: params.env_id,
    business_id: params.business_id,
  });
  (params.stage || []).forEach((value) => query.append("stage", value));
  return bosFetch(`/api/re/v2/pipeline/radar?${query.toString()}`);
}

export function seedWaterfallScenarios(params: {
  env_id: string;
  business_id: string;
  fund_id: string;
  quarter?: string;
}): Promise<Record<string, unknown>> {
  return bosFetch("/api/re/v2/fi/seed-waterfall-scenarios", {
    method: "POST",
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      fund_id: params.fund_id,
      ...(params.quarter ? { quarter: params.quarter } : {}),
    },
  });
}

// ── Excel Export ────────────────────────────────────────────────────────────

export function exportFundExcelUrl(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  quarter: string;
}): string {
  const qs = new URLSearchParams({
    env_id: params.env_id,
    business_id: params.business_id,
    quarter: params.quarter,
  }).toString();
  return `/bos/api/re/v2/funds/${params.fund_id}/export?${qs}`;
}

// ── CRE Intelligence ────────────────────────────────────────────────────────

export type CreGeographyFeature = {
  type: "Feature";
  geometry: Record<string, unknown> | null;
  properties: {
    geography_id: string;
    geography_type: string;
    geoid: string;
    name: string;
    state_code?: string | null;
    cbsa_code?: string | null;
    vintage: number;
    metric_key?: string | null;
    metric_value?: number | null;
    units?: string | null;
    source?: string | null;
    value_vintage?: string | null;
    pulled_at?: string | null;
  };
};

export type CreGeographyFeatureCollection = {
  type: "FeatureCollection";
  features: CreGeographyFeature[];
};

export type CreIngestRun = {
  run_id: string;
  source_key: string;
  scope_json: Record<string, unknown>;
  status: string;
  rows_read: number;
  rows_written: number;
  error_count: number;
  duration_ms?: number | null;
  token_cost?: number | null;
  raw_artifact_path?: string | null;
  error_summary?: string | null;
  started_at: string;
  finished_at?: string | null;
};

export type CrePropertySummary = {
  property_id: string;
  env_id: string;
  business_id: string;
  property_name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  lat?: number | null;
  lon?: number | null;
  land_use?: string | null;
  size_sqft?: number | null;
  year_built?: number | null;
  resolution_confidence: number;
  latest_forecast_id?: string | null;
  latest_forecast_target?: string | null;
  latest_prediction?: number | null;
  latest_prediction_low?: number | null;
  latest_prediction_high?: number | null;
  latest_prediction_at?: string | null;
};

export type CreLinkedGeography = {
  geography_id: string;
  geography_type: string;
  geoid: string;
  name: string;
  state_code?: string | null;
  cbsa_code?: string | null;
  confidence: number;
  match_method: string;
};

export type CreLinkedEntity = {
  entity_id: string;
  entity_type: string;
  name: string;
  role: string;
  confidence: number;
  identifiers: Record<string, unknown>;
};

export type CreForecast = {
  forecast_id: string;
  env_id: string;
  business_id: string;
  scope: string;
  entity_id: string;
  target: string;
  horizon: string;
  model_version: string;
  prediction: number;
  lower_bound?: number | null;
  upper_bound?: number | null;
  baseline_prediction?: number | null;
  status: string;
  intervals: Record<string, unknown>;
  explanation_ptr?: string | null;
  explanation_json: Record<string, any>;
  source_vintages: Array<Record<string, unknown>>;
  generated_at: string;
};

export type CrePropertyDetail = {
  property: CrePropertySummary;
  source_provenance: Record<string, unknown>;
  parcels: Array<Record<string, unknown>>;
  buildings: Array<Record<string, unknown>>;
  linked_geographies: CreLinkedGeography[];
  linked_entities: CreLinkedEntity[];
  latest_forecasts: CreForecast[];
};

export type CreMetricValue = {
  metric_key: string;
  label: string;
  value: number;
  units?: string | null;
  source: string;
  vintage?: string | null;
  pulled_at?: string | null;
  provenance: Record<string, unknown>;
};

export type CreExternalitiesBundle = {
  property_id: string;
  period: string;
  macro: CreMetricValue[];
  housing: CreMetricValue[];
  hazard: CreMetricValue[];
  policy: CreMetricValue[];
};

export type CreFeatureValue = {
  feature_id: string;
  entity_scope: string;
  entity_id: string;
  period: string;
  feature_key: string;
  value: number;
  version: string;
  lineage_json: Record<string, unknown>;
  created_at: string;
};

export type CreForecastQuestion = {
  question_id: string;
  env_id: string;
  business_id: string;
  text: string;
  scope: string;
  entity_id?: string | null;
  event_date: string;
  resolution_criteria: string;
  resolution_source: string;
  probability: number;
  method: string;
  status: string;
  brier_score?: number | null;
  last_moved_at: string;
  created_at: string;
};

export type CreForecastSignal = {
  signal_source: string;
  signal_type: string;
  probability: number;
  weight?: number | null;
  observed_at: string;
  source_ref?: string | null;
  metadata_json: Record<string, unknown>;
};

export type CreForecastSignalsBundle = {
  question: CreForecastQuestion;
  signals: CreForecastSignal[];
  aggregate_probability: number;
  weights: Record<string, number>;
  reason_codes: string[];
};

export type CreEntityResolutionCandidate = {
  candidate_id: string;
  env_id: string;
  business_id: string;
  property_id?: string | null;
  entity_type: string;
  candidate_type: string;
  source_record: Record<string, unknown>;
  proposed_match: Record<string, unknown>;
  confidence: number;
  evidence: Record<string, unknown>;
  status: string;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

export async function createCreIngestRun(body: {
  source_key: string;
  scope: "national" | "state" | "metro";
  filters?: Record<string, unknown>;
  force_refresh?: boolean;
}): Promise<CreIngestRun> {
  return bosFetch("/api/re/v2/intelligence/ingest/runs", {
    method: "POST",
    body: JSON.stringify({
      source_key: body.source_key,
      scope: body.scope,
      filters: body.filters || {},
      force_refresh: body.force_refresh ?? false,
    }),
  });
}

export async function listCreIntelligenceGeographies(params: {
  bbox?: string;
  layer?: string;
  metric_key?: string;
  period?: string;
}): Promise<CreGeographyFeatureCollection> {
  return bosFetch("/api/re/v2/intelligence/geographies", {
    params: {
      bbox: params.bbox,
      layer: params.layer,
      metric_key: params.metric_key,
      period: params.period,
    },
  });
}

export async function listCreIntelligenceProperties(params: {
  env_id: string;
  bbox?: string;
  property_type?: string;
  search?: string;
  risk_band?: string;
}): Promise<CrePropertySummary[]> {
  return bosFetch("/api/re/v2/intelligence/properties", {
    params: {
      env_id: params.env_id,
      bbox: params.bbox,
      property_type: params.property_type,
      search: params.search,
      risk_band: params.risk_band,
    },
  });
}

export async function getCreIntelligenceProperty(propertyId: string): Promise<CrePropertyDetail> {
  return bosFetch(`/api/re/v2/intelligence/properties/${propertyId}`);
}

export async function getCreIntelligenceExternalities(params: {
  property_id: string;
  period?: string;
}): Promise<CreExternalitiesBundle> {
  return bosFetch(`/api/re/v2/intelligence/properties/${params.property_id}/externalities`, {
    params: {
      period: params.period,
    },
  });
}

export async function getCreIntelligenceFeatures(params: {
  property_id: string;
  period?: string;
  version?: string;
}): Promise<CreFeatureValue[]> {
  return bosFetch(`/api/re/v2/intelligence/properties/${params.property_id}/features`, {
    params: {
      period: params.period,
      version: params.version,
    },
  });
}

export async function materializeCreForecasts(body: {
  scope: string;
  entity_ids: string[];
  targets: string[];
  horizon?: string;
  feature_version?: string;
}): Promise<CreForecast[]> {
  return bosFetch("/api/re/v2/intelligence/forecasts/materialize", {
    method: "POST",
    body: JSON.stringify({
      scope: body.scope,
      entity_ids: body.entity_ids,
      targets: body.targets,
      horizon: body.horizon || "12m",
      feature_version: body.feature_version || "miami_mvp_v1",
    }),
  });
}

export async function listCreForecastQuestions(params: {
  env_id?: string;
  business_id?: string;
  scope?: string;
  status?: string;
}): Promise<CreForecastQuestion[]> {
  return bosFetch("/api/re/v2/intelligence/questions", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      scope: params.scope,
      status: params.status,
    },
  });
}

export async function createCreForecastQuestion(body: {
  env_id: string;
  business_id: string;
  text: string;
  scope: string;
  event_date: string;
  resolution_criteria: string;
  resolution_source: string;
  entity_id?: string;
}): Promise<CreForecastQuestion> {
  return bosFetch("/api/re/v2/intelligence/questions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getCreForecastSignals(questionId: string): Promise<CreForecastSignalsBundle> {
  return bosFetch(`/api/re/v2/intelligence/questions/${questionId}/signals`);
}

export async function refreshCreForecastSignals(questionId: string): Promise<CreForecastSignalsBundle> {
  return bosFetch(`/api/re/v2/intelligence/questions/${questionId}/signals/refresh`, {
    method: "POST",
  });
}

export async function listCreResolutionCandidates(params: {
  env_id?: string;
  business_id?: string;
  status?: string;
  entity_type?: string;
}): Promise<CreEntityResolutionCandidate[]> {
  return bosFetch("/api/re/v2/intelligence/entity-resolution/candidates", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      status: params.status,
      entity_type: params.entity_type,
    },
  });
}

// ---------------------------------------------------------------------------
// Novendor Consulting OS – Context Fetchers
// ---------------------------------------------------------------------------

export function getDiscoveryContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/discovery/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getDataStudioContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/data-studio/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getWorkflowIntelContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/workflow-intel/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getVendorIntelContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/vendor-intel/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getMetricDictContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/metric-dict/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getDataChaosContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/data-chaos/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getBlueprintContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/blueprint/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getPilotContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/pilot/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getImpactContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/impact/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getCaseFactoryContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/case-factory/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getCopilotContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/copilot/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getOutputsContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/outputs/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getPatternIntelContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/pattern-intel/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getOpportunityEngineContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/opportunity-engine/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

// ── Resume Environment ─────────────────────────────────────────────

export function getResumeContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/resume/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export type ResumeRole = {
  role_id: string;
  env_id: string;
  business_id: string;
  company: string;
  division: string | null;
  title: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  role_type: string;
  industry: string | null;
  summary: string | null;
  highlights: string[];
  technologies: string[];
  sort_order: number;
  created_at: string;
};

export type ResumeSkill = {
  skill_id: string;
  env_id: string;
  business_id: string;
  name: string;
  category: string;
  proficiency: number;
  years_used: number | null;
  context: string | null;
  current: boolean;
  created_at: string;
};

export type ResumeProject = {
  project_id: string;
  env_id: string;
  business_id: string;
  name: string;
  client: string | null;
  role_id: string | null;
  status: string;
  summary: string | null;
  impact: string | null;
  technologies: string[];
  metrics: Array<{ label: string; value: string }>;
  url: string | null;
  sort_order: number;
  created_at: string;
};

export type ResumeCareerSummary = {
  total_years: number;
  total_roles: number;
  total_companies: number;
  total_skills: number;
  total_projects: number;
  education: string;
  location: string;
  current_title: string;
  current_company: string;
};

export type ResumeSkillMatrix = {
  category: string;
  avg_proficiency: number;
  skill_count: number;
  max_proficiency: number;
};

export function listResumeRoles(envId: string, businessId?: string): Promise<ResumeRole[]> {
  return bosFetch("/api/resume/v1/roles", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listResumeSkills(envId: string, businessId?: string, category?: string): Promise<ResumeSkill[]> {
  return bosFetch("/api/resume/v1/skills", {
    params: { env_id: envId, business_id: businessId, category },
  });
}

export function listResumeProjects(envId: string, businessId?: string): Promise<ResumeProject[]> {
  return bosFetch("/api/resume/v1/projects", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getResumeCareerSummary(envId: string, businessId?: string): Promise<ResumeCareerSummary> {
  return bosFetch("/api/resume/v1/career-summary", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getResumeSkillMatrix(envId: string, businessId?: string): Promise<ResumeSkillMatrix[]> {
  return bosFetch("/api/resume/v1/skill-matrix", {
    params: { env_id: envId, business_id: businessId },
  });
}

// ── Resume OS types ─────────────────────────────────────────────

export type ResumeSystemComponent = {
  component_id: string;
  env_id: string;
  business_id: string;
  layer: string;
  name: string;
  description: string | null;
  tools: string[];
  outcomes: string[];
  connections: Array<{ target_layer: string; label: string }>;
  icon_key: string | null;
  sort_order: number;
  created_at: string;
};

export type ResumeDeployment = {
  deployment_id: string;
  env_id: string;
  business_id: string;
  role_id: string | null;
  deployment_name: string;
  system_type: string;
  problem: string | null;
  architecture: string | null;
  before_state: Record<string, string>;
  after_state: Record<string, string>;
  status: string;
  sort_order: number;
  created_at: string;
  company: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
};

export type ResumeSystemStats = {
  properties_managed: number;
  pipelines_built: number;
  hours_saved_monthly: number;
  performance_gain_pct: number;
  mcp_tools: number;
  active_systems: number;
  total_roles: number;
  total_projects: number;
  system_status: string;
};

export function listResumeSystemComponents(envId: string, businessId?: string): Promise<ResumeSystemComponent[]> {
  return bosFetch("/api/resume/v1/system-components", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listResumeDeployments(envId: string, businessId?: string): Promise<ResumeDeployment[]> {
  return bosFetch("/api/resume/v1/deployments", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getResumeSystemStats(envId: string, businessId?: string): Promise<ResumeSystemStats> {
  return bosFetch("/api/resume/v1/system-stats", {
    params: { env_id: envId, business_id: businessId },
  });
}

export type ResumeWorkspaceMetric = {
  label: string;
  value: string;
  detail: string | null;
};

export type ResumeIdentity = {
  name: string;
  title: string;
  tagline: string;
  location: string;
  summary: string;
  badges: string[];
  metrics: ResumeWorkspaceMetric[];
};

export type ResumeTimelineInitiative = {
  initiative_id: string;
  role_id: string;
  title: string;
  summary: string;
  team_context: string;
  business_challenge: string;
  measurable_outcome: string;
  stakeholder_group: string;
  scale: string;
  architecture: string;
  start_date: string;
  end_date: string;
  category: string;
  capability: string;
  impact_area: string;
  technologies: string[];
  impact_tag: string;
  linked_modules: string[];
  linked_architecture_node_ids: string[];
  linked_bi_entity_ids: string[];
  linked_model_preset: string | null;
};

export type ResumeTimelineMilestone = {
  milestone_id: string;
  title: string;
  date: string;
  summary: string;
  linked_modules: string[];
  linked_architecture_node_ids: string[];
  linked_bi_entity_ids: string[];
  linked_model_preset: string | null;
};

export type ResumeTimelineRole = {
  timeline_role_id: string;
  company: string;
  title: string;
  lane: string;
  start_date: string;
  end_date: string | null;
  summary: string;
  scope: string;
  technologies: string[];
  outcomes: string[];
  initiatives: ResumeTimelineInitiative[];
  milestones: ResumeTimelineMilestone[];
};

export type ResumeTimelineViewMode = "career" | "delivery" | "capability" | "impact" | "compounding";

export type ResumeTimeline = {
  default_view: ResumeTimelineViewMode;
  views: ResumeTimelineViewMode[];
  start_date: string;
  end_date: string;
  roles: ResumeTimelineRole[];
  milestones: ResumeTimelineMilestone[];
};

export type ResumeArchitectureNode = {
  node_id: string;
  label: string;
  layer: string;
  group: string;
  position: { x: number; y: number };
  description: string;
  tools: string[];
  outcomes: string[];
  business_problem: string;
  real_example: string;
  linked_timeline_ids: string[];
  linked_bi_entity_ids: string[];
  linked_model_preset: string | null;
};

export type ResumeArchitectureEdge = {
  edge_id: string;
  source: string;
  target: string;
  technical_label: string;
  impact_label: string;
};

export type ResumeArchitecture = {
  default_view: "technical" | "business";
  nodes: ResumeArchitectureNode[];
  edges: ResumeArchitectureEdge[];
};

export type ResumeScenarioInputs = {
  purchase_price: number;
  exit_cap_rate: number;
  hold_period: number;
  noi_growth_pct: number;
  debt_pct: number;
};

export type ResumeScenarioPreset = {
  preset_id: string;
  label: string;
  description: string;
  inputs: ResumeScenarioInputs;
};

export type ResumeModeling = {
  defaults: ResumeScenarioInputs;
  assumptions: Record<string, string | number>;
  presets: ResumeScenarioPreset[];
};

export type ResumeBiPoint = {
  period: string;
  noi: number;
  occupancy: number;
  value: number;
  irr: number;
};

export type ResumeBiEntity = {
  entity_id: string;
  parent_id: string | null;
  level: "portfolio" | "fund" | "investment" | "asset";
  name: string;
  market: string | null;
  property_type: string | null;
  sector: string | null;
  coordinates: { x: number; y: number } | null;
  metrics: Record<string, string | number>;
  trend: ResumeBiPoint[];
  story: string;
  linked_architecture_node_ids: string[];
  linked_timeline_ids: string[];
};

export type ResumeBi = {
  root_entity_id: string;
  levels: Array<"portfolio" | "fund" | "investment" | "asset">;
  markets: string[];
  property_types: string[];
  periods: string[];
  entities: ResumeBiEntity[];
};

export type ResumeStory = {
  story_id: string;
  title: string;
  module: string;
  why_it_matters: string;
  before_state: string;
  after_state: string;
  audience: string;
};

export type ResumeWorkspacePayload = {
  identity: ResumeIdentity;
  timeline: ResumeTimeline;
  architecture: ResumeArchitecture;
  modeling: ResumeModeling;
  bi: ResumeBi;
  stories: ResumeStory[];
};

export type ResumeAssistantContext = {
  active_module: string;
  selected_timeline_id?: string | null;
  selected_architecture_node_id?: string | null;
  selected_bi_entity_id?: string | null;
  architecture_view?: string | null;
  timeline_view?: string | null;
  model_preset_id?: string | null;
  model_inputs?: Record<string, string | number>;
  breadcrumb?: string[];
  metrics?: Record<string, string | number>;
  filters?: Record<string, string>;
};

export type ResumeAssistantResponse = {
  blocks: AssistantResponseBlock[];
  suggested_questions: string[];
};

export function getResumeWorkspace(envId: string, businessId?: string): Promise<ResumeWorkspacePayload> {
  return bosFetch("/api/resume/v1/workspace", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function askResumeAssistant(body: {
  env_id: string;
  business_id?: string | null;
  query: string;
  context: ResumeAssistantContext;
}): Promise<ResumeAssistantResponse> {
  return bosFetch("/api/resume/v1/assistant", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getOpportunityDashboard(params: {
  env_id: string;
  business_id?: string;
  business_line?: string;
  sector?: string;
  geography?: string;
  as_of_date?: string;
}): Promise<OpportunityDashboard> {
  return bosFetch("/api/opportunity-engine/v1/dashboard", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      business_line: params.business_line,
      sector: params.sector,
      geography: params.geography,
      as_of_date: params.as_of_date,
    },
  });
}

export function listOpportunityRecommendations(params: {
  env_id: string;
  business_id?: string;
  business_line?: string;
  sector?: string;
  geography?: string;
  as_of_date?: string;
  limit?: number;
}): Promise<OpportunityRecommendation[]> {
  return bosFetch("/api/opportunity-engine/v1/recommendations", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      business_line: params.business_line,
      sector: params.sector,
      geography: params.geography,
      as_of_date: params.as_of_date,
      limit: params.limit?.toString(),
    },
  });
}

export function getOpportunityRecommendationDetail(
  recommendationId: string,
  params: { env_id: string; business_id?: string }
): Promise<OpportunityRecommendationDetail> {
  return bosFetch(`/api/opportunity-engine/v1/recommendations/${recommendationId}`, {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
    },
  });
}

export function listOpportunitySignals(params: {
  env_id: string;
  business_id?: string;
  canonical_topic?: string;
  geography?: string;
  limit?: number;
}): Promise<OpportunitySignal[]> {
  return bosFetch("/api/opportunity-engine/v1/signals", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      canonical_topic: params.canonical_topic,
      geography: params.geography,
      limit: params.limit?.toString(),
    },
  });
}

export function listOpportunityRuns(params: {
  env_id: string;
  business_id?: string;
  status?: string;
  limit?: number;
}): Promise<OpportunityModelRun[]> {
  return bosFetch("/api/opportunity-engine/v1/runs", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
      status: params.status,
      limit: params.limit?.toString(),
    },
  });
}

export function createOpportunityRun(body: {
  env_id: string;
  business_id?: string;
  mode?: "fixture" | "live";
  run_type?: string;
  business_lines?: Array<"consulting" | "pds" | "re_investment" | "market_intel">;
  triggered_by?: string;
  as_of_date?: string;
}): Promise<OpportunityModelRun> {
  return bosFetch("/api/opportunity-engine/v1/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Novendor Consulting OS – Discovery Lab CRUD
// ---------------------------------------------------------------------------

export type NvAccount = {
  account_id: string;
  env_id: string;
  business_id: string;
  company_name: string;
  industry?: string | null;
  sub_industry?: string | null;
  employee_count?: number | null;
  annual_revenue?: string | null;
  headquarters?: string | null;
  primary_contact_name?: string | null;
  champion_name?: string | null;
  engagement_stage: string;
  pain_summary?: string | null;
  vendor_count: number;
  system_count: number;
  status: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type NvDashboard = {
  total_accounts: number;
  active_engagements: number;
  total_systems: number;
  total_vendors: number;
  total_artifacts: number;
  total_vendor_spend: string;
  total_pain_points: number;
  stage_counts: Record<string, number>;
};

export function getDiscoveryDashboard(envId: string, businessId?: string): Promise<NvDashboard> {
  return bosFetch("/api/discovery/v1/dashboard", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listDiscoveryAccounts(envId: string, businessId?: string): Promise<NvAccount[]> {
  return bosFetch("/api/discovery/v1/accounts", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createDiscoveryAccount(body: Record<string, unknown>): Promise<NvAccount> {
  return bosFetch("/api/discovery/v1/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listDiscoverySystems(accountId: string, envId: string, businessId?: string): Promise<unknown[]> {
  return bosFetch(`/api/discovery/v1/accounts/${accountId}/systems`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createDiscoverySystem(accountId: string, body: Record<string, unknown>, envId: string, businessId?: string): Promise<unknown> {
  return bosFetch(`/api/discovery/v1/accounts/${accountId}/systems?env_id=${envId}${businessId ? `&business_id=${businessId}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listDiscoveryVendors(accountId: string, envId: string, businessId?: string): Promise<unknown[]> {
  return bosFetch(`/api/discovery/v1/accounts/${accountId}/vendors`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createDiscoveryVendor(accountId: string, body: Record<string, unknown>, envId: string, businessId?: string): Promise<unknown> {
  return bosFetch(`/api/discovery/v1/accounts/${accountId}/vendors?env_id=${envId}${businessId ? `&business_id=${businessId}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listDiscoverySessions(accountId: string, envId: string, businessId?: string): Promise<unknown[]> {
  return bosFetch(`/api/discovery/v1/accounts/${accountId}/sessions`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createDiscoverySession(accountId: string, body: Record<string, unknown>, envId: string, businessId?: string): Promise<unknown> {
  return bosFetch(`/api/discovery/v1/accounts/${accountId}/sessions?env_id=${envId}${businessId ? `&business_id=${businessId}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listDiscoveryPainPoints(accountId: string, envId: string, businessId?: string): Promise<unknown[]> {
  return bosFetch(`/api/discovery/v1/accounts/${accountId}/pain-points`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createDiscoveryPainPoint(accountId: string, body: Record<string, unknown>, envId: string, businessId?: string): Promise<unknown> {
  return bosFetch(`/api/discovery/v1/accounts/${accountId}/pain-points?env_id=${envId}${businessId ? `&business_id=${businessId}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Novendor Consulting OS – Data Studio CRUD
// ---------------------------------------------------------------------------

export function listDataStudioArtifacts(accountId: string, envId: string, businessId?: string): Promise<unknown[]> {
  return bosFetch(`/api/data-studio/v1/accounts/${accountId}/artifacts`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createDataStudioArtifact(body: Record<string, unknown>, envId: string, businessId?: string): Promise<unknown> {
  return bosFetch(`/api/data-studio/v1/artifacts?env_id=${envId}${businessId ? `&business_id=${businessId}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listDataStudioEntities(accountId: string, envId: string, businessId?: string): Promise<unknown[]> {
  return bosFetch(`/api/data-studio/v1/accounts/${accountId}/entities`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createDataStudioEntity(body: Record<string, unknown>, envId: string, businessId?: string): Promise<unknown> {
  return bosFetch(`/api/data-studio/v1/entities?env_id=${envId}${businessId ? `&business_id=${businessId}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listDataStudioEntityMappings(accountId: string, envId: string, businessId?: string): Promise<unknown[]> {
  return bosFetch(`/api/data-studio/v1/accounts/${accountId}/entity-mappings`, {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createDataStudioEntityMapping(body: Record<string, unknown>, envId: string, businessId?: string): Promise<unknown> {
  return bosFetch(`/api/data-studio/v1/entity-mappings?env_id=${envId}${businessId ? `&business_id=${businessId}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPE Asset Leasing Layer
// Powered by re_tenant / re_lease / re_rent_roll_snapshot tables (migration 347).
// ─────────────────────────────────────────────────────────────────────────────

export type ReLeaseSummary = {
  lease_count:            number;
  tenant_count:           number;
  occupied_sf:            number | null;
  total_sf:               number | null;
  physical_occupancy:     number | null;
  walt_years:             number | null;
  in_place_psf:           number | null;
  market_rent_psf:        number | null;
  mark_to_market_pct:     number | null;
  total_annual_base_rent: number | null;
  top_tenant_name:        string | null;
  anchor_pct:             number | null;
  next_expiration:        string | null;
  snapshot_date:          string | null;
};

export type ReLeaseTenant = {
  tenant_id:       string;
  name:            string;
  industry:        string | null;
  is_anchor:       boolean;
  lease_id:        string;
  rentable_sf:     number;
  gla_pct:         number;
  base_rent_psf:   number;
  expiration_date: string;
  lease_type:      string;
  status:          string;
};

export type ReLeaseExpirationBucket = {
  year:         string;
  sf:           number;
  pct_expiring: number;
  lease_count:  number;
};

export type ReRentRollRow = {
  lease_id:           string;
  tenant_name:        string;
  is_anchor:          boolean;
  suite_number:       string | null;
  floor:              number | null;
  rentable_sf:        number;
  lease_type:         string;
  status:             string;
  commencement_date:  string;
  expiration_date:    string;
  base_rent_psf:      number;
  annual_base_rent:   number;
  free_rent_months:   number;
  ti_allowance_psf:   number | null;
  renewal_options:    string | null;
  expansion_option:   boolean;
  termination_option: boolean;
};

export type ReLeaseDocument = {
  doc_id:        string;
  lease_id:      string;
  tenant_name:   string;
  doc_type:      string;
  file_name:     string;
  parser_status: string;
  confidence:    number | null;
  uploaded_at:   string;
};

export type ReLeaseEconomics = {
  in_place_psf:           number | null;
  market_rent_psf:        number | null;
  mark_to_market_pct:     number | null;
  total_annual_base_rent: number | null;
  below_market_leases: Array<{
    tenant_name:  string;
    in_place_psf: number;
    market_psf:   number;
    gap_psf:      number;
    rentable_sf:  number;
    annual_upside: number;
  }>;
};

export function getAssetLeaseSummary(assetId: string): Promise<ReLeaseSummary | null> {
  return directFetch(`/api/re/v2/assets/${assetId}/leasing/summary`);
}

export function getAssetLeaseTenants(assetId: string): Promise<{ tenants: ReLeaseTenant[]; walt: number | null }> {
  return directFetch(`/api/re/v2/assets/${assetId}/leasing/tenants`);
}

export function getAssetLeaseExpiration(assetId: string): Promise<{ buckets: ReLeaseExpirationBucket[]; total_leased_sf: number }> {
  return directFetch(`/api/re/v2/assets/${assetId}/leasing/expiration`);
}

export function getAssetRentRoll(assetId: string, sort?: string): Promise<{ rows: ReRentRollRow[]; total: number }> {
  return directFetch(`/api/re/v2/assets/${assetId}/leasing/rent-roll`, {
    params: sort ? { sort } : undefined,
  });
}

export function getAssetLeaseDocuments(assetId: string): Promise<{ documents: ReLeaseDocument[] }> {
  return directFetch(`/api/re/v2/assets/${assetId}/leasing/documents`);
}

export function getAssetLeaseEconomics(assetId: string): Promise<ReLeaseEconomics> {
  return directFetch(`/api/re/v2/assets/${assetId}/leasing/economics`);
}

// ─── PDS Analytics API ──────────────────────────────────────────────

export function getPdsRevenueTimeSeries(
  envId: string,
  businessId: string,
  options?: { governance_track?: string; version?: string[]; date_from?: string; date_to?: string },
): Promise<{ series: Record<string, unknown>[] }> {
  const params: Record<string, string | undefined> = { env_id: envId, business_id: businessId };
  if (options?.governance_track) params.governance_track = options.governance_track;
  if (options?.date_from) params.date_from = options.date_from;
  if (options?.date_to) params.date_to = options.date_to;
  return bosFetch("/api/pds/v2/revenue/time-series", { params });
}

export function getPdsRevenueVariance(
  envId: string,
  businessId: string,
  comparison?: string,
): Promise<{ comparison: string; base_version: string; compare_version: string; data: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/revenue/variance", { params: { env_id: envId, business_id: businessId, comparison } });
}

export function getPdsRevenuePipeline(envId: string, businessId: string): Promise<{ stages: Record<string, unknown>[]; coverage_ratio: number }> {
  return bosFetch("/api/pds/v2/revenue/pipeline", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsDedicatedPortfolio(envId: string, businessId: string): Promise<{ accounts: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/revenue/portfolio", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsRevenueWaterfall(envId: string, businessId: string): Promise<{ waterfall: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/revenue/waterfall", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsRevenueMix(envId: string, businessId: string): Promise<{ mix: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/revenue/mix", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsUtilizationSummary(envId: string, businessId: string): Promise<{ summary: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/utilization/summary", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsUtilizationHeatmap(envId: string, businessId: string): Promise<{ employees: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/utilization/heatmap", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsUtilizationBench(envId: string, businessId: string): Promise<{ bench: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/utilization/bench", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsNpsSummary(envId: string, businessId: string): Promise<{ data: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/satisfaction/nps-summary", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsSatisfactionDrivers(envId: string, businessId: string): Promise<{ drivers: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/satisfaction/drivers", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsAdoptionOverview(envId: string, businessId: string): Promise<{ tools: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/adoption/overview", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsAdoptionHealthScore(envId: string, businessId: string): Promise<{ accounts: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/adoption/health-score", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsAccountsExecutiveOverview(envId: string, businessId: string): Promise<Record<string, unknown>> {
  return bosFetch("/api/pds/v2/accounts/executive-overview", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsAccountsRegional(envId: string, businessId: string): Promise<{ regions: Record<string, unknown>[] }> {
  return bosFetch("/api/pds/v2/accounts/regional", { params: { env_id: envId, business_id: businessId } });
}

export function getPdsAccount360(envId: string, businessId: string, accountId: string): Promise<Record<string, unknown>> {
  return bosFetch(`/api/pds/v2/accounts/${accountId}/360`, { params: { env_id: envId, business_id: businessId } });
}

export function seedPdsAnalytics(envId: string, businessId?: string): Promise<{ status: string; counts: Record<string, number> }> {
  return bosFetch("/api/pds/v2/seed-analytics", { method: "POST", params: { env_id: envId, business_id: businessId } });
}

// ---------------------------------------------------------------------------
// Document Completion Agent
// ---------------------------------------------------------------------------

export interface DcDocRequirement {
  requirement_id: string;
  doc_type: string;
  display_name: string;
  is_required: boolean;
  status: string;
  notes: string | null;
  uploaded_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  waived_at: string | null;
  created_at: string;
}

export interface DcBorrower {
  borrower_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  mobile: string | null;
  preferred_channel: string;
  timezone: string;
  consent_sms: boolean;
  consent_email: boolean;
  created_at: string;
}

export interface DcMessageEvent {
  message_event_id: string;
  channel: string;
  message_type: string;
  subject: string | null;
  content_snapshot: string;
  external_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface DcUploadEvent {
  upload_event_id: string;
  requirement_id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number | null;
  upload_status: string;
  created_at: string;
}

export interface DcEscalationEvent {
  escalation_event_id: string;
  reason: string;
  priority: string;
  assigned_to: string | null;
  status: string;
  resolution_note: string | null;
  triggered_at: string;
  resolved_at: string | null;
}

export interface DcLoanFile {
  loan_file_id: string;
  env_id: string;
  business_id: string;
  external_application_id: string;
  loan_type: string;
  loan_stage: string;
  status: string;
  assigned_processor_id: string | null;
  followup_count: number;
  max_followups: number;
  opened_at: string;
  completed_at: string | null;
  escalated_at: string | null;
  last_activity_at: string;
  last_outreach_at: string | null;
  created_at: string;
  borrower: DcBorrower | null;
  requirements: DcDocRequirement[];
  messages: DcMessageEvent[];
  uploads: DcUploadEvent[];
  escalations: DcEscalationEvent[];
  total_required: number;
  total_received: number;
  total_missing: number;
}

export interface DcLoanFileListItem {
  loan_file_id: string;
  external_application_id: string;
  borrower_name: string;
  loan_type: string;
  status: string;
  total_required: number;
  total_received: number;
  total_missing: number;
  assigned_processor_id: string | null;
  escalation_status: string | null;
  last_activity_at: string;
  last_outreach_at: string | null;
  opened_at: string;
}

export interface DcDashboardStats {
  total_active: number;
  waiting_on_borrower: number;
  escalated: number;
  completed_today: number;
  avg_completion_hours: number | null;
  total_messages_sent: number;
  borrower_response_rate: number | null;
}

export interface DcPortalDoc {
  requirement_id: string;
  doc_type: string;
  display_name: string;
  status: string;
}

export interface DcPortalFile {
  external_application_id: string;
  loan_type: string;
  lender_name: string;
  borrower_first_name: string;
  requirements: DcPortalDoc[];
}

export interface DcAuditLogEntry {
  audit_log_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

// ── Doc Completion API Functions ──

export function listDocCompletionFiles(envId: string, businessId?: string, status?: string): Promise<DcLoanFileListItem[]> {
  return bosFetch("/api/doc-completion/v1/files", { params: { env_id: envId, business_id: businessId, status } });
}

export function getDocCompletionFile(envId: string, fileId: string, businessId?: string): Promise<DcLoanFile> {
  return bosFetch(`/api/doc-completion/v1/files/${fileId}`, { params: { env_id: envId, business_id: businessId } });
}

export function createDocCompletionApplication(envId: string, body: Record<string, unknown>, businessId?: string): Promise<Record<string, unknown>> {
  return bosFetch("/api/doc-completion/v1/applications", {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify({ ...body, env_id: envId, business_id: businessId }),
  });
}

export function getDocCompletionStats(envId: string, businessId?: string): Promise<DcDashboardStats> {
  return bosFetch("/api/doc-completion/v1/dashboard/stats", { params: { env_id: envId, business_id: businessId } });
}

export function sendDocCompletionOutreach(envId: string, fileId: string, body?: { channel?: string; message?: string; sent_by?: string }, businessId?: string): Promise<Record<string, unknown>[]> {
  return bosFetch(`/api/doc-completion/v1/files/${fileId}/outreach`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body || {}),
  });
}

export function acceptDocRequirement(envId: string, fileId: string, reqId: string, businessId?: string): Promise<Record<string, unknown>> {
  return bosFetch(`/api/doc-completion/v1/files/${fileId}/docs/${reqId}/accept`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
  });
}

export function rejectDocRequirement(envId: string, fileId: string, reqId: string, notes?: string, businessId?: string): Promise<Record<string, unknown>> {
  return bosFetch(`/api/doc-completion/v1/files/${fileId}/docs/${reqId}/reject`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId, notes },
  });
}

export function waiveDocRequirement(envId: string, fileId: string, reqId: string, businessId?: string): Promise<Record<string, unknown>> {
  return bosFetch(`/api/doc-completion/v1/files/${fileId}/docs/${reqId}/waive`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
  });
}

export function resolveDocEscalation(envId: string, fileId: string, escId: string, body: { resolution_note?: string; status?: string }, businessId?: string): Promise<Record<string, unknown>> {
  return bosFetch(`/api/doc-completion/v1/files/${fileId}/escalations/${escId}/resolve`, {
    method: "POST",
    params: { env_id: envId, business_id: businessId },
    body: JSON.stringify(body),
  });
}

export function getDocCompletionAuditLog(envId: string, fileId: string, businessId?: string): Promise<DcAuditLogEntry[]> {
  return bosFetch(`/api/doc-completion/v1/files/${fileId}/audit`, { params: { env_id: envId, business_id: businessId } });
}

export function getDocCompletionPortal(token: string): Promise<DcPortalFile> {
  return bosFetch(`/api/doc-completion/v1/portal/${token}`, {});
}

export function uploadDocCompletionPortal(token: string, formData: FormData): Promise<Record<string, unknown>> {
  return bosFetch(`/api/doc-completion/v1/portal/${token}/upload`, {
    method: "POST",
    body: formData,
  });
}

/* ─── Portfolio Overview: Capital Activity + Asset Map ──────────────── */

export interface CapitalActivitySummary {
  total_contributed: string;
  total_distributed: string;
  net_capital_movement: string;
}

export interface CapitalActivityPeriod {
  period: string;
  contributions: number;
  distributions: number;
}

export interface CapitalActivityResponse {
  summary: CapitalActivitySummary;
  series: CapitalActivityPeriod[];
}

export function getCapitalActivity(params: {
  env_id?: string;
  business_id?: string;
  horizon?: "12m" | "24m" | "all";
  grain?: "monthly" | "quarterly";
  fund_id?: string;
}): Promise<CapitalActivityResponse> {
  return bosFetch("/api/re/v2/funds/capital-activity", { params });
}

export interface AssetMapPoint {
  asset_id: string;
  deal_id: string;
  name: string;
  status: "owned" | "pipeline" | "disposed";
  fund_name: string;
  property_type: string | null;
  market: string | null;
  city: string | null;
  state: string | null;
  lat: string;
  lon: string;
  cost_basis: string | null;
  current_noi?: string | null;
  occupancy?: string | null;
  sale_date?: string | null;
  net_sale_proceeds?: string | null;
  gross_sale_price?: string | null;
}

export interface AssetMapSummary {
  owned_assets: number;
  pipeline_assets: number;
  disposed_assets: number;
  markets: number;
}

export interface AssetMapResponse {
  summary: AssetMapSummary;
  points: AssetMapPoint[];
}

export function getAssetMapPoints(params: {
  env_id?: string;
  business_id?: string;
  fund_id?: string;
  status?: "owned" | "pipeline" | "disposed" | "all";
}): Promise<AssetMapResponse> {
  return bosFetch("/api/re/v2/funds/asset-map", { params });
}


// ── Capital Projects API ──────────────────────────────────────────

import type {
  CpPortfolioSummary,
  CpProjectDashboard,
  CpDailyLog,
  CpMeeting,
  CpDrawing,
  CpPayApp,
  CpBudgetSummary,
  CpChangeOrder,
  CpContract,
  CpRisk,
  CpRfi,
  CpSubmittal,
  CpPunchItem,
  CpScheduleSnapshot,
} from "@/types/capital-projects";

function _cpParams(envId?: string, businessId?: string): Record<string, string | undefined> {
  return { env_id: envId, business_id: businessId };
}

export function getCpPortfolio(envId?: string, businessId?: string): Promise<CpPortfolioSummary> {
  return bosFetch("/api/capital-projects/v1/portfolio", { params: _cpParams(envId, businessId) });
}

export function listCpProjects(envId?: string, businessId?: string): Promise<Record<string, unknown>[]> {
  return bosFetch("/api/capital-projects/v1/projects", { params: _cpParams(envId, businessId) });
}

export function getCpProjectDashboard(projectId: string, envId?: string, businessId?: string): Promise<CpProjectDashboard> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/dashboard`, { params: _cpParams(envId, businessId) });
}

export function getCpProjectBudget(projectId: string, envId?: string, businessId?: string): Promise<CpBudgetSummary> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/budget`, { params: _cpParams(envId, businessId) });
}

export function listCpCommitments(projectId: string, envId?: string, businessId?: string): Promise<CpContract[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/commitments`, { params: _cpParams(envId, businessId) });
}

export function listCpChangeOrders(projectId: string, envId?: string, businessId?: string): Promise<CpChangeOrder[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/change-orders`, { params: _cpParams(envId, businessId) });
}

export function listCpMilestones(projectId: string, envId?: string, businessId?: string): Promise<CpScheduleSnapshot[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/milestones`, { params: _cpParams(envId, businessId) });
}

export function listCpRisks(projectId: string, envId?: string, businessId?: string): Promise<CpRisk[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/risks`, { params: _cpParams(envId, businessId) });
}

export function listCpRfis(projectId: string, envId?: string, businessId?: string): Promise<CpRfi[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/rfis`, { params: _cpParams(envId, businessId) });
}

export function listCpSubmittals(projectId: string, envId?: string, businessId?: string): Promise<CpSubmittal[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/submittals`, { params: _cpParams(envId, businessId) });
}

export function listCpPunchItems(projectId: string, envId?: string, businessId?: string): Promise<CpPunchItem[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/punch-items`, { params: _cpParams(envId, businessId) });
}

export function listCpDailyLogs(projectId: string, envId?: string, businessId?: string): Promise<CpDailyLog[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/daily-logs`, { params: _cpParams(envId, businessId) });
}

export function listCpMeetings(projectId: string, envId?: string, businessId?: string): Promise<CpMeeting[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/meetings`, { params: _cpParams(envId, businessId) });
}

export function listCpDrawings(projectId: string, envId?: string, businessId?: string): Promise<CpDrawing[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/drawings`, { params: _cpParams(envId, businessId) });
}

export function listCpPayApps(projectId: string, envId?: string, businessId?: string): Promise<CpPayApp[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/pay-apps`, { params: _cpParams(envId, businessId) });
}

export function approveCpPayApp(projectId: string, payAppId: string, envId?: string, businessId?: string): Promise<CpPayApp> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/pay-apps/${payAppId}/approve`, { method: "POST", params: _cpParams(envId, businessId) });
}

export function getCpPayAppVarianceAnalysis(projectId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").VarianceAnalysis> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/pay-apps/variance-analysis`, { params: _cpParams(envId, businessId) });
}

// ── Draw Management ─────────────────────────────────────────────

export function createCpDraw(projectId: string, body: { title?: string; billing_period_start?: string; billing_period_end?: string }, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws`, { method: "POST", body: JSON.stringify(body), params: _cpParams(envId, businessId) });
}

export function listCpDraws(projectId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws`, { params: _cpParams(envId, businessId) });
}

export function getCpDraw(projectId: string, drawId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws/${drawId}`, { params: _cpParams(envId, businessId) });
}

export function updateCpDrawLineItems(projectId: string, drawId: string, items: Array<{ line_item_id: string; current_draw: string; materials_stored: string; override_reason?: string }>, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws/${drawId}/line-items`, { method: "PUT", body: JSON.stringify({ items }), params: _cpParams(envId, businessId) });
}

export function submitCpDraw(projectId: string, drawId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws/${drawId}/submit`, { method: "POST", params: _cpParams(envId, businessId) });
}

export function approveCpDraw(projectId: string, drawId: string, actor: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws/${drawId}/approve`, { method: "POST", body: JSON.stringify({ actor }), params: _cpParams(envId, businessId) });
}

export function rejectCpDraw(projectId: string, drawId: string, actor: string, rejection_reason: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws/${drawId}/reject`, { method: "POST", body: JSON.stringify({ actor, rejection_reason }), params: _cpParams(envId, businessId) });
}

export function requestCpDrawRevision(projectId: string, drawId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws/${drawId}/request-revision`, { method: "POST", params: _cpParams(envId, businessId) });
}

export function submitCpDrawToLender(projectId: string, drawId: string, actor: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws/${drawId}/submit-to-lender`, { method: "POST", body: JSON.stringify({ actor }), params: _cpParams(envId, businessId) });
}

export function markCpDrawFunded(projectId: string, drawId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawRequest> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draws/${drawId}/mark-funded`, { method: "POST", params: _cpParams(envId, businessId) });
}

export async function generateCpG702(projectId: string, drawId: string, envId?: string, businessId?: string): Promise<Blob> {
  const params = _cpParams(envId, businessId);
  const qs = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
  const url = `${_bosConfig.origin}${_bosConfig.proxyPrefix}/api/capital-projects/v1/projects/${projectId}/draws/${drawId}/generate-g702${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error(`G702 generation failed: ${res.status}`);
  return res.blob();
}

export function uploadCpInvoice(projectId: string, file: File, drawRequestId?: string, envId?: string, businessId?: string): Promise<{ invoice: import("@/types/capital-projects").CpInvoice; ocr: Record<string, unknown>; match_result: Record<string, unknown> | null }> {
  const formData = new FormData();
  formData.append("file", file);
  if (envId) formData.append("env_id", envId);
  if (businessId) formData.append("business_id", businessId);
  if (drawRequestId) formData.append("draw_request_id", drawRequestId);
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/invoices/upload`, { method: "POST", body: formData });
}

export function listCpInvoices(projectId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpInvoice[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/invoices`, { params: _cpParams(envId, businessId) });
}

export function getCpInvoice(invoiceId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpInvoice> {
  return bosFetch(`/api/capital-projects/v1/invoices/${invoiceId}`, { params: _cpParams(envId, businessId) });
}

export function overrideCpInvoiceMatch(invoiceId: string, body: { invoice_line_id: string; draw_line_item_id: string; actor?: string }, envId?: string, businessId?: string): Promise<unknown> {
  return bosFetch(`/api/capital-projects/v1/invoices/${invoiceId}/match-override`, { method: "POST", body: JSON.stringify(body), params: _cpParams(envId, businessId) });
}

export function assignCpInvoiceToDraw(invoiceId: string, drawRequestId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpInvoice> {
  return bosFetch(`/api/capital-projects/v1/invoices/${invoiceId}/assign-to-draw`, { method: "POST", body: JSON.stringify({ draw_request_id: drawRequestId }), params: _cpParams(envId, businessId) });
}

export function createCpInspection(projectId: string, body: { inspector_name: string; inspection_date: string; inspection_type?: string; draw_request_id?: string; overall_pct_complete?: number; findings?: string; passed?: boolean }, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpInspection> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/inspections`, { method: "POST", body: JSON.stringify(body), params: _cpParams(envId, businessId) });
}

export function listCpInspections(projectId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpInspection[]> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/inspections`, { params: _cpParams(envId, businessId) });
}

export function getCpDrawPortfolioSummary(envId?: string, businessId?: string): Promise<import("@/types/capital-projects").DrawPortfolioSummary> {
  return bosFetch(`/api/capital-projects/v1/draw-portfolio-summary`, { params: _cpParams(envId, businessId) });
}

export function getCpBudgetVsActual(projectId: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").BudgetVsActual> {
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/budget-vs-actual`, { params: _cpParams(envId, businessId) });
}

export function getCpDrawAudit(projectId: string, drawRequestId?: string, envId?: string, businessId?: string): Promise<import("@/types/capital-projects").CpDrawAuditEntry[]> {
  const params = { ..._cpParams(envId, businessId), ...(drawRequestId ? { draw_request_id: drawRequestId } : {}) };
  return bosFetch(`/api/capital-projects/v1/projects/${projectId}/draw-audit`, { params });
}

// ── Development Bridge API ──────────────────────────────────────

export interface DevPortfolioKpis {
  total_development_budget: string;
  total_committed: string;
  total_spent: string;
  total_forecast: string;
  contingency_remaining_pct: string;
  contingency_remaining_abs: string;
  projects_on_track: number;
  projects_at_risk: number;
  projects_delayed: number;
  avg_yield_on_cost: string;
  avg_projected_irr: string;
}

export interface DevProjectRow {
  link_id: string;
  project_name: string;
  asset_name: string;
  property_type: string | null;
  market: string | null;
  link_type: string;
  status: string;
  stage: string;
  total_development_cost: string;
  percent_complete: string;
  health: string;
  projected_irr: string;
  yield_on_cost: string;
  projected_moic: string;
}

export interface DevSpendTrend {
  month: string;
  total_drawn: string;
}

export interface DevPortfolioResponse {
  kpis: DevPortfolioKpis;
  projects: DevProjectRow[];
  spend_trend: DevSpendTrend[];
}

export interface DevAssumptionSet {
  assumption_set_id: string;
  link_id: string;
  scenario_label: string;
  is_base: boolean;
  hard_cost: string | null;
  soft_cost: string | null;
  contingency: string | null;
  financing_cost: string | null;
  total_development_cost: string | null;
  construction_start: string | null;
  construction_end: string | null;
  lease_up_start: string | null;
  lease_up_months: number | null;
  stabilization_date: string | null;
  stabilized_occupancy: string | null;
  stabilized_noi: string | null;
  exit_cap_rate: string | null;
  construction_loan_amt: string | null;
  construction_loan_rate: string | null;
  perm_loan_amt: string | null;
  perm_loan_rate: string | null;
  yield_on_cost: string | null;
  stabilized_value: string | null;
  projected_irr: string | null;
  projected_moic: string | null;
}

export interface DevProjectDetailResponse {
  link_id: string;
  pds_execution: {
    project_name: string;
    project_type: string | null;
    stage: string;
    market: string | null;
    budget: string;
    percent_complete: string;
    start_date: string | null;
    planned_end_date: string | null;
    fee_type: string | null;
    fee_percentage: string | null;
  };
  assumptions: DevAssumptionSet[];
  fund_impact: Record<string, unknown>;
  asset: {
    asset_id: string;
    name: string | null;
    property_type: string | null;
    market: string | null;
    units: number | null;
    noi_annual: string | null;
    occupancy_rate: string | null;
  };
}

export interface DevScenarioComparisonResponse {
  scenarios: DevAssumptionSet[];
  deltas: Record<string, string>[];
}

export interface DevFundImpactResponse {
  fund_id: string;
  fund_name: string | null;
  asset_name: string | null;
  fund_nav?: string;
  fund_gross_irr?: string;
  fund_net_irr?: string;
  fund_tvpi?: string;
  fund_dpi?: string;
  scenarios: (DevAssumptionSet & { nav_contribution_pct?: string })[];
  data_status?: string;
}

function _devParams(envId?: string, businessId?: string): Record<string, string> {
  const p: Record<string, string> = {};
  if (envId) p.env_id = envId;
  if (businessId) p.business_id = businessId;
  return p;
}

export function getDevPortfolio(envId: string, businessId?: string): Promise<DevPortfolioResponse> {
  return bosFetch("/api/dev/v1/portfolio", { params: _devParams(envId, businessId) });
}

export function getDevProjectDetail(linkId: string, envId: string): Promise<DevProjectDetailResponse> {
  return bosFetch(`/api/dev/v1/projects/${linkId}`, { params: { env_id: envId } });
}

export function getDevAssumptions(linkId: string): Promise<DevAssumptionSet[]> {
  return bosFetch(`/api/dev/v1/projects/${linkId}/assumptions`);
}

export function updateDevAssumptions(
  linkId: string,
  assumptionSetId: string,
  body: Partial<DevAssumptionSet>,
): Promise<DevAssumptionSet> {
  return bosFetch(`/api/dev/v1/projects/${linkId}/assumptions/${assumptionSetId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function getDevScenarioImpact(linkId: string): Promise<DevScenarioComparisonResponse> {
  return bosFetch(`/api/dev/v1/projects/${linkId}/scenario-impact`);
}

export function getDevFundImpact(linkId: string): Promise<DevFundImpactResponse> {
  return bosFetch(`/api/dev/v1/projects/${linkId}/fund-impact`);
}

export function getDevDraws(linkId: string, scenarioLabel?: string): Promise<Record<string, unknown>[]> {
  const params: Record<string, string> = {};
  if (scenarioLabel) params.scenario_label = scenarioLabel;
  return bosFetch(`/api/dev/v1/projects/${linkId}/draws`, { params });
}

export function seedDevBridge(envId: string, businessId?: string): Promise<{ status: string; counts: Record<string, number> }> {
  return bosFetch("/api/dev/v1/seed", { method: "POST", params: _devParams(envId, businessId) });
}


function _tradeParams(businessId: string, envId?: string, extras: Record<string, string | undefined> = {}): Record<string, string> {
  const params: Record<string, string> = { business_id: businessId };
  if (envId) params.env_id = envId;
  Object.entries(extras).forEach(([key, value]) => {
    if (value) params[key] = value;
  });
  return params;
}

export function getTradeIntents(businessId: string, options: { status?: string; envId?: string } = {}): Promise<TradeIntent[]> {
  return bosFetch("/api/trades/intents", { params: _tradeParams(businessId, options.envId, { status: options.status }) });
}

export function getTradeIntent(tradeIntentId: string, businessId: string): Promise<TradeIntent> {
  return bosFetch(`/api/trades/intents/${tradeIntentId}`, { params: _tradeParams(businessId) });
}

export function runTradeRiskCheck(tradeIntentId: string, businessId: string): Promise<TradeRiskCheck> {
  return bosFetch(`/api/trades/intents/${tradeIntentId}/risk-check`, {
    method: "POST",
    body: JSON.stringify({ business_id: businessId }),
  });
}

export function approveTradeIntent(tradeIntentId: string, body: { business_id: string; approved_by: string; approval_notes?: string }): Promise<TradeIntent> {
  return bosFetch(`/api/trades/intents/${tradeIntentId}/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitTradeIntent(
  tradeIntentId: string,
  body: {
    business_id: string;
    actor: string;
    tif?: string;
    broker?: string;
    broker_account_mode?: "paper" | "live";
    quantity?: number;
    limit_price?: number;
    stop_price?: number;
  },
): Promise<ExecutionOrder> {
  return bosFetch(`/api/trades/intents/${tradeIntentId}/submit`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getTradeOrders(businessId: string, status?: string): Promise<ExecutionOrder[]> {
  return bosFetch("/api/trades/orders", { params: _tradeParams(businessId, undefined, { status }) });
}

export function getTradeOrder(executionOrderId: string, businessId: string): Promise<ExecutionOrder> {
  return bosFetch(`/api/trades/orders/${executionOrderId}`, { params: _tradeParams(businessId) });
}

export function cancelTradeOrder(executionOrderId: string, body: { business_id: string; actor: string }): Promise<ExecutionOrder> {
  return bosFetch(`/api/trades/orders/${executionOrderId}/cancel`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getTradePositions(businessId: string, accountMode?: string): Promise<PortfolioPosition[]> {
  return bosFetch("/api/trades/positions", { params: _tradeParams(businessId, undefined, { account_mode: accountMode }) });
}

export function getTradeAccountSummary(businessId: string): Promise<AccountSummary> {
  return bosFetch("/api/trades/account-summary", { params: _tradeParams(businessId) });
}

export function getTradeControlState(businessId: string): Promise<ExecutionControlState> {
  return bosFetch("/api/trades/control-state", { params: _tradeParams(businessId) });
}

export function setTradeKillSwitch(body: { business_id: string; activate: boolean; reason: string; changed_by: string }): Promise<ExecutionControlState> {
  return bosFetch("/api/trades/kill-switch", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setTradeMode(body: {
  business_id: string;
  target_mode: "paper" | "live_disabled" | "live_enabled";
  changed_by: string;
  reason?: string;
  confirmation_phrase?: string;
}): Promise<ExecutionControlState> {
  return bosFetch("/api/trades/mode", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createPostTradeReview(body: {
  business_id: string;
  trade_intent_id: string;
  env_id?: string;
  thesis_quality_score?: number;
  timing_quality_score?: number;
  sizing_quality_score?: number;
  execution_quality_score?: number;
  discipline_score?: number;
  trap_realized_flag?: boolean;
  notes?: string;
}): Promise<PostTradeReview> {
  return bosFetch("/api/trades/reviews", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getPostTradeReviews(businessId: string, tradeIntentId?: string): Promise<PostTradeReview[]> {
  return bosFetch("/api/trades/reviews", { params: _tradeParams(businessId, undefined, { trade_intent_id: tradeIntentId }) });
}

export function getTradePromotionChecklist(businessId: string): Promise<PromotionChecklist> {
  return bosFetch("/api/trades/promotion-checklist", { params: _tradeParams(businessId) });
}

export function getTradeAlerts(businessId: string): Promise<ExecutionEvent[]> {
  return bosFetch("/api/trades/alerts", { params: _tradeParams(businessId) });
}
