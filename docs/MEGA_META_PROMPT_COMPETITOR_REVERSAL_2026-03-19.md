# Winston Build Directive — Competitor Reversal Meta Prompt
**Generated:** 2026-03-19
**Source:** 2-day competitor reverse engineering scan (Altus/ARGUS, Cambio, Glean, Juniper Square, Yardi) + full repo audit
**Status:** Active. Use as session-opening prompt when building any REPE feature.

---

## How to Use This Document

This is a repo-aware build directive, not a generic feature wishlist. Every item is grounded in:
1. What Winston already has (confirmed by MCP tool registry, backend routes, and frontend page tree)
2. What competitors are shipping (confirmed by direct site scrapes, press releases, and product pages)
3. The specific gap between them — described in architectural terms, not marketing terms

Read Part 1 before building anything. Parts 2–4 are the build queue. Part 5 is positioning context you keep in mind whenever writing code that touches LP-facing, CFO-facing, or GP-facing surfaces.

---

## Part 1 — Winston's Confirmed Capability Baseline

### What Is Already Built (Do Not Rebuild)

**Financial Engine — Fully Operational**
- `finance.run_waterfall` — European and American waterfall with carry, preferred return, catchup
- `finance.portfolio_waterfall` — cross-fund aggregation waterfall
- `finance.construction_waterfall` — development deal waterfall
- `finance.monte_carlo_waterfall` — stochastic waterfall simulation
- `finance.fund_metrics` — IRR, TVPI, DPI, RVPI, cash-on-cash, gross/net bridge, XIRR
- `finance.lp_summary` — per-investor capital account snapshot
- `finance.nav_rollforward` — NAV roll from prior period through current
- `finance.list_capital_calls` / `finance.get_capital_call` — capital call data access
- `finance.list_distributions` / `finance.get_distribution` — distribution data access
- `finance.capital_call_impact` — models the effect of a new call on LP accounts
- `finance.list_investors` / `finance.get_investor_summary` — investor-level views
- `finance.list_capital_activity` — full capital event history per investor
- `finance.clawback_risk` — carry clawback exposure modeling
- `finance.generate_waterfall_memo` — AI-drafted waterfall explanation

**Performance & Analysis — Fully Operational**
- `finance.uw_vs_actual_waterfall` — underwriting baseline vs. actual performance comparison
- `finance.noi_variance` — NOI variance by period
- `finance.stress_cap_rate` — cap rate stress test across assets
- `finance.sensitivity_matrix` — multi-lever sensitivity table
- `finance.compare_scenarios` — before/after scenario comparison
- `finance.compare_waterfall_runs` — diff two waterfall run outputs
- `finance.run_sale_scenario` — exit modeling for a specific asset
- `finance.list_scenario_templates` — saved scenario configurations

**Deal Pipeline — Fully Operational**
- `finance.deal_geo_score` — geographic scoring of pipeline deals
- `finance.pipeline_radar` — deal pipeline radar chart visualization

**Operations — Fully Operational**
- `ops.period_close_status` — monthly/quarterly close tracking
- `ops.fund_quarter_detail` — full fund quarter data assembly
- `ops.fee_schedule` — management fee schedule access
- `ops.compute_fees` — fee calculation engine

**Documents & RAG — Fully Operational**
- `documents.init_upload` / `documents.complete_upload` — document ingestion pipeline
- `documents.list` / `documents.get_versions` / `documents.get_download_url` — document access
- `documents.tag` — document tagging/classification
- `rag.search` — vector search over document corpus
- `platform.list_documents` — platform-level document listing
- `platform.save_analysis` / `platform.list_saved_analyses` — analysis persistence
- `platform.list_approvals` — approval workflow tracking

**Frontend Pages — Exist and Are Routed**
- `/app/repe/assets/[assetId]` — asset detail view
- `/app/repe/deals/[dealId]` — deal detail view
- `/app/repe/funds/[fundId]` — fund detail view
- `/app/repe/waterfalls` — waterfall explorer
- `/app/repe/models/[modelId]` — financial model view
- `/app/repe/capital` — capital activity view
- `/app/repe/controls` — controls/approvals surface
- `/app/repe/documents` — document library
- `/app/repe/portfolio` — portfolio-level view
- `/app/repe/sustainability` — ESG/sustainability module

