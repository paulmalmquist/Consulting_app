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
import type {
  PdsBudgetLine,
  PdsBudgetSummary,
  PdsChangeOrder,
  PdsDocument,
  PdsPortfolioDashboard,
  PdsPortfolioKpis,
  PdsProject,
  PdsProjectOverview,
  PdsReportPackRun,
  PdsRfi,
  PdsScheduleItem,
  PdsSiteReport,
  PdsSnapshotRun,
  PdsSubmittal,
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

export type {
  PdsBudgetLine,
  PdsBudgetSummary,
  PdsChangeOrder,
  PdsDocument,
  PdsPortfolioDashboard,
  PdsPortfolioKpis,
  PdsProject,
  PdsProjectOverview,
  PdsReportPackRun,
  PdsRfi,
  PdsScheduleItem,
  PdsSiteReport,
  PdsSnapshotRun,
  PdsSubmittal,
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
export function getReV2FundQuarterState(fundId: string, quarter: string, scenarioId?: string): Promise<ReV2FundQuarterState> {
  return directFetch(`/api/re/v2/funds/${fundId}/quarter-state/${quarter}`, { params: { scenario_id: scenarioId } });
}

export function getReV2InvestmentQuarterState(investmentId: string, quarter: string): Promise<ReV2InvestmentQuarterState> {
  return directFetch(`/api/re/v2/investments/${investmentId}/quarter-state/${quarter}`);
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
  scenarioId?: string
): Promise<ReV2InvestmentAsset[]> {
  return directFetch(`/api/re/v2/investments/${investmentId}/assets/${quarter}`, {
    params: { scenario_id: scenarioId },
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
  scenarioId?: string
): Promise<ReV2EntityLineageResponse> {
  return directFetch(`/api/re/v2/investments/${investmentId}/lineage/${quarter}`, {
    params: { scenario_id: scenarioId },
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
  committed_capital?: number;
  invested_capital?: number;
  realized_distributions?: number;
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
  run_id?: string;
  nav?: number;
  committed_capital?: number;
  invested_capital?: number;
  realized_distributions?: number;
  unrealized_value?: number;
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
  property_type?: string;
  quarter_state_id?: string;
  run_id?: string;
  noi?: number;
  net_cash_flow?: number;
  debt_balance?: number;
  asset_value?: number;
  nav?: number;
  inputs_hash?: string;
  created_at?: string;
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
  fund_id: string;
  name: string;
  description?: string;
  status: string;
  created_by?: string;
  approved_at?: string;
  approved_by?: string;
  created_at: string;
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
  top_cards: Record<string, unknown>;
  audit_timestamp?: string | null;
  open_issues: number;
  context: Record<string, unknown>;
};

export type SusPortfolioFootprintResponse = {
  scope: "fund" | "investment";
  summary: Record<string, unknown>;
  investment_rows: Array<Record<string, unknown>>;
  asset_rows: Array<Record<string, unknown>>;
  issues: Array<Record<string, unknown>>;
};

export type SusAssetDashboardResponse = {
  asset_id: string;
  not_applicable: boolean;
  reason?: string | null;
  cards: Record<string, unknown>;
  trends: Record<string, unknown>;
  utility_rows: Array<Record<string, unknown>>;
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
  asset_rows: Array<Record<string, unknown>>;
  investment_rows: Array<Record<string, unknown>>;
  fund_rows: Array<Record<string, unknown>>;
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

export function computeScenarioMetrics(
  fundId: string,
  body: {
    scenario_id: string;
    quarter: string;
    env_id: string;
    business_id: string;
  },
): Promise<ScenarioComputeResult> {
  return bosFetch(`/api/re/v2/funds/${fundId}/scenario-compute`, {
    method: "POST",
    body: JSON.stringify(body),
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

export function getCapitalSnapshots(params: {
  fund_id: string;
  quarter: string;
}): Promise<CapitalAccountSnapshot[]> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/capital-snapshots`, {
    params: { quarter: params.quarter },
  });
}

export function computeCapitalSnapshots(
  fundId: string,
  quarter: string,
): Promise<CapitalAccountSnapshot[]> {
  return bosFetch(`/api/re/v2/funds/${fundId}/capital-snapshots/compute`, {
    method: "POST",
    body: JSON.stringify({ quarter }),
  });
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

export function runWaterfallScenario(params: {
  fund_id: string;
  env_id: string;
  business_id: string;
  scenario_id: string;
  quarter: string;
  mode?: string;
}): Promise<WaterfallScenarioRunResult> {
  return bosFetch(`/api/re/v2/funds/${params.fund_id}/waterfall-scenarios/run`, {
    method: "POST",
    body: JSON.stringify({
      env_id: params.env_id,
      business_id: params.business_id,
      scenario_id: params.scenario_id,
      as_of_quarter: params.quarter,
      mode: params.mode || "shadow",
    }),
  });
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
