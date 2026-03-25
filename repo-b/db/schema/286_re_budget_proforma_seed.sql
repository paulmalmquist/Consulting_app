-- 286_re_budget_proforma_seed.sql
-- Seeds budget baselines, pro forma, normalized actuals, and pre-computed
-- variance for ALL assets in the Meridian Capital Management environment.
--
-- Depends on: 278_re_financial_intelligence.sql, 285_re_asset_accounting_seed.sql
--
-- Tables REUSED (no new tables created):
--   acct_chart_of_accounts      (278)
--   acct_gl_balance_monthly     (278)
--   acct_mapping_rule           (278)
--   acct_normalized_noi_monthly (278)
--   uw_version                  (278)
--   uw_noi_budget_monthly       (278)
--   re_run                      (278)
--   re_asset_variance_qtr       (278)
--
-- Idempotent: uses ON CONFLICT DO NOTHING / WHERE NOT EXISTS guards.

-- =============================================================================
-- I. Chart of Accounts entries (for GL mapping + accounting tab)
-- =============================================================================
INSERT INTO acct_chart_of_accounts (gl_account, name, category, is_balance_sheet)
VALUES
  ('4000', 'Rental Revenue',         'Revenue',              false),
  ('4100', 'Other Income',           'Revenue',              false),
  ('5000', 'Payroll',                'Operating Expenses',   false),
  ('5100', 'Repairs & Maintenance',  'Operating Expenses',   false),
  ('5200', 'Utilities',              'Operating Expenses',   false),
  ('5300', 'Property Taxes',         'Operating Expenses',   false),
  ('5400', 'Insurance',              'Operating Expenses',   false),
  ('5500', 'Management Fees',        'Operating Expenses',   false),
  ('6000', 'Capital Expenditures',   'CapEx',                false),
  ('1000', 'Cash & Equivalents',     'Assets',               true),
  ('2000', 'Mortgage Payable',       'Liabilities',          true)
ON CONFLICT (gl_account) DO NOTHING;

-- =============================================================================
-- II. Mapping Rules (GL account → NOI line code)
-- =============================================================================
-- Revenue accounts map with sign_multiplier=1 (positive NOI contribution)
-- OpEx accounts map with sign_multiplier=-1 (negative NOI contribution)

INSERT INTO acct_mapping_rule (env_id, business_id, gl_account, target_line_code, target_statement, sign_multiplier)
SELECT
  eb.env_id::text,
  eb.business_id,
  v.gl_account,
  v.target_line_code,
  v.target_statement,
  v.sign_multiplier
FROM app.env_business_bindings eb
CROSS JOIN (VALUES
  ('4000', 'RENT',          'NOI',  1),
  ('4100', 'OTHER_INCOME',  'NOI',  1),
  ('5000', 'PAYROLL',       'NOI', -1),
  ('5100', 'REPAIRS_MAINT', 'NOI', -1),
  ('5200', 'UTILITIES',     'NOI', -1),
  ('5300', 'TAXES',         'NOI', -1),
  ('5400', 'INSURANCE',     'NOI', -1),
  ('5500', 'MGMT_FEES',     'NOI', -1)
) AS v(gl_account, target_line_code, target_statement, sign_multiplier)
WHERE eb.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM acct_mapping_rule m
    WHERE m.env_id = eb.env_id::text
      AND m.business_id = eb.business_id
      AND m.gl_account = v.gl_account
  );

-- =============================================================================
-- III. UW Versions (BUDGET + PROFORMA)
-- =============================================================================
-- Use deterministic UUIDs for idempotency.

INSERT INTO uw_version (id, env_id, business_id, name, effective_from)
SELECT
  'b1b2c3d4-0001-0001-0001-000000000001'::uuid,
  eb.env_id::text,
  eb.business_id,
  '2025 Annual Budget',
  '2025-01-01'::date
FROM app.env_business_bindings eb
WHERE eb.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'::uuid
ON CONFLICT (id) DO NOTHING;

INSERT INTO uw_version (id, env_id, business_id, name, effective_from)
SELECT
  'b1b2c3d4-0001-0001-0002-000000000001'::uuid,
  eb.env_id::text,
  eb.business_id,
  'Acquisition Pro Forma',
  '2025-01-01'::date
