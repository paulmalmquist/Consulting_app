-- 341_semantic_catalog_seed.sql
-- Seeds the live semantic catalog from the static Python/TypeScript definitions.
-- Business: Meridian Capital Management (a1b2c3d4-0001-0001-0001-000000000001)
-- Idempotent: ON CONFLICT DO NOTHING

-- =============================================================================
-- I. Catalog version — initial publish
-- =============================================================================

INSERT INTO semantic_catalog_version (business_id, version_number, publisher, changelog)
VALUES ('a1b2c3d4-0001-0001-0001-000000000001', 1, 'system', 'Initial seed from static catalog')
ON CONFLICT (business_id, version_number) DO NOTHING;

-- =============================================================================
-- II. Entity definitions — mirrors catalog.py ENTITY_TABLES + PDS_TABLES
-- =============================================================================

INSERT INTO semantic_entity_def (business_id, entity_key, display_name, description, table_name, pk_column, business_id_path, parent_entity_key, parent_fk_column) VALUES
    ('a1b2c3d4-0001-0001-0001-000000000001', 'fund', 'Fund', 'A PE fund vehicle', 'repe_fund', 'fund_id', 'repe_fund.business_id', NULL, NULL),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'deal', 'Deal', 'An investment / deal within a fund', 'repe_deal', 'deal_id', 'repe_deal.fund_id → repe_fund.business_id', 'fund', 'fund_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'asset', 'Asset', 'A physical asset backing a deal', 'repe_asset', 'asset_id', 'repe_asset.deal_id → repe_deal.fund_id → repe_fund.business_id', 'deal', 'deal_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'property_asset', 'Property Asset', 'CRE-specific asset detail (multifamily, office, etc.)', 'repe_property_asset', 'asset_id', 'repe_property_asset.asset_id → repe_asset.deal_id → repe_deal.fund_id → repe_fund.business_id', 'asset', 'asset_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'partner', 'Partner', 'An LP or GP in a fund', 're_partner', 'partner_id', 're_partner.fund_id → repe_fund.business_id', 'fund', 'fund_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'loan', 'Loan', 'Loan tracking — amount, rate, maturity, covenants', 're_loan', 'loan_id', 're_loan.asset_id → repe_asset.deal_id → repe_deal.fund_id → repe_fund.business_id', 'asset', 'asset_id'),
    -- Financial statement entities
    ('a1b2c3d4-0001-0001-0001-000000000001', 'monthly_noi', 'Monthly NOI', 'Monthly P&L actuals by line code', 'acct_normalized_noi_monthly', 'id', 'acct_normalized_noi_monthly.business_id', 'asset', 'asset_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'statement_line_def', 'Statement Line Definition', 'What each line_code means', 'acct_statement_line_def', 'line_code', NULL, NULL, NULL),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'asset_quarter_rollup', 'Asset Quarter Rollup', 'Quarterly GL rollup per asset', 're_asset_acct_quarter_rollup', 'id', 're_asset_acct_quarter_rollup.business_id', 'asset', 'asset_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'asset_occupancy', 'Asset Occupancy', 'Asset occupancy and leasing metrics per quarter', 're_asset_occupancy_quarter', 'id', NULL, 'asset', 'asset_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'asset_quarter_state', 'Asset Quarter State', 'Authoritative quarterly snapshot per asset', 're_asset_quarter_state', 'id', NULL, 'asset', 'asset_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'fund_quarter_state', 'Fund Quarter State', 'Fund-level quarterly snapshot — NAV, returns, leverage', 're_fund_quarter_state', 'id', NULL, 'fund', 'fund_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'fund_quarter_metrics', 'Fund Quarter Metrics', 'Simpler fund performance metrics by quarter', 're_fund_quarter_metrics', 'id', NULL, 'fund', 'fund_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'partner_quarter_metrics', 'Partner Quarter Metrics', 'Per-LP quarterly performance metrics', 're_partner_quarter_metrics', 'id', NULL, 'partner', 'partner_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'loan_covenant', 'Loan Covenant Result', 'Covenant test results per quarter', 're_loan_covenant_result_qtr', 'id', NULL, 'loan', 'loan_id'),
    -- PDS entities
    ('a1b2c3d4-0001-0001-0001-000000000001', 'program', 'Program', 'A group of related capital projects', 'pds_programs', 'program_id', 'pds_programs.business_id', NULL, NULL),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'project', 'Project', 'Capital project — budget, schedule, risk tracking', 'pds_projects', 'project_id', 'pds_projects.business_id', 'program', 'program_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'budget_line', 'Budget Line', 'Budget line items per project per cost code', 'pds_budget_lines', 'budget_line_id', NULL, 'project', 'project_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'contract', 'Contract', 'Vendor/subcontractor contracts within a project', 'pds_contracts', 'contract_id', NULL, 'project', 'project_id'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'change_order', 'Change Order', 'Change orders modifying project scope or budget', 'pds_change_orders', 'change_order_id', NULL, 'project', 'project_id')
