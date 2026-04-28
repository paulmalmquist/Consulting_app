# Supply Chain Demo — Databricks Deploy

Scripts to seed a real Databricks workspace with 19 Delta tables spanning
the medallion architecture (bronze → silver → semantic).

Run `seed_workspace.py` and `verify_databricks_seed.py` to get queryable
Delta tables in your Databricks workspace within 10–15 minutes.

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| Databricks workspace (Standard or Premium) | https://databricks.com |
| Personal access token | Workspace → User Settings → Access Tokens |
| All-purpose cluster (running) | Compute → Create compute |
| SQL Warehouse | SQL → SQL Warehouses → Create |

Community Edition note: CE does not support the Jobs API (Runs Submit). See
[Community Edition](#community-edition) below for the manual path.

---

## Setup

```bash
cd supply_chain_demo/databricks_deploy
pip install requests python-dotenv

cp .env.example .env
# Fill in DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_CLUSTER_ID,
# DATABRICKS_SQL_WAREHOUSE_ID
```

---

## Run order

### 1. Upload notebooks (optional)

Uploads the 8 source notebooks to your workspace so you can run or inspect
them interactively.

```bash
python deploy_notebooks.py
```

Output:
```
  ✓ uploaded  00_setup.py            →  /Users/you@co.com/supply_chain_demo/00_setup
  ✓ uploaded  01_bronze_ingest.py    →  ...
  ...
8 uploaded, 0 failed.
```

### 2. Seed all tables

Builds an embedded seeding script, uploads it as a notebook, submits it as
a Databricks run, and polls until complete.

```bash
python seed_workspace.py
```

Expected output (after 10–15 minutes on a standard cluster):
```
  supply_chain_demo.bronze.raw_supplier_master              20 rows
  supply_chain_demo.bronze.raw_item_master                 200 rows
  supply_chain_demo.bronze.raw_location_master              10 rows
  supply_chain_demo.bronze.raw_purchase_orders          10,000 rows
  supply_chain_demo.bronze.raw_shipments                20,000 rows
  supply_chain_demo.bronze.raw_inventory_snapshots      18,000 rows
  supply_chain_demo.bronze.raw_production_events         5,000 rows
  supply_chain_demo.silver.dim_supplier                     20 rows
  ...
  supply_chain_demo.semantic.supplier_otif_scorecard       240 rows
  ...
  Total tables created: 19
```

### 3. Verify

```bash
python verify_databricks_seed.py
```

Exits 0 if all 19 tables pass, non-zero if any table is empty or a
business check fails.

---

## What gets created

Three schemas under the `supply_chain_demo` catalog:

**`supply_chain_demo.bronze`** — raw source data (7 tables)

| Table | Rows | Description |
|---|---|---|
| raw_supplier_master | 20 | 20 suppliers with category and region |
| raw_item_master | 200 | 200 SKUs with unit cost |
| raw_location_master | 10 | 10 warehouses with capacity |
| raw_purchase_orders | 10,000 | 2% null dates, 1% negative qty, 0.5% dupes |
| raw_shipments | 20,000 | Weighted delay distribution |
| raw_inventory_snapshots | ~18,000 | 90 days × 10 WH × 20 sampled SKUs |
| raw_production_events | 5,000 | Planned vs actual with downtime hours |

**`supply_chain_demo.silver`** — cleaned and conformed (7 tables)

| Table | Rows | Description |
|---|---|---|
| dim_supplier | 20 | Deduped supplier dimension |
| dim_item | 200 | Deduped SKU dimension |
| dim_location | 10 | Warehouse dimension |
| fact_inventory_position | ~17,800 | Negative on_hand quarantined, days_of_supply added |
| fact_order_cycle | ~9,900 | Null dates and negative qty quarantined, deduped |
| fact_shipment_event | ~19,400 | Null ship_date quarantined, OTIF flag added |
| fact_production_output | ~4,800 | Negative output quarantined, efficiency_pct added |

**`supply_chain_demo.semantic`** — business aggregations (5 tables)

| Table | Rows | Description |
|---|---|---|
| supplier_otif_scorecard | ~240 | Monthly OTIF % per supplier |
| inventory_risk_daily | ~17,800 | Days-of-supply + risk tier per SKU/WH/day |
| demand_supply_gap | ~2,400 | Demand vs supply by SKU/month |
| logistics_cost_to_serve | ~240 | Cost per unit by supplier/lane/month |
| production_throughput_summary | ~120 | Efficiency by location/month |

All data is deterministic — `random.seed(42)` is set before every generator.

---

## Jobs (optional)

Create a saved Databricks Workflow for recurring refreshes:

```bash
python create_jobs.py
```

Creates one job: "Supply Chain Demo - Medallion Refresh" with one task
that runs `seed_all_tables`. Trigger manually from the Databricks UI.

---

## Community Edition

Community Edition does not support the Jobs API. To seed manually:

1. Run `deploy_notebooks.py` — it uploads notebooks via the Workspace API,
   which CE does support.
2. Open the uploaded `seed_all_tables` notebook in the Databricks CE UI.
3. Run it manually (Run All).
4. The `USE_UNITY` flag will be `False`; tables land in
   `hive_metastore.supply_chain_demo_bronze.*`, etc.
5. Run `verification_queries.sql` in a Databricks SQL editor, replacing
   `supply_chain_demo.bronze` with `supply_chain_demo_bronze`.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABRICKS_HOST` | Yes | — | Workspace URL (no trailing slash) |
| `DATABRICKS_TOKEN` | Yes | — | Personal access token |
| `DATABRICKS_CLUSTER_ID` | Yes* | — | All-purpose cluster ID. *Required unless `DATABRICKS_ALLOW_NEW_CLUSTER=true` |
| `DATABRICKS_SQL_WAREHOUSE_ID` | Yes for verify | — | SQL Warehouse ID |
| `DATABRICKS_CATALOG` | No | `supply_chain_demo` | Unity Catalog name |
| `DATABRICKS_BRONZE_SCHEMA` | No | `bronze` | Bronze schema name |
| `DATABRICKS_SILVER_SCHEMA` | No | `silver` | Silver schema name |
| `DATABRICKS_GOLD_SCHEMA` | No | `semantic` | Semantic schema name |
| `DATABRICKS_NOTEBOOK_PATH` | No | `/Users/<email>/supply_chain_demo` | Workspace path for notebooks |
| `DATABRICKS_ALLOW_NEW_CLUSTER` | No | `false` | Set `true` to provision ephemeral cluster |

---

## Troubleshooting

**`DATABRICKS_CLUSTER_ID is required`**
Set the variable to the ID of a running all-purpose cluster. Find it in the
Databricks UI under Compute → your cluster → Configuration → Cluster ID.

**Run fails immediately with `CLUSTER_NOT_FOUND`**
The cluster must be running (not terminated). Start it from the Compute page
and retry.

**`DATABRICKS_SQL_WAREHOUSE_ID is required`**
Set it to the ID of a SQL Warehouse (not a cluster). Find it in the
Databricks UI under SQL → SQL Warehouses → your warehouse → Overview.

**Unity Catalog not enabled**
Set `DATABRICKS_ALLOW_NEW_CLUSTER=true` — the embedded script will fall
back to `hive_metastore` automatically and print a warning.

**`workspace/import` returns 403**
The token must have `CAN_MANAGE` permission on the target workspace path.
Try a different `DATABRICKS_NOTEBOOK_PATH` under your own user folder.
