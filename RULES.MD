# Business OS – Core System Rules

This file defines non-negotiable architectural, accounting, security, and determinism standards.

If a feature violates these rules, it must not be implemented.

Last updated: 2026-02-25 — added environment registration rules, seed layer discipline, and bug fix log.

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

## REPE INVARIANT RULES

- Every REPE investment (`repe_deal`) must have at least one linked asset (`repe_asset`).
- `repe_asset.deal_id` is the canonical investment foreign key. UI routing and API calls must use `deal_id` as `investment_id`.
- Investment detail routes must render deterministically even when child lookups fail: the parent investment can show a structured warning, but it must not crash or downgrade to a false “not found”.
- Investment detail may return `404` only when the investment id does not exist. Empty child collections are not a `404`.
- Seed and create flows must create or backfill at least one asset for every investment before the request completes.
- Fund → Investment → Asset referential integrity must be checked by `/api/re/v2/health/integrity`; non-zero orphan or missing-child counts are release blockers.
- No join in investment/fund drill paths may eliminate the parent row because a child row is missing; use `LEFT JOIN` for rollups and diagnostics.
- Direct browser routes must not depend on `bosFetch`-only proxy semantics for core REPE identity reads. Canonical drill-path reads must succeed via direct same-origin API calls.
- Investment navigation links must use the canonical `investment_id` / `deal_id` emitted by the backend; never derive ids from display order or secondary rollup rows.
- Automated coverage must click every seeded investment in the institutional fund, verify the page resolves, verify at least one asset row is rendered, and fail on any client-side exception.

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
# Frontend-Realistic Testing Rules (MANDATORY)

These rules exist to ensure tests behave like a real user session in the browser. Tests must validate UI + routing + network + error states, not just component rendering.

## 1) Always test through the UI, not internal functions
- Prefer Playwright E2E for anything involving navigation, auth, environment selection, and /re drill paths.
- Unit tests are allowed for pure UI components, but anything that depends on API state must have an E2E and/or integration test.

## 2) Network mocking must mirror production shape
- Do NOT stub business logic in the browser.
- Use a single mock layer that imitates the API contract (status codes, error envelopes, latency, and empty states).
- Mock responses must match:
  - URL paths exactly
  - HTTP methods exactly
  - JSON schema exactly
  - error envelope exactly: { error_code, message, detail }
- Mock failure modes explicitly (401, 403, 404, 422, 500, network error).

## 3) Every E2E test must assert “no silent failures”
For each Playwright test:
- Fail if any request returns 500 (unless explicitly testing 500 UI).
- Fail if any request is “Failed to fetch” / network error (unless explicitly testing it).
- Fail if console has errors (except known allowlist).
- Fail if UI displays generic fallback error strings (TBD, placeholder copy, raw stack traces).

## 4) Deterministic test data & environment bootstrap
- Tests must create their own environment(s) via UI or API and never depend on existing prod/staging data.
- Use deterministic fixture builders:
  - createEnv(industry=real_estate)
  - seedFund(strategy=equity|credit|cmbs)
  - seedInvestment()
  - seedJV()
  - seedAsset(type=property|loan)
- Every fixture builder must return IDs and a stable “expected state” snapshot for assertions.

## 5) Use data-testid for all user-critical actions
All clickable elements in the RE drill path MUST have stable selectors:
- env card open: data-testid="env-open"
- re landing: data-testid="re-home"
- fund table: data-testid="fund-list"
- create fund: data-testid="re-create-fund"
- fund wizard: data-testid="re-fund-create-wizard"
- wizard step next/back: data-testid="wizard-next" / "wizard-back"
- fund row: data-testid="fund-row-<fundId>"
- investment list: data-testid="investment-list"
- jv list: data-testid="jv-list"
- asset list: data-testid="asset-list"
- scenario selector: data-testid="scenario-selector"
- run quarter close: data-testid="run-quarter-close"

Never use brittle text selectors for primary flows.

## 6) Contract tests for API clients
- Add API contract tests that validate frontend client decoding:
  - success payloads
  - empty payloads
  - error payloads
  - unexpected payload shape (must surface a friendly error)
- Contract tests must run in CI and block merges.

## 7) Route-level acceptance tests (minimum set)
Playwright MUST cover:
1) Provision RE environment -> auto-land on /re (no generic dashboard leak)
2) /re shows fund list table (even empty) + “Create Fund” CTA
3) Create Fund wizard -> submit -> redirect to /re/funds/:fundId -> fund header visible
4) Drill path:
   - create investment/jv/asset (or seed via API) -> navigate fund -> investment -> jv -> asset
