/**
 * Business OS API client.
 *
 * In production, all calls are routed through the same-origin Next.js proxy
 * at /bos/[...path]/route.ts (e.g. /bos/api/repe/context) to avoid CORS
 * issues and the need for NEXT_PUBLIC_BOS_API_BASE_URL to be set.
 *
 * In development (localhost), calls go directly to the FastAPI backend
 * at http://localhost:8000 for simpler debugging.
 */
import { logError, logInfo } from "@/lib/logging/logger";

/**
 * Resolve the BOS API base origin and whether to use the /bos proxy prefix.
 *
 * In production (non-localhost), we route through the same-origin Next.js
 * proxy at /bos/[...path] to avoid CORS and env var misconfiguration.
 * In development (localhost), we call the backend directly.
 */
const _bosConfig = (() => {
  const configured =
    process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "";

  if (typeof window !== "undefined") {
    const isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (isLocalHost) {
      return { origin: configured || "http://localhost:8000", proxyPrefix: "" };
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

async function bosFetch<T>(path: string, options: RequestInit & { params?: Record<string, string | undefined> } = {}): Promise<T> {
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

  const reqHeaders: HeadersInit = {
    "Content-Type": "application/json",
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
    logError("api.request_error", "API request failed", {
      path,
      method: options.method || "GET",
      request_id: requestId,
      run_id: runId,
      status: res.status,
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

export interface PdsProject {
  project_id: string;
  env_id: string;
  business_id: string;
  program_id: string | null;
  name: string;
  stage: string;
  project_manager: string | null;
  approved_budget: string;
  committed_amount: string;
  spent_amount: string;
  forecast_at_completion: string;
  contingency_budget: string;
  contingency_remaining: string;
  pending_change_order_amount: string;
  next_milestone_date: string | null;
  risk_score: string;
  currency_code: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PdsPortfolioKpis {
  env_id: string;
  business_id: string;
  period: string;
  approved_budget: string;
  committed: string;
  spent: string;
  eac: string;
  variance: string;
  contingency_remaining: string;
  open_change_order_count: number;
  pending_approval_count: number;
  top_risk_count: number;
}

export interface PdsSnapshotRun {
  run_id: string;
  env_id: string;
  business_id: string;
  period: string;
  project_id: string | null;
  snapshot_hash: string;
  portfolio_snapshot_id: string;
  schedule_snapshot_id: string;
  risk_snapshot_id: string;
  vendor_snapshot_ids: string[];
}

export interface PdsReportPackRun {
  report_run_id: string;
  env_id: string;
  business_id: string;
  period: string;
  run_id: string;
  snapshot_hash: string | null;
  narrative_text: string | null;
  artifact_refs_json: Array<Record<string, unknown>>;
  deterministic_deltas_json: Record<string, unknown>;
  created_at: string;
}

export function getPdsContext(envId: string, businessId?: string): Promise<DomainContext> {
  return bosFetch("/api/pds/v1/context", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listPdsProjects(envId: string, businessId?: string): Promise<PdsProject[]> {
  return bosFetch("/api/pds/v1/projects", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function createPdsProject(body: {
  env_id: string;
  business_id?: string;
  name: string;
  stage?: string;
  project_manager?: string;
  approved_budget?: string | number;
  contingency_budget?: string | number;
  currency_code?: string;
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
  created_at: string;
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
  return bosFetch("/api/re/v1/funds", {
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
  return bosFetch(`/api/repe/funds/${fundId}`);
}

export function listRepeDeals(fundId: string): Promise<RepeDeal[]> {
  return bosFetch(`/api/repe/funds/${fundId}/deals`);
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
  return bosFetch(`/api/repe/deals/${dealId}/assets`);
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
  return bosFetch(`/api/re/v2/funds/${fundId}/investments`);
}

export function getReV2Investment(investmentId: string): Promise<ReV2Investment> {
  return bosFetch(`/api/re/v2/investments/${investmentId}`);
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

// JVs
export function listReV2Jvs(investmentId: string): Promise<ReV2Jv[]> {
  return bosFetch(`/api/re/v2/investments/${investmentId}/jvs`);
}

export function getReV2Jv(jvId: string): Promise<ReV2Jv> {
  return bosFetch(`/api/re/v2/jvs/${jvId}`);
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

export function listReV2JvAssets(jvId: string): Promise<RepeAsset[]> {
  return bosFetch(`/api/re/v2/jvs/${jvId}/assets`);
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
  return bosFetch(`/api/re/v2/funds/${fundId}/quarter-state/${quarter}`, { params: { scenario_id: scenarioId } });
}

export function getReV2InvestmentQuarterState(investmentId: string, quarter: string): Promise<ReV2InvestmentQuarterState> {
  return bosFetch(`/api/re/v2/investments/${investmentId}/quarter-state/${quarter}`);
}

export function getReV2JvQuarterState(jvId: string, quarter: string): Promise<ReV2JvQuarterState> {
  return bosFetch(`/api/re/v2/jvs/${jvId}/quarter-state/${quarter}`);
}

// Metrics
export function getReV2FundMetrics(fundId: string, quarter: string): Promise<ReV2FundMetrics> {
  return bosFetch(`/api/re/v2/funds/${fundId}/metrics/${quarter}`);
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
  return bosFetch(`/api/re/v2/funds/${fundId}/scenarios`);
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
  return bosFetch(`/api/re/v2/funds/${fundId}/runs`, { params: { quarter } });
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
  inputs_hash: string;
  created_at: string;
};

export type ReV2InvestmentQuarterState = {
  id: string;
  investment_id: string;
  quarter: string;
  nav?: number;
  committed_capital?: number;
  invested_capital?: number;
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
  name: string;
  description?: string;
  scenario_type: string;
  is_base: boolean;
  parent_scenario_id?: string;
  status: string;
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
