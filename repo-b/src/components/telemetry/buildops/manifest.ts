// Static source-of-truth for the "AI Build & Operations Reference" page. This module holds NO live
// data and triggers NO compute — it is a hand-maintained inventory of the telemetry demo's real
// surfaces, endpoints, tools, and operational workflows, each row citing the file/route it describes.
//
// Discipline (see the reference page's "Manifest contract"): every claim-bearing row carries
// `sourceRefs` pointing at a real path. A row with status "planned" / "not-present" shows an honest
// label instead of a citation and is never mixed into a "real" table. If you change behavior in the
// code, update the matching row here — drift between this file and reality is the only real risk.

export type RowStatus = "real" | "fixture" | "synthetic" | "cold" | "planned" | "not-present";

/** A pointer to the file/route that backs a claim. `path` is repo-relative; `note` scopes it. */
export type SourceRef = { label: string; path: string; note?: string };

// ── Section 1: the four kinds of "AI" / automation this page separates ──────────────────────────
export type KindRow = { key: string; title: string; body: string };

export const KINDS: KindRow[] = [
  {
    key: "build",
    title: "1 · Build-time AI assistance",
    body: "AI-assisted engineering workflows (Claude Code / Codex-style) used to plan, implement, refactor, test, and document the app. This is governed by a dispatcher + active-plan contract, not free-form generation — it produces code, tests, and docs that go through the same PR and CI gates as any other change.",
  },
  {
    key: "runtime",
    title: "2 · Runtime LLM features",
    body: "Grounded answers over telemetry evidence: the telemetry copilot explains a NO-GO verdict at the fire tick, the AI gateway serves streamed RAG answers, and the AI dispatch router picks a provider under a typed policy. These refuse out-of-scope questions and fail closed with a null_reason rather than inventing an answer.",
  },
  {
    key: "ml",
    title: "3 · Traditional ML / data science",
    body: "Deterministic, inspectable models: a rolling-MAD anomaly champion (beat PCA on operational metrics), a GBM RUL regressor with conformal calibration, PCA/recon-error diagnostics, and factory NCR clustering. The math is numpy/sklearn; results are promoted only when they clear a declared gate.",
  },
  {
    key: "devops",
    title: "4 · DevOps / platform automation",
    body: "The operational layer: REST APIs, read-only MCP tools, CLI workflows, GitHub PRs, CI gates, deploy verification, and signed audit receipts. This is ordinary deterministic software — no model is in the loop — and it is what makes the rest auditable.",
  },
];

// ── Section 2: page-by-page AI connection inventory ─────────────────────────────────────────────
export type PageRow = {
  page: string;
  route: string; // relative to /lab/env/[envId]/telemetry
  sees: string;
  aiConnection: string;
  dataSource: string;
  tooling: string;
  evidence: string;
  boundary: string;
  status: RowStatus;
  sourceRefs: SourceRef[];
};

const PAGE = (slug: string): SourceRef => ({
  label: slug === "" ? "telemetry/page.tsx" : `${slug}/page.tsx`,
  path: `repo-b/src/app/lab/env/[envId]/telemetry/${slug}${slug === "" ? "" : "/"}page.tsx`,
});
const TEL_ROUTES: SourceRef = { label: "telemetry.py", path: "backend/app/routes/telemetry.py" };

