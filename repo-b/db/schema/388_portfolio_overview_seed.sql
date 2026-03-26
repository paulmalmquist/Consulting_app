-- 388_portfolio_overview_seed.sql
-- Seed lat/lon for existing property assets, add pipeline deals/assets,
-- and seed 24 months of capital activity for portfolio overview visuals.
--
-- Depends on: 378_scenario_v2_seed.sql, 387_property_asset_location.sql,
--             358_re_partner_capital_seed.sql, 270_re_institutional_model.sql
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout.

DO $$
DECLARE
  v_biz_id uuid;
  v_fund_va uuid := 'a0000001-0000-0000-0000-000000000001';
  v_fund_cp uuid := 'a0000001-0000-0000-0000-000000000002';
  v_fund_op uuid := 'a0000001-0000-0000-0000-000000000003';
  v_partner_gp uuid := 'e0a10000-0001-0001-0001-000000000001';
  v_deal_va uuid := 'b0000001-0000-0000-0000-000000000001';
  v_deal_cp uuid := 'b0000001-0000-0000-0000-000000000002';
  v_deal_op uuid := 'b0000001-0000-0000-0000-000000000003';
  -- Pipeline deals
  v_deal_pipe_1 uuid := 'b0000002-0000-0000-0000-000000000001';
  v_deal_pipe_2 uuid := 'b0000002-0000-0000-0000-000000000002';
  v_deal_pipe_3 uuid := 'b0000002-0000-0000-0000-000000000003';
  i int;
  v_month date;
  v_quarter text;
  v_call_amt numeric;
  v_contrib_amt numeric;
  v_dist_amt numeric;
BEGIN

-- Resolve business_id from existing fund
SELECT business_id INTO v_biz_id FROM repe_fund WHERE fund_id = v_fund_va;
IF v_biz_id IS NULL THEN
  RAISE NOTICE '388: Scenario seed funds not found, skipping';
  RETURN;
END IF;

-- ═══════════════════════════════════════════════════════════════════════
-- I. BACKFILL LAT/LON ON EXISTING PROPERTY ASSETS
-- ═══════════════════════════════════════════════════════════════════════

-- Value-Add assets
UPDATE repe_property_asset SET latitude = 32.7767, longitude = -96.7970
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000001' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 30.2672, longitude = -97.7431
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000002' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 29.7604, longitude = -95.3698
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000003' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 29.4241, longitude = -98.4936
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000004' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 39.7392, longitude = -104.9903
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000005' AND latitude IS NULL;

-- Core-Plus assets
UPDATE repe_property_asset SET latitude = 41.8781, longitude = -87.6298
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000006' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 25.7617, longitude = -80.1918
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000007' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 33.7490, longitude = -84.3880
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000008' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 33.4484, longitude = -112.0740
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000009' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 28.5383, longitude = -81.3792
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000010' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 36.1627, longitude = -86.7816
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000011' AND latitude IS NULL;

-- Opportunistic assets
UPDATE repe_property_asset SET latitude = 35.2271, longitude = -80.8431
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000012' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 35.7796, longitude = -78.6382
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000013' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 27.9506, longitude = -82.4572
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000014' AND latitude IS NULL;
UPDATE repe_property_asset SET latitude = 30.3322, longitude = -81.6557
  WHERE asset_id = 'c0000001-0000-0000-0000-000000000015' AND latitude IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- II. ADD PIPELINE DEALS AND ASSETS
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO repe_deal (deal_id, fund_id, name, deal_type, stage, sponsor, committed_capital, invested_capital)
VALUES
  (v_deal_pipe_1, v_fund_va, 'Atlas VA Pipeline Alpha', 'equity', 'underwriting', 'Atlas GP', 45000000, 0),
  (v_deal_pipe_2, v_fund_cp, 'Meridian CP Pipeline Beta', 'equity', 'ic', 'Meridian GP', 60000000, 0),
  (v_deal_pipe_3, v_fund_op, 'Summit OP Pipeline Gamma', 'equity', 'sourcing', 'Summit GP', 30000000, 0)
ON CONFLICT DO NOTHING;

