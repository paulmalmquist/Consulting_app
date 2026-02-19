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
