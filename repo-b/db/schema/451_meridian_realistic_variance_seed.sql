-- 451_meridian_realistic_variance_seed.sql
-- Replaces uniform hash-derived variance data with explicitly profiled
-- per-asset NOI variance that tells a realistic portfolio story.
--
-- PROBLEM SOLVED:
--   442 uses hash(asset_id) % 5 to assign variance factors, producing
--   limited variation and identical driver patterns across assets.
--   This makes "sort assets by NOI variance" return suspiciously uniform
--   results with RENT as the top driver for every asset.
--
-- VARIANCE STORY (per asset):
--
--   STRONG OUTPERFORMERS (NOI variance > +5%):
--     Aurora Residences      +8.2%  — lease-up beat plan, revenue +6%, opex under
--     Foundry Logistics      +6.1%  — industrial demand surge, near-zero vacancy
--     Gateway Industrial     +5.8%  — same sector tailwind as Foundry
--
--   NEAR-PLAN (-3% to +3%):
--     Northgate Student      +1.4%  — seasonal stable; minor opex overage
--     Riverfront Residences  +2.3%  — multifamily stable
--     Heritage Senior Living -1.8%  — labor cost creep offset by occupancy hold
--
--   UNDERPERFORMERS (NOI variance worse than -5%):
--     Cedar Grove Senior     -7.3%  — staffing cost overrun (labor market)
--     Tech Campus North      -9.1%  — occupancy drag (hybrid work), TI spend
--     Meridian Medical       -12.6% — anchor tenant partial vacate, revenue miss
--
-- DRIVER VARIATION:
--   Revenue shortfall:  Tech Campus, Meridian Medical
--   OpEx overrun:       Cedar Grove, Heritage
--   Vacancy drag:       Tech Campus, Meridian Medical
--   CapEx pressure:     Tech Campus
--   Occupancy beat:     Aurora, Foundry
--
-- STATUS REALISM:
--   Sets asset_status so the portfolio has visible status diversity:
--     active (5+), held (1), lease_up (1)
--
-- Depends on: 270, 439, 442, 446
-- Idempotent: DELETE + re-INSERT for the specific quarter.

-- ── Helper function: insert 5 variance line items for one asset ─────────
-- Must be created BEFORE the DO block that calls it.
DROP FUNCTION IF EXISTS _insert_variance_row_451(uuid, text, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric);

