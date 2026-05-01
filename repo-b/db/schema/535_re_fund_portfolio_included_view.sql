-- 535_re_fund_portfolio_included_view.sql
--
-- Single source of truth for the REPE Fund Portfolio page.
--
-- Two views:
--   re_fund_portfolio_included_v   — investor-facing rows (released, non-quarantined,
--                                    non-archived, scope-complete)
--   re_fund_portfolio_excluded_v   — diagnostics counterpart, env-scoped via
--                                    app.env_business_bindings
--
-- Plan: docs/plans/REPE_FUND_PORTFOLIO_COHERENCE.md (gap report at
--       audit/fund_portfolio_coherence/gap_report.md)
--
-- The views encode the contract once so Python and SQL receipts cannot drift.
-- The exclusion CASE branches are mutually exclusive in priority order.

CREATE OR REPLACE VIEW re_fund_portfolio_included_v AS
WITH latest_released AS (
  SELECT DISTINCT ON (s.fund_id, s.quarter)
    s.env_id,
    s.business_id,
    s.fund_id,
    s.quarter,
    s.audit_run_id,
    s.snapshot_version,
    s.promotion_state,
    s.trust_status,
    s.breakpoint_layer,
    s.canonical_metrics,
    s.null_reasons,
    s.provenance,
    s.released_at,
    s.created_at
  FROM re_authoritative_fund_state_qtr s
  WHERE s.promotion_state = 'released'
  ORDER BY s.fund_id, s.quarter, s.released_at DESC NULLS LAST, s.created_at DESC
)
SELECT
  lr.env_id,
  lr.business_id,
  lr.quarter,
  f.fund_id,
  f.name,
  f.vintage_year,
  f.fund_type,
  f.strategy,
  f.sub_strategy,
  f.target_size,
  f.status,
  f.base_currency,
  f.inception_date,
  lr.audit_run_id,
  lr.snapshot_version,
  lr.promotion_state,
  lr.trust_status,
  lr.breakpoint_layer,
  lr.canonical_metrics,
  lr.null_reasons,
  lr.provenance,
  lr.released_at,
  -- Bridge: weighted_dscr / weighted_ltv live only in legacy quarter-state today.
  -- Surfaced with provenance tag in the service layer; follow-up migrates writer
  -- to populate canonical_metrics directly. See gap_report.md §6 row 5.
  qs.weighted_dscr AS legacy_weighted_dscr,
  qs.weighted_ltv  AS legacy_weighted_ltv
FROM latest_released lr
JOIN repe_fund f
  ON f.fund_id = lr.fund_id
LEFT JOIN re_fund_quarter_state qs
  ON qs.fund_id = lr.fund_id
 AND qs.quarter = lr.quarter
 AND qs.scenario_id IS NULL
WHERE f.name NOT ILIKE '%[QUARANTINED]%'
  AND COALESCE(f.status, '') NOT IN ('archived')
  AND COALESCE(lr.canonical_metrics->'scope'->>'scope_completeness', 'complete')
      NOT IN ('partial', 'over_scope');

COMMENT ON VIEW re_fund_portfolio_included_v IS
  'Single source of truth for investor-facing REPE fund portfolio rows. '
  'Released-only authoritative snapshots, non-quarantined, non-archived, '
  'scope-complete. Used by re_fund_portfolio_coherent.get_coherent_fund_portfolio. '
  '/fund-trend (re_v2.py) and re_reconciliation.py:559 will migrate to this view in '
  'a follow-up PR. Plan: audit/fund_portfolio_coherence/gap_report.md.';


CREATE OR REPLACE VIEW re_fund_portfolio_excluded_v AS
SELECT
  -- Env-scoped: every diagnostics row carries the env_id of the binding that
  -- owns the fund's business_id. The service MUST filter by env_id + business_id;
  -- the view never returns un-scoped rows because every row joins through
  -- app.env_business_bindings. A fund whose business is not bound to any env is
  -- intentionally absent from this view.
  ebb.env_id::text AS env_id,
  f.business_id,
  f.fund_id,
  f.name,
  f.status,
  -- Latest snapshot for the fund (any promotion_state, any quarter); the service
  -- joins on the requested quarter so cross-quarter leakage cannot happen.
  (SELECT s.quarter
     FROM re_authoritative_fund_state_qtr s
    WHERE s.fund_id = f.fund_id
    ORDER BY s.created_at DESC
    LIMIT 1) AS latest_quarter,
  (SELECT s.audit_run_id::text
     FROM re_authoritative_fund_state_qtr s
    WHERE s.fund_id = f.fund_id
    ORDER BY s.created_at DESC
    LIMIT 1) AS latest_audit_run_id,
  (SELECT s.promotion_state
     FROM re_authoritative_fund_state_qtr s
    WHERE s.fund_id = f.fund_id
    ORDER BY s.created_at DESC
    LIMIT 1) AS latest_promotion_state,
  (SELECT s.null_reasons
     FROM re_authoritative_fund_state_qtr s
    WHERE s.fund_id = f.fund_id
    ORDER BY s.created_at DESC
    LIMIT 1) AS latest_null_reasons,
  -- Reason codes are mutually exclusive in priority order. The first matching
  -- branch wins. The included view's exclusion clauses are the inverse of these
  -- branches; if a fund matches no branch but is still excluded from the included
  -- view, the catch-all is 'scope_incomplete'.
  CASE
    WHEN f.name ILIKE '%[QUARANTINED]%'
      THEN 'quarantined'
    WHEN COALESCE(f.status, '') = 'archived'
      THEN 'archived'
    WHEN NOT EXISTS (
      SELECT 1 FROM re_authoritative_fund_state_qtr s
      WHERE s.fund_id = f.fund_id
        AND s.promotion_state = 'released'
    )
      AND EXISTS (
        SELECT 1 FROM re_authoritative_fund_state_qtr s
        WHERE s.fund_id = f.fund_id
          AND s.promotion_state = 'draft_audit'
      )
      THEN 'draft_only'
    WHEN NOT EXISTS (
      SELECT 1 FROM re_authoritative_fund_state_qtr s
      WHERE s.fund_id = f.fund_id
        AND s.promotion_state = 'released'
    )
      THEN 'no_released_snapshot'
    ELSE 'scope_incomplete'
  END AS exclusion_reason
FROM repe_fund f
JOIN app.env_business_bindings ebb
  ON ebb.business_id = f.business_id
WHERE NOT EXISTS (
  SELECT 1
  FROM re_fund_portfolio_included_v inc
  WHERE inc.fund_id = f.fund_id
    AND inc.env_id  = ebb.env_id::text
);

COMMENT ON VIEW re_fund_portfolio_excluded_v IS
  'Diagnostics counterpart to re_fund_portfolio_included_v. Env-scoped via '
  'app.env_business_bindings. Rows here MUST NOT appear in investor-facing '
  'tables, only in audit/diagnostics panels. Service MUST filter by '
  'env_id + business_id; an unfiltered query returns every excluded fund '
  'across every env and is a contract violation.';
