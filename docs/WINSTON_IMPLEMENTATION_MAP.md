# Winston Canonical Implementation Map

> Generated 2026-04-05. Exhaustive audit of what Winston can truly support today vs what it only appears to support.

---

## 1. Executive Diagnosis

### Top 10 Reasons Winston Still Feels Incomplete

| # | Gap | Category | Impact |
|---|-----|----------|--------|
| 1 | **Pending action params not injected into LLM prompt on confirmation** | Action contract | Create-fund flow loses accumulated params when user says "yes" — assistant re-invokes tool without name/type/strategy |
| 2 | **No deterministic SQL template for "best performing assets"** | Metric/template | Asset-ranking queries fall to unreliable LLM SQL generation; fund queries work because templates exist |
| 3 | **`fact_measurement` table empty for Meridian** | Seed data | The `metrics.query` MCP tool queries `fact_measurement` — returns zero rows for any Meridian metric |
| 4 | **env_id binding is fragile** | Environment registry | Frontend hardcodes `9b4d7c63-...f101`; migration 430 auto-generates UUIDs; seeds bind by fund name not env_id — works only if DB was bootstrapped in exact order |
| 5 | **Metric ambiguity in natural language** | Metric normalization | "Best performing" has no canonical metric_key mapping; normalizer only matches explicit terms like "noi" or "irr" |
| 6 | **No asset-ranking MCP tool** | Tool gap | No `repe.rank_assets` tool exists; must route through SQL agent which is unreliable for this pattern |
| 7 | **Lease data exists for only 1 of 15 assets** | Seed data | Meridian Office Tower has 8 tenants/10 spaces; other 14 assets have zero lease detail — any lease analytics beyond that one asset returns empty |
| 8 | **Frontend confirmation blocks rendered but not executable** | Frontend contract | `onConfirmAction`/`onCancelAction` props exist in ResponseBlockRenderer but are never wired to parent components |
| 9 | **NOI variance table (`re_asset_variance_qtr`) not seeded** | Seed data | `finance.noi_variance` tool queries this table; returns empty for Meridian because no variance rows exist |
| 10 | **Navigation suggestions include non-existent routes** | Frontend contract | `degraded_responses.py:60` suggests `/funds/{id}/financials` — route does not exist in repo-b |

### Shell vs Foundation Distinction

**Shell/UX improvements already in place:**
- 4-lane routing with quality gates and confidence thresholds
- 40+ intent families with regex-based fast-path (sub-2s for matched intents)
- Two-phase write confirmation with durable pending action storage
- Thread entity state with fuzzy entity resolution
- 10 response block types with full frontend renderers
- SSE streaming with 10 event types consumed by `streamAi()` in `assistantApi.ts`
- Degraded response system with RAG fallback and write-tool-absent handling
- Conversational transforms (chart type, grouping, limit changes)
- Dynamic navigation suggestions and follow-up prompts

**Domain/data/action gaps that still block robust behavior:**
- Pending action param injection missing (the create-fund bug)
- SQL template registry incomplete (7 REPE templates; need ~15 more)
- `fact_measurement` unpopulated (entire `metrics.query` path dead)
- Asset-level analytics unreliable without deterministic templates
- Lease/variance/budget data sparse across portfolio
- No materialization job to keep `re_fund_metrics_qtr` current
- Semantic catalog defined in SQL seed but not actively consumed by SQL agent at runtime

---

## 2. Winston Runtime Inventory

### 2.1 Dispatch Engine

| Attribute | Detail |
|-----------|--------|
| **File** | [ai_gateway.py](backend/app/services/ai_gateway.py) (4,227 lines) |
| **Entry point** | `run_gateway_stream()` → delegates to `run_request_lifecycle()` or `_legacy_run_gateway_stream()` |
| **Flow** | Context resolution → Route classification → Workflow override check → Pending action check → REPE intent classification → RAG retrieval → Tool filtering → Prompt composition → LLM call → Tool execution loop → Response blocks |
| **Status** | Fully implemented |
| **Limitation** | `_pending_action_result` retrieved from DB but never injected into prompt context (the confirmation bug) |

### 2.2 Lane Routing

| Attribute | Detail |
|-----------|--------|
| **File** | [request_router.py](backend/app/services/request_router.py) (511 lines) |
| **Lanes** | A (UI-known, <1s, no tools/RAG), B (quick tool, 2-4s), C (analytical, 4-8s, RAG+tools), D (deep reasoning, 8-20s, o1/o3), F (REPE fast-path, <2s, deterministic) |
| **Classification** | 15+ regex pattern matchers → `RouteDecision` dataclass |
| **Status** | Fully implemented |
| **Limitation** | Fixed per-lane thresholds; no dynamic adjustment based on query difficulty |

### 2.3 Skill / Tool Registry

| Attribute | Detail |
|-----------|--------|
| **File** | [registry.py](backend/app/mcp/registry.py) (152 lines) |
| **Tools registered** | ~130+ across 34 tool files |
| **Tag-based filtering** | Lane B: `{core, meta, repe, finance, env, business}`, Lane C adds `{analysis, model, ops, investor, workflow, platform, document, report}` |
| **Status** | Fully implemented |
| **Limitation** | No `repe.rank_assets` tool; asset analytics must route through SQL agent |

### 2.4 Intent Classification

| Attribute | Detail |
|-----------|--------|
| **File** | [repe_intent.py](backend/app/services/repe_intent.py) (44KB) |
| **Intent families** | 40+ (waterfall, stress, fund metrics, LP summary, sale scenario, monte carlo, capital call, distribution, covenant, DDQ, briefing, analytics query, transform, dashboard generation, etc.) |
| **Fast-path threshold** | confidence >= 0.85 → bypass LLM entirely |
| **Status** | Fully implemented |
| **Limitation** | No intent family for "asset ranking" or "best performing" — these fall through to Lane C agentic loop |

### 2.5 Pending Action Manager

| Attribute | Detail |
|-----------|--------|
| **File** | [pending_action_manager.py](backend/app/services/pending_action_manager.py) (380 lines) |
| **States** | `awaiting_confirmation` → `confirmed` / `cancelled` / `superseded` / `expired` |
| **Storage** | `ai_pending_actions` table with `params_json`, `missing_fields`, `action_type`, 30-min TTL |
| **User intent classification** | Regex: confirm/cancel/edit/other |
| **Status** | Fully implemented (storage + state machine) |
| **CRITICAL BUG** | `params_json` stored correctly but never extracted and injected into LLM prompt on confirmation turn |

### 2.6 Entity Memory

| Attribute | Detail |
|-----------|--------|
| **File** | [ai_conversations.py](backend/app/services/ai_conversations.py) (389 lines) + [assistant_scope.py](backend/app/services/assistant_scope.py) |
| **Thread entity state** | JSONB column on `ai_conversations`, max 10 entities, tracks type/id/name/source/confidence |
| **Resolution chain** | Page entity → Selected entities → Visible data → Named entity match → DB fuzzy search |
| **Status** | Fully implemented |
| **Limitation** | Entity disambiguation requires minimum score (0.4); close candidates require user clarification |

### 2.7 Response Blocks

