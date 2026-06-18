// Static, typed source of truth for the telemetry "How This Works" architecture & evidence exhibit.
// Pure data — no React, no palette import — so it is trivially unit-testable and the honesty
// invariants (howItWorksData.test.ts) can assert against it directly.
//
// Honesty model: every capability carries TWO status axes.
//   impl   — does it exist, and how complete: built | partial | planned | blocked
//   verify — how far has it been confirmed:   prod_verified | stage_verified | code_verified | not_verified
// v1 ships everything at code_verified (AI-grounding rows at not_verified). Rows are promoted to
// prod_verified ONLY after the live novendor.ai route is clicked. Nothing claims production
// verification before that click. Planned/Blocked rows carry evidence:[] and render
// "Not available — {note}", never a fabricated link.

export type ImplStatus = "built" | "partial" | "planned" | "blocked";
export type VerifyStatus = "prod_verified" | "stage_verified" | "code_verified" | "not_verified";

/** A deep-link to a live surface. `slug` is resolved with telemetryHref(envId, slug) so it stays
 *  env-scoped; it MUST be a real telemetry nav slug. `href` is for rare external links. Neither set
 *  => the row has no evidence link and renders "Not available". */
export interface EvidenceLink {
  label: string;
  slug?: string;
  href?: string;
}

export interface CapabilityItem {
  capability: string;
  impl: ImplStatus;
  verify: VerifyStatus;
  evidence: EvidenceLink[]; // [] is valid and means "Not available — {note}"
  note: string; // never empty — the honest caveat / why-not-live
}

export interface MedallionHop {
  stage: "source" | "bronze" | "silver" | "gold" | "serving" | "ui";
  label: string;
  table: string; // real table or route name
  impl: ImplStatus;
  verify: VerifyStatus;
  detail: string;
  failureMode: string; // what "Not available" looks like at this hop
  slug?: string; // deep-link to where you can see this hop live
}

/** The governed-KPI chain is the REPE pattern, NOT yet adapted to telemetry. Rendered greyed/Planned
 *  so no one mistakes it for a live telemetry feature. */
export interface GovernedKpiHop {
  label: string;
  detail: string;
}

export interface McpRegistryRow {
  family: string;
  permission: "READ" | "WRITE_CONFIRMED" | "ADMIN";
  confirmationRequired: boolean;
  auditPolicy: string;
  demoExample: string;
  impl: ImplStatus;
}

export interface ToolSkillRow {
  tool: string;
  kind: "tool" | "skill";
  readWrite: "read" | "write";
  permission: string;
  impl: ImplStatus;
  auditEvidence: string;
}

export interface FlowNode {
  id: string;
  label: string;
  lane: "ingest" | "process" | "serve" | "ui";
  impl: ImplStatus;
}
export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface OrchestrationStep {
  n: number;
  label: string;
  detail: string;
  impl: ImplStatus;
}

export interface CrosswalkRow {
  dimension: string;
  demoSubstrate: string;
  productionEquivalent: string;
}

export interface MlModelCard {
  name: string;
  version: string;
  training: string;
  eval: string;
  decision: string; // the operational decision it informs
  impl: ImplStatus;
  verify: VerifyStatus;
  slug?: string;
}

export interface TimelineEntry {
  step: string;
  detail: string;
  impl: ImplStatus;
}

export interface JumpSection {
  n: number;
  label: string;
  anchor: string; // matches an id="" rendered on the page
}

export interface HeroCard {
  title: string;
  summary: string;
  impl: ImplStatus;
}

// ── Labels (strings only; colors resolve in the component against palette C) ──
export const IMPL_LABEL: Record<ImplStatus, string> = {
  built: "Built",
  partial: "Partial",
  planned: "Planned",
  blocked: "Blocked",
};

export const VERIFY_LABEL: Record<VerifyStatus, string> = {
  prod_verified: "Production verified",
  stage_verified: "Stage verified",
  code_verified: "Code verified",
  not_verified: "Needs live verification",
};

