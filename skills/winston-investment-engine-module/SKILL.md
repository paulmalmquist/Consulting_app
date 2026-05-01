---
name: winston-investment-engine-module
description: Per-module discipline for the Winston Investment Engine. Wraps every backend engine module (accounting, risk, compliance, oms, ems, workflow, reporting) with a uniform shape — schema migration, deterministic service, strict route, audit hook, tests, and verification step. Use any time a new investment-engine module is being scaffolded or an existing one is being extended.
source_of_truth: true
entrypoint: true
triggers:
  - investment engine module
  - build the accounting engine
  - build the risk engine
  - build the compliance engine
  - build the oms
  - build the ems
  - build the workflow engine
  - build the reporting module
  - scaffold investment engine module
  - new calculation service
  - extend the investment engine
  - add a new engine
status: active
phase: A
related:
  - skills/winston-investment-snapshot/SKILL.md
  - docs/plans/INVESTMENT_ENGINE_PLAN.md
  - docs/adr/investment-engine/001-lot-accounting-method.md
  - docs/adr/investment-engine/002-currency-model.md
  - docs/adr/investment-engine/003-bi-temporal-time-model.md
  - docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md
---

# Winston Investment Engine Module

Every backend module in the Winston Investment Engine — accounting, risk, compliance, oms, ems, workflow, reporting — follows one shape. This skill enforces it. The shape exists because correctness, audit, and reproducibility require uniformity; ad-hoc modules drift and the audit story breaks.

## When to Use

- Scaffolding a new investment-engine module (any of the 9 modules listed in the plan)
- Adding a new calculation service inside an existing engine module
- Extending an engine module with a new mutating endpoint
- Reviewing a PR that claims to add or modify engine logic

## When NOT to Use

- Pure read-only views over already-stored authoritative state — use the `getReV2AuthoritativeState` / authoritative-state contract directly
- Frontend UI work — use `agents/frontend.md` or `.skills/feature-dev/SKILL.md`
- Non-investment-engine domain logic — use `agents/bos-domain.md`

---

## The Module Shape

A module named `<module>` (e.g., `accounting_engine`, `risk_engine`, `compliance`) MUST produce these artifacts. No exceptions.

```
backend/app/services/<module>.py            # pure, deterministic, fail-closed
backend/app/services/<module>_audit.py      # mutation hooks
backend/app/routes/investment_engine.py     # route additions (all routes live here)
backend/tests/services/test_<module>.py     # unit tests (happy path + every fail-closed branch)
backend/tests/services/test_<module>_audit.py  # audit row written for every mutation path
repo-b/db/schema/NNN_<module>_<purpose>.sql # migrations (one or more)
docs/plans/investment-engine/<wave>-<module>.md  # per-module plan that drove the build
docs/adr/investment-engine/NNN-<topic>.md   # ADR if any load-bearing decision was made
```

---

## Service Contract

Every public function on `services/<module>.py` returns a structured response of this shape:

```python
from typing import TypedDict, Any, Literal

class EngineResult(TypedDict):
    valid: bool
    value: Any | None
    errors: list[dict]  # each error: {code: str, message: str, context: dict}
```

Rules:

1. **Deterministic.** Same inputs → same output, byte-for-byte. No system clock reads inside the calculation. Time-dependent inputs are passed in.
2. **Fail-closed.** If any required input is missing, return `valid=False, value=None, errors=[...]` with a structured error code. Never substitute, infer, fall back, or interpolate.
3. **Pure.** No DB writes inside the calculation function. Caller persists results inside its own transaction.
4. **Authoritative inputs only.** Reads go through the authoritative-state contract (`re_authoritative_snapshots.get_authoritative_state` for prior released state, `position_lots` + `position_lot_reliefs` for lot state, `fx_rates` for FX, `security_prices` for prices). Never query base tables for derived state — query the snapshot or the input rows directly.
5. **Versioned inputs.** Functions that produce snapshots accept and return the `input_versions` jsonb shape from ADR 003. Reconstruction depends on this.

