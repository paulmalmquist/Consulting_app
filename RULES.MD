# Business OS – Core System Rules

This file defines non-negotiable architectural, accounting, security, and determinism standards.

If a feature violates these rules, it must not be implemented.

Last updated: 2026-02-20 — synchronized with repo inventory and REPE underwriting engine scope.

---

## PART A — PLATFORM FOUNDATION

---

### 1. FINANCIAL DETERMINISM

- All financial math must run in backend Python (backend/app/finance/).
- All engines must be replayable from their stored inputs alone.
- No financial calculation may depend on UI state or client-supplied computed values.
- Use Python `Decimal` throughout; no float arithmetic on monetary values.
- All outputs must be ledger-backed; no in-memory-only totals exposed to callers.
- No opaque JSON financial summaries — every returned figure must be traceable to a
  ledger entry or engine run.
- Engine modules in scope: allocation_engine, capital_account_engine, clawback_engine,
  irr_engine, posting_engine, waterfall_engine, trust_engine, scenario_engine,
  construction_forecast_engine, provider_comp_engine, execution_runtime,
  underwriting_engine, risk_scoring_engine, cmbs_surveillance_engine,
  monte_carlo_engine, capital_call_engine, distribution_forecast_engine.
- Adding a new financial engine requires: unit tests, run-ID assignment, and
  audit-log integration before merge.

---

### 2. LEDGER DISCIPLINE

- Every capital movement must generate double-entry journal entries via posting_engine.
- No direct balance mutations on any finance table.
- All balances are derived from ledger replay (fin_accounting_core, fin_capital_accounts).
- GL reconciliation is mandatory; reconciliation views in 995_fin_views.sql must remain
  consistent.
- Period close must freeze prior entries; no backdating after close.
- Trust accounts (trust_engine, real_estate trust pages) must post to separate ledger
  partitions — never commingled with operating accounts.
- Capital calls, distributions, and promote payouts must each generate journal entries
  with full tranche attribution (LP, GP, promote, clawback reserve).

---

### 3. WATERFALL ENGINE RULES

- Tier definitions must be stored structurally in fin_repe.sql / repe_object_model tables;
  no hard-coded tier logic in application code.
- Preferred return must support both simple and compounding accrual.
- Catch-up must be an explicit, separately parameterized tier — not inlined into carry math.
- Promote/carry percentages must be parameterized per fund/deal record.
- Clawback must be calculable at any point in time from clawback_engine without running
  a full distribution pass.
- GP carry crystallization timing must be modeled explicitly — carry is not realized
  until the crystallization event is triggered and posted.
- Engine must support:
  - American (deal-by-deal)
  - European (whole-fund)
  - Hybrid (deal-by-deal with whole-fund clawback)
- Waterfall runs are initiated via the background job queue (Celery / finance/tasks.py);
  synchronous HTTP calls must not block on waterfall computation.
- Each waterfall run must produce a structured output persisted under a unique run_id.
- Waterfall output must include per-tier breakdown: LP return, GP carry, catch-up,
  promote payout amount, MOIC per tranche.

---

### 4. SCENARIO ISOLATION

- No scenario may mutate live production data.
- All simulations require an environment partition (Demo Lab per-env schema in repo-c,
  or scenario_engine sandbox in backend/app/finance/scenario_engine.py).
- Snapshots must be versioned and tied to a run_id.
- Rollback must be possible to any prior versioned snapshot.
- Lab environments (repo-c) may not share a schema with Business OS production tables.
- Finance scenarios (finance_scenarios.py) must write results to a scenarios result table,
  never update live fund/deal/capital-account rows.
- Monte Carlo simulations produce probability distributions, not point estimates; results
  stored as run arrays tied to a scenario run_id.

---

### 5. MULTI-ENTITY MODELING

- All entities (LPs, GPs, funds, deals, assets, investors) must support parent-child
  relationships as defined in fin_entity_core.sql.