**Backend Routes — Confirmed**
- `re_waterfall.py` — shadow waterfall runner, investor statement endpoint
- `re_v1_funds.py` / `re_v2.py` — fund data routes
- `re_valuation.py` — asset valuation routes
- `re_uw_reports.py` / `re_uw_links.py` — underwriting report routes
- `re_fund_metrics.py` (service) — full IRR/metric calculation service

**AI & Routing Infrastructure**
- 83 registered MCP tools across 22 tool modules
- Full CLAUDE.md router + 18 agents + 13 normalized skills
- RAG indexer, RAG reranker, model dispatch (`ai_gateway.py`)
- Full-screen Winston chat workspace with SSE streaming
- Document ingestion + vector pipeline
- `nv_ai_copilot.py` — AI gateway service

---

## Part 2 — Build Queue (Prioritized by Competitor Signal + Effort)

The following items are confirmed gaps, ordered by priority score. Each has a confirmed data layer in Winston already. These are **delivery builds**, not research projects.

---

### BUILD-01: Covenant Breach Alert Engine
**Priority:** 9/10 | **Effort:** 3–5 days | **Classification:** Easy (data exists)
**Competitor signal:** Yardi Debt Manager — centralized covenant tracking with automated breach alerts

**What exists:**
- DSCR and LTV are calculated and stored per asset
- `finance.fund_metrics` and asset financial services have debt service coverage data
- `platform.list_approvals` suggests notification infrastructure exists

**What to build:**
1. A `CovenantRule` model in the data layer: `{asset_id, loan_id, metric: "dscr"|"ltv"|"dscr_yield", floor|ceiling, alert_threshold_pct}` — stored in the database per loan agreement
2. A `covenant_evaluator` service that runs on each financial data refresh: pulls current DSCR/LTV per asset, evaluates against stored rules, emits `covenant_alert` records with severity (`warning` = within threshold, `breach` = over/under)
3. A "Covenant Dashboard" section on the asset detail page (`/app/repe/assets/[assetId]`) showing all loans with current vs. covenant values and color-coded status
4. In-app notification when a covenant alert fires; optionally email via existing notification path

**MCP tool to add:**
- `finance.check_covenant_compliance(asset_id)` — returns list of covenants, current values, status, days until potential breach at current trajectory
- `finance.list_covenant_alerts(fund_id?, severity?)` — portfolio-level alert roll-up

**Winston AI prompt directive:**
When a user asks "what's our covenant exposure?" or "any covenant risks?", Winston should call `finance.list_covenant_alerts` first, then `finance.check_covenant_compliance` on flagged assets, then synthesize into a narrative with specific loan names, threshold values, and projected breach dates.

**Demo target:** CFO opens asset with DSCR at 1.19x against 1.25x floor → real-time breach alert fires → asks Winston "draft lender notification" → Winston produces the letter.

---

### BUILD-02: Quarterly LP Report Auto-Assembly
**Priority:** 9/10 | **Effort:** 3–5 days | **Classification:** Easy (all data modules exist)
**Competitor signal:** Juniper Square JunieAI — automated LP report compilation

**What exists:**
- `finance.lp_summary` — per-investor capital account
- `finance.nav_rollforward` — NAV through current period
- `finance.fund_metrics` — IRR, TVPI, DPI
- `finance.uw_vs_actual_waterfall` — UW vs Actual data
- `finance.noi_variance` — asset-level NOI variance
- `finance.generate_waterfall_memo` — AI-drafted waterfall narrative
- `ops.fund_quarter_detail` — full quarter data assembly

**What to build:**
1. A `ReportAssembler` service: `assemble_lp_report(fund_id, quarter)` that calls all the above tools in sequence, aggregates results into a structured report object
2. A "Generate Q[N] LP Report" trigger button in the LP Summary module
3. A report template (HTML → PDF): cover page, fund summary metrics table, per-asset highlights section, distribution table, UW vs. Actual variance section
4. An AI narrative pass: after data assembly, call the Winston AI to draft the GP narrative section using `finance.generate_waterfall_memo` + variance context
5. PDF export via existing document pipeline

