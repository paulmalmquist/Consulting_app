# Meta Prompt — Resolve All 12 New Feature Candidates

> This prompt is designed to be given to a coding agent with full repo context. It resolves NEW-1 through NEW-12 in a single pass by following the existing architectural patterns.

---

## Prompt

You are working in the Winston REPE monorepo. Your job is to implement 12 new features across the backend (FastAPI), frontend (Next.js 14), and database (PostgreSQL/Supabase) layers. Every feature must follow the patterns already established in the codebase. Read this entire prompt before writing any code.

### Architecture You Must Follow

**MCP Tool Registration Pattern** (backend/app/mcp/):
1. Define a Pydantic input model in `mcp/schemas/` with `extra = "ignore"` (never `"forbid"`).
2. Write a handler function `_tool_name(ctx: McpContext, inp: InputModel) -> dict` in `mcp/tools/`.
3. Register with `registry.register(ToolDef(name="dotted.name", description=..., module="repe", permission="read"|"write", input_model=..., handler=...))` inside a `register_*()` function.
4. Call that `register_*()` function from `mcp/server.py:_register_all_tools()`.
5. All returned dicts must pass through `_serialize()` to convert UUID/Decimal/date to JSON-safe types.

**Intent Classification Pattern** (backend/app/services/repe_intent.py):
- Add a new `INTENT_*` constant.
- Add compiled regex patterns to match natural-language triggers.
- Return a `RepeIntent(family=..., confidence=..., extracted_params=...)`.

**Fast-Path Pattern** (backend/app/services/ai_gateway.py):
- The `_repe_fast_path()` async generator handles deterministic queries without an LLM call.
- Route by `intent.family` → call `_exec_fast_tool(ctx, "dotted.tool.name", params_dict, tool_timeline, data_sources)` → build a card with `_build_*_card(result, scenario)` → emit `yield _sse("structured_result", {"result_type": "...", "card": card})`.
- Each card builder returns `{"title": str, "subtitle": str, "metrics": [...], "parameters": {...}, "actions": [...]}`.

**Structured Result Card Pattern** (repo-b/src/components/commandbar/StructuredResultCard.tsx):
- Cards are typed as `StructuredResultCard` in `lib/commandbar/store.ts`.
- Each metric has `{label, value, delta?: {value, direction: "positive"|"negative"}}`.
- Actions are `{label, action_type, payload}`.

**Database Migration Pattern** (repo-b/db/migrations/):
- Sequential numbered files: `NNN_description.sql`.
- Tables live in the `public` schema, prefixed with `re_` for REPE domain.
- Always add indexes for any foreign key or frequently queried column.

**Frontend Component Pattern** (repo-b/src/components/repe/):
- `"use client"` directive.
- Props receive `envId`, `businessId`, `fundId`, `quarter` from parent page.
- Data fetched via functions from `@/lib/bos-api.ts`.
- UI uses Tailwind with `bm-*` custom theme tokens (`bm-surface`, `bm-border`, `bm-muted`, `bm-accent`).

**Finance Engine Pattern** (backend/app/finance/):
- Pure deterministic functions, no DB access inside the engine.
- Inputs are dataclasses or typed dicts. Outputs are dicts with `Decimal` values.
- DB loading happens in a service layer (`backend/app/services/`) that calls the engine.

---

### Prerequisites — These Must Already Work

Before implementing any feature below, confirm the following are true. If any are false, fix them first:

1. `repe_finance_tools.py` has 6 registered tools: `finance.run_sale_scenario`, `finance.run_waterfall`, `finance.fund_metrics`, `finance.stress_cap_rate`, `finance.compare_scenarios`, `finance.lp_summary`.
2. `repe_intent.py` classifies at least: `INTENT_RUN_SALE_SCENARIO`, `INTENT_RUN_WATERFALL`, `INTENT_COMPARE_SCENARIOS`, `INTENT_STRESS_CAP_RATE`, `INTENT_FUND_METRICS`, `INTENT_LP_SUMMARY`.
3. The fast-path in `ai_gateway.py` has branches for all 6 intent families above.
4. `WaterfallScenarioPanel.tsx` renders scenario selector, override inputs, comparison table, tier allocations, and run history.
5. `StructuredResultCard.tsx` renders metric rows with delta badges.
6. `waterfall_engine.py` exports `run_us_waterfall()` with `ParticipantState`, `WaterfallContract`, `WaterfallInput`, `AllocationLine`.
7. `capital_account_engine.py` exports `compute_rollforward(events, as_of_date)`.
8. `clawback_engine.py` exports `compute_clawback(gp_profit_paid, gp_target_profit, settled)` and `compute_promote_position(promote_earned, promote_paid)`.
9. `construction_forecast_engine.py` exports `compute_forecast(revised_budget, committed_cost, actual_cost)`.
10. `MonteCarloTab.tsx` has `runSimulation(sims, seed) -> SimResult { irr: number[], tvpi: number[] }`.