- All allocations must support multiple participants via allocation_engine.py.
- No industry-specific math embedded in the GL layer (fin_accounting_core.sql).
- Allocation engine must remain abstracted and callable by REPE, Construction,
  Healthcare, and Legal modules without modification.
- Cross-entity relationships must be expressed via association tables, not foreign-key
  chains that embed business logic in schema.
- Fund-level entities must support multi-asset portfolio aggregation: weighted average
  DSCR, weighted average LTV, diversification scoring, IRR contribution per asset.

---

### 6. PERMISSION ENFORCEMENT

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
- IC memo access must be scoped: draft memos visible only to originator and IC members
  until formally circulated.

---

### 7. AUDIT LOGGING

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
- Underwriting model runs, risk score changes, and IC memo generation events must
  produce audit records with full assumption snapshots.

---

### 8. INDUSTRY EXTENSIBILITY

- REPE, Legal, Healthcare, and Construction share:
  - Ledger (fin_accounting_core.sql, posting_engine.py)
  - Allocation engine (allocation_engine.py)
  - Scenario engine (scenario_engine.py)
  - Execution runtime (execution_runtime.py)
- Industry modules (finance_repe.py, finance_legal.py, finance_healthcare.py,
  finance_construction.py, underwriting/) may extend core but must not fork or
  duplicate it.
- New industry modules must route through finance_common.py for shared operations.
- Adding a new industry vertical requires a schema migration file
  (`db/schema/2xx_fin_{industry}.sql`) and a corresponding service file
  (`services/finance_{industry}.py`); no inline logic in routes.
- Underwriting engine must be property-type-agnostic at the interface level:
  multifamily, industrial, office, retail, and CMBS each provide type-specific
  assumptions but share the same calculation pipeline.

---

### 9. PERFORMANCE

- Heavy math (waterfall runs, IRR, scenario sweeps, clawback recalculation, Monte Carlo,
  risk scoring) must run via Celery task queue (finance/celery_app.py, finance/tasks.py).
- HTTP request handlers must not block on financial engine computation; return a
  job_id and let the client poll or subscribe.
- All engines must be idempotent: running the same engine with the same run_id must
  produce identical output.
- Document extraction (extraction.py, pdf_processing.py) runs as a background task;
  synchronous extraction is permitted only in test fixtures.
- MCP rate limiting (mcp/rate_limit.py) applies to all tool categories; REST API
  endpoints must add equivalent rate limiting before production launch.
- Monte Carlo simulations (1,000+ iterations) must run as background jobs; never
  synchronous in a request handler.

---

### 10. MIGRATION DISCIPLINE

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

---

### 11. DOCUMENT GOVERNANCE

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
- IC memos are versioned documents; each generation event creates a new version, never
  overwrites.

---

### 12. TRUST & SEGREGATION

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

---

### 13. EXECUTION ENGINE

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

---

### 14. UI RULE

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

---

### 15. MCP & AI TOOL GOVERNANCE

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

---

### 16. BACKEND ARCHITECTURE

- Three-layer structure is mandatory: routes/ (HTTP boundary) -> services/ (business
  logic) -> finance/ engines (computation). No route may call an engine directly.
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

---

## PART B — INSTITUTIONAL REPE UNDERWRITING ENGINE

These rules govern the fund-grade underwriting framework. The engine must support
multifamily, industrial, office repositioning, retail, and CMBS loan purchases
through a shared calculation pipeline with property-type-specific assumption modules.

---

### 17. ACQUISITION UNDERWRITING ENGINE

The base underwriting engine calculates deal economics from raw inputs. No shortcuts.

Required inputs (stored structurally, never hard-coded):

- Purchase price, closing costs (% and dollar)
- CapEx budget (total and per-unit)
- In-place rent, market rent, occupancy
- Other income per unit
- Operating expenses (line item and ratio)
- Debt terms: LTV, rate, IO period, amortization schedule
- Exit cap rate, hold period