-- Pipeline assets (8 across distinct markets)
INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis, asset_status)
VALUES
  ('c0000002-0000-0000-0000-000000000001', v_deal_pipe_1, 'property', 'Greenway Plaza MF',       NULL, 38000000, 'pipeline'),
  ('c0000002-0000-0000-0000-000000000002', v_deal_pipe_1, 'property', 'Eastside Logistics Park',  NULL, 22000000, 'pipeline'),
  ('c0000002-0000-0000-0000-000000000003', v_deal_pipe_2, 'property', 'Pacific Heights Office',   NULL, 72000000, 'pipeline'),
  ('c0000002-0000-0000-0000-000000000004', v_deal_pipe_2, 'property', 'Pearl District Mixed-Use', NULL, 48000000, 'pipeline'),
  ('c0000002-0000-0000-0000-000000000005', v_deal_pipe_2, 'property', 'Uptown Tower Office',      NULL, 55000000, 'pipeline'),
  ('c0000002-0000-0000-0000-000000000006', v_deal_pipe_3, 'property', 'Desert Ridge Senior',      NULL, 20000000, 'pipeline'),
  ('c0000002-0000-0000-0000-000000000007', v_deal_pipe_3, 'property', 'Cascades Industrial',      NULL, 16000000, 'pipeline'),
  ('c0000002-0000-0000-0000-000000000008', v_deal_pipe_1, 'property', 'Brooklyn Heights Retail',  NULL, 35000000, 'pipeline')
ON CONFLICT DO NOTHING;

INSERT INTO repe_property_asset (asset_id, property_type, units, market, current_noi, occupancy, city, state, latitude, longitude)
VALUES
  ('c0000002-0000-0000-0000-000000000001', 'multifamily', 280, 'Seattle',        0, 0, 'Seattle',        'WA', 47.6062, -122.3321),
  ('c0000002-0000-0000-0000-000000000002', 'industrial',  0,   'Portland',       0, 0, 'Portland',       'OR', 45.5152, -122.6784),
  ('c0000002-0000-0000-0000-000000000003', 'office',      0,   'San Francisco',  0, 0, 'San Francisco',  'CA', 37.7749, -122.4194),
  ('c0000002-0000-0000-0000-000000000004', 'mixed_use',   0,   'Portland',       0, 0, 'Portland',       'OR', 45.5231, -122.6765),
  ('c0000002-0000-0000-0000-000000000005', 'office',      0,   'Minneapolis',    0, 0, 'Minneapolis',    'MN', 44.9778, -93.2650),
  ('c0000002-0000-0000-0000-000000000006', 'senior_housing', 90, 'Scottsdale',   0, 0, 'Scottsdale',     'AZ', 33.4942, -111.9261),
  ('c0000002-0000-0000-0000-000000000007', 'industrial',  0,   'Salt Lake City', 0, 0, 'Salt Lake City', 'UT', 40.7608, -111.8910),
  ('c0000002-0000-0000-0000-000000000008', 'retail',      0,   'New York',       0, 0, 'Brooklyn',       'NY', 40.6892, -73.9857)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- III. SEED 24 MONTHS OF CAPITAL ACTIVITY (re_capital_ledger_entry)
-- ═══════════════════════════════════════════════════════════════════════

-- Ensure GP partner exists for capital ledger (may already exist from 358)
INSERT INTO re_partner (partner_id, business_id, name, partner_type)
VALUES (v_partner_gp, v_biz_id, 'Meridian Capital Management GP', 'gp')
ON CONFLICT DO NOTHING;

-- Ensure commitments exist for the 3 scenario funds
INSERT INTO re_partner_commitment (partner_id, fund_id, committed_amount, commitment_date, status)
VALUES
  (v_partner_gp, v_fund_va, 500000000, '2023-01-01', 'active'),
  (v_partner_gp, v_fund_cp, 800000000, '2022-01-01', 'active'),
  (v_partner_gp, v_fund_op, 300000000, '2024-01-01', 'active')
ON CONFLICT DO NOTHING;

-- Generate monthly capital activity: contributions, calls (as commitments flowing in), distributions
-- Pattern: VA and CP funds have been investing since 2024, OP fund since late 2024
-- Contributions heavy early, distributions ramp up later.