5) Asset fork:
   - property asset shows Accounting + Valuation panels
   - loan asset shows Credit/CMBS panels
6) Error UX:
   - simulate 401 -> redirect/login prompt
   - simulate 422 -> inline form errors
   - simulate 500 -> friendly error page with retry + error_code displayed
7) Nav guard:
   - inside /re/* global Lab items (Pipeline/Uploads) must NOT be visible

## 8) Mocking strategy (choose ONE and enforce)
Pick one of these and apply consistently:
A) Playwright route mocking (page.route) for API calls
B) MSW (Mock Service Worker) for browser-level API mocking
C) Test backend in docker (preferred for “realism” if stable)

Whichever is chosen:
- It must support latency injection (50–200ms) to catch loading state bugs.
- It must support forced failures per endpoint.

## 9) Assertions must include visual state expectations
For critical screens, assert:
- loading skeleton appears briefly
- empty state has a real CTA (not dead text)
- table renders with correct columns
- computed rollup tiles show numbers or explicit “0” (not “—” unless intentionally unknown)

## 10) CI Gates
PRs cannot merge unless:
- Playwright suite passes
- contract tests pass
- lint + typecheck pass
- no snapshot tests used as substitutes for E2E navigation tests

## Definition of Done for RE changes
A change is NOT done unless:
- It has at least one Playwright test proving the user flow works
- It has a mocked failure test proving the UI fails gracefully
- It asserts no console errors and no failed network calls

---

## Production Regression Rule — Context Integrity

This section exists because the Real Estate workspace has failed in production multiple times
with either "Request failed (405)" or "Resolving environment context..." spinning indefinitely.
These are not UI bugs. They are architecture contract failures. The rules below are permanent.

**Repeated deployment of a broken workspace loader constitutes a release gating failure.**

---

### 1. Canonical Context Endpoint Contract

Every industry workspace must define one canonical context endpoint:

- Method: **GET only** — never POST for context resolution
- URL pattern: `/api/{industry}/v1/context?env_id=...`
- Must be explicitly registered in `backend/app/main.py`
- Must export an explicit OPTIONS handler
- Must validate: env exists, industry matches, business mapping exists, bootstrap complete
- Must return deterministic JSON payload on 200
- Must return structured error envelope on ALL non-200 paths:
  `{ error_code: string, message: string, detail: object }`
- Must never return 405
- Must never return unstructured 500
- Must never hang silently (DB connection timeout is the only acceptable hang)

If bootstrap is not complete: return `{ error_code: "RE_NOT_BOOTSTRAPPED", ... }` (422).
Frontend must trigger bootstrap and retry — never display an empty workspace silently.

### 2. Method Mismatch Prevention

- No frontend may POST to a context endpoint.
- All GET routes must be defined with `@router.get()`.
- All POST routes must be defined with `@router.post()`.
- All route files must include an OPTIONS handler on context routes.
- The API proxy layer (`/bos/[...path]/route.ts`, `/v1/[...path]/route.ts`) must not rewrite HTTP method.
- A test must introspect route handler registrations and fail if GET is missing from context routes.

### 3. Frontend Loader Requirements

- All workspace loaders must have a **10-second hard timeout**.
- If timeout fires: surface structured error with `error_code: CONTEXT_TIMEOUT`. Never stay in loading state.
- All loaders must have a visible Retry button that re-requests — not just re-renders.
- The text "Resolving environment context..." must never appear for more than 10 seconds.
- Swallowed fetch errors are forbidden. Every catch block must produce a visible user state.

### 4. Bootstrap Guarantee

Provisioning a `real_estate` environment must:

1. Create business mapping in `app.env_business_bindings`
2. Create RE schema tables (repe_fund, repe_deal, repe_asset, etc.)
3. Seed base scenario and default assumption set
4. Mark `bootstrap_complete = true` on the environment

An environment with `industry = real_estate` must not be marked Active until bootstrap is verified.

### 5. Mandatory Tests Before Merge

Any new industry workspace or change to context resolution requires:

- A Playwright E2E test named `{industry}-workspace-load.spec.ts` covering:
  - Happy path: workspace loads with fund/entity list rendered
  - Auto-bootstrap: first load triggers bootstrap and then renders
  - 405 guard: asserts no 405 responses in network traffic
  - Error state: backend failure shows structured error, not infinite spinner
- A backend pytest test covering:
  - GET returns 200 for bootstrapped environment
  - GET returns structured 422 RE_NOT_BOOTSTRAPPED for unbootstrapped
  - GET returns 400 WRONG_INDUSTRY for non-matching industry
  - GET returns 400/503 for missing env_id / schema
  - POST to GET-only endpoint returns 405
  - OPTIONS returns 200
  - Route introspection: GET is registered in main.py

### 6. Deployment Safety Gate

Before any RE deployment:

- Run `re-workspace-load.spec.ts` locally against a real backend
- Run with empty DB — must show structured error, not spinner
- Run with seeded DB — must show fund list
- Confirm `GET /api/re/v1/context` returns 200 for valid env
- Confirm `GET /api/re/v1/context` returns structured error (not 405, not hang) for invalid env
- Confirm no 405 appears anywhere in the browser network tab

Deployment must fail if any 405 exists on context endpoints.

### 7. 405 Is an Architecture Violation

A 405 on any context endpoint in production is not a bug to be patched.
It is an architecture violation indicating one of:

- Route not registered in main.py
- Frontend using wrong HTTP method
- Proxy rewriting the method

All three causes must be fixed structurally, not with workarounds.

### 8. No New Workspace Without These Guarantees

Any new industry module (Legal, Healthcare, Construction, etc.) must:

- Define a canonical context endpoint before the workspace page ships
- Pass the deployment safety gate before first production deploy
- Have a Playwright load test committed before merge
- Have backend route introspection test committed before merge

No workspace may ship without these. No exception.

---

## PART D — DATA & ENVIRONMENT REGISTRATION RULES

---

### 29. ENVIRONMENT REGISTRATION CONTRACT

The platform uses three separate tables to resolve a business context. All three must be
populated for an environment to be reachable by the UI and backend context resolver.
Missing any one of them produces a silent failure (environment never appears in the UI
or context resolution errors out).

**Required table chain (all three must exist for every active environment):**

| Table | Schema | Purpose |
| --- | --- | --- |
| `app.environments` | app | What the Admin UI lists; carries `client_name`, `industry`, `schema_name`, `is_active` |
| `app.businesses` | app | What `repe_context.py` joins to when resolving business name/slug |
| `app.env_business_bindings` | app | Links `env_id → business_id`; the context resolver's lookup key |

**Common mistake:** Seeding data into `public.business` does NOT make it visible.
The context service (`backend/app/services/repe_context.py`) only joins on `app.businesses`.

**Rules:**

- Any seed script or provisioning path that creates a business must write to BOTH
  `public.business` (for shared FK references) AND `app.businesses` (for context resolution).
- Any seed script that creates funds/assets must also create the corresponding
  `app.environments` + `app.businesses` + `app.env_business_bindings` records or the
  environment will not appear in the UI.
- `industry` on `app.environments` must be exactly `'real_estate'` for RE workspaces —
  not `'repe'`, not `'real estate'`.
- `app.env_business_bindings` has a unique constraint on `env_id`; one env maps to exactly
  one business. Do not create multiple bindings per env.
- The `schema_name` field on `app.environments` is display metadata; the actual schema
  isolation (Demo Lab) is separate and does not need to match exactly.

---

### 30. SEED SCRIPT DISCIPLINE

Seed scripts must always register all three layers or they are considered incomplete.

**Required checklist for any seed script that creates a business + funds:**

1. `public.business` — for FK integrity with `public.repe_fund`, `public.fin_fund`, etc.
2. `public.fin_partition` — required by all `fin_*` tables (tenant_id + business_id + partition_id)
3. `app.businesses` — required for context resolution
4. `app.environments` — required for Admin UI visibility and context endpoint resolution
5. `app.env_business_bindings` — links env → business

Missing any one of these means the seeded data is unreachable through the application.

**Idempotency:** All seed scripts must use `ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE`
throughout. Re-running a seed script must never fail or duplicate data.

**Deterministic UUIDs:** Seed scripts must use fixed, hardcoded UUIDs (not `uuid4()` at
call time) so that re-runs produce the same IDs. This is required for FK integrity across
multiple seed runs and for test fixtures.

---

## PART E — BUG FIX LOG

This section is append-only. Every time a bug is fixed, append a new entry.
Never edit or delete prior entries.

---

### BUG-001 — 2026-02-25 — Seeded environment invisible in Admin UI

**Problem:**
Institutional REPE dataset was seeded into `public.business` + `public.repe_fund` +
`public.fin_fund` etc., but the "Meridian Capital Management" environment never appeared
in the Admin UI Environment Control Tower and the RE context resolver threw a lookup error.

**Root cause:**
The context resolver (`repe_context.py`) resolves business context through `app.businesses`
and `app.env_business_bindings`, NOT `public.business`. The seed script had only written
to `public.business`. Additionally, no `app.environments` record was created, so the Admin
UI had nothing to list.

**Fix:**
Added three records to complete the context chain:
- `app.environments` — `client_name='Meridian Capital Management'`, `industry='real_estate'`
- `app.businesses` — same `business_id` as `public.business`, matching slug/tenant
- `app.env_business_bindings` — linked the new `env_id` to `business_id`

**Rule added:** See Rule 29 (Environment Registration Contract) and Rule 30 (Seed Script
Discipline) in Part D above.

**Files changed:**
- `backend/scripts/seed_institutional_repe.py` — seed script (does not yet write the app.*
  layer; run the three-insert fix manually or extend the script)
- `RULES.MD` — Part D added

---

### BUG-002 — 2026-02-26 — RE funds show 0 on production despite correct DB data

**Problem:**
After seeding the Meridian dataset and registering the environment, the Fund Portfolio page
showed "No funds yet." and "FUNDS: 0" despite the database containing 2 `repe_fund` rows
linked to the correct `business_id`.

**Root cause:**
The `/bos/[...path]/route.ts` proxy was NOT reaching the Railway-deployed BOS backend.
The proxy's `inferUpstreamOrigin()` infers the backend URL from env vars (`BOS_API_ORIGIN`,
`NEXT_PUBLIC_BOS_API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`) or falls back to
`https://api.{hostname}`. Since `api.paulmalmquist.com` does not exist (DNS failure),
the proxy was either returning 502 OR (if an env var pointed to the Vercel app itself)
routing back to Vercel fallback routes at `/api/re/v1/context` and `/api/re/v1/funds`
which return hardcoded stubs (`is_bootstrapped: true, funds_count: 0` and `[]` respectively).

Confirmed by curl: `GET /bos/api/re/v1/funds?env_id=...` returned `[]` and
`GET /bos/api/re/v1/context?env_id=...` returned `{business_id: <env_id>, funds_count: 0}`.

**Fix:**
Set the `BOS_API_ORIGIN` environment variable in Vercel to the actual Railway backend
public URL (e.g. `https://backend-production-xxxx.up.railway.app`).
Also verify `NEXT_PUBLIC_BOS_API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` do NOT point
to the Vercel frontend domain itself (that creates a proxy loop to the fallback routes).

After setting the env var, redeploy Vercel to pick it up.

**Files changed:**

- `RULES.MD` — BUG-002 appended

---

### BUG-003 — 2026-02-26 — Production context endpoint fails ENOTFOUND on Supabase direct connection

**Problem:**
After implementing real Supabase queries in `/api/re/v1/context`, `/api/re/v1/funds`, and environment
routes, production GET requests returned 500 with error `getaddrinfo ENOTFOUND db.ozboonlsplroialdwuxj.supabase.co`
despite the query working fine locally.

**Root cause:**
Supabase project `ozboonlsplroialdwuxj` configured its direct connection hostname `db.PROJECT.supabase.co`
with **IPv6 only** (AAAA record only, no A record). Vercel's Lambda serverless functions have **no IPv6
networking support**. When Node.js tried to resolve the hostname via `dns.lookup()` (the default for `pg` library),
it got `ENOTFOUND` because:

1. `dns.lookup()` by default only returns IPv4 addresses (A records)
2. The hostname has no A record, only AAAA (IPv6)
3. Vercel's Lambda cannot make outbound IPv6 TCP connections (`EADDRNOTAVAIL` if forced to IPv6 address)

**Attempted fixes that FAILED:**
- Using IPv6 address directly: `[2600:1f18:...]:5432` → `EADDRNOTAVAIL` (no IPv6 networking)
- Trying Supabase's shared pooler `aws-0-us-east-1.pooler.supabase.com` → `FATAL: Tenant or user not found`
  (this project was created before Supavisor rollout and wasn't auto-migrated)

**Correct fix:**
Use Supabase's **Transaction Mode Connection Pooler** — an IPv4-accessible endpoint provided by the project:

Format: `postgresql://postgres.{PROJECT_REF}:{PASSWORD}@aws-{N}-{REGION}.pooler.supabase.com:6543/postgres`

For project `ozboonlsplroialdwuxj`:
```
postgresql://postgres.ozboonlsplroialdwuxj:ripsalesforce8084@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

**To get your project's pooler URL:**
1. Log into Supabase dashboard
2. Select the project
3. Go to **Settings → Database → Connection pooling**
4. Copy the **Transaction mode** connection string (port 6543, always IPv4)

**Implementation:**
- Set `PG_POOLER_URL` env var in Vercel (both production and preview targets) to the pooler URL
- All four pg routes check `process.env.PG_POOLER_URL || process.env.DATABASE_URL`
- This ensures production uses the pooler while local dev can use direct connection if available
- The direct connection (`DATABASE_URL`) will continue to work in local dev (where IPv6 is available)

**Permanent rule added:** See "Supabase / DB Connection (Production)" section at the top of Part A.

**Files changed:**
- `repo-b/src/app/api/re/v1/context/route.ts` — added `PG_POOLER_URL` check
- `repo-b/src/app/api/re/v1/funds/route.ts` — added `PG_POOLER_URL` check
- `repo-b/src/app/api/v1/environments/route.ts` — added `PG_POOLER_URL` check
- `repo-b/src/app/api/v1/environments/[id]/route.ts` — added `PG_POOLER_URL` check
- `MEMORY.md` — added Supabase connection pooler section
- `RULES.MD` — BUG-003 appended
## Deterministic Financial Engine

- All financial outputs (NAV, IRR, DPI, TVPI, DSCR, Waterfall allocations) must be derived from versioned input assumptions.
- Each snapshot must store:
  - input_hash
  - engine_version
  - timestamp
- Re-running the same snapshot with identical inputs must yield identical outputs.
- No client-side financial calculations for institutional metrics.
## Institutional Fund Requirements

A Real Estate PE environment must include:

- ≥1 Fund
- ≥1 Investment per Fund
- ≥1 Asset per Investment
- ≥1 Scenario
- Capital Commitments defined before distributions allowed
- Debt instruments must specify amortization type:
  - IO
  - Amortizing
  - Balloon
  ## Data Mutation Guardrails

- Hard deletes are prohibited in production.
- All deletes must be soft deletes with:
  - deleted_at
  - deleted_by
- Destructive actions require confirmation modal with:
  - Environment name typed manually
  - 2-step confirmation
  ## Reporting Integrity

- Exports must match UI values exactly.
- All exported reports must contain:
  - Environment name
  - Snapshot timestamp
  - Engine version
- No Excel export without validated snapshot.
## Financial Calculation Standards

- IRR must use XIRR methodology for irregular cash flows.
- DSCR must use amortized debt service (not interest-only shortcut).
- Cap rate must be calculated as NOI / Value.
- All rates displayed as percentages with 2 decimal precision.
## Environment Template Governance

Every environment must be provisioned from a template.

Template types:
- Institutional RE Fund
- Legal Ops
- Healthcare Provider
- Consulting / Novendor

Ad hoc environments are prohibited in production.
## Institutional Readiness Criteria

An environment may be marked "Institutional Ready" only if:

- All required modules load without console errors
- Loan amortization schedules generate ≥ 12 periods
- Capital account snapshot exists
- Export .xlsx validates against UI
- Audit log entries exist for:
  - Environment creation
  - Fund creation
  - Snapshot generation
  ## Audit Requirements

The system must log:
- Login events
- Fund creation
- Debt creation
- Snapshot generation
- Recompute actions
- Export events

Logs must include:
- user_id
- environment_id
- timestamp
- action_type
## UI Consistency

- All environments must expose:
  - Dashboard
  - Intelligence
  - System
- RE environments must expose:
  - Funds
  - Investments
  - Assets
  - Scenarios
  - Run Center
- Buttons must not require double-click to activate.
- No blank states without instructional text.
## Demo / Test Isolation

- Environments containing "test", "demo", or "autotest" must:
  - Be tagged as NON-PROD
  - Be excluded from institutional readiness reports
- Production demos must use seeded canonical datasets.
## Single Source of Financial Truth

- All financial metrics must originate from the Winston Financial Engine.
- No spreadsheet-calculated numbers may be manually uploaded as authoritative values.
## Role-Based Controls

Admin:
- Provision
- Archive
- Recompute

Manager:
- Create funds
- Edit assumptions

Viewer:
- Read-only
- Export allowed

Delete restricted to Admin only.

## Novendor Strategic Outreach

- Novendor outreach must live inside the existing Consulting Revenue OS as an additive module, not as a separate generic CRM.
- The module is a hypothesis-driven execution intelligence system for operator-level outreach.
- Never auto-send outreach.
- Never mass-message.
- All generated outreach must require human approval before send.
- Strategic outreach must track:
  - structured leads
  - pain hypotheses
  - governance risk
  - trigger signals
  - draft outreach
  - diagnostics
  - deliverables
- Priority should be driven by weighted governance, reporting complexity, vendor fragmentation, AI pressure, and multi-entity exposure.
- Novendor should use executive-safe positioning:
  - no hype
  - no urgency language
  - no product pitch
  - no calendar link in first touch
- The strategic outreach UI should remain a consulting sub-module with tabs for:
  - Heatmap
  - Active Leads
  - Trigger Signals
  - Outreach Queue (Needs Approval)
  - Diagnostics
  - Deliverables Sent
- Seed targets for Novendor include:
  - U.S. Oral Surgery Management
  - American Family Care
  - Brasfield & Gorrie
  - DPR Construction
  - Cortland
  - Hamilton Zanze
  - Ogletree Deakins
  - Live Oak Bank

## Deployment Lint Gate

- Before merge or deploy, run backend Ruff on the actual backend paths: `python -m ruff check backend/app backend/tests`.
- Unused imports and unused locals must be removed before CI; do not leave cleanup for the pipeline.

---

## RE / ASSET INVARIANTS

Last updated: 2026-02-28 — Asset Platform v2 launch.

### Data Model Invariants

1. **Asset Index lists ALL assets by default**; investment filter is optional and off by default.
   The asset list endpoint (`GET /api/re/v2/assets`) requires `env_id` but does NOT default to a
   single investment. The `investment_id` parameter is optional.

2. **Every investment (repe_deal) MUST have >= 1 asset (repe_asset).**
   Enforced by `284_repe_investment_asset_invariants.sql` and `re_integrity.py`.
   The `/api/re/v2/health/integrity?repair=true` endpoint backfills missing placeholder assets.

3. **Every asset MUST have valid `deal_id` (fund linkage via deal -> fund).**
   All asset-related API JOINs to optional child entities (quarter state, property details,
   accounting data) MUST be LEFT JOIN to avoid masking assets with missing child records.

4. **Occupancy vs NOI trend MUST use accounting-derived NOI** or a rollup explicitly linked to
   GL source. The `re_asset_quarter_state.noi` field represents Revenue - OpEx.
   Seed data traces to `re_asset_acct_quarter_rollup` and `re_asset_occupancy_quarter` tables.

5. **Asset expanded rows in Investment pages MUST hyperlink to the Asset detail route**
   (`/lab/env/:envId/re/assets/:assetId`). Both the investment detail page and the fund detail
   page's investment expansion rows provide clickable asset links.

### API Contracts

- `GET /api/re/v2/assets` — List all assets with optional filters (env_id required, sector/state/msa/status/q/investment_id/fund_id optional). Uses directFetch.
- `GET /api/re/v2/assets/:assetId` — Asset detail with breadcrumb (fund, investment, env). Uses directFetch.
- `GET /api/re/v2/assets/:assetId/periods` — Quarterly time series for trend charts. Uses directFetch.
- `GET /api/re/v2/assets/:assetId/accounting/trial-balance?quarter=` — Trial balance. Uses directFetch.
- `GET /api/re/v2/assets/:assetId/accounting/pnl?quarter=` — P&L by line code. Uses directFetch.
- `GET /api/re/v2/assets/:assetId/accounting/transactions?quarter=` — GL transactions. Uses directFetch.
- `POST /api/re/v2/assets/:assetId/reports` — Generate report (snapshot/pnl/trial_balance/transactions/occupancy/audit). Uses directFetch.

### Frontend Contracts

- Asset Index page: `/lab/env/:envId/re/assets` — shows ALL assets, not filtered by investment.
- Asset Detail page: `/lab/env/:envId/re/assets/:assetId` — 8 tabs (Overview, Financials, Occupancy, Debt, Valuation, Documents, Accounting, Runs/Audit).
- Each tab loads its own data and fails gracefully with in-tab warnings.
- "Generate Report" button on asset detail downloads structured JSON payloads.

### CI Checks

- Playwright tests must verify:
  - Asset index loads with > 0 assets by default.
  - Sector filter reduces the visible set.
  - State filter works.
  - Click-through: fund page → expand investment → click asset hyperlink → verify asset header.
  - Asset detail Accounting tab renders trial balance rows.
  - No console errors on any asset page.

---

## RE / BUDGET + PROFORMA + VARIANCE INVARIANTS

### Data Model Invariants

1. **Reuse existing tables** — Budget and pro forma data live in `uw_noi_budget_monthly` (278_re_financial_intelligence.sql), differentiated by `uw_version_id`. No new plan tables.
2. **Monthly grain** — Both actuals (`acct_normalized_noi_monthly`) and budget (`uw_noi_budget_monthly`) are stored at monthly granularity by `line_code`. Variance aggregation to quarters happens at query time.
3. **Line code convention** — Revenue codes are positive; OpEx codes are negative (sign normalized). Standard codes: `RENT`, `OTHER_INCOME`, `PAYROLL`, `REPAIRS_MAINT`, `UTILITIES`, `TAXES`, `INSURANCE`, `MGMT_FEES`.
4. **UW Version separation** — Budget UW version (`b1b2c3d4-0001-0001-0001-000000000001`) = annual operating budget. Pro forma UW version (`b1b2c3d4-0001-0001-0002-000000000001`) = acquisition underwriting baseline.
5. **Seed idempotency** — All seed data uses `WHERE NOT EXISTS` or `ON CONFLICT DO NOTHING`. Source tracking via `source_hash = 'seed_286'` for actuals, deterministic UUIDs for UW versions and runs.
6. **Every asset must have coverage** — After seeding, 0 assets may be missing budget or actuals for required quarters. Integrity check enforces this.

### API Contracts (Budget/Variance)

- `GET /api/re/v2/variance/noi` — NOI variance (actual vs budget) per asset per line-code. Params: `env_id`, `business_id`, `fund_id`, `quarter`. Returns `FiVarianceResult` with `items[]` and `rollup`. Uses **directFetch** (production-safe).
- `GET /api/re/v2/budget/uw_versions` — List UW versions for a business. Params: `env_id`, `business_id`. Uses **directFetch**.
- `GET /api/re/v2/integrity/budget` — Budget/proforma integrity check. Params: `env_id`, `business_id`, `quarters` (comma-separated). Returns pass/fail with missing asset lists.

### Variance Resolution Strategy

1. **Pre-computed first** — Endpoint checks `re_asset_variance_qtr` for existing results (from quarter-close runs).
2. **On-the-fly fallback** — If no pre-computed results, computes variance by joining `acct_normalized_noi_monthly` with `uw_noi_budget_monthly` using the latest `uw_version`.
3. **Fund scoping** — Variance is always scoped to a single fund (assets resolved through `repe_asset → repe_deal → repe_fund`).

### CI Checks (Budget/Variance)

- Integrity endpoint must return `passed: true` for the Meridian env.
- Variance endpoint must return non-empty `items[]` for at least one fund + quarter combo.
- Variance tab on fund detail page must show actual vs budget rows (not empty state).

---

## RE / PRODUCTION 404/502 DIAGNOSTIC RULES

### Production Deployment

The Python backend is deployed to **Railway** and the frontend proxies to it:
- **Frontend**: Vercel (`paulmalmquist.com` / `consulting-app.vercel.app`)
- **Backend**: Railway (`authentic-sparkle-production-7f37.up.railway.app`)
- **Proxy**: Vercel env var `BOS_API_ORIGIN` → Railway URL. Frontend `/bos/*` requests forward to backend.
- **DB**: Supabase transaction pooler (`aws-1-us-east-1.pooler.supabase.com:6543`) — **must use pooler**, direct connection is IPv6-only.

Two API client patterns exist in `bos-api.ts`:
- **`directFetch`** — hits same-origin Next.js API routes (`/api/*`). Fastest path for simple reads.
- **`bosFetch`** — proxies through `/bos/*` catch-all to the Python backend on Railway. Required for compute endpoints (waterfall, quarter-close, etc.).

A `directFetch` call with **no matching route handler** returns **404**.
A `bosFetch` call fails only if Railway backend is down or `BOS_API_ORIGIN` is not set.

### Converted Functions (directFetch — production-safe)

All fund/investment page GET functions now use `directFetch` with direct PG route handlers:

| Function | Route | Source Table(s) |
|----------|-------|-----------------|
| `getRepeFund` | `/api/repe/funds/[fundId]` | `repe_fund` |
| `listReV2Investments` | `/api/re/v2/funds/[fundId]/investments` | `repe_deal` |
| `getReV2FundQuarterState` | `/api/re/v2/funds/[fundId]/quarter-state/[quarter]` | `re_fund_quarter_state` |
| `getReV2FundMetrics` | `/api/re/v2/funds/[fundId]/metrics/[quarter]` | `re_fund_quarter_metrics` |
| `getReV2FundInvestmentRollup` | `/api/re/v2/funds/[fundId]/investment-rollup/[quarter]` | `re_investment_quarter_state` + fallback `re_asset_quarter_state` |
| `getReV2FundLineage` | `/api/re/v2/funds/[fundId]/lineage/[quarter]` | `repe_deal`, `repe_asset`, `re_asset_quarter_state`, `re_fund_quarter_state` |
| `getReV2EnvironmentPortfolioKpis` | `/api/re/v2/environments/[envId]/portfolio-kpis` | `repe_fund`, `re_fund_quarter_state`, `repe_asset` |
| `getReV2Investment` | `/api/re/v2/investments/[investmentId]` | `repe_deal` + `re_investment_quarter_state` |
| `getReV2InvestmentQuarterState` | `/api/re/v2/investments/[investmentId]/quarter-state/[quarter]` | `re_investment_quarter_state` + fallback `re_asset_quarter_state` |
| `getReV2InvestmentAssets` | `/api/re/v2/investments/[investmentId]/assets/[quarter]` | `repe_asset`, `repe_property_asset`, `re_asset_quarter_state` |
| `getReV2InvestmentLineage` | `/api/re/v2/investments/[investmentId]/lineage/[quarter]` | `repe_asset`, `re_asset_quarter_state` |
| `listReV2Scenarios` | `/api/re/v2/funds/[fundId]/scenarios` | `re_scenario` |
| `listReV2Runs` | `/api/re/v2/funds/[fundId]/runs` | `re_run` |
| `getFiNOIVariance` | `/api/re/v2/variance/noi` | `re_asset_variance_qtr` + fallback actuals/budget join |
| `listFiUwVersions` | `/api/re/v2/budget/uw_versions` | `uw_version` |
| `getFiFundMetrics` | `/api/re/v2/funds/[fundId]/metrics-detail` | `re_fund_metrics_qtr` + `re_gross_net_bridge_qtr` |
| `getFiLoans` | `/api/re/v2/funds/[fundId]/loans` | `re_loan` |
| `getFiCovenantResults` | `/api/re/v2/loans/[loanId]/covenant_results` | `re_loan_covenant_result_qtr` |
| `getFiWatchlist` | `/api/re/v2/funds/[fundId]/watchlist` | `re_loan_watchlist_event` |
| `getLpSummary` | `/api/re/v2/funds/[fundId]/lp_summary` | `re_partner`, `re_commitment`, `re_partner_quarter_metrics`, `re_fund_quarter_state`, `re_waterfall_result` |

### Using bosFetch (routed to Railway backend)

These POST/compute endpoints require Python backend logic and are served by the Railway-deployed backend:

| Function | Why it needs backend |
|----------|---------------------|
| `runReV2QuarterClose` | Multi-step orchestration: computes asset→investment→fund state + variance + metrics |
| `runReV2Waterfall` | Waterfall engine with tier logic, promote calculations, clawback |
| `runFiCovenantTests` | Computes DSCR/LTV/debt-yield from live asset data |
| `runFiQuarterClose` | FI quarter-close with variance + fee accrual + metrics computation |
| `runFiWaterfallShadow` | Shadow carry calculation |
| `createReV2Investment` | Creates `repe_deal` + downstream scaffolding |
| `createReV2Jv` | Creates JV with membership interest validation |
| `createReV2Scenario` | Creates scenario with baseline snapshot |
| `getReV2PartnerMetrics` | Reads pre-computed partner metrics (could be converted) |

### Rule: Adding New RE API Functions

1. **Default to `directFetch`** with a direct PG route handler in `repo-b/src/app/api/`.
2. Only use `bosFetch` for POST endpoints that require Python business logic (waterfall, quarter-close, scenario computation).
3. Every `directFetch` function MUST have a corresponding Next.js API route handler — otherwise it 404s in production.
4. Route handlers must import `getPool` from `@/lib/server/db` and include `export const runtime = "nodejs"`.
5. All numeric columns must be cast to `::float8` or `::text` to avoid Postgres NUMERIC string issues.