ON CONFLICT (business_id, entity_key) DO NOTHING;

-- =============================================================================
-- III. Metric definitions — mirrors metric-catalog.ts + materialization.py
-- =============================================================================

INSERT INTO semantic_metric_def (business_id, metric_key, display_name, description, sql_template, unit, aggregation, entity_key) VALUES
    -- Income Statement
    ('a1b2c3d4-0001-0001-0001-000000000001', 'RENT', 'Rental Revenue', 'Gross rental income', 'SUM(amount) FILTER (WHERE line_code = ''RENT'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'OTHER_INCOME', 'Other Income', 'Ancillary and fee income', 'SUM(amount) FILTER (WHERE line_code = ''OTHER_INCOME'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'EGI', 'Effective Gross Income', 'Total revenue after vacancy', 'SUM(amount) FILTER (WHERE line_code = ''EGI'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'PAYROLL', 'Payroll & Benefits', 'Staff compensation', 'SUM(amount) FILTER (WHERE line_code = ''PAYROLL'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'REPAIRS_MAINT', 'Repairs & Maintenance', 'Property maintenance costs', 'SUM(amount) FILTER (WHERE line_code = ''REPAIRS_MAINT'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'UTILITIES', 'Utilities', 'Electric, gas, water', 'SUM(amount) FILTER (WHERE line_code = ''UTILITIES'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'TAXES', 'Real Estate Taxes', 'Property tax expense', 'SUM(amount) FILTER (WHERE line_code = ''TAXES'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'INSURANCE', 'Insurance', 'Property insurance', 'SUM(amount) FILTER (WHERE line_code = ''INSURANCE'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'MGMT_FEES', 'Management Fees', 'Property management fees', 'SUM(amount) FILTER (WHERE line_code = ''MGMT_FEES'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'TOTAL_OPEX', 'Total Operating Expenses', 'Sum of all operating expenses', 'SUM(amount) FILTER (WHERE line_code = ''TOTAL_OPEX'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'NOI', 'Net Operating Income', 'EGI minus operating expenses', 'SUM(amount) FILTER (WHERE line_code = ''NOI'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'NOI_MARGIN', 'NOI Margin', 'NOI as percentage of EGI', 'SUM(amount) FILTER (WHERE line_code = ''NOI'') / NULLIF(SUM(amount) FILTER (WHERE line_code = ''EGI''), 0)', 'percent', 'avg', 'asset'),
    -- Cash Flow
    ('a1b2c3d4-0001-0001-0001-000000000001', 'CAPEX', 'Capital Expenditures', 'Property improvements', 'SUM(amount) FILTER (WHERE line_code = ''CAPEX'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'TENANT_IMPROVEMENTS', 'Tenant Improvements', 'TI spend', 'SUM(amount) FILTER (WHERE line_code = ''TENANT_IMPROVEMENTS'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'LEASING_COMMISSIONS', 'Leasing Commissions', 'Broker commissions', 'SUM(amount) FILTER (WHERE line_code = ''LEASING_COMMISSIONS'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'REPLACEMENT_RESERVES', 'Replacement Reserves', 'Capital reserve accrual', 'SUM(amount) FILTER (WHERE line_code = ''REPLACEMENT_RESERVES'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'DEBT_SERVICE_INT', 'Interest Expense', 'Loan interest', 'SUM(amount) FILTER (WHERE line_code = ''DEBT_SERVICE_INT'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'DEBT_SERVICE_PRIN', 'Principal Amortization', 'Loan paydown', 'SUM(amount) FILTER (WHERE line_code = ''DEBT_SERVICE_PRIN'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'TOTAL_DEBT_SERVICE', 'Total Debt Service', 'Interest + principal', 'SUM(amount) FILTER (WHERE line_code = ''TOTAL_DEBT_SERVICE'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'NET_CASH_FLOW', 'Net Cash Flow', 'NOI minus all below-NOI items', 'SUM(amount) FILTER (WHERE line_code = ''NET_CASH_FLOW'')', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'DSCR', 'Debt Service Coverage', 'NOI / Total Debt Service', 'SUM(amount) FILTER (WHERE line_code = ''NOI'') / NULLIF(SUM(amount) FILTER (WHERE line_code = ''TOTAL_DEBT_SERVICE''), 0)', 'ratio', 'avg', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'DEBT_YIELD', 'Debt Yield', 'NOI divided by total debt', 'noi / NULLIF(debt_balance, 0)', 'percent', 'avg', 'asset'),
    -- KPIs
    ('a1b2c3d4-0001-0001-0001-000000000001', 'OCCUPANCY', 'Occupancy', 'Physical occupancy rate', 'AVG(occupancy)', 'percent', 'avg', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'AVG_RENT', 'Avg Rent / Unit', 'Average monthly rent per unit', 'AVG(avg_rent)', 'dollar', 'avg', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'ASSET_VALUE', 'Asset Value', 'Current appraised or modeled value', 'SUM(asset_value)', 'dollar', 'sum', 'asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'LTV', 'Loan-to-Value', 'Debt / asset value', 'SUM(debt_balance) / NULLIF(SUM(asset_value), 0)', 'percent', 'avg', 'asset'),
    -- Fund-level returns
    ('a1b2c3d4-0001-0001-0001-000000000001', 'GROSS_IRR', 'Gross IRR', 'Fund gross internal rate of return', 'gross_irr', 'percent', 'latest', 'fund'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'NET_IRR', 'Net IRR', 'Fund net IRR after fees', 'net_irr', 'percent', 'latest', 'fund'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'TVPI', 'TVPI', 'Total value to paid-in capital', 'tvpi', 'ratio', 'latest', 'fund'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'DPI', 'DPI', 'Distributions to paid-in', 'dpi', 'ratio', 'latest', 'fund'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'RVPI', 'RVPI', 'Residual value to paid-in', 'rvpi', 'ratio', 'latest', 'fund'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'PORTFOLIO_NAV', 'Portfolio NAV', 'Net asset value', 'portfolio_nav', 'dollar', 'latest', 'fund'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'WEIGHTED_LTV', 'Weighted LTV', 'Portfolio weighted loan-to-value', 'weighted_ltv', 'percent', 'latest', 'fund'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'WEIGHTED_DSCR', 'Weighted DSCR', 'Portfolio weighted DSCR', 'weighted_dscr', 'ratio', 'latest', 'fund'),
    -- PDS construction metrics
    ('a1b2c3d4-0001-0001-0001-000000000001', 'BUDGET_VARIANCE', 'Budget Variance', 'Approved budget minus forecast at completion', 'approved_budget - forecast_at_completion', 'dollar', 'sum', 'project'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'CONTINGENCY_BURN', 'Contingency Burn', 'Percentage of contingency consumed', '1 - (contingency_remaining / NULLIF(contingency_budget, 0))', 'percent', 'avg', 'project'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'COMMITTED_PCT', 'Committed %%', 'Committed amount as percent of approved budget', 'committed_amount / NULLIF(approved_budget, 0)', 'percent', 'avg', 'project'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'CHANGE_ORDER_TOTAL', 'Change Order Total', 'Sum of approved change order amounts', 'SUM(amount) FILTER (WHERE status = ''approved'')', 'dollar', 'sum', 'project')
ON CONFLICT (business_id, metric_key, version) DO NOTHING;

-- =============================================================================
-- IV. Dimension definitions — common slicers for analytics
-- =============================================================================

INSERT INTO semantic_dimension_def (business_id, dimension_key, display_name, description, entity_key, column_name, data_type) VALUES
    ('a1b2c3d4-0001-0001-0001-000000000001', 'quarter', 'Quarter', 'Fiscal quarter (e.g. 2025Q4)', 'asset_quarter_state', 'quarter', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'period_month', 'Month', 'Calendar month (e.g. 2025-10-01)', 'monthly_noi', 'period_month', 'date'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'property_type', 'Property Type', 'CRE property type (multifamily, office, etc.)', 'property_asset', 'property_type', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'market', 'Market', 'Geographic market name', 'property_asset', 'market', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'fund_type', 'Fund Type', 'Fund structure type', 'fund', 'fund_type', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'strategy', 'Strategy', 'Investment strategy (equity, debt)', 'fund', 'strategy', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'vintage_year', 'Vintage Year', 'Fund vintage year', 'fund', 'vintage_year', 'integer'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'deal_stage', 'Deal Stage', 'Deal pipeline stage', 'deal', 'stage', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'fund_status', 'Fund Status', 'Fund lifecycle status', 'fund', 'status', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'line_code', 'Line Code', 'Statement line code', 'monthly_noi', 'line_code', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'covenant_type', 'Covenant Type', 'Loan covenant type (DSCR, LTV, DEBT_YIELD)', 'loan_covenant', 'covenant_type', 'text'),
    -- PDS dimensions
    ('a1b2c3d4-0001-0001-0001-000000000001', 'project_stage', 'Project Stage', 'Construction project stage', 'project', 'stage', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'project_status', 'Project Status', 'Project lifecycle status', 'project', 'status', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'cost_code', 'Cost Code', 'Budget cost code', 'budget_line', 'cost_code', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'contract_type', 'Contract Type', 'Vendor contract type', 'contract', 'contract_type', 'text'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'change_order_status', 'CO Status', 'Change order approval status', 'change_order', 'status', 'text')
ON CONFLICT (business_id, dimension_key) DO NOTHING;

-- =============================================================================
-- V. Validated join paths — mirrors catalog.py JOIN_GRAPH
-- =============================================================================

INSERT INTO semantic_join_def (business_id, from_entity_key, to_entity_key, join_sql, cardinality, is_safe, validated_by) VALUES
    -- REPE hierarchy
    ('a1b2c3d4-0001-0001-0001-000000000001', 'deal', 'fund', 'repe_deal.fund_id = repe_fund.fund_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'asset', 'deal', 'repe_asset.deal_id = repe_deal.deal_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'property_asset', 'asset', 'repe_property_asset.asset_id = repe_asset.asset_id', 'one_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'partner', 'fund', 're_partner.fund_id = repe_fund.fund_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'loan', 'asset', 're_loan.asset_id = repe_asset.asset_id', 'many_to_one', true, 'system'),
    -- Financial → entity joins
    ('a1b2c3d4-0001-0001-0001-000000000001', 'monthly_noi', 'asset', 'acct_normalized_noi_monthly.asset_id = repe_asset.asset_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'asset_quarter_rollup', 'asset', 're_asset_acct_quarter_rollup.asset_id = repe_asset.asset_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'asset_occupancy', 'asset', 're_asset_occupancy_quarter.asset_id = repe_asset.asset_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'asset_quarter_state', 'asset', 're_asset_quarter_state.asset_id = repe_asset.asset_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'fund_quarter_state', 'fund', 're_fund_quarter_state.fund_id = repe_fund.fund_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'fund_quarter_metrics', 'fund', 're_fund_quarter_metrics.fund_id = repe_fund.fund_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'partner_quarter_metrics', 'fund', 're_partner_quarter_metrics.fund_id = repe_fund.fund_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'partner_quarter_metrics', 'partner', 're_partner_quarter_metrics.partner_id = re_partner.partner_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'loan_covenant', 'loan', 're_loan_covenant_result_qtr.loan_id = re_loan.loan_id', 'many_to_one', true, 'system'),
    -- PDS hierarchy
    ('a1b2c3d4-0001-0001-0001-000000000001', 'project', 'program', 'pds_projects.program_id = pds_programs.program_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'budget_line', 'project', 'pds_budget_lines.project_id = pds_projects.project_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'contract', 'project', 'pds_contracts.project_id = pds_projects.project_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'change_order', 'project', 'pds_change_orders.project_id = pds_projects.project_id', 'many_to_one', true, 'system'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'change_order', 'contract', 'pds_change_orders.contract_id = pds_contracts.contract_id', 'many_to_one', true, 'system')
ON CONFLICT (business_id, from_entity_key, to_entity_key) DO NOTHING;

-- =============================================================================
-- VI. Key lineage edges — how derived metrics flow
-- =============================================================================

INSERT INTO semantic_lineage_edge (business_id, source_table, source_column, target_table, target_column, transform_type, transform_sql) VALUES
    ('a1b2c3d4-0001-0001-0001-000000000001', 'acct_normalized_noi_monthly', 'amount', 're_asset_acct_quarter_rollup', 'noi', 'aggregation', 'SUM(amount) WHERE line_code = ''NOI'' GROUP BY quarter'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'acct_normalized_noi_monthly', 'amount', 're_asset_acct_quarter_rollup', 'revenue', 'aggregation', 'SUM(amount) WHERE line_code = ''EGI'' GROUP BY quarter'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'acct_normalized_noi_monthly', 'amount', 're_asset_acct_quarter_rollup', 'opex', 'aggregation', 'SUM(amount) WHERE line_code = ''TOTAL_OPEX'' GROUP BY quarter'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_asset_acct_quarter_rollup', 'noi', 're_asset_quarter_state', 'noi', 'direct', NULL),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_asset_quarter_state', 'noi', 're_fund_quarter_state', 'portfolio_nav', 'aggregation', 'SUM across fund assets'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_loan', 'loan_amount', 're_asset_quarter_state', 'debt_balance', 'direct', NULL),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_asset_quarter_state', 'debt_balance', 're_fund_quarter_state', 'weighted_ltv', 'calculation', 'SUM(debt) / SUM(value) weighted by asset'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_asset_occupancy_quarter', 'occupancy', 'repe_property_asset', 'occupancy', 'direct', 'Latest quarter snapshot');

-- =============================================================================
-- VII. Data contracts — freshness and completeness SLAs
-- =============================================================================

INSERT INTO semantic_data_contract (business_id, table_name, freshness_sla_minutes, completeness_threshold, owner, description) VALUES
    ('a1b2c3d4-0001-0001-0001-000000000001', 'acct_normalized_noi_monthly', 1440, 0.9500, 'accounting', 'Monthly actuals must be loaded within 24 hours of month-end close'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_asset_acct_quarter_rollup', 4320, 0.9000, 'accounting', 'Quarterly rollup within 3 days of quarter close'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_fund_quarter_state', 4320, 0.9500, 'fund_ops', 'Fund snapshot within 3 days of quarter close'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_asset_occupancy_quarter', 4320, 0.9000, 'property_mgmt', 'Occupancy data within 3 days of quarter close'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'repe_fund', 10080, 0.9900, 'fund_ops', 'Fund master data always current'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'repe_asset', 10080, 0.9900, 'asset_mgmt', 'Asset master data always current'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_loan', 10080, 0.9500, 'capital_markets', 'Loan data refreshed weekly'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 're_loan_covenant_result_qtr', 4320, 0.9500, 'capital_markets', 'Covenant results within 3 days of quarter close')
ON CONFLICT (business_id, table_name) DO NOTHING;
