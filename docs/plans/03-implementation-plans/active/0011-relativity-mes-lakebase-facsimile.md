# 0011 — Relativity MES/Lakebase Facsimile (Phase 10)

- **ADO:** Relativity MES Sandbox (Phase 10) — telemetry environment
- **Status:** Active (build). Phase 9 demo/talk-track polish runs separately and is not blocked by this.
- **Environment / route base:** `telemetry` env, `/lab/env/[envId]/telemetry/relativity-mes…`
- **Owning surface:** `repo-b/src/components/telemetry/relativity-mes/`,
  `repo-b/src/app/lab/env/[envId]/telemetry/relativity-mes/`, `backend/app/routes/relativity_mes.py`,
  `backend/app/services/relativity_mes.py`, `repo-b/db/schema/10037–10038`, `scripts/relativity_mes_seed/`.

## Problem / intent

The live telemetry demo proves the *operating model* (governed data products: source-kind honesty,
drill-to-source, exports, fail-closed nulls). It does not yet prove that model maps to Relativity's
world — an aerospace MES/ERP/PLM environment with build-to-flight genealogy, NCR propagation, and
MES→ERP cost reconciliation. Phase 10 builds a **synthetic, clearly-labeled** MES/ERP/PLM facsimile
(*shaped like* Manufacturo + a generic ERP/PLM) as five analytical dashboards in a new **Relativity
MES Sandbox** nav section, reusing the existing telemetry primitives. Every number drills to source
rows or shows a `null_reason`.

## Honesty framing (enforced in copy + tests)

Synthetic only. Approved language: "shaped like Manufacturo", "generic ERP/PLM facsimile", "synthetic
source-system model", "build-to-flight data product", "every number traces to source". Forbidden:
"Relativity's schema", "Manufacturo API implementation", "real Relativity data", "certified AS9100
evidence", "production-ready". A "synthetic" label is visible above the fold on every dashboard. A
seed test (`backend/tests/test_relativity_mes_seed.py::test_no_real_identifiers_in_data_rows`) fails
if any real Relativity/Manufacturo identifier leaks into a data row.

## Architecture — the proven serving path (NOT local fixtures)

Same architecture as telemetry, new domain: synthetic source → Databricks medallion → Postgres/
Lakebase serving tables → FastAPI → Next.js dashboards. No local-JSON render path.

1. **Source** — `scripts/relativity_mes_seed/` (deterministic, fixed master seed) builds the synthetic
   MES/ERP/PLM source and emits: the Postgres source migration `10037` (`rel_*` source tables, RLS,
   seeded — these power "drill to source rows" with real serving rows); the Postgres serving migration
   `10038` (flat `rel_*` serving marts + `rel_source_lineage_manifest`, RLS, **bootstrap** load of the
   computed gold, `serving_provenance='seed-bootstrap'`); and the Databricks bronze-load SQL
   (`telemetry-platform/databricks/relativity_mes/rel_bronze_load.sql`).
2. **Databricks medallion** — `novendor_1.relativity_mes`: `bronze_rel_*` (land source) → `silver_rel_*`
   (conform + crosswalk) → `gold_rel_*` (compute the five marts). A backfill step reads Databricks gold
   and overwrites the Lakebase serving tables (`serving_provenance='databricks-gold'`).
3. **Serving** — Lakebase Postgres (`novendor-telemetry`) holds the `rel_*` serving + source tables;
   the backend reads them via `get_telemetry_cursor()`. The bootstrap load guarantees the serving
   tables are populated even before a Databricks run; the Databricks backfill replaces them with
   Databricks-derived rows. Either way the rows are **real Lakebase serving rows, never local JSON**.
4. **Backend** — `/api/telemetry/relativity-mes/*` reads the serving tables. No fabricated fallback:
   an empty/missing serving table returns a `null_reason` (fail-closed). Source-kind reflects the
   serving rows' `serving_provenance` (`live-rows`).
5. **Frontend** — dashboards call the backend APIs via `apiFetch`; they never import seed data. Each
   shows the source-kind strip, drills to source rows, exports the filtered view, and fails closed.