// ── Demo-mode strip ──
export const LAST_VERIFIED = "2026-06-17"; // static; bump only when re-checked. No computed coverage %.
export const ENVIRONMENT_BADGE = "telemetry-demo · serving prod";
export const COVERAGE_NOTE = "Evidence coverage not computed — each row is hand-verified, not a derived percentage.";

export const KNOWN_GAPS: string[] = [
  "Telemetry governed metric registry not adapted yet (REPE pattern only).",
  "Telemetry lineage drawer not adapted yet (REPE AuditDrawer only).",
  "Cost guardrail estimates only — no enforcement.",
  "Telemetry copilot RAG/grounding depth requires live verification before quoting numbers.",
  "Deployment status page planned, not built (status is CLI-verifiable today).",
];

// ── Jump nav (presentation mode) ──
export const JUMP_SECTIONS: JumpSection[] = [
  { n: 1, label: "Data trust", anchor: "data-trust" },
  { n: 2, label: "AI orchestration", anchor: "ai-orchestration" },
  { n: 3, label: "Model lifecycle", anchor: "model-lifecycle" },
  { n: 4, label: "Audit & tools", anchor: "audit-tools" },
  { n: 5, label: "Delivery OS", anchor: "delivery-os" },
];

// ── Hero status cards ──
export const HERO_CARDS: HeroCard[] = [
  { title: "Data trust", summary: "Bronze→silver→gold medallion with watermarks + DQ assertions; fail-closed on stale.", impl: "built" },
  { title: "AI orchestration", summary: "Typed, permissioned, audited tools; grounded structured-evidence Q&A (not document RAG).", impl: "partial" },
  { title: "ML lifecycle", summary: "Databricks training → MLflow gate → champion registry → live scoring with version attribution.", impl: "built" },
  { title: "Delivery loop", summary: "ADO intake → Session Brief → scoped PR → tests → evidence → one-way DONE.", impl: "partial" },
];

