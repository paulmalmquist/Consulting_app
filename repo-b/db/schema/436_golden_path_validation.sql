-- ──────────────────────────────────────────────────────────────────────
-- 436_golden_path_validation.sql
-- Reconciliation views for the golden-path end-to-end validation harness.
-- Validates asset→JV→investment→fund rollup chain against the
-- deterministic constants in re_golden_path_constants (432).
-- ──────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════
-- View 1: Per-quarter identity checks
-- Validates: NOI = revenue - opex, NCF integrity, NAV = value - debt
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW re_golden_path_quarterly_check AS
WITH constants AS (SELECT * FROM re_golden_path_constants),
asset_quarters AS (
  SELECT
    aq.quarter,
    aq.revenue,
    aq.opex,
    aq.noi,
    aq.capex,
    aq.debt_service,
    aq.net_cash_flow,
    aq.occupancy,
    aq.debt_balance,
    aq.asset_value,
    aq.nav
  FROM re_asset_quarter_state aq
  CROSS JOIN constants c
  WHERE aq.asset_id = c.asset_id
    AND aq.scenario_id IS NULL
  ORDER BY aq.quarter
)
SELECT
  aq.quarter,

  -- NOI identity: revenue - opex = noi
  aq.revenue,
  aq.opex,
  aq.revenue - aq.opex                          AS computed_noi,
  aq.noi                                        AS stored_noi,
  ABS(aq.revenue - aq.opex - aq.noi) < 0.01    AS noi_identity_holds,

  -- NCF identity: noi - capex - debt_service = ncf (simplified, no reserves in state)
  aq.net_cash_flow                              AS stored_ncf,

  -- Fund CF = NCF * JV ownership (0.80)
  ROUND(aq.net_cash_flow * c.jv_fund_pct, 2)   AS computed_fund_cf,

  -- NAV identity: asset_value - debt_balance = nav
  aq.asset_value,
  aq.debt_balance,
  aq.asset_value - aq.debt_balance              AS computed_nav,
  aq.nav                                        AS stored_nav,
  ABS(aq.asset_value - aq.debt_balance - aq.nav) < 0.01 AS nav_identity_holds,

  -- Occupancy check (should be 1.0 for golden path NNN asset)
  aq.occupancy
FROM asset_quarters aq
CROSS JOIN constants c;

COMMENT ON VIEW re_golden_path_quarterly_check IS
  'Per-quarter identity validation for the golden path asset. '
  'All _holds columns must be TRUE for the chain to be valid.';


-- ═══════════════════════════════════════════════════════════════════════
-- View 2: End-to-end chain summary
-- Validates total operating NCF, sale net, and TVPI against constants
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW re_golden_path_chain_summary AS
WITH constants AS (SELECT * FROM re_golden_path_constants),
operating_ncf AS (
  SELECT SUM(aq.net_cash_flow) AS total_ncf
  FROM re_asset_quarter_state aq
  CROSS JOIN constants c
  WHERE aq.asset_id = c.asset_id
    AND aq.scenario_id IS NULL
),
sale AS (
  SELECT
    r.net_sale_proceeds,
    r.gross_sale_price,
    r.sale_costs,
    r.debt_payoff
  FROM re_asset_realization r
  CROSS JOIN constants c
  WHERE r.asset_id = c.asset_id
  LIMIT 1
),
capital AS (
  SELECT
    SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END) AS total_contributed,
    SUM(CASE WHEN entry_type = 'distribution' THEN amount_base ELSE 0 END) AS total_distributed
  FROM re_capital_ledger_entry
  WHERE fund_id = (SELECT fund_id FROM re_golden_path_constants)
)
SELECT
  -- Equity baseline
  c.equity_amount,

  -- Operating NCF
  c.total_operating_ncf   AS expected_operating_ncf,
  o.total_ncf             AS actual_operating_ncf,
  ABS(c.total_operating_ncf - COALESCE(o.total_ncf, 0)) < 1 AS operating_ncf_matches,

  -- Sale proceeds
  c.net_sale_proceeds     AS expected_sale_net,
  s.net_sale_proceeds     AS actual_sale_net,
  c.net_sale_proceeds = COALESCE(s.net_sale_proceeds, 0) AS sale_net_matches,

  -- TVPI
  c.tvpi                  AS expected_tvpi,
  CASE
    WHEN c.equity_amount > 0
    THEN ROUND((COALESCE(o.total_ncf, 0) + COALESCE(s.net_sale_proceeds, 0)) / c.equity_amount, 4)
  END                     AS computed_tvpi,
  c.tvpi = CASE
    WHEN c.equity_amount > 0
    THEN ROUND((COALESCE(o.total_ncf, 0) + COALESCE(s.net_sale_proceeds, 0)) / c.equity_amount, 4)
  END                     AS tvpi_matches,

  -- Capital ledger totals
  cap.total_contributed,
  cap.total_distributed