**MCP tool to add:**
- `finance.assemble_lp_report(fund_id, quarter)` — returns structured report object ready for rendering
- `finance.generate_gp_narrative(fund_id, quarter, variance_context)` — AI-drafted GP letter

**Winston AI prompt directive:**
When a user asks "generate the Q[N] LP report" or "compile quarterly report for [fund]", Winston should call `finance.assemble_lp_report`, then `finance.generate_gp_narrative` for the narrative section, then present the assembled report with a PDF export option.

**Demo target:** Click "Generate Q1 2025 LP Report" → 30-second assembly → full formatted report appears → AI drafts GP narrative section on request.

---

### BUILD-03: DDQ Response Drafter
**Priority:** 8/10 | **Effort:** 1–3 days | **Classification:** Easy (RAG exists)
**Competitor signal:** Juniper Square JunieAI — automated DDQ response drafting

**What exists:**
- `rag.search` — full vector search over document corpus
- `documents.list` / `documents.tag` — document corpus management
- Winston AI chat workspace — already capable of RAG + AI drafting
- `platform.save_analysis` — analysis persistence for saving draft DDQ

**What to build:**
1. A `DDQWorkflow` module: accepts a DDQ document (uploaded via existing pipeline), extracts all questions (LLM parse), runs `rag.search` per question against the fund's document corpus, drafts a response per question with source citations, flags questions with no supporting documents
2. A "DDQ Assistant" entry point in the document workspace or Winston chat via a `/ddq` command
3. Structured output: question → draft answer → source document → confidence level → "needs GP input" flag
4. Word/PDF export of pre-filled DDQ

**MCP tool to add:**
- `documents.process_ddq(document_id)` — returns structured question list with draft answers, sources, and flags

**Winston AI prompt directive:**
When a user types `/ddq` or "help me fill out this DDQ" or uploads a document tagged as "DDQ" or "questionnaire", Winston should invoke the DDQ workflow: parse questions from the document, run RAG on each, return a structured draft with citations. Questions with no matching document should be surfaced as "needs input" and Winston should prompt the user to provide context.

**Demo target:** Upload a 60-question ILPA DDQ → Winston drafts 52 answers with cited sources → flags 8 for GP input → export to Word.

---

### BUILD-04: Capital Call + Distribution Notice Generator
**Priority:** 8/10 | **Effort:** 3–5 days | **Classification:** Easy (calculations exist)
**Competitor signal:** Yardi automated capital calls / Juniper Square distribution payments

**What exists:**
- `finance.list_capital_calls` / `finance.get_capital_call` — full capital call data
- `finance.capital_call_impact` — per-LP share calculation
- `finance.list_distributions` / `finance.get_distribution` — distribution data
- `finance.list_investors` / `finance.get_investor_summary` — LP roster
- Document pipeline for PDF generation

**What to build:**
1. A `NoticeGenerator` service: `generate_capital_call_notices(call_id)` — iterates LP roster, pulls each investor's pro-rata amount from `capital_call_impact`, renders a per-investor PDF notice (call amount, wire instructions, due date, fund name) from a template
2. Same pattern for distributions: `generate_distribution_notices(distribution_id)`
3. A "Issue Notices" button in the capital activity view (`/app/repe/capital`) that triggers batch generation
4. Notice review queue: GP reviews generated notices before send; one-click approve/send
5. Email send via existing notification path; optionally download as ZIP of PDFs

**MCP tool to add:**
- `finance.generate_capital_call_notices(call_id)` — returns batch of rendered notice objects
- `finance.generate_distribution_notices(distribution_id)` — same for distributions

**Winston AI prompt directive:**
When a user says "issue capital call notices" or "prepare distribution letters", Winston should call `finance.get_capital_call` or `finance.get_distribution` to confirm the amounts, then call the notice generator, present a summary of what will be sent to each LP, and ask for confirmation before executing.

---

### BUILD-05: Portfolio Scenario Analysis UI
**Priority:** 9/10 | **Effort:** 3–5 days | **Classification:** Easy (calc layer exists)
**Competitor signal:** Altus Group ARGUS Intelligence — portfolio-level scenario analysis with attribution