| Attribute | Detail |
|-----------|--------|
| **File** | [assistant_blocks.py](backend/app/services/assistant_blocks.py) (328 lines) |
| **Block types** | `markdown_text`, `kpi_group`, `table`, `chart`, `workflow_result`, `confirmation`, `error`, `citations`, `tool_activity`, `navigation_suggestion`, `grounding_badge` |
| **Status** | Fully implemented; all 11 types have frontend renderers |

### 2.8 Degraded Response System

| Attribute | Detail |
|-----------|--------|
| **Files** | [ai_gateway.py](backend/app/services/ai_gateway.py), [degraded_responses.py](backend/app/assistant_runtime/degraded_responses.py) |
| **Paths** | RAG unavailable → continue without docs; Write tools not registered → informative message; Fast-path low confidence → fall through to agentic; Tool failure → skip + continue LLM loop; LLM failure → fallback model |
| **Status** | Fully implemented |
| **Limitation** | Degraded responses include broken navigation links (e.g., `/funds/{id}/financials`) |

### 2.9 SSE Streaming

| Attribute | Detail |
|-----------|--------|
| **Backend** | `_sse()` helper in ai_gateway.py; events: `context`, `status`, `progress`, `token`, `tool_call`, `tool_result`, `confirmation_required`, `response_block`, `citation`, `grounding`, `done`, `error` |
| **Frontend** | [assistantApi.ts](repo-b/src/lib/commandbar/assistantApi.ts) `streamAi()` function; `ReadableStream` + `TextDecoder`; all event types handled with callbacks |
| **Status** | Fully implemented end-to-end |

---

## 3. Domain Skill Coverage Matrix

### MCP Tool Coverage by Domain Intent

| Intent | Skill / Tool | Trigger | Lane | Grounded Data Path | Seeded Data | Meaningful in Meridian | Missing Requirements |
|--------|-------------|---------|------|--------------------|----|---------|---------------------|
| **Fund summary** | `finance.fund_metrics` | "fund performance", "irr", "tvpi" | F (fast-path) or B | `re_fund_quarter_state` → KPI block | Yes (3 funds, 6 quarters) | **Yes** | None |
| **Asset ranking** | `sql.query_structured` (no dedicated tool) | "best performing", "top assets" | C (LLM fallback) | LLM-generated SQL against `re_asset_quarter_state` | Yes (15 assets, 6 quarters) | **Unreliable** | Needs `repe.noi_ranked` template + `repe.rank_assets` tool |
| **Trend metrics** | `sql.run_saved_query("repe.noi_trend")` | "noi trend", "noi over time" | B or C | `re_asset_quarter_state` time series | Yes | **Yes** (for NOI) | No templates for IRR/TVPI/occupancy trends |
| **NOI variance** | `finance.noi_variance` | "variance", "actual vs budget" | C | `re_asset_variance_qtr` | **No** | **No — empty table** | Needs variance seed or materialization |
| **Compare entities** | `finance.compare_scenarios` | "compare", "side by side" | C | `re_scenario` + `re_waterfall_run` | Yes (3 scenarios) | **Yes** (scenario comparison) | No asset-vs-asset comparison template |
| **Create fund** | `repe.create_fund` | "create fund", "new fund" | C (write) | Direct INSERT into `repe_fund` | N/A (creates new) | **Broken** — confirmation loses params | Fix param injection in ai_gateway.py |
| **Create deal** | `repe.create_deal` | "create deal", "new investment" | C (write) | Direct INSERT into `repe_deal` | N/A | **Broken** — same confirmation bug | Same fix |
| **Create asset** | `repe.create_asset` | "create asset", "add property" | C (write) | Direct INSERT into `repe_asset` | N/A | **Broken** — same confirmation bug | Same fix |
| **Report generation** | `INTENT_GENERATE_DASHBOARD` | "build me a dashboard", "monthly report" | F (fast-path) | `compose_dashboard_spec()` → localStorage → dashboard page | Yes (layout archetypes seeded) | **Yes** | None |
| **Contextual navigation** | Navigation suggestion blocks | Any degraded response | A/B/C | Static route suggestions | N/A | **Partially broken** — `/financials` route doesn't exist | Fix `degraded_responses.py:60` |
| **Waterfall** | `finance.run_waterfall` | "waterfall", "carry", "distribution" | F (fast-path) | `re_waterfall_run` engine | Yes (European/American tiers) | **Yes** | None |
| **Stress test** | `finance.stress_cap_rate` | "stress", "cap rate shock" | F (fast-path) | In-memory calculation from portfolio NAV | Yes | **Yes** | None |
| **LP summary** | `INTENT_LP_SUMMARY` | "investor report", "LP summary" | C | `re_partner` + `re_partner_commitment` | Yes | **Yes** | None |
| **Capital activity** | `INTENT_LIST_CAPITAL_ACTIVITY` | "capital calls", "distributions" | C | `re_capital_ledger_entry` | Yes (8 calls/fund) | **Yes** | None |
| **Debt surveillance** | (no dedicated intent) | "debt", "loan", "dscr" | C (agentic) | `re_loan` + `re_asset_quarter_state.dscr` | Yes (15 loans) | **Partial** — no dedicated tool | Needs `repe.debt_summary` tool |
| **Lease analytics** | (no dedicated intent) | "lease", "rent roll", "tenant" | C (agentic) | `re_lease` + `re_lease_space` | **1 of 15 assets only** | **Demo only** | Needs lease seed for remaining 14 assets |
| **Occupancy ranking** | `sql.run_saved_query("repe.occupancy_ranked")` | "occupancy", "occupancy ranked" | B | `re_asset_quarter_state.occupancy` | Yes | **Yes** | None |
| **Metric definitions** | `metrics.definitions` | "what metrics", "available kpis" | B | `metric` table (materialized) | Depends on `materialize_business_snapshot()` | **Uncertain** — needs verification | Verify materialization runs for Meridian |
| **Semantic query** | `metrics.query` | via `metrics.definitions` first | B | `fact_measurement` | **No — table empty** | **No** | Needs fact_measurement ETL or deprecation |
| **Monte Carlo** | `finance.monte_carlo_waterfall` | "monte carlo", "probability" | F (fast-path) | In-memory simulation | N/A (takes distribution inputs) | **Yes** | None |
| **Sensitivity matrix** | `finance.sensitivity_matrix` | "sensitivity", "2d stress" | F (fast-path) | Loops waterfall engine | N/A | **Yes** | None |
| **UW vs actual** | `repe.scan_portfolio_uw_vs_actual` | "underwriting vs actual" | C | `re_uw_vs_actual` service | Partial (UW assumptions seeded) | **Unreliable** — depends on UW model service state | Needs verification |

---

## 4. Data Model Coverage Map

### REPE / Meridian Canonical Data Substrate

