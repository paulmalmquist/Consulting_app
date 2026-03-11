-- 343_analytics_workspace_seed.sql
-- Seeds the analytics workspace with starter collections and example queries.
-- Business: Meridian Capital Management (a1b2c3d4-0001-0001-0001-000000000001)
-- Environment: a1b2c3d4-0001-0001-0003-000000000001
-- Idempotent: uses fixed UUIDs and ON CONFLICT DO NOTHING

-- =============================================================================
-- I. Query collections (starter folders)
-- =============================================================================

INSERT INTO analytics_collection (collection_id, business_id, env_id, name, description, parent_id, created_by) VALUES
    ('a0cc0000-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'Portfolio Overview', 'Fund and portfolio-level analytics', NULL, 'system'),
    ('a0cc0000-0001-0001-0001-000000000002', 'a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'Asset Operations', 'Property-level operating metrics', NULL, 'system'),
    ('a0cc0000-0001-0001-0001-000000000003', 'a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'Debt & Covenants', 'Loan covenant tracking and debt analytics', NULL, 'system'),
    ('a0cc0000-0001-0001-0001-000000000004', 'a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'Investor Reporting', 'LP and partner-level reporting queries', NULL, 'system'),
    ('a0cc0000-0001-0001-0001-000000000005', 'a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'Capital Projects (PDS)', 'Construction project budget and schedule queries', NULL, 'system')
ON CONFLICT (collection_id) DO NOTHING;

-- =============================================================================
-- II. Saved queries — starter templates
-- =============================================================================

INSERT INTO analytics_query (query_id, business_id, env_id, title, description, sql_text, nl_prompt, visualization_spec, is_public, created_by) VALUES

-- Portfolio Overview queries
('b0aa0000-0001-0001-0001-000000000001',
 'a1b2c3d4-0001-0001-0001-000000000001',
 'a1b2c3d4-0001-0001-0003-000000000001',
 'Fund Performance Summary',
 'TVPI, IRR, and NAV across all funds',
 'SELECT f.name AS fund_name, f.vintage_year, f.status,
       fqs.portfolio_nav, fqs.tvpi, fqs.dpi, fqs.gross_irr, fqs.net_irr,
       fqs.weighted_ltv, fqs.weighted_dscr, fqs.quarter
FROM repe_fund f
JOIN re_fund_quarter_state fqs ON fqs.fund_id = f.fund_id
WHERE f.business_id = ''a1b2c3d4-0001-0001-0001-000000000001''
ORDER BY fqs.quarter DESC, f.name',
 'Show me fund performance summary with TVPI and IRR',
 '{"type": "comparison_table", "x_axis": "fund_name", "y_axis": ["tvpi", "net_irr", "portfolio_nav"]}',
 true, 'system'),

('b0aa0000-0001-0001-0001-000000000002',
 'a1b2c3d4-0001-0001-0001-000000000001',
 'a1b2c3d4-0001-0001-0003-000000000001',
 'Portfolio NAV Trend',
 'Quarterly NAV by fund over time',
 'SELECT fqs.quarter, f.name AS fund_name, fqs.portfolio_nav
FROM repe_fund f
JOIN re_fund_quarter_state fqs ON fqs.fund_id = f.fund_id
WHERE f.business_id = ''a1b2c3d4-0001-0001-0001-000000000001''
ORDER BY fqs.quarter, f.name',
 'Show portfolio NAV trend over time by fund',
 '{"type": "trend_line", "x_axis": "quarter", "y_axis": ["portfolio_nav"], "series": "fund_name"}',
 true, 'system'),

-- Asset Operations queries
('b0aa0000-0001-0001-0001-000000000003',
 'a1b2c3d4-0001-0001-0001-000000000001',
 'a1b2c3d4-0001-0001-0003-000000000001',
 'Asset NOI & Occupancy',
 'Operating performance snapshot per asset',
 'SELECT a.name AS asset_name, pa.property_type, pa.market, pa.units,
       aqs.noi, aqs.revenue, aqs.opex, aqs.occupancy, aqs.quarter
FROM repe_asset a
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN re_asset_quarter_state aqs ON aqs.asset_id = a.asset_id
WHERE f.business_id = ''a1b2c3d4-0001-0001-0001-000000000001''
ORDER BY aqs.quarter DESC, a.name',
 'Show asset-level NOI and occupancy',
 '{"type": "comparison_table", "x_axis": "asset_name", "y_axis": ["noi", "occupancy", "revenue"]}',
 true, 'system'),

('b0aa0000-0001-0001-0001-000000000004',
 'a1b2c3d4-0001-0001-0001-000000000001',
 'a1b2c3d4-0001-0001-0003-000000000001',
 'Occupancy Trend by Property Type',
 'Quarterly occupancy across property types',
 'SELECT aqs.quarter, pa.property_type, AVG(aqs.occupancy) AS avg_occupancy
FROM repe_asset a
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN re_asset_quarter_state aqs ON aqs.asset_id = a.asset_id
WHERE f.business_id = ''a1b2c3d4-0001-0001-0001-000000000001''
GROUP BY aqs.quarter, pa.property_type
ORDER BY aqs.quarter, pa.property_type',
 'Show occupancy trend by property type',
 '{"type": "trend_line", "x_axis": "quarter", "y_axis": ["avg_occupancy"], "series": "property_type"}',
 true, 'system'),

-- Debt & Covenant queries
('b0aa0000-0001-0001-0001-000000000005',
 'a1b2c3d4-0001-0001-0001-000000000001',
 'a1b2c3d4-0001-0001-0003-000000000001',
 'Covenant Compliance Dashboard',
 'DSCR and LTV covenant test results',
 'SELECT a.name AS asset_name, l.loan_amount, l.interest_rate, l.maturity_date,
       c.quarter, c.covenant_type, c.actual_value, c.threshold_value, c.in_compliance
FROM re_loan l
JOIN repe_asset a ON a.asset_id = l.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
JOIN re_loan_covenant_result_qtr c ON c.loan_id = l.loan_id
WHERE f.business_id = ''a1b2c3d4-0001-0001-0001-000000000001''
ORDER BY c.quarter DESC, a.name, c.covenant_type',
 'Show me loan covenant compliance across all assets',
 '{"type": "comparison_table", "x_axis": "asset_name", "y_axis": ["actual_value", "threshold_value", "in_compliance"]}',
 true, 'system'),

-- Investor Reporting queries
('b0aa0000-0001-0001-0001-000000000006',
 'a1b2c3d4-0001-0001-0001-000000000001',
 'a1b2c3d4-0001-0001-0003-000000000001',
 'LP Returns by Partner',
 'Per-LP performance metrics by quarter',
 'SELECT p.name AS partner_name, f.name AS fund_name,
       pqm.quarter, pqm.nav, pqm.dpi, pqm.tvpi, pqm.irr
FROM re_partner p
JOIN repe_fund f ON f.fund_id = p.fund_id
JOIN re_partner_quarter_metrics pqm ON pqm.partner_id = p.partner_id
WHERE f.business_id = ''a1b2c3d4-0001-0001-0001-000000000001''
ORDER BY pqm.quarter DESC, p.name',
 'Show LP returns by partner',
 '{"type": "comparison_table", "x_axis": "partner_name", "y_axis": ["tvpi", "irr", "nav"]}',
 true, 'system'),

-- PDS queries
('b0aa0000-0001-0001-0001-000000000007',
 'a1b2c3d4-0001-0001-0001-000000000001',
 'a1b2c3d4-0001-0001-0003-000000000001',
 'Project Budget vs Forecast',
 'Budget variance and contingency burn per project',
 'SELECT p.name AS project_name, p.stage, p.project_manager,
       p.approved_budget, p.committed_amount, p.spent_amount,
       p.forecast_at_completion,
       (p.approved_budget - p.forecast_at_completion) AS variance,
       p.contingency_budget, p.contingency_remaining, p.risk_score
FROM pds_projects p
WHERE p.business_id = ''a1b2c3d4-0001-0001-0001-000000000001''
  AND p.status = ''active''
ORDER BY p.risk_score DESC',
 'Show project budget vs forecast with contingency status',
 '{"type": "bar_chart", "x_axis": "project_name", "y_axis": ["approved_budget", "forecast_at_completion"]}',
 true, 'system')

ON CONFLICT (query_id) DO NOTHING;

-- =============================================================================
-- III. Collection memberships — assign queries to folders
-- =============================================================================

INSERT INTO analytics_collection_membership (collection_id, query_id) VALUES
    ('a0cc0000-0001-0001-0001-000000000001', 'b0aa0000-0001-0001-0001-000000000001'),
    ('a0cc0000-0001-0001-0001-000000000001', 'b0aa0000-0001-0001-0001-000000000002'),
    ('a0cc0000-0001-0001-0001-000000000002', 'b0aa0000-0001-0001-0001-000000000003'),
    ('a0cc0000-0001-0001-0001-000000000002', 'b0aa0000-0001-0001-0001-000000000004'),
    ('a0cc0000-0001-0001-0001-000000000003', 'b0aa0000-0001-0001-0001-000000000005'),
    ('a0cc0000-0001-0001-0001-000000000004', 'b0aa0000-0001-0001-0001-000000000006'),
    ('a0cc0000-0001-0001-0001-000000000005', 'b0aa0000-0001-0001-0001-000000000007')
ON CONFLICT (collection_id, query_id) DO NOTHING;
