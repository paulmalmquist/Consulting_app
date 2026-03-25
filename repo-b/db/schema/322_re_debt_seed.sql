-- 322_re_debt_seed.sql
-- Seed debt service data: loans per asset, quarterly debt service,
-- and below-NOI items (TI/LC, reserves, net cash flow).
--
-- Depends on: 278_re_financial_intelligence.sql, 285_re_asset_accounting_seed.sql,
--             321_re_sector_financial_seed.sql
-- Idempotent: ON CONFLICT DO NOTHING / ADD COLUMN IF NOT EXISTS

-- =============================================================================
-- I. Add below-NOI columns to quarter rollup
-- =============================================================================

ALTER TABLE IF EXISTS re_asset_acct_quarter_rollup
  ADD COLUMN IF NOT EXISTS debt_service   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ti_lc          NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserves       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_cash_flow  NUMERIC DEFAULT 0;

-- =============================================================================
-- II. Seed loans for assets that lack them
-- =============================================================================

DO $$
DECLARE
  v_env_id text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  r RECORD;
  v_loan_id uuid;
  v_upb numeric;
  v_rate numeric;
  v_ltv numeric;
BEGIN
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT
      a.asset_id,
      d.deal_id AS investment_id,
      d.fund_id,
      COALESCE(pa.property_type, 'multifamily') AS property_type,
      COALESCE(qr.revenue, 3000000) AS latest_revenue,
      COALESCE(qr.noi, 1500000) AS latest_noi,
      ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
    FROM repe_asset a
    JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    LEFT JOIN LATERAL (
      SELECT revenue, noi FROM re_asset_acct_quarter_rollup
      WHERE asset_id = a.asset_id
      ORDER BY quarter DESC LIMIT 1
    ) qr ON true
    WHERE f.business_id = v_business_id
      AND NOT EXISTS (
        SELECT 1 FROM re_loan l WHERE l.asset_id = a.asset_id
      )
  LOOP
    -- Vary LTV and rate by sector
    CASE LOWER(r.property_type)
      WHEN 'multifamily' THEN v_ltv := 0.62; v_rate := 0.0475;
      WHEN 'office' THEN v_ltv := 0.55; v_rate := 0.0565;
      WHEN 'industrial' THEN v_ltv := 0.58; v_rate := 0.0495;
      WHEN 'hotel', 'hospitality' THEN v_ltv := 0.50; v_rate := 0.0625;
      WHEN 'senior_housing', 'senior housing' THEN v_ltv := 0.60; v_rate := 0.0535;
      WHEN 'student_housing', 'student housing' THEN v_ltv := 0.60; v_rate := 0.0510;
      WHEN 'medical_office', 'medical office', 'medical' THEN v_ltv := 0.57; v_rate := 0.0520;
      WHEN 'retail' THEN v_ltv := 0.55; v_rate := 0.0550;
      ELSE v_ltv := 0.58; v_rate := 0.0525;
    END CASE;

    -- Small asset-level variation
    v_ltv := v_ltv + (r.rn % 3) * 0.02;
    v_rate := v_rate + (r.rn % 4) * 0.0015;

    -- Compute UPB from implied asset value (NOI / assumed cap rate ~5.5%)
    v_upb := ROUND(r.latest_noi * 4 / 0.055 * v_ltv, 0);

    -- Deterministic loan UUID
    v_loan_id := ('d1d2d3d4-' || LPAD((r.rn)::text, 4, '0') || '-0001-0001-000000000001')::uuid;

    INSERT INTO re_loan
      (id, env_id, business_id, fund_id, investment_id, asset_id,
       loan_name, upb, rate_type, rate, maturity, amort_type)
    VALUES
      (v_loan_id, v_env_id, v_business_id, r.fund_id, r.investment_id, r.asset_id,
       'Senior Mortgage - ' || COALESCE(r.property_type, 'Property'),
       v_upb, 'fixed', v_rate,
       ('2029-' || LPAD(((r.rn % 12) + 1)::text, 2, '0') || '-01')::date,
       CASE WHEN r.rn % 3 = 0 THEN 'amortizing' ELSE 'interest_only' END)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- =============================================================================
-- III. Compute debt service and below-NOI items for all quarters
-- =============================================================================

DO $$
DECLARE
  v_env_id uuid := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  r RECORD;
