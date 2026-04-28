-- =============================================================================
-- Supply Chain Demo — 04: Semantic Layer
--
-- Semantic views sit on top of gold tables. They are the single source of
-- truth for all consumers: Genie, BI tools, APIs, and the AI NL→SQL layer.
--
-- Rules enforced here:
--   - Every view has a COMMENT ON VIEW explaining what it measures
--   - Column aliases use business language, not system identifiers
--   - No raw joins — only gold table references
--   - DECIMAL precision is explicit to avoid silent rounding
--
-- Run order: after 03_gold_kpis.py
-- Catalog: supply_chain_demo.semantic.*
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. OTIF Scorecard
-- ---------------------------------------------------------------------------
-- On-Time In-Full delivery rate per supplier per month.
-- OTIF = shipments where actual_delivery <= promised_delivery AND
--        shipped_qty >= ordered_qty, divided by total shipments.
-- Source: gold.supplier_otif_scorecard → silver.silver_fact_shipment_event

CREATE OR REPLACE VIEW supply_chain_demo.semantic.otif_scorecard AS
SELECT
    supplier_id,
    supplier_name,
    tier                       AS supplier_tier,
    country                    AS supplier_country,
    period_month,
    total_shipments,
    otif_shipments,
    CAST(otif_pct AS DECIMAL(6,2))         AS otif_pct,
    CAST(on_time_pct AS DECIMAL(6,2))      AS on_time_pct,
    CAST(in_full_pct AS DECIMAL(6,2))      AS in_full_pct,
    CAST(avg_lead_time_days AS DECIMAL(8,1)) AS avg_lead_time_days,
    CAST(stddev_lead_time_days AS DECIMAL(8,2)) AS lead_time_stddev_days
FROM supply_chain_demo.gold.supplier_otif_scorecard;

COMMENT ON VIEW supply_chain_demo.semantic.otif_scorecard IS
'On-Time In-Full delivery rate by supplier and calendar month.
OTIF definition: a shipment is OTIF when actual_delivery_date <= promised_delivery_date
AND shipped_qty >= ordered_qty. Both conditions must hold.
KPI owner: VP Supply Chain. SLA: refreshed nightly via gold pipeline.
Lineage: bronze.raw_shipments → silver.silver_fact_shipment_event → gold.supplier_otif_scorecard.';


-- ---------------------------------------------------------------------------
-- 2. Fill Rate by SKU
-- ---------------------------------------------------------------------------
-- Measures what fraction of each ordered quantity was actually shipped.
-- Fill rate < 100% indicates a stockout or allocation shortfall.
-- Fill rate > 100% is possible when multiple shipments cover one PO.

CREATE OR REPLACE VIEW supply_chain_demo.semantic.fill_rate_by_sku AS
SELECT
    sku_id,
    description                AS sku_description,
    category                   AS sku_category,
    period_month,
    total_shipped_qty,
    total_ordered_qty,
    CAST(fill_rate_pct AS DECIMAL(7,2)) AS fill_rate_pct,
    CASE
        WHEN fill_rate_pct >= 98 THEN 'Healthy'
        WHEN fill_rate_pct >= 90 THEN 'At Risk'
        ELSE 'Critical'
    END AS fill_rate_status,
    shipment_count
FROM supply_chain_demo.gold.fill_rate_by_sku;

COMMENT ON VIEW supply_chain_demo.semantic.fill_rate_by_sku IS
'Shipped quantity versus ordered quantity by SKU and month.
Fill Rate = SUM(shipped_qty) / SUM(ordered_qty) × 100.
Values above 100% indicate over-shipments or PO consolidation.
Status tiers: Healthy (≥98%), At Risk (90–97%), Critical (<90%).
KPI owner: Inventory Planning. Lineage: bronze.raw_shipments → silver.silver_fact_shipment_event.';


-- ---------------------------------------------------------------------------
-- 3. Days of Supply by Warehouse
-- ---------------------------------------------------------------------------
-- How many days of demand the current inventory on hand can cover.
-- Lower is riskier (closer to stockout). Industry benchmark: 30–45 days.

CREATE OR REPLACE VIEW supply_chain_demo.semantic.days_of_supply_by_warehouse AS
SELECT
    d.sku_id,
    d.warehouse_id,
    d.period_month,
    CAST(d.avg_on_hand_units AS DECIMAL(12,1))      AS avg_on_hand_units,
    CAST(d.avg_daily_demand_units AS DECIMAL(12,2))  AS avg_daily_demand_units,
    CAST(d.days_of_supply AS DECIMAL(8,1))           AS days_of_supply,
    CASE
        WHEN d.days_of_supply IS NULL THEN 'No Demand'
        WHEN d.days_of_supply < 7    THEN 'Critical'
        WHEN d.days_of_supply < 30   THEN 'Low'
        WHEN d.days_of_supply <= 60  THEN 'Healthy'
        ELSE 'Overstocked'
    END AS supply_status