Required outputs (all must be Decimal-precision, all must be engine-computed):

- Gross Potential Rent (GPR)
- Vacancy loss (physical + economic, separately)
- Effective Gross Income (EGI)
- Other income
- Operating expenses (line item + ratio comparison)
- Net Operating Income (NOI)
- Going-in cap rate
- Price per unit, price per SF
- Debt service (monthly + annual)
- DSCR
- Cash-on-cash return
- Levered IRR, unlevered IRR
- Equity multiple
- Breakeven occupancy
- Debt yield
- Loan constant
- Implied value at market cap
- Value per basis point of cap rate movement

Rules:

- No output may be returned without the full chain of intermediate calculations stored.
- Each underwriting run produces a run_id with all inputs and outputs persisted.
- Aggressive assumptions must be flagged: rent growth above market comps, exit cap
  tighter than going-in, expense ratio below 30% for multifamily.
- Contradictions must be surfaced: NOI growth assumed but occupancy declining, exit cap
  tighter than trailing cap in softening market.

---

### 18. STABILIZATION & VALUE-ADD MODEL

Extends the base underwriting with renovation and lease-up projections.

Additional inputs:

- Rent growth assumption (annual %)
- Expense growth assumption (annual %)
- Renovation premium per unit
- Renovation cost per unit
- Lease-up timeline (months to stabilization)

Required outputs:

- Stabilized NOI
- Return on cost (ROC)
- Development spread (ROC minus exit cap)
- Yield on cost vs market cap
- Exit value
- Profit on sale

Required sensitivity outputs (engine must produce grids, not single values):

- IRR sensitivity to rent growth +/- 100bps
- IRR sensitivity to exit cap +/- 50bps
- DSCR stress test at +100bps interest rate
- Breakpoint where DSCR falls below 1.25x

Rules:

- Sensitivity grids are engine outputs, not UI calculations.
- Stabilization assumptions must include a time-to-stabilize parameter; no instantaneous
  stabilization allowed.
- Value-add renovation costs must flow through CapEx ledger entries, not operating expenses.

---

### 19. CAPITAL STACK STRUCTURING

The engine must model multiple capital structures for the same deal simultaneously.

Required structures (minimum):

- A) Senior debt only
- B) Senior + preferred equity
- C) Senior + mezzanine
- D) Lower leverage conservative case

Per-structure required outputs:

- Weighted average cost of capital (WACC)
- Equity contribution required
- Promote structure (parameterized: pref rate, split, catch-up)
- GP catch-up amount and timing
- Waterfall tiers (linked to waterfall_engine, Section 3)
- IRR to LP, IRR to GP (separately)
- Promote payout amount
- Capital at risk per tranche
- MOIC per tranche

Rules:

- Capital stack structures are stored as configuration records, not code branches.
- Each structure must produce a complete waterfall run via waterfall_engine; no
  simplified or shortcut calculations.
- The engine must support equity recycling: reinvestment of disposition proceeds into
  new acquisitions within the same fund vehicle.
- GP carry crystallization must be modeled with explicit timing — not assumed at exit.

---

### 20. REFINANCE SCENARIO ENGINE

Models mid-hold refinance events and their impact on returns.

Required inputs:

- Refinance timing (year of hold)
- Updated NOI at refi date (from stabilization model)
- New LTV, rate, IO period, amortization

Required outputs:

- New valuation based on updated NOI
- Refi proceeds
- Equity returned to LPs
- Cash-on-cash post-refi
- IRR impact (compared to hold-to-maturity base case)
- DSCR post-refi

Required stress scenarios (engine must run all three automatically):

- 100bps higher rates than base case
- 5% NOI decline from projection
- 10% valuation haircut

Rules:

- Refinance events generate ledger entries: debt payoff, new debt origination,
  equity return distributions.
