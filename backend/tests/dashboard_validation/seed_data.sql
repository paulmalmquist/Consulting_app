-- Dashboard Validation Seed Data
-- Extends existing Meridian Capital environment with fund-level and investment-level
-- quarterly state data for comprehensive dashboard validation testing.
--
-- Prerequisites: 290_re_sector_seed_data.sql (creates 5 assets + quarter states)
-- Safe to re-run: uses ON CONFLICT DO NOTHING and deterministic UUIDs.
--
-- Adds:
--   - 1 additional fund (Meridian Value Fund III)
--   - 5 deals/investments
--   - 8 quarters of re_fund_quarter_state
--   - 8 quarters of re_investment_quarter_state
--   - Budget baselines in uw_noi_budget_monthly
--   - Variance data in re_asset_variance_qtr

DO $$
DECLARE
  v_env_id uuid := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_bus_id uuid := 'a1b2c3d4-0001-0001-0001-000000000001';
  v_fund1_id uuid := 'a1b2c3d4-0003-0030-0001-000000000001';  -- existing IGF-VII
  v_fund2_id uuid := 'a1b2c3d4-0003-0030-0002-000000000001';  -- new: Meridian Value III
  v_deal_ids uuid[] := ARRAY[
    'a1b2c3d4-8001-0001-0001-000000000001'::uuid,  -- Cascade Multifamily
    'a1b2c3d4-8001-0001-0002-000000000001'::uuid,  -- Cherry Creek Apartments
    'a1b2c3d4-8001-0001-0003-000000000001'::uuid,  -- Summit Office Tower
    'a1b2c3d4-8001-0001-0004-000000000001'::uuid,  -- Harbor Industrial
    'a1b2c3d4-8001-0001-0005-000000000001'::uuid   -- Pinnacle Medical
  ];
  v_deal_names text[] := ARRAY[
    'Cascade Multifamily Portfolio',
    'Cherry Creek Apartments',
    'Summit Office Tower',
    'Harbor Industrial Complex',
    'Pinnacle Medical Campus'
  ];
  i int;
