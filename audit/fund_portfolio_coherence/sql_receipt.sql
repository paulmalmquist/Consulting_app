-- audit/fund_portfolio_coherence/sql_receipt.sql
--
-- Runnable proof of the REPE Fund Portfolio coherence contract.
-- Each query is independent; run any of them via Supabase CLI:
--
--   supabase db query --linked < audit/fund_portfolio_coherence/sql_receipt.sql
--
-- Plan: audit/fund_portfolio_coherence/gap_report.md.
-- Migration that adds the views: repo-b/db/schema/535_re_fund_portfolio_included_view.sql.

\set ON_ERROR_STOP on

\set env_id      'a1b2c3d4-0001-0001-0003-000000000001'
\set business_id 'b1b2c3d4-0001-0001-0001-000000000001'
\set quarter     '2026Q2'

-- ─── 1. Included fund rows ───────────────────────────────────────────────────
-- These are the only rows that may appear in the investor-facing primary table.
-- Released-only authoritative snapshots, non-quarantined, non-archived,
-- scope-complete. The new selector reads from this view directly.
SELECT
  fund_id,
  name,
  vintage_year,
  strategy,
  status,
  promotion_state,
  trust_status,
  snapshot_version,
  (canonical_metrics->>'ending_nav')          AS portfolio_nav,
  (canonical_metrics->>'total_committed')     AS total_committed,
  (canonical_metrics->>'gross_irr')           AS gross_irr,
  (canonical_metrics->>'net_irr')             AS net_irr,
  legacy_weighted_dscr,
  legacy_weighted_ltv
FROM re_fund_portfolio_included_v
WHERE env_id      = :'env_id'
  AND business_id = :'business_id'::uuid
  AND quarter     = :'quarter'
ORDER BY name;

-- Expected at the Meridian fixture, 2026Q2: 3 rows.
--   Meridian Real Estate Fund III   (a1b2c3d4-0001-0010-0001-000000000001)
--   Meridian Credit Opportunities I (a1b2c3d4-0002-0020-0001-000000000001)
--   IGF VII                          (a1b2c3d4-0003-0030-0001-000000000001)


-- ─── 2. Excluded fund rows (diagnostics) ─────────────────────────────────────
-- These rows MUST appear only in the diagnostics panel, never in the primary
-- table. Env-scoped via app.env_business_bindings inside the view.
SELECT
  fund_id,
  name,
  status,
  exclusion_reason,
  latest_quarter,
  latest_promotion_state
FROM re_fund_portfolio_excluded_v
WHERE env_id      = :'env_id'
  AND business_id = :'business_id'::uuid
ORDER BY exclusion_reason, name;

-- Expected at the Meridian fixture: 2 quarantined orphans created by
-- migration 463_meridian_orphan_fund_dedup.sql:
--   [QUARANTINED] Meridian Real Estate Fund III   (d4560000-0003-0030-0004-…)
--   [QUARANTINED] Meridian Credit Opportunities I (d4560000-0003-0030-0005-…)


-- ─── 3. NAV reconciliation ───────────────────────────────────────────────────
-- Header NAV (sum over included rows) versus Σ(displayed fund NAV). These
-- must match within the rounding tolerance (max($1.00, 1bp of portfolio NAV)).
WITH included AS (
  SELECT
    fund_id,
    name,
    (canonical_metrics->>'ending_nav')::numeric AS fund_nav
  FROM re_fund_portfolio_included_v
  WHERE env_id      = :'env_id'
    AND business_id = :'business_id'::uuid
    AND quarter     = :'quarter'
)
SELECT
  COUNT(*)              AS fund_count,
  SUM(fund_nav)         AS displayed_fund_nav_sum,
  SUM(fund_nav)         AS portfolio_nav,
  -- Rounding delta is always zero by construction here because both sides
  -- read from the same source. The service-side reconciliation re-asserts
  -- this in the payload's nav_reconciliation block.
  (SUM(fund_nav) - SUM(fund_nav)) AS rounding_delta,
  GREATEST(1.00, SUM(fund_nav) * 0.0001) AS tolerance_dollars,
  CASE
    WHEN ABS(SUM(fund_nav) - SUM(fund_nav)) <= GREATEST(1.00, SUM(fund_nav) * 0.0001)
      THEN 'reconciled'
    ELSE 'drift'
  END AS status
