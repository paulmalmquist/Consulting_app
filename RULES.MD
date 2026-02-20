# Business OS – Core System Rules

This file defines non-negotiable architectural, accounting, security, and determinism standards.

If a feature violates these rules, it must not be implemented.

Last updated: 2026-02-20 — synchronized with repo inventory.

-------------------------------------

1. FINANCIAL DETERMINISM

-------------------------------------

- All financial math must run in backend Python (backend/app/finance/).
- All engines must be replayable from their stored inputs alone.
- No financial calculation may depend on UI state or client-supplied computed values.
- Use Python `Decimal` throughout; no float arithmetic on monetary values.
- All outputs must be ledger-backed; no in-memory-only totals exposed to callers.
- No opaque JSON financial summaries — every returned figure must be traceable to a
  ledger entry or engine run.
- Engine modules in scope: allocation_engine, capital_account_engine, clawback_engine,
  irr_engine, posting_engine, waterfall_engine, trust_engine, scenario_engine,
  construction_forecast_engine, provider_comp_engine, execution_runtime.
- Adding a new financial engine requires: unit tests, run-ID assignment, and
  audit-log integration before merge.

-------------------------------------

1. LEDGER DISCIPLINE

-------------------------------------

- Every capital movement must generate double-entry journal entries via posting_engine.
- No direct balance mutations on any finance table.
- All balances are derived from ledger replay (fin_accounting_core, fin_capital_accounts).
- GL reconciliation is mandatory; reconciliation views in 995_fin_views.sql must remain
  consistent.
- Period close must freeze prior entries; no backdating after close.
- Trust accounts (trust_engine, real_estate trust pages) must post to separate ledger
  partitions — never commingled with operating accounts.

-------------------------------------

1. WATERFALL ENGINE RULES

-------------------------------------

- Tier definitions must be stored structurally in fin_repe.sql / repe_object_model tables;
  no hard-coded tier logic in application code.
- Preferred return must support both simple and compounding accrual.
- Catch-up must be an explicit, separately parameterized tier — not inlined into carry math.
- Promote/carry percentages must be parameterized per fund/deal record.
- Clawback must be calculable at any point in time from clawback_engine without running
  a full distribution pass.
- Engine must support:
  - American (deal-by-deal)
  - European (whole-fund)
- Waterfall runs are initiated via the background job queue (Celery / finance/tasks.py);
  synchronous HTTP calls must not block on waterfall computation.
- Each waterfall run must produce a structured output persisted under a unique run_id.

-------------------------------------

1. SCENARIO ISOLATION

-------------------------------------

- No scenario may mutate live production data.
- All simulations require an environment partition (Demo Lab per-env schema in repo-c,
  or scenario_engine sandbox in backend/app/finance/scenario_engine.py).
- Snapshots must be versioned and tied to a run_id.
- Rollback must be possible to any prior versioned snapshot.
- Lab environments (repo-c) may not share a schema with Business OS production tables.
- Finance scenarios (finance_scenarios.py) must write results to a scenarios result table,
  never update live fund/deal/capital-account rows.

-------------------------------------

1. MULTI-ENTITY MODELING

-------------------------------------

- All entities (LPs, GPs, funds, deals, assets, investors) must support parent-child
  relationships as defined in fin_entity_core.sql.
- All allocations must support multiple participants via allocation_engine.py.
- No industry-specific math embedded in the GL layer (fin_accounting_core.sql).
- Allocation engine must remain abstracted and callable by REPE, Construction,
  Healthcare, and Legal modules without modification.
- Cross-entity relationships must be expressed via association tables, not foreign-key
  chains that embed business logic in schema.

-------------------------------------

1. PERMISSION ENFORCEMENT

-------------------------------------

- All access control enforced at the API layer (FastAPI route dependencies).
- No frontend-only permission logic; middleware.ts in repo-b is for UX routing only,
  not security enforcement.
