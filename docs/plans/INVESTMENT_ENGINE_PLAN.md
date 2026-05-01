# Investment Engine — Plan of Attack

**Goal:** ship a Winston environment that covers the institutional capability surface of BlackRock Aladdin, with correctness, auditability, and determinism as the design contract — not features for their own sake.

**Status:** Pre-flight. V1 vertical slice already specified in project instructions (Phases 1–7). This document sequences the rest of the 13-facet capability map, identifies reusable skill opportunities, and defines the planner workflow.

**Author bias:** the hardest 60–70% of what Aladdin actually does is a correct data model + a deterministic accounting layer + a strict workflow/audit system. That is the entire focus of Waves 0–2. Risk math, OMS surface, and reporting polish are downstream of that — not parallel to it.

---

## 1. Operating Model

Three planning layers, used in order, every module:

| Layer | Tool | Output | When |
|---|---|---|---|
| Decision | `engineering:architecture` (ADR skill) | `docs/adr/investment-engine/NNN-*.md` | Once per load-bearing decision |
| Implementation plan | Claude Code planner / `Plan` agent | `docs/plans/investment-engine/{wave}-{module}.md` | Once per module, before any code |
| Build | `winston-investment-engine-module` skill (new — see §4) | code + tests + verification step | Per module |

Environment scaffolding lives outside this loop — handled once by `winston-create-environment` for the `investment_engine` env.

---

## 2. Capability Map → Winston Modules

The 13 Aladdin facets collapse to 9 backend Winston modules plus cross-cutting infrastructure. Wave column is build order.

| # | Winston module | Facets covered | Wave | In V1 slice? |
|---|---|---|---|---|
| 1 | `core_data` | 1 (data model), 11 (lineage spine), 13 (APIs) | 0 | schema only |
| 2 | `accounting_engine` | 2 (NAV, P&L, fees), 10 (TWR, IRR) | 0 | NAV + P&L |
| 3 | `reconciliation` | 7 (data integration controls) | 0 | yes |
| 4 | `audit_log` | 11 (audit, governance) | 0 | yes |
| 5 | `risk_engine` | 3 (VaR, factors, scenarios, attribution) | 1 | no |
| 6 | `compliance` | 6 (rules, exposure, breaches) | 1 | no |
| 7 | `oms` | 4 (orders, pre-trade) | 2 | no |
| 8 | `ems` | 5 (executions, allocations, settlement) | 2 | no |
| 9 | `workflow` | 8 (close cycles, exception queues) | 2 | no |
| 10 | `reporting` | 9 (internal + client) | 3 | no |
| — | `security` (RLS + RBAC) | 12 | inline | yes via RLS |
| — | `data_integration` (ETL adapters) | 7 | inline | yes via reconciliation |

---

## 3. ADRs to Lock Before Wave 0 Schema Lands

Three calls block schema design. Author them via `engineering:architecture`. Don't start Phase 1 of V1 until they're locked.

**ADR 001 — Lot accounting method.** FIFO vs specific-ID vs both. Recommendation: both, with default mode per fund. Specific-ID is required for tax-aware investors and isn't optional; FIFO is the default for the rest. Lots stored as immutable rows with derived `open_qty` rather than mutable lot rows — costs storage, eliminates an entire bug class.

**ADR 002 — Currency model.** When to translate. Recommendation: store native amount + reference to FX rate ID used at translation time, translate at read. Never store a translated value without the FX rate provenance. This kills the "which FX rate did we use" question forever and is required for audit.

**ADR 003 — Bi-temporal time model.** Recommendation: every authoritative output carries `effective_date` (the business date it pertains to) and `as_of_date` (when it was computed). Adds complexity, non-negotiable for reproducibility. Snapshots reconstructed by ID must replay against the same input versions that existed at `as_of_date`.

Two more ADRs land before Wave 1, not blocking Wave 0:

- **ADR 004 — VaR method.** Historical sim + parametric, both stored, `var_method` on every output.
- **ADR 005 — Compliance rule DSL.** JSONB rule DSL with explicit operator set. No code-defined rules.

---

## 4. New Skills to Author

Two skills are worth writing before Wave 0. Both encode patterns that repeat across 6+ modules — the cost of writing them now is recovered the second time they're used.

### 4.1 `winston-investment-engine-module`

Wraps every engine module (accounting, risk, compliance, oms, ems, workflow) with one discipline. Triggers on phrases like "build the X engine", "add an investment engine module", "scaffold a new calculation service".