BEGIN

  -- === Fund 2: Meridian Value Fund III ===
  INSERT INTO repe_fund (fund_id, business_id, name, vintage_year, fund_type, strategy, target_size, status)
  VALUES (v_fund2_id, v_bus_id, 'Meridian Value Fund III', 2023, 'closed_end', 'equity', 250000000, 'active')
  ON CONFLICT (fund_id) DO NOTHING;

  -- === Deals/Investments ===
  FOR i IN 1..5 LOOP
    INSERT INTO repe_deal (deal_id, fund_id, name, deal_type, stage, committed_capital, invested_capital)
    VALUES (
      v_deal_ids[i],
      CASE WHEN i <= 3 THEN v_fund1_id ELSE v_fund2_id END,
      v_deal_names[i],
      'acquisition',
      CASE WHEN i <= 4 THEN 'closed' ELSE 'due_diligence' END,
      (20000000 + i * 5000000)::numeric,
      (18000000 + i * 4000000)::numeric
    )
    ON CONFLICT (deal_id) DO NOTHING;
  END LOOP;

  -- === Fund Quarter State (8 quarters: 2025Q1–2026Q4) ===
  INSERT INTO re_fund_quarter_state (
    id, fund_id, quarter, scenario_id,
    portfolio_nav, total_committed, total_called, total_distributed,
    dpi, rvpi, tvpi, gross_irr, net_irr,
    weighted_ltv, weighted_dscr,
    created_at
  )
  SELECT
    gen_random_uuid(),
    f.fund_id,
    q.quarter,
    NULL,
    f.base_nav * q.nav_factor,
    f.committed,
    f.committed * q.called_pct,
    f.committed * q.dist_pct,
    q.dist_pct / NULLIF(q.called_pct, 0),
    (f.base_nav * q.nav_factor) / NULLIF(f.committed * q.called_pct, 0),
    (q.dist_pct + (f.base_nav * q.nav_factor) / NULLIF(f.committed, 0)),
    f.base_irr * q.irr_factor,
    f.base_irr * q.irr_factor * 0.85,
    f.base_ltv * q.ltv_factor,
    f.base_dscr * q.dscr_factor,
    NOW() - (8 - q.idx) * INTERVAL '90 days'
  FROM (
    VALUES
      (v_fund1_id, 500000000::numeric, 400000000::numeric, 0.12::numeric, 0.55::numeric, 1.35::numeric),
      (v_fund2_id, 250000000::numeric, 180000000::numeric, 0.08::numeric, 0.62::numeric, 1.42::numeric)
  ) AS f(fund_id, base_nav, committed, base_irr, base_ltv, base_dscr)
  CROSS JOIN (
    VALUES
      ('2025Q1', 1, 0.92::numeric, 0.70::numeric, 0.15::numeric, 1.00::numeric, 1.00::numeric, 1.02::numeric),
      ('2025Q2', 2, 0.95::numeric, 0.75::numeric, 0.20::numeric, 1.02::numeric, 0.99::numeric, 1.01::numeric),
      ('2025Q3', 3, 0.98::numeric, 0.80::numeric, 0.28::numeric, 1.04::numeric, 0.98::numeric, 1.03::numeric),
      ('2025Q4', 4, 1.00::numeric, 0.85::numeric, 0.35::numeric, 1.06::numeric, 0.97::numeric, 1.02::numeric),
      ('2026Q1', 5, 1.03::numeric, 0.90::numeric, 0.42::numeric, 1.08::numeric, 0.96::numeric, 1.04::numeric),
      ('2026Q2', 6, 1.05::numeric, 0.92::numeric, 0.48::numeric, 1.10::numeric, 0.95::numeric, 1.03::numeric),
      ('2026Q3', 7, 1.07::numeric, 0.95::numeric, 0.55::numeric, 1.12::numeric, 0.94::numeric, 1.05::numeric),
      ('2026Q4', 8, 1.10::numeric, 0.98::numeric, 0.62::numeric, 1.15::numeric, 0.93::numeric, 1.06::numeric)
  ) AS q(quarter, idx, nav_factor, called_pct, dist_pct, irr_factor, ltv_factor, dscr_factor)
  ON CONFLICT DO NOTHING;

  -- === Investment Quarter State (8 quarters per deal) ===
  INSERT INTO re_investment_quarter_state (
    id, deal_id, quarter, scenario_id,
    nav, committed_capital, invested_capital,
    realized_distributions, unrealized_value,
    gross_irr, net_irr, equity_multiple,
    created_at
  )
  SELECT
    gen_random_uuid(),
    d.deal_id,
    q.quarter,
    NULL,
    d.base_nav * q.nav_factor,
    d.committed,
    d.invested,
    d.invested * q.dist_pct,
    d.base_nav * q.nav_factor,
    d.base_irr * q.irr_factor,
    d.base_irr * q.irr_factor * 0.85,
    (d.invested * q.dist_pct + d.base_nav * q.nav_factor) / NULLIF(d.invested, 0),
    NOW() - (8 - q.idx) * INTERVAL '90 days'
  FROM (
    VALUES
      (v_deal_ids[1], 45000000::numeric, 25000000::numeric, 22000000::numeric, 0.14::numeric),
      (v_deal_ids[2], 38000000::numeric, 30000000::numeric, 26000000::numeric, 0.11::numeric),
      (v_deal_ids[3], 55000000::numeric, 35000000::numeric, 30000000::numeric, 0.16::numeric),
      (v_deal_ids[4], 62000000::numeric, 40000000::numeric, 36000000::numeric, 0.09::numeric),
      (v_deal_ids[5], 28000000::numeric, 45000000::numeric, 10000000::numeric, 0.06::numeric)
  ) AS d(deal_id, base_nav, committed, invested, base_irr)
  CROSS JOIN (
    VALUES
      ('2025Q1', 1, 0.92::numeric, 0.10::numeric, 0.95::numeric),
      ('2025Q2', 2, 0.95::numeric, 0.15::numeric, 0.98::numeric),
      ('2025Q3', 3, 0.98::numeric, 0.22::numeric, 1.00::numeric),
      ('2025Q4', 4, 1.00::numeric, 0.28::numeric, 1.02::numeric),
      ('2026Q1', 5, 1.03::numeric, 0.35::numeric, 1.05::numeric),
      ('2026Q2', 6, 1.05::numeric, 0.42::numeric, 1.08::numeric),
      ('2026Q3', 7, 1.07::numeric, 0.50::numeric, 1.10::numeric),
      ('2026Q4', 8, 1.10::numeric, 0.58::numeric, 1.12::numeric)
  ) AS q(quarter, idx, nav_factor, dist_pct, irr_factor)
  ON CONFLICT DO NOTHING;

  -- === Asset Variance Data (4 quarters × 5 assets) ===
  INSERT INTO re_asset_variance_qtr (
    id, env_id, asset_id, quarter, line_code,
    actual_amount, plan_amount, variance_amount, variance_pct,
    created_at
  )
  SELECT
    gen_random_uuid(),
    v_env_id,
    a.asset_id,
    q.quarter,
    'NOI',
    a.base_noi * q.actual_factor,
    a.base_noi * q.plan_factor,
    a.base_noi * (q.actual_factor - q.plan_factor),
    CASE WHEN q.plan_factor = 0 THEN 0
         ELSE (q.actual_factor - q.plan_factor) / q.plan_factor END,
    NOW()
  FROM (
    VALUES
      ('a1b2c3d4-9001-0001-0001-000000000001'::uuid, 700000::numeric),
      ('a1b2c3d4-9001-0001-0002-000000000001'::uuid, 900000::numeric),
      ('a1b2c3d4-9001-0001-0003-000000000001'::uuid, 500000::numeric),
      ('a1b2c3d4-9001-0001-0004-000000000001'::uuid, 850000::numeric),
      ('a1b2c3d4-9001-0001-0005-000000000001'::uuid, 1200000::numeric)
  ) AS a(asset_id, base_noi)
  CROSS JOIN (
    VALUES
      ('2025Q2', 0.98::numeric, 1.00::numeric),
      ('2025Q3', 1.02::numeric, 1.00::numeric),
      ('2025Q4', 0.95::numeric, 1.00::numeric),
      ('2026Q1', 1.05::numeric, 1.03::numeric)
  ) AS q(quarter, actual_factor, plan_factor)
  ON CONFLICT DO NOTHING;

  -- === Monthly Budget Baselines (12 months × 5 assets) ===
  INSERT INTO uw_noi_budget_monthly (
    id, env_id, asset_id, period_month, line_code, amount,
    version_id, created_at
  )
  SELECT
    gen_random_uuid(),
    v_env_id,
    a.asset_id,
    m.period_month,
    'NOI',
    a.monthly_noi * m.seasonal_factor,
    NULL,
    NOW()
  FROM (
    VALUES
      ('a1b2c3d4-9001-0001-0001-000000000001'::uuid, 233333::numeric),
      ('a1b2c3d4-9001-0001-0002-000000000001'::uuid, 300000::numeric),
      ('a1b2c3d4-9001-0001-0003-000000000001'::uuid, 166667::numeric),
      ('a1b2c3d4-9001-0001-0004-000000000001'::uuid, 283333::numeric),
      ('a1b2c3d4-9001-0001-0005-000000000001'::uuid, 400000::numeric)
  ) AS a(asset_id, monthly_noi)
  CROSS JOIN (
    VALUES
      ('2025-07-01'::date, 0.95::numeric),
      ('2025-08-01'::date, 0.97::numeric),
      ('2025-09-01'::date, 1.00::numeric),
      ('2025-10-01'::date, 1.02::numeric),
      ('2025-11-01'::date, 1.01::numeric),
      ('2025-12-01'::date, 0.98::numeric),
      ('2026-01-01'::date, 0.96::numeric),
      ('2026-02-01'::date, 0.99::numeric),
      ('2026-03-01'::date, 1.03::numeric),
      ('2026-04-01'::date, 1.04::numeric),
      ('2026-05-01'::date, 1.02::numeric),
      ('2026-06-01'::date, 1.00::numeric)
  ) AS m(period_month, seasonal_factor)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Dashboard validation seed data loaded successfully';
END $$;
