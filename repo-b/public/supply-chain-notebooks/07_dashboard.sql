-- =============================================================================
-- Supply Chain Demo — 07: Dashboard Queries
--
-- Pre-built queries for the five core KPI dashboards plus 5 worked NL→SQL
-- examples showing how the AI layer in 06_ai_layer.py translates user intent.
--
-- All queries are against supply_chain_demo.semantic.* (single source of truth).
-- Run in Databricks SQL, a notebook SQL cell, or attach to a Databricks dashboard.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- NL→SQL Worked Example 1
-- Question: "Which suppliers have OTIF below 85% in the last 90 days?"
-- ---------------------------------------------------------------------------
SELECT
    supplier_name,
    supplier_tier,
    period_month,
    CAST(otif_pct AS DECIMAL(6,2))         AS otif_pct,
    CAST(on_time_pct AS DECIMAL(6,2))      AS on_time_pct,
    CAST(in_full_pct AS DECIMAL(6,2))      AS in_full_pct,
    total_shipments
FROM supply_chain_demo.semantic.otif_scorecard
WHERE period_month >= DATE_TRUNC('month', ADD_MONTHS(CURRENT_DATE, -3))
  AND otif_pct < 85
ORDER BY otif_pct ASC;


-- ---------------------------------------------------------------------------
-- NL→SQL Worked Example 2
-- Question: "What are the top 10 SKUs by stockout risk right now?"
-- (Low days_of_supply = highest risk)
-- ---------------------------------------------------------------------------
SELECT
    d.sku_id,
    d.warehouse_id,
    d.period_month,
    CAST(d.days_of_supply AS DECIMAL(8,1)) AS days_of_supply,
    d.supply_status,
    CAST(d.avg_on_hand_units AS DECIMAL(12,1)) AS avg_on_hand_units
FROM supply_chain_demo.semantic.days_of_supply_by_warehouse d
WHERE d.period_month = DATE_TRUNC('month', CURRENT_DATE)
  AND d.days_of_supply IS NOT NULL
ORDER BY d.days_of_supply ASC
LIMIT 10;


-- ---------------------------------------------------------------------------
-- NL→SQL Worked Example 3
-- Question: "Show me inventory turns by warehouse for the last quarter"
-- ---------------------------------------------------------------------------
SELECT
    warehouse_id,
    period_month,
    CAST(monthly_cogs_usd AS DECIMAL(18,2))       AS monthly_cogs_usd,
    CAST(avg_inventory_value_usd AS DECIMAL(18,2)) AS avg_inventory_value_usd,
    CAST(annualized_turns AS DECIMAL(8,2))         AS annualized_turns,
    turns_rating
FROM supply_chain_demo.semantic.inventory_turns_by_warehouse
WHERE period_month >= DATE_TRUNC('quarter', ADD_MONTHS(CURRENT_DATE, -3))
ORDER BY warehouse_id, period_month;


-- ---------------------------------------------------------------------------
-- NL→SQL Worked Example 4
-- Question: "Which categories have the worst fill rate variance?"
-- High stddev = inconsistent fulfillment = harder to plan around
-- ---------------------------------------------------------------------------
SELECT
    sku_category,
    CAST(AVG(fill_rate_pct) AS DECIMAL(7,2))   AS avg_fill_rate_pct,
    CAST(STDDEV(fill_rate_pct) AS DECIMAL(7,2)) AS fill_rate_stddev,
    COUNT(*) AS sku_months
FROM supply_chain_demo.semantic.fill_rate_by_sku
GROUP BY sku_category
ORDER BY fill_rate_stddev DESC;


-- ---------------------------------------------------------------------------
-- NL→SQL Worked Example 5
-- Question: "Which supplier had the biggest OTIF improvement month over month?"
-- Uses LAG window function across the monthly grain
-- ---------------------------------------------------------------------------
SELECT
    supplier_name,
    period_month,
    CAST(otif_pct AS DECIMAL(6,2))                            AS otif_pct,
    CAST(
        otif_pct
        - LAG(otif_pct) OVER (PARTITION BY supplier_id ORDER BY period_month)
    AS DECIMAL(6,2))                                          AS mom_delta_pct
FROM supply_chain_demo.semantic.otif_scorecard
ORDER BY mom_delta_pct DESC NULLS LAST
LIMIT 20;


-- ==========================================================================
-- Dashboard Panel Queries (production-ready, parameterized)
-- ==========================================================================