BEGIN
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id
  LIMIT 1;

  IF v_business_id IS NULL THEN RETURN; END IF;

  -- For each asset with a loan, compute quarterly debt service
  FOR r IN
    SELECT
      qr.asset_id, qr.quarter, qr.revenue, qr.noi, qr.capex,
      COALESCE(l.upb, 0) AS upb,
      COALESCE(l.rate, 0) AS rate,
      COALESCE(l.amort_type, 'interest_only') AS amort_type,
      COALESCE(pa.property_type, 'multifamily') AS property_type
    FROM re_asset_acct_quarter_rollup qr
    JOIN repe_asset a ON a.asset_id = qr.asset_id
    JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    LEFT JOIN re_loan l ON l.asset_id = qr.asset_id
    WHERE qr.env_id = v_env_id
      AND qr.business_id = v_business_id
  LOOP
    DECLARE
      v_debt_svc numeric := 0;
      v_ti_lc numeric := 0;
      v_reserves numeric := 0;
      v_ncf numeric := 0;
      v_ti_lc_pct numeric;
    BEGIN
      -- Debt service: quarterly = UPB * rate / 4 (IO) or add principal for amortizing
      IF r.upb > 0 AND r.rate > 0 THEN
        v_debt_svc := ROUND(r.upb * r.rate / 4, 2);
        IF r.amort_type = 'amortizing' THEN
          -- Add ~principal portion for 30yr amortization
          v_debt_svc := v_debt_svc + ROUND(r.upb / (30 * 4), 2);
        END IF;
      END IF;

      -- TI/LC by sector
      CASE LOWER(r.property_type)
        WHEN 'office' THEN v_ti_lc_pct := 0.08;
        WHEN 'industrial' THEN v_ti_lc_pct := 0.06;
        WHEN 'retail' THEN v_ti_lc_pct := 0.07;
        WHEN 'multifamily' THEN v_ti_lc_pct := 0.015;
        WHEN 'hotel', 'hospitality' THEN v_ti_lc_pct := 0.02;
        WHEN 'senior_housing', 'senior housing' THEN v_ti_lc_pct := 0.01;
        WHEN 'student_housing', 'student housing' THEN v_ti_lc_pct := 0.02;
        WHEN 'medical_office', 'medical office', 'medical' THEN v_ti_lc_pct := 0.05;
        ELSE v_ti_lc_pct := 0.03;
      END CASE;

      v_ti_lc := ROUND(r.revenue * v_ti_lc_pct, 2);
      v_reserves := ROUND(r.noi * 0.025, 2);
      v_ncf := r.noi - COALESCE(r.capex, 0) - v_debt_svc - v_ti_lc - v_reserves;

      UPDATE re_asset_acct_quarter_rollup
      SET
        debt_service = v_debt_svc,
        ti_lc = v_ti_lc,
        reserves = v_reserves,
        net_cash_flow = ROUND(v_ncf, 2)
      WHERE asset_id = r.asset_id
        AND quarter = r.quarter
        AND env_id = v_env_id;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- IV. Seed below-NOI line codes into chart of accounts + mapping rules
-- =============================================================================

INSERT INTO acct_chart_of_accounts (gl_account, name, category, is_balance_sheet)
VALUES
  ('7000', 'Debt Service - Interest', 'Debt Service', false),
  ('7100', 'Debt Service - Principal', 'Debt Service', false),
  ('6100', 'Tenant Improvements',     'CapEx',        false),
  ('6200', 'Leasing Commissions',     'CapEx',        false),
  ('6300', 'Replacement Reserves',    'Reserves',     false)
ON CONFLICT (gl_account) DO NOTHING;

-- Add mapping rules for below-NOI items
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
  ('7000', 'DEBT_SERVICE_INT', 'CF', -1),
  ('7100', 'DEBT_SERVICE_PRIN', 'CF', -1),
  ('6100', 'TENANT_IMPROVEMENTS', 'CF', -1),
  ('6200', 'LEASING_COMMISSIONS', 'CF', -1),
  ('6300', 'REPLACEMENT_RESERVES', 'CF', -1)
) AS v(gl_account, target_line_code, target_statement, sign_multiplier)
WHERE eb.env_id = 'a1b2c3d4-0001-0001-0003-000000000001'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM acct_mapping_rule m
    WHERE m.env_id = eb.env_id::text
      AND m.business_id = eb.business_id
      AND m.gl_account = v.gl_account
  );
