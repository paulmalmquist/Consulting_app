-- 361_re_summary_views.sql
-- Summary SQL views for REPE dashboard performance.
-- These are standard views (not materialized) since the dataset is small.
--
-- Depends on: 285 (rollup tables), 270 (quarter state, partners), 299 (pipeline)

-- ═══════════════════════════════════════════════════════════════════════
-- 1. FUND PORTFOLIO SUMMARY
-- Per-fund: asset count, total NAV, weighted occupancy, weighted LTV, NOI
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_fund_portfolio_summary AS
WITH latest_quarter AS (
  SELECT DISTINCT ON (qr.asset_id)
    qr.asset_id, qr.quarter, qr.revenue, qr.opex, qr.noi, qr.capex,
    qr.debt_service, qr.net_cash_flow, qr.env_id
  FROM re_asset_acct_quarter_rollup qr
  ORDER BY qr.asset_id, qr.quarter DESC
),
latest_occ AS (
  SELECT DISTINCT ON (oq.asset_id)
    oq.asset_id, oq.occupancy
  FROM re_asset_occupancy_quarter oq
  ORDER BY oq.asset_id, oq.quarter DESC
)
SELECT
  f.fund_id,
  f.name AS fund_name,
  f.strategy,
  f.status AS fund_status,
  f.vintage_year,
  COUNT(DISTINCT a.asset_id) AS asset_count,
  COUNT(DISTINCT d.deal_id) AS investment_count,
  SUM(COALESCE(lq.noi, 0) * 4) AS annualized_noi,
  SUM(COALESCE(lq.revenue, 0) * 4) AS annualized_revenue,
  SUM(CASE WHEN lq.noi > 0 THEN lq.noi * 4 / 0.055 ELSE 0 END) AS gross_asset_value,
  SUM(CASE WHEN lq.noi > 0 THEN lq.noi * 4 / 0.055 ELSE 0 END
    - COALESCE(l.upb, 0)) AS total_nav,
  SUM(COALESCE(l.upb, 0)) AS total_debt,
  CASE WHEN SUM(CASE WHEN lq.noi > 0 THEN lq.noi * 4 / 0.055 ELSE 0 END) > 0
    THEN ROUND(SUM(COALESCE(l.upb, 0))::numeric /
      SUM(CASE WHEN lq.noi > 0 THEN lq.noi * 4 / 0.055 ELSE 0 END), 4)
    ELSE NULL
  END AS weighted_ltv,
  CASE WHEN SUM(COALESCE(lq.debt_service, 0)) > 0
    THEN ROUND(SUM(COALESCE(lq.noi, 0))::numeric /
      SUM(COALESCE(lq.debt_service, 0)), 2)
    ELSE NULL
  END AS weighted_dscr,
  ROUND(AVG(COALESCE(lo.occupancy, 90)), 1) AS avg_occupancy_pct,
  lq.quarter AS as_of_quarter
FROM repe_fund f
JOIN repe_deal d ON d.fund_id = f.fund_id
JOIN repe_asset a ON a.deal_id = d.deal_id
LEFT JOIN latest_quarter lq ON lq.asset_id = a.asset_id
LEFT JOIN latest_occ lo ON lo.asset_id = a.asset_id
LEFT JOIN re_loan l ON l.asset_id = a.asset_id
GROUP BY f.fund_id, f.name, f.strategy, f.status, f.vintage_year, lq.quarter;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ASSET OPERATING SUMMARY
-- Per-asset latest quarter: revenue, NOI, occupancy, DSCR, cap rate
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_asset_operating_summary AS
SELECT DISTINCT ON (a.asset_id)
  a.asset_id,
  a.name AS asset_name,
  pa.property_type,
  pa.city,
  pa.state,
  pa.market,
  pa.square_feet,
  pa.units,
  qr.quarter AS as_of_quarter,
  qr.revenue,
  qr.opex,
  qr.noi,
  qr.capex,
  qr.debt_service,
  qr.net_cash_flow,
  COALESCE(oq.occupancy, pa.occupancy * 100) AS occupancy_pct,
  COALESCE(l.upb, 0) AS debt_balance,
  COALESCE(l.rate, 0) AS interest_rate,
  CASE WHEN COALESCE(qr.debt_service, 0) > 0
    THEN ROUND(qr.noi / qr.debt_service, 2)
    ELSE NULL
  END AS dscr,
  CASE WHEN qr.noi > 0
    THEN ROUND(COALESCE(l.upb, 0) / (qr.noi * 4 / 0.055), 4)
    ELSE NULL
  END AS ltv,
  CASE WHEN qr.noi > 0 AND pa.square_feet > 0
    THEN ROUND((qr.noi * 4) / pa.square_feet, 2)
    ELSE NULL
  END AS noi_per_sf,
  CASE WHEN qr.noi > 0
    THEN ROUND(qr.noi * 4 / 0.055, 2)
    ELSE NULL
  END AS implied_value,
  d.fund_id