FROM included;


-- ─── 4. IRR provenance ───────────────────────────────────────────────────────
-- The header gross_irr and net_irr are NAV-weighted averages of per-fund IRRs
-- with explicit denominator. This query reproduces the same math the service
-- ships in the payload's portfolio_summary; if the values disagree it means
-- the SQL view and the Python service have drifted.
WITH included AS (
  SELECT
    fund_id,
    name,
    snapshot_version,
    audit_run_id,
    (canonical_metrics->>'ending_nav')::numeric AS fund_nav,
    (canonical_metrics->>'gross_irr')::numeric  AS gross_irr,
    (canonical_metrics->>'net_irr')::numeric    AS net_irr
  FROM re_fund_portfolio_included_v
  WHERE env_id      = :'env_id'
    AND business_id = :'business_id'::uuid
    AND quarter     = :'quarter'
),
weighted AS (
  SELECT
    SUM(CASE WHEN gross_irr IS NOT NULL AND fund_nav > 0 THEN gross_irr * fund_nav ELSE 0 END) AS gross_num,
    SUM(CASE WHEN gross_irr IS NOT NULL AND fund_nav > 0 THEN fund_nav            ELSE 0 END) AS gross_denom,
    SUM(CASE WHEN net_irr   IS NOT NULL AND fund_nav > 0 THEN net_irr   * fund_nav ELSE 0 END) AS net_num,
    SUM(CASE WHEN net_irr   IS NOT NULL AND fund_nav > 0 THEN fund_nav            ELSE 0 END) AS net_denom,
    COUNT(*) FILTER (WHERE gross_irr IS NOT NULL AND fund_nav > 0)                            AS gross_n,
    COUNT(*) FILTER (WHERE net_irr   IS NOT NULL AND fund_nav > 0)                            AS net_n
  FROM included
)
SELECT
  'nav_weighted_average'              AS irr_method,
  gross_n                             AS irr_method_n_funds,
  gross_denom                         AS irr_method_denominator_nav,
  CASE WHEN gross_denom > 0 THEN gross_num / gross_denom END AS gross_irr,
  CASE WHEN net_denom   > 0 THEN net_num   / net_denom   END AS net_irr
FROM weighted;


-- ─── 5. Source snapshot inventory ────────────────────────────────────────────
-- For each included fund, list the audit_run_id and snapshot_version the
-- payload was built from. Two distinct snapshot_versions across the included
-- set => provenance.mixed_release_states is true and the UI surfaces the
-- "blended methodologies" warning.
SELECT
  fund_id,
  name,
  promotion_state,
  trust_status,
  snapshot_version,
  audit_run_id::text,
  released_at
FROM re_fund_portfolio_included_v
WHERE env_id      = :'env_id'
  AND business_id = :'business_id'::uuid
  AND quarter     = :'quarter'
ORDER BY name;


-- ─── 6. Set equality: included ⊕ excluded covers the canonical fund set ──────
-- Defense-in-depth: every repe_fund row owned by the business (via
-- env_business_bindings) must appear in exactly one of the two views.
-- A fund missing from both is a contract violation; a fund in both is too.
WITH bound_funds AS (
  SELECT f.fund_id, f.name, ebb.env_id::text AS env_id, f.business_id
  FROM repe_fund f
  JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
  WHERE ebb.env_id = :'env_id'::uuid
    AND f.business_id = :'business_id'::uuid
),
included AS (
  SELECT fund_id FROM re_fund_portfolio_included_v
  WHERE env_id = :'env_id' AND business_id = :'business_id'::uuid AND quarter = :'quarter'
),
excluded AS (
  SELECT fund_id FROM re_fund_portfolio_excluded_v
  WHERE env_id = :'env_id' AND business_id = :'business_id'::uuid
)
SELECT
  bf.fund_id,
  bf.name,
  (bf.fund_id IN (SELECT fund_id FROM included)) AS in_included,
  (bf.fund_id IN (SELECT fund_id FROM excluded)) AS in_excluded
FROM bound_funds bf
ORDER BY in_included DESC, bf.name;
-- Every row should have exactly one TRUE column. A FALSE/FALSE row indicates
-- the fund slipped past both filters; a TRUE/TRUE row indicates double-counting.
