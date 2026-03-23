-- 301_re_pipeline_seed.sql
-- Seed 10 pipeline deals across US metros with properties, tranches, contacts, activities.
-- Safe to re-run: deterministic UUIDs + ON CONFLICT DO NOTHING.

DO $$
DECLARE
  v_env_id uuid;
  v_fund_id uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
BEGIN
  SELECT eb.env_id INTO v_env_id
  FROM repe_fund f
  JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
  WHERE f.fund_id = v_fund_id
  LIMIT 1;

  IF v_env_id IS NULL THEN
    RAISE NOTICE 'Pipeline seed: demo fund not found, skipping';
    RETURN;
  END IF;

  -- ── Deal 1: Cherry Creek Apartments (Denver, sourced) ─────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0001-000000000001', v_env_id,
    'Cherry Creek Apartments', 'sourced', 'CBRE', 'value_add', 'multifamily',
    '2026-06-30', 42500000, 18.5, 2.1, 'Class B+ garden-style, 1985 vintage, strong rent comps', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000001',
    'Cherry Creek Apartments', '2100 S Colorado Blvd', 'Denver', 'CO', '80222',
    39.6789, -104.9408, 'multifamily', 248, 215000, 1985, 0.93, 2890000, 0.068
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000001',
    'Equity A', 'equity', '2026-06-30', 15000000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000001',
    'Mark Chen', 'mchen@cbre.com', '303-555-1234', 'CBRE', 'Broker'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000001',
    'note', 'Initial OM reviewed. Strong submarket fundamentals.', 'seed', now() - interval '5 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 2: Lakewood Office Park (Dallas, screening) ──────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0002-000000000001', v_env_id,
    'Lakewood Office Park', 'screening', 'JLL', 'core_plus', 'office',
    '2026-09-30', 78000000, 14.0, 1.85, 'Suburban office campus, 78% leased, anchor tenant 5yr remaining', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0002-000000000001', 'b1b2c3d4-0001-0001-0002-000000000001',
    'Lakewood Office - Bldg A', '4500 Greenville Ave', 'Dallas', 'TX', '75206',
    32.8355, -96.7701, 'office', NULL, 185000, 2001, 0.78, 4200000, 0.054
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0003-000000000001', 'b1b2c3d4-0001-0001-0002-000000000001',
    'Lakewood Office - Bldg B', '4520 Greenville Ave', 'Dallas', 'TX', '75206',
    32.8360, -96.7698, 'office', NULL, 120000, 2003, 0.82, 2800000, 0.056
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES
    ('b1b2c3d4-0001-0003-0002-000000000001', 'b1b2c3d4-0001-0001-0002-000000000001',
     'Senior Debt', 'senior_debt', '2026-09-15', 52000000, NULL, 'open'),
    ('b1b2c3d4-0001-0003-0003-000000000001', 'b1b2c3d4-0001-0001-0002-000000000001',
     'Equity', 'equity', '2026-09-30', 26000000, NULL, 'open')
  ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0002-000000000001', 'b1b2c3d4-0001-0001-0002-000000000001',
    'Sarah Williams', 'swilliams@jll.com', '214-555-5678', 'JLL', 'Director'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 3: Desert Ridge Retail (Phoenix, loi) ────────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0003-000000000001', v_env_id,
    'Desert Ridge Retail Center', 'loi', 'Cushman & Wakefield', 'value_add', 'retail',
    '2026-08-15', 35000000, 16.0, 1.95, 'Power center with grocery anchor. LOI submitted at $33.5M.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0004-000000000001', 'b1b2c3d4-0001-0001-0003-000000000001',
    'Desert Ridge Retail Center', '21001 N Tatum Blvd', 'Phoenix', 'AZ', '85050',
    33.6675, -111.9734, 'retail', NULL, 145000, 2004, 0.88, 2450000, 0.070
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0004-000000000001', 'b1b2c3d4-0001-0001-0003-000000000001',
    'Equity', 'equity', '2026-08-15', 12000000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES
    ('b1b2c3d4-0001-0005-0002-000000000001', 'b1b2c3d4-0001-0001-0003-000000000001',
     'status_change', 'Moved to LOI stage after IC pre-screening', 'seed', now() - interval '3 days'),
    ('b1b2c3d4-0001-0005-0003-000000000001', 'b1b2c3d4-0001-0001-0003-000000000001',
     'email', 'LOI submitted to seller at $33.5M, 60-day DD period', 'seed', now() - interval '1 day')
  ON CONFLICT DO NOTHING;

  -- ── Deal 4: Riverwalk Industrial (Tampa, dd) ──────────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0004-000000000001', v_env_id,
    'Riverwalk Industrial Portfolio', 'dd', 'Off-Market', 'opportunistic', 'industrial',
    '2026-07-31', 62000000, 22.0, 2.35, '3-building last-mile distribution. Environmental Phase I complete.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES
    ('b1b2c3d4-0001-0002-0005-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'Riverwalk Bldg 1', '8200 Anderson Rd', 'Tampa', 'FL', '33634',
     28.0091, -82.5393, 'industrial', NULL, 95000, 2008, 0.95, 1800000, 0.058),
    ('b1b2c3d4-0001-0002-0006-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'Riverwalk Bldg 2', '8210 Anderson Rd', 'Tampa', 'FL', '33634',
     28.0095, -82.5390, 'industrial', NULL, 78000, 2010, 0.92, 1450000, 0.060),
    ('b1b2c3d4-0001-0002-0007-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'Riverwalk Bldg 3', '8220 Anderson Rd', 'Tampa', 'FL', '33634',
     28.0098, -82.5387, 'industrial', NULL, 65000, 2012, 1.00, 1320000, 0.055)
  ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES
    ('b1b2c3d4-0001-0003-0005-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'Senior Debt', 'senior_debt', '2026-07-15', 40000000, NULL, 'committed'),
    ('b1b2c3d4-0001-0003-0006-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'Mezz', 'mezz', '2026-07-25', 8000000, NULL, 'open'),
    ('b1b2c3d4-0001-0003-0007-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'Equity', 'equity', '2026-07-31', 14000000, NULL, 'open')
  ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES
    ('b1b2c3d4-0001-0004-0003-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'Tom Rodriguez', 'trodriguez@gmail.com', '813-555-9012', 'Private Seller', 'Owner'),
    ('b1b2c3d4-0001-0004-0004-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'Lisa Park', 'lpark@enviro-consult.com', '813-555-3456', 'Enviro Consulting', 'Phase I Lead')
  ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES
    ('b1b2c3d4-0001-0005-0004-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'meeting', 'Site tour completed. Clear-span buildings in good condition.', 'seed', now() - interval '10 days'),
    ('b1b2c3d4-0001-0005-0005-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'document', 'Phase I ESA uploaded - no RECs identified', 'seed', now() - interval '7 days'),
    ('b1b2c3d4-0001-0005-0006-000000000001', 'b1b2c3d4-0001-0001-0004-000000000001',
     'status_change', 'Entered DD after executed PSA at $62M', 'seed', now() - interval '14 days')
  ON CONFLICT DO NOTHING;

  -- ── Deal 5: Peachtree Towers (Atlanta, ic) ────────────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0005-000000000001', v_env_id,
    'Peachtree Towers Mixed-Use', 'ic', 'Eastdil Secured', 'core_plus', 'mixed_use',
    '2026-05-15', 125000000, 13.5, 1.75, 'IC memo drafted. 420-unit tower + 25K SF ground-floor retail.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0008-000000000001', 'b1b2c3d4-0001-0001-0005-000000000001',
    'Peachtree Towers', '191 Peachtree St NE', 'Atlanta', 'GA', '30303',
    33.7589, -84.3880, 'mixed_use', 420, 380000, 2018, 0.94, 7200000, 0.058
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES
    ('b1b2c3d4-0001-0003-0008-000000000001', 'b1b2c3d4-0001-0001-0005-000000000001',
     'Senior Debt', 'senior_debt', '2026-05-01', 80000000, NULL, 'committed'),
    ('b1b2c3d4-0001-0003-0009-000000000001', 'b1b2c3d4-0001-0001-0005-000000000001',
     'Pref Equity', 'pref_equity', '2026-05-10', 20000000, NULL, 'open'),
    ('b1b2c3d4-0001-0003-000a-000000000001', 'b1b2c3d4-0001-0001-0005-000000000001',
     'Common Equity', 'equity', '2026-05-15', 25000000, NULL, 'open')
  ON CONFLICT DO NOTHING;

  -- ── Deal 6: Sonoran Logistics (Phoenix, closing) ──────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0006-000000000001', v_env_id,
    'Sonoran Logistics Center', 'closing', 'Newmark', 'opportunistic', 'industrial',
    '2026-04-30', 48000000, 20.0, 2.2, 'Closing docs in review. Title clear. Lender approved.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0009-000000000001', 'b1b2c3d4-0001-0001-0006-000000000001',
    'Sonoran Logistics Center', '7200 W Buckeye Rd', 'Phoenix', 'AZ', '85043',
    33.4285, -112.1637, 'industrial', NULL, 225000, 2015, 0.97, 3150000, 0.066
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-000b-000000000001', 'b1b2c3d4-0001-0001-0006-000000000001',
    'Bridge Loan', 'bridge', '2026-04-25', 36000000, NULL, 'funded'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 7: Highland Student Living (Austin, sourced) ─────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0007-000000000001', v_env_id,
    'Highland Student Living', 'sourced', 'Marcus & Millichap', 'value_add', 'student_housing',
    '2026-08-31', 28500000, 17.5, 2.0, 'Purpose-built student housing near UT campus. 95% pre-leased for fall.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-000a-000000000001', 'b1b2c3d4-0001-0001-0007-000000000001',
    'Highland Student Living', '2401 Rio Grande St', 'Austin', 'TX', '78705',
    30.2880, -97.7480, 'student_housing', 320, 195000, 2012, 0.95, 1950000, 0.068
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 8: Westshore Medical Office (Tampa, screening) ───────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0008-000000000001', v_env_id,
    'Westshore Medical Office', 'screening', 'HFF', 'core', 'medical_office',
    '2026-10-31', 55000000, 12.0, 1.65, 'Single-tenant NNN MOB. 12yr remaining lease to HCA.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-000b-000000000001', 'b1b2c3d4-0001-0001-0008-000000000001',
    'Westshore Medical Office', '4302 W Boy Scout Blvd', 'Tampa', 'FL', '33607',
    27.9551, -82.5222, 'medical_office', NULL, 85000, 2016, 1.00, 3300000, 0.060
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 9: Buckhead Multifamily (Atlanta, dead) ──────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0009-000000000001', v_env_id,
    'Buckhead Luxury Residences', 'dead', 'CBRE', 'development', 'multifamily',
    '2026-12-31', 95000000, 25.0, 2.5, 'Pricing too aggressive. Pulled from pipeline after IC decline.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-000c-000000000001', 'b1b2c3d4-0001-0001-0009-000000000001',
    'Buckhead Luxury Residences', '3500 Lenox Rd NE', 'Atlanta', 'GA', '30326',
    33.8465, -84.3580, 'multifamily', 350, 310000, 2024, 0.45, 800000, 0.045
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0007-000000000001', 'b1b2c3d4-0001-0001-0009-000000000001',
    'status_change', 'IC declined. Pricing does not support target returns at current rates.', 'seed', now() - interval '20 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 10: Centennial Office Campus (Denver, closed) ────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by, fund_id)
  VALUES (
    'b1b2c3d4-0001-0001-000a-000000000001', v_env_id,
    'Centennial Office Campus', 'closed', 'Direct/Off-Market', 'core_plus', 'office',
    '2025-12-15', 67000000, 14.5, 1.85, 'Closed. Converted to investment.', 'seed', v_fund_id
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-000d-000000000001', 'b1b2c3d4-0001-0001-000a-000000000001',
    'Centennial Office Campus', '8000 E Arapahoe Rd', 'Centennial', 'CO', '80112',
    39.5966, -104.8920, 'office', NULL, 165000, 2007, 0.91, 4100000, 0.061
  ) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Pipeline seed: created 10 pipeline deals with properties/tranches/contacts/activities';
END;
$$;