---

### Feature 1: Monte Carlo → Waterfall Bridge

**What:** The Monte Carlo simulation produces P10/P50/P90 IRR and TVPI distributions client-side. Feed the P10, P50, and P90 exit valuations into the waterfall engine as three scenarios so users see tier-level LP impact of probabilistic outcomes.

**Implementation:**

Backend:
- `mcp/schemas/repe_finance_tools.py` — Add `MonteCarloWaterfallInput(fund_id, quarter, p10_nav, p50_nav, p90_nav, env_id, business_id)`.
- `mcp/tools/repe_finance_tools.py` — Add `_monte_carlo_waterfall` handler. For each percentile (P10, P50, P90): override the fund's quarter NAV with the percentile value, then call `run_waterfall()` from `re_waterfall_runtime`. Return `{p10: WaterfallResult, p50: WaterfallResult, p90: WaterfallResult, deltas: {p10_vs_p50: ..., p90_vs_p50: ...}}`.
- Register as `finance.monte_carlo_waterfall`, permission `read`.
- `repe_intent.py` — Add `INTENT_MONTE_CARLO_WATERFALL` with patterns: `"monte carlo waterfall"`, `"probability.*waterfall"`, `"simulation.*distribution"`, `"p10.*p90.*waterfall"`.
- `ai_gateway.py` — Add fast-path branch for this intent. Card builder `_build_mc_waterfall_card` shows three-column P10/P50/P90 metrics with deltas.

Frontend:
- `MonteCarloTab.tsx` — After simulation runs, add a "Run Waterfall at Percentiles" button. POST the P10/P50/P90 NAV values to a new Next.js API route `/api/re/v2/funds/[fundId]/monte-carlo-waterfall` which proxies to the backend tool.
- New component `MonteCarloWaterfallResults.tsx` renders the three-scenario comparison in a table matching `WaterfallScenarioPanel` styling.

---

### Feature 2: Portfolio-Level Waterfall Aggregation

**What:** Aggregate waterfall results across multiple funds at the `/repe/portfolio` level. Show total carry exposure, cross-fund LP return gaps, and diversification metrics.

**Implementation:**

Backend:
- `mcp/schemas/repe_finance_tools.py` — Add `PortfolioWaterfallInput(fund_ids: list[str], quarter, env_id, business_id)`.
- `mcp/tools/repe_finance_tools.py` — Add `_portfolio_waterfall` handler. Loop over each fund_id, call `run_waterfall()`, aggregate: total NAV, weighted-average IRR, total carry, total LP preferred shortfall, per-fund contribution to portfolio return. Return `{funds: [...per-fund summary], portfolio: {total_nav, weighted_irr, total_carry, total_lp_shortfall}, diversification_score}`.
- Register as `finance.portfolio_waterfall`, permission `read`.
- `repe_intent.py` — Add `INTENT_PORTFOLIO_WATERFALL` with patterns: `"portfolio waterfall"`, `"cross.*fund.*waterfall"`, `"aggregate.*carry"`, `"total.*carry.*exposure"`.
- `ai_gateway.py` — Add fast-path branch. Card `_build_portfolio_waterfall_card` with per-fund rows and portfolio totals.

Frontend:
- `repo-b/src/app/app/repe/portfolio/page.tsx` — Add a "Portfolio Waterfall" tab or section. Fetch via new Next.js route `/api/re/v2/portfolio/waterfall` → backend tool.
- New component `PortfolioWaterfallSummary.tsx` renders aggregated view with per-fund drilldown.