- Support role-based and entity-scoped access; row-level security policies in
  900_rls.sql and 910_fin_rls.sql must be kept in sync with backend checks.
- Support field-level segregation: PHI fields (healthcare), trust fund data, and
  investor-level capital accounts must not be returned in bulk list endpoints.
- All permission checks must be auditable (logged to operational_audit).
- Production auth must use JWT or equivalent token verified server-side on every
  request; invite-code cookie auth (middleware.ts) is demo-only and must not gate
  sensitive financial data in production deployments.
- MCP tool calls (mcp/auth.py) follow the same permission model as REST endpoints;
  no MCP tool may bypass RLS.

-------------------------------------

1. AUDIT LOGGING

-------------------------------------

- All state mutations logged to operational_audit (235_operational_audit.sql).
- MCP tool calls logged via mcp/audit.py — inputs, caller identity, and outputs.
- Audit logs are append-only; no UPDATE or DELETE permitted on audit tables.
- No silent updates: any PATCH/PUT/DELETE route must write an audit record before
  returning 200.
- Execution runs must log full inputs and structured outputs (execution_runtime.py).
- Each execution run must carry a unique run_id propagated through all downstream
  engine calls and returned to the caller.
- Codex/AI orchestration sessions must produce append-only session logs as defined
  in orchestration/log_schema.json.

-------------------------------------

1. INDUSTRY EXTENSIBILITY

-------------------------------------

- REPE, Legal, Healthcare, and Construction share:
  - Ledger (fin_accounting_core.sql, posting_engine.py)
  - Allocation engine (allocation_engine.py)
  - Scenario engine (scenario_engine.py)
  - Execution runtime (execution_runtime.py)
- Industry modules (finance_repe.py, finance_legal.py, finance_healthcare.py,
  finance_construction.py, underwriting/) may extend core but must not fork or
  duplicate it.
- New industry modules must route through finance_common.py for shared operations.
- Adding a new industry vertical requires a schema migration file (db/schema/2xx\_fin\_{industry}.sql)
  and a corresponding service file (services/finance\_{industry}.py); no inline logic
  in routes.

-------------------------------------

1. PERFORMANCE

-------------------------------------

- Heavy math (waterfall runs, IRR, scenario sweeps, clawback recalculation) must run
  via Celery task queue (finance/celery_app.py, finance/tasks.py).
- HTTP request handlers must not block on financial engine computation; return a
  job_id and let the client poll or subscribe.
- All engines must be idempotent: running the same engine with the same run_id must
  produce identical output.
- Document extraction (extraction.py, pdf_processing.py) runs as a background task;
  synchronous extraction is permitted only in test fixtures.
- MCP rate limiting (mcp/rate_limit.py) applies to all tool categories; REST API
  endpoints must add equivalent rate limiting before production launch.

-------------------------------------

1. MIGRATION DISCIPLINE

-------------------------------------

- All schema changes via numbered migration files in repo-b/db/schema/.
- Naming convention: `NNN_domain.sql` — do not reuse or renumber existing sequence numbers.
- No manual production schema edits.
- Every migration must be reversible (include a rollback block or a companion down
  migration).
- Backfill scripts required for structural changes that affect existing data.
- Demo Lab per-environment schemas (repo-c/migrations/) follow the same discipline;
  they must not diverge structurally from the Business OS schema for shared tables.
- New finance tables require corresponding index entries in 955_fin_indexes.sql and
  view entries in 995_fin_views.sql.

-------------------------------------

1. DOCUMENT GOVERNANCE

-------------------------------------

- Version all documents; document tables must carry a version/revision column.
- Support redline diff storage per document version.
- Enforce document ACL at the API layer (documents.py route); storage-signed URLs
  (supabase_storage_repo.py) must not be returned without a prior auth check.
- Log all downloads for sensitive industries (Healthcare PHI, Legal matters, Trust
  documents) to operational_audit.
- Document extraction results (extraction.py) are derived data; the source file is
  authoritative and must be retained.
