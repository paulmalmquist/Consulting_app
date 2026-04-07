-- 448_metric_routing_seed.sql
-- Populates routing metadata (query_strategy, template_key, service_function,
-- aliases, metric_family, allowed_breakouts, time_behavior, polarity, format_hint_fe)
-- for all metrics seeded in 341_semantic_catalog_seed.sql, plus 4 new metrics.
-- Business: Meridian Capital Management (a1b2c3d4-0001-0001-0001-000000000001)
-- Idempotent: uses UPDATE ... WHERE + INSERT ... ON CONFLICT
-- Depends on: 447_metric_routing_metadata.sql

-- =============================================================================
-- I. Update existing Income Statement metrics (entity_key = asset)
-- =============================================================================

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'up_good', format_hint_fe = 'dollar',
  aliases = '{"rental revenue", "rent", "gross rent", "rental income"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'RENT';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'up_good', format_hint_fe = 'dollar',
  aliases = '{"other income", "ancillary income", "fee income", "misc income"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'OTHER_INCOME';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'up_good', format_hint_fe = 'dollar',
  aliases = '{"effective gross income", "egi", "total revenue", "gross income"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'EGI';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"payroll", "staff costs", "compensation", "payroll and benefits"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'PAYROLL';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"repairs", "maintenance", "r&m", "repairs and maintenance"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'REPAIRS_MAINT';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"utilities", "electric", "gas", "water", "utility costs"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'UTILITIES';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"taxes", "real estate taxes", "property tax", "re taxes"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'TAXES';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"insurance", "property insurance", "hazard insurance"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'INSURANCE';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"management fees", "mgmt fees", "pm fees", "property management fees"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'MGMT_FEES';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"total opex", "operating expenses", "opex", "total operating expenses"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'TOTAL_OPEX';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'up_good', format_hint_fe = 'dollar',
  template_key = 'repe.noi_ranked',
  aliases = '{"noi", "net operating income", "operating income", "noi amount"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'NOI';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'income', time_behavior = 'additive_period',
  polarity = 'up_good', format_hint_fe = 'percent',
  aliases = '{"noi margin", "operating margin", "profit margin"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'NOI_MARGIN';

-- =============================================================================
-- II. Update existing Cash Flow metrics (entity_key = asset)
-- =============================================================================

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'cash_flow', time_behavior = 'additive_period',
  polarity = 'neutral', format_hint_fe = 'dollar',
  aliases = '{"capex", "capital expenditures", "capital spending", "property improvements"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'CAPEX';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'cash_flow', time_behavior = 'additive_period',
  polarity = 'neutral', format_hint_fe = 'dollar',
  aliases = '{"tenant improvements", "ti", "ti spend", "tenant build-out"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'TENANT_IMPROVEMENTS';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'cash_flow', time_behavior = 'additive_period',
  polarity = 'neutral', format_hint_fe = 'dollar',
  aliases = '{"leasing commissions", "broker commissions", "lc"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'LEASING_COMMISSIONS';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'cash_flow', time_behavior = 'additive_period',
  polarity = 'neutral', format_hint_fe = 'dollar',
  aliases = '{"replacement reserves", "reserves", "capital reserves"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'REPLACEMENT_RESERVES';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'cash_flow', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"interest expense", "loan interest", "interest payment", "debt interest"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'DEBT_SERVICE_INT';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'cash_flow', time_behavior = 'additive_period',
  polarity = 'neutral', format_hint_fe = 'dollar',
  aliases = '{"principal amortization", "principal payment", "loan paydown"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'DEBT_SERVICE_PRIN';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'cash_flow', time_behavior = 'additive_period',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"total debt service", "debt service", "tds", "mortgage payment"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'TOTAL_DEBT_SERVICE';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'cash_flow', time_behavior = 'additive_period',
  polarity = 'up_good', format_hint_fe = 'dollar',
  aliases = '{"net cash flow", "ncf", "cash flow", "free cash flow", "levered cash flow"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'NET_CASH_FLOW';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'leverage', time_behavior = 'point_in_time',
  polarity = 'up_good', format_hint_fe = 'ratio',
  template_key = 'repe.dscr_ranked',
  aliases = '{"dscr", "debt service coverage", "debt coverage ratio", "debt service coverage ratio"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'DSCR';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'leverage', time_behavior = 'point_in_time',
  polarity = 'up_good', format_hint_fe = 'percent',
  aliases = '{"debt yield", "dy", "noi to debt", "noi over debt"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'DEBT_YIELD';