FOR i IN 0..23 LOOP
  v_month := '2024-04-01'::date + (i || ' months')::interval;
  v_quarter := EXTRACT(YEAR FROM v_month)::text || 'Q' || CEIL(EXTRACT(MONTH FROM v_month) / 3.0)::int::text;

  -- Atlas Value-Add Fund IV: steady contributions early, distributions growing
  v_contrib_amt := CASE
    WHEN i < 6  THEN 12000000 + (random() * 4000000)::numeric(12,2)
    WHEN i < 12 THEN 8000000  + (random() * 3000000)::numeric(12,2)
    WHEN i < 18 THEN 4000000  + (random() * 2000000)::numeric(12,2)
    ELSE             2000000  + (random() * 1000000)::numeric(12,2)
  END;
  v_dist_amt := CASE
    WHEN i < 6  THEN 500000   + (random() * 500000)::numeric(12,2)
    WHEN i < 12 THEN 2000000  + (random() * 1500000)::numeric(12,2)
    WHEN i < 18 THEN 4000000  + (random() * 2000000)::numeric(12,2)
    ELSE             6000000  + (random() * 3000000)::numeric(12,2)
  END;

  INSERT INTO re_capital_ledger_entry (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
  VALUES
    (v_fund_va, v_partner_gp, 'contribution', v_contrib_amt, v_contrib_amt, v_month, v_quarter, 'Capital call - VA Fund', 'generated'),
    (v_fund_va, v_partner_gp, 'distribution', v_dist_amt, v_dist_amt, v_month + interval '15 days', v_quarter, 'Operating distribution - VA Fund', 'generated')
  ON CONFLICT DO NOTHING;

  -- Meridian Core-Plus Income: larger contributions, steady distributions (income fund)
  v_contrib_amt := CASE
    WHEN i < 4  THEN 20000000 + (random() * 5000000)::numeric(12,2)
    WHEN i < 10 THEN 12000000 + (random() * 4000000)::numeric(12,2)
    WHEN i < 16 THEN 6000000  + (random() * 3000000)::numeric(12,2)
    ELSE             3000000  + (random() * 2000000)::numeric(12,2)
  END;
  v_dist_amt := CASE
    WHEN i < 4  THEN 1500000  + (random() * 800000)::numeric(12,2)
    WHEN i < 10 THEN 3500000  + (random() * 1500000)::numeric(12,2)
    WHEN i < 16 THEN 5000000  + (random() * 2000000)::numeric(12,2)
    ELSE             7000000  + (random() * 3000000)::numeric(12,2)
  END;

  INSERT INTO re_capital_ledger_entry (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
  VALUES
    (v_fund_cp, v_partner_gp, 'contribution', v_contrib_amt, v_contrib_amt, v_month + interval '2 days', v_quarter, 'Capital call - CP Fund', 'generated'),
    (v_fund_cp, v_partner_gp, 'distribution', v_dist_amt, v_dist_amt, v_month + interval '18 days', v_quarter, 'Income distribution - CP Fund', 'generated')
  ON CONFLICT DO NOTHING;

  -- Summit Opportunistic III: started later, high contribution ramp, minimal early distributions
  IF i >= 4 THEN
    v_contrib_amt := CASE
      WHEN i < 10 THEN 10000000 + (random() * 3000000)::numeric(12,2)
      WHEN i < 16 THEN 6000000  + (random() * 2000000)::numeric(12,2)
      ELSE             3000000  + (random() * 1000000)::numeric(12,2)
    END;
    v_dist_amt := CASE
      WHEN i < 12 THEN 300000   + (random() * 300000)::numeric(12,2)
      WHEN i < 18 THEN 1500000  + (random() * 1000000)::numeric(12,2)
      ELSE             3000000  + (random() * 2000000)::numeric(12,2)
    END;

    INSERT INTO re_capital_ledger_entry (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
    VALUES
      (v_fund_op, v_partner_gp, 'contribution', v_contrib_amt, v_contrib_amt, v_month + interval '5 days', v_quarter, 'Capital call - OP Fund', 'generated'),
      (v_fund_op, v_partner_gp, 'distribution', v_dist_amt, v_dist_amt, v_month + interval '20 days', v_quarter, 'Distribution - OP Fund', 'generated')
    ON CONFLICT DO NOTHING;
  END IF;

END LOOP;

RAISE NOTICE '388: Portfolio overview seed complete — lat/lon, pipeline assets, 24mo capital activity';
END $$;
