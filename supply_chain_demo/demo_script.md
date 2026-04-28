# Supply Chain Demo Script — 90-Second Interview Version

## The 30-second pitch

"I built a full supply chain data platform on Databricks — medallion architecture from raw source
data through certified KPIs to a natural-language query interface. The whole thing runs on a free
account in under 8 minutes. Let me show you the OTIF lineage chain and then run a live query."

---

## Walk order (for a senior data architect)

**Start at Architecture** — show the four-layer flow: Bronze → Silver → Gold → Semantic.
Point out that the semantic views have `COMMENT ON VIEW` on every metric definition.
That's not decoration — it's what makes Genie and BI tools give accurate answers without
prompt engineering on each query.

**Jump to `02_silver_transform.py`** — scroll to the DLT expectations block:
```
@dlt.expect("valid_po_date", "po_date_parsed IS NOT NULL")
@dlt.expect_or_drop("positive_qty", "ordered_qty > 0")
```
Say: "The bronze data has 2% null dates and 1% negative quantities — deliberate, because
that's what SAP actually sends on return orders. Expectations route failures to quarantine
tables rather than dropping silently. The quality_results table tracks every run."

**Open `03_gold_kpis.py`** — scroll to the OTIF definition:
```python
.withColumn("otif", F.col("on_time") & F.col("in_full"))
```
Say: "OTIF is the primary KPI. Both conditions — on time AND in full — must be true.
The grain is supplier × calendar month. Composite score weights OTIF 40%, lead-time
consistency 30%, quality rating 30%."

**Open `06_ai_layer.py`** — run the first example:
```python
run_query("Which suppliers have OTIF below 85% in the last 90 days?")
```
Walk through the output: path (LLM or fallback), generated SQL, live results.
Then show the guardrail test:
```python
test_guardrail("DDL block", "DROP TABLE supply_chain_demo.semantic.otif_scorecard")
```
Say: "The validator blocks anything that isn't a SELECT, and restricts table references
to the semantic schema. The LLM can't reach bronze or gold directly."

---

## Why this matters (the resume alignment)

Same pattern I used at JLL and in REPE portfolio analytics:

- JLL: fragmented property data from 8 source systems → Unity Catalog with lineage →
  executive dashboards where every KPI traces back to source
- REPE: fund-level IRR and OTIF-equivalent metrics (asset acquisition tracking) →
  authoritative snapshot pattern → single source of truth for investor reporting

The supply chain demo makes the architecture concrete and runnable. A senior architect
can inspect every assumption — the data generator, the expectation thresholds, the
KPI formulas — without running a single cell.

---

## Questions a senior architect might ask

**"Why not use DLT for everything?"**
DLT is Standard/Premium tier. Every notebook has a plain-Spark fallback so the demo
runs on Community Edition. In production you'd promote to DLT for lineage tracking,
expectation dashboards, and incremental materialization. The code structure is identical.

**"How do you handle late-arriving data?"**
The shipment fact table uses `actual_delivery_date` which can be null (3% of rows).
OTIF is computed only on delivered shipments. In a production pipeline you'd add a
watermark on `actual_delivery_date` for streaming and a reconciliation job for the
3% that arrive later.

**"What's the performance story at scale?"**
The demo uses 10K POs, 20K shipments, 18K inventory snapshots — enough to prove the
architecture. At real scale (50M+ shipments): partition by `ship_date` year-month,
Z-order on `supplier_id` and `sku_id`, use Delta predictive I/O. The semantic views
are read-mostly and would sit behind a Databricks SQL warehouse with result caching.

**"Why semantic views instead of a metrics layer?"**
Semantic views are the right default for a team that already has Genie and Databricks
SQL. They're SQL-native, Unity Catalog governed, and queryable by anything. A proper
metrics layer (dbt metrics, Cube.dev) makes sense when you need cross-platform
semantic consistency. This demo is deliberate about not over-engineering.

**"How would you extend this to real-time?"**
Replace the `00_setup.py` batch seed with a Kafka consumer on the bronze layer
(shown in `01_bronze_ingest.py` Pattern D). Silver becomes a structured streaming
pipeline with DLT. Gold runs on 15-minute microbatches via Databricks Jobs.
The semantic layer and AI interface are unchanged.

---

## Demo tips

- The Winston frontend at `/supply-chain/notebooks` shows all 8 notebooks with
  live code — useful if you can't share a Databricks workspace during the interview
- The "Start here" page has the OTIF lineage diagram — leads naturally into the
  architecture discussion
- The copy button on each notebook means you can paste a section into a shared
  notebook in real time