---

### Feature 3: Geo Intelligence → Deal Scoring Integration

**What:** Wire the existing `re_geography.py` market data (cap rates, population growth, vacancy rates) into the pipeline deal radar so deal prioritization reflects geographic risk.

**Implementation:**

Backend:
- `backend/app/services/re_pipeline.py` — Add `enrich_deal_with_geo(deal_id, market_id)` that fetches geo metrics from `re_geo_market` and `re_geo_market_materialization`. Return `{market_cap_rate, population_growth_pct, vacancy_rate, employment_growth_pct, geo_risk_score}`.
- `backend/app/services/re_geography.py` — Add `compute_geo_risk_score(market_id)` that computes a 0-100 score from materialized market data (cap rate spread vs national average, population trend, employment trend). Pure function over DB data.
- `mcp/schemas/repe_finance_tools.py` — Add `DealGeoScoreInput(deal_id, market_id, env_id, business_id)`.
- `mcp/tools/repe_finance_tools.py` — Add `_deal_geo_score` handler. Register as `finance.deal_geo_score`, permission `read`.

Frontend:
- `DealGeoIntelligencePanel.tsx` — Add a "Geo Risk Score" badge to the panel header, computed from the new endpoint.
- `DealRadarCanvas.tsx` — When plotting deals on the radar, use `geo_risk_score` as one of the scoring axes (risk axis). Fetch scores via batch endpoint or alongside deal list.

Database:
- Migration `020_geo_risk_score.sql` — Add `geo_risk_score NUMERIC(5,2)` column to `re_geo_market_materialization` as a cached computed column. Add index.

---

### Feature 4: Pipeline Radar Backend Engine

**What:** Build the scoring engine behind the existing radar UI components (`DealRadarCanvas`, `DealRadarWorkspace`, `RadarSummaryPanel`).

**Implementation:**

Backend:
- New file `backend/app/services/re_deal_scoring.py`:
  - `compute_deal_score(deal: dict, market: dict, sponsor: dict) -> dict` — Returns `{opportunity_score: float, risk_score: float, composite_score: float, factors: [...]}`.
  - Opportunity score: weighted sum of (IRR upside, cap rate compression potential, NOI growth runway, sponsor track record).
  - Risk score: weighted sum of (market vacancy, leverage ratio, construction risk, geo_risk_score from Feature 3, deal stage earliness).
  - `batch_score_deals(deals: list[dict], env_id, business_id) -> list[dict]` — Scores all pipeline deals with geo enrichment.
- `mcp/schemas/repe_finance_tools.py` — Add `PipelineRadarInput(env_id, business_id, stage_filter: list[str] | None)`.
- `mcp/tools/repe_finance_tools.py` — Add `_pipeline_radar` handler calling `batch_score_deals`. Register as `finance.pipeline_radar`, permission `read`.
- `repe_intent.py` — Add `INTENT_PIPELINE_RADAR` with patterns: `"deal radar"`, `"pipeline.*score"`, `"rank.*deals"`, `"best.*opportunities"`.
- `ai_gateway.py` — Add fast-path branch. Card shows top 5 deals by composite score with opportunity/risk breakdown.

Frontend:
- `DealRadarCanvas.tsx` — Replace mock/hardcoded axis data with actual scores from `/api/re/v2/pipeline/radar` → backend tool.
- `RadarSummaryPanel.tsx` — Render factor breakdown from the scoring response.

---

### Feature 5: Waterfall Stress Template Library

**What:** Pre-built scenario presets the AI can reference by name (e.g., "COVID stress", "rate shock 200bps", "delayed exit 18mo").

**Implementation:**

Backend:
- New file `backend/app/services/re_scenario_templates.py`:
  - `TEMPLATES` dict mapping template names to override params:
    ```python
    TEMPLATES = {
        "covid_stress": {"cap_rate_delta_bps": 150, "noi_stress_pct": -0.15, "exit_date_shift_months": 12},
        "rate_shock_200": {"cap_rate_delta_bps": 200, "noi_stress_pct": -0.05, "exit_date_shift_months": 0},
        "delayed_exit_18mo": {"cap_rate_delta_bps": 0, "noi_stress_pct": 0, "exit_date_shift_months": 18},
        "mild_downside": {"cap_rate_delta_bps": 50, "noi_stress_pct": -0.03, "exit_date_shift_months": 6},
        "deep_recession": {"cap_rate_delta_bps": 250, "noi_stress_pct": -0.25, "exit_date_shift_months": 24},
    }
    ```
  - `resolve_template(name: str) -> dict | None` — Fuzzy matches template name.
  - `list_templates() -> list[dict]` — Returns all templates with descriptions.
