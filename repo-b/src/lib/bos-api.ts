/**
 * Business OS API client.
 * All calls go to the Python FastAPI backend.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000";

async function bosFetch<T>(path: string, options: RequestInit & { params?: Record<string, string | undefined> } = {}): Promise<T> {
  const url = new URL(path, API_BASE);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); msg = j.detail || j.message || msg; } catch {}
    throw new Error(msg);
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
}): Promise<{ ok: boolean }> {
  return bosFetch("/api/documents/complete-upload", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listDocuments(businessId: string, departmentId?: string): Promise<DocumentItem[]> {
  return bosFetch("/api/documents", {
    params: { business_id: businessId, department_id: departmentId },
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
  department_id: string;
  capability_id: string;
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

// ── SHA-256 helper (client-side, Web Crypto) ─────────────────────────

export async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Ingestion ────────────────────────────────────────────────────────

export interface IngestSource {
  id: string;
  business_id: string | null;
  env_id: string | null;
  name: string;
  description: string | null;
  document_id: string;
  file_type: "csv" | "xlsx";
  status: "draft" | "active" | "archived";
  created_at: string;
  updated_at: string;
  latest_version_num: number | null;
  latest_document_version_id: string | null;
}

export interface IngestProfileColumn {
  name: string;
  inferred_type: string;
  nonnull_count: number;
  distinct_count: number;
  sample_values: string[];
}

export interface IngestProfileSheet {
  sheet_name: string;
  header_row_index: number;
  total_rows: number;
  columns: IngestProfileColumn[];
  sample_rows: Record<string, unknown>[];
  key_candidates: Array<{
    column: string;
    uniqueness_ratio: number;
    completeness_ratio: number;
  }>;
  detected_delimiter?: string | null;
}

export interface IngestProfile {
  source_id: string;
  source_version_id: string;
  file_type: "csv" | "xlsx";
  version_num: number;
  sheets: IngestProfileSheet[];
  detected_tables: Array<{
    sheet_name: string;
    row_count: number;
    column_count: number;
  }>;
}

export interface IngestRecipe {
  id: string;
  ingest_source_id: string;
  target_table_key: string;
  mode: "append" | "upsert" | "replace";
  primary_key_fields: string[];
  settings_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  mappings: Array<{
    id: string;
    ingest_recipe_id: string;
    source_column: string;
    target_column: string;
    transform_json: Record<string, unknown>;
    required: boolean;
    mapping_order: number;
  }>;
  transform_steps: Array<{
    id: string;
    ingest_recipe_id: string;
    step_order: number;
    step_type: string;
    config_json: Record<string, unknown>;
  }>;
}

export interface IngestValidationResult {
  run_hash: string;
  rows_read: number;
  rows_valid: number;
  rows_rejected: number;
  preview_rows: Record<string, unknown>[];
  errors: Array<{
    row_number: number | null;
    column_name: string | null;
    error_code: string;
    message: string;
    raw_value: string | null;
  }>;
  lineage: Record<string, unknown>;
}

export interface IngestRun {
  id: string;
  ingest_recipe_id: string;
  source_version_id: string;
  run_hash: string;
  engine_version: string;
  status: "started" | "completed" | "failed";
  rows_read: number;
  rows_valid: number;
  rows_inserted: number;
  rows_updated: number;
  rows_rejected: number;
  started_at: string;
  completed_at: string | null;
  error_summary: string | null;
  lineage_json: Record<string, unknown>;
  errors: Array<{
    row_number: number | null;
    column_name: string | null;
    error_code: string;
    message: string;
    raw_value: string | null;
  }>;
}

export interface IngestTable {
  table_key: string;
  name: string;
  kind: "canonical" | "custom";
  business_id: string | null;
  env_id: string | null;
  row_count: number;
  columns: string[];
  last_updated_at: string | null;
}

export interface IngestTarget {
  key: string;
  label: string;
  columns: Array<{ name: string; type: string; required: boolean }>;
  is_canonical: boolean;
}

export interface MetricDataPointRegistryItem {
  id: string;
  business_id: string | null;
  env_id: string | null;
  data_point_key: string;
  source_table_key: string;
  aggregation: string;
  value_column: string | null;
  last_updated_at: string | null;
  row_count: number;
  columns_json: string[];
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MetricSuggestion {
  data_point_key: string;
  source_table_key: string;
  aggregation: string;
  value_column: string | null;
  rationale: string;
}

export function listIngestTargets(): Promise<IngestTarget[]> {
  return bosFetch("/api/ingest/targets");
}

export function createIngestSource(body: {
  business_id?: string | null;
  env_id?: string | null;
  name: string;
  description?: string | null;
  document_id: string;
  document_version_id?: string | null;
  file_type?: "csv" | "xlsx";
  uploaded_by?: string;
}): Promise<IngestSource> {
  return bosFetch("/api/ingest/sources", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listIngestSources(params?: {
  business_id?: string;
  env_id?: string;
}): Promise<IngestSource[]> {
  return bosFetch("/api/ingest/sources", {
    params: {
      business_id: params?.business_id,
      env_id: params?.env_id,
    },
  });
}

export function getIngestSourceProfile(sourceId: string, version?: number): Promise<IngestProfile> {
  return bosFetch(`/api/ingest/sources/${sourceId}/profile`, {
    params: {
      version: version != null ? String(version) : undefined,
    },
  });
}

export function createIngestRecipe(
  sourceId: string,
  body: {
    target_table_key: string;
    mode: "append" | "upsert" | "replace";
    primary_key_fields: string[];
    settings_json: Record<string, unknown>;
    mappings: Array<{
      source_column: string;
      target_column: string;
      transform_json: Record<string, unknown>;
      required: boolean;
      mapping_order: number;
    }>;
    transform_steps?: Array<{
      step_order: number;
      step_type: string;
      config_json: Record<string, unknown>;
    }>;
  }
): Promise<IngestRecipe> {
  return bosFetch(`/api/ingest/sources/${sourceId}/recipes`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getIngestRecipe(recipeId: string): Promise<IngestRecipe> {
  return bosFetch(`/api/ingest/recipes/${recipeId}`);
}

export function validateIngestRecipe(
  recipeId: string,
  body?: { source_version_id?: string; preview_rows?: number }
): Promise<IngestValidationResult> {
  return bosFetch(`/api/ingest/recipes/${recipeId}/validate`, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

export function runIngestRecipe(
  recipeId: string,
  body?: { source_version_id?: string }
): Promise<IngestRun> {
  return bosFetch(`/api/ingest/recipes/${recipeId}/run`, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

export function getIngestRun(runId: string): Promise<IngestRun> {
  return bosFetch(`/api/ingest/runs/${runId}`);
}

export function listIngestTables(params?: {
  business_id?: string;
  env_id?: string;
}): Promise<IngestTable[]> {
  return bosFetch("/api/ingest/tables", {
    params: {
      business_id: params?.business_id,
      env_id: params?.env_id,
    },
  });
}

export function getIngestTableRows(
  tableKey: string,
  params?: {
    business_id?: string;
    env_id?: string;
    filters?: Record<string, string>;
    limit?: number;
    offset?: number;
  }
): Promise<{ table_key: string; total_rows: number; rows: Record<string, unknown>[] }> {
  return bosFetch(`/api/ingest/tables/${tableKey}/rows`, {
    params: {
      business_id: params?.business_id,
      env_id: params?.env_id,
      filters: params?.filters ? JSON.stringify(params.filters) : undefined,
      limit: params?.limit != null ? String(params.limit) : undefined,
      offset: params?.offset != null ? String(params.offset) : undefined,
    },
  });
}

export function listMetricDataPoints(params?: {
  business_id?: string;
  env_id?: string;
}): Promise<MetricDataPointRegistryItem[]> {
  return bosFetch("/api/ingest/metrics/data-points", {
    params: {
      business_id: params?.business_id,
      env_id: params?.env_id,
    },
  });
}

export function createMetricDataPoint(body: {
  business_id?: string | null;
  env_id?: string | null;
  data_point_key: string;
  source_table_key: string;
  aggregation: string;
  value_column?: string | null;
  columns_json?: string[];
  metadata_json?: Record<string, unknown>;
}): Promise<MetricDataPointRegistryItem> {
  return bosFetch("/api/ingest/metrics/data-points", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function suggestMetricsForTable(
  tableKey: string,
  params?: { business_id?: string; env_id?: string }
): Promise<{ table_key: string; suggestions: MetricSuggestion[] }> {
  return bosFetch(`/api/ingest/tables/${tableKey}/metric-suggestions`, {
    params: {
      business_id: params?.business_id,
      env_id: params?.env_id,
    },
  });
}