- Refinance scenarios must be stored as scenario runs, not mutations to the base model.
- Each stress scenario is a separate run_id with full output.

---

### 21. CMBS SURVEILLANCE ENGINE

Converts deal-level metrics into CMBS-style surveillance analysis.

Required outputs:

- Debt yield
- DSCR (actual and stressed at +200bps)
- LTV at issuance and current
- Implied value if cap rate widens 75bps
- Expected loss given default
- Recovery rate
- Balloon risk at maturity
- Refinance risk probability score

Watchlist trigger thresholds (parameterized, not hard-coded):

- DSCR below 1.15x
- Occupancy below 85%
- NOI decline exceeding 10% trailing 12 months
- Debt yield below 8%

Surveillance risk rating output:

- LOW / MODERATE / HIGH / CRITICAL
- Rating must include the triggering metrics and threshold breaches.
- Rating changes must generate audit log entries.

Rules:

- Surveillance runs on a schedule (Celery periodic task) or on-demand; never only
  at origination.
- Watchlist thresholds are configuration records per loan/deal, not global constants.
- CMBS engine must be property-type-agnostic: same interface for multifamily,
  industrial, office, retail.

---

### 22. RISK SCORING ENGINE

Produces a composite risk score (1-100) across multiple dimensions.

Required scoring dimensions:

- Market risk (submarket fundamentals, supply pipeline, absorption)
- Interest rate risk (rate sensitivity, floating vs fixed exposure)
- Execution risk (renovation scope, operator track record)
- Lease-up risk (time to stabilization, concession burn)
- Capital stack complexity (number of tranches, subordination depth)
- Liquidity risk (hold period, exit market depth)
- Refinance risk (balloon maturity, DSCR trajectory)
- Concentration risk (fund-level: % of equity in single asset/market)

Rules:

- Each dimension scored independently (1-100) with weighted composite.
- Weights are parameterized per fund/strategy, not hard-coded.
- Risk scores are engine outputs with run_ids; not UI-computed badges.
- Score changes between runs must be diffable and auditable.
- No dimension may be omitted from the composite; partial scores must be flagged as
  incomplete.

---

### 23. INVESTMENT COMMITTEE MEMO GENERATOR

Produces structured IC memo content from engine outputs. The memo is a document, not
a dashboard view.

Required sections:

- Executive summary (auto-generated from deal metrics)
- Investment thesis (templated with deal-specific data)
- Key risks (pulled from risk scoring engine output)
- Downside case, base case, upside case (from scenario engine runs)
- Sensitivity table (from stabilization engine grid output)
- Capital stack summary (from capital stack engine)
- Recommendation: APPROVE / REVISE / DECLINE (derived from risk score thresholds)

Rules:

- IC memos are versioned documents (Section 11 applies).
- Memo generation is an execution engine run with a run_id.
- All figures in the memo must reference their source engine run_id — no detached
  numbers.
- The recommendation is derived from parameterized thresholds on risk score and return
  metrics; no hard-coded approve/decline logic.
- Draft memos are not visible to LPs or external parties (Section 6 permission rules
  apply).
- Memos must support PDF export with branded templates.

---

### 24. FUND-LEVEL PORTFOLIO ENGINE

Aggregates deal-level underwriting into fund-level portfolio analytics.

Required inputs:

- Fund size, target equity, target leverage
- Asset-level underwriting runs (linked by fund_id)

Required outputs:

- Percentage of total equity deployed per asset
- Portfolio weighted average DSCR
- Portfolio weighted average LTV
- Diversification index (property type, geography, vintage)
- IRR contribution per asset to fund-level return
- Risk concentration score (per asset and per market)
- Capital call schedule (timing and amounts per LP commitment)
- Distribution forecast by LP tranche (quarterly projected)

Rules:

- Portfolio metrics are derived from the constituent deal runs; no separate manual
  input of portfolio-level numbers.
- Capital call schedule must generate projected ledger entries; calls are not just
  a timeline — they must tie to the allocation engine.