`telemetry_app` (the backend role, BYPASSRLS) is granted SELECT on every `rel_*` table by `10038`
(owner-created tables are not covered by default privileges — verified on Lakebase).

## Data model

Source tables (RLS + `env_id`/`business_id` + honesty columns `synthetic, source_system,
source_table, source_pk, ingest_batch_id, as_of`): `rel_mes_vehicle, rel_mes_part, rel_mes_lot,
rel_mes_unit, rel_mes_work_order, rel_mes_operation_execution, rel_mes_as_built_genealogy,
rel_mes_material_consumption, rel_mes_inspection_order, rel_mes_nonconformance, rel_mes_disposition,
rel_erp_material_master, rel_erp_production_order, rel_erp_prod_order_cost, rel_erp_cost_variance,
rel_erp_labor_actual, rel_plm_part, rel_plm_ebom, rel_plm_ebom_line, rel_xwalk_part_identity`.

Gold marts: `gold.rel_build_overview`, `gold.rel_as_built_genealogy`, `gold.rel_ncr_traceability`,
`gold.rel_build_cost_rollup`, `gold.rel_mes_erp_reconciliation`. Column contracts: see the generator
and the committed fixtures. Join keys: part identity (`plm_part_no ↔ mes_part_no/product_code ↔
erp_material_id` via `rel_xwalk_part_identity`), order (`prod_order_no ↔ mfg_order_no`), lot, unit
serial (genealogy), NCR impact.

## Seed scope (deterministic guarantees, test-locked)

3 vehicles `VEH-DEMO-001/002/003` of `LV-DEMO-R`; 6 subassembly families; mixed serialized/lot-tracked
parts; **one suspect lot (`LOT-7788`) installed on exactly two vehicles**; the targeted NCRs
(`NCR-0001` open/major on the suspect lot → where-used = 2 vehicles; `NCR-0002` closed rework;
`NCR-0003` use-as-is); a real cost variance with `exception` rows; vehicle `VEH-DEMO-001` reads
`blocked` (open NCR). All rows `synthetic=true`; no real Relativity identifiers.

## Dashboards (Relativity MES Sandbox nav section, distinct accent)

1. **Build Overview** (`/relativity-mes`) — vehicle KPIs + per-vehicle summary table; deep-links to
   Genealogy / NCR / Cost filtered by vehicle.
2. **Build Genealogy** (`/relativity-mes/genealogy`) — vehicle selector → as-built tree → node drawer →
   open-NCR panel → suspect-lot where-used → source lineage strip.
3. **NCR Traceability** (`/relativity-mes/ncr`) — NCRs tied to vehicles/lots/operations/cost; defect
   clusters; vehicle impact; where-used.
4. **Cost Reconciliation** (`/relativity-mes/cost`) — MES actuals vs ERP standard/variance by category;
   waterfall; reconciliation exceptions; drills to MES + ERP source rows.
5. **Lineage & Source Tables** (`/relativity-mes/lineage`) — source-table registry, join-key map, gold
   marts, dashboard→source matrix, seed freshness, live Lakebase serving proof.

## Reuse

`telemetryNav.ts` (+ `TelemetrySidebar` accent), `TelemetryShell`, `TelemetryPageHeader`,
`primitives.tsx` (`MetricCard/Stat/MetricRow/Panel/EmptyState/Tag/SelectField/SectionTabButton/…`),
`drawerPrimitives.tsx` (`MetricInspectorDrawer/DrawerWrapper/FieldRow`), `evidenceCard.tsx`
(source chips), `drill/` (`SourceRowsTable`, `ExportToCsvButton`, `SOURCE_KIND_*`), `@/lib/api`
`apiFetch`, `@/lib/telemetry/api` demo identifiers. Backend mirrors `telemetry_factory`/`db.py`
(`get_telemetry_cursor`) and the `conftest.FakeCursor` test pattern.

## Acceptance

Each dashboard answers its primary questions; every card drills to source rows or a `null_reason`;
CSV export reflects the filtered view; synthetic label above the fold; the suspect lot shows on two
vehicles; the Lineage page proves the live Lakebase path. Green: `npm run typecheck`, `npm run lint`,
`npm test` (new + frozen telemetry suites), `pytest backend/tests/test_relativity_mes*` and the
existing telemetry tests. No `tel_*` table is reused as MES data.