#### 4.1 Environment / Business / Fund Hierarchy

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `tenant` | [010_backbone.sql](repo-b/db/schema/010_backbone.sql) | Multi-tenant root | Yes (999_seed.sql) | Yes (scope resolution) | Yes |
| `business` | [010_backbone.sql](repo-b/db/schema/010_backbone.sql) | Business entity | Yes (999_seed.sql) | Yes (scope resolution) | Yes |
| `app.environments` | [010_backbone.sql](repo-b/db/schema/010_backbone.sql) | Lab environments | Yes (430_meridian_stone) | Yes (env resolution) | Yes |
| `repe_fund` | [265_repe_object_model.sql](repo-b/db/schema/265_repe_object_model.sql) | Fund master | Yes (378 — 3 funds) | Yes (`repe.list_funds`) | Yes |
| `repe_deal` | [265_repe_object_model.sql](repo-b/db/schema/265_repe_object_model.sql) | Deal/investment | Yes (378 — 3 deals) | Yes (`repe.list_deals`) | Yes |
| `repe_asset` | [265_repe_object_model.sql](repo-b/db/schema/265_repe_object_model.sql) | Asset/property | Yes (378 — 15 assets) | Yes (`repe.list_assets`) | Yes |
| `repe_entity` | [265_repe_object_model.sql](repo-b/db/schema/265_repe_object_model.sql) | Entity registry | Yes (358 — partners) | Yes (`repe.get_environment_snapshot`) | Yes |

#### 4.2 Quarter State / Time Series

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `re_asset_quarter_state` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | Asset quarterly snapshot | Yes (439 — 15 assets × 6 quarters = 90 rows) | Yes (views, SQL agent) | Yes (portfolio KPIs) |
| `re_fund_quarter_state` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | Fund quarterly snapshot | Yes (441 — 3 funds × 6 quarters) | Yes (`finance.fund_metrics`) | Yes (portfolio KPIs) |
| `re_fund_metrics_qtr` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | Fund IRR/TVPI/DPI | **Uncertain** — may need materialization | Yes (`finance.fund_metrics`) | Indirect |
| `re_investment_quarter_state` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | Investment quarterly | **Not seeded** | Via views | Indirect |
| `re_jv_quarter_state` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | JV quarterly | **Not seeded** | Via views | No |

#### 4.3 Underwriting / Assumptions

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `underwriting_model` | [263_fin_underwriting.sql](repo-b/db/schema/263_fin_underwriting.sql) | UW model header | Yes (298) | Yes (`uw_vs_actual`) | Partial |
| `assumption` | [263_fin_underwriting.sql](repo-b/db/schema/263_fin_underwriting.sql) | UW assumptions | Yes (298 — cap rates, expense ratios) | Yes | No |

#### 4.4 Capital / Commitment / Distribution

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `re_partner` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | LP/GP partner | Yes (358) | Yes (`repe_investor_tools`) | Yes |
| `re_partner_commitment` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | Commitment by partner×fund | Yes (358) | Yes | Yes |
| `re_capital_ledger_entry` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | Capital calls/distributions | Yes (323 — 8 calls/fund) | Yes | Yes |

#### 4.5 Debt / Loan

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `re_loan` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | Loan master | Yes (322 — 15 loans) | Via views + quarter state | Yes |
| `re_loan_detail` | [270_re_institutional_model.sql](repo-b/db/schema/270_re_institutional_model.sql) | Loan schedule | Partial (322) | Indirect | Partial |

#### 4.6 Lease / Rent / NOI

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `re_lease` | [347_re_lease_model.sql](repo-b/db/schema/347_re_lease_model.sql) | Lease header | Yes (349 — **1 asset only**: Meridian Office Tower) | Via SQL agent | Yes |
| `re_lease_space` | [347_re_lease_model.sql](repo-b/db/schema/347_re_lease_model.sql) | Space/unit detail | Yes (349 — 10 spaces) | Via SQL agent | Yes |
| `re_tenant_party` | [347_re_lease_model.sql](repo-b/db/schema/347_re_lease_model.sql) | Tenant master | Yes (349 — 8 tenants) | Via SQL agent | Yes |

#### 4.7 Variance / Budget

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `re_asset_variance_qtr` | (referenced in tools, not found as standalone create) | Variance vs plan | **NOT SEEDED** | Yes (`finance.noi_variance`) | No |
| `re_budget_proforma` | [286_re_budget_proforma_seed.sql](repo-b/db/schema/286_re_budget_proforma_seed.sql) | Budget/proforma | Yes (286) | Indirect | No |

#### 4.8 Report / Dashboard / Metric Definitions

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `semantic_metric_def` | [340_semantic_catalog.sql](repo-b/db/schema/340_semantic_catalog.sql) | Metric definitions (40+) | Yes (341) | **Not actively** — SQL agent uses static catalog.py instead | No |
| `semantic_entity_def` | [340_semantic_catalog.sql](repo-b/db/schema/340_semantic_catalog.sql) | Entity definitions | Yes (341) | Not actively | No |
| `semantic_join_def` | [340_semantic_catalog.sql](repo-b/db/schema/340_semantic_catalog.sql) | Join paths (19) | Yes (341) | Not actively | No |
| `dashboard_definition` | [330_re_dashboards.sql](repo-b/db/schema/330_re_dashboards.sql) | Dashboard specs | Yes (330) | Yes (dashboard composer) | Yes |
| `metric` | (materialize on demand) | Tenant-scoped metric registry | Via `materialize_business_snapshot()` | Yes (`metrics.definitions`) | Indirect |
| `fact_measurement` | (materialize on demand) | Metric time series | **NOT POPULATED for Meridian** | Yes (`metrics.query`) — **returns empty** | No |

#### 4.9 Action / Audit

| Table | Schema File | Purpose | Seeded | Winston Reads | Frontend Depends |
|-------|------------|---------|--------|---------------|-----------------|
| `ai_pending_actions` | [9994_ai_pending_actions.sql](repo-b/db/schema/9994_ai_pending_actions.sql) | Pending write actions | Runtime-created | Yes (pending_action_manager) | Via confirmation blocks |
| `ai_decision_audit_log` | [407_ai_decision_audit_log.sql](repo-b/db/schema/407_ai_decision_audit_log.sql) | AI decision trail | Yes (408) | Write-only | No |

#### 4.10 Summary Views

| View | Schema File | Purpose | Data Source | Winston Reads | Frontend Depends |
|------|------------|---------|-------------|---------------|-----------------|
| `v_fund_portfolio_summary` | [361_re_summary_views.sql](repo-b/db/schema/361_re_summary_views.sql) | Fund portfolio KPIs | `re_asset_quarter_state` | Yes | Yes |
| `v_asset_operating_summary` | [361_re_summary_views.sql](repo-b/db/schema/361_re_summary_views.sql) | Asset operating KPIs | `re_asset_quarter_state` | Yes | Yes |
| `v_investment_summary` | [361_re_summary_views.sql](repo-b/db/schema/361_re_summary_views.sql) | Investment returns | Quarter state tables | Partial | Partial |
| `v_fund_performance_summary` | [361_re_summary_views.sql](repo-b/db/schema/361_re_summary_views.sql) | Fund time series | `re_fund_quarter_state` | Partial | Partial |

---

## 5. Seed Data Audit

### 5.1 What Meridian Demo Data Actually Exists

**Funds (3):**
| Fund | Vintage | Strategy | Target Size | Assets | Source |
|------|---------|----------|-------------|--------|--------|
| Atlas Value-Add Fund IV | 2023 | Equity / Value-Add | $500M | 5 | 378_scenario_v2_seed.sql |
| Meridian Core-Plus Income | 2022 | Equity / Core-Plus | $800M | 6 | 378_scenario_v2_seed.sql |
| Summit Opportunistic III | 2024 | Equity / Opportunistic | $300M | 4 | 378_scenario_v2_seed.sql |

