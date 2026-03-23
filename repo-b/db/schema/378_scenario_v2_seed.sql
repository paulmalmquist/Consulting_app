-- 378_scenario_v2_seed.sql
-- Seed data for scenario v2 engine: 3 funds, 15 assets, debt, schedules,
-- a pre-built model with Base + Upside + Downside scenarios.
-- Uses ON CONFLICT DO NOTHING for idempotent re-runs.

DO $$
DECLARE
  v_biz_id uuid;
  v_fund_va uuid;   -- Value-Add fund
  v_fund_cp uuid;   -- Core-Plus fund
  v_fund_op uuid;   -- Opportunistic fund
  v_deal_va uuid;
  v_deal_cp uuid;
  v_deal_op uuid;
  v_assets  uuid[] := ARRAY[]::uuid[];
  v_a       uuid;
  v_model   uuid;
  v_base_sc uuid;
  v_up_sc   uuid;
  v_dn_sc   uuid;
  v_q       date;
  v_i       int;
BEGIN

-- Find a business_id to attach to (use the first one available)
SELECT business_id INTO v_biz_id FROM business LIMIT 1;
IF v_biz_id IS NULL THEN
  RAISE NOTICE 'No business found, skipping scenario seed';
  RETURN;
END IF;

-- ── 1. Funds ───────────────────────────────────────────────────────────────

INSERT INTO repe_fund (fund_id, business_id, name, vintage_year, fund_type, strategy, sub_strategy, target_size, term_years, status)
VALUES
  ('a0000001-0000-0000-0000-000000000001', v_biz_id, 'Atlas Value-Add Fund IV', 2023, 'closed_end', 'equity', 'value_add', 500000000, 7, 'investing'),
  ('a0000001-0000-0000-0000-000000000002', v_biz_id, 'Meridian Core-Plus Income', 2022, 'open_end', 'equity', 'core_plus', 800000000, 10, 'investing'),
  ('a0000001-0000-0000-0000-000000000003', v_biz_id, 'Summit Opportunistic III', 2024, 'closed_end', 'equity', 'opportunistic', 300000000, 5, 'investing')
ON CONFLICT DO NOTHING;

v_fund_va := 'a0000001-0000-0000-0000-000000000001';
v_fund_cp := 'a0000001-0000-0000-0000-000000000002';
v_fund_op := 'a0000001-0000-0000-0000-000000000003';

-- ── 2. Deals ───────────────────────────────────────────────────────────────

INSERT INTO repe_deal (deal_id, fund_id, name, deal_type, stage, sponsor, committed_capital, invested_capital)
VALUES
  ('b0000001-0000-0000-0000-000000000001', v_fund_va, 'Atlas VA Deal Pool', 'equity', 'operating', 'Atlas GP', 150000000, 120000000),
  ('b0000001-0000-0000-0000-000000000002', v_fund_cp, 'Meridian CP Deal Pool', 'equity', 'operating', 'Meridian GP', 300000000, 280000000),
  ('b0000001-0000-0000-0000-000000000003', v_fund_op, 'Summit OP Deal Pool', 'equity', 'operating', 'Summit GP', 100000000, 75000000)
ON CONFLICT DO NOTHING;

v_deal_va := 'b0000001-0000-0000-0000-000000000001';
v_deal_cp := 'b0000001-0000-0000-0000-000000000002';
v_deal_op := 'b0000001-0000-0000-0000-000000000003';

-- ── 3. Assets (15 across 5 sectors) ────────────────────────────────────────

-- Value-Add: 5 assets (multifamily + industrial)
INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis, asset_status)
VALUES
  ('c0000001-0000-0000-0000-000000000001', v_deal_va, 'property', 'Parkview Gardens MF',    '2023-06-15', 28000000, 'active'),
  ('c0000001-0000-0000-0000-000000000002', v_deal_va, 'property', 'Lakeshore Terrace MF',   '2023-09-01', 35000000, 'active'),
  ('c0000001-0000-0000-0000-000000000003', v_deal_va, 'property', 'Metro Logistics Hub',    '2023-11-01', 22000000, 'active'),
  ('c0000001-0000-0000-0000-000000000004', v_deal_va, 'property', 'Riverside Industrial',   '2024-01-15', 18000000, 'active'),
  ('c0000001-0000-0000-0000-000000000005', v_deal_va, 'property', 'Sunset Ridge Apartments','2024-03-01', 42000000, 'active')
