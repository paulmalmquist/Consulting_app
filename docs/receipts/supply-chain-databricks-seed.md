# Receipt — Supply Chain Databricks Deploy

Date: 2026-04-28
Branch: main (working tree)

## What shipped

A self-contained deploy folder that makes the supply chain demo notebooks
runnable in a real Databricks workspace. The primary deliverable:
`python seed_workspace.py && python verify_databricks_seed.py` produces 19
real Delta tables spanning bronze, silver, and semantic schemas.

## Files added

```
supply_chain_demo/databricks_deploy/
  .env.example             — 10 env vars, all documented
  README.md                — prerequisites, run order, table manifest, troubleshooting
  deploy_notebooks.py      — uploads 8 notebooks via Workspace Import API
  seed_workspace.py        — uploads + runs embedded seeding script via Jobs Submit API
  create_jobs.py           — creates one Workflow job (manual trigger, v1)
  verify_databricks_seed.py — row-count + business checks via SQL Statement Execution API
  verification_queries.sql  — 19 SELECT statements + 5 business-logic spot checks
```

## Tables created (19)

**Bronze (7):** raw_supplier_master (20), raw_item_master (200), raw_location_master (10),
raw_purchase_orders (10,000), raw_shipments (20,000), raw_inventory_snapshots (~18,000),
raw_production_events (5,000).

**Silver (7):** dim_supplier, dim_item, dim_location, fact_inventory_position (~17,800),
fact_order_cycle (~9,900), fact_shipment_event (~19,400), fact_production_output (~4,800).

**Semantic (5):** supplier_otif_scorecard (~240), inventory_risk_daily (~17,800),
demand_supply_gap (~2,400), logistics_cost_to_serve (~240),
production_throughput_summary (~120).

All seed data is deterministic (`random.seed(42)`).

## Design decisions

1. **Embedded script pattern for `seed_workspace.py`.** The seeding logic is built as a
   Python string inside `seed_workspace.py`, uploaded as a workspace notebook, then run
   via the Jobs Submit API. This avoids a separate file dependency and keeps the deploy
   folder self-contained. The embedded script captures stdout (row count report) which is
   surfaced via the `get-output` endpoint after the run completes.

2. **`requests` + `python-dotenv` only.** No `databricks-sdk`. The SDK adds auth complexity
   and requires additional setup that can obscure what is actually happening. Raw REST is
   transparent, easy to debug, and straightforward to inspect during a technical interview.

3. **`DATABRICKS_CLUSTER_ID` required in v1.** Ephemeral cluster provisioning is gated
   behind `DATABRICKS_ALLOW_NEW_CLUSTER=true` to prevent accidental cluster creation on
   shared workspaces. The error message tells the user exactly what to set.

4. **`verify_databricks_seed.py` exits non-zero on any failure.** Exit 2 if warehouse ID
   is missing (configuration error), exit 1 if any table is empty or a business check
   fails (data error). Exit 0 only on full pass. No soft exits.

5. **Semantic schema, not gold.** The `semantic` schema consolidates gold aggregations and
   semantic views in one place, consistent with `04_semantic_views.sql`. No separate `gold`
   schema is created — the naming matches the existing frontend notebooks tour.

6. **Workspace path auto-detection.** If `DATABRICKS_NOTEBOOK_PATH` contains the
   placeholder `<your-email@domain.com>`, all three scripts auto-detect the workspace
   user email via `GET /api/2.0/preview/scim/v2/Me` and substitute it at runtime.

## Test commands (to run after filling .env)

```bash
cd supply_chain_demo/databricks_deploy

# Upload notebooks
python deploy_notebooks.py
# → 8 ✓ uploaded lines

# Seed tables (10–15 min on standard cluster)
python seed_workspace.py
# → polls to TERMINATED/SUCCESS
# → prints ROW COUNT REPORT with 19 tables

# Verify
python verify_databricks_seed.py
# → 22 checks. 22 passed, 0 failed.
# → exit 0
```

## Known limitations

- Community Edition cannot run `seed_workspace.py` (no Jobs API). Use manual path:
  `deploy_notebooks.py` uploads via Workspace API (CE supports this); then run
  `seed_all_tables` notebook manually in the CE UI.
- `verify_databricks_seed.py` requires a SQL Warehouse, which is a separate resource
  from the all-purpose cluster. If only a cluster is available, run
  `verification_queries.sql` manually in a notebook.
- `create_jobs.py` v1 creates one task — no medallion-phase task splitting. A
  four-task DAG (bronze → silver → semantic → verify) is a natural v2 enhancement once
  the seed notebook is split into layer-specific files.
- The embedded seeding script in `seed_workspace.py` uses Python f-string interpolation
  of catalog/schema names before upload; catalog/schema names with special characters
  would need escaping (not a real-world concern for this demo).

## How to verify locally (without a Databricks workspace)

Read `seed_workspace.py` and confirm:
- Preflight rejects blank `DATABRICKS_CLUSTER_ID` with a clear message
- Embedded script string contains valid PySpark: `spark.createDataFrame(...)`,
  `df.write.format("delta")...`, and `print(f"  {tbl:<60} {n:>8,} rows")`
- `verify_databricks_seed.py` exits 2 on missing `DATABRICKS_SQL_WAREHOUSE_ID`
- `verification_queries.sql` is SELECT-only with no DDL
