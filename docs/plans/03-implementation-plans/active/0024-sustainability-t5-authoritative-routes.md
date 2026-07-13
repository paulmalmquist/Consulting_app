# 0024 - Sustainability T5: Read-Only Authoritative Routes

- Status: Done (2026-07-10) - relay authored 4 additive endpoints + schemas + test; BLOCKED only for missing in-bundle test evidence (ran --no-tests to dodge the full-suite timeout). ruff + targeted route test (6 passed) green by hand; CI runs the real suite.
- Environment: Business OS / Sustainability
- Risk: Medium (new read-only endpoints on an existing router)
- Scope: Expose the T4 governed reader over HTTP as read-only endpoints. One ticket (T5 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- Depends on: T4 (`re_sustainability_authoritative.get_authoritative_state` / `get_metric`, merged).

## Background

T5 from plan 0018: extend `backend/app/routes/re_sustainability.py` with governed read endpoints wired to the T4 reader. The existing router already mounts `/overview`, `/assets/{id}/dashboard`, footprint, utility, certification, etc. at prefix `/api/re/v2/sustainability`. `/overview` already exists (the legacy REPE-embedded one), so the governed endpoints are added under an `/authoritative/*` sub-path to avoid collision and to keep the governed layer cleanly separated from the legacy routes (consistent with ADR 0001's standalone-env decision).

## Scope

In scope:
- Add four read-only endpoints to `backend/app/routes/re_sustainability.py`, all under the existing router prefix:
  - `GET /authoritative/overview` - query params `business_id`, `env_id`, `entity_scope`, `period_key`, `metric_family`, optional `snapshot_version`; returns `re_sustainability_authoritative.get_authoritative_state(...)`.
  - `GET /authoritative/metric/{metric_key}` - same scope params; returns `get_metric(...)` for that key.
  - `GET /authoritative/metric/{metric_key}/evidence` - same scope params; returns the `evidence` list from `get_authoritative_state(...)` filtered to that `metric_key` (empty list when the snapshot is unavailable; still 200, not an error).
  - `GET /authoritative/context` - same scope params; returns a compact AI-grounding block: `{ scope, period_key, snapshot_version, trust_status, null_reason, metrics: [{metric_key, value, unit, null_reason}] }` derived from the reader. This is the shape the AI copilot (T10) will consume.
- Add Pydantic response models in a NEW file `backend/app/schemas/re_sustainability_authoritative.py` (do not edit the existing `re_sustainability.py` schemas). Models: `SusAuthoritativeStateResponse`, `SusAuthoritativeMetricResponse`, `SusAuthoritativeEvidenceResponse`, `SusAuthoritativeContextResponse`. Fields may be permissive (Optional) since the reader is fail-closed.
- Reuse the existing `_to_http` error mapping in the route module.

Out of scope (explicit):
- Any write/intake endpoint, UI (T7), metric-registry seed (T6), AI wiring (T10).
- Editing the T4 reader, the schema, or any existing endpoint/handler (only ADD new endpoints + a new schemas file).
- Renaming or touching the existing `/overview` route.

## Acceptance Criteria

### Screen
Not applicable.

### API
- Four new endpoints exist on the sustainability router, all under `/api/re/v2/sustainability/authoritative/...`: `GET /authoritative/overview`, `GET /authoritative/metric/{metric_key}`, `GET /authoritative/metric/{metric_key}/evidence`, `GET /authoritative/context`.
- Each delegates to `backend/app/services/re_sustainability_authoritative` (`get_authoritative_state` / `get_metric`) and returns its result; none computes metrics itself.
- The existing `/overview` and all other existing endpoints are unchanged (no signature or path change).

### DB/Data
- Endpoints are read-only (they call the read-only T4 reader; no writes).

### AI behavior
- `GET /authoritative/context` returns a block the AI copilot can ground on: it surfaces `snapshot_version`, `trust_status`, `null_reason`, and per-metric `value`/`null_reason`, so an unavailable snapshot or a null metric is visible rather than fabricated. When the snapshot is unavailable the endpoints return the fail-closed reader payload (200 with `null_reason`), not a 5xx.

### Evals/tests
- A new test file `backend/tests/test_re_sustainability_authoritative_routes.py` uses the FastAPI test client and monkeypatches `re_sustainability_authoritative.get_authoritative_state` / `get_metric` (no DB) to assert: (1) `/authoritative/overview` returns 200 with the reader payload; (2) `/authoritative/metric/{key}` returns the single-metric shape; (3) `/authoritative/metric/{key}/evidence` returns a list and 200 even when the reader reports `snapshot_unavailable`; (4) `/authoritative/context` includes `snapshot_version`, `trust_status`, and a `metrics` list.
- `cd backend && python -m ruff check app tests` and `python -m pytest tests/test_re_sustainability_authoritative_routes.py -q` pass. (The full suite is validated by CI's Backend Lint job.)

### Regression guard
- Only `backend/app/routes/re_sustainability.py` (additive: new endpoints + import), `backend/app/schemas/re_sustainability_authoritative.py` (new), `backend/tests/test_re_sustainability_authoritative_routes.py` (new), and this plan are changed.
- No existing endpoint, the T4 reader, the schema file `re_sustainability.py`, or any frontend file is modified.
