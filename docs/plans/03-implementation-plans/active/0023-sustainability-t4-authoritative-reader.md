# 0023 - Sustainability T4: Authoritative Reader Service

- Status: Done (2026-07-10) - relay authored service+test; MAX_ITER only because the relay ran the full backend suite which times out (1800s), not a code fault. Targeted test (4 passed) + ruff + repe-lint green; verified by hand. Stray run_checks.* removed.
- Environment: Business OS / Sustainability
- Risk: Medium (new backend service; read-only)
- Scope: Add the single governed reader for sustainability authoritative metrics. One ticket (T4 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- Depends on: T3 (schema `618_sus_authoritative.sql`, merged + applied). ADR 0001 decision 5.

## Background

T4 from plan 0018: add `backend/app/services/re_sustainability_authoritative.py` mirroring `backend/app/services/re_authoritative_snapshots.py`, with a single `get_authoritative_state` entry point. Every sustainability metric read goes through this reader (the single-fetch-layer principle from the authoritative-state contract). It reads the T3 tables `sus_authoritative_snapshots` / `sus_authoritative_metric_value` / `sus_authoritative_evidence`.

The contract to mirror is `re_authoritative_snapshots.get_authoritative_state`, whose released-read return dict carries: `entity_*`, `requested_*`, `period_exact`, `state_origin`, `snapshot_version`, `promotion_state`, `trust_status`, `null_reason` (None when found), a `state` block with `canonical_metrics`/`display_metrics`, plus `null_reasons`, `formulas`, `provenance`. When no released row exists it returns a missing-state dict with a `null_reason`.

Fail-closed vocabulary is already defined (T2, merged): `snapshot_unavailable`, `data_not_ingested`, `emission_factor_missing`, `metric_definition_missing`, `out_of_certified_scope`.

## Scope

In scope: create `backend/app/services/re_sustainability_authoritative.py` with:
- A single public entry point `get_authoritative_state(*, business_id, env_id, entity_scope, period_key, metric_family, snapshot_version=None) -> dict[str, Any]`.
- It selects the latest matching row from `sus_authoritative_snapshots`, defaulting to `promotion_state = 'released'` when no explicit `snapshot_version` is given (mirroring the REPE reader's released-default behavior). It reads via `app.db.get_cursor` like the sibling sustainability services.
- On a hit it returns a dict mirroring the REPE reader's shape: `entity_scope`, `period_key`, `requested_period_key`, `period_exact`, `state_origin: "authoritative"`, `snapshot_version`, `promotion_state`, `trust_status`, `null_reason: None`, a `metrics` list built from `sus_authoritative_metric_value` (each item: `metric_key`, `value` (numeric or None), `unit`, `null_reason`, `trust_status`), and an `evidence` list built from `sus_authoritative_evidence` (each: `metric_key`, `source_table`, `source_row_ref`, `emission_factor_set_id`, `ingestion_run_id`, `formula_id`).
- On a miss it returns `{... null_reason: "snapshot_unavailable", metrics: [], evidence: [], state_origin: "authoritative", trust_status: "missing_source"}` - never raises, never fabricates.
- Fail-closed rule: a metric value row whose `value_numeric` is NULL is returned with `value: None` and its stored `null_reason`; the reader never substitutes zero for a missing value.
- A helper `get_metric(*, business_id, env_id, entity_scope, period_key, metric_family, metric_key, snapshot_version=None) -> dict` that returns a single metric's `{value, unit, null_reason, trust_status, snapshot_version, state_origin}`, returning `null_reason: "metric_definition_missing"` when the metric_key is absent from the released snapshot's value rows.

Out of scope (explicit):
- Any route/endpoint (T5), UI (T7), metric-registry entry (T6), AI wiring (T10), or intake/write path.
- Any change to the schema, to `re_authoritative_snapshots.py`, or to any existing service.
- Writing/releasing snapshots (a later ticket owns the write side).

## Acceptance Criteria

### Screen
Not applicable.

### API
- Not applicable in this ticket (no route). The service is importable and callable: `from app.services import re_sustainability_authoritative` exposes `get_authoritative_state` and `get_metric`.

### DB/Data
- The reader queries `sus_authoritative_snapshots`, `sus_authoritative_metric_value`, and `sus_authoritative_evidence` and defaults to `promotion_state = 'released'` when no `snapshot_version` is supplied. It performs no writes (SELECT only).

### AI behavior
- Fail-closed is enforced in the reader: a missing released snapshot yields `null_reason: "snapshot_unavailable"`; a NULL metric value yields `value: None` plus its `null_reason` (never 0); an absent metric_key in `get_metric` yields `null_reason: "metric_definition_missing"`. No path returns a fabricated number.

### Evals/tests
- A new test file `backend/tests/test_re_sustainability_authoritative.py` covers, with `get_cursor` monkeypatched to a fake cursor returning canned rows (no real DB): (1) a released snapshot returns `state_origin: "authoritative"`, `trust_status`, and the metric list; (2) no released row returns `null_reason: "snapshot_unavailable"` with empty `metrics` and no exception; (3) a metric value row with NULL `value_numeric` returns `value: None` and its `null_reason`, never 0; (4) `get_metric` for an unknown key returns `null_reason: "metric_definition_missing"`.
- `cd backend && python -m ruff check app tests` and `python -m pytest tests/test_re_sustainability_authoritative.py -q` pass.

### Regression guard
- Only `backend/app/services/re_sustainability_authoritative.py`, `backend/tests/test_re_sustainability_authoritative.py`, and this plan are added/changed. No existing service, route, schema, or frontend file is modified.
- The reader is read-only: the diff contains no INSERT/UPDATE/DELETE against the `sus_authoritative_*` tables.