FROM app.env_business_bindings eb
WHERE eb.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'::uuid
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- IV. Normalized NOI Monthly ACTUALS
-- =============================================================================
-- 8 quarters (2025Q1–2026Q4) = 24 months, 8 line codes per asset per month.
-- Revenue line codes are positive; OpEx line codes are negative (normalized).
-- Base amounts derive from the same formula used in 285 for consistency.

INSERT INTO acct_normalized_noi_monthly
  (env_id, business_id, asset_id, period_month, line_code, amount, source_hash)
SELECT
  base.env_id,
  base.business_id,
  base.asset_id,
  base.period_month,
  base.line_code,
  base.amount,
  'seed_286'
FROM (
  SELECT
    eb.env_id::text AS env_id,
    eb.business_id,
    a.asset_id,
    months.period_month,
    lc.line_code,
    ROUND(
      CASE WHEN lc.is_revenue THEN
        -- Quarterly revenue / 3, scaled by monthly fraction
        (2000000 + (numbered.rn % 7) * 450000)
        * POWER(1.02, months.qi)
        * lc.pct
        * months.month_frac
      ELSE
        -- Quarterly opex / 3, scaled by monthly fraction (negative for expense)
        -(2000000 + (numbered.rn % 7) * 450000)
        * POWER(1.02, months.qi)
        * (0.45 + (numbered.rn % 5) * 0.025)
        * lc.pct
        * months.month_frac
      END
    , 2) AS amount
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN repe_fund f ON f.fund_id = d.fund_id
  JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
  -- Row number for deterministic variation
  CROSS JOIN LATERAL (
    SELECT ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
    FROM repe_asset a2
    JOIN repe_property_asset pa2 ON pa2.asset_id = a2.asset_id
    WHERE a2.asset_id = a.asset_id
  ) AS numbered
  -- 24 months across 8 quarters
  CROSS JOIN (
    SELECT
      (y.yr || '-' || LPAD(m.mo::text, 2, '0') || '-01')::date AS period_month,
      y.yr || 'Q' || ((m.mo - 1) / 3 + 1) AS quarter,
      (y.yr - 2025) * 4 + ((m.mo - 1) / 3) AS qi,
      CASE (m.mo - 1) % 3
        WHEN 0 THEN 0.32
        WHEN 1 THEN 0.33
        ELSE 0.35
      END AS month_frac
    FROM (VALUES (2025), (2026)) AS y(yr)
    CROSS JOIN generate_series(1, 12) AS m(mo)
  ) AS months
  -- Line code breakdown
  CROSS JOIN (VALUES
    ('RENT',          true,  0.85),
    ('OTHER_INCOME',  true,  0.15),
    ('PAYROLL',       false, 0.25),
    ('REPAIRS_MAINT', false, 0.15),
    ('UTILITIES',     false, 0.20),
    ('TAXES',         false, 0.20),
    ('INSURANCE',     false, 0.10),
    ('MGMT_FEES',     false, 0.10)
  ) AS lc(line_code, is_revenue, pct)
  WHERE eb.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'::uuid
) AS base
WHERE NOT EXISTS (
  SELECT 1 FROM acct_normalized_noi_monthly n
  WHERE n.env_id = base.env_id
    AND n.asset_id = base.asset_id
    AND n.period_month = base.period_month
    AND n.line_code = base.line_code
    AND n.source_hash = 'seed_286'
);

-- =============================================================================
-- V. Budget Lines (uw_noi_budget_monthly) — BUDGET version
-- =============================================================================
-- Budget = actual × multiplier:
--   Revenue: actual × 1.02 (2% above actual → slight favorable variance expected)
--   OpEx:    actual × 1.03 (3% above actual → budgeted more expense than actual)
-- This creates a realistic variance where revenue slightly beats budget
-- and expenses come in slightly under budget → positive NOI variance.

INSERT INTO uw_noi_budget_monthly
  (env_id, business_id, asset_id, uw_version_id, period_month, line_code, amount)
SELECT
  base.env_id,
  base.business_id,
  base.asset_id,
  'b1b2c3d4-0001-0001-0001-000000000001'::uuid,
  base.period_month,
  base.line_code,
  base.budget_amount