ON CONFLICT DO NOTHING;

-- Core-Plus: 6 assets (office + retail + multifamily)
INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis, asset_status)
VALUES
  ('c0000001-0000-0000-0000-000000000006', v_deal_cp, 'property', 'Beacon Tower Office',      '2022-03-15', 65000000, 'active'),
  ('c0000001-0000-0000-0000-000000000007', v_deal_cp, 'property', 'Harbor Square Retail',     '2022-06-01', 38000000, 'active'),
  ('c0000001-0000-0000-0000-000000000008', v_deal_cp, 'property', 'Midtown Crossing MF',      '2022-09-01', 55000000, 'active'),
  ('c0000001-0000-0000-0000-000000000009', v_deal_cp, 'property', 'Westgate Office Park',    '2023-01-15', 48000000, 'active'),
  ('c0000001-0000-0000-0000-000000000010', v_deal_cp, 'property', 'The Promenade Retail',    '2023-04-01', 32000000, 'active'),
  ('c0000001-0000-0000-0000-000000000011', v_deal_cp, 'property', 'Skyline Luxury Residences','2023-07-01', 72000000, 'active')
ON CONFLICT DO NOTHING;

-- Opportunistic: 4 assets (senior housing + industrial)
INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis, asset_status)
VALUES
  ('c0000001-0000-0000-0000-000000000012', v_deal_op, 'property', 'Heritage Senior Living',  '2024-02-01', 25000000, 'active'),
  ('c0000001-0000-0000-0000-000000000013', v_deal_op, 'property', 'Oakwood Memory Care',     '2024-04-01', 18000000, 'active'),
  ('c0000001-0000-0000-0000-000000000014', v_deal_op, 'property', 'Commerce Park Flex',      '2024-06-01', 15000000, 'active'),
  ('c0000001-0000-0000-0000-000000000015', v_deal_op, 'property', 'Gateway Distribution Ctr','2024-08-01', 20000000, 'active')
ON CONFLICT DO NOTHING;

v_assets := ARRAY[
  'c0000001-0000-0000-0000-000000000001','c0000001-0000-0000-0000-000000000002',
  'c0000001-0000-0000-0000-000000000003','c0000001-0000-0000-0000-000000000004',
  'c0000001-0000-0000-0000-000000000005','c0000001-0000-0000-0000-000000000006',
  'c0000001-0000-0000-0000-000000000007','c0000001-0000-0000-0000-000000000008',
  'c0000001-0000-0000-0000-000000000009','c0000001-0000-0000-0000-000000000010',
  'c0000001-0000-0000-0000-000000000011','c0000001-0000-0000-0000-000000000012',
  'c0000001-0000-0000-0000-000000000013','c0000001-0000-0000-0000-000000000014',
  'c0000001-0000-0000-0000-000000000015'
]::uuid[];

-- ── 4. Property details ────────────────────────────────────────────────────

