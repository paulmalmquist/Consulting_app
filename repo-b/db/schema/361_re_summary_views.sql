-- 361_re_summary_views.sql
-- Summary SQL views for REPE dashboard performance.
-- These are standard views (not materialized) since the dataset is small.
--
-- Depends on: 285 (rollup tables), 270 (quarter state, partners), 299 (pipeline)

-- Location columns are referenced by the asset operating summary below.
-- Bootstrap them here so clean-schema applies do not depend on a later migration.
ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

-- ═══════════════════════════════════════════════════════════════════════
-- 1. FUND PORTFOLIO SUMMARY
-- Per-fund: asset count, total NAV, weighted occupancy, weighted LTV, NOI
--
-- CANONICAL SOURCE: re_asset_quarter_state (quarter-close snapshots).
-- NAV and asset_value come from the quarter-close run, NOT from a hard-coded
-- cap rate (the prior 5.5% was removed — it produced divergent NAV figures).
-- NULL nav assets are excluded from the sum, not coerced to zero.
-- Disposed / pipeline assets are filtered from active portfolio metrics.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_fund_portfolio_summary AS
WITH latest_asset_state AS (
  -- Latest base-scenario quarter-close snapshot per asset
  SELECT DISTINCT ON (aqs.asset_id)
    aqs.asset_id,
    aqs.quarter,
    aqs.noi,
    aqs.revenue,
    aqs.debt_service,
    aqs.net_cash_flow,
    aqs.asset_value,
    aqs.nav,
    aqs.debt_balance,
    aqs.occupancy,
    aqs.ltv,
    aqs.dscr,
    aqs.value_source
  FROM re_asset_quarter_state aqs
  WHERE aqs.scenario_id IS NULL
  ORDER BY aqs.asset_id, aqs.quarter DESC, aqs.created_at DESC
)
SELECT
  f.fund_id,
  f.name AS fund_name,
  f.strategy,
  f.status AS fund_status,
  f.vintage_year,
  COUNT(DISTINCT a.asset_id) AS asset_count,
  COUNT(DISTINCT a.asset_id) FILTER (
    WHERE a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating')
  ) AS active_asset_count,
  COUNT(DISTINCT a.asset_id) FILTER (
    WHERE a.asset_status IN ('disposed','realized','written_off')
  ) AS disposed_asset_count,
  COUNT(DISTINCT a.asset_id) FILTER (
    WHERE a.asset_status = 'pipeline'
  ) AS pipeline_asset_count,
  COUNT(DISTINCT d.deal_id) AS investment_count,
  -- NOI/revenue from canonical snapshots (quarterly → annualized *4)
  SUM(COALESCE(las.noi, 0) * 4) FILTER (
    WHERE a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating')
  ) AS annualized_noi,
  SUM(COALESCE(las.revenue, 0) * 4) FILTER (
    WHERE a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating')
  ) AS annualized_revenue,
  -- Gross asset value from canonical snapshot (no hard-coded cap rate)
  SUM(las.asset_value) FILTER (
    WHERE las.asset_value IS NOT NULL
      AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
  ) AS gross_asset_value,
  -- NAV: NULL-safe sum — unvalued assets are excluded, not zeroed
  SUM(las.nav) FILTER (
    WHERE las.nav IS NOT NULL
      AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
  ) AS total_nav,
  SUM(COALESCE(las.debt_balance, 0)) FILTER (
    WHERE a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating')
  ) AS total_debt,
  -- Weighted LTV: asset_value-weighted where both ltv and asset_value are known
  CASE
    WHEN SUM(las.asset_value) FILTER (
      WHERE las.ltv IS NOT NULL AND las.asset_value IS NOT NULL
        AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
    ) > 0
    THEN ROUND(
      SUM(las.ltv * las.asset_value) FILTER (
        WHERE las.ltv IS NOT NULL AND las.asset_value IS NOT NULL
          AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
      )::numeric /
      SUM(las.asset_value) FILTER (
        WHERE las.ltv IS NOT NULL AND las.asset_value IS NOT NULL
          AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
      ), 4)
    ELSE NULL
  END AS weighted_ltv,
  -- Weighted DSCR: asset_value-weighted where both dscr and asset_value are known
  CASE
    WHEN SUM(las.asset_value) FILTER (
      WHERE las.dscr IS NOT NULL AND las.asset_value IS NOT NULL
        AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
    ) > 0
    THEN ROUND(
      SUM(las.dscr * las.asset_value) FILTER (
        WHERE las.dscr IS NOT NULL AND las.asset_value IS NOT NULL
          AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
      )::numeric /
      SUM(las.asset_value) FILTER (
        WHERE las.dscr IS NOT NULL AND las.asset_value IS NOT NULL
          AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
      ), 2)
    ELSE NULL
  END AS weighted_dscr,
  -- Occupancy: average only where occupancy is present (not fabricated as 90%)
  CASE
    WHEN COUNT(las.occupancy) FILTER (
      WHERE las.occupancy IS NOT NULL
        AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
    ) > 0
    THEN ROUND(AVG(las.occupancy) FILTER (
      WHERE las.occupancy IS NOT NULL
        AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
    ), 1)
    ELSE NULL   -- NULL = no assets with occupancy data available
  END AS avg_occupancy_pct,
  -- Readiness diagnostics
  COUNT(a.asset_id) FILTER (
    WHERE las.asset_id IS NULL
      AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
  ) AS assets_missing_quarter_state,
  COUNT(a.asset_id) FILTER (
    WHERE (las.asset_value IS NULL OR las.asset_value = 0)
      AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
  ) AS assets_missing_valuation,
  las.quarter AS as_of_quarter