## Databricks medallion run status

The medallion (`telemetry-platform/databricks/relativity_mes/rel_medallion.py` + `rel_bronze_load.sql`)
is complete and runnable (bronze → silver CTAS → gold Delta → independent invariant validation →
read-back serving sync). The live run is currently **blocked platform-side**: the workspace serverless
SQL warehouse reports `health=FAILED — "Clusters are failing to launch"` (OAuth auth works). Per the
approved fallback, serving is loaded via the proven Postgres/Lakebase route (`10037`/`10038`, applied)
— real Lakebase rows, `serving_provenance='seed-bootstrap'`, never local JSON. Re-running the medallion
when the warehouse is healthy flips serving to `databricks-gold`.

## Ticket — Real medallion on Dataproc Serverless (GCP PySpark), BigQuery as serving source (2026-06-27)

**Why:** A read-only audit of the BigQuery `novendor-events-prod.relativity_mes` dataset found a
**cosmetic medallion**: all 23 `silver_rel_*` are views `SELECT * FROM bronze_rel_* WHERE synthetic IS
TRUE` (the filter excludes 0 rows — every bronze row is already synthetic), 0 columns added, identical
counts/types; the 5 `gold_rel_*` are Python-generated literals that read neither silver nor bronze. The
BQ dataset is also an **orphan** — nothing in the repo reads or writes it; the live demo serves from
Lakebase (`serving_provenance='seed-bootstrap'`) and the Databricks `novendor_1` medallion never ran
(warehouse `health=FAILED`).

**Decision (user-directed, aggressive to completion):** Promote the BigQuery dataset to the real
serving path using **true GCP PySpark on Dataproc Serverless**. Everything but bronze is on the chopping
block; bronze is made *uglier* (realistic raw mess) so silver has visible work. Gold is rebuilt as real
Spark joins/aggregations over silver, regression-locked to current gold values so demo invariants hold.
Databricks medallion path retired (superseding ADR follows).

**Target flow:** generator → ugly `bronze_rel_*` (BQ) → Dataproc PySpark conform → `silver_rel_*`
(+`_reject` quarantine sinks) → Dataproc PySpark derive → `gold_rel_*` → sync → Lakebase serving
(`serving_provenance='dataproc-gold'`) → FastAPI/dashboards unchanged.

**Runtime proven (2026-06-27):** Dataproc APIs enabled; default compute SA (`roles/editor`) sufficient;
GCS staging bucket `gs://novendor-rel-mes-dataproc` (US, matches the US dataset) created; smoke batch
`rel-mes-smoke-1` read `bronze_rel_mes_operation_execution` (153 rows) via the Spark-BigQuery connector,
no IAM/connector errors. Build runs in worktree `feat/rel-mes-dataproc-medallion`.

**Build sequence:** (0) provision ✓ → (1) ugly-bronze generator mess + BQ reload → (2) `rel_silver.py`
conform/cast/normalize/dedup/quarantine → (3) `rel_gold.py` derive 5 marts from silver
(regression-locked) → (4) serving sync BQ→Lakebase (`dataproc-gold`), retire Databricks path → (5)
re-run audit + invariant gate, table/column descriptions, tests → (6) docs (plan, superseding ADR,
README, tips). Owning surface adds `telemetry-platform/dataproc/relativity_mes/`.

**Acceptance:** re-run audit yields `healthy` (silver_cols > bronze_cols everywhere; silver casts/
normalizes/dedups/quarantines with populated `_reject` sinks; gold derives from silver via SQL lineage,
not literals); demo invariants survive (3 vehicles, suspect lot on exactly 2, open major NCR, a
reconciliation exception); fail-closed gate aborts the serving flip on any invariant/DQ failure.

## Out of scope

No ML model (roadmap note only). No real Relativity data/schema/API. Unity Catalog lineage beyond
seeding the medallion tables is Lakebase-ready, not claimed as live UC lineage.