**Assets (15):**
| Fund | Asset | Type | Market |
|------|-------|------|--------|
| Atlas VA IV | Parkview Gardens MF | Multifamily | — |
| Atlas VA IV | Lakeshore Terrace MF | Multifamily | — |
| Atlas VA IV | Metro Logistics Hub | Industrial | — |
| Atlas VA IV | Riverside Industrial | Industrial | — |
| Atlas VA IV | Sunset Ridge Apartments | Multifamily | — |
| Meridian CP | Beacon Tower Office | Office | — |
| Meridian CP | Harbor Square Retail | Retail | — |
| Meridian CP | Midtown Crossing MF | Multifamily | — |
| Meridian CP | Westgate Office Park | Office | — |
| Meridian CP | Promenade Retail | Retail | — |
| Meridian CP | Skyline Luxury Residences | Multifamily | — |
| Summit OP III | Heritage Senior Living | Senior Housing | — |
| Summit OP III | Oakwood Memory Care | Senior Housing | — |
| Summit OP III | Commerce Park Flex | Flex | — |
| Summit OP III | Gateway Distribution Ctr | Industrial | — |

**Quarter State Data (90 rows):**
- 6 quarters: 2024Q3, 2024Q4, 2025Q1, 2025Q2, 2025Q3, 2025Q4
- Per asset snapshot: `noi, revenue, opex, capex, debt_service, occupancy, debt_balance, cash_balance, asset_value, nav, ltv, dscr, implied_equity_value`
- Source: [439_repe_canonical_seed.sql](repo-b/db/schema/439_repe_canonical_seed.sql)

**Fund Quarter State (18 rows):**
- 3 funds × 6 quarters
- Per fund: `portfolio_nav, total_committed, total_called, total_distributed, dpi, rvpi, tvpi, gross_irr, net_irr`
- Source: [441_re_all_funds_quarter_state_seed.sql](repo-b/db/schema/441_re_all_funds_quarter_state_seed.sql)

**Debt (15 loans):**
- 1 per asset; LTV 0.55–0.62; rates 4.0–6.3%; mix fixed/floating, IO/amortizing
- Source: [322_re_debt_seed.sql](repo-b/db/schema/322_re_debt_seed.sql)

**Capital Events:**
- 8 capital calls per fund (25%, 20%, 15%, 12%, 8%, 6%, 5%, 4% of target)
- Source: [323_re_capital_events_seed.sql](repo-b/db/schema/323_re_capital_events_seed.sql)

**Partners/LPs:**
- GP + LP partners with committed amounts per fund
- Source: [358_re_partner_capital_seed.sql](repo-b/db/schema/358_re_partner_capital_seed.sql)

**Waterfall Definitions:**
- European and American waterfall tier structures
- Source: [324_re_waterfall_seed.sql](repo-b/db/schema/324_re_waterfall_seed.sql)

**Leases (1 asset only):**
- Meridian Office Tower: 200K SF, 8 tenants, 10 spaces, 8 leases, WALT 3.3 years, 88% occupied
- Source: [349_re_lease_seed.sql](repo-b/db/schema/349_re_lease_seed.sql)

### 5.2 Gaps That Explain Observed Failures

| Gap | Tables Affected | Queries That Fail | Impact |
|-----|----------------|-------------------|--------|
| **`fact_measurement` empty** | `fact_measurement` | `metrics.query` tool | Any semantic metric query returns zero rows |
| **`re_asset_variance_qtr` empty** | `re_asset_variance_qtr` | `finance.noi_variance` | Variance analysis returns empty |
| **Lease data for 14 assets** | `re_lease`, `re_lease_space`, `re_tenant_party` | Lease analytics, rent roll, WALT | Only 1 of 15 assets has lease detail |
| **`re_fund_metrics_qtr` uncertain** | `re_fund_metrics_qtr` | `finance.fund_metrics` direct query | May fall back to `re_fund_quarter_state` |
| **No asset-level performance ranking data** | N/A (data exists but no template) | "Best performing assets" | LLM-generated SQL unreliable |
| **Budget/proforma not linked to variance** | `re_budget_proforma` exists but variance computation missing | Actual vs budget | Budget data seeded but no variance materialization |
| **`re_investment_quarter_state` empty** | `re_investment_quarter_state` | Investment-level analytics | Investment view may return nulls |

### 5.3 Why Fund Summaries Work But Asset Analytics Don't

**Fund summaries work because:**
1. `re_fund_quarter_state` is fully seeded with `gross_irr`, `net_irr`, `tvpi`, `dpi`, `portfolio_nav`
2. `finance.fund_metrics` MCP tool has a direct query path to this table
3. REPE intent classifier has high-confidence patterns for "fund performance"
4. Fast-path routes directly to the tool — no LLM SQL generation needed

**Asset analytics degrade because:**
1. `re_asset_quarter_state` IS seeded (90 rows) — **the data exists**
2. But there's no `repe.rank_assets` MCP tool and no `repe.noi_ranked` SQL template
3. "Best performing assets" falls through to LLM SQL generation
4. LLM must choose between 7+ asset tables and infer the correct metric
5. LLM-generated SQL is unreliable for this pattern

**The data is there. The routing and templates are not.**

---

## 6. Metric and Definition Coverage

### 6.1 Metric Normalizer

| File | [metric_normalizer.py](backend/app/assistant_runtime/metric_normalizer.py) |
|------|-------------|
| **Synonym map** | 10 canonical keys: `noi`, `irr`, `occupancy`, `dscr`, `ltv`, `tvpi`, `dpi`, `nav`, `capex`, `revenue` |
| **Behavior** | Replaces user synonyms with canonical key in query text before classification |
| **Gap** | "Best performing" has no synonym mapping — system doesn't know what metric to rank by |

### 6.2 Semantic Catalog (DB)

| Table | Seeded Definitions | Runtime Status |
|-------|-------------------|----------------|
| `semantic_metric_def` | 40+ metrics (NOI, IRR, TVPI, DPI, NAV, LTV, DSCR, occupancy, debt_yield, etc.) | **Not consumed at runtime** — SQL agent uses static `catalog.py` instead |
| `semantic_entity_def` | fund, deal, asset, property_asset, loan, etc. | Not consumed |
| `semantic_join_def` | 19 validated join paths | Not consumed |
| `semantic_lineage` | NOI flow: monthly → quarterly rollup → quarter state | Not consumed |

**Key insight:** The semantic catalog was designed to be the metric truth source but is bypassed. The SQL agent uses a hardcoded static catalog (`catalog.py`), and the metric normalizer uses its own synonym map. Three separate systems that should be one.

### 6.3 SQL Agent Templates

| Template Key | Metric | Type | Status |
|-------------|--------|------|--------|
| `repe.noi_movers` | NOI change | RANKED_COMPARISON | Working |
| `repe.noi_trend` | NOI over time | TIME_SERIES | Working |
| `repe.occupancy_ranked` | Occupancy | RANKED_COMPARISON | Working |
| `repe.fund_overview` | Fund-level KPIs | GROUPED_AGGREGATION | Working |
| `repe.asset_detail` | Single asset detail | LOOKUP | Working |
| `repe.debt_summary` | Debt metrics | LOOKUP | Working |
| `repe.capital_activity` | Capital calls/dist | FILTERED_LIST | Working |