-- ---------------------------------------------------------------------------
-- Panel: Executive OTIF Summary (last 6 months, all suppliers)
-- ---------------------------------------------------------------------------
SELECT
    period_month,
    COUNT(DISTINCT supplier_id)                            AS supplier_count,
    CAST(AVG(otif_pct) AS DECIMAL(6,2))                   AS avg_otif_pct,
    CAST(MIN(otif_pct) AS DECIMAL(6,2))                   AS min_otif_pct,
    CAST(PERCENTILE_APPROX(otif_pct, 0.25) AS DECIMAL(6,2)) AS p25_otif_pct,
    CAST(PERCENTILE_APPROX(otif_pct, 0.75) AS DECIMAL(6,2)) AS p75_otif_pct,
    SUM(total_shipments)                                   AS total_shipments
FROM supply_chain_demo.semantic.otif_scorecard
WHERE period_month >= DATE_TRUNC('month', ADD_MONTHS(CURRENT_DATE, -6))
GROUP BY period_month
ORDER BY period_month;


-- ---------------------------------------------------------------------------
-- Panel: Fill Rate Heat Map (last 3 months, by category)
-- ---------------------------------------------------------------------------
SELECT
    sku_category,
    period_month,
    CAST(AVG(fill_rate_pct) AS DECIMAL(7,2))   AS avg_fill_rate_pct,
    COUNT(CASE WHEN fill_rate_status = 'Critical' THEN 1 END) AS critical_sku_count,
    COUNT(CASE WHEN fill_rate_status = 'At Risk'  THEN 1 END) AS at_risk_sku_count,
    COUNT(CASE WHEN fill_rate_status = 'Healthy'  THEN 1 END) AS healthy_sku_count
FROM supply_chain_demo.semantic.fill_rate_by_sku
WHERE period_month >= DATE_TRUNC('month', ADD_MONTHS(CURRENT_DATE, -3))
GROUP BY sku_category, period_month
ORDER BY sku_category, period_month;


-- ---------------------------------------------------------------------------
-- Panel: Inventory Risk Map (current period, by warehouse)
-- ---------------------------------------------------------------------------
SELECT
    warehouse_id,
    COUNT(CASE WHEN supply_status = 'Critical'    THEN 1 END) AS critical_skus,
    COUNT(CASE WHEN supply_status = 'Low'         THEN 1 END) AS low_skus,
    COUNT(CASE WHEN supply_status = 'Healthy'     THEN 1 END) AS healthy_skus,
    COUNT(CASE WHEN supply_status = 'Overstocked' THEN 1 END) AS overstocked_skus,
    CAST(AVG(days_of_supply) AS DECIMAL(8,1))                 AS avg_dos
FROM supply_chain_demo.semantic.days_of_supply_by_warehouse
WHERE period_month = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY warehouse_id
ORDER BY critical_skus DESC;


-- ---------------------------------------------------------------------------
-- Panel: Supplier Scorecard Leaderboard (latest month)
-- ---------------------------------------------------------------------------
SELECT
    supplier_name,
    score_tier,
    CAST(composite_score AS DECIMAL(6,2)) AS composite_score,
    CAST(otif_pct AS DECIMAL(6,2))        AS otif_pct,
    CAST(lead_time_score AS DECIMAL(6,2)) AS lead_time_score,
    CAST(quality_score AS DECIMAL(6,2))   AS quality_score,
    total_shipments
FROM supply_chain_demo.semantic.supplier_scorecard
WHERE period_month = (SELECT MAX(period_month) FROM supply_chain_demo.semantic.supplier_scorecard)
ORDER BY composite_score DESC;


-- ---------------------------------------------------------------------------
-- Panel: Inventory Turns Trend (last 12 months, all warehouses aggregated)
-- ---------------------------------------------------------------------------
SELECT
    period_month,
    CAST(SUM(monthly_cogs_usd) AS DECIMAL(18,2))           AS total_cogs_usd,
    CAST(AVG(avg_inventory_value_usd) AS DECIMAL(18,2))    AS avg_inventory_value_usd,
    CAST(SUM(monthly_cogs_usd) / NULLIF(AVG(avg_inventory_value_usd), 0)
         AS DECIMAL(8,2))                                  AS blended_monthly_turns,
    CAST(SUM(monthly_cogs_usd) / NULLIF(AVG(avg_inventory_value_usd), 0) * 12
         AS DECIMAL(8,2))                                  AS blended_annualized_turns
FROM supply_chain_demo.semantic.inventory_turns_by_warehouse
WHERE period_month >= DATE_TRUNC('month', ADD_MONTHS(CURRENT_DATE, -12))
GROUP BY period_month
ORDER BY period_month;
