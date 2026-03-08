# Waterfall × AI — Coding Agent Task List

> Goal: Enable users to run waterfall scenarios through the AI assistant conversationally.

---

## Phase 0 — Schema Contract Fixes (do first, gates all AI tool work)

- [ ] **SC-1** `backend/app/mcp/schemas/repe_tools.py` — Update `CreateFundInput.fund_type` field description from `"open-end, closed-end, co-invest"` to `"open_end, closed_end, sma, co_invest"` to match the DB CHECK constraint.

- [ ] **SC-2** Resolve `CreateFundInput.strategy` mismatch. The tool currently describes `"core, core-plus, value-add, opportunistic"` but the DB only accepts `"equity, debt"`. Decision: either expand the DB CHECK constraint via a new migration to include the full taxonomy, or update the tool description to match the current DB values. Pick one and implement end-to-end.

- [ ] **SC-3** `backend/app/mcp/schemas/repe_tools.py` — Update `CreateDealInput.deal_type` description. Remove `"preferred, mezzanine"` if the DB CHECK only accepts `"equity, debt"`, or add those values to the DB CHECK constraint via migration.

- [ ] **SC-4** `backend/app/mcp/schemas/repe_tools.py` — Update `CreateDealInput.stage` description to use the canonical DB stage names: `"sourcing, underwriting, ic, closing, operating, exited"`. Remove `"screening, due-diligence"`.

---

## Phase 1 — Waterfall MCP Tools

- [ ] **TOOL-1** `backend/app/mcp/schemas/repe_tools.py` — Add `RunWaterfallScenarioInput` Pydantic model with fields: `fund_id` (UUID str), `quarter` (str, format `2026Q1`), `scenario_id` (optional UUID str), `cap_rate_delta_bps` (optional int, default 0), `noi_stress_pct` (optional float, default 0), `exit_date_shift_months` (optional int, default 0), `waterfall_style` (optional str, `"american"` or `"european"`). Use `extra = "ignore"` (not `"forbid"`) to prevent ValidationErrors on unexpected LLM keys.

- [ ] **TOOL-2** `backend/app/mcp/tools/repe_tools.py` — Implement `run_waterfall_scenario` handler. If all override params are zero/absent, call the shadow run endpoint and record as a `base` run. Otherwise call the v2 `waterfall-scenarios/run` endpoint with overrides. Write run result to a `waterfall_run_history` record keyed on `(fund_id, quarter, scenario_id)` for idempotency — if a matching record already exists and is less than 60 seconds old, return it without re-running. Register with `AuditPolicy.LOG_ALL`.

- [ ] **TOOL-3** `backend/app/mcp/schemas/repe_tools.py` — Add `GetWaterfallRunInput` with `run_id` (optional UUID str) and `fund_id` + `quarter` (optional, used to fetch latest run if `run_id` not given).

- [ ] **TOOL-4** `backend/app/mcp/tools/repe_tools.py` — Implement `get_waterfall_run` handler that retrieves a prior run from `waterfall_run_history` by `run_id` or by `(fund_id, quarter)` latest. Register with `AuditPolicy.READ_ONLY`.

- [ ] **TOOL-5** `backend/app/mcp/schemas/repe_tools.py` — Add `CompareWaterfallScenariosInput` with `fund_id`, `run_id_a`, `run_id_b` (or `scenario_id_a`, `scenario_id_b` — resolve to run IDs via latest run per scenario).

- [ ] **TOOL-6** `backend/app/mcp/tools/repe_tools.py` — Implement `compare_waterfall_scenarios` handler. Fetch both runs, compute delta for each metric (NAV, Gross IRR, Net IRR, Gross TVPI, Net TVPI, DPI, RVPI, carry), compute per-tier LP impact deltas, and generate a `narrative_hint` string (e.g. `"LP preferred return shortfall of $4.2M in the downside case"`). Register with `AuditPolicy.READ_ONLY`.

- [ ] **TOOL-7** `backend/app/mcp/schemas/repe_tools.py` — Add `ListWaterfallRunsInput` with `fund_id` and optional `quarter`.

- [ ] **TOOL-8** `backend/app/mcp/tools/repe_tools.py` — Implement `list_waterfall_runs` handler returning run history: `run_id`, `scenario_name`, `status`, `created_at`, and key metrics. Register with `AuditPolicy.READ_ONLY`.

- [ ] **TOOL-9** Write unit tests for all four new tools with mocked waterfall engine responses. Cover: zero-override base run, stress run with overrides, idempotency (same run called twice within 60s), comparison delta math, narrative_hint content.

---

## Phase 2 — Context Envelope

- [ ] **ENV-1** `repo-b/src/lib/commandbar/contextEnvelope.ts` — When the active route is a fund detail page or `/waterfalls` page, include in the context envelope:
  - `fund_id`, `fund_name`, `fund_strategy`, `waterfall_style` from current fund terms
  - `current_quarter` (already computed by `pickCurrentQuarter()` — reuse it)
  - `last_waterfall_run` (compact object: `run_id`, `quarter`, `base_nav`, `base_irr`, `scenario_name` if applicable)
  - `available_scenarios` (array of `{ scenario_id, name, scenario_type, is_base }`)

- [ ] **ENV-2** `backend/app/services/assistant_scope.py` — Add `waterfall_run` as a recognized `entity_type` so `entity_id` from the context envelope can resolve a waterfall run by `run_id` in scope resolution.

---

## Phase 3 — WaterfallScenarioPanel Component