**Missing templates (needed):**
| Template Key | Metric | Type | Priority |
|-------------|--------|------|----------|
| `repe.noi_ranked` | NOI absolute ranking | RANKED_COMPARISON | P0 |
| `repe.irr_ranked` | IRR by fund/asset | RANKED_COMPARISON | P0 |
| `repe.tvpi_ranked` | TVPI ranking | RANKED_COMPARISON | P1 |
| `repe.nav_ranked` | NAV ranking | RANKED_COMPARISON | P1 |
| `repe.occupancy_trend` | Occupancy over time | TIME_SERIES | P1 |
| `repe.dscr_ranked` | DSCR ranking | RANKED_COMPARISON | P1 |
| `repe.ltv_ranked` | LTV ranking | RANKED_COMPARISON | P1 |
| `repe.debt_maturity` | Debt maturity schedule | TIME_SERIES | P2 |

### 6.4 Metric Coverage by REPE KPI

| Metric | Canonical Key | Normalized in Chat | Grounded SQL Path | Seeded Data | Template Exists | End-to-End Working |
|--------|--------------|--------------------|--------------------|-------------|-----------------|-------------------|
| **NOI** | `noi` | Yes | `re_asset_quarter_state.noi` | Yes (90 rows) | `noi_movers` + `noi_trend` (not `noi_ranked`) | **Partial** — trend works, ranking fails |
| **TTM NOI / LTM NOI** | — | No | Could sum 4 quarters from `re_asset_quarter_state` | Yes (data exists) | **No** | **No** |
| **Gross IRR** | `irr` | Yes (maps to generic "irr") | `re_fund_quarter_state.gross_irr` | Yes (18 rows) | Via `fund_overview` | **Yes** (fund level) |
| **Net IRR** | `irr` | Conflated with gross | `re_fund_quarter_state.net_irr` | Yes | Via `fund_overview` | **Yes** (fund level) |
| **TVPI** | `tvpi` | Yes | `re_fund_quarter_state.tvpi` | Yes | Via `fund_overview` | **Yes** |
| **DPI** | `dpi` | Yes | `re_fund_quarter_state.dpi` | Yes | Via `fund_overview` | **Yes** |
| **RVPI** | — | No | `re_fund_quarter_state.rvpi` | Yes | No dedicated template | **Partial** |
| **NAV** | `nav` | Yes | `re_fund_quarter_state.portfolio_nav` + `re_asset_quarter_state.nav` | Yes | Via `fund_overview` | **Yes** (fund), **No template** (asset) |
| **Variance vs UW** | — | No | `re_asset_variance_qtr` | **NOT SEEDED** | No | **No** |
| **Occupancy** | `occupancy` | Yes | `re_asset_quarter_state.occupancy` | Yes | `occupancy_ranked` | **Yes** |
| **DSCR** | `dscr` | Yes | `re_asset_quarter_state.dscr` | Yes | No | **Partial** — data exists, no template |
| **LTV** | `ltv` | Yes | `re_asset_quarter_state.ltv` | Yes | No | **Partial** — data exists, no template |
| **Debt Yield** | — | No | Could compute as NOI / debt_balance | Data exists | No | **No** |

---

## 7. Action / Write Flow Audit

### 7.1 The Create Fund Bug — Root Cause

**Observed failure sequence:**
1. User: "create a fund"
2. Assistant calls `repe.create_fund(confirmed=false)` with no params
3. Tool returns `{needs_input: true, missing_fields: ["name", "fund_type", "strategy", "vintage_year"]}`
4. Assistant asks for name
5. User: "Atlas Growth Fund V"
6. Assistant calls `repe.create_fund(confirmed=false, name="Atlas Growth Fund V")` — may still lack fund_type, etc.
7. Tool returns `{pending_confirmation: true, summary: {name: "Atlas Growth Fund V", ...}}`
8. `create_pending_action()` stores `params_json: {name: "Atlas Growth Fund V", ...}` in `ai_pending_actions`
9. Assistant: "Ready to create fund. Confirm to proceed."
10. User: "yes"
11. **`check_and_resolve()`** correctly identifies `intent="confirm"`, marks action as confirmed
12. **Route override** sets Lane C with write tools enabled
13. **BUT: `_pending_action_result` params are never injected into the LLM prompt**
14. LLM receives the message "yes" with conversation history but no explicit param injection
15. LLM calls `repe.create_fund(confirmed=true)` — **without the accumulated params**
16. Tool returns "Missing: name"

### 7.2 The Code Path

**Where params are stored** ([pending_action_manager.py:117-225](backend/app/services/pending_action_manager.py)):
```python
create_pending_action(
    conversation_id=...,
    action_type="create_fund",
    params_json={"name": "Atlas Growth Fund V", ...},  # ← stored correctly
    missing_fields=[],
    skill_id="repe.create_fund",
    ...
)
```

**Where params are retrieved** ([ai_gateway.py:~2825](backend/app/services/ai_gateway.py)):
```python
_pending_action_result = check_and_resolve(conversation_id, message)
# Returns: {"intent": "confirm", "pending_action": {"params_json": {...}, "action_type": "create_fund"}}
```

**Where params should be injected but aren't** ([ai_gateway.py:~3161-3204](backend/app/services/ai_gateway.py)):
```python
# This section builds _workflow_augmentation
# It only checks _pending_workflow (from conversation history scanning)
# It NEVER checks _pending_action_result (from database)
if _pending_workflow:
    # ... extracts params from conversation history tool calls
    if is_confirm:
        _workflow_augmentation = f"[CONTEXT: User is confirming... Previously collected parameters: {all_params}...]"
```

**The disconnect:** Two separate systems exist for tracking pending actions:
1. **Legacy**: `_check_pending_workflow()` scans conversation history for tool_calls
2. **Durable**: `check_and_resolve()` reads from `ai_pending_actions` table

Only the legacy system feeds params into the LLM prompt. The durable system stores params correctly but never injects them.

### 7.3 The Fix

After `_pending_action_result` is retrieved with `intent="confirm"`, inject stored params into `_workflow_augmentation`:

```python
# After line ~2863 (route override for confirmed action)
if _pending_action_result and _pending_action_result.get("intent") == "confirm":
    pa = _pending_action_result["pending_action"]
    stored_params = pa.get("params_json", {})
    action_type = pa.get("action_type", "unknown")
    skill_id = pa.get("skill_id", "")
    _workflow_augmentation = (
        f"[CONTEXT: User is confirming a pending {action_type}. "
        f"Previously collected parameters: {json.dumps(stored_params)}. "
        f"Call tool '{skill_id}' with confirmed=true and ALL these parameters. "
        f"Do NOT drop any parameters.]"
    )
```

### 7.4 Slot Collection Architecture

| Component | Status | Notes |
|-----------|--------|-------|
| Required field detection | Working | Tools check missing fields and return `needs_input` |
| `missing_fields` tracking | Working | Stored in `ai_pending_actions.missing_fields` |
| Parameter accumulation across turns | **Broken** | LLM must infer from history; no explicit injection |
| Confirmation timing | **Premature** | Tool returns confirmation before all optional fields collected |
| Post-confirmation execution | **Broken** | Params lost on confirmation turn |
| Supersession on new intent | Working | New intent auto-supersedes old pending action |
| Expiration (30-min TTL) | Working | Prevents stale actions |