- Unsigned or unauthenticated storage URLs must not be exposed to the frontend in
  any production code path.

-------------------------------------

1. TRUST & SEGREGATION

-------------------------------------

- Trust accounts must be separate ledger partitions (trust_engine.py posts to
  isolated trust ledger identifiers).
- PHI (Healthcare module) must be field-level segregated; PHI fields must not appear
  in shared list endpoints or audit log values.
- Cross-entity fund mixing is prohibited; fin_entity_core.sql associations enforce
  entity boundaries.
- No pooled accounting without explicit structural support (a pool entity record,
  pool ledger entries, and documented allocation keys).
- Multi-tenant data must be isolated via RLS (900_rls.sql); no business's data may
  leak into another tenant's query results.

-------------------------------------

1. EXECUTION ENGINE

-------------------------------------

- No stub execution allowed in production; all engines must call real calculation
  logic (execution_runtime.py enforces this).
- All engines must produce structured, schema-validated output (Pydantic models in
  schemas/).
- Engine results must be reproducible: given the same run_id inputs, the engine
  returns identical results.
- Each execution must have a run_id assigned before computation begins; run_id is
  returned to the caller and stored with results.
- Codex orchestration sessions (orchestration/) are execution engine sessions and
  must follow the same run_id, audit-log, and idempotency rules.
- Execution state machine transitions (execution_runtime.py) must be logged; no
  silent state changes.

-------------------------------------

1. UI RULE

-------------------------------------

- UI displays derived data only; all values come from API responses.
- UI (repo-b) must not compute financial outputs, totals, allocations, or
  distributions — even as display formatting. Fetch computed values from backend.
- UI must not bypass API security; Next.js API routes (/api/*) proxy to backend and
  must not skip auth headers.
- Component tests (Vitest) and page tests must not mock financial engine results with
  hardcoded numbers that could mask regressions; use fixture-driven stubs that
  reflect real engine output shapes.
- Dark/light mode, table sorting, and pagination are acceptable client-side
  operations; financial aggregation is not.

-------------------------------------

## 15. MCP & AI TOOL GOVERNANCE

-------------------------------------

- All MCP tools must be registered in mcp/registry.py with a version and schema.
- MCP tool implementations (mcp/tools/) must not call each other directly; compose
  through the registry.
- MCP tools that mutate state must enforce the same auth and audit rules as REST
  endpoints (mcp/auth.py, mcp/audit.py).
- AI sidecar calls (ai/sidecar_client.py, codexBridge.ts) must go through the
  command orchestrator; no direct sidecar calls from UI components.
- Codex orchestration sessions must be scoped: allowed directories, file count
  limits, and intent taxonomy (orchestration/intent_taxonomy.json) enforced before
  execution begins.
- Risk controls (orchestration/risk_controls.md) are non-negotiable; high-risk
  intents require confirmation phrases before proceeding.
- AI-generated code that modifies finance engines, migrations, or RLS policies
  requires human review before merge (enforced via .githooks).

-------------------------------------

## 16. BACKEND ARCHITECTURE

-------------------------------------

- Three-layer structure is mandatory: routes/ (HTTP boundary) → services/ (business
  logic) → finance/ engines (computation). No route may call an engine directly.
- Service files must not embed SQL strings; all queries go through the db.py pool
  with parameterized statements.
- Business OS backend (backend/, port 8000) and Demo Lab API (repo-c/, port 8001)
  are separate deployments; they must not import from each other.
- Shared finance logic must live in backend/app/finance/ or backend/app/services/
  finance_common.py; repo-c must not duplicate finance calculation logic.
- All new routes must be registered in main.py and covered by at least one pytest
  test in backend/tests/.
- Configuration (config.py) is the single source of truth for environment variables;
  no os.environ calls outside config.py.

-------------------------------------

If unsure, default to:

- Determinism
- Auditability
- Ledger-first design
- Isolation over convenience
- Backend enforcement over frontend convenience