- `repe_intent.py` — When classifying stress/waterfall intents, check if the message contains a known template name. If so, set `extracted_params` from the template.
- `mcp/schemas/repe_finance_tools.py` — Add `ListScenarioTemplatesInput(env_id, business_id)`.
- `mcp/tools/repe_finance_tools.py` — Add `_list_scenario_templates`. Register as `finance.list_scenario_templates`, permission `read`.

Frontend:
- `WaterfallScenarioPanel.tsx` — Add a "Templates" dropdown above the override inputs. Selecting a template auto-fills cap_rate_delta_bps, noi_stress_pct, exit_date_shift_months.

Database:
- Migration `021_scenario_templates.sql` — `re_scenario_template(template_id UUID PK, name TEXT UNIQUE, description TEXT, cap_rate_delta_bps INT, noi_stress_pct NUMERIC, exit_date_shift_months INT, is_system BOOLEAN DEFAULT true, env_id UUID REFERENCES app.environments)`. Seed with the 5 system templates. Index on `(env_id, name)`.

---

### Feature 6: AI-Generated Waterfall Memos

**What:** After a waterfall scenario comparison, the AI generates a structured IC memo section covering assumptions, metric deltas, LP impact, GP economics, and risk factors.

**Implementation:**

Backend:
- `mcp/schemas/repe_finance_tools.py` — Add `GenerateWaterfallMemoInput(fund_id, run_id_base, run_id_scenario, quarter, memo_format: str = "markdown", env_id, business_id)`.
- `mcp/tools/repe_finance_tools.py` — Add `_generate_waterfall_memo` handler. This tool is NOT a fast-path tool — it requires an LLM call. The handler:
  1. Fetches both waterfall run results from DB.
  2. Computes deltas using existing `_compare_scenarios` logic.
  3. Builds a structured prompt: "Given these waterfall results for {fund_name}, write an IC memo section covering: (1) Scenario Assumptions, (2) Key Metrics Impact, (3) LP Distribution Impact by Tier, (4) GP Carry Economics, (5) Risk Factors and Mitigants."
  4. Calls `chat_completion()` with the structured prompt.
  5. Returns `{memo_markdown: str, sections: [...], metadata: {fund_name, quarter, scenarios_compared}}`.
- Register as `finance.generate_waterfall_memo`, permission `read`.
- This tool must be in the LLM tool-calling roster (Lane C/D), NOT the fast-path. Add it to the tool list in `ai_gateway.py`.

Frontend:
- `WaterfallScenarioPanel.tsx` — Add "Generate IC Memo" button after a comparison is shown. Triggers AI gateway with intent to call the memo tool.
- `StructuredResultCard.tsx` — Add a `waterfall_memo` card variant that renders markdown sections with a "Copy to Clipboard" and "Export .docx" action.

---

### Feature 7: Capital Account + Clawback → Waterfall Integration

**What:** Connect the existing `capital_account_engine.py` and `clawback_engine.py` to the waterfall runtime and expose as MCP tools. Enable queries like "if we call another $10M, what happens to the waterfall?" and "is there clawback risk in the downside?".

**Implementation:**

Backend:
- `backend/app/services/re_capital_account.py` (new service file):
  - `load_capital_events(fund_id, quarter)` — Fetches capital call/distribution events from DB.
  - `rollforward_with_injection(fund_id, quarter, additional_call_amount)` — Calls `compute_rollforward` with existing events plus a synthetic capital call event, then re-runs the waterfall with the updated participant state.
- `mcp/schemas/repe_finance_tools.py` — Add:
  - `CapitalCallImpactInput(fund_id, additional_call_amount: float, quarter, env_id, business_id)`.
  - `ClawbackRiskInput(fund_id, scenario_id: str | None, quarter, env_id, business_id)`.