- Distribution forecasts are scenario-dependent: base, upside, downside each produce
  a separate forecast.
- Fund-level metrics must update automatically when any constituent deal run is
  re-executed.

---

### 25. STOCHASTIC MODELING RULES

Governs Monte Carlo simulation and probability-weighted outputs.

Required capabilities:

- Monte Carlo simulation on rent growth and exit cap rate
- Probability-weighted IRR (distribution, not point estimate)
- Covenant breach forecasting timeline (probability of breach by period)
- NOI margin compression modeling (stochastic expense shocks)
- Reversion value based on replacement cost (floor valuation)

Rules:

- Monte Carlo runs must store the full iteration array, not just summary statistics.
- Random seeds must be stored per run_id for reproducibility.
- Minimum 1,000 iterations for any Monte Carlo output used in IC memos; configurable
  upward.
- Probability-weighted IRR must report: mean, median, 5th percentile, 25th percentile,
  75th percentile, 95th percentile.
- Stochastic models run as Celery background jobs (Section 9); never synchronous.
- Results are scenario runs (Section 4 isolation rules apply).

---

### 26. TAX IMPACT MODELING

Models depreciation, cost segregation, and tax-adjusted returns.

Required capabilities:

- Straight-line and accelerated depreciation schedules
- Cost segregation study allocation (5yr, 7yr, 15yr, 27.5yr, 39yr components)
- After-tax IRR and equity multiple
- Depreciation recapture at disposition
- Capital gains treatment (short-term vs long-term)

Rules:

- Tax calculations are engine outputs, not spreadsheet overlays.
- Depreciation schedules must be stored as structured records, not computed on-the-fly
  from assumptions alone.
- Tax modeling is optional per deal but required for IC memos when tax-advantaged
  structures are part of the thesis.
- All tax outputs must carry a disclaimer flag: "for modeling purposes only, not tax advice."

---

### 27. CROSS-PROPERTY-TYPE REUSABILITY

The underwriting engine must be reusable across property types without forking.

Supported property types (minimum):

- Multifamily
- Industrial
- Office (including repositioning)
- Retail
- CMBS loan purchases

Rules:

- The calculation pipeline is shared; property-type-specific logic lives in assumption
  modules (e.g., rent roll structure, TI/LC for office, cam reimbursements for retail).
- Property type is a parameter on the deal record, not a code branch.
- Adding a new property type requires: an assumption module, test fixtures, and seed
  data — not a new engine.
- CMBS loan purchases use the same underwriting pipeline but enter at the debt-level
  (no equity stack); the engine must handle this without special-case branching.

---

### 28. STRUCTURED OUTPUT REQUIREMENTS

All engine outputs must be available as structured JSON for downstream consumption.

Required structured outputs:

- Underwriting model (all inputs + all computed outputs)
- Waterfall distribution (per-tier, per-tranche)
- Sensitivity grid (2D matrix: row variable x column variable)
- IC memo (structured sections with source run_id references)
- Risk scorecard (per-dimension scores + composite)
- CMBS surveillance snapshot (all metrics + watchlist status + rating)
- Capital call schedule (per-LP, per-period)
- Distribution forecast (per-LP, per-period, per-scenario)

Rules:

- All structured outputs must conform to Pydantic schemas in backend/app/schemas/.
- No output may be returned as untyped dict; every field must be named and typed.
- JSON outputs must include metadata: run_id, engine_version, timestamp, assumption
  snapshot hash.
- These outputs are the contract between backend engines and frontend display; breaking
  schema changes require migration and versioning.

---

## PART C — DEFAULTS

If unsure, default to:

- Determinism
- Auditability
- Ledger-first design
- Isolation over convenience
- Backend enforcement over frontend convenience
- Flag aggressive assumptions rather than silently accepting them
- Institutional standards over simplified models
- Stress everything; surface contradictions