**What exists:**
- `finance.stress_cap_rate` — cap rate stress across assets
- `finance.sensitivity_matrix` — multi-lever sensitivity table
- `finance.compare_scenarios` — before/after scenario diff
- `finance.run_sale_scenario` — per-asset exit modeling
- `finance.list_scenario_templates` — saved scenario configs
- `/app/repe/models/[modelId]` — model view page exists

**What to build:**
1. A "Portfolio Scenario Runner" UI panel — accessible from the portfolio view (`/app/repe/portfolio`) and fund view (`/app/repe/funds/[fundId]`)
2. Parameter inputs: cap rate delta (±bps), vacancy delta (±%), rent growth delta (±%), interest rate delta (±bps), exit year range — all as sliders with real-time preview
3. On run: calls `finance.stress_cap_rate` + `finance.sensitivity_matrix` across all assets in the fund, aggregates results at fund level, presents IRR and equity multiple impact table sorted by most-exposed asset
4. Save-to-template via `finance.list_scenario_templates` for reuse

**MCP tool to add (or extend):**
- `finance.run_portfolio_scenario(fund_id, assumptions: {cap_rate_delta, vacancy_delta, rent_growth_delta, rate_delta})` — aggregates stress results across all fund assets in one call

**Winston AI prompt directive:**
When a user asks "stress test the fund" or "what happens if cap rates go up 75bps?" or "model a recession scenario", Winston should call `finance.run_portfolio_scenario` with the inferred assumptions, present a table of IRR/equity multiple impacts by asset, identify the most exposed assets, and offer to save the scenario to templates.

**Demo target:** "Stress test Fund II at cap rate +100bps and vacancy +5%" → instant fund-level IRR drop table by asset → "save as Bear Case Q2 2026" → done.

---

### BUILD-06: Variance Attribution Waterfall (NOI Decomposition)
**Priority:** 8/10 | **Effort:** 1–2 weeks | **Classification:** Moderate
**Competitor signal:** Altus ARGUS Benchmark Manager — attribution analysis, variance decomposition by driver

**What exists:**
- `finance.uw_vs_actual_waterfall` — UW vs Actual comparison data
- `finance.noi_variance` — period NOI variance
- Winston AI chat — can draft LP variance narrative

**What's missing:**
The current UW vs Actual shows total variance. The missing piece is decomposition: break the $50K NOI shortfall into $30K from occupancy, $15K from operating expenses, $5K from parking revenue. This requires a driver attribution model on top of the existing variance data.

**What to build:**
1. A `VarianceAttributor` service: takes `(asset_id, period, baseline: "uw"|"prior_period"|"budget")` and decomposes total NOI variance into revenue drivers (occupancy, base rent, ancillary) and expense drivers (opex, capex, management fees)
2. A waterfall chart component showing the attribution visually (bridge from baseline to actual)
3. An AI narrative generator: given the attribution output, draft the LP variance explanation paragraph per asset
4. Surface in the asset detail view as a "Variance Deep Dive" section and in the quarterly LP report assembly (BUILD-02 integration)

**MCP tool to add:**
- `finance.noi_attribution(asset_id, period, baseline)` — returns structured variance attribution by driver
- `finance.draft_variance_narrative(asset_id, period, attribution_context)` — AI-drafted LP variance explanation

**Winston AI prompt directive:**
When a user asks "what drove the variance?" or "explain the NOI shortfall" or "draft the variance section for the LP letter", Winston should call `finance.noi_attribution` first, then `finance.draft_variance_narrative` with the attribution context, then present the waterfall chart and drafted narrative together.

---

### BUILD-07: Structured Extraction from Operating Documents
**Priority:** 9/10 | **Effort:** 3–7 days | **Classification:** Easy-Moderate
**Competitor signal:** Cambio — agentic building data ingestion from PDFs; "4x data quality improvement"

**What exists:**
- `documents.init_upload` / `documents.complete_upload` — full document ingestion pipeline
- `rag.search` — vector search (this indexes for search, not structured extraction)
- `documents.tag` — classification layer

**What's missing:**
The current pipeline indexes documents for vector search. What's needed is a separate extraction pass that reads T-12s, rent rolls, and operating statements and writes structured financial fields into the asset data model — replacing manual data entry.