export const PAGE_INVENTORY: PageRow[] = [
  {
    page: "Overview",
    route: "/telemetry",
    sees: "Launch-history context + live serving KPIs (runs, predictions, anomalies, promoted models).",
    aiConnection: "Reads ML outputs; no model runs on the page.",
    dataSource: "GET /api/telemetry/summary",
    tooling: "Static serving reads; no live compute.",
    evidence: "KPIs trace to tel_* serving rows; fail-closed null_reason when empty.",
    boundary: "Numbers are a deterministic backfill of public datasets, not proprietary fleet data.",
    status: "real",
    sourceRefs: [PAGE(""), { ...TEL_ROUTES, note: "GET /summary" }],
  },
  {
    page: "Mission Control",
    route: "/telemetry/stream",
    sees: "Live streaming chart with per-channel freshness and ingest lag; a Start control.",
    aiConnection: "Deterministic threshold / rolling-baseline scoring on the live stream — not the PCA model.",
    dataSource: "GET /stream/live · /stream/health · POST /stream/control",
    tooling: "Stream worker reads tel_stream_readings; capture mode is the default (no Confluent cost).",
    evidence: "Per-channel freshness + ingest-lag p50/p95 shown; source mode reported on control.",
    boundary: "Default 'capture' mode is deterministic/synthetic; 'iss' is live; both are labeled.",
    status: "real",
    sourceRefs: [PAGE("stream"), { ...TEL_ROUTES, note: "GET /stream/live, POST /stream/control" }],
  },
  {
    page: "Replay",
    route: "/telemetry/replay",
    sees: "Deterministic replay of a real champion's anomaly scoring over a labeled window.",
    aiConnection: "Real promoted-champion outputs (MAD), pre-computed; the page does not score live.",
    dataSource: "GET /api/telemetry/replay",
    tooling: "Reads a committed fixture; carries scoringDiagnostics (per-channel caveat) + lineage.",
    evidence: "Provenance block names the source table, champion model, and mlflow run id.",
    boundary: "Replay = committed fixture (real outputs), not a live /score call. Labeled as such.",
    status: "fixture",
    sourceRefs: [
      PAGE("replay"),
      { ...TEL_ROUTES, note: "GET /replay" },
      { label: "replay_fixture.json", path: "backend/app/data/telemetry/replay_fixture.json" },
    ],
  },
  {
    page: "Stargate Live",
    route: "/telemetry/stargate",
    sees: "Kafka-detection → AI-triage → Postgres-serving lineage for a streamed anomaly.",
    aiConnection: "Agentic triage layer annotates detections; surfaced as lineage, not a single verdict.",
    dataSource: "GET /stargate/provenance · /stargate/anomalies/tail · /stream/kafka/*",
    tooling: "Durable Kafka sink is gated off by default; reads fail closed when disabled.",
    evidence: "Four-layer lineage, each layer with explicit status + null_reason.",
    boundary: "Durable sink off by default → durable_sink_not_enabled; not a live broker in the demo.",
    status: "cold",
    sourceRefs: [PAGE("stargate"), { ...TEL_ROUTES, note: "GET /stargate/provenance, /stream/kafka/*" }],
  },
  {
    page: "Test Runs",
    route: "/telemetry/runs",
    sees: "List of test runs and a per-run detail (channels, predictions, anomaly events).",
    aiConnection: "Displays scored predictions; no model runs on the page.",
    dataSource: "GET /runs · GET /run/{run_id}",
    tooling: "Reads backfilled operational history (real champion outputs, real labels).",
    evidence: "Each run links its predictions + anomaly events; null_reason when a run has no rows.",
    boundary: "Operated history is a deterministic backfill from public datasets, clearly disclosed.",
    status: "real",
    sourceRefs: [PAGE("runs"), { ...TEL_ROUTES, note: "GET /runs, /run/{id}" }],
  },
  {
    page: "System Health",
    route: "/telemetry/system-health",
    sees: "Rolling anomaly rate, drift (PSI), conformal budget, and current findings.",
    aiConnection: "Surfaces ML monitoring + analyzer findings; analyzer is the single source.",
    dataSource: "GET /monitoring · GET /findings",
    tooling: "Findings ground in serving reads; fail-closed telemetry_findings_unavailable on error.",
    evidence: "Provenance block (surface, source, rows_evaluated, fallback_used, last_refresh).",
    boundary: "Never fabricates findings — returns null_reason instead.",
    status: "real",
    sourceRefs: [PAGE("system-health"), { ...TEL_ROUTES, note: "GET /monitoring, /findings" }],
  },
  {
    page: "Model Workbench",
    route: "/telemetry/workbench",
    sees: "Guided experiment loop: feature sets, threshold sweep, champion review, prediction drill.",
    aiConnection: "Inspects ML experiments; the run button replays a committed receipt, never trains live.",
    dataSource: "Workbench receipts + model-performance / registry reads",
    tooling: "Replay-not-live by design; live ML compute is off by default.",
    evidence: "Each panel drills feature vector → residual math → run → artifact → gate.",
    boundary: "'Replay experiment receipt — no live compute triggered.' Receipts, not live Vertex jobs.",
    status: "real",
    sourceRefs: [
      { label: "workbench/page.tsx", path: "repo-b/src/app/lab/env/[envId]/telemetry/workbench/page.tsx" },
      { label: "ModelWorkbench.tsx", path: "repo-b/src/components/telemetry/workbench/ModelWorkbench.tsx" },
    ],
  },
  {
    page: "Model Performance",
    route: "/telemetry/model-performance",
    sees: "Promoted-model metrics and the honest 'MAD beat PCA' promotion story.",
    aiConnection: "Reads exact metrics from tel_model_runs — no hardcoded numbers.",
    dataSource: "GET /model-performance",
    tooling: "Display-only; metrics come straight from the run record.",
    evidence: "Metric values trace to the model-run row; gate decision shown.",
    boundary: "The fancier model is shown as not promoted, not hidden.",
    status: "real",
    sourceRefs: [PAGE("model-performance"), { ...TEL_ROUTES, note: "GET /model-performance" }],
  },
  {
    page: "RUL Calibration",
    route: "/telemetry/calibration",
    sees: "Conformal PICP / MPIW reliability for the RUL regressor.",
    aiConnection: "Calibration evidence for a real GBM model; not a live forecast.",
    dataSource: "Calibration reads from the RUL model run",
    tooling: "Display-only conformal intervals + reliability.",
    evidence: "Coverage vs nominal shown; 'CRPS is an approximation' caveat preserved.",
    boundary: "Real-time RUL inference stays planned/unavailable.",
    status: "real",
    sourceRefs: [PAGE("calibration")],
  },
  {
    page: "Model Registry",
    route: "/telemetry/registry",
    sees: "All model runs with metrics, gate decisions, drift history, lifecycle timeline.",
    aiConnection: "Read-only registry view of ML runs; no mutation.",
    dataSource: "GET /registry",
    tooling: "Display-only; no POST/PUT/DELETE on the registry.",
    evidence: "Real PSI drift history + honest gate jsonb per run.",
    boundary: "Registry is a read surface; promotion happens offline.",
    status: "real",
    sourceRefs: [PAGE("registry"), { ...TEL_ROUTES, note: "GET /registry" }],
  },
  {
    page: "Factory · NCR",
    route: "/telemetry/factory",
    sees: "NCR clustering (UMAP/HDBSCAN), Pareto, and a backlog forecast.",
    aiConnection: "Unsupervised clustering + walk-forward forecast with backtest metrics.",
    dataSource: "GET /ncr",
    tooling: "Fails closed (data_not_ingested) when the mirror is unapplied.",
    evidence: "Cluster provenance is databricks | local_fallback.",
    boundary: "Falls back to a local computation when Databricks rows are absent — labeled.",
    status: "real",
    sourceRefs: [PAGE("factory"), { ...TEL_ROUTES, note: "GET /ncr" }],
  },
  {
    page: "Flight Readiness",
    route: "/telemetry/factory-ml",
    sees: "Factory ML readiness with drillable evidence and SHAP attribution.",
    aiConnection: "Tree-model SHAP (local attribution); deep links to MLflow runs.",
    dataSource: "Committed factory-ML catalogs + MLflow refs",
    tooling: "Static JSON catalogs; live Databricks/MLflow deep links when configured.",
    evidence: "Click-into-evidence drawer across model quality / registry / NCR / readiness.",
    boundary: "'Global vs local SHAP — tree models only.' No SHAP claims on non-tree models.",
    status: "real",
    sourceRefs: [PAGE("factory-ml")],
  },
  {
    page: "Metric Lineage",
    route: "/telemetry/metric-lineage",
    sees: "Where a displayed number came from — source → transform → serving.",
    aiConnection: "None; deterministic lineage of data, not a model.",
    dataSource: "Reviewed lineage catalog",
    tooling: "Read-only lineage explorer.",
    evidence: "Each node names a real source, table, or topic.",
    boundary: "Lineage is documentation of verified structure, not a live trace.",
    status: "real",
    sourceRefs: [PAGE("metric-lineage")],
  },
  {
    page: "Metadata Explorer",
    route: "/telemetry/metadata",
    sees: "Allowlisted serving metadata + telemetry lineage graph.",
    aiConnection: "None; governed metadata surface.",
    dataSource: "GET /metadata/graph",
    tooling: "Catalog is validated; fails closed (INVALID_METADATA_CATALOG) on bad input.",
    evidence: "Graph nodes/edges with grain declarations and status.",
    boundary: "Only allowlisted metadata is exposed.",
    status: "real",
    sourceRefs: [PAGE("metadata"), { ...TEL_ROUTES, note: "GET /metadata/graph" }],
  },
  {
    page: "Agent Control Tower",
    route: "/telemetry/control-tower",
    sees: "Go/no-go gates on REVIEW/NO-GO verdicts with signed receipts; Gemma tier state.",
    aiConnection: "Verdict gating + an LLM provider lifecycle (Gemma) kept cold by default.",
    dataSource: "POST /control-tower/score-and-gate · GET /decisions · /receipts/{id}/verify · /public-key",
    tooling: "Ed25519-signed receipts, offline-verifiable; Gemma lifecycle is approval + flag gated.",
    evidence: "Every gate produces a signed receipt; public key published for verification.",
    boundary: "Gemma endpoint cold; lifecycle gated by CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED.",
    status: "real",
    sourceRefs: [
      PAGE("control-tower"),
      { label: "telemetry_control_tower.py", path: "backend/app/routes/telemetry_control_tower.py" },
    ],
  },
  {
    page: "Relativity MES Sandbox",
    route: "/telemetry/relativity-mes (+ genealogy / ncr / cost / lineage)",
    sees: "A build-to-flight MES/ERP/PLM facsimile: genealogy, NCR traceability, cost, lineage.",
    aiConnection: "None; a synthetic manufacturing data product, kept visibly separate.",
    dataSource: "GET /relativity-mes/{overview,genealogy,where-used,ncr,cost,lineage}",
    tooling: "Reads rel_* serving rows; every response carries source_kind + serving_provenance.",
    evidence: "source_kind live-rows | unavailable; serving_provenance seed-bootstrap | databricks-gold.",
    boundary: "Clearly-labeled SYNTHETIC data, not real Relativity production records.",
    status: "synthetic",
    sourceRefs: [
      { label: "relativity-mes/page.tsx", path: "repo-b/src/app/lab/env/[envId]/telemetry/relativity-mes/page.tsx" },
      { label: "relativity_mes.py", path: "backend/app/routes/relativity_mes.py" },
    ],
  },
];

