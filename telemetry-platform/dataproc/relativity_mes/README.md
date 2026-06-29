# Relativity MES Sandbox — real medallion on Dataproc Serverless (GCP PySpark)

SYNTHETIC build-to-flight MES/ERP/PLM facsimile. This is the **real** medallion that replaced the
cosmetic BigQuery-views version (see ADR 0005). Bronze → silver → gold all run as true Dataproc
Serverless PySpark jobs against BigQuery `novendor-events-prod.relativity_mes`, then sync to the
Lakebase serving tables the dashboards read.

## Why this exists

A read-only audit found the prior BigQuery medallion was cosmetic: silver was 23 views
`SELECT * FROM bronze_rel_* WHERE synthetic IS TRUE` (the filter excluded 0 rows), and gold was
Python-generated literals reading neither silver nor bronze. This rebuild makes silver do real work and
gold derive from silver, so the lineage is genuine and the audit returns *healthy*.

## Flow

```
scripts/relativity_mes_seed (deterministic generator — single source of truth for SOURCE data)
  → load_ugly_bronze.py        land source into BigQuery bronze as ALL-STRING with realistic mess
  → jobs/rel_silver.py         (Dataproc PySpark) cast types, normalize vocab, dedup, quarantine
                               → silver_rel_* (+ silver_rel_*_reject) physical tables in BigQuery
  → jobs/rel_gold.py           (Dataproc PySpark) join/aggregate silver → the 5 gold_rel_* marts
  → sync_serving_from_bq.py    read gold_rel_* from BigQuery → emit idempotent SQL →
                               Lakebase rel_* serving tables, serving_provenance='dataproc-gold'
  → audit_medallion.py         fail-closed gate: healthy verdict + demo invariants, else non-zero exit
  → apply_descriptions.py      set table descriptions on all silver/gold tables (audit found 0)
```

## Run (full rebuild)

Prereqs (one-time): Dataproc APIs enabled; GCS bucket `gs://novendor-rel-mes-dataproc` (US, matches the
US dataset); default compute SA has `roles/editor`. `CLOUDSDK_PYTHON` must point at a real Python (the
bundled bq shim calls a missing `python3.14`): `export CLOUDSDK_PYTHON=/c/Python314/python`.

```bash
# 1) land ugly bronze (local; uses BigQuery client + ADC)
python telemetry-platform/dataproc/relativity_mes/load_ugly_bronze.py

# 2) silver (Dataproc Serverless PySpark)
gcloud storage cp telemetry-platform/dataproc/relativity_mes/jobs/rel_silver.py gs://novendor-rel-mes-dataproc/jobs/
gcloud dataproc batches submit pyspark gs://novendor-rel-mes-dataproc/jobs/rel_silver.py \
  --region=us-central1 --deps-bucket=gs://novendor-rel-mes-dataproc --version=2.2 \
  -- --project novendor-events-prod --dataset relativity_mes --temp_bucket novendor-rel-mes-dataproc

# 3) gold (Dataproc Serverless PySpark) — run after silver
gcloud storage cp telemetry-platform/dataproc/relativity_mes/jobs/rel_gold.py gs://novendor-rel-mes-dataproc/jobs/
gcloud dataproc batches submit pyspark gs://novendor-rel-mes-dataproc/jobs/rel_gold.py \
  --region=us-central1 --deps-bucket=gs://novendor-rel-mes-dataproc --version=2.2 \
  -- --project novendor-events-prod --dataset relativity_mes --temp_bucket novendor-rel-mes-dataproc

# 4) audit gate (must pass before serving)
python telemetry-platform/dataproc/relativity_mes/audit_medallion.py

# 5) sync serving from BigQuery gold → emit SQL
python telemetry-platform/dataproc/relativity_mes/sync_serving_from_bq.py

# 6) apply to Lakebase (mint a short-lived owner credential; tokens expire ~1h)
RID=$(python -c 'import uuid;print(uuid.uuid4())')
TOKEN=$(databricks database generate-database-credential --request-id "$RID" \
  --json '{"instance_names":["novendor-telemetry"]}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
# host: ep-royal-pond-d2wqvv3i.database.us-east-1.cloud.databricks.com / db: databricks_postgres
# apply rel_serving_dataproc_gold.sql with SET app.env_id='telemetry-demo' (RLS) then DELETE+INSERT

# 7) descriptions (idempotent)
python telemetry-platform/dataproc/relativity_mes/apply_descriptions.py
```

## What silver does (per the audit's own checklist)

- **Types** — all-STRING bronze → INT64/DOUBLE/BOOLEAN/DATE/TIMESTAMP via SAFE cast.
- **Vocabulary** — `open/OPEN/opened` → `open`; `MAJ/Major` → `major`; etc. (`VOCAB` in `rel_silver.py`).
  The vocab is test-locked to cover every synonym the uglifier emits (no valid row wrongly quarantined).
- **Dedup** — `row_number()` over the true grain keeps one row per business key.
- **Quarantine** — null business keys, negative durations, out-of-domain statuses, etc. route to
  `silver_rel_*_reject` with `reject_reason`; valid silver excludes them.
- **Crosswalk** — unmatched parts are flagged (`match_status`/`match_confidence`), not dropped.
- **Governance** — `dq_status`, `dq_checked_at` added; source lineage columns preserved.

## Honesty

Everything is SYNTHETIC (`synthetic=true` on every row). Demo invariants are gate-enforced: 3 vehicles,
suspect lot `LOT-7788` on exactly 2 vehicles, 1 open major NCR (`NCR-0001`), ≥1 reconciliation
exception. The audit aborts the serving flip if any invariant or DQ contract breaks.

## Retired

`scripts/relativity_mes_seed/bq_medallion.py` (BigQuery silver views) and
`telemetry-platform/databricks/relativity_mes/rel_medallion.py` (Databricks, warehouse-blocked) are no
longer the serving path. They stay committed as historical artifacts (ADRs 0003/0004).