- [ ] **UI-1** `repo-b/src/app/app/repe/funds/[fundId]/page.tsx` — Rename the root element's `data-testid` from `"re-fund-homepage"` to `"re-fund-detail"` to fix the E2E spec mismatch.

- [ ] **UI-2** `repo-b/src/app/app/repe/funds/[fundId]/page.tsx` — Add `"Waterfall"` as a distinct entry in the `MODULES` array (alongside or replacing the plain Scenarios tab). It should render `<WaterfallScenarioPanel />`.

- [ ] **UI-3** Create `repo-b/src/components/repe/WaterfallScenarioPanel.tsx` with the following sections:
  - Scenario selector dropdown (list from `listReV1WaterfallScenarios` or equivalent)
  - Override inputs: Cap Rate Delta (bps), NOI Stress (%), Exit Date Shift (months)
  - "Run Waterfall" button — calls `runReWaterfallShadow` or the v2 scenario endpoint
  - Results section: base vs. scenario comparison table (metric, base value, scenario value, delta, delta %)
  - Tier allocations table (tier name, LP partner, base amount, scenario amount, delta)
  - "Explain this run" button — sends `run_id` + prompt `"Explain this waterfall run for [fund_name] in [quarter]"` to the AI gateway
  - Run history list (last N runs with status badges)
  - Add `data-testid="re-waterfall-scenario-panel"` to the root element

- [ ] **UI-4** `repo-b/src/app/app/repe/waterfalls/page.tsx` — Replace the raw `<pre>{JSON.stringify(result)}</pre>` with `<WaterfallScenarioPanel />` (or embed the panel's result view). Remove the standalone fund selector and quarter input from this page — they should live inside the panel.

- [ ] **UI-5** Update `repo-b/tests/repe/re-waterfall-scenario.spec.ts`:
  - Update mock for `/waterfall-scenarios/runs` GET to return a non-empty array in at least one test scenario
  - Replace any `page.goto` routes that relied on old data-testid selectors
  - Add a test case for the "Explain this run" button triggering a mock AI gateway call

---

## Phase 4 — AI Explanation Integration

- [ ] **AI-1** `backend/app/services/ai_gateway.py` — Add waterfall interpretation guidance to the REPE section of the system prompt block. The AI should: lead with net IRR impact to LPs in plain English; identify which distribution tier was most affected; state whether the fund is still in a carried interest position under the scenario; express NAV changes in both dollars and percentage; when comparing scenarios, flag whether the GP catch-up tier changes materially.

- [ ] **AI-2** `backend/app/services/ai_gateway.py` — Add the four new waterfall tools (`run_waterfall_scenario`, `get_waterfall_run`, `compare_waterfall_scenarios`, `list_waterfall_runs`) to the Lane C/D tool roster so they are available for analytical and write-intent requests. Also allow `get_waterfall_run` and `list_waterfall_runs` in Lane B (retrieval).

- [ ] **AI-3** `backend/app/services/request_router.py` — Add waterfall-specific intent patterns (e.g. `"run waterfall"`, `"stress scenario"`, `"cap rate"`, `"IRR impact"`, `"compare scenarios"`) to the Lane C classifier. Queries like `"what did the waterfall show?"` when `last_waterfall_run` is present in the envelope should route to Lane A or B (no tool call needed — answer from context).

- [ ] **AI-4** Manual QA: seed a fund with LP commitments and fund terms, run a base waterfall and a downside stress scenario (cap rate +75bps, NOI -5%), then verify the AI can correctly answer:
  - "Run a downside scenario for this fund"
  - "Compare the base and downside runs"
  - "What's the LP impact of the downside?"
  - "Is the GP still in carry under the stress case?"

---

## Phase 5 — Conversational Scenario Creation

- [ ] **CONV-1** `backend/app/services/ai_gateway.py` system prompt `_MUTATION_RULES_BLOCK` — Add waterfall scenario creation rules: allowed fields, required `fund_id` resolution from scope, confirm before running if override params are extreme (e.g. cap rate delta > 200bps or NOI stress > 20%).

- [ ] **CONV-2** Validate the multi-turn flow end-to-end:
  1. User: "Run a downside cap rate stress of 75bps on Fund VII for 2026Q1"
  2. AI resolves `fund_id` from scope, calls `run_waterfall_scenario` with `cap_rate_delta_bps=75`
  3. AI receives `WaterfallRunResult`, synthesizes natural-language explanation
  4. `WaterfallScenarioPanel` in the UI updates to show the new run in history
  5. User: "Now compare that to the base" → AI calls `compare_waterfall_scenarios`

---

## Hardening (do alongside or after Phase 4)

- [ ] **HARD-1** `backend/app/routes/ai_gateway.py` lines ~749 and ~802 — Add `done` event emission to the model-error path and the max-rounds-exceeded path so the frontend `reader.read()` loop terminates cleanly instead of hanging.

- [ ] **HARD-2** `backend/app/routes/ai_gateway.py` — Wrap the `run_in_executor` call for waterfall tool handlers in `asyncio.wait_for` with a 30-second timeout. Emit a structured error event (not a silent hang) if the waterfall engine times out.

- [ ] **HARD-3** `backend/app/services/repe_tools.py` — Add idempotency guard to `create_fund`, `create_deal`, and `create_asset` write tools. Use a natural key check (e.g. `(env_id, name)` for fund) and return the existing record if it was created within the last 5 minutes, rather than creating a duplicate.