FROM (
  SELECT
    eb.env_id::text AS env_id,
    eb.business_id,
    a.asset_id,
    months.period_month,
    lc.line_code,
    ROUND(
      CASE WHEN lc.is_revenue THEN
        -- Budget revenue: actual × 0.98 (budget slightly below actual → positive variance)
        (2000000 + (numbered.rn % 7) * 450000)
        * POWER(1.02, months.qi)
        * lc.pct
        * months.month_frac
        * 0.98
      ELSE
        -- Budget opex: actual × 1.03 (budget more expense → actual is favorable)
        -(2000000 + (numbered.rn % 7) * 450000)
        * POWER(1.02, months.qi)
        * (0.45 + (numbered.rn % 5) * 0.025)
        * lc.pct
        * months.month_frac
        * 1.03
      END
    , 2) AS budget_amount
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN repe_fund f ON f.fund_id = d.fund_id
  JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
  CROSS JOIN LATERAL (
    SELECT ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
    FROM repe_asset a2
    JOIN repe_property_asset pa2 ON pa2.asset_id = a2.asset_id
    WHERE a2.asset_id = a.asset_id
  ) AS numbered
  CROSS JOIN (
    SELECT
      (y.yr || '-' || LPAD(m.mo::text, 2, '0') || '-01')::date AS period_month,
      (y.yr - 2025) * 4 + ((m.mo - 1) / 3) AS qi,
      CASE (m.mo - 1) % 3
        WHEN 0 THEN 0.32
        WHEN 1 THEN 0.33
        ELSE 0.35
      END AS month_frac
    FROM (VALUES (2025), (2026)) AS y(yr)
    CROSS JOIN generate_series(1, 12) AS m(mo)
  ) AS months
  CROSS JOIN (VALUES
    ('RENT',          true,  0.85),
    ('OTHER_INCOME',  true,  0.15),
    ('PAYROLL',       false, 0.25),
    ('REPAIRS_MAINT', false, 0.15),
    ('UTILITIES',     false, 0.20),
    ('TAXES',         false, 0.20),
    ('INSURANCE',     false, 0.10),
    ('MGMT_FEES',     false, 0.10)
  ) AS lc(line_code, is_revenue, pct)
  WHERE eb.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'::uuid
) AS base
WHERE NOT EXISTS (
  SELECT 1 FROM uw_noi_budget_monthly b
  WHERE b.env_id = base.env_id
    AND b.asset_id = base.asset_id
    AND b.uw_version_id = 'b1b2c3d4-0001-0001-0001-000000000001'::uuid
    AND b.period_month = base.period_month
    AND b.line_code = base.line_code
);

-- =============================================================================
-- VI. Pro Forma Lines (uw_noi_budget_monthly) — PROFORMA version
-- =============================================================================
-- Pro forma = more optimistic underwriting:
--   Revenue: actual × 1.06 (6% above actuals — value-add upside)
--   OpEx:    actual × 0.95 (5% below actuals — operational efficiencies)

INSERT INTO uw_noi_budget_monthly
  (env_id, business_id, asset_id, uw_version_id, period_month, line_code, amount)
SELECT
  base.env_id,
  base.business_id,
  base.asset_id,
  'b1b2c3d4-0001-0001-0002-000000000001'::uuid,
  base.period_month,
  base.line_code,
  base.proforma_amount
