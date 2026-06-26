# ADR 0003 — Medallion layout and the `rel_` prefix

- Status: Accepted
- Date: 2026-06-26
- Deciders: Paul Malmquist
- Related: [0001](0001-synthetic-only-no-real-relativity-data.md),
  [0002](0002-real-serving-architecture-not-fixtures.md), `ARCHITECTURE.md`

## Context

The sandbox needs a table namespace that (a) is clearly its own domain, distinct from telemetry
`tel_*` and RS Factory `rsf_*`, (b) passes the repo's approved-prefix guardrail, and (c) supports a
Bronze/Silver/Gold medallion plus a Postgres/Lakebase serving layer.

## Decision

- New approved prefix **`rel_`** (registered in `ARCHITECTURE.md`). Source tables: `rel_mes_*`,
  `rel_erp_*`, `rel_plm_*`, `rel_xwalk_*`. Flat serving marts: `rel_build_overview`,
  `rel_as_built_genealogy`, `rel_ncr_traceability`, `rel_build_cost_rollup`,
  `rel_mes_erp_reconciliation`, `rel_source_lineage_manifest`. All are tenant-scoped
  (`env_id`/`business_id`) with RLS and the honesty columns (`synthetic, source_system, source_table,
  source_pk, ingest_batch_id, as_of`).
- **Medallion in Databricks** (`novendor_1.relativity_mes`): `bronze_rel_*` → `silver_rel_*` →
  `gold_rel_*`. The Postgres/Lakebase serving tables are the synced/loaded copy of `gold_rel_*`.
- Unlike `rsf_` (raw stays in generator artifacts, only curated/gold loaded to Postgres), the `rel_*`
  **raw source tables are loaded into Postgres on purpose**: the "every number drills to source rows"
  requirement needs the raw rows queryable. The dataset is small (a few hundred rows), so this is
  cheap.
- Do not reuse or mutate any `tel_*` table as MES data; the domains are separate.

## Alternatives considered

- Reuse `rsf_` — rejected: different shape (full source tables in Postgres) and different demo intent
  (build-to-flight MES/ERP/PLM facsimile vs the existing RS Factory digital thread).
- Postgres `gold` schema for the serving marts — rejected in favor of flat `rel_*` serving tables so
  the backend serving contract matches the user's specified serving-table names; the `gold` layer
  lives in Databricks (`gold_rel_*`).

## Consequences

`ARCHITECTURE.md` lists `rel_` and the Databricks medallion. Migrations `10037`/`10038` create and
seed the Postgres side; the Databricks notebooks under `telemetry-platform/databricks/relativity_mes/`
build the medallion and backfill serving.
