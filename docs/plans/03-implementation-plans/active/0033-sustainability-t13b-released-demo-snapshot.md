# 0033 - Sustainability T13b: Released Demo Snapshot

- Status: In progress
- Environment: Business OS / Sustainability
- Risk: Medium (seeds demo data; must be idempotent and safe to re-run)
- Scope: One deterministic released snapshot, materialized through the real
  production path, so the live product demonstrates the full governed chain
  with real numbers. One ticket.
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- Depends on: **T13a** (0032, materialization/release path). This ticket
  cannot be built without it.

## Why this is not just a seed script

The constraint is: *do not insert directly into the authoritative output
tables unless that is already the approved materialization path.* T13a built
that path. This ticket **drives** it — `create_snapshot` ->
`persist_metric_values` -> `persist_evidence` ->
`validate_snapshot_for_release` -> `promote_snapshot(released)` — rather than
writing rows behind its back.

## The three cases the snapshot must contain

1. **A valid measured metric** — a real value with evidence.
2. **A legitimate measured zero** — `value = 0`, `null_reason = None`. Must
   render as `0`, not as "unavailable".
3. **An unavailable metric** — `value = None`, `null_reason` set (e.g.
   `emission_factor_missing`). Must render as the reason, never as `0`.

## Scope

1. **Seed module** `backend/app/services/environment_seed_packs_v2/sustainability_demo.py`
   — deterministic source facts; drives the T13a writer end to end.
2. **Idempotent / safe to re-run** — a released snapshot is immutable (T3
   trigger). `seed_sustainability_demo_snapshot()` detects the released row
   and skips. `reseed(force_version=NEW)` mints a **new** `snapshot_version`
   instead of mutating.
3. **Runner** `scripts/seed_sustainability_demo.py` so a demo env can seed
   the snapshot on demand.

Out of scope: reader/report/routes/registry/executor/schema/UI changes;
historical series; production tenant data.

## S1/S2 acceptance is payload-contract in this ticket

This ticket does **not** modify the reader, the routes, the registry, or the
UI (see the regression guard [R1]). `/app/sustainability` renders whatever
`get_authoritative_state` returns — the endpoint is a thin passthrough
(`backend/app/routes/re_sustainability.py`). The screen behavior [S1] and
the evidence drawer contents [S2] are therefore fully determined by the
payload the seeded snapshot produces from that endpoint. In this ticket,
[S1] and [S2] are payload-contract criteria, not runtime-UI criteria:

- [S1] is closed by
  `test_dashboard_payload_carries_header_state_and_evidence_binding`, which
  asserts the exact payload the metric grid consumes — released
  `snapshot_version`, `trust_status == "released"`, valid metric numeric,
  measured zero exactly `0`, unavailable metric `None` + `null_reason`,
  never `0`/`0.0`/`"0"`/`"0.0"`.
- [S2] is closed by the same test, which asserts every evidence row for the
  valid metric binds to the released `snapshot_version` and returns the
  seeded source references the drawer reads.

Live browser verification lands in the post-deploy verify step of the
delivery skill after this bundle merges — it is not gated on this ticket.

## Reconciliation is semantic-equal-after-transport-normalization

The four governed surfaces do **not** share a single wire encoding for
metric values, and that is intentional and pre-existing:

- **Reader**, **report bundle**, and **dashboard payload** emit `Decimal`
  (psycopg's mapping for `NUMERIC`).
- **T10 executor** emits a string via `_format_value` (its public
  `MetricResult.value` is typed `str | None`).

[B1]/[T2] four-way reconciliation therefore compares values after
collapsing both encodings to `Decimal`. `Decimal("0") == 0` is `True`,
so [T4]/[B4] `value == 0` holds on the three surfaces that emit
`Decimal`, and the executor's `"0"` normalizes to `Decimal("0")` for
reconciliation. Any future move of the executor to a numeric wire
contract will collapse these into a single form; nothing in this ticket
depends on that move, and the executor's public contract is out of
scope here.

## Acceptance criteria

See the master plan for the full [S1]–[R2] enumeration; the acceptance
tests carry the id in the docstring beside each assertion.