/** Hidden-but-resolving deep-link routes (shown as a short note, not a "real" inventory row). */
export const HIDDEN_ROUTES: { label: string; route: string; note: string }[] = [
  { label: "Test Intelligence (copilot)", route: "/telemetry/copilot", note: "LLM verdict explanation; hidden from rail, route resolves." },
  { label: "Trust Center (governance)", route: "/telemetry/governance", note: "Governance aggregates; hidden from rail." },
  { label: "How This Works", route: "/telemetry/how-it-works", note: "System-architecture exhibit; hidden from rail." },
  { label: "Resume Evidence", route: "/telemetry/evidence", note: "Evidence cards; hidden from rail." },
  { label: "Data Engineering", route: "/telemetry/data-engineering/*", note: "DE workbench + receipts; group hidden, routes resolve." },
];

/** Cross-link outside the telemetry section. */
export const CROSS_LINKS: { label: string; route: string; note: string }[] = [
  { label: "AI Provider Dispatch (admin)", route: "/lab/system/ai-provider-dispatch", note: "Governed model router admin panel; outside the telemetry env." },
];

/** Section 2 "planned / not present yet" — never mixed with real rows. */
export const PLANNED_SURFACES: { label: string; status: RowStatus; note: string }[] = [
  { label: "Real-time RUL inference", status: "planned", note: "Calibration evidence ships today; live inference stays planned/unavailable." },
  { label: "LSTM / sequence anomaly model", status: "planned", note: "Appears only as a challenger/diagnostic; not promoted unless it wins on operational metrics." },
  { label: "Live Vertex training from the UI", status: "planned", note: "No 'train live' button ships; the Workbench replays committed receipts." },
];

