# Supply Chain Data Platform — Databricks Medallion Build

## Purpose

A self-contained, runnable proof-of-concept that demonstrates a production-grade
supply chain data architecture end-to-end. The goal is to show — not describe —
the pattern used in enterprise engagements:

**Fragmented source systems → medallion lakehouse → governed data products → AI query layer**

A senior data architect can inspect every assumption in 30 minutes without access to
a real workspace: the data generators, the expectation thresholds, the KPI formulas,
and the AI guardrails are all in plain source code.

This is also the backing artifact for the Winston supply-chain demo environment at
`/lab/env/{envId}/supply-chain/notebooks`.

---

## Run Order

```
00_setup.py           ← Start here. Creates catalog + schemas, seeds all mock data.
01_bronze_ingest.py   ← Ingestion patterns only (optional; documents JDBC, Auto Loader, Kafka).
02_silver_transform.py ← Core quality layer. Dedup, type-cast, quarantine bad rows.
03_gold_kpis.py       ← Five KPIs aggregated to gold tables.
04_semantic_views.sql ← Semantic views with COMMENT ON VIEW. Run in a SQL cell or notebook.
05_data_quality.py    ← Quality audit. Writes quality_results Delta table.
06_ai_layer.py        ← NL→SQL with guardrails. Run last (needs semantic layer to exist).
07_dashboard.sql      ← Pre-built queries and 5 NL→SQL worked examples.
```

Minimum path to a working AI query: `00 → 02 → 03 → 04 → 06`.

Estimated wall time: < 8 minutes on a free-tier single-node cluster (DBR 15.4 LTS, 8 GB RAM).

---

## Community Edition Notes

Every notebook wraps catalog creation in a `try/except` block and sets a `USE_UNITY` flag:

```python
try:
    spark.sql("CREATE CATALOG IF NOT EXISTS supply_chain_demo")
    USE_UNITY = True
except Exception:
    USE_UNITY = False
```

When `USE_UNITY = False`, `table_ref()` returns `hive_metastore` paths
(`supply_chain_demo_bronze.raw_purchase_orders`, etc.) instead of
`supply_chain_demo.bronze.raw_purchase_orders`. No other code changes required.

The semantic views in `04_semantic_views.sql` reference Unity Catalog paths. On Community
Edition, create them as `hive_metastore.supply_chain_demo_gold.*` views or skip the
semantic layer and query gold tables directly from `06_ai_layer.py` by setting
`CATALOG_PREFIX = "supply_chain_demo_gold"` (already in the fallback path).

`COMMENT ON VIEW` syntax requires Databricks Runtime ≥ 11.3. On older runtimes, remove
those statements — they are informational only.

---

## DLT Optional Sections

DLT (Delta Live Tables) requires a Standard or Premium workspace. Every notebook
provides two paths for each pipeline step:

```python
# --- OPTIONAL: run as DLT pipeline (Standard/Premium tier) ---
# @dlt.table(name="silver_purchase_orders", comment="Cleaned POs")
# @dlt.expect("valid_po_date", "po_date_parsed IS NOT NULL")
# @dlt.expect_or_drop("positive_qty", "ordered_qty > 0")
# def silver_purchase_orders():
#     ...

# --- ALWAYS: plain-Spark fallback (Community Edition) ---
df = spark.read.table(table_ref("bronze", "raw_purchase_orders"))
# ... transformations ...
df.write.format("delta").mode("overwrite").saveAsTable(table_ref("silver", "silver_purchase_orders"))
```

The plain-Spark path produces identical output. The DLT path adds:
- Lineage tracking in the Unity Catalog UI
- Expectation dashboards (pass/fail rates per rule over time)
- Incremental materialization (only processes new records)

To run as a DLT pipeline: create a new pipeline in the Databricks UI, point it at the
notebook, and remove the `# --- OPTIONAL ---` comments. The plain-Spark blocks below
each DLT section are then redundant and can be deleted.

---

## Safety Boundaries in 06_ai_layer.py

The `validate_sql()` function runs before any query is executed, regardless of whether
the SQL came from the LLM or the fallback router.

**What it blocks:**

```
DDL:  DROP, ALTER, CREATE, TRUNCATE
DML:  INSERT, UPDATE, DELETE, MERGE
RPC:  EXEC, EXECUTE, CALL, GRANT, REVOKE
```

These are matched as word-boundary regex (`\bDROP\b`) so `DROPOUT` does not trigger.

**Schema restriction:**

Table references are extracted from the SQL (`FROM`/`JOIN` clauses), normalized to
lowercase, and checked against a whitelist of five known semantic tables:

```python
SEMANTIC_TABLES = {
    "supply_chain_demo.semantic.otif_scorecard",
    "supply_chain_demo.semantic.fill_rate_by_sku",
    "supply_chain_demo.semantic.days_of_supply_by_warehouse",
    "supply_chain_demo.semantic.supplier_scorecard",
    "supply_chain_demo.semantic.inventory_turns_by_warehouse",
}
```

Queries referencing `gold.*`, `bronze.*`, or any other table are rejected before
execution with `{"error": "blocked", "reason": "table not in semantic whitelist: ..."}`.