### Required error codes (the universal set)

Every module's error vocabulary starts from this set. Add module-specific codes as needed.

| Code | Meaning |
|---|---|
| `missing_price` | Security has no price row for the requested effective_date |
| `missing_fx` | FX rate missing for currency pair + date + source |
| `missing_position` | Position expected but not in input set |
| `incomplete_lots` | Lot relief math doesn't balance against position quantity |
| `incomplete_inputs` | Required input not present (use sparingly, prefer specific codes) |
| `stale_data` | Input is older than the configured staleness threshold |
| `out_of_scope_requires_waterfall` | Carry / promote / GP-share metric — not computable without waterfall (per state-lock rules) |
| `invalid_period` | Requested period is not closed / not yet open |
| `superseded_input` | Referenced input has been superseded; recompute against current input set |

---

## Route Contract

All investment-engine routes live in `backend/app/routes/investment_engine.py`. New module = new route group, same file.

Rules:

1. **Strict input validation.** Pydantic models with explicit types. Reject unknown fields. Reject ambiguous types (no `Union[str, int]` for IDs).
2. **Structured errors.** Every error response uses the same envelope: `{ valid: false, value: null, errors: [{code, message, context}] }`. Same shape as the service contract.
3. **No partial calculations.** If the service returns `valid=False`, the route returns 422 with the error list. Never return a 200 with partial data.
4. **No silent fallbacks.** If a downstream service is down, return 503 with a structured error code. Don't compute what you can with the data you have.
5. **All mutations write audit log.** See Audit Contract below.
6. **env_id scoped.** Every route resolves `env_id` from the request context and passes it to services. RLS enforces isolation at the DB layer; routes enforce it at the application layer.

---

## Audit Contract

Every mutating service path writes one row to `audit_log` in the same transaction as the mutation. The wrapper lives in `services/<module>_audit.py`.

Required fields per audit row:

| Field | Notes |
|---|---|
| `entity_type` | e.g., `nav_snapshot`, `compliance_rule`, `order` |
| `entity_id` | uuid of the affected row |
| `change_type` | `insert` \| `update` \| `delete` \| `release` \| `supersede` \| `void` |
| `previous_state` | jsonb, null on insert |
| `new_state` | jsonb, null on delete |
| `actor` | user id or service identifier (`accounting_engine.calculate_nav`) |
| `reason` | optional free-text from caller |
| `correlation_id` | request id, for tracing |
| `env_id`, `business_id` | always |
| `created_at` | server time |

Rules:

1. **Same transaction.** Audit row is inserted in the same DB transaction as the mutation. No fire-and-forget queues. If the audit insert fails, the whole transaction rolls back.
2. **Append-only.** `audit_log` has no UPDATE or DELETE allowed (DB grants enforce this).
3. **State capture.** `previous_state` is the row pre-mutation, `new_state` is post. For batch updates, one audit row per affected entity.
4. **Releases and supersessions are change_types of their own.** A snapshot moving from `locked → released` writes a `release` audit row. A prior release moving to `superseded` writes a `supersede` audit row with a pointer to the superseding snapshot.

---

## Schema Discipline

Every migration follows the project DB rules from `CLAUDE.md` and `ARCHITECTURE.md`:

1. `CREATE TABLE` followed by `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and a tenant-isolation policy on `env_id = current_setting('app.env_id', true)`.
2. `env_id TEXT NOT NULL`, `business_id UUID NOT NULL` on every user-facing table.
3. File naming: `repo-b/db/schema/NNN_<module>_<purpose>.sql`, sequential.
4. Approved table prefixes only.
5. Named indexes with workload justification in a comment.
6. `COMMENT ON TABLE` for every new table.
7. Monetary values: `NUMERIC(28,8)` for amounts, `NUMERIC(20,10)` for rates.
8. Foreign keys explicit. No JSONB-only relationships for core domain links.
9. Snapshot tables: see `winston-investment-snapshot` for the required column set.

---

## Test Discipline

Every module ships with these test classes minimum:

```
test_<module>.py
  ├── test_<function>_happy_path
  ├── test_<function>_missing_price_returns_invalid
  ├── test_<function>_missing_fx_returns_invalid
  ├── test_<function>_missing_position_returns_invalid
  ├── test_<function>_deterministic           # same inputs → same output 100x
  ├── test_<function>_input_versions_recorded # snapshot inputs are pinned
  └── test_<function>_no_partial_returns      # never returns valid=True with errors