// ── The honesty ledger (the spine of the page) ──
export const CAPABILITIES: CapabilityItem[] = [
  {
    capability: "Telemetry environment — 13-page dark full-bleed console",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "Overview", slug: "" }, { label: "Mission Control", slug: "stream" }],
    note: "Operations, ML & Models, Factory, AI & Governance groups; this exhibit adds Evidence & Architecture.",
  },
  {
    capability: "Live hot-fire / printer stream",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "Mission Control", slug: "stream" }, { label: "Stargate Live", slug: "stargate" }],
    note: "Stream worker gated by TELEMETRY_STREAM_ENABLED; when off it fails closed with a specific reason (derive_stream_reason), never fake zeros.",
  },
  {
    capability: "Medallion ETL — bronze → silver → gold",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "Monitoring", slug: "monitoring" }, { label: "Mission Control", slug: "stream" }],
    note: "tel_stream_readings_bronze → tel_stream_readings → tel_stream_minute_agg, with tel_etl_watermarks, tel_pipeline_status, tel_dq_assertions. Postgres demo substrate; BigQuery/Spark is the production crosswalk, not running here.",
  },
  {
    capability: "Anomaly champion scoring (GO / REVIEW / NO_GO verdict)",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "Model Performance", slug: "model-performance" }, { label: "Replay", slug: "replay" }],
    note: "telemetry_serving.score_window applies a frozen MAD rule (MAD_K=4.0) from Databricks Phase 2 and persists a receipt to tel_predictions. Not a live-retraining loop.",
  },
  {
    capability: "Model registry + promotion gate",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "Model Registry", slug: "registry" }],
    note: "tel_model_runs (version, alias, mlflow_run_id, metrics + gate JSONB, promotion_state) + tel_drift_metrics. Display-only — promotion happens in Databricks; backend has no mutation route.",
  },
  {
    capability: "RUL calibration — graduated CNN-LSTM champion",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "RUL Calibration", slug: "calibration" }],
    note: "Present on this branch (origin/main). Verification: code-only until the deployed novendor.ai route is clicked — do not present as production-verified before then.",
  },
  {
    capability: "Factory / NCR recurrence intelligence",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "Factory · NCR", slug: "factory" }, { label: "Factory ML", slug: "factory-ml" }],
    note: "UMAP/HDBSCAN clusters + backlog forecast (XGBoost + MLflow). NCR clustering is the checklist's cuttable item.",
  },
  {
    capability: "MCP tool registry — typed, permissioned, audited (platform)",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "AI Governance", slug: "governance" }],
    note: "backend/app/mcp: ToolDef with read/write permission, READ/WRITE_CONFIRMED/ADMIN scopes, confirmation gate, redaction policy, ~100+ tools. No in-env telemetry MCP-registry UI — surfaced here as a static snapshot + via the copilot tool-trace.",
  },
  {
    capability: "Agent audit trail / decision receipts",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "AI Governance", slug: "governance" }],
    note: "ai_decision_audit_log: redacted input/output summaries, grounding_score, tokens, latency, tags. decision_type CHECK allows tool_call|response|classification|fast_path — a new type needs a migration or the receipt is silently dropped.",
  },
  {
    capability: "Test Intelligence copilot — evidence cards, tool trace, grounded facts",
    impl: "partial", verify: "not_verified",
    evidence: [{ label: "Test Intelligence", slug: "copilot" }],
    note: "Grounds on fetched structured evidence with a two-pass anti-fabrication validator — NOT document RAG. Grounding/citation depth must be checked on the running app before quoting coverage.",
  },
  {
    capability: "AI Governance dashboard — refusal / eval / tool stats",
    impl: "built", verify: "code_verified",
    evidence: [{ label: "AI Governance", slug: "governance" }],
    note: "Grounded/refusal/fallback rates, latency, evals, conformal budget, smoke. Verify the eval pass-rate on the running app before quoting numbers.",
  },
  {
    capability: "Governed metric registry — one definition, all surfaces resolve",
    impl: "planned", verify: "not_verified",
    evidence: [],
    note: "REPE-only today (semantic_metric_def + unified_metric_registry). Telemetry metrics live in tel_model_runs.metrics JSONB, not a governed registry. Not available for telemetry yet.",
  },
  {
    capability: "Lineage drawer — number → SQL → source → null reasons",
    impl: "planned", verify: "not_verified",
    evidence: [],
    note: "REPE-only today (AuditDrawer + ?audit_mode=1 + re_authoritative_snapshots). No telemetry lineage drawer; medallion lineage is implicit in watermarks/provenance. Not available for telemetry yet.",
  },
  {
    capability: "Query cost guardrail — dry-run estimate, block over budget",
    impl: "planned", verify: "not_verified",
    evidence: [],
    note: "cost_tracker.estimate_cost() logs per-request cost to ai_gateway_logs but there is NO enforcement. The blocking guardrail is planned. Not available yet.",
  },
  {
    capability: "Cross-platform event spine — Kafka → BigQuery → GKE",
    impl: "partial", verify: "not_verified",
    evidence: [],
    note: "backend/app/events transport + sink exist; Plan 0004 phases 1–3B done. EVENTS_ENABLED and BQ_ENABLED default off; GKE Phase 4 is TODO. Partial / disabled by default.",
  },
  {
    capability: "Ticket → PR delivery loop",
    impl: "partial", verify: "code_verified",
    evidence: [],
    note: "Real and demonstrable: ADO board (Novendor) + azure-devops-intake + feature-dev govern this PR (Story #654). The AI-SQL-with-dry-run-cost → PR automation is the adapt/planned part.",
  },
  {
    capability: "Deployment exhibit — Railway / Vercel / CI gates",
    impl: "partial", verify: "code_verified",
    evidence: [],
    note: "Railway authentic-sparkle (deploys from main), Vercel consulting-app → novendor.ai. Status is CLI-verifiable (railway status, /version); a single deployment-status page is planned.",
  },
];