INSERT INTO repe_property_asset (asset_id, property_type, units, market, current_noi, occupancy, address, city, state, msa, square_feet)
VALUES
  ('c0000001-0000-0000-0000-000000000001', 'multifamily', 220, 'Dallas', 1680000, 0.94, '1200 Parkview Dr', 'Dallas', 'TX', 'Dallas-Fort Worth', 180000),
  ('c0000001-0000-0000-0000-000000000002', 'multifamily', 310, 'Austin', 2400000, 0.96, '450 Lakeshore Blvd', 'Austin', 'TX', 'Austin', 265000),
  ('c0000001-0000-0000-0000-000000000003', 'industrial', 0, 'Houston', 1320000, 0.98, '8900 Metro Pkwy', 'Houston', 'TX', 'Houston', 150000),
  ('c0000001-0000-0000-0000-000000000004', 'industrial', 0, 'San Antonio', 1080000, 0.95, '200 Riverside Way', 'San Antonio', 'TX', 'San Antonio', 120000),
  ('c0000001-0000-0000-0000-000000000005', 'multifamily', 380, 'Denver', 3200000, 0.93, '777 Sunset Ridge Rd', 'Denver', 'CO', 'Denver', 340000),
  ('c0000001-0000-0000-0000-000000000006', 'office', 0, 'Chicago', 4800000, 0.88, '100 Beacon St', 'Chicago', 'IL', 'Chicago', 420000),
  ('c0000001-0000-0000-0000-000000000007', 'retail', 0, 'Miami', 2800000, 0.92, '55 Harbor Sq', 'Miami', 'FL', 'Miami', 180000),
  ('c0000001-0000-0000-0000-000000000008', 'multifamily', 450, 'Atlanta', 4200000, 0.95, '300 Midtown Crossing', 'Atlanta', 'GA', 'Atlanta', 400000),
  ('c0000001-0000-0000-0000-000000000009', 'office', 0, 'Phoenix', 3600000, 0.85, '1000 Westgate Blvd', 'Phoenix', 'AZ', 'Phoenix', 350000),
  ('c0000001-0000-0000-0000-000000000010', 'retail', 0, 'Orlando', 2400000, 0.91, '600 Promenade Way', 'Orlando', 'FL', 'Orlando', 160000),
  ('c0000001-0000-0000-0000-000000000011', 'multifamily', 520, 'Nashville', 5400000, 0.97, '1500 Skyline Dr', 'Nashville', 'TN', 'Nashville', 480000),
  ('c0000001-0000-0000-0000-000000000012', 'senior_housing', 120, 'Charlotte', 1800000, 0.90, '200 Heritage Ln', 'Charlotte', 'NC', 'Charlotte', 95000),
  ('c0000001-0000-0000-0000-000000000013', 'senior_housing', 80, 'Raleigh', 1200000, 0.88, '50 Oakwood Ct', 'Raleigh', 'NC', 'Raleigh', 65000),
  ('c0000001-0000-0000-0000-000000000014', 'industrial', 0, 'Tampa', 960000, 0.97, '400 Commerce Park Dr', 'Tampa', 'FL', 'Tampa', 110000),
  ('c0000001-0000-0000-0000-000000000015', 'industrial', 0, 'Jacksonville', 1440000, 0.99, '800 Gateway Blvd', 'Jacksonville', 'FL', 'Jacksonville', 200000)
ON CONFLICT DO NOTHING;

-- ── 5. Debt (re_loan) ──────────────────────────────────────────────────────

-- Get env_id from first env_business_bindings
DECLARE v_env_id text;
BEGIN
  SELECT env_id INTO v_env_id FROM env_business_bindings WHERE business_id = v_biz_id LIMIT 1;
  IF v_env_id IS NULL THEN v_env_id := 'default'; END IF;

  INSERT INTO re_loan (env_id, business_id, fund_id, investment_id, asset_id, loan_name, upb, rate_type, rate, spread, maturity, amort_type)
  VALUES
    (v_env_id, v_biz_id, v_fund_va, v_deal_va, v_assets[1],  'Parkview Sr Loan',    18200000, 'floating', 0.0525, 0.0225, '2028-06-15', 'interest_only'),
    (v_env_id, v_biz_id, v_fund_va, v_deal_va, v_assets[2],  'Lakeshore Sr Loan',   24500000, 'floating', 0.0500, 0.0200, '2028-09-01', 'interest_only'),
    (v_env_id, v_biz_id, v_fund_va, v_deal_va, v_assets[3],  'Metro Logistics Loan', 14300000, 'fixed',   0.0475, NULL,   '2029-11-01', 'amortizing'),
    (v_env_id, v_biz_id, v_fund_va, v_deal_va, v_assets[4],  'Riverside Loan',       11700000, 'fixed',   0.0450, NULL,   '2029-01-15', 'amortizing'),
    (v_env_id, v_biz_id, v_fund_va, v_deal_va, v_assets[5],  'Sunset Ridge Loan',    29400000, 'floating', 0.0550, 0.0250, '2029-03-01', 'interest_only'),
    (v_env_id, v_biz_id, v_fund_cp, v_deal_cp, v_assets[6],  'Beacon Tower Loan',    42250000, 'fixed',   0.0425, NULL,   '2029-03-15', 'amortizing'),
    (v_env_id, v_biz_id, v_fund_cp, v_deal_cp, v_assets[7],  'Harbor Square Loan',   24700000, 'fixed',   0.0400, NULL,   '2028-06-01', 'amortizing'),
    (v_env_id, v_biz_id, v_fund_cp, v_deal_cp, v_assets[8],  'Midtown Crossing Loan',38500000, 'floating', 0.0475, 0.0200, '2029-09-01', 'interest_only'),
    (v_env_id, v_biz_id, v_fund_cp, v_deal_cp, v_assets[9],  'Westgate Loan',        31200000, 'fixed',   0.0450, NULL,   '2030-01-15', 'amortizing'),
    (v_env_id, v_biz_id, v_fund_cp, v_deal_cp, v_assets[10], 'Promenade Loan',       20800000, 'fixed',   0.0425, NULL,   '2028-04-01', 'amortizing'),
    (v_env_id, v_biz_id, v_fund_cp, v_deal_cp, v_assets[11], 'Skyline Loan',         50400000, 'floating', 0.0500, 0.0225, '2030-07-01', 'interest_only'),
    (v_env_id, v_biz_id, v_fund_op, v_deal_op, v_assets[12], 'Heritage Sr Loan',     16250000, 'floating', 0.0600, 0.0300, '2027-02-01', 'interest_only'),
    (v_env_id, v_biz_id, v_fund_op, v_deal_op, v_assets[13], 'Oakwood Loan',         11700000, 'floating', 0.0625, 0.0325, '2027-04-01', 'interest_only'),
    (v_env_id, v_biz_id, v_fund_op, v_deal_op, v_assets[14], 'Commerce Park Loan',    9750000, 'fixed',   0.0550, NULL,   '2028-06-01', 'amortizing'),
    (v_env_id, v_biz_id, v_fund_op, v_deal_op, v_assets[15], 'Gateway Dist Loan',    13000000, 'fixed',   0.0500, NULL,   '2028-08-01', 'amortizing')
  ON CONFLICT DO NOTHING;