FROM repe_fund f
JOIN repe_deal d ON d.fund_id = f.fund_id
JOIN repe_asset a ON a.deal_id = d.deal_id
LEFT JOIN latest_asset_state las ON las.asset_id = a.asset_id
GROUP BY f.fund_id, f.name, f.strategy, f.status, f.vintage_year, las.quarter;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ASSET OPERATING SUMMARY
-- Per-asset latest quarter: revenue, NOI, occupancy, DSCR, LTV
--
-- CANONICAL SOURCE: re_asset_quarter_state where available; falls back to
-- re_asset_acct_quarter_rollup for assets without a quarter-close run.
-- Hard-coded 5.5% cap rate removed; LTV uses canonical asset_value.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_asset_operating_summary AS
WITH canonical AS (
  -- Prefer the quarter-close snapshot (base scenario) as canonical source
  SELECT DISTINCT ON (aqs.asset_id)
    aqs.asset_id,
    aqs.quarter,
    aqs.revenue,
    aqs.opex,
    aqs.noi,
    aqs.capex,
    aqs.debt_service,
    aqs.net_cash_flow,
    aqs.occupancy,
    aqs.debt_balance,
    aqs.ltv,
    aqs.dscr,
    aqs.asset_value,
    aqs.value_source,
    'quarter_state' AS data_source
  FROM re_asset_quarter_state aqs
  WHERE aqs.scenario_id IS NULL
  ORDER BY aqs.asset_id, aqs.quarter DESC, aqs.created_at DESC
),
fallback AS (
  -- Fallback for assets that have never had a quarter-close run
  SELECT DISTINCT ON (qr.asset_id)
    qr.asset_id,
    qr.quarter,
    qr.revenue,
    qr.opex,
    qr.noi,
    qr.capex,
    qr.debt_service,
    qr.net_cash_flow,
    NULL::numeric AS occupancy,
    NULL::numeric AS debt_balance,
    NULL::numeric AS ltv,
    NULL::numeric AS dscr,
    NULL::numeric AS asset_value,
    'acct_rollup_fallback' AS value_source,
    'acct_rollup' AS data_source
  FROM re_asset_acct_quarter_rollup qr
  ORDER BY qr.asset_id, qr.quarter DESC
),
best_state AS (
  SELECT * FROM canonical
  UNION ALL
  SELECT f.*
  FROM fallback f
  WHERE NOT EXISTS (SELECT 1 FROM canonical c WHERE c.asset_id = f.asset_id)
)
SELECT DISTINCT ON (a.asset_id)
  a.asset_id,
  a.name AS asset_name,
  a.asset_status,
  pa.property_type,
  pa.city,
  pa.state,
  pa.market,
  pa.latitude,
  pa.longitude,
  pa.square_feet,
  pa.units,
  bs.quarter AS as_of_quarter,
  bs.data_source,
  bs.revenue,
  bs.opex,
  bs.noi,
  bs.capex,
  bs.debt_service,
  bs.net_cash_flow,
  bs.asset_value,
  bs.value_source,
  -- Occupancy: use canonical snapshot; fall back to property record where meaningful
  CASE
    WHEN bs.occupancy IS NOT NULL THEN bs.occupancy
    WHEN pa.occupancy IS NOT NULL AND pa.units > 0 THEN pa.occupancy * 100
    ELSE NULL   -- occupancy unknown — do not fabricate
  END AS occupancy_pct,
  COALESCE(bs.debt_balance, 0) AS debt_balance,
  COALESCE(l.rate, 0) AS interest_rate,
  -- DSCR: from canonical snapshot
  bs.dscr,
  -- LTV: from canonical snapshot (no hard-coded cap rate)
  bs.ltv,
  CASE WHEN bs.noi IS NOT NULL AND bs.noi > 0 AND pa.square_feet > 0
    THEN ROUND((bs.noi * 4) / pa.square_feet, 2)
    ELSE NULL
  END AS noi_per_sf,
  -- Implied value: use canonical asset_value, not a fabricated cap-rate calc
  bs.asset_value AS implied_value,
  d.fund_id
FROM repe_asset a
JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
LEFT JOIN best_state bs ON bs.asset_id = a.asset_id
LEFT JOIN LATERAL (
  SELECT loan.rate
  FROM re_loan loan
  WHERE loan.asset_id = a.asset_id
  ORDER BY loan.created_at DESC, loan.id DESC
  LIMIT 1
) l ON true
ORDER BY a.asset_id, bs.quarter DESC;

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