-- =============================================================================
-- III. Update existing KPI metrics (entity_key = asset)
-- =============================================================================

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'occupancy', time_behavior = 'point_in_time',
  polarity = 'up_good', format_hint_fe = 'percent',
  template_key = 'repe.occupancy_ranked',
  aliases = '{"occupancy", "occ", "occupancy rate", "vacancy", "physical occupancy"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'OCCUPANCY';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'occupancy', time_behavior = 'point_in_time',
  polarity = 'up_good', format_hint_fe = 'dollar',
  aliases = '{"average rent", "avg rent", "rent per unit", "average rent per unit"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'AVG_RENT';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'valuation', time_behavior = 'point_in_time',
  polarity = 'up_good', format_hint_fe = 'dollar',
  aliases = '{"asset value", "property value", "appraised value", "market value"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'ASSET_VALUE';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'leverage', time_behavior = 'point_in_time',
  polarity = 'down_good', format_hint_fe = 'percent',
  template_key = 'repe.ltv_ranked',
  aliases = '{"ltv", "loan to value", "loan-to-value", "leverage ratio"}',
  allowed_breakouts = '{fund, market, property_type, quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'LTV';

-- =============================================================================
-- IV. Update existing Fund-level return metrics (entity_key = fund)
-- =============================================================================

UPDATE semantic_metric_def SET
  query_strategy = 'template', template_key = 'repe.fund_returns',
  metric_family = 'returns', time_behavior = 'latest_snapshot',
  polarity = 'up_good', format_hint_fe = 'percent',
  aliases = '{"gross irr", "pre-fee irr", "gross internal rate of return", "fund irr", "gross return"}',
  allowed_breakouts = '{quarter, vintage_year, strategy}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'GROSS_IRR';

UPDATE semantic_metric_def SET
  query_strategy = 'template', template_key = 'repe.fund_returns',
  metric_family = 'returns', time_behavior = 'latest_snapshot',
  polarity = 'up_good', format_hint_fe = 'percent',
  aliases = '{"net irr", "after-fee irr", "net internal rate of return", "net return", "lp irr"}',
  allowed_breakouts = '{quarter, vintage_year, strategy}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'NET_IRR';

UPDATE semantic_metric_def SET
  query_strategy = 'template', template_key = 'repe.fund_returns',
  metric_family = 'returns', time_behavior = 'latest_snapshot',
  polarity = 'up_good', format_hint_fe = 'ratio',
  aliases = '{"tvpi", "total value", "total value to paid in", "total multiple", "total value paid in"}',
  allowed_breakouts = '{quarter, vintage_year, strategy}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'TVPI';

UPDATE semantic_metric_def SET
  query_strategy = 'template', template_key = 'repe.fund_returns',
  metric_family = 'returns', time_behavior = 'latest_snapshot',
  polarity = 'up_good', format_hint_fe = 'ratio',
  aliases = '{"dpi", "distributions to paid in", "distributed to paid in", "distribution multiple", "cash multiple"}',
  allowed_breakouts = '{quarter, vintage_year, strategy}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'DPI';

UPDATE semantic_metric_def SET
  query_strategy = 'template', template_key = 'repe.fund_returns',
  metric_family = 'returns', time_behavior = 'latest_snapshot',
  polarity = 'up_good', format_hint_fe = 'ratio',
  aliases = '{"rvpi", "residual value", "residual value to paid in", "unrealized multiple", "unrealized value"}',
  allowed_breakouts = '{quarter, vintage_year, strategy}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'RVPI';

UPDATE semantic_metric_def SET
  query_strategy = 'service', service_function = 'portfolio_kpis',
  metric_family = 'capital', time_behavior = 'latest_snapshot',
  polarity = 'up_good', format_hint_fe = 'dollar',
  aliases = '{"portfolio nav", "nav", "net asset value", "fund nav", "total nav"}',
  allowed_breakouts = '{quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'PORTFOLIO_NAV';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'leverage', time_behavior = 'latest_snapshot',
  polarity = 'down_good', format_hint_fe = 'percent',
  aliases = '{"weighted ltv", "portfolio ltv", "weighted loan to value", "fund ltv"}',
  allowed_breakouts = '{quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'WEIGHTED_LTV';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'leverage', time_behavior = 'latest_snapshot',
  polarity = 'up_good', format_hint_fe = 'ratio',
  aliases = '{"weighted dscr", "portfolio dscr", "weighted debt coverage", "fund dscr"}',
  allowed_breakouts = '{quarter}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'WEIGHTED_DSCR';