// ── Section 3: AI skills used to build & maintain the demo ───────────────────────────────────────
export type SkillRow = { family: string; usedFor: string; example: string; sourceRefs: SourceRef[] };

const CLAUDE_MD: SourceRef = { label: "CLAUDE.md", path: "CLAUDE.md", note: "router + intake contract" };
const TEL_PLAN: SourceRef = {
  label: "0003-telemetry-platform-build.md",
  path: "docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md",
};

export const SKILL_FAMILIES: SkillRow[] = [
  {
    family: "Planning & routing",
    usedFor: "Classify a request, find/own a plan, decompose tickets, label risk, set acceptance criteria before code.",
    example: "Telemetry work routes through the dispatcher to an active plan; this page is one such ticket.",
    sourceRefs: [CLAUDE_MD, TEL_PLAN, { label: "routing-map.md", path: "docs/plans/00-dispatch/routing-map.md" }],
  },
  {
    family: "Code generation & refactoring",
    usedFor: "Frontend pages/components, FastAPI endpoints, SQL, and guardrail-preserving refactors.",
    example: "The telemetry pages, serving routes, and shared primitives were built and refactored this way.",
    sourceRefs: [
      { label: "components/telemetry/", path: "repo-b/src/components/telemetry/" },
      { ...TEL_ROUTES },
    ],
  },
  {
    family: "Data & ML work",
    usedFor: "Pipeline/notebook inspection, metric validation, model-card summarization, lineage narration.",
    example: "Honest anomaly/RUL metrics are centralized so the registry and calibration pages agree.",
    sourceRefs: [
      { label: "telemetry-platform/", path: "telemetry-platform/", note: "Databricks notebooks + pipeline math" },
      { label: "telemetry_serving.py", path: "backend/app/services/telemetry_serving.py" },
    ],
  },
  {
    family: "DevOps & deployment",
    usedFor: "Branch/worktree hygiene, GitHub PRs, CI inspection, deploy verification, smoke checks.",
    example: "This change was built in an isolated worktree off origin/main and lands via PR + CI.",
    sourceRefs: [
      { label: "ci.yml", path: ".github/workflows/ci.yml" },
      { label: "deploy_backend.sh", path: "scripts/deploy_backend.sh" },
    ],
  },
  {
    family: "Runtime AI safety & governance",
    usedFor: "Tool-use policy, audited tool calls, fail-closed nulls, RAG grounding, approval gates.",
    example: "Telemetry MCP tools are read-only + scope-enforced; copilot refuses out-of-scope questions.",
    sourceRefs: [
      { label: "fail-closed-rules.md", path: "docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md" },
      { label: "telemetry_tools.py", path: "backend/app/mcp/tools/telemetry_tools.py" },
    ],
  },
];

// ── Section 4: runtime AI architecture layers ───────────────────────────────────────────────────
export type RuntimeRow = {
  layer: string;
  purpose: string;
  examples: string;
  failureMode: string;
  evidence: string;
  sourceRefs: SourceRef[];
};

