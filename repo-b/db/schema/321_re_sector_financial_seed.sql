-- 321_re_sector_financial_seed.sql
-- Overwrite uniform seed data with sector-aware financial profiles.
-- Different property types get different revenue bases, opex ratios,
-- capex rates, occupancy patterns, and rent growth.
--
-- Depends on: 285_re_asset_accounting_seed.sql, 286_re_budget_proforma_seed.sql
-- Idempotent: uses ON CONFLICT DO UPDATE / WHERE EXISTS guards.

-- =============================================================================
-- I. Sector profile CTE (reused across updates)
-- =============================================================================
-- property_type → rev_base (quarterly), opex_ratio, capex_pct, base_occupancy, rent_growth
-- revenue base is quarterly; monthly = /3

-- We'll use a DO block to update existing rollup data with sector-specific values.

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

  IF v_business_id IS NULL THEN
    RAISE NOTICE 'No business binding for env %, skipping sector seed', v_env_id;
    RETURN;
  END IF;

  -- Update each asset's rollup data based on its property type
  FOR r IN
    SELECT
      a.asset_id,
      COALESCE(pa.property_type, 'multifamily') AS property_type,
      ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
    FROM repe_asset a
    JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE f.business_id = v_business_id
  LOOP
    DECLARE
      v_rev_base numeric;
      v_opex_ratio numeric;
      v_capex_pct numeric;
      v_base_occ numeric;
      v_rent_growth numeric;
      v_seasonal_q4 numeric;
      v_base_rent numeric;
    BEGIN
      -- Assign sector profile
      CASE LOWER(r.property_type)
        WHEN 'multifamily' THEN
          v_rev_base := 3200000; v_opex_ratio := 0.42; v_capex_pct := 0.06;
          v_base_occ := 93; v_rent_growth := 0.025; v_seasonal_q4 := -1.0;
          v_base_rent := 1850;
        WHEN 'office' THEN
          v_rev_base := 4500000; v_opex_ratio := 0.48; v_capex_pct := 0.10;
          v_base_occ := 88; v_rent_growth := 0.015; v_seasonal_q4 := -2.0;
          v_base_rent := 3200;
        WHEN 'industrial' THEN
          v_rev_base := 2800000; v_opex_ratio := 0.35; v_capex_pct := 0.04;
          v_base_occ := 97; v_rent_growth := 0.030; v_seasonal_q4 := 0.0;
          v_base_rent := 1200;
        WHEN 'hotel', 'hospitality' THEN
          v_rev_base := 5000000; v_opex_ratio := 0.62; v_capex_pct := 0.08;
          v_base_occ := 72; v_rent_growth := 0.020; v_seasonal_q4 := 5.0;
          v_base_rent := 185; -- ADR
        WHEN 'senior_housing', 'senior housing' THEN
          v_rev_base := 4200000; v_opex_ratio := 0.58; v_capex_pct := 0.05;
          v_base_occ := 89; v_rent_growth := 0.020; v_seasonal_q4 := -0.5;
          v_base_rent := 5500; -- monthly rate
        WHEN 'student_housing', 'student housing' THEN
          v_rev_base := 2600000; v_opex_ratio := 0.44; v_capex_pct := 0.07;
          v_base_occ := 95; v_rent_growth := 0.030; v_seasonal_q4 := -3.0;
          v_base_rent := 1100;
        WHEN 'medical_office', 'medical office', 'medical' THEN
          v_rev_base := 3800000; v_opex_ratio := 0.50; v_capex_pct := 0.07;
          v_base_occ := 92; v_rent_growth := 0.020; v_seasonal_q4 := 0.0;
          v_base_rent := 2800;
        WHEN 'retail' THEN
          v_rev_base := 3000000; v_opex_ratio := 0.40; v_capex_pct := 0.05;
          v_base_occ := 90; v_rent_growth := 0.015; v_seasonal_q4 := 3.0;
          v_base_rent := 2400;
        ELSE -- default / mixed
          v_rev_base := 3200000; v_opex_ratio := 0.45; v_capex_pct := 0.06;
          v_base_occ := 91; v_rent_growth := 0.020; v_seasonal_q4 := -1.0;
          v_base_rent := 2000;
      END CASE;

      -- Add asset-level variation using row number
      v_rev_base := v_rev_base + (r.rn % 5) * 200000;
      v_opex_ratio := v_opex_ratio + (r.rn % 3) * 0.01;

      -- Update 8 quarters of rollup data (2025Q1 through 2026Q4)
      UPDATE re_asset_acct_quarter_rollup qr
      SET
        revenue = ROUND(
          v_rev_base * POWER(1 + v_rent_growth, (
            CASE LEFT(qr.quarter, 4)::int
              WHEN 2025 THEN RIGHT(qr.quarter, 1)::int - 1
              ELSE 4 + RIGHT(qr.quarter, 1)::int - 1
            END
          )::numeric / 4.0)
        , 2),
        opex = ROUND(
          v_rev_base * POWER(1 + v_rent_growth, (
            CASE LEFT(qr.quarter, 4)::int
              WHEN 2025 THEN RIGHT(qr.quarter, 1)::int - 1
              ELSE 4 + RIGHT(qr.quarter, 1)::int - 1
            END
          )::numeric / 4.0) * v_opex_ratio
        , 2),
        noi = ROUND(
          v_rev_base * POWER(1 + v_rent_growth, (
            CASE LEFT(qr.quarter, 4)::int
              WHEN 2025 THEN RIGHT(qr.quarter, 1)::int - 1
              ELSE 4 + RIGHT(qr.quarter, 1)::int - 1
            END
          )::numeric / 4.0) * (1 - v_opex_ratio)
        , 2),
        capex = ROUND(
          v_rev_base * POWER(1 + v_rent_growth, (
            CASE LEFT(qr.quarter, 4)::int
              WHEN 2025 THEN RIGHT(qr.quarter, 1)::int - 1
              ELSE 4 + RIGHT(qr.quarter, 1)::int - 1
            END
          )::numeric / 4.0) * v_capex_pct
        , 2),
        source = 'sector_seed'
      WHERE qr.asset_id = r.asset_id
        AND qr.env_id = v_env_id;

      -- Update occupancy data
      UPDATE re_asset_occupancy_quarter oq
      SET
        occupancy = ROUND(
          v_base_occ
          + (CASE LEFT(oq.quarter, 4)::int
              WHEN 2025 THEN RIGHT(oq.quarter, 1)::int - 1
              ELSE 4 + RIGHT(oq.quarter, 1)::int - 1
            END) * 0.3
          + CASE RIGHT(oq.quarter, 1)::int WHEN 4 THEN v_seasonal_q4 ELSE 0 END
        , 1),
        avg_rent = ROUND(
          v_base_rent * POWER(1 + v_rent_growth / 4.0, (
            CASE LEFT(oq.quarter, 4)::int
              WHEN 2025 THEN RIGHT(oq.quarter, 1)::int - 1
              ELSE 4 + RIGHT(oq.quarter, 1)::int - 1
            END
          ))
        , 2),
        source = 'sector_seed'
      WHERE oq.asset_id = r.asset_id
        AND oq.env_id = v_env_id;

    END;
  END LOOP;
