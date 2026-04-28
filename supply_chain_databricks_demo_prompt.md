# Claude Code Prompt — Supply Chain Analytics Demo on Databricks

Paste this entire block into Claude Code. It is the build directive.

---

## Role

You are a senior data architect. You are building a self-contained demonstration project that proves the operator (Paul) can walk into an enterprise supply chain engagement and own the build end to end on Databricks. The audience is another senior architect in a 45-minute technical interview. The demo must be runnable on a free Databricks account, must seed all its own data, and must hold up to architectural probing.

## Goal

Produce a Databricks workspace asset bundle (notebooks + supporting files) that demonstrates, in order:

1. Medallion architecture (Bronze → Silver → Gold) on Delta Lake
2. PySpark + Spark SQL pipelines with realistic supply chain entities
3. Data quality enforcement (schema, nulls, referential integrity, ranges)
4. A semantic / definition layer where business KPIs live in one place
5. A GenAI access layer that turns natural language into governed SQL against the Gold layer
6. A short walkthrough script that lets Paul drive the demo in under 10 minutes

The whole thing must run top-to-bottom on a single small cluster (or serverless on Free Edition) with zero external dependencies — no S3, no APIs, no third-party CSVs, no paid OpenAI keys required (Foundation Model APIs that ship with Databricks Free Edition are fine; if unavailable, fall back to a deterministic template-based NL→SQL router).

## Domain — Supply Chain (mock, but realistic)

Model these entities:

- `suppliers` — supplier_id, name, country, tier, on_time_score
- `products` — sku, description, category, unit_cost, lead_time_days
- `warehouses` — warehouse_id, region, capacity_units
- `customers` — customer_id, name, segment, region
- `purchase_orders` — po_id, supplier_id, sku, qty_ordered, order_date, promised_date
- `goods_receipts` — receipt_id, po_id, qty_received, received_date, condition
- `inventory_snapshots` — daily snapshot per warehouse × sku (qty_on_hand, qty_in_transit)
- `sales_orders` — so_id, customer_id, sku, qty_ordered, order_date, promised_date
- `shipments` — shipment_id, so_id, ship_date, delivered_date, carrier, status

Seed volumes: ~20 suppliers, ~500 SKUs, ~10 warehouses, ~2,000 customers, ~50,000 purchase orders, ~50,000 sales orders, ~80,000 shipments, ~90 days of daily inventory snapshots. Generate with `numpy` + `random` using a fixed seed. Inject realistic mess on purpose: ~2% null promised_dates, ~1% negative quantities, duplicate POs, supplier name casing inconsistencies, two source systems with conflicting country codes (`US` vs `USA`).

## Architecture (non-negotiable)

```
catalog: supply_chain_demo
├── bronze   (raw, immutable, schema-on-read where useful)
├── silver   (cleaned, conformed, deduplicated, typed)
├── gold     (business-facing facts + dims, KPIs)
└── semantic (views — every business definition lives here)
```

If Unity Catalog is not available on the Free Edition tier, fall back to the `hive_metastore` catalog with the same schema names. State which path was taken in the README.

## Deliverables

Create these files inside a `supply_chain_demo/` directory. Each notebook must run independently if its predecessors have run, must print a one-line "✓ stage complete" message at the end, and must not require manual cell editing.

1. `README.md` — what this is, how to run, the architectural argument, a diagram of the medallion layout, and the 10-minute demo script.
2. `00_setup.py` — creates catalog, schemas, sets defaults. Idempotent.
3. `01_seed_bronze.py` — generates the mock data described above and lands it as Delta tables in `bronze`. Includes the deliberate dirtiness.
4. `02_silver_transform.py` — cleans, conforms, deduplicates, joins keys. Uses MERGE for idempotency. Casts types. Logs row counts in/out.
5. `03_gold_metrics.py` — builds Gold facts/dims and computes KPIs: **On-Time-In-Full (OTIF)**, **Fill Rate**, **Days of Supply**, **Supplier Scorecard**, **Inventory Turns**. Each KPI gets its own Delta table.
6. `04_quality_checks.py` — runs expectations on every Bronze→Silver→Gold hop. Use Delta Live Tables expectations syntax if available, otherwise a hand-rolled checks framework that writes a `quality_results` Delta table. Fail loud on critical violations, warn on soft ones.
7. `05_semantic_views.py` — creates SQL views in the `semantic` schema, one per metric, each with a `COMMENT ON VIEW` stating the business definition. This is the "single source of truth" layer that Paul will point to in the interview.
8. `06_ai_layer.py` — a notebook that:
   - Lists the semantic views and their column comments
   - Accepts a natural-language question
   - Calls the Databricks Foundation Model API (or falls back to a deterministic router with 5 canned intents) to translate to SQL
   - Executes the SQL against the `semantic` schema only (walled garden)
   - Returns the result + the generated SQL + the matched view definitions (provenance)
   - Includes 5 worked examples covering: "which suppliers missed promised dates last quarter", "what's our OTIF by region this month", "where is inventory below safety stock", "top 10 SKUs by stockout days", "supplier scorecard summary"