- `mcp/tools/repe_finance_tools.py` — Add:
  - `_capital_call_impact` — Runs rollforward with injection, then runs waterfall, returns before/after metrics. Register as `finance.capital_call_impact`, permission `read`.
  - `_clawback_risk` — Loads waterfall run result, computes `compute_clawback(gp_profit_paid, gp_target_profit)` and `compute_promote_position(promote_earned, promote_paid)`. Returns `{clawback_liability, clawback_outstanding, promote_outstanding, risk_level: "none"|"low"|"medium"|"high"}`. Register as `finance.clawback_risk`, permission `read`.
- `repe_intent.py` — Add `INTENT_CAPITAL_CALL_IMPACT` (patterns: `"capital call"`, `"call.*additional"`, `"what if we call"`) and `INTENT_CLAWBACK_RISK` (patterns: `"clawback"`, `"promote.*risk"`, `"gp.*liability"`).
- `ai_gateway.py` — Add fast-path branches for both intents.

Frontend:
- `WaterfallScenarioPanel.tsx` — Add a "What-If Capital Call" input field and button below the override section. Displays impact as a mini card inline.
- New `ClawbackRiskBadge.tsx` — Shows clawback risk level badge (green/yellow/orange/red) on the fund detail header when waterfall data is available.

---

### Feature 8: Real-Time Waterfall Notifications

**What:** Push waterfall run completion to the frontend via Supabase Realtime so the WaterfallScenarioPanel auto-updates.

**Implementation:**

Backend:
- `backend/app/services/re_waterfall_runtime.py` `run_waterfall()` — After writing the run result to `re_waterfall_run`, insert a row into a new `re_waterfall_event` table with `event_type='run_completed'`, `fund_id`, `run_id`, `created_at`. Supabase Realtime will broadcast this automatically if the table has Realtime enabled.

Frontend:
- `repo-b/src/lib/supabase-client.ts` (or equivalent) — Create a Supabase client instance with the anon key for Realtime subscriptions. If one already exists, reuse it.
- `WaterfallScenarioPanel.tsx` — On mount, subscribe to `re_waterfall_event` channel filtered by `fund_id`. On `INSERT` event, call `loadRuns()` to refresh the run history list. Unsubscribe on unmount.
- `WaterfallRuns.tsx` — Add a subtle "New run available" toast or highlight when a Realtime event arrives and the user hasn't refreshed.

