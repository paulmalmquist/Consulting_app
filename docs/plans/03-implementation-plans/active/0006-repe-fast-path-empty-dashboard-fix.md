# REPE fast-path empty-dashboard fix

- **ADO:** Story #267 (AI Gateway: repe_fast_path empty dashboards / routing). #231 closed as duplicate (mis-framed as a REPE authoritative-read bug). Acceptance Test Cases #204, #205.
- **Branch:** `fix/repe-fast-path-empty-dashboard`
- **Status:** fix + regression tests complete; gateway/repe suites green.

## Problem

`docs/ai-testing/2026-03-21.md`: REPE data/dashboard queries routed to
`repe_fast_path` (Lane F) returned `tools=0, tokens=0` — a "COMPLETED" dashboard
shell with no data, ending in "No response from Winston." Flagged in
`docs/LATEST.md` as the top demo-breaker.

## Diagnosis (three independent read-only code traces)

Ruled out the other failure classes: auth/context propagation, missing
business/env IDs, REPE capability gating, and token-budget guards are all fine.
The authoritative-state READ (`re_authoritative_snapshots.get_authoritative_state`)
correctly returns data when released and a fail-closed `null_reason` when not —
so #231's "authoritative read bug" framing was wrong.

Root cause is **AI-gateway routing** in `backend/app/services/ai_gateway.py`
`_run_repe_fast_path`:
1. The `INTENT_GENERATE_DASHBOARD` branch called `compose_dashboard_spec()`,
   which builds widget *structure* only — no tool execution, no data fetch — so
   it emitted a `done` event with an empty 0-tool shell.
2. The catch-all `else` branch emitted "let me use the full analysis pipeline
   instead" but the **caller unconditionally `return`ed** after the fast path, so
   the promised fallback never ran.

## Fix (minimal, routing-only — no UI patch, no REPE refactor)

- Added sentinel `_FAST_PATH_FALLTHROUGH`. The dashboard branch, the unhandled
  `else` branch, and pre-output exceptions now set `fall_through = True`; the
  function yields the sentinel and returns **without** a `done` event.
- The caller intercepts the sentinel: does not forward it to the client, does
  not return, and **falls through to the full LLM+tools pipeline** that actually
  fetches and populates data (or surfaces a real fail-closed reason).
- Exception path only falls through when nothing substantive was streamed yet
  (no tool calls, no blocks); otherwise it surfaces an honest error rather than
  double-emitting.

Net: the fast path can no longer ship a structurally-empty success. It either
serves real data (handled finance intents) or hands off to the full pipeline.

## Regression coverage

`backend/tests/test_repe_fast_path_fallthrough.py` (the routing-layer guard the
composer-only `test_repe_fast_path_nonempty.py` could not provide):
- dashboard intent → yields fall-through, emits **no** `done` (no empty shell)
- unhandled intent → falls through
- handled data intent (`fund_metrics`) → still served by the fast path, `done`
  with `tool_call_count > 0` (guards against over-correction)

## Out of scope (file separately)

- **Frontend secondary gap:** REPE dashboard widgets fetch statement endpoints
  and don't consult `useAuthoritativeState`/`null_reason`, so a degraded read can
  still render blank instead of a diagnostic empty-state. Real, but distinct from
  the demo-breaker; the backend fix makes the fast path produce real data via the
  full pipeline. Worth its own story.

## Verification

- `pytest tests/test_repe_fast_path_fallthrough.py tests/test_repe_fast_path_nonempty.py` → 14 passed.
- `pytest -k "ai_gateway or repe_fast or dashboard or repe_intent"` → 428 passed, 0 failed.
- ruff clean on the gateway + test.