// ── System architecture map (lanes; rendered as a hand-rolled FlowDiagram, not mermaid/xyflow) ──
export const ARCHITECTURE_NODES: FlowNode[] = [
  { id: "src", label: "Source adapters\nCapture / ISS / ADS-B", lane: "ingest", impl: "built" },
  { id: "bronze", label: "tel_stream_readings_bronze", lane: "ingest", impl: "built" },
  { id: "silver", label: "tel_stream_readings (silver)", lane: "process", impl: "built" },
  { id: "gold", label: "tel_stream_minute_agg (gold)", lane: "process", impl: "built" },
  { id: "dq", label: "watermarks + DQ assertions", lane: "process", impl: "built" },
  { id: "api", label: "/api/telemetry/* (FastAPI)", lane: "serve", impl: "built" },
  { id: "models", label: "tel_model_runs + tel_predictions", lane: "serve", impl: "built" },
  { id: "console", label: "Telemetry console (13 pages)", lane: "ui", impl: "built" },
  { id: "copilot", label: "Test Intelligence copilot", lane: "ui", impl: "partial" },
  { id: "mcp", label: "MCP registry (platform)", lane: "serve", impl: "built" },
  { id: "audit", label: "ai_decision_audit_log", lane: "serve", impl: "built" },
  { id: "bq", label: "BigQuery spine (disabled)", lane: "process", impl: "partial" },
];
export const ARCHITECTURE_EDGES: FlowEdge[] = [
  { from: "src", to: "bronze" },
  { from: "bronze", to: "silver" },
  { from: "silver", to: "gold" },
  { from: "dq", to: "gold", label: "fail-closed" },
  { from: "gold", to: "api" },
  { from: "models", to: "api" },
  { from: "api", to: "console" },
  { from: "api", to: "copilot" },
  { from: "copilot", to: "mcp", label: "tool calls" },
  { from: "mcp", to: "audit", label: "receipts" },
  { from: "gold", to: "bq", label: "optional" },
];

// ── "Follow one stream aggregate" — the genuinely-real medallion trace ──
export const MEDALLION: MedallionHop[] = [
  { stage: "source", label: "ISS session (CAPTURE replay)", table: "telemetry_stream_ingest.py", impl: "built", verify: "code_verified", detail: "Deterministic source adapter — the proof path; live ISS / ADS-B are optional alternates.", failureMode: "Adapter silent >30s → watchdog restarts; >60s → pipeline marked stale." },
  { stage: "bronze", label: "Raw landing", table: "tel_stream_readings_bronze", impl: "built", verify: "code_verified", detail: "Append-only, 2s micro-batch, one batch_id per flush.", failureMode: "No frames → bronze empty → downstream shows data_source_not_configured, not zeros.", slug: "stream" },
  { stage: "silver", label: "Conformed", table: "tel_stream_readings", impl: "built", verify: "code_verified", detail: "Dedup on (env_id, channel_id, ts_source); conformed types.", failureMode: "Dedup key collision would surface as a DQ assertion, not silent overwrite." },
  { stage: "gold", label: "Aggregated", table: "tel_stream_minute_agg", impl: "built", verify: "code_verified", detail: "1-minute aggregates, restatable for late-arriving data.", failureMode: "Late data restates the affected minute; never mutates history silently.", slug: "monitoring" },
  { stage: "serving", label: "API", table: "/api/telemetry/stream/{live,health}", impl: "built", verify: "code_verified", detail: "Ring-buffer tail + per-channel freshness, ingest lag p50/p95, rows/min, DQ count.", failureMode: "Stale watermark → /stream/health returns a specific reason." },
  { stage: "ui", label: "Mission Control", table: "MissionControlStream", impl: "built", verify: "code_verified", detail: "~1s cadence; flips STALE on silence, no interpolation.", failureMode: "Worker disabled → fail-closed reason banner, not a flatline chart.", slug: "stream" },
];