**What to build:**
1. A `StructuredExtractor` service with asset-class-aware field maps:
   - **Multifamily:** unit mix, avg rent by unit type, physical occupancy, economic occupancy, rental income, ancillary income, opex by category
   - **Office/Retail:** tenant name, suite, SF, base rent, lease expiration, CAM, vacancy
   - **Industrial:** tenant, SF, NNN rent, lease term, opex
2. An LLM extraction prompt per asset class that reads the ingested document and returns a typed JSON payload matching the field map
3. A validation pass: compare extracted values against prior period actuals; flag anything >20% different as "needs review"
4. A UI flow: after upload, if document is tagged as a T-12 or rent roll, trigger extraction → show "Review Extracted Data" modal → user approves/edits → data writes to asset record

**MCP tool to add:**
- `documents.extract_operating_statement(document_id, asset_id)` — runs structured extraction, returns field map + anomalies
- `documents.confirm_extraction(document_id, asset_id, approved_fields)` — writes approved extracted data to asset record

**Winston AI prompt directive:**
When a user uploads a document and it's identified as a T-12, rent roll, or operating statement (by file name or classification), Winston should proactively offer to run structured extraction: "I can pull the financial data from this document and update your asset record. Want me to?" Then run `documents.extract_operating_statement` and present the extracted fields for review before writing.

---

### BUILD-08: Data Quality Anomaly Flagging
**Priority:** 7/10 | **Effort:** 2–3 days | **Classification:** Easy
**Competitor signal:** Cambio — automated data quality checks; "4x data quality improvement"

**What exists:**
- GL aggregation data per asset
- `finance.noi_variance` — period variance is already computed
- `ops.period_close_status` — close tracking

**What to build:**
1. A `DataHealthChecker` service: on each GL refresh, run a set of rule checks per asset:
   - NOI drop >15% QoQ without a linked note
   - DSCR below covenant floor (feeds into BUILD-01)
   - Any expense line item >2 standard deviations from 12-month trailing average
   - Total revenue = 0 (data feed failure signal)
   - Occupancy drop >10 percentage points QoQ
2. Generate `data_health_alert` records with severity: `warning` / `critical` / `info`
3. A "Data Health" panel on the asset detail page and on the period close checklist
4. Feed into Winston chat: "Before I generate your LP report, here are 3 data anomalies you should review."

**MCP tool to add:**
- `finance.check_data_health(asset_id?, fund_id?)` — returns list of anomaly alerts with severity and context

---

### BUILD-09: Deal Radar Workflow Upgrade — Stage Gates + Task Assignment
**Priority:** 7/10 | **Effort:** 1 week | **Classification:** Moderate
**Competitor signal:** Yardi Acquisition Manager — stage-gate deal workflow with task assignment and document management

**What exists:**
- `finance.pipeline_radar` — radar chart scoring
- `finance.deal_geo_score` — geographic scoring
- `/app/repe/deals/[dealId]` — deal detail page exists

**What to build:**
1. Configurable deal stages: `Screening → LOI → Due Diligence → Contract → Closing → Owned` — stored per deal, with timestamps per stage transition
2. Per-stage task checklists: on stage advance, auto-populate a checklist appropriate to the new stage (e.g., DD stage → "Review title report", "Confirm zoning", "Run environmental", "Finalize debt term sheet"); Winston auto-generates the checklist based on asset type using the AI chat
3. Team member assignment per task (name + due date)
4. Document threading: attach documents to the deal record (feeds into `documents.tag` with deal-scoped tags); per-stage document requirements surfaced as part of the checklist
5. Activity log: every stage transition, task completion, and document addition recorded

**MCP tools to add:**
- `deals.advance_stage(deal_id, new_stage)` — moves deal to next stage, generates task checklist
- `deals.list_tasks(deal_id)` — returns current task list with status
- `deals.complete_task(deal_id, task_id)` — marks task complete
- `deals.generate_dd_checklist(deal_id, asset_type)` — AI-generates the due diligence checklist for the asset type

**Winston AI prompt directive:**
When a user asks "generate the DD checklist for this deal" or "what do we need to do before closing?", Winston should call `deals.generate_dd_checklist` with the asset type, present the list, and offer to assign tasks to team members. On stage advance, Winston should proactively surface the new checklist.

