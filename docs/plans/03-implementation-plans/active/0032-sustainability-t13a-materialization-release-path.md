# 0032 - Sustainability T13a: Materialization and Release Path

- Status: In progress
- Environment: Business OS / Sustainability
- Risk: Medium (first writer to the authoritative tables; must satisfy the T3 immutability triggers)
- Scope: Build the approved path that materializes and releases a sustainability authoritative snapshot. Production code only. One ticket.
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- ADR: `docs/adr/sustainability/0001-brownfield-extension.md` (decision 5).
- Depends on: T3 schema (0022), T4 reader (0023) - both merged, live.
- Blocks: T13b (the demo snapshot cannot exist without this).

## Why this ticket exists

The demo-snapshot ticket carries a constraint: *do not insert directly into the
authoritative output tables unless that is already the approved materialization
path.* No such path exists. T3 built the tables and T4 built the reader; the
write side was always deferred. This ticket builds the sanctioned writer.

## Scope

New file: `backend/app/services/re_sustainability_snapshot_writer.py`.

Public surface:

1. `create_snapshot(...)` - INSERTs one complete `sus_authoritative_snapshots`
   header in `promotion_state='draft_audit'`. Idempotent on `snapshot_version`.
2. `persist_metric_values(...)` - INSERTs `sus_authoritative_metric_value` rows.
   Enforces the value/null invariant at write time.
3. `persist_evidence(...)` - INSERTs `sus_authoritative_evidence` provenance rows.
4. `validate_snapshot_for_release(...)` - the release gate; raises when unfit.
5. `promote_snapshot(...)` - advances `draft_audit -> verified -> released`.

## Sanctioned acceptance-test update

The existing regression guard
`test_only_authoritative_reader_touches_sus_authoritative_tables` in
`backend/tests/test_sustainability_acceptance.py` allowlisted exactly one
`re_sustainability*` service (`re_sustainability_authoritative.py`, the reader)
as a permitted namer of `sus_authoritative_*` tables. That guard predates the
sanctioned writer.

This ticket extends the allowlist to include the new sanctioned writer
(`re_sustainability_snapshot_writer.py`) and adds positive assertions that the
writer really does the INSERT/UPDATE work the plan calls for. This edit is
expressly permitted by this plan; regression guard R1 is read as "no existing
*production* file is modified" (the second sentence), and the acceptance-test
allowlist update is required to codify the newly approved writer surface.

Out of scope:
- Demo/seed data (T13b).
- Any change to `re_sustainability_authoritative.py` (reader stays read-only).
- Any HTTP endpoint, UI, or scheduled job.
- Computing metric values from source facts (later ticket).
