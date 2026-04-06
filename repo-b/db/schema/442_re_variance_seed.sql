-- 442_re_variance_seed.sql
-- Seeds re_run and re_asset_variance_qtr for the Meridian REPE demo portfolio.
--
-- PURPOSE: Make `finance.noi_variance` MCP tool and "actual vs budget" queries
-- return meaningful data for Meridian. Without this seed, the tool returns
-- an empty result set because re_asset_variance_qtr has no rows.
--
-- DATA MODEL:
--   re_run (1 per fund×quarter) → re_asset_variance_qtr (5 line_codes per asset×quarter)
--   Line codes: GROSS_REVENUE, VACANCY_LOSS, EGI, OPERATING_EXPENSE, NOI
--
-- VARIANCE STORY:
--   - Budget (plan) was set 8–15% above actual NOI (aggressive budget = typical value-add story)
--   - Revenue beat budget by ~2–5% on strong assets; missed on weaker ones
--   - Expense ran 3–8% over budget (cost pressure narrative)
--   - Net: most assets are below budget NOI (unfavorable variance for the portfolio)
--   - A few assets beat budget (positive variance to make the data interesting)
--
-- SOURCE: Derives actual_amount from re_asset_quarter_state (which is fully seeded by 439).
--         plan_amount = actual_amount adjusted by a per-asset variance factor.
--
-- Depends on: 270 (re_run, re_asset_variance_qtr), 439 (re_asset_quarter_state rows)
-- Idempotent: ON CONFLICT DO NOTHING on both tables.

DO $$
DECLARE
  v_biz_id      uuid;
  v_env_id      text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_run_id      uuid;

  v_quarters    text[] := ARRAY['2024Q3','2024Q4','2025Q1','2025Q2','2025Q3','2025Q4'];
  v_q           text;

  -- Per-asset variance factors (positive = budget was higher than actual for revenue,
  -- meaning an unfavorable revenue variance; reversed for expense).
  -- Format: (asset_name, rev_plan_factor, exp_plan_factor)
  -- rev_plan_factor > 1  → budget was ambitious → actual missed budget (unfavorable)
  -- rev_plan_factor < 1  → budget was conservative → actual beat budget (favorable)
  -- exp_plan_factor > 1  → budget assumed lower opex → actual ran over (unfavorable)
  v_asset       RECORD;
  v_fund        RECORD;

  v_actual_rev    numeric;
  v_actual_opex   numeric;
  v_actual_noi    numeric;
  v_actual_vac    numeric;

  v_plan_rev      numeric;
  v_plan_vac      numeric;
  v_plan_egi      numeric;
  v_plan_opex     numeric;
  v_plan_noi      numeric;

  v_var_rev_factor  numeric;
  v_var_exp_factor  numeric;