Database:
- Migration `022_waterfall_realtime.sql`:
  - Create `re_waterfall_event(event_id UUID PK DEFAULT gen_random_uuid(), event_type TEXT NOT NULL, fund_id UUID NOT NULL REFERENCES re_fund, run_id UUID REFERENCES re_waterfall_run, payload JSONB, created_at TIMESTAMPTZ DEFAULT now())`.
  - Index on `(fund_id, created_at DESC)`.
  - Enable Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE re_waterfall_event;`.

---

### Feature 9: UW vs Actual Waterfall Comparison

**What:** Run the waterfall engine against underwriting assumptions vs. actual performance and show where LP returns diverged from the original thesis.

**Implementation:**

Backend:
- `mcp/schemas/repe_finance_tools.py` — Add `UwVsActualWaterfallInput(fund_id, quarter, model_id: str | None, env_id, business_id)`.
- `mcp/tools/repe_finance_tools.py` — Add `_uw_vs_actual_waterfall` handler:
  1. Load the base model scenario (is_base=true) from `re_model_scenarios` for the fund's model.
  2. Run waterfall with underwriting NAV/assumptions (from model scenario).
  3. Run waterfall with actual quarter state (from `re_fund_quarter_state`).
  4. Compute attribution: `{nav_attribution: {uw_nav, actual_nav, delta}, irr_attribution: {...}, tier_attribution: [...per-tier deltas], largest_driver: str}`.
  5. Return comparison with narrative_hint: e.g. "Actual IRR trails UW by 280bps, primarily driven by NOI underperformance at the asset level."
- Register as `finance.uw_vs_actual_waterfall`, permission `read`.
- `repe_intent.py` — Add `INTENT_UW_VS_ACTUAL` with patterns: `"uw.*vs.*actual"`, `"underwriting.*actual"`, `"thesis.*variance"`, `"how.*we.*tracking"`, `"vs.*underwriting"`.
- `ai_gateway.py` — Add fast-path branch. Card `_build_uw_vs_actual_card` with two columns (UW | Actual) and attribution drivers.

Frontend:
- Integrate into existing `UwVsActualTable.tsx` — add a "Waterfall View" toggle that switches from the current metric table to the waterfall tier comparison.
- `AttributionBridgeChart.tsx` — Feed the `tier_attribution` data to show a bridge chart from UW waterfall to actual waterfall.

---

### Feature 10: Sensitivity Table Export

**What:** Run a 2D grid of waterfall scenarios (cap rate on X, NOI stress on Y) and export as an Excel sensitivity matrix.

**Implementation:**

Backend:
- `mcp/schemas/repe_finance_tools.py` — Add `SensitivityMatrixInput(fund_id, quarter, cap_rate_range_bps: list[int], noi_stress_range_pct: list[float], metric: str = "net_irr", env_id, business_id)`.
  - Example: `cap_rate_range_bps=[0, 50, 100, 150, 200]`, `noi_stress_range_pct=[0, -0.05, -0.10, -0.15, -0.20]`.
- `mcp/tools/repe_finance_tools.py` — Add `_sensitivity_matrix` handler. Nested loop: for each (cap_rate, noi_stress) pair, run the waterfall scenario endpoint, extract the requested metric. Return `{rows: list[list[float]], col_headers: list[str], row_headers: list[str], metric_name: str, base_value: float}`. Register as `finance.sensitivity_matrix`, permission `read`.
- `repe_intent.py` — Add `INTENT_SENSITIVITY` with patterns: `"sensitivity"`, `"data table"`, `"matrix"`, `"grid.*scenarios"`.
- `ai_gateway.py` — Add fast-path branch. Card `_build_sensitivity_card` renders a heatmap-style grid.

Frontend:
- New component `SensitivityMatrix.tsx` — Renders the grid with color-coded cells (green for above base, red for below). Highlight the base-case cell.
- `ExcelExportButton.tsx` — Extend or add a variant that accepts a sensitivity matrix and exports it as a formatted `.xlsx` with conditional formatting via the existing `/api/re/v2/reports/export` route.
- Wire into `WaterfallScenarioPanel.tsx` as a "Sensitivity Table" tab or button.

---

### Feature 11: Construction Forecast → Waterfall

**What:** For development-stage funds, incorporate construction draw schedules and projected stabilization dates into waterfall timing assumptions.

**Implementation:**

Backend:
- `backend/app/services/re_construction.py` (new service file):
  - `load_construction_schedule(fund_id, asset_id)` — Fetches draw schedule from DB.
  - `project_stabilization(budget, committed, actual, monthly_draw_rate) -> dict` — Calls `compute_forecast()` from `construction_forecast_engine.py`, adds projected stabilization date based on remaining draws.
  - `adjust_waterfall_timing(fund_id, quarter, construction_projections) -> dict` — Shifts waterfall exit assumptions based on stabilization dates. Returns adjusted exit dates and NOI ramp schedule.
- `mcp/schemas/repe_finance_tools.py` — Add `ConstructionWaterfallInput(fund_id, asset_id: str | None, quarter, env_id, business_id)`.
- `mcp/tools/repe_finance_tools.py` — Add `_construction_waterfall` handler:
  1. Load construction schedule.
  2. Project stabilization.
  3. Adjust waterfall timing.
  4. Run waterfall with adjusted assumptions.
  5. Compare to base (un-adjusted) waterfall.
  6. Return `{base: WaterfallResult, construction_adjusted: WaterfallResult, stabilization_date, months_to_stabilization, exit_shift_applied}`.
- Register as `finance.construction_waterfall`, permission `read`.
- `repe_intent.py` — Add `INTENT_CONSTRUCTION_IMPACT` with patterns: `"construction"`, `"development.*waterfall"`, `"stabilization"`, `"draw.*schedule.*impact"`.

Frontend:
- New component `ConstructionImpactPanel.tsx` — Shows construction progress, projected stabilization date, and waterfall delta if exit timing shifts.
- Wire into asset cockpit at `repo-b/src/components/repe/asset-cockpit/` as a new section visible only when the asset has construction data.

Database:
- Migration `023_construction_schedule.sql`:
  - `re_construction_draw(draw_id UUID PK, fund_id UUID, asset_id UUID, draw_date DATE, amount NUMERIC, draw_type TEXT CHECK(draw_type IN ('hard_cost','soft_cost','contingency')), status TEXT DEFAULT 'projected')`.
  - Index on `(fund_id, asset_id, draw_date)`.

---

### Feature 12: AI Conversation Memory for Waterfall Context

**What:** Track all waterfall runs within a conversation session so the AI can answer "which scenario had the best LP return?" without re-running.

**Implementation:**

Backend:
- `backend/app/services/repe_session.py` — Add `waterfall_runs: list[dict]` field to the session state. Each entry: `{run_id, fund_id, fund_name, scenario_name, quarter, key_metrics: {nav, irr, tvpi, carry}, overrides: {...}, created_at}`.
- `backend/app/services/ai_gateway.py`:
  - After any waterfall tool returns a result in the fast-path, append the run summary to `repe_session.waterfall_runs`.
  - After any waterfall tool returns in the LLM tool-calling loop, do the same.
  - When building the system prompt context block, include `waterfall_runs` from the session as a `"## Prior Waterfall Runs This Session"` section so the LLM can reference them without re-executing.
- `repe_intent.py` — Add `INTENT_SESSION_WATERFALL_QUERY` with patterns: `"which.*best"`, `"compare all.*runs"`, `"best.*scenario"`, `"worst.*scenario"`, `"summary of.*runs"`. When this intent fires and `waterfall_runs` is non-empty, route to Lane A (answer from session context, no tool call).

Frontend:
- `repo-b/src/lib/commandbar/store.ts` — Add `waterfallRuns: WaterfallRunSummary[]` to the conversation state. Populated from `structured_result` SSE events of type `waterfall_*`.
- `StructuredResultCard.tsx` — When a `session_waterfall_summary` card is received (listing all runs in the session), render as a sortable mini-table with run name, IRR, NAV, carry columns.

---

### Execution Order

These features have dependencies. Implement in this order:

```
Phase A (no dependencies, parallelize):
  Feature 5  (Templates — standalone, no engine changes)
  Feature 8  (Realtime — standalone, DB + frontend only)
  Feature 12 (Session memory — backend session + prompt only)