// ── The governed-KPI chain is the REPE pattern, NOT telemetry — rendered greyed / Planned ──
export const GOVERNED_KPI_CHAIN: GovernedKpiHop[] = [
  { label: "Metric definition", detail: "semantic_metric_def — one governed definition" },
  { label: "SQL model", detail: "registry-bound query strategy" },
  { label: "Source tables", detail: "gold facts" },
  { label: "Lineage drawer", detail: "AuditDrawer · ?audit_mode=1" },
  { label: "AI answer", detail: "metric-grounded, never free SQL" },
];
export const GOVERNED_KPI_NOTE =
  "Planned for telemetry; proven in the REPE pattern. Telemetry has no governed metric registry or lineage drawer yet — this chain is shown to be honest about what the platform can do elsewhere, not to imply it runs here.";

// ── AI orchestration call-flow ──
export const ORCHESTRATION_STEPS: OrchestrationStep[] = [
  { n: 1, label: "Classify intent", detail: "Request routed to a lane; numeric vs corpus vs refusal.", impl: "built" },
  { n: 2, label: "Select tool / route", detail: "Typed tool from the allow-list, or a structured-evidence fetch.", impl: "built" },
  { n: 3, label: "Permission check", detail: "READ / WRITE_CONFIRMED / ADMIN; writes hit a confirmation gate.", impl: "built" },
  { n: 4, label: "Execute + ground", detail: "Fetch structured evidence; two-pass anti-fabrication validator.", impl: "partial" },
  { n: 5, label: "Answer or fail closed", detail: "Evidence cards + null_reason; never an invented number.", impl: "built" },
  { n: 6, label: "Log receipt", detail: "record_decision → ai_decision_audit_log (redacted).", impl: "built" },
];

// ── MCP Tool Registry Snapshot (static; sourced from the real ToolDef model) ──
export const MCP_REGISTRY_HEADER =
  "MCP registry model: Built (backend/app/mcp). Telemetry registry UI: Partial — static exhibit only; telemetry copilot uses an inline allow-list, not the MCP registry.";
export const MCP_REGISTRY_SNAPSHOT: McpRegistryRow[] = [
  { family: "business / telemetry reads", permission: "READ", confirmationRequired: false, auditPolicy: "redact_keys + size cap", demoExample: "fetch run summary, KPI", impl: "built" },
  { family: "documents / RAG retrieval", permission: "READ", confirmationRequired: false, auditPolicy: "redact_keys", demoExample: "cited corpus answer (REPE/credit)", impl: "built" },
  { family: "audit / governance", permission: "READ", confirmationRequired: false, auditPolicy: "redact_keys", demoExample: "decision stats", impl: "built" },
  { family: "write tools (mutations)", permission: "WRITE_CONFIRMED", confirmationRequired: true, auditPolicy: "redact + success flag", demoExample: "denied without confirmation", impl: "built" },
  { family: "admin (stream source switch)", permission: "ADMIN", confirmationRequired: true, auditPolicy: "admin-key gate", demoExample: "/stream/source x-stream-admin-key", impl: "built" },
];

