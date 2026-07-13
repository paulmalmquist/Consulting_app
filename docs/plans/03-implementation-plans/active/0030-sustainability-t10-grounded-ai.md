# 0030 - Sustainability T10: Make the Governed Metrics Answerable by the Copilot

- Status: Done (2026-07-13) - relay 8/9, all suites green. The 1 unmet was evidentiary (regression commands not attached), plus a MetricResult risk flag disproven by running the full consumer surface: 339 passed, 0 failed.
- Environment: Business OS / Sustainability + AI runtime
- Risk: Medium (touches the shared unified query executor; must not disturb existing strategies)
- Scope: Close the last gap between the registered sustainability metrics and the AI copilot, so a grounded question gets a governed answer or an honest refusal. One ticket (T10 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- ADR: `docs/adr/sustainability/0001-brownfield-extension.md` (decision 5, single fetch layer).
- Depends on: T4 reader, T6 registry (both merged, live).

## What is already wired (verified against the tree)

Most of T10 already exists. The chain is:

`ai_gateway._build_unified_metrics_block()` -> `unified_metric_registry.get_registry()` (DB-driven) -> the copilot's system prompt, which instructs it to use `metrics.unified_query` for **all** metric lookups -> `mcp/tools/metrics_tools.py` -> `unified_query_builder.execute_unified_query` -> `_execute_service_strategy` -> `_get_service_map()`.

T6 seeded the six sustainability metrics with `query_strategy='service'` and `service_function='sustainability_authoritative'`, and added that entry to `_get_service_map()`. So the copilot already **names** the six metrics in its prompt.

## The actual bug this ticket fixes

`_execute_service_strategy` in `backend/app/services/unified_query_builder.py` dispatches on a **hardcoded if/elif over the service name**:

```
if svc_key == "portfolio_kpis":   raw = fn(env_id=..., business_id=..., quarter=..., scenario_id=...)
elif svc_key == "fund_metrics":   raw = fn(env_id=..., business_id=..., fund_id=..., quarter=...)
else:                             raw = None      # <-- every other service lands here
```

`sustainability_authoritative` falls into the `else`, gets `raw = None`, and every sustainability metric returns `_empty_result(...)`. The registration is real but **inert at query time**: the copilot can name the six metrics and can never retrieve one.

It does **fail closed** (no fabricated number, and the surrounding `try/except` turns any error into `_empty_result`), so the safety property already holds. The metrics are simply unanswerable. This ticket makes them answerable **without weakening that fail-closed behavior**.

Note the arg shapes also differ: our reader's `get_metric` requires `entity_scope`, `period_key`, `metric_family`, and `metric_key`, none of which the executor passes today.

## Scope

In scope:

1. **Teach the executor to call the sustainability service** in `backend/app/services/unified_query_builder.py`: add a branch for `sustainability_authoritative` that calls the dispatch function once per metric in the batch, passing `business_id`, `env_id`, the metric's `metric_key`, and the scope the query carries (`entity_scope`, `period_key`, `metric_family`), deriving `period_key` from `query.quarter` when not otherwise supplied. Map the reader's `{value, unit, null_reason, trust_status, snapshot_version}` into the executor's result shape, carrying **`null_reason` through** rather than discarding it.
   - Do **not** change the `template` or `semantic` strategies, `_empty_result`, or the existing `portfolio_kpis` / `fund_metrics` branches.
   - Keep the existing `try/except -> _empty_result` behavior: a raised error must still fail closed, never fabricate.
2. **Preserve fail-closed in the answer**: when the reader returns a `null_reason` (`snapshot_unavailable`, `emission_factor_missing`, `metric_definition_missing`, `out_of_certified_scope`), the executor result carries `value=None` and that `null_reason`, so the copilot reports the reason instead of a number. Zero is never substituted.

Out of scope (explicit):
- Any change to `ai_gateway.py`'s prompt assembly, the `metrics.unified_query` tool schema, the registry, the T4 reader, T5 routes, T9's report, or the schema.
- The `template` and `semantic` strategy executors, and the `portfolio_kpis` / `fund_metrics` branches.
- Any write path, any new MCP tool, any UI change.

## Acceptance Criteria

### Screen
Not applicable.

### API
- `_execute_service_strategy` gains a `sustainability_authoritative` branch. The `portfolio_kpis` and `fund_metrics` branches, `_execute_template_strategy`, `_execute_semantic_strategy`, and `_empty_result` are unchanged.

### DB/Data
- The executor issues no SQL of its own for this strategy: every sustainability value comes from the dispatch function, which is a pass-through to the T4 authoritative reader.

### AI behavior
- A `metrics.unified_query` for a sustainability metric key (e.g. `scope1_tco2e`) resolves through the service map to the T4 reader and returns the reader's value, `unit`, `snapshot_version`, and `trust_status`. It no longer returns `_empty_result` by falling into the `else` branch.
- **Fail-closed is preserved and is the headline behavior**: when the reader reports a `null_reason`, the executor result carries `value=None` plus that `null_reason` verbatim, so the copilot states the reason rather than inventing a figure. Zero is never substituted for an absent value. An exception inside the service call still degrades to `_empty_result` rather than a fabricated number.

### Evals/tests
- New `backend/tests/test_unified_query_sustainability.py`, with the dispatch function monkeypatched (no DB), asserts: (1) a query for `scope1_tco2e` reaches the sustainability service and returns the reader's value/unit/snapshot_version/trust_status, rather than an empty result; (2) a reader payload carrying `null_reason: "snapshot_unavailable"` yields a result with `value=None` and that `null_reason`, **and not `0`**; (3) a reader that raises still yields `_empty_result` (fails closed, no fabrication); (4) a query for an existing `portfolio_kpis` metric still takes the original branch and is unaffected.
- `cd backend && python -m ruff check app tests` and `python -m pytest tests/test_unified_query_sustainability.py -q` pass. The existing unified-query and metrics tests still pass.

### Regression guard
- Only `backend/app/services/unified_query_builder.py` (additive branch), the new test, and this plan are changed.
- `ai_gateway.py`, `unified_metric_registry.py`, `metrics_tools.py`, `re_sustainability_authoritative.py`, all routes, all schema files, and the frontend are untouched.
- No existing strategy branch, `_empty_result`, or existing test is modified.
