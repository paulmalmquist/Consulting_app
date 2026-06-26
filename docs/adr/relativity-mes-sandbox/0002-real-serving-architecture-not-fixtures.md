# ADR 0002 — Real serving architecture (Databricks → Lakebase → API), not local fixtures

- Status: Accepted
- Date: 2026-06-26
- Deciders: Paul Malmquist
- Supersedes: an earlier fixture-first draft of this sandbox
- Related: [0001](0001-synthetic-only-no-real-relativity-data.md),
  [0003](0003-medallion-and-rel-prefix.md)

## Context

The Relativity MES Sandbox exists to prove our **data-product architecture** absorbs a new
operational domain — not to ship a toy. The telemetry domain already runs the proven pattern:
synthetic/real source → Databricks medallion → Postgres/Lakebase serving tables → FastAPI → Next.js.
A local-JSON-fixture render path would undercut the entire point (that the operating model maps to
their world through the same serving stack).

## Decision

Phase 10 runs on the same serving architecture, scoped to the `rel_*` domain:

- Frontend dashboards call the FastAPI routes (`/api/telemetry/relativity-mes/*`) via `apiFetch`.
  They never import seed data directly.
- The backend reads **Lakebase serving tables** (`rel_build_overview`, `rel_as_built_genealogy`,
  `rel_ncr_traceability`, `rel_build_cost_rollup`, `rel_mes_erp_reconciliation`,
  `rel_source_lineage_manifest`) plus the `rel_*` source tables for drill-to-source, via
  `get_telemetry_cursor()`.
- **No fabricated fallback.** An empty or missing serving table returns a `null_reason` (fail-closed);
  the backend never invents rows.
- Serving tables are populated by the deterministic generator's bootstrap load
  (`serving_provenance='seed-bootstrap'`) so the demo is never empty, and the Databricks medallion
  backfill overwrites them with Databricks-computed gold (`serving_provenance='databricks-gold'`). The
  source-kind chip reports the actual provenance — both are real Lakebase rows, never local JSON.

Local fixtures are used only if a true credential/tooling failure blocks the real path; that did not
occur (Databricks CLI authenticated, Lakebase `novendor-telemetry` AVAILABLE, migrations applied).

## Alternatives considered

- Fixture-first frontend (commit JSON, render directly) — rejected: it would not prove the serving
  architecture and contradicts the telemetry pattern.
- Backend serving a committed fixture when Lakebase is cold — rejected: the backend must fail closed,
  not fabricate. The bootstrap load lives in Lakebase, so "cold" means a real outage, which should
  read as unavailable.

## Consequences

The dashboards depend on the backend + Lakebase being reachable (acceptable: prod posture). Tests use
`FakeCursor` (no DB) and assert both the populated and fail-closed (`null_reason`) paths. Parity
between bootstrap and Databricks gold is guaranteed by deriving both from the same generator;
`serving_provenance` makes the active source honest on the Lineage dashboard.
