-- Supply Chain Demo — Verification Queries
-- Run these in the Databricks SQL editor or a notebook.
-- All queries are SELECT-only and reference supply_chain_demo.{bronze|silver|semantic}.

-- ============================================================
-- Bronze layer — row counts
-- ============================================================

SELECT COUNT(*) AS row_count, 'raw_supplier_master' AS table_name
FROM supply_chain_demo.bronze.raw_supplier_master;

SELECT COUNT(*) AS row_count, 'raw_item_master' AS table_name
FROM supply_chain_demo.bronze.raw_item_master;

SELECT COUNT(*) AS row_count, 'raw_location_master' AS table_name
FROM supply_chain_demo.bronze.raw_location_master;

SELECT COUNT(*) AS row_count, 'raw_purchase_orders' AS table_name
FROM supply_chain_demo.bronze.raw_purchase_orders;

SELECT COUNT(*) AS row_count, 'raw_shipments' AS table_name
FROM supply_chain_demo.bronze.raw_shipments;

SELECT COUNT(*) AS row_count, 'raw_inventory_snapshots' AS table_name
FROM supply_chain_demo.bronze.raw_inventory_snapshots;

SELECT COUNT(*) AS row_count, 'raw_production_events' AS table_name
FROM supply_chain_demo.bronze.raw_production_events;

-- ============================================================
-- Silver layer — row counts
-- ============================================================

SELECT COUNT(*) AS row_count, 'dim_supplier' AS table_name
FROM supply_chain_demo.silver.dim_supplier;

SELECT COUNT(*) AS row_count, 'dim_item' AS table_name
FROM supply_chain_demo.silver.dim_item;

SELECT COUNT(*) AS row_count, 'dim_location' AS table_name
FROM supply_chain_demo.silver.dim_location;

SELECT COUNT(*) AS row_count, 'fact_inventory_position' AS table_name
FROM supply_chain_demo.silver.fact_inventory_position;

SELECT COUNT(*) AS row_count, 'fact_order_cycle' AS table_name
FROM supply_chain_demo.silver.fact_order_cycle;

SELECT COUNT(*) AS row_count, 'fact_shipment_event' AS table_name
FROM supply_chain_demo.silver.fact_shipment_event;

SELECT COUNT(*) AS row_count, 'fact_production_output' AS table_name
FROM supply_chain_demo.silver.fact_production_output;

-- ============================================================
-- Semantic layer — row counts
-- ============================================================

SELECT COUNT(*) AS row_count, 'supplier_otif_scorecard' AS table_name
FROM supply_chain_demo.semantic.supplier_otif_scorecard;

SELECT COUNT(*) AS row_count, 'inventory_risk_daily' AS table_name
FROM supply_chain_demo.semantic.inventory_risk_daily;

SELECT COUNT(*) AS row_count, 'demand_supply_gap' AS table_name
FROM supply_chain_demo.semantic.demand_supply_gap;

SELECT COUNT(*) AS row_count, 'logistics_cost_to_serve' AS table_name
FROM supply_chain_demo.semantic.logistics_cost_to_serve;

SELECT COUNT(*) AS row_count, 'production_throughput_summary' AS table_name
FROM supply_chain_demo.semantic.production_throughput_summary;

SELECT COUNT(*) AS row_count, 'data_quality_results' AS table_name
FROM supply_chain_demo.semantic.data_quality_results;

-- Silver quarantine table
SELECT COUNT(*) AS row_count, 'quarantine_records' AS table_name
FROM supply_chain_demo.silver.quarantine_records;

-- DQ check summary (what passed and failed)
SELECT check_name, table_name, pass_count, fail_count, status, run_at
FROM supply_chain_demo.semantic.data_quality_results
ORDER BY run_at DESC, status DESC;

-- Quarantine records by issue type
SELECT issue_type, severity, source_table, COUNT(*) AS record_count
FROM supply_chain_demo.silver.quarantine_records
GROUP BY issue_type, severity, source_table
ORDER BY record_count DESC;

-- ============================================================
-- Business checks
-- ============================================================

-- Suppliers with OTIF below 85% (should return rows — intentional variance in seed data)
SELECT supplier_name, ROUND(otif_pct, 1) AS otif_pct, period_month
FROM supply_chain_demo.semantic.supplier_otif_scorecard
WHERE otif_pct < 85
ORDER BY otif_pct ASC
LIMIT 10;

-- Top 10 SKUs at stockout risk (days_of_supply < 7)
SELECT sku_id, sku_description, warehouse_id,
       ROUND(days_of_supply, 1) AS days_of_supply, risk_tier
FROM supply_chain_demo.semantic.inventory_risk_daily
WHERE risk_tier = 'CRITICAL'
ORDER BY days_of_supply ASC
LIMIT 10;

-- SKUs with largest demand-supply gap last month
SELECT sku_id, period_month,
       demand_qty, supply_qty,
       gap_qty,
       ROUND(gap_pct, 1) AS gap_pct
FROM supply_chain_demo.semantic.demand_supply_gap
WHERE period_month = DATE_TRUNC('month', ADD_MONTHS(CURRENT_DATE, -1))
ORDER BY gap_qty ASC
LIMIT 10;

-- Cost per unit by supplier and warehouse (highest cost lanes)
SELECT supplier_name, region, warehouse_id,
       ROUND(cost_per_unit, 4) AS cost_per_unit,
       shipment_count, period_month
FROM supply_chain_demo.semantic.logistics_cost_to_serve
ORDER BY cost_per_unit DESC
LIMIT 10;

-- Production efficiency by location last month
SELECT location_id, warehouse_name, region,
       planned_units, actual_units,
       ROUND(avg_efficiency_pct, 1) AS avg_efficiency_pct,
       ROUND(total_downtime_hours, 1) AS total_downtime_hours
FROM supply_chain_demo.semantic.production_throughput_summary
WHERE period_month = DATE_TRUNC('month', ADD_MONTHS(CURRENT_DATE, -1))
ORDER BY avg_efficiency_pct ASC;