**First-token rule:**

The first non-whitespace token must be `SELECT`. Anything else is rejected immediately.

**Fallback router:**

When the Foundation Model API is unavailable (Community Edition, network restriction,
or quota), five regex patterns cover the five KPIs and return hardcoded SQL. Each
hardcoded query is also passed through `validate_sql()` so the router cannot be
used to inject non-SELECT statements.

---

## Expected Outputs

After running each notebook, the following tables and views should exist:

**After `00_setup.py`:**
```
bronze.raw_suppliers          20 rows
bronze.raw_skus              200 rows
bronze.raw_warehouses         10 rows
bronze.raw_customers         500 rows
bronze.raw_purchase_orders  10,000 rows  (+ 50 CDC rows after 01_bronze_ingest.py)
bronze.raw_sales_orders     10,000 rows
bronze.raw_shipments        20,000 rows
bronze.raw_inventory_snapshots ~18,000 rows
```

**After `02_silver_transform.py`:**
```
silver.silver_purchase_orders      ~9,900 rows  (~100 negative-qty rows quarantined)
silver.silver_fact_shipment_event  ~19,400 rows (~600 null-date or zero-qty quarantined)
silver.silver_inventory_snapshot   ~17,800 rows (~200 negative on_hand quarantined)
silver.silver_suppliers               20 rows
silver.silver_skus                   200 rows
bronze.raw_purchase_orders_quarantine ~200 rows (null dates + negatives)
bronze.raw_shipments_quarantine        ~600 rows
```

**After `03_gold_kpis.py`:**
```
gold.supplier_otif_scorecard         ~240 rows  (20 suppliers × ~12 months)
gold.fill_rate_by_sku               ~2,400 rows (200 SKUs × ~12 months)
gold.days_of_supply_by_warehouse   ~2,400 rows (20 SKU-WH pairs × 90 days collapsed)
gold.supplier_scorecard              ~240 rows
gold.inventory_turns_by_warehouse    ~120 rows  (10 WH × ~12 months)
```

**After `04_semantic_views.sql`:**
```
semantic.otif_scorecard                  (view over gold.supplier_otif_scorecard)
semantic.fill_rate_by_sku               (view over gold.fill_rate_by_sku)
semantic.days_of_supply_by_warehouse    (view over gold.days_of_supply_by_warehouse)
semantic.supplier_scorecard             (view over gold.supplier_scorecard)
semantic.inventory_turns_by_warehouse   (view over gold.inventory_turns_by_warehouse)
SHOW VIEWS IN supply_chain_demo.semantic → 5 views listed
```

**After `05_data_quality.py`:**
```
bronze.quality_results    ~15 rows  (one row per check per run, appended)
Console output: N checks run, N failed (should see 0 FAIL if data is intact)
Expected failing checks: duplicate_po_number (~0.5% rate vs 1.0% threshold → PASS)
                         null_rate_po_date   (~2% vs 3% threshold → PASS)
                         positive_qty        (~1% vs 1.5% threshold → PASS)
```

**After `06_ai_layer.py`:**
```
Console output: 5 NL→SQL examples with path (llm or fallback), SQL, and result tables
Guardrail tests: 4 BLOCKED + 1 ALLOWED (see "Guardrail Tests" section in output)
```

---

## Architecture Diagram

```
SOURCE SYSTEMS
  SAP ECC (POs, SOs)         → JDBC batch
  Oracle Procurement          → JDBC batch
  Manhattan WMS (inventory)   → Auto Loader (file drop)
  MercuryGate TMS (shipments) → REST API polling
  Rockwell MES (production)   → Kafka streaming
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BRONZE  supply_chain_demo.bronze.*                                  │
│   Raw, immutable, append-only. Schema-on-read. Audit columns added. │
└─────────────────────────────────────────────────────────────────────┘
         │  DLT expectations (optional) / plain-Spark fallback
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SILVER  supply_chain_demo.silver.*                                  │
│   Cleaned, conformed. Bad rows → *_quarantine tables.               │
└─────────────────────────────────────────────────────────────────────┘
         │  Business KPI aggregations
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GOLD    supply_chain_demo.gold.*                                     │
│   OTIF · Fill Rate · Days of Supply · Scorecard · Inventory Turns   │
└─────────────────────────────────────────────────────────────────────┘
         │  COMMENT ON VIEW, DECIMAL precision, business column names
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SEMANTIC  supply_chain_demo.semantic.*                               │
│   Single source of truth. COMMENT ON VIEW on every metric.          │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI LAYER  06_ai_layer.py                                            │
│   NL→SQL · SELECT-only · semantic-schema-only · DDL blocked         │
└─────────────────────────────────────────────────────────────────────┘
```

## OTIF Lineage

```
bronze.raw_purchase_orders  ──┐
bronze.raw_shipments         ──┤──▶ silver.fact_shipment_event ──▶ gold.supplier_otif_scorecard ──▶ semantic.otif_scorecard
bronze.raw_sales_orders      ──┘
                                     ▲
                            DLT expectations:
                              valid_po_date (warn)  positive_qty (drop)
                              valid_ship_date (warn) shipped_qty_pos (drop)
```