-- =============================================================================
-- V. Update existing PDS construction metrics (entity_key = project)
-- =============================================================================

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'construction', time_behavior = 'point_in_time',
  polarity = 'down_good', format_hint_fe = 'dollar',
  aliases = '{"budget variance", "variance", "over budget", "under budget", "budget delta"}',
  allowed_breakouts = '{project_stage, project_status}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'BUDGET_VARIANCE';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'construction', time_behavior = 'point_in_time',
  polarity = 'down_good', format_hint_fe = 'percent',
  aliases = '{"contingency burn", "contingency usage", "contingency consumed", "contingency pct"}',
  allowed_breakouts = '{project_stage, project_status}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'CONTINGENCY_BURN';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'construction', time_behavior = 'point_in_time',
  polarity = 'up_good', format_hint_fe = 'percent',
  aliases = '{"committed percent", "committed pct", "commitment rate", "percent committed"}',
  allowed_breakouts = '{project_stage, project_status}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'COMMITTED_PCT';

UPDATE semantic_metric_def SET
  query_strategy = 'semantic', metric_family = 'construction', time_behavior = 'additive_period',
  polarity = 'neutral', format_hint_fe = 'dollar',
  aliases = '{"change order total", "change orders", "co total", "approved change orders"}',
  allowed_breakouts = '{project_stage, project_status, change_order_status}'
WHERE business_id = 'a1b2c3d4-0001-0001-0001-000000000001' AND metric_key = 'CHANGE_ORDER_TOTAL';

-- =============================================================================
-- VI. Insert NEW metrics not in original seed
-- =============================================================================

INSERT INTO semantic_metric_def (
  business_id, metric_key, display_name, description, sql_template,
  unit, aggregation, entity_key,
  query_strategy, service_function, metric_family, time_behavior,
  polarity, format_hint_fe, aliases, allowed_breakouts
) VALUES
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'FUND_COUNT', 'Fund Count',
    'Number of active funds in the portfolio',
    'COUNT(DISTINCT fund_id)',
    'count', 'count', 'fund',
    'service', 'portfolio_kpis', 'capital', 'point_in_time',
    'up_good', 'count',
    '{"fund count", "number of funds", "total funds", "how many funds"}',
    '{quarter}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'ACTIVE_ASSET_COUNT', 'Active Asset Count',
    'Number of active property assets (excludes disposed, pipeline)',
    'COUNT(*) FILTER (WHERE asset_status IS NULL OR asset_status IN (''active'',''held'',''lease_up'',''operating''))',
    'count', 'count', 'asset',
    'service', 'portfolio_kpis', 'capital', 'point_in_time',
    'up_good', 'count',
    '{"active assets", "asset count", "number of assets", "how many assets", "property count"}',
    '{fund, market, property_type}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'TOTAL_COMMITMENTS', 'Total Commitments',
    'Sum of active and fully-called partner commitments',
    'SUM(amount) FILTER (WHERE status IN (''active'',''fully_called''))',
    'dollar', 'sum', 'fund',
    'service', 'portfolio_kpis', 'capital', 'point_in_time',
    'up_good', 'dollar',
    '{"total commitments", "committed capital", "commitments", "total committed", "capital commitments"}',
    '{fund, quarter}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'GROSS_IRR_WEIGHTED', 'Weighted Gross IRR',
    'NAV-weighted average gross IRR across funds',
    'SUM(gross_irr * portfolio_nav) / NULLIF(SUM(portfolio_nav), 0)',
    'percent', 'latest', 'fund',
    'service', 'portfolio_kpis', 'returns', 'latest_snapshot',
    'up_good', 'percent',
    '{"weighted gross irr", "portfolio gross irr", "weighted irr", "aggregate irr"}',
    '{quarter}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'NET_IRR_WEIGHTED', 'Weighted Net IRR',
    'NAV-weighted average net IRR across funds',
    'SUM(net_irr * portfolio_nav) / NULLIF(SUM(portfolio_nav), 0)',
    'percent', 'latest', 'fund',
    'service', 'portfolio_kpis', 'returns', 'latest_snapshot',
    'up_good', 'percent',
    '{"weighted net irr", "portfolio net irr", "weighted net return", "aggregate net irr"}',
    '{quarter}'
  )
ON CONFLICT (business_id, metric_key, version) DO NOTHING;