Enforces the per-module shape:

```
backend/app/services/{module}.py        # pure, deterministic, fail-closed, returns {valid, value, errors}
backend/app/routes/{module}.py          # strict input validation, structured errors, no partial returns
backend/app/audit/{module}_hooks.py     # wraps every mutation; previous_state + new_state to audit_log
backend/tests/services/test_{module}.py # happy path + every fail-closed branch + golden values where math
repo-b/db/schema/NNN_{module}.sql       # env_id, RLS, audit cols, named indexes, COMMENT ON TABLE
docs/plans/investment-engine/{wave}-{module}.md   # the planner output that drove the build
```

Verification checklist baked into the skill:
- snapshot reproducibility (where applicable): given output ID, reconstruct the input set
- fail-closed test for every required input
- audit row exists for every state-mutating call path
- `verification/lint/no_legacy_repe_reads.py` and the state-lock invariant tests still pass

### 4.2 `winston-investment-snapshot`

Locked/versioned snapshot lifecycle. Triggers when a new authoritative output needs `draft → locked → released` semantics. NAV, P&L, position valuations, risk snapshots, performance snapshots, report outputs all use this — six modules minimum.

Contract enforced by the skill:

- table includes `id`, `entity_type`, `entity_id`, `effective_date`, `as_of_date`, `status`, `version`, `produced_at`, `produced_by`, `input_versions` (jsonb), payload columns
- partial unique index: `WHERE status = 'released'` on `(entity_id, effective_date)`
- DB trigger blocks UPDATE/DELETE on released rows
- service exposes `release(snapshot_id)` and `reconstruct(snapshot_id)` — the latter must produce the same payload from the same `input_versions` or fail loudly

Both skills route through the existing `CLAUDE.md` taxonomy as new entries under `accounting, NAV, snapshot, investment engine module, deterministic engine, ...`.

---

## 5. Wave 0 — Foundation (V1 slice from project instructions)

Already fully specified in the project instructions. Phases 1–7 cover schema, accounting engine, reconciliation, audit, API, UI, tests. Acceptance criteria already defined.

Verification gate before Wave 1 begins:

- All Phase 7 tests green in CI
- A NAV snapshot can be reproduced from `nav_snapshot_id` alone (no other inputs)
- A reconciliation run with seeded breaks produces stored breaks visible in the UI
- Every mutation has a corresponding `audit_log` row with `previous_state` + `new_state`
- The two new skills (§4) have each been used at least once during V1 — proves they hold up

If any of those fail, V1 isn't done. No skipping ahead.

---

## 6. Wave 1 — Risk + Compliance (parallel)

Independent of each other once Wave 0 lands. Run on parallel branches.

### `risk_engine`

- ADR 004 (VaR method) locked first
- `services/risk_engine.py`: `calculate_var()`, `apply_scenario()`, `calculate_factor_exposure()`, `attribute_performance()`
- Same fail-closed contract as accounting: missing covariance matrix → error, not zero
- Snapshot table `risk_snapshots` via §4.2
- **Hard rule:** golden tests against published two-asset portfolio VaR to 6 decimals. Any drift from the textbook value fails CI. Risk math without golden tests is a liability, not a feature.

### `compliance`

- ADR 005 (rule DSL) locked first
- `services/compliance_engine.py`: `evaluate_pre_trade(order)`, `evaluate_post_trade(position_set)`
- Returns structured violations; never returns a "soft" pass
- Tables: `compliance_rules`, `compliance_violations` (append-only)
- Pre-trade evaluation is synchronous and blocking — OMS in Wave 2 depends on this contract

Wave 1 close gate: end-to-end test that runs `accounting → risk_snapshot → compliance check` and produces three reproducible artifacts from one input set.

---

## 7. Wave 2 — OMS, EMS, Workflow

Needs snapshot semantics from Wave 0 and compliance from Wave 1.

### `oms`

- Order lifecycle state machine: `idea → order → approved → routed → done` (or `rejected`)
- Pre-trade compliance call is blocking
- What-if engine reuses `accounting_engine` and `risk_engine` — must not duplicate calculation logic. If duplication appears, refactor before merging.

### `ems`

- Trade fills, broker simulation. No real broker connectivity — write the adapter interface but ship a deterministic simulator.
- Allocation engine: weighted split of executions to accounts
- Settlement state machine: `pending → settled | failed`

### `workflow`