---

## 8. Frontend / Backend Contract Mismatches

### 8.1 Response Block Coverage

| Block Type | Backend Sends | Frontend Renders | Status |
|------------|--------------|------------------|--------|
| `markdown_text` | Yes | Yes (ResponseBlockRenderer) | OK |
| `kpi_group` | Yes | Yes (KpiGroupBlock) | OK — renders `null` as "—" |
| `table` | Yes | Yes (ChatTableBlock) | OK |
| `chart` | Yes | Yes (ChatChartBlock) | OK |
| `workflow_result` | Yes | Yes | OK |
| `confirmation` | Yes | Yes (ConfirmationBlock) | **Rendered but not executable** — `onConfirmAction` never wired |
| `error` | Yes | Yes | OK |
| `citations` | Yes | Yes | OK |
| `tool_activity` | Yes | Yes | OK |
| `navigation_suggestion` | Yes | Yes | **Partial** — renders broken links |
| `grounding_badge` | Yes | Yes | OK |

### 8.2 Confirmation Block Execution Gap

**Backend sends** ([assistant_blocks.py:117-134](backend/app/services/assistant_blocks.py)):
```python
confirmation_block(
    action="create_fund",
    summary="Create fund Atlas Growth Fund V",
    provided_params={"name": "Atlas Growth Fund V", ...},
    missing_fields=[],
    confirm_label="Create Fund"
)
```

**Frontend renders** ([ConfirmationBlock.tsx](repo-b/src/components/winston/blocks/ConfirmationBlock.tsx)):
- Shows action name, summary, provided params, confirm/cancel buttons
- `onConfirm()`, `onCancel()`, `onEdit()` callbacks exist in type definition
- **But these callbacks are never connected to parent components**
- Clicking "Confirm" does nothing actionable — user must type "yes" in chat instead

### 8.3 gross_irr / net_irr Issue

**Portfolio KPI route** ([portfolio-kpis/route.ts](repo-b/src/app/api/re/v2/environments/[envId]/portfolio-kpis/route.ts)):
- Computes `gross_irr` as NAV-weighted average from `re_fund_quarter_state`
- Returns `null` if no NAV exists for the requested quarter
- Returns `warnings: ["No portfolio NAV found for {quarter}. Run a quarter close to compute."]`

**KPI Block rendering**: Null values display as "—" — correct behavior, but **masks** the underlying data issue. The warning is not surfaced to the user.

### 8.4 Broken Navigation Routes

| Suggested Route | Exists | Source |
|----------------|--------|--------|
| `/lab/env/{id}/re/funds/{fundId}` | Yes | suggestion_templates.py |
| `/lab/env/{id}/re/assets/{assetId}` | Yes | suggestion_templates.py |
| `/lab/env/{id}/re/funds/{fundId}/financials` | **No** | degraded_responses.py:60 |
| `/lab/env/{id}/re` | Yes | degraded_responses.py |
| `/lab/env/{id}/re/funds` | Yes | degraded_responses.py |
| `/lab/env/{id}/re/assets` | Yes | degraded_responses.py |
| `/lab/env/{id}/re/dashboards` | Yes | — |
| `/lab/env/{id}/re/portfolio` | Yes | — |

### 8.5 env_id Binding Fragility

**Frontend hardcode**: `MERIDIAN_DEMO_ENV_ID = "9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f101"` ([winston-demo.ts:3](repo-b/src/lib/winston-demo.ts))

**Migration 430**: Creates Meridian environment with auto-generated UUID; may not match hardcoded value.

**Seed data**: Binds by `business_id` + fund name, not by `env_id`. If the env_id doesn't resolve to the correct business, all queries return empty.

**Risk**: Works only if DB was bootstrapped with the exact migration 430 creating the environment with the expected UUID. Fresh DB installs may break.

---

## 9. Meridian Golden Path Audit

| # | User Intent | Should Work Now? | Implementation Path | Failure/Degradation Reason | Missing Dependency |
|---|------------|-----------------|---------------------|---------------------------|-------------------|
| 1 | **Rundown of funds** | **Yes** | `repe.list_funds` → fund cards | — | None |
| 2 | **Performance metrics by fund** | **Yes** | `finance.fund_metrics` → KPI block with IRR/TVPI/DPI/NAV | — | None |
| 3 | **Best performing assets** | **No — degrades** | No template match → LLM SQL generation → unreliable | No `repe.noi_ranked` template; no `repe.rank_assets` tool; "best performing" has no metric mapping | Add template + tool |
| 4 | **Asset NOI over time** | **Yes** | `sql.run_saved_query("repe.noi_trend")` → chart block | — | None |
| 5 | **Compare actual vs underwriting** | **No** | `finance.noi_variance` → queries `re_asset_variance_qtr` | Table not seeded | Seed variance data or add variance materialization |
| 6 | **List investors / commitments** | **Yes** | `INTENT_LIST_INVESTORS` → `repe_investor_tools` → table block | — | None |
| 7 | **Create a new fund** | **No — broken** | `repe.create_fund` → confirmation → **params lost on "yes"** | `_pending_action_result.params_json` not injected into LLM prompt | Fix param injection in ai_gateway.py |
| 8 | **Navigate to fund/asset page** | **Mostly yes** | Navigation suggestion blocks → frontend links | `/funds/{id}/financials` route broken | Fix degraded_responses.py:60 |
| 9 | **Occupancy ranking** | **Yes** | `sql.run_saved_query("repe.occupancy_ranked")` → table block | — | None |
| 10 | **Debt surveillance** | **Partial** | No dedicated tool; LLM agentic path queries `re_loan` | No template for debt maturity or DSCR ranking | Add `repe.debt_summary` template |
| 11 | **Lease/rent roll** | **1 asset only** | SQL agent against `re_lease` | Only Meridian Office Tower has lease data | Seed leases for remaining 14 assets |
| 12 | **Dashboard generation** | **Yes** | `INTENT_GENERATE_DASHBOARD` → fast-path → 7-widget spec | — | None |
| 13 | **Waterfall analysis** | **Yes** | `finance.run_waterfall` → waterfall result card | — | None |
| 14 | **Stress test** | **Yes** | `finance.stress_cap_rate` → stress result card | — | None |

**Summary: 8 of 14 golden paths work. 6 fail or degrade.**

---

## 10. Canonical Backlog for Substantive Foundation

### Priority 0 — Blockers for Meaningful Meridian Demo

| # | Title | Why It Matters | Files/Tables Affected | Work Type | Owner Order |
|---|-------|---------------|----------------------|-----------|-------------|
| P0-1 | **Fix pending action param injection** | Create-fund (and all write actions) lose accumulated params on confirmation | `ai_gateway.py` ~line 2863 | Code | Backend |
| P0-2 | **Add `repe.noi_ranked` SQL template** | "Best performing assets" is the #1 demo query that fails | `query_templates.py`, `query_classifier.py` | Code + template | Backend |
| P0-3 | **Add `repe.rank_assets` MCP tool** | Dedicated tool with proper scoping, sorting, metric selection | `backend/app/mcp/tools/repe_tools.py` or new `repe_ranking_tools.py` | Code | Backend |
| P0-4 | **Seed `re_asset_variance_qtr`** | "Actual vs budget" fails; variance analysis is a core REPE workflow | New seed file `442_re_variance_seed.sql` | Seed data | Data |
| P0-5 | **Wire confirmation block `onConfirm` in frontend** | Confirm button is visual-only; users must type "yes" instead | `WinstonInstitutionalShell.tsx` or parent integration component | Code | Frontend |
| P0-6 | **Fix broken `/financials` navigation suggestion** | Degraded responses suggest a 404 route | `degraded_responses.py:60` | Code (1-line fix) | Backend |