BEGIN

  -- Resolve first available business_id
  SELECT business_id INTO v_biz_id FROM business ORDER BY created_at LIMIT 1;
  IF v_biz_id IS NULL THEN
    RAISE NOTICE '442_re_variance_seed: no business found, skipping';
    RETURN;
  END IF;

  -- Check if re_asset_variance_qtr already has data (idempotent guard)
  IF EXISTS (
    SELECT 1 FROM re_asset_variance_qtr WHERE business_id = v_biz_id LIMIT 1
  ) THEN
    RAISE NOTICE '442_re_variance_seed: variance rows already present for business %, skipping', v_biz_id;
    RETURN;
  END IF;

  -- Loop: for each fund × quarter → insert one re_run, then insert variance rows for each asset
  FOR v_fund IN
    SELECT DISTINCT d.fund_id
    FROM repe_deal d
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE f.business_id = v_biz_id
  LOOP
    FOREACH v_q IN ARRAY v_quarters LOOP

      -- Insert re_run record for this fund×quarter
      v_run_id := gen_random_uuid();
      INSERT INTO re_run (id, env_id, business_id, fund_id, quarter, run_type, status, created_by)
      VALUES (
        v_run_id,
        v_env_id,
        v_biz_id,
        v_fund.fund_id,
        v_q,
        'QUARTER_CLOSE',
        'complete',
        'seed_442'
      )
      ON CONFLICT DO NOTHING;

      -- For each asset in this fund, derive variance rows from re_asset_quarter_state
      FOR v_asset IN
        SELECT
          a.asset_id,
          a.name AS asset_name,
          d.deal_id AS investment_id
        FROM repe_asset a
        JOIN repe_deal d ON d.deal_id = a.deal_id
        WHERE d.fund_id = v_fund.fund_id
      LOOP

        -- Read actual amounts from the canonical quarter-state seed
        SELECT
          COALESCE(qs.revenue, 0),
          COALESCE(qs.opex, 0),
          COALESCE(qs.noi, 0)
        INTO v_actual_rev, v_actual_opex, v_actual_noi
        FROM re_asset_quarter_state qs
        WHERE qs.asset_id = v_asset.asset_id
          AND qs.quarter  = v_q
        ORDER BY qs.quarter DESC
        LIMIT 1;

        -- Skip if no quarter-state row exists for this asset×quarter
        IF v_actual_rev = 0 AND v_actual_opex = 0 THEN
          CONTINUE;
        END IF;

        -- Derive vacancy loss (assume 5-10% of gross revenue)
        -- We use asset_id hash to make each asset deterministically different
        -- Strip dashes from uuid text before hex-casting (uuid contains '-' at positions 9,14,19,24)
        v_actual_vac := ROUND(v_actual_rev * (0.05 + (('x' || substr(replace(v_asset.asset_id::text, '-', ''), 1, 8))::bit(32)::int::numeric % 6) * 0.01), 0);

        -- Assign per-asset variance factors based on deterministic hash of asset_id
        -- This gives realistic variation without randomness (seed is stable on re-run)
        CASE (('x' || substr(replace(v_asset.asset_id::text, '-', ''), 9, 8))::bit(32)::int::numeric % 5)
          WHEN 0 THEN  -- asset beats budget: revenue up, expense under
            v_var_rev_factor := 0.97;   -- budget was 3% lower → actual beat it
            v_var_exp_factor := 1.04;   -- budget assumed 4% higher opex → actual under
          WHEN 1 THEN  -- slightly missed: modest revenue miss, slight expense over
            v_var_rev_factor := 1.06;
            v_var_exp_factor := 1.05;
          WHEN 2 THEN  -- moderate miss: revenue 9% below budget
            v_var_rev_factor := 1.09;
            v_var_exp_factor := 1.07;
          WHEN 3 THEN  -- strong beat: revenue 5% above budget
            v_var_rev_factor := 0.95;
            v_var_exp_factor := 1.03;
          ELSE          -- on-budget: minor variance
            v_var_rev_factor := 1.03;
            v_var_exp_factor := 1.02;
        END CASE;

        -- Compute plan amounts
        v_plan_rev  := ROUND(v_actual_rev  * v_var_rev_factor,  0);
        v_plan_vac  := ROUND(v_actual_vac  * v_var_rev_factor,  0);
        v_plan_egi  := v_plan_rev - v_plan_vac;
        v_plan_opex := ROUND(v_actual_opex / v_var_exp_factor,  0);
        v_plan_noi  := v_plan_egi - v_plan_opex;

        -- Insert the 5 variance line items for this asset×quarter
        INSERT INTO re_asset_variance_qtr (
          id, run_id, env_id, business_id, fund_id, investment_id, asset_id,
          quarter, line_code, actual_amount, plan_amount, variance_amount, variance_pct
        )
        VALUES
          -- GROSS_REVENUE
          (gen_random_uuid(), v_run_id, v_env_id, v_biz_id, v_fund.fund_id,
           v_asset.investment_id, v_asset.asset_id, v_q,
           'GROSS_REVENUE', v_actual_rev, v_plan_rev,
           v_actual_rev - v_plan_rev,
           CASE WHEN v_plan_rev != 0 THEN ROUND(((v_actual_rev - v_plan_rev) / ABS(v_plan_rev)) * 100, 2) ELSE NULL END),

          -- VACANCY_LOSS (negative amounts — reduction from gross)
          (gen_random_uuid(), v_run_id, v_env_id, v_biz_id, v_fund.fund_id,
           v_asset.investment_id, v_asset.asset_id, v_q,
           'VACANCY_LOSS', -v_actual_vac, -v_plan_vac,
           (-v_actual_vac) - (-v_plan_vac),
           CASE WHEN v_plan_vac != 0 THEN ROUND(((-v_actual_vac + v_plan_vac) / ABS(v_plan_vac)) * 100, 2) ELSE NULL END),

          -- EGI (effective gross income = revenue - vacancy)
          (gen_random_uuid(), v_run_id, v_env_id, v_biz_id, v_fund.fund_id,
           v_asset.investment_id, v_asset.asset_id, v_q,
           'EGI', v_actual_rev - v_actual_vac, v_plan_egi,
           (v_actual_rev - v_actual_vac) - v_plan_egi,
           CASE WHEN v_plan_egi != 0 THEN ROUND(((v_actual_rev - v_actual_vac - v_plan_egi) / ABS(v_plan_egi)) * 100, 2) ELSE NULL END),

          -- OPERATING_EXPENSE (negative amounts)
          (gen_random_uuid(), v_run_id, v_env_id, v_biz_id, v_fund.fund_id,
           v_asset.investment_id, v_asset.asset_id, v_q,
           'OPERATING_EXPENSE', -v_actual_opex, -v_plan_opex,
           (-v_actual_opex) - (-v_plan_opex),
           CASE WHEN v_plan_opex != 0 THEN ROUND(((-v_actual_opex + v_plan_opex) / ABS(v_plan_opex)) * 100, 2) ELSE NULL END),

          -- NOI
          (gen_random_uuid(), v_run_id, v_env_id, v_biz_id, v_fund.fund_id,
           v_asset.investment_id, v_asset.asset_id, v_q,
           'NOI', v_actual_noi, v_plan_noi,
           v_actual_noi - v_plan_noi,
           CASE WHEN v_plan_noi != 0 THEN ROUND(((v_actual_noi - v_plan_noi) / ABS(v_plan_noi)) * 100, 2) ELSE NULL END)

        ON CONFLICT DO NOTHING;

      END LOOP;  -- per asset
    END LOOP;    -- per quarter
  END LOOP;      -- per fund

  RAISE NOTICE '442_re_variance_seed: seeded re_asset_variance_qtr for business %', v_biz_id;
END $$;