export const RUNTIME_LAYERS: RuntimeRow[] = [
  {
    layer: "Frontend pages (Next.js)",
    purpose: "Render telemetry surfaces; no secrets, no model logic.",
    examples: "The pages in Section 2.",
    failureMode: "Renders a designed EmptyState/ErrorState, never a blank crash.",
    evidence: "Fail-closed cards with the specific null_reason.",
    sourceRefs: [{ label: "components/telemetry/", path: "repo-b/src/components/telemetry/" }],
  },
  {
    layer: "Next.js proxy route",
    purpose: "Forward /api/telemetry/* to the backend; scope metadata by env id.",
    examples: "catch-all [...path]/route.ts",
    failureMode: "Auth + env-scope checks before forwarding.",
    evidence: "Header x-telemetry-route-env-id checked against TELEMETRY_SERVING_ENV_ID.",
    sourceRefs: [{ label: "[...path]/route.ts", path: "repo-b/src/app/api/telemetry/[...path]/route.ts" }],
  },
  {
    layer: "FastAPI serving",
    purpose: "Deterministic API responses over tel_* serving rows.",
    examples: "GET /summary, /monitoring, /registry, /replay.",
    failureMode: "Returns null_reason (HTTP 200), not a 500, when data is absent.",
    evidence: "Provenance blocks + null_reason on every data response.",
    sourceRefs: [{ ...TEL_ROUTES }],
  },
  {
    layer: "Traditional ML scoring",
    purpose: "Score a window against the promoted champion; return a verdict.",
    examples: "POST /score → GO / REVIEW / NO_GO.",
    failureMode: "NOT_AVAILABLE + null_reason when no champion / no data.",
    evidence: "Verdict carries anomaly_score, threshold, attribution, mlflow_run_id.",
    sourceRefs: [{ ...TEL_ROUTES, note: "POST /score" }, { label: "telemetry_serving.py", path: "backend/app/services/telemetry_serving.py" }],
  },
  {
    layer: "Telemetry copilot (LLM)",
    purpose: "Explain a NO-GO verdict from real evidence; refuse out-of-scope questions.",
    examples: "POST /copilot/explain-verdict · /ask · /draft-report.",
    failureMode: "Refuses unmatched intents; draft reports require human review.",
    evidence: "Audit log + governance/usefulness/evals endpoints.",
    sourceRefs: [{ label: "telemetry_copilot.py", path: "backend/app/routes/telemetry_copilot.py" }],
  },
  {
    layer: "AI gateway (LLM + RAG)",
    purpose: "Streamed chat answers grounded in an indexed corpus (pgvector).",
    examples: "POST /api/ai/gateway/ask (SSE: token | citation | tool_call | done).",
    failureMode: "Health endpoint reports rag_available; no corpus support → no claim.",
    evidence: "Citations in the stream; call logs + stats endpoints.",
    sourceRefs: [{ label: "ai_gateway.py", path: "backend/app/services/ai_gateway.py" }],
  },
  {
    layer: "AI provider dispatch",
    purpose: "Pick a provider/model under a typed risk/privacy policy; execute or fail closed.",
    examples: "GET /api/ai/dispatch/providers · POST /route (dry-run) · POST /run.",
    failureMode: "Blocks (403) before any provider call when AI_DISPATCH_ENABLED is off or tenantless.",
    evidence: "Every run writes a dispatch receipt (provider, model, tokens, latency, null_reason).",
    sourceRefs: [{ label: "ai_dispatch.py", path: "backend/app/routes/ai_dispatch.py" }, { label: "registry.py", path: "backend/app/services/ai_dispatch/registry.py" }],
  },
  {
    layer: "Audit + receipts",
    purpose: "Persist every tool call and decision with redaction.",
    examples: "GET /api/audit/events · signed control-tower receipts.",
    failureMode: "Receipt-write failure degrades the result honestly (receipt_status).",
    evidence: "Audit rows + Ed25519-verifiable receipts.",
    sourceRefs: [{ label: "audit.py", path: "backend/app/services/audit.py" }],
  },
];

// ── Section 5: REST API & endpoint map ──────────────────────────────────────────────────────────
export type EndpointRow = {
  method: string;
  path: string;
  usedBy: string;
  purpose: string;
  auth: string;
  sourceRefs: SourceRef[];
};
export type EndpointFamily = { family: string; rows: EndpointRow[] };