FROM repe_asset a
JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
LEFT JOIN re_asset_acct_quarter_rollup qr ON qr.asset_id = a.asset_id
LEFT JOIN re_asset_occupancy_quarter oq ON oq.asset_id = a.asset_id AND oq.quarter = qr.quarter
LEFT JOIN re_loan l ON l.asset_id = a.asset_id
ORDER BY a.asset_id, qr.quarter DESC;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. FUND CAPITAL SUMMARY
-- Per-fund: committed, called, distributed, DPI, unfunded
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_fund_capital_summary AS
SELECT
  f.fund_id,
  f.name AS fund_name,
  f.strategy,
  f.status AS fund_status,
  COALESCE(SUM(pc.committed_amount), 0) AS total_committed,
  COALESCE(contrib.total_contributions, 0) AS total_called,
  COALESCE(dist.total_distributions, 0) AS total_distributed,
  COALESCE(SUM(pc.committed_amount), 0)
    - COALESCE(contrib.total_contributions, 0) AS unfunded_commitment,
  CASE WHEN COALESCE(contrib.total_contributions, 0) > 0
    THEN ROUND(COALESCE(dist.total_distributions, 0)::numeric /
      contrib.total_contributions, 4)
    ELSE 0
  END AS dpi,
  COUNT(DISTINCT pc.partner_id) AS partner_count
FROM repe_fund f
LEFT JOIN re_partner_commitment pc ON pc.fund_id = f.fund_id
LEFT JOIN (
  SELECT fund_id, SUM(amount) AS total_contributions
  FROM re_capital_ledger_entry
  WHERE entry_type = 'contribution'
  GROUP BY fund_id
) contrib ON contrib.fund_id = f.fund_id
LEFT JOIN (
  SELECT fund_id, SUM(amount) AS total_distributions
  FROM re_capital_ledger_entry
  WHERE entry_type = 'distribution'
  GROUP BY fund_id
) dist ON dist.fund_id = f.fund_id
GROUP BY f.fund_id, f.name, f.strategy, f.status,
  contrib.total_contributions, dist.total_distributions;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. PIPELINE STAGE SUMMARY
-- Deal count and total AUM by pipeline status
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_pipeline_stage_summary AS
SELECT
  pd.status,
  COUNT(*) AS deal_count,
  SUM(COALESCE(pd.headline_price, 0)) AS total_aum,
  AVG(pd.headline_price) AS avg_deal_size,
  AVG(pd.target_irr) AS avg_target_irr,
  AVG(pd.target_moic) AS avg_target_moic,
  COUNT(DISTINCT pd.property_type) AS property_type_count,
  COUNT(DISTINCT pd.strategy) AS strategy_count
FROM re_pipeline_deal pd
GROUP BY pd.status
ORDER BY
  CASE pd.status
    WHEN 'sourced' THEN 1
    WHEN 'screening' THEN 2
    WHEN 'loi' THEN 3
    WHEN 'dd' THEN 4
    WHEN 'ic' THEN 5
    WHEN 'closing' THEN 6
    WHEN 'closed' THEN 7
    WHEN 'dead' THEN 8
  END;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. PARTNER PORTFOLIO SUMMARY
-- Per-partner: commitment, called, distributed, TVPI across funds
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_partner_portfolio_summary AS
SELECT
  p.partner_id,
  p.name AS partner_name,
  p.partner_type,
  COUNT(DISTINCT pc.fund_id) AS fund_count,
  SUM(pc.committed_amount) AS total_committed,
  COALESCE(contrib.total_contributions, 0) AS total_contributed,
  COALESCE(dist.total_distributions, 0) AS total_distributed,
  CASE WHEN COALESCE(contrib.total_contributions, 0) > 0
    THEN ROUND(COALESCE(dist.total_distributions, 0)::numeric /
      contrib.total_contributions, 4)
    ELSE 0
  END AS dpi,
  -- Latest TVPI from partner quarter metrics
  COALESCE(latest_tvpi.tvpi, 0) AS tvpi,
  COALESCE(latest_tvpi.irr, 0) AS irr
FROM re_partner p
JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
LEFT JOIN (
  SELECT partner_id, SUM(amount) AS total_contributions
  FROM re_capital_ledger_entry
  WHERE entry_type = 'contribution'
  GROUP BY partner_id
) contrib ON contrib.partner_id = p.partner_id
LEFT JOIN (
  SELECT partner_id, SUM(amount) AS total_distributions
  FROM re_capital_ledger_entry
  WHERE entry_type = 'distribution'
  GROUP BY partner_id
) dist ON dist.partner_id = p.partner_id
LEFT JOIN LATERAL (
  SELECT pqm.tvpi, pqm.irr
  FROM re_partner_quarter_metrics pqm
  WHERE pqm.partner_id = p.partner_id
  ORDER BY pqm.quarter DESC
  LIMIT 1
) latest_tvpi ON true
GROUP BY p.partner_id, p.name, p.partner_type,
  contrib.total_contributions, dist.total_distributions,
  latest_tvpi.tvpi, latest_tvpi.irr;