FROM (
  SELECT
    eb.env_id::text AS env_id,
    eb.business_id,
    a.asset_id,
    months.period_month,
    lc.line_code,
    ROUND(
      CASE WHEN lc.is_revenue THEN
        (2000000 + (numbered.rn % 7) * 450000)
        * POWER(1.02, months.qi)
        * lc.pct
        * months.month_frac
        * 1.06
      ELSE
        -(2000000 + (numbered.rn % 7) * 450000)
        * POWER(1.02, months.qi)
        * (0.45 + (numbered.rn % 5) * 0.025)
        * lc.pct
        * months.month_frac
        * 0.95
      END
    , 2) AS proforma_amount
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN repe_fund f ON f.fund_id = d.fund_id
  JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
  CROSS JOIN LATERAL (
    SELECT ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
    FROM repe_asset a2
    JOIN repe_property_asset pa2 ON pa2.asset_id = a2.asset_id
    WHERE a2.asset_id = a.asset_id
  ) AS numbered
  CROSS JOIN (
    SELECT
      (y.yr || '-' || LPAD(m.mo::text, 2, '0') || '-01')::date AS period_month,
      (y.yr - 2025) * 4 + ((m.mo - 1) / 3) AS qi,
      CASE (m.mo - 1) % 3
        WHEN 0 THEN 0.32
        WHEN 1 THEN 0.33
        ELSE 0.35
      END AS month_frac
    FROM (VALUES (2025), (2026)) AS y(yr)
    CROSS JOIN generate_series(1, 12) AS m(mo)
  ) AS months
  CROSS JOIN (VALUES
    ('RENT',          true,  0.85),
    ('OTHER_INCOME',  true,  0.15),
    ('PAYROLL',       false, 0.25),
    ('REPAIRS_MAINT', false, 0.15),
    ('UTILITIES',     false, 0.20),
    ('TAXES',         false, 0.20),
    ('INSURANCE',     false, 0.10),
    ('MGMT_FEES',     false, 0.10)
  ) AS lc(line_code, is_revenue, pct)
  WHERE eb.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'::uuid
) AS base
WHERE NOT EXISTS (
  SELECT 1 FROM uw_noi_budget_monthly b
  WHERE b.env_id = base.env_id
    AND b.asset_id = base.asset_id
    AND b.uw_version_id = 'b1b2c3d4-0001-0001-0002-000000000001'::uuid
    AND b.period_month = base.period_month
    AND b.line_code = base.line_code
);

-- =============================================================================
-- VII. GL Balances (for accounting tab completeness)
-- =============================================================================
-- Seed GL balances that correspond to the normalized actuals.
-- This allows the accounting import pipeline to re-derive normalized NOI
-- from GL if ever re-run.

INSERT INTO acct_gl_balance_monthly
  (env_id, business_id, asset_id, period_month, gl_account, amount, source_id)
SELECT
  base.env_id,
  base.business_id,
  base.asset_id,
  base.period_month,
  base.gl_account,
  base.amount,
  'seed_286'
FROM (
  SELECT
    eb.env_id::text AS env_id,
    eb.business_id,
    a.asset_id,
    months.period_month,
    gl.gl_account,
    -- GL amounts are always positive (sign is applied by mapping rule)
    ROUND(
      CASE WHEN gl.is_revenue THEN
        (2000000 + (numbered.rn % 7) * 450000)
        * POWER(1.02, months.qi)
        * gl.pct
        * months.month_frac
      ELSE
        (2000000 + (numbered.rn % 7) * 450000)
        * POWER(1.02, months.qi)
        * (0.45 + (numbered.rn % 5) * 0.025)
        * gl.pct
        * months.month_frac
      END
    , 2) AS amount
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN repe_fund f ON f.fund_id = d.fund_id
  JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
  CROSS JOIN LATERAL (
    SELECT ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
    FROM repe_asset a2
    JOIN repe_property_asset pa2 ON pa2.asset_id = a2.asset_id
    WHERE a2.asset_id = a.asset_id
  ) AS numbered
  CROSS JOIN (
    SELECT
      (y.yr || '-' || LPAD(m.mo::text, 2, '0') || '-01')::date AS period_month,
      (y.yr - 2025) * 4 + ((m.mo - 1) / 3) AS qi,
      CASE (m.mo - 1) % 3
        WHEN 0 THEN 0.32
        WHEN 1 THEN 0.33
        ELSE 0.35
      END AS month_frac
    FROM (VALUES (2025), (2026)) AS y(yr)
    CROSS JOIN generate_series(1, 12) AS m(mo)
  ) AS months
  CROSS JOIN (VALUES
    ('4000', true,  0.85),
    ('4100', true,  0.15),
    ('5000', false, 0.25),
    ('5100', false, 0.15),
    ('5200', false, 0.20),
    ('5300', false, 0.20),
    ('5400', false, 0.10),
    ('5500', false, 0.10)
  ) AS gl(gl_account, is_revenue, pct)
  WHERE eb.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'::uuid
) AS base
WHERE NOT EXISTS (
  SELECT 1 FROM acct_gl_balance_monthly g
  WHERE g.env_id = base.env_id
    AND g.asset_id = base.asset_id
    AND g.period_month = base.period_month
    AND g.gl_account = base.gl_account
    AND g.source_id = 'seed_286'
);

