# Winston REPE — Coding Agent Task List

> Updated March 8, 2026. Reflects current codebase state after recent finance tools, intent classifier, and fast-path work.

---

## Phase 0 — Schema Contract Fixes (gates all AI tool work)

- [ ] **SC-1** `backend/app/mcp/schemas/repe_tools.py` — Update `CreateFundInput.fund_type` field description from `"open-end, closed-end, co-invest"` to `"open_end, closed_end, sma, co_invest"` to match the DB CHECK constraint in `265_repe_object_model.sql`.

- [ ] **SC-2** Resolve `CreateFundInput.strategy` mismatch. Tool says `"core, core-plus, value-add, opportunistic"` but DB CHECK only accepts `"equity, debt"`. Either expand the DB CHECK via migration or update the tool description. Implement end-to-end.

- [ ] **SC-3** `backend/app/mcp/schemas/repe_tools.py` — Update `CreateDealInput.deal_type`. Remove `"preferred, mezzanine"` if DB CHECK only accepts `"equity, debt"`, or add those values via migration.

- [ ] **SC-4** `backend/app/mcp/schemas/repe_tools.py` — Update `CreateDealInput.stage` to canonical DB names: `"sourcing, underwriting, ic, closing, operating, exited"`. Remove `"screening, due-diligence"`.

- [ ] **SC-5** `backend/app/mcp/schemas/repe_finance_tools.py` — All six input models use `extra = "forbid"`. Change to `extra = "ignore"` to prevent ValidationErrors when the LLM sends unexpected keys.

---

## Phase 1 — Waterfall Scenario Override via AI

> The base `run_waterfall` and `stress_cap_rate` tools already exist in `repe_finance_tools.py` and are registered. The fast-path in `ai_gateway.py` handles `INTENT_RUN_WATERFALL` and `INTENT_STRESS_CAP_RATE`. What's missing is the full scenario-override waterfall (cap rate + NOI + exit shift combined) and multi-scenario comparison through the AI.

- [ ] **WF-1** `backend/app/mcp/schemas/repe_finance_tools.py` — Add `RunWaterfallScenarioInput` with all override fields: `fund_id`, `quarter`, `scenario_id` (optional), `cap_rate_delta_bps` (int, default 0), `noi_stress_pct` (float, default 0), `exit_date_shift_months` (int, default 0), `waterfall_style` (optional, `"american"` or `"european"`), `env_id`, `business_id`. Use `extra = "ignore"`.

- [ ] **WF-2** `backend/app/mcp/tools/repe_finance_tools.py` — Add `_run_waterfall_scenario` handler that calls the v2 `waterfall-scenarios/run` endpoint with override params. Include zero-override guard: if all overrides are zero/absent, run as base. Write result to `re_waterfall_run` with `(fund_id, quarter, scenario_id)` idempotency — return existing if a matching run exists within 60 seconds. Register in `register_repe_finance_tools()`.

- [ ] **WF-3** `backend/app/services/repe_intent.py` — Add `INTENT_RUN_WATERFALL_SCENARIO` family and patterns for combined-override queries like `"run downside with 75bps cap rate expansion and -5% NOI"`. Extract `cap_rate_delta_bps`, `noi_stress_pct`, `exit_date_shift_months` from natural language.

- [ ] **WF-4** `backend/app/services/ai_gateway.py` fast-path — Add `INTENT_RUN_WATERFALL_SCENARIO` branch that calls the new tool with all extracted override params. Emit structured_result with a card showing base vs. scenario deltas.

- [ ] **WF-5** `backend/app/mcp/schemas/repe_finance_tools.py` — Add `ListWaterfallRunsInput` with `fund_id` and optional `quarter`.

- [ ] **WF-6** `backend/app/mcp/tools/repe_finance_tools.py` — Add `_list_waterfall_runs` handler returning run history: `run_id`, `scenario_name`, `status`, `created_at`, key metrics (NAV, IRR, TVPI).

---

## Phase 2 — Scenario Comparison Enhancements

> `compare_scenarios` exists in `repe_finance_tools.py` but compares scenarios generically. These tasks add waterfall-aware comparison.

- [ ] **CMP-1** `backend/app/mcp/tools/repe_finance_tools.py` `_compare_scenarios` — Enhance the output to include: per-tier LP impact deltas (tier_name, partner_name, base_amount, scenario_amount, delta), carry impact (base_carry, scenario_carry, carry_delta), and a `narrative_hint` string (e.g. `"LP preferred return shortfall of $4.2M in the downside case"`).

- [ ] **CMP-2** `backend/app/services/ai_gateway.py` — Add `_build_comparison_card` helper for the `INTENT_COMPARE_SCENARIOS` fast-path branch. The card should surface the tier-level deltas and the narrative_hint prominently.