### Priority 1 — Next Most Valuable Data/Definition Gaps

| # | Title | Why It Matters | Files/Tables Affected | Work Type | Owner Order |
|---|-------|---------------|----------------------|-----------|-------------|
| P1-1 | **Add 8 missing SQL templates** | `irr_ranked`, `tvpi_ranked`, `nav_ranked`, `dscr_ranked`, `ltv_ranked`, `occupancy_trend`, `debt_maturity`, `noi_ranked` (if not covered by P0-2) | `query_templates.py` | Template definition | Backend |
| P1-2 | **Seed lease data for remaining 14 assets** | Lease analytics work for only 1 of 15 assets | New seed file or expand `349_re_lease_seed.sql` | Seed data | Data |
| P1-3 | **Populate or deprecate `fact_measurement`** | `metrics.query` MCP tool returns zero rows for Meridian | Either ETL from quarter_state → fact_measurement, or remove `metrics.query` tool | Code or seed | Backend/Data |
| P1-4 | **Connect semantic catalog to SQL agent** | 40+ metric defs in DB unused; SQL agent uses static `catalog.py` | `catalog.py`, `combined_agent.py` system prompt | Code | Backend |
| P1-5 | **Add TTM NOI / LTM NOI metric** | Common REPE metric with no definition or template | Metric normalizer + template | Definition + code | Backend |
| P1-6 | **Add debt yield metric** | NOI / debt_balance — data exists but metric not defined | Metric normalizer + template | Definition + code | Backend |
| P1-7 | **Stabilize env_id binding for Meridian** | Fragile UUID hardcode vs auto-generated migration | `430_meridian_stone_environment_registry.sql`, `winston-demo.ts` | Code + migration | Full stack |
| P1-8 | **Verify `re_fund_metrics_qtr` is populated** | `finance.fund_metrics` tool may query empty table | Verify or add materialization step | Verification + possible seed | Data |
| P1-9 | **Add `repe.debt_summary` tool/template** | Debt surveillance has no dedicated tool or template | `repe_tools.py` or new tool file | Code | Backend |

### Priority 2 — Polish / Expansion

| # | Title | Why It Matters | Files/Tables Affected | Work Type | Owner Order |
|---|-------|---------------|----------------------|-----------|-------------|
| P2-1 | **Separate gross_irr vs net_irr in normalizer** | Both map to generic "irr" — user can't distinguish | `metric_normalizer.py` | Code | Backend |
| P2-2 | **Surface KPI warnings in assistant responses** | Portfolio KPI route returns `warnings[]` but assistant never shows them | `ai_gateway.py` KPI block builder | Code | Backend |
| P2-3 | **Format action names in confirmation blocks** | Frontend shows raw "create_fund" instead of "Create Fund" | `ConfirmationBlock.tsx` | Code | Frontend |
| P2-4 | **Add asset-vs-asset comparison template** | `finance.compare_scenarios` compares scenarios, not assets | `query_templates.py` | Template | Backend |
| P2-5 | **Seed `re_investment_quarter_state`** | Investment-level views return nulls | New seed or materialization | Seed data | Data |
| P2-6 | **Add budget-to-variance materialization** | Budget data seeded (286) but variance never computed | New service or materialization SQL | Code | Backend |
| P2-7 | **Unify metric systems** | Three separate: normalizer, semantic catalog, static catalog.py | Architecture decision + refactor | Code | Backend |
| P2-8 | **Add "best performing" intent to classifier** | Should route to asset ranking tool with confidence | `repe_intent.py` or `query_classifier.py` | Code | Backend |

---

## 11. Foundation Package Spec

### Schema / Data to Seed

| Item | Table(s) | Seed File | Rows | Priority |
|------|----------|-----------|------|----------|
| Asset variance data | `re_asset_variance_qtr` | `442_re_variance_seed.sql` (new) | 15 assets × 6 quarters × ~5 line items = ~450 rows | P0 |
| Lease data for 14 assets | `re_lease`, `re_lease_space`, `re_tenant_party`, `re_lease_event` | Expand `349_re_lease_seed.sql` or new `443_re_lease_full_seed.sql` | ~100 leases, ~150 spaces, ~80 tenants | P1 |
| `fact_measurement` for Meridian | `fact_measurement` | `444_fact_measurement_seed.sql` (new) OR deprecate `metrics.query` tool | 15 assets × 10 metrics × 6 quarters = ~900 rows | P1 |
| Investment quarter state | `re_investment_quarter_state` | `445_investment_qs_seed.sql` (new) | 3 investments × 6 quarters = 18 rows | P2 |
| Verify/fix `re_fund_metrics_qtr` | `re_fund_metrics_qtr` | Verify existing or add to `441` | 3 funds × 6 quarters = 18 rows | P1 |

### Metrics to Define

| Metric | Canonical Key | SQL Expression | Source Table | Priority |
|--------|--------------|---------------|-------------|----------|
| TTM NOI | `ttm_noi` | SUM(noi) over trailing 4 quarters | `re_asset_quarter_state` | P1 |
| Debt Yield | `debt_yield` | noi / debt_balance | `re_asset_quarter_state` | P1 |
| RVPI (explicit) | `rvpi` | Already in `re_fund_quarter_state` — needs normalizer entry | `re_fund_quarter_state` | P1 |
| Gross IRR (distinct) | `gross_irr` | Already in data — normalizer conflates with net_irr | `re_fund_quarter_state` | P2 |
| Net IRR (distinct) | `net_irr` | Already in data — normalizer conflates with gross_irr | `re_fund_quarter_state` | P2 |
| NOI per SF | `noi_per_sf` | noi / total_sf | `re_asset_quarter_state` + `repe_property_asset` | P2 |

### Reports / Dashboards to Define

| Report | Template Key | Layout | Priority |
|--------|-------------|--------|----------|
| Asset Performance Ranking | `repe.asset_performance_dashboard` | KPI strip + ranked table + trend chart | P0 |
| Debt Surveillance | `repe.debt_surveillance_dashboard` | Maturity timeline + DSCR heatmap + LTV distribution | P1 |
| Variance Report | `repe.variance_report` | NOI variance waterfall + line-item table | P1 |
| Lease Expiration | `repe.lease_expiration_dashboard` | WALT chart + expiration schedule + occupancy trend | P2 |

### SQL Templates to Add