END $$;

-- =============================================================================
-- II. Update normalized NOI monthly to match sector profiles
-- =============================================================================
-- Re-derive normalized actuals from the updated rollup data

DO $$
DECLARE
  v_env_id text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  r RECORD;
BEGIN
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN RETURN; END IF;

  -- For each asset+quarter, update the monthly normalized NOI to match rollup
  FOR r IN
    SELECT qr.asset_id, qr.quarter, qr.revenue, qr.opex, qr.noi
    FROM re_asset_acct_quarter_rollup qr
    WHERE qr.env_id = v_env_id::uuid
      AND qr.business_id = v_business_id
      AND qr.source = 'sector_seed'
  LOOP
    DECLARE
      v_year int := LEFT(r.quarter, 4)::int;
      v_q int := RIGHT(r.quarter, 1)::int;
      v_start_month int := (v_q - 1) * 3 + 1;
      v_month_fracs numeric[] := ARRAY[0.32, 0.33, 0.35];
      i int;
      v_period date;
    BEGIN
      FOR i IN 0..2 LOOP
        v_period := (v_year || '-' || LPAD((v_start_month + i)::text, 2, '0') || '-01')::date;

        -- Update revenue lines
        UPDATE acct_normalized_noi_monthly
        SET amount = ROUND(r.revenue * v_month_fracs[i+1] *
          CASE line_code
            WHEN 'RENT' THEN 0.85
            WHEN 'OTHER_INCOME' THEN 0.15
            ELSE 0
          END, 2)
        WHERE env_id = v_env_id
          AND business_id = v_business_id
          AND asset_id = r.asset_id
          AND period_month = v_period
          AND line_code IN ('RENT', 'OTHER_INCOME')
          AND source_hash = 'seed_286';

        -- Update expense lines (negative amounts)
        UPDATE acct_normalized_noi_monthly
        SET amount = ROUND(-r.opex * v_month_fracs[i+1] *
          CASE line_code
            WHEN 'PAYROLL' THEN 0.25
            WHEN 'REPAIRS_MAINT' THEN 0.15
            WHEN 'UTILITIES' THEN 0.20
            WHEN 'TAXES' THEN 0.20
            WHEN 'INSURANCE' THEN 0.10
            WHEN 'MGMT_FEES' THEN 0.10
            ELSE 0
          END, 2)
        WHERE env_id = v_env_id
          AND business_id = v_business_id
          AND asset_id = r.asset_id
          AND period_month = v_period
          AND line_code IN ('PAYROLL', 'REPAIRS_MAINT', 'UTILITIES', 'TAXES', 'INSURANCE', 'MGMT_FEES')
          AND source_hash = 'seed_286';
      END LOOP;
    END;
  END LOOP;
END $$;