- [ ] **CMP-3** `repo-b/src/components/commandbar/StructuredResultCard.tsx` — Add a `scenario_comparison` card variant that renders per-tier LP impact in a compact table with color-coded deltas.

---

## Phase 3 — Context Envelope for Waterfall State

- [ ] **ENV-1** `repo-b/src/lib/commandbar/contextEnvelope.ts` — When the active route is a fund detail or `/waterfalls` page, include:
  - `fund_id`, `fund_name`, `fund_strategy`, `waterfall_style` from current fund
  - `current_quarter` (reuse `pickCurrentQuarter()`)
  - `last_waterfall_run` summary (run_id, quarter, base NAV, base IRR, scenario name)
  - `available_scenarios` list (scenario_id, name, is_base)

- [ ] **ENV-2** `backend/app/services/assistant_scope.py` — Add `waterfall_run` as a recognized `entity_type` for scope resolution by `run_id`.

- [ ] **ENV-3** `backend/app/services/request_router.py` — When `last_waterfall_run` is present in the envelope and the query is `"what did the waterfall show?"` or similar retrieval-only question, route to Lane A/B (no tool call needed — answer from context).

---

## Phase 4 — UI Integration

- [ ] **UI-1** `repo-b/src/app/app/repe/funds/[fundId]/page.tsx` — Add `"Waterfall"` as a distinct module tab entry in `MODULES` array that renders `<WaterfallScenarioPanel />` with the fund's context props.

- [ ] **UI-2** `repo-b/src/components/repe/WaterfallScenarioPanel.tsx` — Add an "Explain this run" button that sends the run result context to the AI gateway with a prompt like `"Explain this waterfall run for {fund_name} in {quarter}"`. Wire it through the command bar or a dedicated AI trigger.

- [ ] **UI-3** `repo-b/src/app/app/repe/waterfalls/page.tsx` — The current page delegates to `WaterfallScenarioPanel` in shadow mode but falls back to the old raw-JSON runner when no businessId. Remove the old fallback or update it to use the panel's result view.

- [ ] **UI-4** `repo-b/src/components/repe/WaterfallScenarioPanel.tsx` — Add support for combined override inputs (cap rate delta + NOI stress + exit shift together, not just scenario selector). Currently the panel uses `listReV2Scenarios` to pick a saved scenario; add inline override fields that create an ad-hoc run without a saved scenario.

---

## Phase 5 — AI System Prompt & Narration Quality

- [ ] **AI-1** `backend/app/services/ai_gateway.py` `_MUTATION_RULES_BLOCK` — Add waterfall scenario creation rules: allowed fields, required fund_id resolution from scope, confirmation prompt before running if overrides are extreme (cap rate delta > 200bps or NOI stress > 20%).

- [ ] **AI-2** `backend/app/services/ai_gateway.py` system prompt — Add waterfall interpretation guidance: lead with net IRR impact in plain English, identify which distribution tier was most affected, state whether the fund is still in carry, express NAV in dollars and percentage, flag material GP catch-up changes.

- [ ] **AI-3** Add waterfall tools (`run_waterfall_scenario`, `list_waterfall_runs`) to Lane C/D tool roster in `ai_gateway.py`. Allow `get_waterfall_run` and `list_waterfall_runs` in Lane B (read-only retrieval).

---

## Phase 6 — Test Coverage

- [ ] **TEST-1** `backend/tests/` — Unit tests for all handlers in `repe_finance_tools.py`: `_run_sale_scenario`, `_run_waterfall`, `_fund_metrics`, `_stress_cap_rate`, `_compare_scenarios`, `_lp_summary`. Mock engine responses. Currently zero test coverage on these tools.

- [ ] **TEST-2** `backend/tests/` — Unit tests for `repe_intent.py` intent classifier. Cover: sale scenario patterns, waterfall patterns, cap rate stress with bps extraction, metrics retrieval, multi-intent disambiguation.

- [ ] **TEST-3** `backend/tests/` — Unit tests for `repe_scenario_schema.py` param resolution. Cover: happy path, missing critical params (clarification flow), partial params, edge cases (zero overrides, extreme values).

- [ ] **TEST-4** `repo-b/src/components/repe/__tests__/WaterfallScenarioPanel.test.tsx` — Extend existing test to cover: override input rendering, run execution, result display, delta badges, run history loading, "Explain this run" button click.

- [ ] **TEST-5** `repo-b/tests/repe/re-waterfall-scenario.spec.ts` — Fix E2E spec:
  - `data-testid` on fund detail root should match actual component (`re-fund-homepage` vs what tests expect)
  - Mock for `/waterfall-scenarios/runs` GET should return non-empty array in at least one scenario
  - Add test for "Explain this run" AI trigger