export const ENDPOINT_FAMILIES: EndpointFamily[] = [
  {
    family: "Core telemetry serving",
    rows: [
      { method: "GET", path: "/api/telemetry/summary", usedBy: "Overview", purpose: "Inventory counts + headline KPIs.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "GET /summary" }] },
      { method: "GET", path: "/api/telemetry/monitoring", usedBy: "System Health", purpose: "Anomaly rate, PSI, conformal budget.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "GET /monitoring" }] },
      { method: "GET", path: "/api/telemetry/registry", usedBy: "Model Registry", purpose: "All model runs + gate + drift.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "GET /registry" }] },
      { method: "GET", path: "/api/telemetry/model-performance", usedBy: "Model Performance", purpose: "Promoted-model exact metrics.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "GET /model-performance" }] },
      { method: "POST", path: "/api/telemetry/score", usedBy: "Scoring", purpose: "Score a window vs the champion.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "POST /score" }] },
      { method: "GET", path: "/api/telemetry/replay", usedBy: "Replay", purpose: "Deterministic champion replay feed.", auth: "public read", sourceRefs: [{ ...TEL_ROUTES, note: "GET /replay" }] },
      { method: "GET", path: "/api/telemetry/{runs,run/{id},findings,ncr,fused-vector-info,metadata/graph,health}", usedBy: "Runs / Health / Factory / Metadata", purpose: "Remaining serving reads.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "+7 more endpoints" }] },
    ],
  },
  {
    family: "Stream & Stargate",
    rows: [
      { method: "GET", path: "/api/telemetry/stream/live", usedBy: "Mission Control", purpose: "Ring-buffer rows + freshness.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "GET /stream/live" }] },
      { method: "POST", path: "/api/telemetry/stream/control", usedBy: "Mission Control", purpose: "Start/restart the stream worker.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "POST /stream/control" }] },
      { method: "GET", path: "/api/telemetry/stargate/provenance", usedBy: "Stargate Live", purpose: "Durable Kafka provenance lookup.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "GET /stargate/provenance" }] },
    ],
  },
  {
    family: "Control Tower",
    rows: [
      { method: "POST", path: "/api/telemetry/control-tower/score-and-gate", usedBy: "Agent Control Tower", purpose: "Score + open a go/no-go gate.", auth: "operator", sourceRefs: [{ label: "telemetry_control_tower.py", path: "backend/app/routes/telemetry_control_tower.py" }] },
      { method: "GET", path: "/api/telemetry/control-tower/receipts/{id}/verify", usedBy: "Agent Control Tower", purpose: "Verify a signed receipt.", auth: "public read", sourceRefs: [{ label: "telemetry_control_tower.py", path: "backend/app/routes/telemetry_control_tower.py" }] },
      { method: "GET", path: "/api/telemetry/control-tower/public-key", usedBy: "Agent Control Tower", purpose: "Ed25519 public key for offline verify.", auth: "public read", sourceRefs: [{ label: "telemetry_control_tower.py", path: "backend/app/routes/telemetry_control_tower.py" }] },
    ],
  },
  {
    family: "Copilot (LLM)",
    rows: [
      { method: "POST", path: "/api/telemetry/copilot/explain-verdict", usedBy: "Test Intelligence", purpose: "Explain a NO-GO at the fire tick.", auth: "env-scoped", sourceRefs: [{ label: "telemetry_copilot.py", path: "backend/app/routes/telemetry_copilot.py" }] },
      { method: "GET", path: "/api/telemetry/copilot/evals", usedBy: "Test Intelligence", purpose: "Last recorded eval-suite results.", auth: "env-scoped", sourceRefs: [{ label: "telemetry_copilot.py", path: "backend/app/routes/telemetry_copilot.py" }] },
    ],
  },
  {
    family: "AI dispatch & gateway",
    rows: [
      { method: "GET", path: "/api/ai/dispatch/providers", usedBy: "Dispatch admin", purpose: "List providers + availability.", auth: "auth", sourceRefs: [{ label: "ai_dispatch.py", path: "backend/app/routes/ai_dispatch.py" }] },
      { method: "POST", path: "/api/ai/dispatch/run", usedBy: "Dispatch admin", purpose: "Execute governed dispatch (gated).", auth: "auth + tenant", sourceRefs: [{ label: "ai_dispatch.py", path: "backend/app/routes/ai_dispatch.py" }] },
      { method: "POST", path: "/api/ai/gateway/ask", usedBy: "Copilot/chat", purpose: "Streamed RAG answer (SSE).", auth: "auth", sourceRefs: [{ label: "ai_gateway.py", path: "backend/app/routes/ai_gateway.py" }] },
    ],
  },
  {
    family: "MCP & audit",
    rows: [
      { method: "GET", path: "/api/telemetry/mcp/tools", usedBy: "Reference / tooling", purpose: "List the registered telemetry MCP tools.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "GET /mcp/tools" }] },
      { method: "POST", path: "/api/telemetry/mcp/check", usedBy: "Reference / tooling", purpose: "Demo the scope policy through the audited executor.", auth: "env-scoped", sourceRefs: [{ ...TEL_ROUTES, note: "POST /mcp/check" }] },
      { method: "GET", path: "/api/audit/events", usedBy: "Audit surfaces", purpose: "List audit events (filterable).", auth: "tenant-scoped", sourceRefs: [{ label: "audit.py", path: "backend/app/routes/audit.py" }] },
    ],
  },
];

export const PLANNED_ENDPOINTS: { method: string; path: string; note: string }[] = [
  { method: "—", path: "Live Vertex training submit", note: "Offline pipeline writes receipts; no UI-triggered training endpoint ships." },
  { method: "—", path: "Real-time RUL inference", note: "Planned; calibration evidence ships, live inference does not." },
];

// ── Section 6: MCP tool map ─────────────────────────────────────────────────────────────────────
export type McpToolRow = {
  name: string;
  capability: string;
  useCase: string;
  risk: string;
  permission: string;
  audit: string;
};

export const MCP_TOOLS: McpToolRow[] = [
  { name: "telemetry.get_triggering_prediction", capability: "Fetch the NO_GO prediction receipt at a fire tick.", useCase: "Explain why a verdict fired.", risk: "low (read)", permission: "read · scope-enforced", audit: "audited via execute_tool" },
  { name: "telemetry.get_model_run_detail", capability: "Fetch promoted-model metadata (metrics + gate).", useCase: "Show model provenance.", risk: "low (read)", permission: "read · scope-enforced", audit: "audited via execute_tool" },
  { name: "telemetry.get_anomaly_events_in_window", capability: "List labeled/detected events in a tick window.", useCase: "Compare detections to labels.", risk: "low (read)", permission: "read · scope-enforced", audit: "audited via execute_tool" },
  { name: "telemetry.preview_score_window", capability: "Score a supplied window WITHOUT writing a receipt.", useCase: "What-if scoring during review.", risk: "low (read)", permission: "read · scope-enforced", audit: "audited via execute_tool" },
];

export const MCP_TOOLS_SOURCE: SourceRef = { label: "telemetry_tools.py", path: "backend/app/mcp/tools/telemetry_tools.py" };

export const MCP_MUST_NOT: string[] = [
  "No unscoped production writes — telemetry tools are read-only; out-of-scope calls return tool_not_in_telemetry_scope.",
  "No destructive DB migrations without explicit human approval.",
  "No secret exposure — inputs/outputs are redacted before they hit the audit log.",
  "No fake success receipts — a failed tool call is recorded as failed, not green.",
  "No unaudited execution — every tool call goes through the audited executor.",
];

// ── Section 7: CLI / DevOps command blocks ──────────────────────────────────────────────────────
export type CmdBlock = { title: string; commands: string[]; note?: string; sourceRefs: SourceRef[] };

const PKG: SourceRef = { label: "package.json", path: "repo-b/package.json" };

export const CLI_BLOCKS: CmdBlock[] = [
  {
    title: "Local development",
    commands: [
      "# Frontend (repo-b)",
      "cd repo-b && npm run dev",
      "",
      "# Business OS backend (FastAPI)",
      "cd backend && uvicorn app.main:app --reload --port 8000",
    ],
    sourceRefs: [PKG, { label: "backend/README.md", path: "backend/README.md" }],
  },
  {
    title: "Testing",
    commands: [
      "cd repo-b",
      "npm run typecheck      # tsc --noEmit",
      "npm run lint           # next lint",
      "npm run test:unit      # vitest run",
      "npm run test:e2e       # playwright (when needed)",
      "",
      "# Backend",
      "cd backend && python3.11 -m pytest tests/test_telemetry_*.py",
    ],
    sourceRefs: [PKG],
  },
  {
    title: "Database / schema",
    commands: [
      "cd repo-b",
      "npm run db:apply       # apply schema bundle",
      "npm run db:verify      # verify applied schema",
    ],
    note: "No migration is required for this reference page.",
    sourceRefs: [PKG],
  },
  {
    title: "Deployment",
    commands: [
      "# Backend → Railway (run from backend/)",
      "scripts/deploy_backend.sh   # railway up --service authentic-sparkle",
      "curl -s https://<backend>/version   # confirm the live git SHA",
      "",
      "# Frontend → Vercel project 'consulting-app' (root repo-b, serves novendor.ai)",
      "vercel deploy --prod   # from repo root",
    ],
    note: "Exact project/deploy details live in CLAUDE.md / docs/tips.md (source of truth) — auto- vs manual-deploy is recorded there, not asserted here. No secrets shown.",
    sourceRefs: [{ label: "deploy_backend.sh", path: "scripts/deploy_backend.sh" }, CLAUDE_MD],
  },
  {
    title: "Git / PR workflow",
    commands: [
      "git worktree add -b feat/<topic> <path> origin/main   # isolated checkout",
      "gh pr create --fill                                    # open PR; CI gates run",
      "gh pr merge --squash                                   # after green + review",
    ],
    note: "Work lands via PR + CI; branch protection + hooks block direct pushes to main.",
    sourceRefs: [{ label: "pre-push", path: ".githooks/pre-push" }],
  },
];

// ── Section 8: CI/CD & release gates ────────────────────────────────────────────────────────────
export const RELEASE_FLOW: string[] = [
  "feature branch", "plan / ticket", "implementation", "tests", "PR", "review", "merge",
  "Vercel frontend deploy", "Railway backend deploy", "migrations / health checks",
  "smoke tests", "production verification", "rollback if failed",
];

export type CiGateRow = { gate: string; catches: string; evidence: string; blocks: boolean; sourceRefs: SourceRef[] };

const CI: SourceRef = { label: "ci.yml", path: ".github/workflows/ci.yml" };

export const CI_GATES: CiGateRow[] = [
  { gate: "check-mass-deletion", catches: "PRs deleting >100 files.", evidence: "CI job in ci.yml", blocks: true, sourceRefs: [CI, { label: "pre-commit", path: ".githooks/pre-commit" }] },
  { gate: "backend-lint", catches: "ruff lint + full backend pytest.", evidence: "python -m ruff check; pytest", blocks: true, sourceRefs: [CI] },
  { gate: "repo-guardrails", catches: "Assistant-runtime + repo guardrail violations.", evidence: "node scripts/check_repo_guardrails.mjs", blocks: true, sourceRefs: [CI] },
  { gate: "frontend-quality", catches: "lint + typecheck + vitest in repo-b.", evidence: "npm run lint/typecheck/test:unit", blocks: true, sourceRefs: [CI] },
  { gate: "db-schema-gate", catches: "Schema idempotency + RLS contract.", evidence: "apply twice + verify", blocks: true, sourceRefs: [CI] },
];

// ── Section 9: evidence / "can I see…?" checklist ────────────────────────────────────────────────
export const EVIDENCE_CHECKLIST: string[] = [
  "Can I see the source data? — public datasets + lineage/metadata explorer.",
  "Can I see the model version? — Model Registry + model-run records.",
  "Can I see the API response? — every page maps to a real /api/telemetry/* endpoint.",
  "Can I see the tool call? — MCP scope check + audit events.",
  "Can I see the audit row? — GET /api/audit/events; signed control-tower receipts.",
  "Can I see the CI run? — GitHub Actions ci.yml jobs on the PR.",
  "Can I see what happens when data is missing? — designed fail-closed null_reason states.",
  "Can I see what is simulated vs live? — source_kind / serving_provenance / capture-mode labels.",
];

// ── Section 10: honest boundaries ───────────────────────────────────────────────────────────────
export type BoundaryRow = {
  area: string;
  realToday: string;
  simulated: string;
  planned: string;
  uiSays: string;
  sourceRefs: SourceRef[];
};

export const BOUNDARIES: BoundaryRow[] = [
  { area: "Live telemetry stream", realToday: "Stream worker + freshness/lag metrics.", simulated: "Default 'capture' mode is deterministic/synthetic.", planned: "Sustained live ISS/ADS-B ingest.", uiSays: "Source mode reported on every control call.", sourceRefs: [{ ...TEL_ROUTES, note: "stream/*" }] },
  { area: "Replay evidence", realToday: "Real champion outputs over a labeled window.", simulated: "Served from a committed fixture, not live /score.", planned: "—", uiSays: "'Replay experiment receipt — no live compute triggered.'", sourceRefs: [{ label: "replay_fixture.json", path: "backend/app/data/telemetry/replay_fixture.json" }] },
  { area: "Anomaly champion", realToday: "Rolling-MAD model, promoted on operational metrics.", simulated: "—", planned: "—", uiSays: "'PCA looked smarter. MAD operated better. MAD stayed champion.'", sourceRefs: [{ label: "telemetry_serving.py", path: "backend/app/services/telemetry_serving.py" }] },
  { area: "LSTM / forecast model", realToday: "—", simulated: "—", planned: "Challenger/diagnostic only.", uiSays: "Shown as not promoted unless it wins on operational metrics.", sourceRefs: [TEL_PLAN] },
  { area: "RAG analyst", realToday: "AI gateway with pgvector retrieval.", simulated: "—", planned: "Broader corpus coverage.", uiSays: "Refuses when the corpus lacks support; rag_available in health.", sourceRefs: [{ label: "ai_gateway.py", path: "backend/app/services/ai_gateway.py" }] },
  { area: "MCP tools", realToday: "4 read-only, scope-enforced telemetry tools.", simulated: "—", planned: "No write tools by design.", uiSays: "Out-of-scope → tool_not_in_telemetry_scope.", sourceRefs: [MCP_TOOLS_SOURCE] },
  { area: "Deployment infra", realToday: "Vercel frontend (novendor.ai) + Railway backend.", simulated: "—", planned: "—", uiSays: "Exact project names in CLAUDE.md; SHA on /version.", sourceRefs: [CLAUDE_MD, { label: "deploy_backend.sh", path: "scripts/deploy_backend.sh" }] },
  { area: "GCP / Databricks / Confluent / BQ", realToday: "Training + lineage references where configured.", simulated: "Local fallback when a source is absent.", planned: "Always-on managed pipeline.", uiSays: "provenance: databricks | local_fallback.", sourceRefs: [{ label: "telemetry-platform/", path: "telemetry-platform/" }] },
  { area: "Gemma provider", realToday: "Registered in the dispatch registry.", simulated: "—", planned: "Endpoint is cold; deploy-on-demand.", uiSays: "Lifecycle gated by CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED.", sourceRefs: [{ label: "registry.py", path: "backend/app/services/ai_dispatch/registry.py" }] },
  { area: "Audit receipts", realToday: "Audit events + Ed25519-signed gate receipts.", simulated: "—", planned: "—", uiSays: "Receipts are offline-verifiable via the public key.", sourceRefs: [{ label: "audit.py", path: "backend/app/services/audit.py" }] },
];

// ── Section 11: why this matters (short, no hype) ───────────────────────────────────────────────
export const WHY_IT_MATTERS: string[] = [
  "It shows system thinking, not an isolated model demo.",
  "It shows how AI-assisted engineering can be governed: plan, PR, CI, review, receipt.",
  "It connects ML, LLMs, REST APIs, MCP tools, CI/CD, and data lineage in one place.",
  "It proves the platform can be operated by a team, not a single author.",
  "It separates demo-scale substrate from the production-scale target honestly.",
  "It makes failure modes visible — fail-closed nulls, cold infra, fixtures — instead of burying them.",
];

// Anchored sections, in render order. id drives both the TOC and the in-page anchors.
export const SECTIONS: { id: string; n: number; title: string }[] = [
  { id: "documents", n: 1, title: "What this page documents" },
  { id: "page-inventory", n: 2, title: "Page-by-page AI connection inventory" },
  { id: "skills", n: 3, title: "AI skills used to build the demo" },
  { id: "runtime", n: 4, title: "Runtime AI connections" },
  { id: "rest-api", n: 5, title: "REST API & endpoint map" },
  { id: "mcp", n: 6, title: "MCP & tool-use map" },
  { id: "cli", n: 7, title: "CLI / DevOps operations" },
  { id: "cicd", n: 8, title: "CI/CD & release gates" },
  { id: "evidence", n: 9, title: "Evidence, audit & receipts" },
  { id: "boundaries", n: 10, title: "Honest boundaries" },
  { id: "why", n: 11, title: "Why this matters for a Director of Data & AI demo" },
];
