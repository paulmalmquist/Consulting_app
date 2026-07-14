# 0034 - Relay Orchestration Telemetry

- Status: Done (2026-07-14) - safety-escalated (orchestration_self_edit) on the first run; the plan legitimately targets the relay, so it was resumed with the RECORDED --allow-relay-self-edit override, not bypassed. Codex then found a real spec bug (safety_stop counted as rejected); fixed + pinned by test. 228 tests green.
- Environment: MCP / Orchestration / AI Runtime
- Risk: Low (records and aggregates what the relay already does; changes no build/review behavior)
- Scope: Make the relay's own performance measurable, so model routing is decided by this repository's results rather than intuition. One ticket.
- Related: `docs/reference/CODING_RELAY.md`, `orchestration/relay_coordinator/routing.py` (which already defines an outcome recorder and a `recommend()` that has never had real data).

## The gap, verified against 14 real runs

The sustainability roadmap produced 14 tickets of exactly the data we want, and it is all sitting in `.orchestration/runs/<run_id>/`. Two findings:

**Already captured per iteration, just never aggregated:**
- `verdict.json` - reviewer status, per-criterion met/unmet/unknown, `risk_flags`, `required_next_steps`
- `tests/summary.json` - per-suite pass/fail/skip (so first-pass test rate is derivable)
- `diff-stat.txt`, `safety.json`, `build-meta.json`, `review-meta.json`

**Not captured at all, and this is the one that matters:**
- `run.json` records `claude_model: "(cli default)"`. **The builder model was never recorded.** Every one of the 14 tickets ran on whatever the CLI defaulted to. The reviewer is pinned (`codex_model: gpt-5.4`), but the builder is a black box.

So the evidence needed to decide **whether Fable or Sol should own architecture, implementation, tests, or review cannot be produced from the existing runs at all** - the attribution was never written down. No amount of aggregating fixes that retroactively. The recording has to be fixed first, then the aggregation becomes worth doing.

This ticket does both, in that order. It is deliberately **not** an autonomy increase: the relay builds and reviews exactly as it does today.

## Scope

In scope:

1. **Record the builder model honestly** (`orchestration/coding_relay/`):
   - When `--claude-model` is not passed, resolve and record what the CLI **actually used** rather than writing the string `"(cli default)"`. If the CLI does not report the resolved model, record `null` plus a `model_resolution: "cli_default_unreported"` marker. **Do not guess, and do not record a model name the run cannot prove it used** - a wrong attribution is worse than an absent one, because it would silently poison the routing evidence.
   - Record the same for the reviewer (already pinned, but record the resolved value, not the requested one).
2. **Emit one row per completed run** to an append-only `.orchestration/telemetry/runs.jsonl`, derived from artifacts that already exist:
   - `run_id`, `plan` (ticket id/slug), `task_class` (from the plan, or `unclassified`), `base_sha`
   - `builder_model`, `builder_model_resolution`, `reviewer_model`, `reviewer_effort`
   - `iterations_used`, `max_iterations`, `outcome` (pass | max_iter | blocked | risk_escalation | safety_stop | error) and `exit_code`
   - `first_pass_tests` - did **every** inferred suite pass on **iteration 1** (true/false/`no_suites`)? A SKIPPED suite is **not** a pass; record it as `skipped` so a silently-disabled suite can never be mistaken for a green one.
   - `review_findings` - counts of unmet + unknown criteria and `risk_flags` per iteration, and the **final** counts
   - `files_changed`, `lines_added`, `lines_deleted` (from `diff-stat.txt`)
   - `elapsed_s` per phase (build / test / review) and total
   - `safety_violations` (from `safety.json`)
   - `rejected` - whether the run was blocked or escalated, and the reviewer's stated reason
3. **Aggregate + report**: `python -m orchestration.relay_coordinator.telemetry report` prints, per `(builder_model, task_class)`: runs, pass rate, mean iterations, first-pass test rate, mean review findings, mean elapsed, and rejection rate. It **reports; it does not rewrite any routing policy** (the coordinator's existing `recommend()` already draws the line at suggesting, and this keeps it).
4. **Backfill what is honestly recoverable**: a `telemetry backfill` path that reads the existing `.orchestration/runs/*` folders and emits rows for the 14 completed runs, with `builder_model: null` + `model_resolution: "cli_default_unreported"` for every one of them. **It must not invent a model name for those runs.** The backfill's value is the iteration/finding/test data; the model column is honestly empty until runs start recording it.

Out of scope (explicit):
- Any change to how the relay builds, reviews, or gates. No autonomy increase, no new override, no change to safety.
- Auto-rewriting the routing policy from the evidence. The coordinator recommends; a human decides.
- A dashboard or web UI.
- Changing which model runs anything. This ticket only makes the current behavior measurable.

## Acceptance Criteria

### Screen
Not applicable.

### API
- `python -m orchestration.relay_coordinator.telemetry report` prints the per-`(builder_model, task_class)` table described above and exits 0 with no runs present (empty table, not a crash).
- `telemetry backfill` reads existing run folders and emits one row per completed run without modifying those folders.

### DB/Data
Not applicable (append-only JSONL under `.orchestration/`, git-ignored).

### AI behavior
- **The relay never records a model it cannot prove it used.** When the builder model is unresolved, the row carries `builder_model: null` and `model_resolution: "cli_default_unreported"` - never a guessed name. A fabricated attribution would silently poison the very routing evidence this ticket exists to produce, which is a worse failure than a missing value.
- **A SKIPPED suite is never counted as a pass.** `first_pass_tests` distinguishes pass / fail / skipped, so a silently-disabled suite (the `node_modules` junction failure that hid the frontend suites for most of this roadmap) cannot masquerade as a green first pass.

### Evals/tests
- New `backend/tests/test_relay_telemetry.py` asserts: (1) a run whose builder model is unresolved records `null` + `cli_default_unreported`, **not** a guessed name; (2) `first_pass_tests` is `false` when any iteration-1 suite failed, and records `skipped` rather than `pass` for a SKIPPED suite; (3) a row is emitted for each terminal outcome (pass, max_iter, blocked, risk_escalation) with the right `outcome` and `exit_code`; (4) the aggregate report groups by `(builder_model, task_class)` and computes pass rate / mean iterations / first-pass rate correctly from a fixture set; (5) `report` on an empty telemetry file exits 0 with an empty table; (6) `backfill` over a fixture run folder emits a row without mutating the folder.
- `cd backend && python -m ruff check app tests` and `python -m pytest tests/test_relay_telemetry.py -q` pass. The existing relay + coordinator tests (215+) still pass.

### Regression guard
- The relay's build, review, test, and safety behavior is unchanged: no change to `loop.py`'s gating, `safety.py`, `verdict.py`, or the provider invocations beyond recording the resolved model.
- Existing relay and coordinator tests remain green.
- Only telemetry-related files, the model-resolution recording, the new test, and this plan are changed.