Phase B (depends on existing waterfall tools):
  Feature 1  (Monte Carlo bridge — needs working run_waterfall)
  Feature 2  (Portfolio aggregation — needs working run_waterfall)
  Feature 7  (Capital + Clawback — needs working run_waterfall + existing engines)
  Feature 9  (UW vs Actual — needs working run_waterfall + model scenarios)

Phase C (depends on Phase B or geo service):
  Feature 3  (Geo scoring — needs geo service, feeds Feature 4)
  Feature 4  (Radar engine — needs geo scoring from Feature 3)
  Feature 10 (Sensitivity matrix — needs working scenario override waterfall)
  Feature 11 (Construction — needs construction DB table + forecast engine)

Phase D (depends on comparison tools):
  Feature 6  (AI memos — needs compare_scenarios output + LLM call)
```

### Testing Requirements

For every new MCP tool:
1. Write a unit test in `backend/tests/` with mocked DB/engine responses.
2. Test the intent classifier pattern matching with at least 5 positive and 3 negative examples.
3. If a frontend component is created, add a basic render test in `__tests__/`.
4. If a new API route proxy is created in Next.js, add it to the E2E spec coverage in `tests/repe/`.

### What NOT to Do

- Do not modify `waterfall_engine.py` internals. It is deterministic and tested. Wrap it, don't change it.
- Do not use `extra = "forbid"` on any new Pydantic model. Always `"ignore"`.
- Do not add tools to the fast-path that require LLM calls (Feature 6 is the only LLM-dependent tool — it goes through the tool-calling loop, not the fast-path).
- Do not create new database tables without a numbered migration file.
- Do not hardcode env_id or business_id in any tool handler. Always take them from input or McpContext.
- Do not break the existing `_MUTATION_RULES_BLOCK` two-phase write flow. New write tools must follow the same `confirmed=false → confirmed=true` pattern.
