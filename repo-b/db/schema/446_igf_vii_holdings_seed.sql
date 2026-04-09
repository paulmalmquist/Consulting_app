-- 446_igf_vii_holdings_seed.sql
-- Seeds realistic holdings for Institutional Growth Fund VII:
-- 3 additional deals + assets (Gateway Industrial already exists from 432).
--
-- After this seed, IGF-VII has 4 assets:
--   1. Gateway Industrial Center (Austin, Industrial) — from 432
--   2. Riverfront Residences (Nashville, Multifamily)
--   3. Tech Campus North (Denver, Office)
--   4. Heritage Senior Living (Charlotte, Senior Housing)
--
-- Depends on: 265_repe_object_model, 270_re_institutional_model, 443_re_multi_fund
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
  v_fund_igf uuid := 'a1b2c3d4-0003-0030-0001-000000000001';
  v_business_id uuid;

  -- Deal IDs (deterministic)
  v_deal_riverfront uuid := 'f0000000-4460-0001-0001-000000000001';
  v_deal_techcampus uuid := 'f0000000-4460-0001-0002-000000000001';
  v_deal_heritage   uuid := 'f0000000-4460-0001-0003-000000000001';

  -- Asset IDs
  v_asset_riverfront uuid := 'f0000000-4460-0002-0001-000000000001';
  v_asset_techcampus uuid := 'f0000000-4460-0002-0002-000000000001';
  v_asset_heritage   uuid := 'f0000000-4460-0002-0003-000000000001';

  -- Quarters to seed
  v_quarters text[] := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2'];
  q text;
  qi int;