| Template Key | Query Type | SQL Core | Priority |
|-------------|-----------|---------|----------|
| `repe.noi_ranked` | RANKED_COMPARISON | `SELECT a.name, aqs.noi FROM re_asset_quarter_state aqs JOIN repe_asset a ... ORDER BY aqs.noi DESC` | P0 |
| `repe.irr_ranked` | RANKED_COMPARISON | `SELECT f.name, fqs.gross_irr FROM re_fund_quarter_state fqs JOIN repe_fund f ... ORDER BY fqs.gross_irr DESC` | P1 |
| `repe.tvpi_ranked` | RANKED_COMPARISON | Same pattern with `fqs.tvpi` | P1 |
| `repe.nav_ranked` | RANKED_COMPARISON | Same pattern with `aqs.nav` or `fqs.portfolio_nav` | P1 |
| `repe.dscr_ranked` | RANKED_COMPARISON | Same pattern with `aqs.dscr` | P1 |
| `repe.ltv_ranked` | RANKED_COMPARISON | Same pattern with `aqs.ltv` | P1 |
| `repe.occupancy_trend` | TIME_SERIES | `SELECT aqs.quarter, AVG(aqs.occupancy) FROM re_asset_quarter_state aqs ... GROUP BY quarter ORDER BY quarter` | P1 |
| `repe.debt_maturity` | TIME_SERIES | `SELECT l.maturity_date, COUNT(*), SUM(l.current_upb) FROM re_loan l ... GROUP BY maturity_date` | P2 |

### Skills to Connect to Canonical Sources

| Skill / Tool | Current State | Required Change | Priority |
|-------------|--------------|----------------|----------|
| `repe.rank_assets` (new) | Does not exist | Create MCP tool that queries `re_asset_quarter_state` with metric param, sort, limit | P0 |
| `repe.debt_summary` (new) | Does not exist | Create MCP tool for debt portfolio view from `re_loan` + `re_asset_quarter_state` | P1 |
| `metrics.query` | Queries empty `fact_measurement` | Either populate table or redirect to `re_asset_quarter_state`/`re_fund_quarter_state` | P1 |
| `finance.noi_variance` | Queries empty `re_asset_variance_qtr` | Seed variance data | P0 |
| SQL agent catalog | Uses static `catalog.py` | Connect to `semantic_metric_def` / `semantic_join_def` at runtime | P2 |

### Actions to Harden

| Action | Current Bug | Fix | Priority |
|--------|-----------|-----|----------|
| All write actions (create_fund, create_deal, create_asset) | Params lost on confirmation | Inject `_pending_action_result.params_json` into LLM prompt | P0 |
| Confirmation block UI | Rendered but not executable | Wire `onConfirmAction` callback to parent component | P0 |
| Navigation suggestions | Broken `/financials` route | Remove or fix in `degraded_responses.py:60` | P0 |

### Tests to Add

| Test | What It Validates | Priority |
|------|------------------|----------|
| Pending action param round-trip | Store params → confirm → verify tool called with all stored params | P0 |
| Asset ranking end-to-end | "Best performing assets" → ranked table with NOI values | P0 |
| Variance query with seeded data | `finance.noi_variance` returns non-empty result | P0 |
| Confirmation block action dispatch | Frontend confirm button triggers backend re-invocation | P0 |
| Navigation suggestion route validation | All suggested routes resolve to real pages | P1 |
| Metric normalizer coverage | Every seeded metric_key has a normalizer synonym | P1 |
| env_id binding stability | Meridian env_id resolves correctly after fresh DB bootstrap | P1 |
| Lease analytics across portfolio | Lease queries return data for >1 asset | P1 |
| `fact_measurement` population | `metrics.query("noi")` returns non-empty for Meridian | P1 |
| TTM NOI computation | Trailing-4-quarter sum matches expected value | P2 |

---

## Appendix: Key File Index

| File | Purpose | Section Reference |
|------|---------|-------------------|
| [ai_gateway.py](backend/app/services/ai_gateway.py) | Core dispatch engine, LLM loop, tool execution | 2.1, 7.2 |
| [pending_action_manager.py](backend/app/services/pending_action_manager.py) | Durable confirmation state machine | 2.5, 7.1 |
| [request_router.py](backend/app/services/request_router.py) | Lane classification (A/B/C/D/F) | 2.2 |
| [repe_intent.py](backend/app/services/repe_intent.py) | 40+ intent families, fast-path | 2.4 |
| [assistant_blocks.py](backend/app/services/assistant_blocks.py) | 11 response block builders | 2.7 |
| [assistant_scope.py](backend/app/services/assistant_scope.py) | Entity resolution chain | 2.6 |
| [ai_conversations.py](backend/app/services/ai_conversations.py) | Thread entity state, conversation storage | 2.6 |
| [metric_normalizer.py](backend/app/assistant_runtime/metric_normalizer.py) | Synonym → canonical key mapping | 6.1 |
| [degraded_responses.py](backend/app/assistant_runtime/degraded_responses.py) | Fallback response templates | 2.8, 8.4 |
| [query_templates.py](backend/app/sql_agent/query_templates.py) | 7 REPE SQL templates | 6.3 |
| [query_classifier.py](backend/app/sql_agent/query_classifier.py) | NL → query type classification | 6.3 |
| [catalog.py](backend/app/sql_agent/catalog.py) | Static table definitions for SQL agent | 6.2 |
| [registry.py](backend/app/mcp/registry.py) | MCP tool registry | 2.3 |
| [repe_tools.py](backend/app/mcp/tools/repe_tools.py) | Fund/deal/asset CRUD tools | 3, 7.1 |
| [repe_finance_tools.py](backend/app/mcp/tools/repe_finance_tools.py) | Waterfall, metrics, stress tools | 3 |
| [metrics_tools.py](backend/app/mcp/tools/metrics_tools.py) | Semantic metric query tools | 3, 6 |
| [sql_agent_tools.py](backend/app/mcp/tools/sql_agent_tools.py) | NL→SQL MCP tools | 3 |
| [assistantApi.ts](repo-b/src/lib/commandbar/assistantApi.ts) | Frontend SSE streaming client | 2.9 |
| [ConfirmationBlock.tsx](repo-b/src/components/winston/blocks/ConfirmationBlock.tsx) | Confirmation UI (unwired) | 8.2 |
| [winston-demo.ts](repo-b/src/lib/winston-demo.ts) | Hardcoded Meridian env_id | 8.5 |
| [portfolio-kpis/route.ts](repo-b/src/app/api/re/v2/environments/[envId]/portfolio-kpis/route.ts) | Portfolio KPI API | 8.3 |
| [340_semantic_catalog.sql](repo-b/db/schema/340_semantic_catalog.sql) | Metric/entity/join definitions schema | 4.8 |
| [341_semantic_catalog_seed.sql](repo-b/db/schema/341_semantic_catalog_seed.sql) | 40+ metric definitions seed | 5, 6.2 |
| [361_re_summary_views.sql](repo-b/db/schema/361_re_summary_views.sql) | Portfolio/asset/fund summary views | 4.10 |
| [378_scenario_v2_seed.sql](repo-b/db/schema/378_scenario_v2_seed.sql) | 3 funds, 15 assets, scenarios | 5.1 |
| [439_repe_canonical_seed.sql](repo-b/db/schema/439_repe_canonical_seed.sql) | 90 asset quarter-state rows | 5.1 |
| [441_re_all_funds_quarter_state_seed.sql](repo-b/db/schema/441_re_all_funds_quarter_state_seed.sql) | 18 fund quarter-state rows | 5.1 |
| [430_meridian_stone_environment_registry.sql](repo-b/db/schema/430_meridian_stone_environment_registry.sql) | Meridian env registration | 8.5 |