test_<module>_audit.py
  ├── test_mutation_writes_audit_row
  ├── test_audit_captures_previous_and_new_state
  ├── test_audit_failure_rolls_back_mutation
  └── test_audit_log_is_append_only           # UPDATE/DELETE rejected
```

Math-heavy modules (accounting, risk) ALSO ship golden tests with published reference values. A two-asset portfolio with known covariance must reproduce textbook VaR to 6 decimals. Drift from golden is a hard CI failure.

---

## Workflow

When invoked, this skill executes in order:

1. **Locate or draft the per-module plan.** `docs/plans/investment-engine/<wave>-<module>.md`. If missing, hand off to Claude Code planner / `Plan` agent to draft against the relevant ADRs. Do not start coding without a plan.
2. **Locate or draft the load-bearing ADR(s).** If a decision is required and not yet in `docs/adr/investment-engine/`, hand off to `engineering:architecture`.
3. **Schema first.** Migration written, reviewed, applied to local. Schema linter passes. RLS verified.
4. **Service second.** Pure functions, structured response, fail-closed branches covered by tests before next step.
5. **Audit hooks third.** `<module>_audit.py` wraps every mutation path. Audit tests pass.
6. **Routes fourth.** Strict validation, structured errors, env_id scoping. Integration tests against the service.
7. **End-to-end test.** Full happy path from route → service → DB → snapshot → reconstruct. Reproducibility check passes.
8. **Verification gate.** Run the project's `verification/lint/no_legacy_repe_reads.py` and state-lock invariant tests. Both must pass.
9. **Plan & ADR cross-link.** PR description links the plan, the ADR(s), and the test report.

---

## Verification Checklist (paste into PR description)

- [ ] Migration follows all DB rules (RLS, env_id, business_id, named indexes, COMMENT ON TABLE)
- [ ] Service returns the structured `EngineResult` shape on every code path
- [ ] Service is pure — no DB writes inside calculation functions
- [ ] Every fail-closed branch has a unit test asserting `valid=False` + the right error code
- [ ] Determinism test: same inputs produce same output across 100 reruns
- [ ] Snapshot reproducibility (where applicable): `reconstruct(snapshot_id)` returns byte-identical payload
- [ ] Audit row written for every mutation; `previous_state` and `new_state` populated correctly
- [ ] Route validates inputs strictly; rejects unknown fields
- [ ] Route returns 422 with structured errors when service returns `valid=False` — never partial 200
- [ ] Golden tests added for math-heavy modules (accounting, risk)
- [ ] `verification/lint/no_legacy_repe_reads.py` passes
- [ ] State-lock invariant tests pass
- [ ] Per-module plan committed at `docs/plans/investment-engine/<wave>-<module>.md`
- [ ] ADR committed at `docs/adr/investment-engine/NNN-<topic>.md` if any load-bearing decision was made

---

## Anti-Patterns (Reject on Sight)

- A service function that returns `value` and raises on error. Use the structured response.
- A route that returns 200 with `errors: [...]` populated. Either valid or not.
- A migration without RLS.
- A mutation path without an audit hook.
- An "oh, the FX rate is missing, use yesterday's" line of code.
- A function that reads `datetime.now()` inside a calculation. Pass time in.
- A snapshot that lacks `input_versions`.
- A test file under 50 lines for a non-trivial module.
- "I'll add the audit hook in a follow-up PR." Audit is part of the unit, not a future task.
