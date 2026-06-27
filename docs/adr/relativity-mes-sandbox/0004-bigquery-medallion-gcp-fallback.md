# ADR 0004 — BigQuery medallion (GCP) as the serverless fallback for Databricks

> **Superseded by [0005](0005-dataproc-pyspark-real-medallion.md) (2026-06-27).** The silver layer
> described here was a set of `SELECT * ... WHERE synthetic IS TRUE` views (a no-op filter) and gold
> was Python-generated literals — a cosmetic medallion. ADR 0005 replaces it with real Dataproc
> Serverless PySpark transforms (typed/normalized/deduped/quarantined silver; gold derived from silver)
> and flips serving provenance from `bigquery-gold` to `dataproc-gold`. Read 0005 for the current path.

- Status: Superseded by 0005
- Date: 2026-06-27
- Deciders: Paul Malmquist
- Related: [0002](0002-real-serving-architecture-not-fixtures.md),
  [0003](0003-medallion-and-rel-prefix.md)

## Context

The Databricks medallion (`rel_medallion.py`) is blocked: the workspace serverless **SQL warehouse**
fails to launch clusters (`RESOURCE_EXHAUSTED: Cannot create the resource`) — an account-level
serverless capacity/billing condition, not a code defect. We need the medallion + ML to run on GCP
"in case Databricks can't be made to work." GCP already hosts a working MLOps pattern
(`novendor-events-prod.mlops_learning_lab` BQ dataset + 3 Vertex models), so this is an extension,
not greenfield.

## Decision

Replicate the medallion on **BigQuery**, which is **serverless query** — there is no warehouse/cluster
to provision, so the `RESOURCE_EXHAUSTED` failure mode does not exist.

- `scripts/relativity_mes_seed/bq_medallion.py` builds dataset `novendor-events-prod.relativity_mes`:
  `bronze_rel_*` (raw synthetic source, loaded from the deterministic generator), `silver_rel_*`
  (conformed views, synthetic-only contract), `gold_<mart>` (the five gold marts). It validates the
  demo invariants **in BigQuery** (3 vehicles, suspect lot on exactly two vehicles, an open major NCR,
  a reconciliation exception) and aborts if any fails.
- Because the BigQuery gold tables genuinely exist, the **Lineage page links to them live** (via
  `relativityMesBigquery.ts`), beside the Databricks links which stay **fail-closed** (Databricks gold
  is not materialized). Honesty rule unchanged: a link is live only when its target exists.
- **Serving reloaded from BigQuery (done).** The Lakebase `rel_*` serving tables were genuinely
  reloaded *from* the BigQuery gold marts (read `gold_*`, transactional DELETE+INSERT per table) and
  now report `serving_provenance='bigquery-gold'`. Verified in prod: `/overview` → `bigquery-gold`,
  all five serving marts `bigquery-gold`, invariants intact (VEH-DEMO-001 blocked, `LOT-7788` → 2
  vehicles). The live dashboards now serve from the GCP/BigQuery medallion; the Lineage page's path
  text + serving panel reflect it. `servingLabel()` renders "synthetic BigQuery Gold serving rows".

The deterministic generator remains the single source of truth (see ADR 0002), so the BigQuery gold,
the Databricks gold (when it runs), and the Lakebase serving rows are byte-identical by construction.

## Alternatives considered

- Wait for the Databricks warehouse to recover — rejected as the only path; capacity is out of our
  control and the demo needs a working GCP medallion now.
- Move backend compute to GCP (Cloud Run) — explicitly out of scope; backend stays on Railway.

## Consequences

The medallion + serving story now runs on GCP without any cluster to provision. ML (rel_-specific
NCR/cost models on Vertex, like the existing `mlops_learning_lab` models) is the natural next step.
The Databricks medallion code stays committed and runnable for when serverless capacity returns.