FROM supply_chain_demo.gold.days_of_supply_by_warehouse d;

COMMENT ON VIEW supply_chain_demo.semantic.days_of_supply_by_warehouse IS
'Estimated days of on-hand inventory relative to current demand velocity.
Days of Supply = AVG(on_hand_units) / AVG(daily_demand_units) within each month.
Null values indicate no demand in that period (stock not consumed).
Status tiers: Critical (<7d), Low (7–29d), Healthy (30–60d), Overstocked (>60d).
KPI owner: Warehouse Operations. SLA: refreshed nightly.';


-- ---------------------------------------------------------------------------
-- 4. Supplier Scorecard — Composite
-- ---------------------------------------------------------------------------
-- Single composite score per supplier per month.
-- Weights: OTIF 40%, Lead-Time Consistency 30%, Quality Rating 30%.
-- Score tiers: A (≥90), B (75–89), C (60–74), D (<60).

CREATE OR REPLACE VIEW supply_chain_demo.semantic.supplier_scorecard AS
SELECT
    supplier_id,
    supplier_name,
    supplier_tier,
    supplier_country,
    period_month,
    total_shipments,
    CAST(otif_pct AS DECIMAL(6,2))          AS otif_pct,
    CAST(lt_score AS DECIMAL(6,2))          AS lead_time_score,
    CAST(quality_score AS DECIMAL(6,2))     AS quality_score,
    CAST(composite_score AS DECIMAL(6,2))   AS composite_score,
    score_tier
FROM supply_chain_demo.gold.supplier_scorecard;

COMMENT ON VIEW supply_chain_demo.semantic.supplier_scorecard IS
'Composite supplier performance index by month.
Formula: composite_score = (otif_pct × 0.40) + (lead_time_score × 0.30) + (quality_score × 0.30).
Lead-time score is inverted std-dev of lead_time_days normalized to 0–100.
Quality score is supplier quality_rating (0–5 scale) × 20.
Score tiers: A (≥90), B (75–89), C (60–74), D (<60).
KPI owner: Sourcing & Procurement. Used by Genie and the supplier portal.';


-- ---------------------------------------------------------------------------
-- 5. Inventory Turns by Warehouse
-- ---------------------------------------------------------------------------
-- COGS / Average Inventory Value. Higher turns = more efficient inventory use.
-- Industry benchmark: 8–12 turns per year for discrete manufacturing.

CREATE OR REPLACE VIEW supply_chain_demo.semantic.inventory_turns_by_warehouse AS
SELECT
    warehouse_id,
    period_month,
    CAST(monthly_cogs_usd AS DECIMAL(18,2))          AS monthly_cogs_usd,
    CAST(avg_inventory_value_usd AS DECIMAL(18,2))   AS avg_inventory_value_usd,
    CAST(monthly_inventory_turns AS DECIMAL(8,2))    AS monthly_inventory_turns,
    CAST(annualized_turns AS DECIMAL(8,2))           AS annualized_turns,
    CASE
        WHEN annualized_turns IS NULL THEN 'No Data'
        WHEN annualized_turns >= 12  THEN 'Excellent'
        WHEN annualized_turns >= 8   THEN 'Good'
        WHEN annualized_turns >= 4   THEN 'Fair'
        ELSE 'Poor'
    END AS turns_rating
FROM supply_chain_demo.gold.inventory_turns_by_warehouse;

COMMENT ON VIEW supply_chain_demo.semantic.inventory_turns_by_warehouse IS
'Inventory efficiency metric by warehouse and calendar month.
Formula: Inventory Turns = COGS / AVG(inventory_value_usd).
Annualized = monthly_turns × 12.
COGS is approximated as shipped_qty × unit_cost_usd from silver shipment facts.
Rating tiers: Excellent (≥12/yr), Good (8–11), Fair (4–7), Poor (<4).
KPI owner: Logistics & Operations. Benchmark: 8–12 turns/year for discrete manufacturing.';


-- ---------------------------------------------------------------------------
-- Verification: confirm all 5 views are present and queryable
-- ---------------------------------------------------------------------------
SHOW VIEWS IN supply_chain_demo.semantic;