9. `07_dashboard.sql` — Databricks SQL queries for an executive dashboard built on the semantic layer.
10. `demo_script.md` — a 10-minute walkthrough. For each minute, a bullet on what to show and the architectural point being made. Include the exact lines to say when the interviewer asks "why Delta?", "why medallion?", "how do you handle data quality?", "where does the semantic layer live?".

## Constraints

- Free Databricks account. Assume small cluster or serverless. No paid features.
- All Python should run in `%python` cells; SQL in `%sql` cells. No `.whl` uploads.
- No external network calls except Databricks-native services.
- All Delta tables must have `COMMENT ON TABLE` describing purpose and owning layer.
- Every Gold metric must have a single, traceable definition lineage: Bronze table(s) → Silver transformation → Gold metric → Semantic view comment. State this lineage in `README.md` for at least OTIF.
- Fail closed: if a Silver row fails a critical check, route it to a `_quarantine` table with a reason column, do not silently drop.
- Idempotency: every notebook must be re-runnable without duplicating data. Use `MERGE` or `CREATE OR REPLACE`.

## Tradeoffs to call out in the README

Pick one path on each and justify in 2 sentences:

- Batch vs streaming → batch (justify: enterprise supply chain rarely needs sub-minute latency; default batch unless a use case demands otherwise)
- DLT vs hand-rolled pipelines → whichever the Free tier supports cleanly; state which and why
- UC vs hive_metastore → whichever Free tier exposes; state which
- Foundation Model API vs deterministic router for the AI layer → if FM API is available on Free, use it but keep the deterministic router as fallback; if not, ship the router and explain why the architecture is model-swappable

## Success criteria (verification checklist)

- [ ] All eight numbered notebooks run top-to-bottom on a fresh Databricks workspace with no manual edits
- [ ] Final cell of each notebook prints `✓ stage complete: <name>`
- [ ] `quality_results` table shows zero critical violations after `02_silver_transform.py` runs
- [ ] `gold.supplier_scorecard` returns ≥ 15 suppliers ranked
- [ ] `06_ai_layer.py` answers all 5 example questions with correct SQL and non-empty results
- [ ] `semantic` schema has one view per metric, each with a non-empty `COMMENT ON VIEW`
- [ ] `README.md` includes the medallion diagram, the OTIF lineage trace, and the 10-minute demo script
- [ ] Total wall-clock runtime end-to-end on a small cluster: under 8 minutes

## What you should produce now (before writing any code)

A **plan**, not code. Specifically:

1. A one-paragraph architectural summary
2. A table of every notebook with its inputs, outputs, and the architectural point it makes in the interview
3. The exact OTIF lineage from Bronze field names → Silver transformation → Gold table → Semantic view
4. A list of the 5 NL→SQL example questions with the SQL each should resolve to
5. A risk list — what's most likely to break on Free Edition, and the fallback for each
6. An estimated time-to-build broken into phases

Only after the plan is approved should you start generating notebooks. Do not generate code in this first pass.

## Anti-patterns to avoid

- Do not start with tools. Start with entities and KPIs.
- Do not use generic "best practices" language. Every choice must be tied to this specific build.
- Do not hide failures behind try/except. Surface them.
- Do not duplicate KPI logic in multiple notebooks. Define once in `semantic`, reference everywhere.
- Do not generate a 3,000-line notebook. Keep each notebook focused and under ~200 lines.
- Do not skip the `COMMENT ON` statements. They are the demo.

## Final framing

When Paul opens this in the interview, the senior architect on the other side should look at it for 90 seconds and think: *"this person has shipped this before."* Every choice in the build should reinforce that.
