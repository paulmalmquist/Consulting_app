-- 536_re_fund_portfolio_included_funds_view.sql
--
-- Quarter-agnostic fund-set predicate for the REPE Fund Portfolio inclusion
-- contract. Returns one row per (env_id, business_id, fund_id) tuple for funds
-- that have AT LEAST ONE released, non-quarantined, non-archived,
-- scope-complete authoritative snapshot in any quarter.
--
-- Why a separate view?
--   re_fund_portfolio_included_v (added in migration 535) is keyed by quarter;
--   it answers "which funds are included AT this quarter". The trend chart
--   and reconciliation surfaces need "which funds are included AT ALL" so
--   their fund set matches the primary table's union across recent periods.
--
-- This is the canonical join target for /fund-trend and re_reconciliation.py.
-- Plan: cleanup PR following audit/fund_portfolio_coherence/gap_report.md.

CREATE OR REPLACE VIEW re_fund_portfolio_included_funds_v AS
SELECT DISTINCT
  s.env_id,
  s.business_id,
  f.fund_id,
  f.name
FROM repe_fund f
JOIN re_authoritative_fund_state_qtr s
  ON s.fund_id = f.fund_id
WHERE s.promotion_state = 'released'
  AND f.name NOT ILIKE '%[QUARANTINED]%'
  AND COALESCE(f.status, '') NOT IN ('archived')
  AND COALESCE(s.canonical_metrics->'scope'->>'scope_completeness', 'complete')
      NOT IN ('partial', 'over_scope');

COMMENT ON VIEW re_fund_portfolio_included_funds_v IS
  'Quarter-agnostic fund-set predicate for the REPE portfolio inclusion '
  'contract. Funds with at least one released, non-quarantined, non-archived, '
  'scope-complete authoritative snapshot. Used by /fund-trend and '
  're_reconciliation to keep the chart series and reconciliation fund set '
  'in agreement with the primary table. Pair with re_fund_portfolio_included_v '
  'for per-quarter row data.';