---

### BUILD-10: Role-Based Dashboard Views (GP / Asset Manager / CFO)
**Priority:** 6/10 | **Effort:** 3–5 days | **Classification:** Easy (UI config, not data)
**Competitor signal:** Yardi configurable dashboards with role-based access

**What to build:**
1. A user role/persona setting: `{role: "gp" | "asset_manager" | "cfo" | "ir"}` stored in user profile
2. Default dashboard configurations per role:
   - **GP:** fund-level performance summary (IRR, TVPI, DPI), Deal Radar pipeline, distribution schedule, top-line LP summary
   - **Asset Manager:** individual asset P&L, DSCR/LTV table, UW vs. Actual variance, data health alerts, capex tracking
   - **CFO:** GL trial balance status, covenant alert dashboard, period close checklist, debt maturity schedule, fee accrual summary
   - **IR:** LP capital account summaries, capital call/distribution schedule, LP report queue, DDQ pipeline status (BUILD-03)
3. Users can customize from their default; customizations saved via `platform.save_analysis`

---

## Part 3 — What Is Deliberately Out of Scope (Near-Term)

These gaps were identified in competitor analysis but should **not** be prioritized for the next 30 days:

**LP Investor CRM** — Juniper Square's core product is a full LP relationship management system with two-way email/calendar sync, contact management, and investor activity tracking. This is a 6–12 week build and requires OAuth integrations (Google, Microsoft), a contact data model, and a relationship scoring engine. Defer until the fund administration workflow (BUILDs 02–04) is solid.

**Nasdaq eVestment Integration** — LP prospect database integration. Not a near-term product priority; this is a fundraising acceleration tool, not a portfolio management tool. Defer to fundraising season.

**AML/KYC Compliance Workflow** — Important for fund administration but requires regulatory framework expertise. Out of scope until the core LP reporting workflow is complete.

**PM System Live Data Bridge (Yardi Voyager / MRI connector)** — Yardi's biggest structural moat. Building a real connector to Voyager or MRI is a 4–8 week project requiring API access agreements. Near-term: build the structured document extraction pipeline (BUILD-07) as a manual-upload substitute; evaluate PM system connectors as a Q3 initiative.

**Automated ESG/Compliance Reporting (GRESB, TCFD)** — Cambio's core use case. Winston has a sustainability module; full compliance report automation is a product line in itself. Defer.

---

## Part 4 — Architectural Principles for Every Build

These rules apply to everything in the build queue. They come from the WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md and the repo's established patterns.

**1. Never claim a capability before the write path exists.**
If you add a new MCP tool, the tool must be registered in `backend/app/mcp/registry.py`, have a real handler, and have its permission (`read` or `write`) set correctly. Do not add a tool description that promises writes without a confirmed write path.

**2. Every new tool gets a ToolDef in the registry.**
New tools follow the exact pattern in `backend/app/mcp/registry.py`: `name`, `description`, `module`, `permission`, `input_model`, `output_model`, `audit_policy`. Tests go in `tests/`.

**3. Financial calculations stay in services, not in routes or tools.**
Routes call services. MCP tools call services. Services do the math. Do not put calculation logic in route handlers or tool handlers.

**4. LP-facing output (reports, notices, LP letters) goes through a review queue.**
Never auto-send to LPs. Always insert a human-approval step: generate → review → approve → send. The `platform.list_approvals` infrastructure supports this pattern.

**5. Document writes confirm before executing.**
Any MCP tool that writes data back to an asset record (especially BUILD-07) must present a diff/preview and request user confirmation before the write. Follows the existing AdvancedDrawer / confirmation flow pattern.

**6. New frontend pages follow the repo-b Next.js conventions.**
Components go in `repo-b/src/components/`. New REPE pages go under `repo-b/src/app/app/repe/`. API calls go through the proxy route layer in `repo-b/src/app/api/`. Do not add direct DB calls from the frontend.

**7. Every AI directive that mentions a tool call must name the tool.**
When adding Winston AI chat capabilities, the prompt additions must reference the specific MCP tool name (`finance.check_covenant_compliance`, not "check covenant status"). This keeps tool routing deterministic.

---

## Part 5 — Positioning Context to Keep While Building