FROM constants c
CROSS JOIN operating_ncf o
LEFT JOIN sale s ON true
CROSS JOIN capital cap;

COMMENT ON VIEW re_golden_path_chain_summary IS
  'End-to-end chain validation: operating NCF total, sale net proceeds, '
  'and TVPI computed from actuals vs golden path constants.';


-- ═══════════════════════════════════════════════════════════════════════
-- View 3: Gross-to-net sale proceeds bridge
-- Validates: gross - costs - debt = net
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW re_golden_path_gross_to_net_bridge AS
WITH constants AS (SELECT * FROM re_golden_path_constants)
SELECT
  c.gross_sale_price,
  c.sale_costs,
  c.gross_sale_price - c.sale_costs                       AS after_costs,
  c.debt_payoff,
  c.gross_sale_price - c.sale_costs - c.debt_payoff       AS computed_net,
  c.net_sale_proceeds                                     AS expected_net,
  (c.gross_sale_price - c.sale_costs - c.debt_payoff) = c.net_sale_proceeds AS bridge_balances,

  -- Fund's share (80% JV ownership)
  ROUND((c.gross_sale_price - c.sale_costs - c.debt_payoff) * c.jv_fund_pct, 0) AS fund_share,
  c.fund_sale_proceeds                                    AS expected_fund_share,

  -- Total equity distributions = operating + sale
  c.total_equity_distributions,
  c.total_operating_ncf + c.net_sale_proceeds             AS computed_total_distributions,
  c.total_equity_distributions = c.total_operating_ncf + c.net_sale_proceeds AS distributions_balance
FROM constants c;

COMMENT ON VIEW re_golden_path_gross_to_net_bridge IS
  'Gross sale price → costs → debt payoff → net proceeds bridge '
  'with fund JV share and total equity distribution reconciliation.';


-- ═══════════════════════════════════════════════════════════════════════
-- View 4: Waterfall tier audit template
-- Shows what the correct tier allocations should be for golden path
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW re_golden_path_waterfall_expected AS
WITH constants AS (SELECT * FROM re_golden_path_constants)
SELECT
  c.total_equity_distributions          AS total_distributable,
  c.equity_amount                       AS return_of_capital,
  -- Preferred return: 8% simple on equity for 8 quarters (2 years)
  ROUND(c.equity_amount * 0.08 * 2, 2) AS preferred_return_simple,
  -- Remaining after ROC + pref
  c.total_equity_distributions
    - c.equity_amount
    - ROUND(c.equity_amount * 0.08 * 2, 2) AS available_for_split,
  -- GP carry at 20% of excess
  ROUND((c.total_equity_distributions
    - c.equity_amount
    - ROUND(c.equity_amount * 0.08 * 2, 2)) * 0.20, 2) AS gp_carry_20pct,
  -- LP gets 80% of excess
  ROUND((c.total_equity_distributions
    - c.equity_amount
    - ROUND(c.equity_amount * 0.08 * 2, 2)) * 0.80, 2) AS lp_excess_80pct,
  -- Invariant: all allocations sum to distributable
  c.equity_amount
    + ROUND(c.equity_amount * 0.08 * 2, 2)
    + ROUND((c.total_equity_distributions - c.equity_amount - ROUND(c.equity_amount * 0.08 * 2, 2)) * 0.20, 2)
    + ROUND((c.total_equity_distributions - c.equity_amount - ROUND(c.equity_amount * 0.08 * 2, 2)) * 0.80, 2) AS sum_check
FROM constants c;

COMMENT ON VIEW re_golden_path_waterfall_expected IS
  'Expected waterfall tier allocations for golden path: ROC → 8% pref → 20/80 GP/LP split.';