BEGIN
  SELECT business_id INTO v_business_id
  FROM repe_fund WHERE fund_id = v_fund_igf;

  IF v_business_id IS NULL THEN
    RAISE NOTICE '446: IGF-VII fund not found, skipping';
    RETURN;
  END IF;

  -- Guard: skip if repe_deal doesn't have the expected columns yet
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'repe_deal' AND column_name = 'committed_equity'
  ) THEN
    RAISE NOTICE '446: repe_deal.committed_equity not present, skipping seed';
    RETURN;
  END IF;

  -- ════════════════════════════════════════════════════════════════════
  -- 1. DEALS (investments)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO repe_deal (deal_id, fund_id, name, status, committed_equity, invested_equity, deal_type, acquisition_date, created_at)
  VALUES
    (v_deal_riverfront, v_fund_igf, 'Riverfront Residences Acquisition', 'closed', 28000000, 26500000, 'acquisition', '2024-06-15', now()),
    (v_deal_techcampus, v_fund_igf, 'Tech Campus North Acquisition',    'closed', 35000000, 33000000, 'acquisition', '2024-03-20', now()),
    (v_deal_heritage,   v_fund_igf, 'Heritage Senior Living Acquisition','closed', 18000000, 17200000, 'acquisition', '2024-09-10', now())
  ON CONFLICT (deal_id) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 2. ASSETS (properties)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO repe_asset (asset_id, deal_id, name, status, created_at)
  VALUES
    (v_asset_riverfront, v_deal_riverfront, 'Riverfront Residences',    'active', now()),
    (v_asset_techcampus, v_deal_techcampus, 'Tech Campus North',        'active', now()),
    (v_asset_heritage,   v_deal_heritage,   'Heritage Senior Living',   'active', now())
  ON CONFLICT (asset_id) DO NOTHING;

  INSERT INTO repe_property_asset (asset_id, property_type, address, city, state, units, sf, occupancy)
  VALUES
    (v_asset_riverfront, 'multifamily', '200 Riverfront Ave',     'Nashville',  'TN', 280, NULL,   0.94),
    (v_asset_techcampus, 'office',      '5500 Innovation Blvd',   'Denver',     'CO', NULL, 185000, 0.87),
    (v_asset_heritage,   'senior_housing','1200 Heritage Way',     'Charlotte',  'NC', 120, NULL,   0.91)
  ON CONFLICT (asset_id) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 3. QUARTERLY STATE (6 quarters per asset)
  -- ════════════════════════════════════════════════════════════════════
  qi := 0;
  FOREACH q IN ARRAY v_quarters LOOP
    -- Riverfront Residences: Multifamily, strong NOI growth
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, noi, revenue, opex, capex, debt_service,
      occupancy, debt_balance, cash_balance, asset_value, nav, ltv, dscr,
      valuation_method, value_source
    ) VALUES (
      v_asset_riverfront, q,
      1850000 + qi * 35000,    -- NOI growing ~$35K/q
      2650000 + qi * 40000,    -- Revenue
      800000 + qi * 5000,      -- OpEx (slow growth)
      120000,                   -- CapEx flat
      680000,                   -- Debt service
      0.94 + qi * 0.003,       -- Occupancy improving
      19600000 - qi * 200000,  -- Debt amortizing slowly
      2800000 + qi * 180000,   -- Cash building
      37000000 + qi * 500000,  -- Asset value appreciating
      17400000 + qi * 700000,  -- NAV growing
      0.53 - qi * 0.01,        -- LTV improving
      2.72 + qi * 0.05,        -- DSCR improving
      'cap_rate', 'seed'
    ) ON CONFLICT DO NOTHING;

    -- Tech Campus North: Office, stable but lower occupancy
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, noi, revenue, opex, capex, debt_service,
      occupancy, debt_balance, cash_balance, asset_value, nav, ltv, dscr,
      valuation_method, value_source
    ) VALUES (
      v_asset_techcampus, q,
      2200000 + qi * 20000,    -- NOI modest growth
      3400000 + qi * 25000,    -- Revenue
      1200000 + qi * 5000,     -- OpEx
      180000 + qi * 10000,     -- CapEx (TI spend)
      920000,                   -- Debt service
      0.87 + qi * 0.005,       -- Occupancy improving slowly
      24500000 - qi * 150000,  -- Debt
      1900000 + qi * 120000,   -- Cash
      44000000 + qi * 300000,  -- Asset value
      19500000 + qi * 450000,  -- NAV
      0.56 - qi * 0.008,       -- LTV
      2.39 + qi * 0.03,        -- DSCR
      'cap_rate', 'seed'
    ) ON CONFLICT DO NOTHING;

    -- Heritage Senior Living: Stable occupancy, predictable cash flows
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, noi, revenue, opex, capex, debt_service,
      occupancy, debt_balance, cash_balance, asset_value, nav, ltv, dscr,
      valuation_method, value_source
    ) VALUES (
      v_asset_heritage, q,
      980000 + qi * 15000,     -- NOI steady growth
      1520000 + qi * 20000,    -- Revenue
      540000 + qi * 5000,      -- OpEx
      65000,                    -- CapEx low
      420000,                   -- Debt service
      0.91 + qi * 0.002,       -- Occupancy stable
      11800000 - qi * 100000,  -- Debt
      1400000 + qi * 95000,    -- Cash
      19600000 + qi * 200000,  -- Asset value
      7800000 + qi * 300000,   -- NAV
      0.60 - qi * 0.01,        -- LTV
      2.33 + qi * 0.04,        -- DSCR
      'cap_rate', 'seed'
    ) ON CONFLICT DO NOTHING;

    qi := qi + 1;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════
  -- 4. DEBT (loans per asset)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO re_loan (env_id, business_id, fund_id, asset_id, loan_name, upb, rate_type, rate, maturity, amort_type)
  SELECT
    eb.env_id::text, v_business_id, v_fund_igf, vals.asset_id, vals.loan_name,
    vals.upb, vals.rate_type, vals.rate, vals.maturity, vals.amort_type
  FROM (VALUES
    (v_asset_riverfront, 'Riverfront Senior Loan',  19600000, 'fixed',    0.0495, '2029-06-15'::date, 'interest_only'),
    (v_asset_techcampus, 'Tech Campus Senior Loan', 24500000, 'floating', 0.0575, '2028-03-20'::date, 'amortizing'),
    (v_asset_heritage,   'Heritage Senior Loan',    11800000, 'fixed',    0.0525, '2029-09-10'::date, 'interest_only')
  ) AS vals(asset_id, loan_name, upb, rate_type, rate, maturity, amort_type)
  CROSS JOIN app.env_business_bindings eb
  WHERE eb.business_id = v_business_id
  AND NOT EXISTS (
    SELECT 1 FROM re_loan l WHERE l.asset_id = vals.asset_id AND l.loan_name = vals.loan_name
  );

  RAISE NOTICE '446: Seeded IGF-VII holdings: 3 deals, 3 assets, 18 quarter-states, 3 loans';
END $$;
