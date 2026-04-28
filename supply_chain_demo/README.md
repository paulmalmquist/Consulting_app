# Supply Chain Data Platform — Databricks Medallion Build

A self-contained Databricks proof-of-concept demonstrating a production-grade
supply chain data architecture: medallion lakehouse, expectation-enforced
transformations, certified semantic views, and an AI NL→SQL query layer.

Runs in under 8 minutes on a free Community Edition workspace.

---

## Architecture

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
│   raw_purchase_orders  raw_sales_orders  raw_shipments              │
│   raw_inventory_snapshots  raw_suppliers  raw_skus  raw_warehouses  │
└─────────────────────────────────────────────────────────────────────┘
         │
         │  DLT expectations (optional) / plain-Spark fallback
         │  Dedup · Type-cast · Null quarantine
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SILVER  supply_chain_demo.silver.*                                  │
│   Cleaned, conformed. Bad rows → *_quarantine tables.               │
│   silver_purchase_orders  silver_fact_shipment_event                │
│   silver_inventory_snapshot  silver_suppliers  silver_skus          │
└─────────────────────────────────────────────────────────────────────┘
         │
         │  Business KPI aggregations
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GOLD    supply_chain_demo.gold.*                                     │
│   Certified metrics. Business-owner sign-off required.              │
│   supplier_otif_scorecard  fill_rate_by_sku                         │
│   days_of_supply_by_warehouse  supplier_scorecard                   │
│   inventory_turns_by_warehouse                                      │
└─────────────────────────────────────────────────────────────────────┘
         │
         │  COMMENT ON VIEW, DECIMAL precision, business column names
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SEMANTIC  supply_chain_demo.semantic.*                               │
│   Single source of truth for BI, Genie, APIs, and AI NL→SQL.        │
│   COMMENT ON VIEW on every metric. No raw joins.                    │
│   otif_scorecard  fill_rate_by_sku  days_of_supply_by_warehouse      │
│   supplier_scorecard  inventory_turns_by_warehouse                  │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI LAYER  06_ai_layer.py                                            │
│   Natural language → validated SQL → Spark execution.               │
│   Primary: Foundation Model API (Llama 3.1 70B)                    │
│   Fallback: deterministic keyword router (5 KPI patterns)           │
│   Guardrails: SELECT-only, semantic-schema-only, DDL blocked        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## OTIF Lineage Chain

The most important metric — On-Time In-Full delivery rate — traces through four layers:

```
bronze.raw_purchase_orders  ──┐
bronze.raw_shipments         ──┤──▶ silver.silver_fact_shipment_event
bronze.raw_sales_orders      ──┘         │
                                         │  DLT expectations:
                                         │    valid_po_date     (warn, quarantine)
                                         │    positive_qty      (drop, quarantine)
                                         │    valid_ship_date   (warn, quarantine)
                                         │    shipped_qty_pos   (drop, quarantine)
                                         ▼
                              gold.supplier_otif_scorecard
                                         │  Grain: supplier × month
                                         │  OTIF = on_time AND in_full
                                         ▼
                              semantic.otif_scorecard
                                         │  COMMENT ON VIEW
                                         │  Single source of truth
                                         ▼
                              AI NL→SQL query:
                              "Which suppliers have OTIF below 85%?"
```

---

## Mock Data

Generated with `random.seed(42)` — fully deterministic, reproducible.

| Entity              | Count    | Deliberate Dirtiness                            |
|---------------------|----------|-------------------------------------------------|
| Suppliers           | 20       | Mixed country/tier distribution                 |
| SKUs                | 200      | 8 categories, varied cost/weight                |
| Warehouses          | 10       | Regional distribution centers                   |
| Customers           | 500      | 4 segments, credit limit variation              |
| Purchase Orders     | 10,000   | 2% null dates, 1% negative qty, 0.5% dupes     |
| Sales Orders        | 10,000   | 2% null dates                                   |
| Shipments           | 20,000   | ~75% OTIF baseline, 3% never delivered          |
| Inventory Snapshots | ~18,000  | 90 days × 10 WH × 20 sampled SKUs              |

---

## Five KPIs

| KPI                   | Definition                                              | Grain                     |
|-----------------------|---------------------------------------------------------|---------------------------|
| **OTIF**              | (on_time AND in_full shipments) / total shipments × 100 | supplier × month          |
| **Fill Rate**         | SUM(shipped_qty) / SUM(ordered_qty) × 100               | SKU × month               |
| **Days of Supply**    | AVG(on_hand) / AVG(daily_demand)                        | SKU × warehouse × month   |
| **Supplier Scorecard**| 0.40×OTIF + 0.30×lead_time_score + 0.30×quality_score   | supplier × month          |
| **Inventory Turns**   | COGS / AVG(inventory_value) × 12 (annualized)           | warehouse × month         |

---

## Run Order

```
1. 00_setup.py           # Create catalog, schemas, seed bronze layer
2. 01_bronze_ingest.py   # Review ingestion patterns (optional, no writes)
3. 02_silver_transform.py # Clean and conform bronze → silver
4. 03_gold_kpis.py       # Compute 5 KPIs → gold layer
5. 04_semantic_views.sql # Create semantic views with COMMENT ON VIEW
6. 05_data_quality.py    # Run quality checks, write quality_results table
7. 06_ai_layer.py        # Enable NL→SQL on semantic layer
8. 07_dashboard.sql      # Run pre-built dashboard queries
```

---

## Community Edition Compatibility

Every notebook detects catalog availability and falls back gracefully:

```python
try:
    spark.sql("CREATE CATALOG IF NOT EXISTS supply_chain_demo")
    USE_UNITY = True
except Exception:
    USE_UNITY = False
    # Uses hive_metastore.supply_chain_demo_{bronze,silver,gold} instead
```

DLT pipeline sections are labeled `# --- OPTIONAL: DLT ---` and each has a
plain-Spark fallback block that runs without a DLT pipeline.

The AI layer falls back from Foundation Model API to a deterministic pattern
router with no configuration required.

---

## Why This Pattern

This is the same architecture used in enterprise data platform engagements
(JLL, private equity portfolio analytics):

**Fragmented source systems** (SAP, Oracle, WMS, TMS) → **governed data products**
(Unity Catalog, quality checks, lineage) → **analytics and AI layer** (Genie,
BI tools, NL→SQL).

The OTIF metric above — from raw shipment events to a natural-language query —
covers the full stack: ingestion → quality → KPI → semantic → AI. That's the
pattern that matters at scale.