- Close cycles (month-end, quarter-end). State machine per period.
- Task assignment, exception queues.
- This is where Winston can be measurably better than Aladdin per the user's note. Worth its own design pass and probably a dedicated ADR.
- **ADR 006 — Workflow engine.** Recommendation: own, event-sourced, append-only `workflow_events` table. No external workflow engine — too heavy for this stack and the bi-temporal model from ADR 003 covers most of what you'd want from one.

Wave 2 close gate: a simulated month-end close runs end-to-end — orders are validated, executed, allocated, settled, NAV is locked, reconciliation runs, breaks are queued, the close state machine reports `closed`.

---

## 8. Wave 3 — Reporting

Pulls from everything. Last because it has the most upstream dependencies.

- Investor statements, capital account statements, quarterly reports
- Drill-through: every reported number links to the snapshot ID it was sourced from. This is where the audit layer pays off.
- Scheduled report generation (cron job → `report_outputs` table, snapshot pattern from §4.2)
- Versioned outputs: re-running against the same period produces byte-identical output. If they differ, something upstream mutated released state — that's a hard failure.
- **ADR 007 — PDF rendering pipeline.** Recommendation: HTML → headless Chrome → PDF on Railway worker. Use existing `docx` and `pdf` skills for assembly.

---

## 9. Risks and Sharp Tradeoffs

**Lot tracking is the hardest schema decision.** Wrong call here makes every downstream calculation suspect. Immutable lot rows with derived `open_qty` is the right tradeoff. Storage cost is real but the bug class it kills is worse.

**Reconciliation has no V1 ROI but unblocks every later wave.** Don't cut it from V1 to ship faster. The break record format (source A, source B, break type, severity, evidence) is the contract that lets Wave 1+ modules emit their own break types without schema churn.

**Audit log volume.** Every mutation writes a row. At scale this table dominates storage. Plan now: partition `audit_log` by month from day one, write an archive job for 90+ days to a cold table. Don't activate the archive in V1, but the partitioning must be in place from the first migration — retrofitting partitions is brutal.

**Workflow scope creep in Wave 2.** Constrain to period close, valuation cycles, exception queues. Capital calls and distributions belong in Wave 3 reporting — they're a reporting concern with workflow garnish, not the other way around. Resist the temptation.

**Risk math correctness.** Factor models and VaR have subtle math. Golden tests against published academic values are non-negotiable. The first time someone says "the VaR looks low" without a reproducible test that proves it, you've lost the audit story.

**Snapshot mutation drift.** The single biggest correctness risk: a released snapshot gets silently mutated upstream because some service forgot the lock. The DB trigger from §4.2 plus the existing state-lock invariant tests are the defense. Add a nightly job that picks a random released snapshot and re-runs `reconstruct()` — if it diverges, page someone.

---

## 10. Sequencing and Time

Estimated time-to-V1 acceptance: ~2 weeks of focused build.

Estimated time to Wave 3 close: 8–10 weeks if Wave 1 modules run in parallel and Wave 2 starts before Wave 1 fully closes (compliance contract just needs to be locked, not fully built, for OMS to start).

If you have to drop scope to hit a date, drop **Wave 3 reporting polish** — not Wave 0 reconciliation or Wave 0 audit. Reporting can be hand-assembled from snapshots for a quarter while the engine is correct. The reverse is not true.

---

## 11. Immediate Next Steps

1. Run `winston-create-environment` for the `investment_engine` env. Captures sidebar slot, env manifest, default routes, lab-page scaffold.
2. Write the two new skills (§4): `winston-investment-engine-module` and `winston-investment-snapshot`. Register both in `CLAUDE.md` routing taxonomy.
3. Author ADRs 001–003 (lot accounting, currency, bi-temporal time). Lock before any schema lands.
4. Hand Phase 1 (schema) of V1 to the Claude Code planner. The planner's output goes to `docs/plans/investment-engine/0-core-data-schema.md`. The implementing agent invokes `winston-investment-engine-module` against that plan.
5. Repeat step 4 for Phases 2–7.
6. Verification gate (§5). Then Wave 1 ADRs (004, 005) and parallel kickoff.

---

## 12. Where This Plan Lives

This document is the source of truth for sequencing. ADRs supersede this doc on specific decisions. Per-module plans supersede this doc on implementation detail. If those three disagree, the more specific document wins.

If a future request says "build risk engine" or "add the OMS", the routing should land here first, then jump to the relevant ADR + per-module plan.