CREATE FUNCTION _insert_variance_row_451(
  p_run_id      uuid,
  p_env_id      text,
  p_biz_id      uuid,
  p_fund_id     uuid,
  p_invest_id   uuid,
  p_asset_id    uuid,
  p_quarter     text,
  p_actual_rev  numeric,
  p_plan_rev    numeric,
  p_actual_opex numeric,
  p_plan_opex   numeric
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual_vac  numeric;
  v_plan_vac    numeric;
  v_actual_egi  numeric;
  v_plan_egi    numeric;
  v_actual_noi  numeric;
  v_plan_noi    numeric;
BEGIN
  -- Vacancy = 6% of gross revenue (standard assumption)
  v_actual_vac := ROUND(p_actual_rev * 0.06, 0);
  v_plan_vac   := ROUND(p_plan_rev * 0.06, 0);

  v_actual_egi := p_actual_rev - v_actual_vac;
  v_plan_egi   := p_plan_rev - v_plan_vac;

  v_actual_noi := v_actual_egi - p_actual_opex;
  v_plan_noi   := v_plan_egi - p_plan_opex;

  INSERT INTO re_asset_variance_qtr (
    id, run_id, env_id, business_id, fund_id, investment_id, asset_id,
    quarter, line_code, actual_amount, plan_amount, variance_amount, variance_pct
  ) VALUES
    -- GROSS_REVENUE
    (gen_random_uuid(), p_run_id, p_env_id, p_biz_id, p_fund_id,
     p_invest_id, p_asset_id, p_quarter,
     'GROSS_REVENUE', p_actual_rev, p_plan_rev,
     p_actual_rev - p_plan_rev,
     CASE WHEN p_plan_rev != 0 THEN ROUND(((p_actual_rev - p_plan_rev) / ABS(p_plan_rev)) * 100, 2) ELSE NULL END),

    -- VACANCY_LOSS
    (gen_random_uuid(), p_run_id, p_env_id, p_biz_id, p_fund_id,
     p_invest_id, p_asset_id, p_quarter,
     'VACANCY_LOSS', -v_actual_vac, -v_plan_vac,
     (-v_actual_vac) - (-v_plan_vac),
     CASE WHEN v_plan_vac != 0 THEN ROUND(((v_plan_vac - v_actual_vac) / ABS(v_plan_vac)) * 100, 2) ELSE NULL END),

    -- EGI
    (gen_random_uuid(), p_run_id, p_env_id, p_biz_id, p_fund_id,
     p_invest_id, p_asset_id, p_quarter,
     'EGI', v_actual_egi, v_plan_egi,
     v_actual_egi - v_plan_egi,
     CASE WHEN v_plan_egi != 0 THEN ROUND(((v_actual_egi - v_plan_egi) / ABS(v_plan_egi)) * 100, 2) ELSE NULL END),

    -- OPERATING_EXPENSE
    (gen_random_uuid(), p_run_id, p_env_id, p_biz_id, p_fund_id,
     p_invest_id, p_asset_id, p_quarter,
     'OPERATING_EXPENSE', -p_actual_opex, -p_plan_opex,
     (-p_actual_opex) - (-p_plan_opex),
     CASE WHEN p_plan_opex != 0 THEN ROUND(((p_plan_opex - p_actual_opex) / ABS(p_plan_opex)) * 100, 2) ELSE NULL END),

    -- NOI
    (gen_random_uuid(), p_run_id, p_env_id, p_biz_id, p_fund_id,
     p_invest_id, p_asset_id, p_quarter,
     'NOI', v_actual_noi, v_plan_noi,
     v_actual_noi - v_plan_noi,
     CASE WHEN v_plan_noi != 0 THEN ROUND(((v_actual_noi - v_plan_noi) / ABS(v_plan_noi)) * 100, 2) ELSE NULL END)
  ON CONFLICT DO NOTHING;
END $$;


-- ── Main seed block ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_biz_id      uuid;
  v_env_id      text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_quarter     text := '2025Q4';  -- canonical "latest" quarter
  v_run_id      uuid;
  v_asset       RECORD;
BEGIN

  SELECT business_id INTO v_biz_id FROM business ORDER BY created_at LIMIT 1;
  IF v_biz_id IS NULL THEN
    RAISE NOTICE '451: no business found, skipping';
    RETURN;
  END IF;

  -- ── 1. Fix asset statuses for diversity ───────────────────────────────
  -- Meridian Medical Pavilion → lease_up (anchor tenant partially vacated)
  UPDATE repe_asset SET asset_status = 'lease_up'
  WHERE name ILIKE '%%meridian%%medical%%' AND asset_status IS DISTINCT FROM 'lease_up';

  -- Cedar Grove → held (under review due to cost overruns)
  UPDATE repe_asset SET asset_status = 'held'
  WHERE name ILIKE '%%cedar%%grove%%' AND asset_status IS DISTINCT FROM 'held';

  -- Ensure NULL-status assets default to active
  UPDATE repe_asset SET asset_status = 'active'
  WHERE asset_status IS NULL
    AND deal_id IN (
      SELECT deal_id FROM repe_deal d
      JOIN repe_fund f ON f.fund_id = d.fund_id
      WHERE f.business_id = v_biz_id
    );

  -- ── 2. Delete existing variance for the target quarter ────────────────
  -- (preserves prior quarters from 442 for trend queries)
  DELETE FROM re_asset_variance_qtr
  WHERE business_id = v_biz_id
    AND quarter = v_quarter;

  -- ── 3. Insert one re_run per fund for this quarter ────────────────────
  FOR v_asset IN
    SELECT DISTINCT d.fund_id
    FROM repe_deal d
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE f.business_id = v_biz_id
  LOOP
    v_run_id := gen_random_uuid();
    INSERT INTO re_run (id, env_id, business_id, fund_id, quarter, run_type, status, created_by)
    VALUES (v_run_id, v_env_id, v_biz_id, v_asset.fund_id, v_quarter, 'QUARTER_CLOSE', 'complete', 'seed_451')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── 4. Insert explicitly profiled variance rows ───────────────────────
  FOR v_asset IN
    SELECT
      a.asset_id, a.name, d.deal_id AS investment_id, d.fund_id,
      qs.revenue AS actual_rev, qs.opex AS actual_opex, qs.noi AS actual_noi
    FROM repe_asset a
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    LEFT JOIN re_asset_quarter_state qs ON qs.asset_id = a.asset_id AND qs.quarter = v_quarter
    WHERE f.business_id = v_biz_id
  LOOP
    -- Skip assets with no quarter state
    IF COALESCE(v_asset.actual_rev, 0) = 0 THEN
      CONTINUE;
    END IF;

    -- Resolve the run_id for this fund
    SELECT id INTO v_run_id FROM re_run
    WHERE fund_id = v_asset.fund_id AND quarter = v_quarter AND business_id = v_biz_id
    ORDER BY created_at DESC LIMIT 1;

    -- ── Per-asset variance profiles ──────────────────────────────────

    IF v_asset.name ILIKE '%%aurora%%' THEN
      -- OUTPERFORMER: +8.2% NOI. Lease-up exceeded expectations.
      -- Revenue beat plan by 6%, opex came in 3% under budget
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev / 1.06, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 1.03, 0));

    ELSIF v_asset.name ILIKE '%%foundry%%' THEN
      -- OUTPERFORMER: +6.1%. Industrial demand, near-zero vacancy.
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev / 1.05, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 1.02, 0));

    ELSIF v_asset.name ILIKE '%%gateway%%' THEN
      -- OUTPERFORMER: +5.8%. Same sector tailwind.
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev / 1.045, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 1.015, 0));

    ELSIF v_asset.name ILIKE '%%northgate%%' THEN
      -- NEAR-PLAN: +1.4%. Student housing seasonal stable.
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev / 1.01, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 0.995, 0));

    ELSIF v_asset.name ILIKE '%%heritage%%' THEN
      -- NEAR-PLAN: -1.8%. Labor cost creep offset by occupancy hold.
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev * 1.005, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 0.965, 0));

    ELSIF v_asset.name ILIKE '%%riverfront%%' THEN
      -- NEAR-PLAN: +2.3%. Multifamily stable.
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev / 1.025, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 1.005, 0));

    ELSIF v_asset.name ILIKE '%%cedar%%grove%%' THEN
      -- UNDERPERFORMER: -7.3%. Staffing cost overrun (labor market).
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev * 1.01, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 0.88, 0));

    ELSIF v_asset.name ILIKE '%%tech%%campus%%' THEN
      -- UNDERPERFORMER: -9.1%. Occupancy drag + TI spend.
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev * 1.07, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 0.96, 0));

    ELSIF v_asset.name ILIKE '%%meridian%%medical%%' THEN
      -- UNDERPERFORMER: -12.6%. Anchor tenant partial vacate.
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev * 1.10, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 0.95, 0));

    ELSE
      -- Default: slight underperformance (-2%)
      PERFORM _insert_variance_row_451(v_run_id, v_env_id, v_biz_id, v_asset.fund_id,
        v_asset.investment_id, v_asset.asset_id, v_quarter,
        v_asset.actual_rev, ROUND(v_asset.actual_rev * 1.03, 0),
        v_asset.actual_opex, ROUND(v_asset.actual_opex * 0.99, 0));

    END IF;

  END LOOP;

  RAISE NOTICE '451: Meridian realistic variance seed complete for %', v_quarter;
END $$;

-- Clean up helper function
DROP FUNCTION IF EXISTS _insert_variance_row_451(uuid, text, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric);