These are the competitive positioning angles confirmed by 2 days of competitor analysis. Keep them in mind when writing UI copy, demo scripts, and feature names — every surface should reinforce these.

**Against Juniper Square:**
"Juniper Square connects your firm to their platform. Winston connects your data to your thinking."
- Their AI (JunieAI) knows what's in their database. Winston knows what's in your documents and your models.
- Their fund administration is a managed service — your data lives in their shared infrastructure.
- Winston's data residency: your infrastructure, your control.

**Against Yardi:**
"Yardi automates what Yardi already tracks. Winston reasons over what your firm actually knows."
- Yardi Virtuoso automates rules-based tasks (capital calls, distributions, consolidations) within Yardi's schema.
- When a CFO asks "what's our covenant exposure if rates move 50bps?" — Yardi can't answer that because the answer requires reasoning over actual debt agreements and deal models.
- Winston is purpose-built for AI reasoning, not AI automation bolted onto a 25-year-old property management schema.

**Against Altus/ARGUS:**
"ARGUS tells you what your model says. Winston tells you what your portfolio means — and then acts on it."
- ARGUS is the industry-standard DCF tool — valuation and benchmarking.
- Winston goes further: it takes the valuation output, compares it to underwriting, surfaces the attribution waterfall, and drafts the LP communication.
- The ARGUS user exports to a presentation. The Winston user asks a question and gets a memo.

**Against Cadastral/Cambio (new entrants):**
"Cadastral and Cambio are building AI analysts. Winston is the execution environment — your analyst, your fund administrator, and your deal team, in one place."
- Point-solution AI is useful. But analysis without execution is expensive research.
- Winston closes the loop: analyze → decide → act → report.

**The master position:**
> "Platform AI vs. Firm AI. Every platform (Yardi, Juniper Square, ARGUS) is adding AI on top of their database. Winston is AI that starts with your firm — your documents, your models, your workflow — and builds out. The difference is whether the AI knows about real estate or knows your portfolio."

---

## Part 6 — This Week's Build Sequence

Given the parallel tracks of demo preparation and product development, the recommended build order for the next 5 business days:

**Day 1–2 (Highest ROI / Fastest Demo Value):**
- BUILD-01: Covenant Breach Alert Engine — rules engine + alert panel + `finance.check_covenant_compliance` tool
- BUILD-03: DDQ Response Drafter — workflow wrapper over existing RAG; `/ddq` command in Winston chat

**Day 3 (Data Workflow):**
- BUILD-07: Structured Extraction from Operating Documents — extraction service + review modal + `documents.extract_operating_statement` tool

**Day 4–5 (LP Reporting Suite):**
- BUILD-02: Quarterly LP Report Auto-Assembly — `finance.assemble_lp_report` + report template + AI narrative draft
- BUILD-04: Capital Call + Distribution Notice Generator — notice generator service + review queue

**Week 2 (Analysis Depth):**
- BUILD-05: Portfolio Scenario Analysis UI — parameterized UI over existing stress/sensitivity tools
- BUILD-06: Variance Attribution Waterfall — attribution decomposition + waterfall chart component

**Week 2–3 (Pipeline Depth):**
- BUILD-09: Deal Radar Workflow Upgrade — stage gates + task assignment + document threading

**Ongoing (Settings / Low-Lift):**
- BUILD-08: Data Quality Anomaly Flagging — rule engine over existing GL aggregation
- BUILD-10: Role-Based Dashboard Views — user role setting + default view configs

---

## Appendix — Source Files

All findings that generated this meta prompt are in:
- `docs/competitor-research/raw/` — direct site scrape outputs
- `docs/competitor-research/feature-extractions/` — architectural feature decompositions
- `docs/competitor-research/product-opportunities/` — gap tables per competitor
- `docs/feature-radar/` — prioritized opportunity cards
- `docs/competitor-research/positioning-opportunities/` — positioning counter-moves
- `docs/demo-ideas/` — scripted 5-8 step demo flows
- `docs/sales-positioning/` — one-liner + elaboration + objection handler per competitor
- `docs/competitor-research/daily-summary/` — daily executive summaries

Next competitor scan: **Tuesday 2026-03-24 — Cherre + Dealpath** (Tuesday rotation)