// ── Tool & skill inventory ──
export const TOOL_INVENTORY: ToolSkillRow[] = [
  { tool: "MCP read tools", kind: "tool", readWrite: "read", permission: "READ", impl: "built", auditEvidence: "ai_decision_audit_log row per call" },
  { tool: "MCP write tools", kind: "tool", readWrite: "write", permission: "WRITE_CONFIRMED + gate", impl: "built", auditEvidence: "receipt + success flag" },
  { tool: "metric resolver (unified_metric_registry)", kind: "tool", readWrite: "read", permission: "env-scoped", impl: "partial", auditEvidence: "gateway log (REPE)" },
  { tool: "RAG retrieval (semantic_search + rerank)", kind: "tool", readWrite: "read", permission: "env/business RLS", impl: "built", auditEvidence: "ai_gateway_logs.rag_*, ai_messages.citations" },
  { tool: "anomaly scorer (/score)", kind: "tool", readWrite: "read", permission: "env-scoped", impl: "built", auditEvidence: "tel_predictions.receipt_id" },
  { tool: "cost estimator (estimate_cost)", kind: "tool", readWrite: "read", permission: "—", impl: "partial", auditEvidence: "ai_gateway_logs.cost_* (no enforcement)" },
  { tool: "azure-devops-intake / feature-dev", kind: "skill", readWrite: "write", permission: "human approval", impl: "partial", auditEvidence: "ADO audit comment + PR" },
  { tool: "repo search/read, deploy/health (CLI)", kind: "skill", readWrite: "read", permission: "operator", impl: "partial", auditEvidence: "railway status, /version" },
];

// ── Batch-vs-streaming production crosswalk ──
export const BATCH_VS_STREAM: CrosswalkRow[] = [
  { dimension: "Telemetry stream", demoSubstrate: "Capture/ISS adapter over SSE", productionEquivalent: "Kafka / Pub/Sub topic" },
  { dimension: "Raw landing", demoSubstrate: "Postgres tel_stream_readings_bronze", productionEquivalent: "Cloud Storage / lake bronze" },
  { dimension: "Serving layer", demoSubstrate: "Postgres silver/gold + FastAPI", productionEquivalent: "BigQuery warehouse + serving" },
  { dimension: "Scheduled jobs", demoSubstrate: "FastAPI workers + watermarks", productionEquivalent: "Composer / Dataform / Cloud Run" },
  { dimension: "Runtime", demoSubstrate: "Railway container + Vercel", productionEquivalent: "Cloud Run / GKE" },
];

// ── ML lifecycle cards ──
export const ML_LIFECYCLE: MlModelCard[] = [
  { name: "Anomaly champion (MAD residual rule)", version: "champion (tel_model_runs)", training: "SMAP/MSL + C-MAPSS, Databricks Phase 2", eval: "honest_gate JSONB (f1_pointwise, affiliation_f1)", decision: "Hot-fire GO / REVIEW / NO_GO; flag off-nominal segments.", impl: "built", verify: "code_verified", slug: "model-performance" },
  { name: "RUL calibration (CNN-LSTM challenger)", version: "calibration champion", training: "C-MAPSS run-to-failure", eval: "calibration baseline vs challenger", decision: "Remaining useful life — maintenance / review timing.", impl: "built", verify: "code_verified", slug: "calibration" },
  { name: "Factory backlog forecast (XGBoost)", version: "MLflow run", training: "rs_factory_seed (synthetic)", eval: "MAE / MAPE vs naive baseline", decision: "NCR backlog capacity planning.", impl: "built", verify: "code_verified", slug: "factory-ml" },
];

// ── Delivery operating-system timeline ──
export const DELIVERY_TIMELINE: TimelineEntry[] = [
  { step: "ADO intake", detail: "Epic #497 → Feature #513 → Story #654 → Tasks #655–660.", impl: "built" },
  { step: "Session Brief", detail: "Approved scope, acceptance, tests, out-of-scope.", impl: "built" },
  { step: "Scoped change", detail: "One Story per session; isolated worktree off origin/main.", impl: "built" },
  { step: "Tests + evidence", detail: "Invariant test, render test, Playwright smoke, screenshots.", impl: "partial" },
  { step: "PR + audit comment", detail: "Branch/commit/PR linked on the work item.", impl: "partial" },
  { step: "One-way DONE", detail: "Closed only after merge + prod/smoke verified.", impl: "planned" },
];
