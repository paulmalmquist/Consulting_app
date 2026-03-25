-- 355_re_size_aware_financials_seed.sql
-- Replace generic flat-base revenue with size-aware values derived from each
-- asset's actual square_feet / units, multiplied by sector-specific rent PSF.
--
-- Depends on: 285 (rollup tables + property backfill), 321 (sector profiles)
-- Idempotent: UPDATE WHERE match on asset_id + env_id + quarter.
--
-- Problem solved: 285 seeds revenue as $2M-$5.15M based only on row number.
-- 321 varies by sector but not by property size.  A 50K SF industrial building
-- and a 300K SF office tower could get similar revenue, which is unrealistic.
--
-- This seed scales revenue to: SF * rent_psf_per_year / 4  (or units * monthly_rent * 3)
-- then cascades opex, noi, capex, and occupancy schedule to match.

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
    RAISE NOTICE '355: No business binding for env %, skipping', v_env_id;
    RETURN;
  END IF;

  FOR r IN
    SELECT
      a.asset_id,
      COALESCE(LOWER(pa.property_type), 'multifamily') AS property_type,
      COALESCE(pa.square_feet, 0)::numeric AS sf,
      COALESCE(pa.units, 0)::int AS units,
      COALESCE(pa.leasable_sf, pa.square_feet, 0)::numeric AS leasable_sf,
      ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
    FROM repe_asset a
    JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE f.business_id = v_business_id
  LOOP
    DECLARE
      -- Sector financial profiles (annual rent per unit of measure)
      v_rev_quarterly numeric;
      v_opex_ratio numeric;
      v_capex_pct numeric;
      v_base_occ numeric;
      v_rent_growth numeric;
      v_seasonal_q4 numeric;
      v_base_rent numeric;   -- avg rent for occupancy table
    BEGIN
      -- ─── Derive quarterly revenue from property dimensions ───────────────
      CASE r.property_type
        -- OFFICE: $32/SF/yr → $8/SF/qtr
        WHEN 'office' THEN
          v_opex_ratio := 0.48; v_capex_pct := 0.10; v_base_occ := 88;
          v_rent_growth := 0.015; v_seasonal_q4 := -2.0; v_base_rent := 3200;
          IF r.sf > 0 THEN
            v_rev_quarterly := r.sf * 32.0 / 4.0;
          ELSE
            v_rev_quarterly := 4500000;  -- fallback
          END IF;

        -- MULTIFAMILY: $1,850/unit/month × 3
        WHEN 'multifamily' THEN
          v_opex_ratio := 0.42; v_capex_pct := 0.06; v_base_occ := 93;
          v_rent_growth := 0.025; v_seasonal_q4 := -1.0; v_base_rent := 1850;
          IF r.units > 0 THEN
            v_rev_quarterly := r.units * 1850.0 * 3.0;
          ELSIF r.sf > 0 THEN
            v_rev_quarterly := r.sf * 18.0 / 4.0;  -- $18/SF/yr
          ELSE
            v_rev_quarterly := 3200000;
          END IF;

        -- INDUSTRIAL: $12/SF/yr → $3/SF/qtr
        WHEN 'industrial' THEN
          v_opex_ratio := 0.35; v_capex_pct := 0.04; v_base_occ := 97;
          v_rent_growth := 0.030; v_seasonal_q4 := 0.0; v_base_rent := 1200;
          IF r.sf > 0 THEN
            v_rev_quarterly := r.sf * 12.0 / 4.0;
          ELSE
            v_rev_quarterly := 2800000;
          END IF;

        -- HOTEL / HOSPITALITY: $185 ADR × keys × 90 days × 72% occ
        WHEN 'hotel', 'hospitality' THEN
          v_opex_ratio := 0.62; v_capex_pct := 0.08; v_base_occ := 72;
          v_rent_growth := 0.020; v_seasonal_q4 := 5.0; v_base_rent := 185;
          IF r.units > 0 THEN
            v_rev_quarterly := r.units * 185.0 * 90.0 * 0.72;
          ELSE
            v_rev_quarterly := 5000000;
          END IF;

        -- SENIOR HOUSING: $5,500/bed/month × 3
        WHEN 'senior_housing', 'senior housing' THEN
          v_opex_ratio := 0.58; v_capex_pct := 0.05; v_base_occ := 89;
          v_rent_growth := 0.020; v_seasonal_q4 := -0.5; v_base_rent := 5500;
          IF r.units > 0 THEN
            v_rev_quarterly := r.units * 5500.0 * 3.0;
          ELSE
            v_rev_quarterly := 4200000;
          END IF;

        -- STUDENT HOUSING: $1,100/bed/month × 3
        WHEN 'student_housing', 'student housing' THEN
          v_opex_ratio := 0.44; v_capex_pct := 0.07; v_base_occ := 95;
          v_rent_growth := 0.030; v_seasonal_q4 := -3.0; v_base_rent := 1100;
          IF r.units > 0 THEN
            v_rev_quarterly := r.units * 1100.0 * 3.0;
          ELSE
            v_rev_quarterly := 2600000;
          END IF;

        -- MEDICAL OFFICE: $28/SF/yr → $7/SF/qtr
        WHEN 'medical_office', 'medical office', 'medical' THEN
          v_opex_ratio := 0.50; v_capex_pct := 0.07; v_base_occ := 92;
          v_rent_growth := 0.020; v_seasonal_q4 := 0.0; v_base_rent := 2800;
          IF r.sf > 0 THEN
            v_rev_quarterly := r.sf * 28.0 / 4.0;
          ELSE
            v_rev_quarterly := 3800000;
          END IF;

        -- RETAIL: $24/SF/yr → $6/SF/qtr
        WHEN 'retail' THEN
          v_opex_ratio := 0.40; v_capex_pct := 0.05; v_base_occ := 90;
          v_rent_growth := 0.015; v_seasonal_q4 := 3.0; v_base_rent := 2400;
          IF r.sf > 0 THEN
            v_rev_quarterly := r.sf * 24.0 / 4.0;
          ELSE
            v_rev_quarterly := 3000000;
          END IF;

        -- DEFAULT / MIXED
        ELSE
          v_opex_ratio := 0.45; v_capex_pct := 0.06; v_base_occ := 91;
          v_rent_growth := 0.020; v_seasonal_q4 := -1.0; v_base_rent := 2000;
          IF r.sf > 0 THEN
            v_rev_quarterly := r.sf * 22.0 / 4.0;
          ELSE
            v_rev_quarterly := 3200000;
          END IF;
      END CASE;

      -- Add small per-asset variation (±5%) so no two identical-size assets match exactly
      v_rev_quarterly := v_rev_quarterly * (1.0 + (r.rn % 7 - 3) * 0.015);
      v_opex_ratio := v_opex_ratio + (r.rn % 3) * 0.01;

      -- ─── Update 8 quarters of rollup data (2025Q1 → 2026Q4) ───────────
      UPDATE re_asset_acct_quarter_rollup qr
      SET
        revenue = ROUND(
          v_rev_quarterly * POWER(1 + v_rent_growth, (
            CASE LEFT(qr.quarter, 4)::int
              WHEN 2025 THEN RIGHT(qr.quarter, 1)::int - 1
              ELSE 4 + RIGHT(qr.quarter, 1)::int - 1
            END
          )::numeric / 4.0)
        , 2),
        opex = ROUND(
          v_rev_quarterly * POWER(1 + v_rent_growth, (
            CASE LEFT(qr.quarter, 4)::int
              WHEN 2025 THEN RIGHT(qr.quarter, 1)::int - 1
              ELSE 4 + RIGHT(qr.quarter, 1)::int - 1
            END
          )::numeric / 4.0) * v_opex_ratio
        , 2),
        noi = ROUND(
          v_rev_quarterly * POWER(1 + v_rent_growth, (
            CASE LEFT(qr.quarter, 4)::int
              WHEN 2025 THEN RIGHT(qr.quarter, 1)::int - 1
              ELSE 4 + RIGHT(qr.quarter, 1)::int - 1
            END
          )::numeric / 4.0) * (1.0 - v_opex_ratio)
        , 2),
        capex = ROUND(
          v_rev_quarterly * POWER(1 + v_rent_growth, (
            CASE LEFT(qr.quarter, 4)::int
              WHEN 2025 THEN RIGHT(qr.quarter, 1)::int - 1
              ELSE 4 + RIGHT(qr.quarter, 1)::int - 1
            END
          )::numeric / 4.0) * v_capex_pct
        , 2),
        source = 'size_aware_seed'
      WHERE qr.asset_id = r.asset_id
        AND qr.env_id = v_env_id;

      -- ─── Update occupancy data ─────────────────────────────────────────
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
        source = 'size_aware_seed'
      WHERE oq.asset_id = r.asset_id
        AND oq.env_id = v_env_id;

      -- ─── Also update asset_revenue_schedule + asset_expense_schedule ────
      -- (used by model engine from 307_cross_fund_seed.sql)
      UPDATE asset_revenue_schedule ars
      SET revenue = ROUND(
        v_rev_quarterly * POWER(1 + v_rent_growth,
          (EXTRACT(YEAR FROM ars.period_date) - 2025)::numeric
          + (EXTRACT(MONTH FROM ars.period_date) / 12.0)
        )
      , 2)
      WHERE ars.asset_id = r.asset_id;

      UPDATE asset_expense_schedule aes
      SET expense = ROUND(
        v_rev_quarterly * v_opex_ratio * POWER(1 + v_rent_growth,
          (EXTRACT(YEAR FROM aes.period_date) - 2025)::numeric
          + (EXTRACT(MONTH FROM aes.period_date) / 12.0)
        )
      , 2)
      WHERE aes.asset_id = r.asset_id;

    END;
  END LOOP;

  -- ─── Re-derive normalized NOI monthly from updated rollups ─────────────
  FOR r IN
    SELECT qr.asset_id, qr.quarter, qr.revenue, qr.opex, qr.noi
    FROM re_asset_acct_quarter_rollup qr
    WHERE qr.env_id = v_env_id
      AND qr.business_id = v_business_id
      AND qr.source = 'size_aware_seed'
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

        UPDATE acct_normalized_noi_monthly
        SET amount = ROUND(r.revenue * v_month_fracs[i+1] *
          CASE line_code
            WHEN 'RENT' THEN 0.85
            WHEN 'OTHER_INCOME' THEN 0.15
            ELSE 0
          END, 2)
        WHERE env_id = v_env_id::text
          AND business_id = v_business_id
          AND asset_id = r.asset_id
          AND period_month = v_period
          AND line_code IN ('RENT', 'OTHER_INCOME');

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
        WHERE env_id = v_env_id::text
          AND business_id = v_business_id
          AND asset_id = r.asset_id
          AND period_month = v_period
          AND line_code IN ('PAYROLL', 'REPAIRS_MAINT', 'UTILITIES', 'TAXES', 'INSURANCE', 'MGMT_FEES');
      END LOOP;
    END;
  END LOOP;

  -- ─── Re-derive debt service and below-NOI from updated NOI ─────────────
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
      AND qr.source = 'size_aware_seed'
  LOOP
    DECLARE
      v_debt_svc numeric := 0;
      v_ti_lc numeric := 0;
      v_reserves numeric := 0;
      v_ncf numeric := 0;
      v_ti_lc_pct numeric;
    BEGIN
      IF r.upb > 0 AND r.rate > 0 THEN
        v_debt_svc := ROUND(r.upb * r.rate / 4, 2);
        IF r.amort_type = 'amortizing' THEN
          v_debt_svc := v_debt_svc + ROUND(r.upb / (30 * 4), 2);
        END IF;
      END IF;

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

  -- ─── Update repe_property_asset.current_noi to match latest quarter ────
  UPDATE repe_property_asset pa
  SET current_noi = sub.noi * 4  -- annualized
  FROM (
    SELECT DISTINCT ON (qr.asset_id)
      qr.asset_id, qr.noi
    FROM re_asset_acct_quarter_rollup qr
    WHERE qr.env_id = v_env_id
      AND qr.source = 'size_aware_seed'
    ORDER BY qr.asset_id, qr.quarter DESC
  ) sub
  WHERE pa.asset_id = sub.asset_id;

  -- ─── Update repe_property_asset.occupancy to match latest quarter ──────
  UPDATE repe_property_asset pa
  SET occupancy = sub.occupancy / 100.0
  FROM (
    SELECT DISTINCT ON (oq.asset_id)
      oq.asset_id, oq.occupancy
    FROM re_asset_occupancy_quarter oq
    WHERE oq.env_id = v_env_id
      AND oq.source = 'size_aware_seed'
    ORDER BY oq.asset_id, oq.quarter DESC
  ) sub
  WHERE pa.asset_id = sub.asset_id;

  RAISE NOTICE '355: Size-aware financials applied for env %', v_env_id;
END $$;
