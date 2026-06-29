# ADR 0005 — Real medallion on Dataproc Serverless PySpark (supersedes the cosmetic BigQuery views)

- Status: Accepted
- Date: 2026-06-27
- Deciders: Paul Malmquist
- Supersedes: [0004](0004-bigquery-medallion-gcp-fallback.md) (BigQuery medallion with silver views)
- Related: [0002](0002-real-serving-architecture-not-fixtures.md),
  [0003](0003-medallion-and-rel-prefix.md)

## Context

ADR 0004 stood up the medallion on BigQuery to escape the Databricks warehouse capacity failure. But a
read-only audit of `novendor-events-prod.relativity_mes` found that medallion was **cosmetic**: all 23
`silver_rel_*` were views defined `SELECT * FROM bronze_rel_* WHERE synthetic IS TRUE` — a filter that
excluded zero rows (every bronze row was already `synthetic=true`), added no columns, and did no
casting, dedup, normalization, or quarantine. The five `gold_*` marts were Python-generated literals
that read neither silver nor bronze. Bronze, silver, and gold were three views/copies of one generator
output; the medallion lineage was decorative. For a Director of Data & AI audience, "what does your
silver layer do?" had no defensible answer.

## Decision

Replace the cosmetic BigQuery views with a **real medallion built by Dataproc Serverless PySpark**
(true GCP Spark; reads/writes BigQuery via the Spark-BigQuery connector). Everything but bronze is on
the chopping block; bronze is deliberately made *uglier* so silver has visible work.

- **Bronze is a realistic raw landing.** `load_ugly_bronze.py` lands the deterministic generator output
  into BigQuery bronze as **all-STRING** tables with injected, seeded mess: mixed-case + synonym status
  codes, string-typed dates/numbers, duplicate event rows, a null business key, a negative-duration
  row, unit-drifted numerics, and one unmatched crosswalk part. The five demo invariants' rows are
  protected from corruption so they survive into silver.
- **Silver conforms (`jobs/rel_silver.py`).** SAFE-cast to real types; normalize controlled vocabularies
  (status / severity / result / disposition / wo-status) to canonical values; dedup on the true grain
  (`exec_id`, unique genealogy edge, …); **quarantine** DQ failures into `silver_rel_*_reject` with a
  `reject_reason`; add governance columns (`dq_status`, `dq_checked_at`). Silver now has strictly more
  columns than bronze and strictly cleaner data.
- **Gold derives from silver (`jobs/rel_gold.py`).** The five marts are real Spark joins/aggregations
  over `silver_rel_*` (labor @ $95/hr, 18% overhead, the two NCR rework costs, variance categories, the
  25% reconciliation-exception threshold) — not literals. Lineage bronze → silver → gold is real and
  inspectable.
- **Serving (`sync_serving_from_bq.py`).** Reads `gold_rel_*` from BigQuery and reloads the Lakebase
  `rel_*` serving tables with **`serving_provenance='dataproc-gold'`** (idempotent DELETE+INSERT per
  `ingest_batch_id`). The frontend treats `dataproc-gold` as the live BigQuery/Dataproc path on the
  Lineage page.
- **Fail-closed gate (`audit_medallion.py`).** Re-runs the original audit checks (now expecting
  *healthy*) plus the demo invariants and exits non-zero on any failure, so a broken medallion is never
  promoted to serving.

The deterministic generator remains the single source of truth for the *source* data (ADR 0002); the
difference from 0004 is that silver and gold are now genuinely *computed from* bronze by Spark, not
re-emitted from the generator.

## Alternatives considered

- Keep the BigQuery views, relabel them honestly — rejected: the demo needs a real conform layer, not a
  better caption on a no-op.
- Do the real transforms in Databricks PySpark — rejected: still blocked on the warehouse capacity
  failure that motivated 0004, and the stated preference was PySpark on GCP.
- Inject mess into the generator itself — rejected: the generator is test-locked and feeds the Lakebase
  source migrations; a separate ugly-bronze loader keeps the clean contract intact while making bronze
  realistically dirty.

## Consequences

The medallion is now defensible end to end: silver casts/normalizes/dedups/quarantines (with populated
reject sinks), gold derives from silver, and the audit returns *healthy*. Runtime is Dataproc
Serverless (no cluster to provision); jobs live under `telemetry-platform/dataproc/relativity_mes/`.
The Databricks medallion (`rel_medallion.py`) and the BigQuery-views builder (`bq_medallion.py`) are
retired as the serving path but stay committed as historical artifacts. `serving_provenance` vocabulary
is now `seed-bootstrap` (pre-medallion) → `dataproc-gold` (current) with `databricks-gold` reserved.
ML on the silver/gold marts (Vertex, like `mlops_learning_lab`) is the natural next step.