---

## Hardening

- [ ] **HARD-1** `backend/app/services/ai_gateway.py` ~line 749 and ~802 — Add `done` event emission to the model-error path and max-rounds-exceeded path. Currently the frontend `reader.read()` hangs indefinitely.

- [ ] **HARD-2** `backend/app/services/ai_gateway.py` — Wrap `run_in_executor` tool calls in `asyncio.wait_for` with 30s timeout. Emit a structured error event if the engine times out.

- [ ] **HARD-3** `backend/app/mcp/tools/repe_tools.py` — Add idempotency guard to `create_fund`, `create_deal`, `create_asset`. Check natural key `(env_id, name)` and return existing record if created within last 5 minutes instead of creating a duplicate.

- [ ] **HARD-4** `backend/app/services/ai_gateway.py` ~line 518/526 — `semantic_search()` is synchronous inside an async generator. Wrap in `run_in_executor` to unblock the event loop during RAG queries.

---

## New Feature Candidates

> Not in flight yet. Recommendations based on codebase audit.

- [ ] **NEW-1** **Monte Carlo → Waterfall bridge**: `MonteCarloTab.tsx` runs IRR/TVPI simulations client-side with a seeded PRNG, but results never feed into the waterfall engine. Wire the Monte Carlo P10/P50/P90 exit values as waterfall scenario inputs so users can see tier-level impact of probabilistic outcomes.

- [ ] **NEW-2** **Portfolio-level waterfall aggregation**: Current waterfall runs are fund-scoped. Add a portfolio-level view at `/repe/portfolio` that aggregates waterfall results across multiple funds, showing total carry exposure, LP return gaps, and cross-fund diversification impact.

- [ ] **NEW-3** **Geo intelligence → deal scoring integration**: `re_geography.py` (1063 LOC service) and `DealGeoIntelligencePanel.tsx` are complete but not integrated into the pipeline deal ranking. Wire market-level cap rate data and population growth into the deal radar scoring model so pipeline prioritization reflects geographic risk.

- [ ] **NEW-4** **Pipeline radar backend engine**: `DealRadarCanvas.tsx`, `DealRadarWorkspace.tsx`, and `RadarSummaryPanel.tsx` exist as UI components but no backend scoring engine was found. Build a deal scoring service that computes risk/opportunity axes from deal financials, market data, and sponsor track record.

- [ ] **NEW-5** **Waterfall stress template library**: Pre-built scenario templates (e.g. "COVID stress", "rate shock", "exit delay 18mo") stored as scenario presets the AI can reference by name. Saves users from specifying individual override params for common stress cases.

- [ ] **NEW-6** **AI-generated waterfall memos**: After a waterfall scenario comparison, the AI should be able to generate a structured IC memo section that covers: scenario assumptions, key metric deltas, LP impact, GP economics, and risk factors — exportable as a `.docx` section or inline card.

- [ ] **NEW-7** **Capital account engine → waterfall integration**: `capital_account_engine.py` and `clawback_engine.py` exist in `/finance/` but are not wired into the waterfall runtime or exposed as MCP tools. Connecting them would enable AI queries like "if we call another $10M, what happens to the waterfall?" or "is there a clawback risk in the downside scenario?"

- [ ] **NEW-8** **Real-time waterfall notifications**: No Supabase Realtime or WebSocket integration exists. Add real-time push for waterfall run completion so the `WaterfallScenarioPanel` auto-updates when a long-running scenario finishes (currently requires manual refresh).

- [ ] **NEW-9** **UW vs Actual waterfall comparison**: `UwVsActualTable.tsx` and `AttributionBridgeChart.tsx` exist for reporting but are not waterfall-aware. Add a mode where the waterfall engine runs against underwriting assumptions vs. actual performance and shows where LP returns diverged from the original thesis.

- [ ] **NEW-10** **Sensitivity table export**: After running multiple waterfall scenarios with varying cap rate and NOI stress, generate a 2D sensitivity matrix (cap rate on X, NOI stress on Y, IRR in cells) exportable via `ExcelExportButton.tsx` to `.xlsx`.

- [ ] **NEW-11** **Construction forecast → waterfall**: `construction_forecast_engine.py` exists but isn't connected. For development-stage funds, incorporate construction draw schedules and projected stabilization dates into waterfall timing assumptions.

- [ ] **NEW-12** **AI conversation memory for waterfall context**: When a user runs multiple scenarios in one conversation, the AI should maintain a session-level memory of all runs so it can answer "which scenario had the best LP return?" without re-running anything. `repe_session.py` exists but doesn't track waterfall run history within a conversation.