-- =============================================================================
-- VIII. Run Record + Pre-computed Variance for 2026Q1
-- =============================================================================
-- Create a run record so re_asset_variance_qtr rows have a valid FK.

-- We need at least one fund_id. Use the first fund in the env.
DO $$
DECLARE
  v_env_id text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  v_fund_id uuid;
  v_run_id uuid := 'c1c2c3d4-0001-0001-0001-000000000001';
  v_quarter text := '2026Q1';
  v_uw_version_id uuid := 'b1b2c3d4-0001-0001-0001-000000000001';
  r RECORD;
BEGIN
  -- Get business_id
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE NOTICE 'No business binding found for env %, skipping variance seed', v_env_id;
    RETURN;
  END IF;

  -- Create run records per fund (variance is fund-scoped)
  FOR r IN
    SELECT DISTINCT d.fund_id
    FROM repe_asset a
    JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE f.business_id = v_business_id
  LOOP
    -- Deterministic run_id per fund: hash the fund_id into last segment
    DECLARE
      v_fund_run_id uuid;
    BEGIN
      v_fund_run_id := ('c1c2c3d4-0001-' || LPAD(
        (('x' || LEFT(REPLACE(r.fund_id::text, '-', ''), 4))::bit(16)::int % 9999 + 1)::text,
        4, '0'
      ) || '-0001-000000000001')::uuid;

      INSERT INTO re_run (id, env_id, business_id, fund_id, quarter, run_type, status, created_by)
      VALUES (v_fund_run_id, v_env_id, v_business_id, r.fund_id, v_quarter,
              'QUARTER_CLOSE', 'completed', 'seed_286')
      ON CONFLICT (id) DO NOTHING;

      -- Compute and insert variance for 2026Q1
      INSERT INTO re_asset_variance_qtr
        (run_id, env_id, business_id, fund_id, investment_id, asset_id,
         quarter, line_code, actual_amount, plan_amount, variance_amount, variance_pct)
      SELECT
        v_fund_run_id,
        v_env_id,
        v_business_id,
        r.fund_id,
        d.deal_id,
        merged.asset_id,
        v_quarter,
        merged.line_code,
        merged.actual_amount,
        merged.plan_amount,
        merged.actual_amount - merged.plan_amount,
        CASE WHEN merged.plan_amount = 0 THEN NULL
             ELSE ROUND((merged.actual_amount - merged.plan_amount) / ABS(merged.plan_amount), 4)
        END
      FROM (
        SELECT
          COALESCE(act.asset_id, bud.asset_id) AS asset_id,
          COALESCE(act.line_code, bud.line_code) AS line_code,
          COALESCE(act.actual_amount, 0) AS actual_amount,
          COALESCE(bud.plan_amount, 0) AS plan_amount
        FROM (
          SELECT asset_id, line_code, SUM(amount) AS actual_amount
          FROM acct_normalized_noi_monthly
          WHERE env_id = v_env_id
            AND business_id = v_business_id
            AND period_month >= '2026-01-01'::date
            AND period_month <= '2026-03-01'::date
          GROUP BY asset_id, line_code
        ) act
        FULL OUTER JOIN (
          SELECT asset_id, line_code, SUM(amount) AS plan_amount
          FROM uw_noi_budget_monthly
          WHERE env_id = v_env_id
            AND business_id = v_business_id
            AND uw_version_id = v_uw_version_id
            AND period_month >= '2026-01-01'::date
            AND period_month <= '2026-03-01'::date
          GROUP BY asset_id, line_code
        ) bud ON act.asset_id = bud.asset_id AND act.line_code = bud.line_code
      ) merged
      JOIN repe_asset a ON a.asset_id = merged.asset_id
      JOIN repe_deal d ON d.deal_id = a.deal_id
      WHERE d.fund_id = r.fund_id
        AND NOT EXISTS (
          SELECT 1 FROM re_asset_variance_qtr v
          WHERE v.run_id = v_fund_run_id
            AND v.asset_id = merged.asset_id
            AND v.line_code = merged.line_code
        );
    END;
  END LOOP;