END;

-- ── 6. Revenue / Expense / Amort Schedules (12 quarters: Q1 2024 – Q4 2026) ─

FOR v_i IN 1..15 LOOP
  v_a := v_assets[v_i];

  -- Base quarterly revenue ranges by asset size
  DECLARE
    v_base_rev numeric;
    v_base_exp numeric;
    v_base_amort numeric;
    v_rev_growth numeric;
    v_exp_growth numeric;
  BEGIN
    -- Set base values proportional to cost basis
    v_base_rev := CASE
      WHEN v_i <= 5  THEN 300000 + (v_i * 80000)   -- VA: $380K-$700K/q
      WHEN v_i <= 11 THEN 500000 + ((v_i-5) * 150000)  -- CP: $650K-$1.4M/q
      ELSE 200000 + ((v_i-11) * 60000)  -- OP: $260K-$440K/q
    END;
    v_base_exp := v_base_rev * 0.42;  -- ~42% expense ratio
    v_base_amort := v_base_rev * 0.06;  -- ~6% amortization
    v_rev_growth := 0.02 + (random() * 0.02);   -- 2-4% annual growth
    v_exp_growth := 0.025 + (random() * 0.015);  -- 2.5-4% annual expense growth

    FOR v_q_idx IN 0..11 LOOP
      v_q := ('2024-01-01'::date + (v_q_idx * interval '3 months'))::date;

      INSERT INTO asset_revenue_schedule (asset_id, period_date, revenue)
      VALUES (v_a, v_q, ROUND(v_base_rev * POWER(1 + v_rev_growth/4, v_q_idx), 2))
      ON CONFLICT (asset_id, period_date) DO NOTHING;

      INSERT INTO asset_expense_schedule (asset_id, period_date, expense)
      VALUES (v_a, v_q, ROUND(v_base_exp * POWER(1 + v_exp_growth/4, v_q_idx), 2))
      ON CONFLICT (asset_id, period_date) DO NOTHING;

      INSERT INTO asset_amort_schedule (asset_id, period_date, amort_amount)
      VALUES (v_a, v_q, ROUND(v_base_amort * POWER(1.01/4, v_q_idx), 2))
      ON CONFLICT (asset_id, period_date) DO NOTHING;
    END LOOP;
  END;
END LOOP;

-- ── 7. Model + Scenarios ───────────────────────────────────────────────────

