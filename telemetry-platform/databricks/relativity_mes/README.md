# Relativity MES Sandbox — Databricks medallion (Phase 10)

SYNTHETIC build-to-flight MES/ERP/PLM facsimile (shaped like a Manufacturo MES + a generic ERP/PLM).
Not real Relativity data, not a real schema, not a real API. Same data-product architecture as the
telemetry domain, new domain (`rel_*`).

## Flow

```
scripts/relativity_mes_seed (deterministic generator, fixed master seed)
  → rel_bronze_load.sql        bronze landing of the raw synthetic source
  → rel_medallion.py           bronze → silver (CTAS conform) → gold (5 marts as Delta) in
                               novendor_1.relativity_mes, validated from silver/gold, then a
                               read-back sync that emits rel_serving_databricks_gold.sql
  → rel_serving_databricks_gold.sql   load Postgres/Lakebase serving tables (serving_provenance=
                                      'databricks-gold'); apply with repo-b/db/schema/apply.js
```

The Postgres/Lakebase serving migrations (`repo-b/db/schema/10037`, `10038`) bootstrap the serving
tables (`serving_provenance='seed-bootstrap'`) so the FastAPI routes + dashboards work before any
Databricks run; this medallion flips them to `databricks-gold` once it has run and validated.

## Run

```
# 1) build the medallion in Databricks + emit the serving sync (needs DATABRICKS_PAT / claude_token.txt)
python telemetry-platform/databricks/relativity_mes/rel_medallion.py

# 2) apply the emitted serving sync to Lakebase as the owner (mint a short-lived credential)
#    DATABASE_URL=postgresql://<email>:<token>@<lakebase-host>/databricks_postgres?sslmode=require
node repo-b/db/schema/apply.js --files rel_serving_databricks_gold.sql
```

## Validation (independent, from silver/gold)

`rel_medallion.py` asserts, from the Databricks layers themselves: 3 vehicles, the suspect lot
installed on exactly two vehicles, an open major NCR, and a reconciliation exception. The run aborts
(leaving serving on the bootstrap) if any invariant fails — the demo never serves wrong data.

## Run status (2026-06-26)

The medallion code is complete and runnable. The live run in this session is **blocked by a
platform-side Databricks issue**: the workspace serverless SQL warehouse (`0e56420fb707d861`) reports
`health=FAILED — "Clusters are failing to launch"` and never reaches `RUNNING` (OAuth auth itself
works). This is the documented "pause" condition (a Databricks failure needing manual platform
action), not a code defect.

Per the approved fallback, the Postgres/Lakebase **serving tables are loaded via the proven serving
route** (`repo-b/db/schema/10037`+`10038`, applied to the `novendor-telemetry` Lakebase) — real
Lakebase serving rows, **never local JSON**. `serving_provenance` is `seed-bootstrap`. Re-run
`rel_medallion.py` once the warehouse is healthy to materialize bronze/silver/gold in Databricks and
flip serving to `databricks-gold`.

## Honesty

Every row carries `synthetic=true`. Tables are named `rel_mes_*` / `rel_erp_*` / `rel_plm_*` /
`gold_rel_*`. No real Relativity/Manufacturo identifier appears in any data row (enforced by
`backend/tests/test_relativity_mes_seed.py`).