END $$;

-- =============================================================================
-- IX. Extend GL rollup to cover 2025Q1 + 2026Q2–Q4 (was only 2025Q2–2026Q1)
-- =============================================================================

INSERT INTO re_asset_acct_quarter_rollup
  (env_id, business_id, asset_id, quarter, revenue, opex, noi, capex, source)
SELECT
  eb.env_id,
  eb.business_id,
  a.asset_id,
  q.quarter,
  ROUND(
    (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi), 2
  ) AS revenue,
  ROUND(
    (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi)
    * (0.45 + (numbered.rn % 5) * 0.025), 2
  ) AS opex,
  ROUND(
    (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi)
    - (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi)
      * (0.45 + (numbered.rn % 5) * 0.025), 2
  ) AS noi,
  ROUND(
    (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi)
    * (0.08 + (numbered.rn % 3) * 0.02), 2
  ) AS capex,
  'seed' AS source
FROM repe_asset a
JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
CROSS JOIN (
  -- Additional quarters not covered by 285 (which had 2025Q2–2026Q1 at qi=0..3)
  VALUES ('2025Q1', -1), ('2026Q2', 4), ('2026Q3', 5), ('2026Q4', 6)
) AS q(quarter, qi)
CROSS JOIN LATERAL (
  SELECT ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
  FROM repe_asset a2
  JOIN repe_property_asset pa2 ON pa2.asset_id = a2.asset_id
  WHERE a2.asset_id = a.asset_id
) AS numbered
ON CONFLICT (env_id, asset_id, quarter) DO NOTHING;

-- Also extend occupancy data to cover same quarters
INSERT INTO re_asset_occupancy_quarter
  (env_id, business_id, asset_id, quarter, occupancy, avg_rent,
   units_occupied, units_total, source)
SELECT
  eb.env_id,
  eb.business_id,
  a.asset_id,
  q.quarter,
  ROUND(
    (88 + (numbered.rn % 5) * 1.8)
    + (q.qi + 1) * 0.4
    - CASE WHEN q.qi IN (2, 6) THEN 1.0 ELSE 0 END
  , 1) AS occupancy,
  ROUND(
    (1500 + (numbered.rn % 8) * 250) * POWER(1.005, q.qi + 1), 2
  ) AS avg_rent,
  ROUND(
    COALESCE(pa.units, 200)
    * ((88 + (numbered.rn % 5) * 1.8 + (q.qi + 1) * 0.4
        - CASE WHEN q.qi IN (2, 6) THEN 1.0 ELSE 0 END) / 100.0)
  )::int AS units_occupied,
  COALESCE(pa.units, 200) AS units_total,
  'seed' AS source
FROM repe_asset a
JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
CROSS JOIN (
  VALUES ('2025Q1', -1), ('2026Q2', 4), ('2026Q3', 5), ('2026Q4', 6)
) AS q(quarter, qi)
CROSS JOIN LATERAL (
  SELECT ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
  FROM repe_asset a2
  JOIN repe_property_asset pa2 ON pa2.asset_id = a2.asset_id
  WHERE a2.asset_id = a.asset_id
) AS numbered
ON CONFLICT (env_id, asset_id, quarter) DO NOTHING;

-- =============================================================================
-- X. Integrity Verification (informational)
-- =============================================================================
-- Run this to verify seed coverage:
--
-- SELECT 'actuals' AS source, COUNT(DISTINCT asset_id), COUNT(*) AS rows
-- FROM acct_normalized_noi_monthly WHERE source_hash = 'seed_286'
-- UNION ALL
-- SELECT 'budget', COUNT(DISTINCT asset_id), COUNT(*)
-- FROM uw_noi_budget_monthly WHERE uw_version_id = 'b1b2c3d4-0001-0001-0001-000000000001'
-- UNION ALL
-- SELECT 'proforma', COUNT(DISTINCT asset_id), COUNT(*)
-- FROM uw_noi_budget_monthly WHERE uw_version_id = 'b1b2c3d4-0001-0001-0002-000000000001'
-- UNION ALL
-- SELECT 'variance', COUNT(DISTINCT asset_id), COUNT(*)
-- FROM re_asset_variance_qtr WHERE quarter = '2026Q1';