-- Find env_id
DECLARE v_env text;
BEGIN
  SELECT env_id INTO v_env FROM env_business_bindings WHERE business_id = v_biz_id LIMIT 1;
  IF v_env IS NULL THEN v_env := 'default'; END IF;

  INSERT INTO re_model (model_id, env_id, name, description, status, created_by)
  VALUES ('d0000001-0000-0000-0000-000000000001', v_env,
          'Cross-Fund Scenario Analysis', 'Full portfolio 3-fund scenario model', 'draft', 'seed')
  ON CONFLICT DO NOTHING;

  v_model := 'd0000001-0000-0000-0000-000000000001';

  -- Base scenario
  INSERT INTO re_model_scenarios (id, model_id, name, description, is_base)
  VALUES ('e0000001-0000-0000-0000-000000000001', v_model, 'Base Case', 'Current assumptions, no changes', true)
  ON CONFLICT DO NOTHING;
  v_base_sc := 'e0000001-0000-0000-0000-000000000001';

  -- Upside scenario
  INSERT INTO re_model_scenarios (id, model_id, name, description, is_base)
  VALUES ('e0000001-0000-0000-0000-000000000002', v_model, 'Upside', 'Strong rent growth, low vacancy', false)
  ON CONFLICT DO NOTHING;
  v_up_sc := 'e0000001-0000-0000-0000-000000000002';

  -- Downside scenario
  INSERT INTO re_model_scenarios (id, model_id, name, description, is_base)
  VALUES ('e0000001-0000-0000-0000-000000000003', v_model, 'Downside', 'Rising rates, higher vacancy', false)
  ON CONFLICT DO NOTHING;
  v_dn_sc := 'e0000001-0000-0000-0000-000000000003';

  -- Add all 15 assets to all 3 scenarios
  FOR v_i IN 1..15 LOOP
    v_a := v_assets[v_i];

    DECLARE v_fund uuid;
    BEGIN
      v_fund := CASE
        WHEN v_i <= 5  THEN v_fund_va
        WHEN v_i <= 11 THEN v_fund_cp
        ELSE v_fund_op
      END;

      INSERT INTO re_model_scenario_assets (scenario_id, asset_id, source_fund_id)
      VALUES (v_base_sc, v_a, v_fund)
      ON CONFLICT DO NOTHING;

      INSERT INTO re_model_scenario_assets (scenario_id, asset_id, source_fund_id)
      VALUES (v_up_sc, v_a, v_fund)
      ON CONFLICT DO NOTHING;

      INSERT INTO re_model_scenario_assets (scenario_id, asset_id, source_fund_id)
      VALUES (v_dn_sc, v_a, v_fund)
      ON CONFLICT DO NOTHING;
    END;
  END LOOP;

  -- Upside overrides: higher rent growth, lower vacancy, lower exit cap
  FOR v_i IN 1..15 LOOP
    v_a := v_assets[v_i];
    INSERT INTO re_scenario_overrides (scenario_id, scope_type, scope_id, key, value_json)
    VALUES
      (v_up_sc, 'asset', v_a, 'rent_growth_pct', '4.5'),
      (v_up_sc, 'asset', v_a, 'vacancy_pct', '3.0'),
      (v_up_sc, 'asset', v_a, 'exit_cap_rate_pct', '5.0'),
      (v_up_sc, 'asset', v_a, 'expense_delta_pct', '-2.0')
    ON CONFLICT (scenario_id, scope_type, scope_id, key) DO NOTHING;
  END LOOP;

  -- Downside overrides: lower rent growth, higher vacancy, higher exit cap, rate stress
  FOR v_i IN 1..15 LOOP
    v_a := v_assets[v_i];
    INSERT INTO re_scenario_overrides (scenario_id, scope_type, scope_id, key, value_json)
    VALUES
      (v_dn_sc, 'asset', v_a, 'rent_growth_pct', '0.5'),
      (v_dn_sc, 'asset', v_a, 'vacancy_pct', '10.0'),
      (v_dn_sc, 'asset', v_a, 'exit_cap_rate_pct', '7.0'),
      (v_dn_sc, 'asset', v_a, 'expense_delta_pct', '5.0'),
      (v_dn_sc, 'asset', v_a, 'interest_rate_pct', '7.0')
    ON CONFLICT (scenario_id, scope_type, scope_id, key) DO NOTHING;
  END LOOP;
END;

RAISE NOTICE 'Scenario v2 seed complete: 3 funds, 15 assets, 3 scenarios';

END $$;
