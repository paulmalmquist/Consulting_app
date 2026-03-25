-- 357_re_pipeline_expansion_seed.sql
-- Seed 20 additional pipeline deals (11-30) across US metros.
-- Extends 301_re_pipeline_seed.sql with diverse property types and stages.
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
    RAISE NOTICE 'Pipeline expansion seed: demo fund not found, skipping';
    RETURN;
  END IF;

  -- ── Deal 11: Riverpoint Data Center (Chicago, sourced) ──────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-000b-000000000001', v_env_id,
    'Riverpoint Data Center', 'sourced', 'CBRE', 'core_plus', 'data_center',
    '2026-10-31', 95000000, 14.0, 1.80, 'Tier III facility, 12MW critical load. Strong interconnection.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-000e-000000000001', 'b1b2c3d4-0001-0001-000b-000000000001',
    'Riverpoint Data Center', '350 E Cermak Rd', 'Chicago', 'IL', '60616',
    41.8781, -87.6298, 'data_center', NULL, 150000, 2014, 0.92, 5225000, 0.055
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-000c-000000000001', 'b1b2c3d4-0001-0001-000b-000000000001',
    'Equity', 'equity', '2026-10-31', 33250000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0005-000000000001', 'b1b2c3d4-0001-0001-000b-000000000001',
    'Derek Huang', 'dhuang@cbre.com', '312-555-2100', 'CBRE', 'Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0008-000000000001', 'b1b2c3d4-0001-0001-000b-000000000001',
    'note', 'OM received. Evaluating power redundancy and fiber connectivity.', 'seed', now() - interval '4 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 12: Palmetto Self Storage Portfolio (Charlotte, sourced) ────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-000c-000000000001', v_env_id,
    'Palmetto Self Storage Portfolio', 'sourced', 'Marcus & Millichap', 'value_add', 'self_storage',
    '2026-09-30', 18000000, 18.0, 2.10, '4-facility portfolio. Below-market rents with rate increase upside.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-000f-000000000001', 'b1b2c3d4-0001-0001-000c-000000000001',
    'Palmetto Self Storage Portfolio', '6800 South Blvd', 'Charlotte', 'NC', '28217',
    35.2271, -80.8431, 'self_storage', 320, NULL, 2006, 0.87, 1170000, 0.065
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-000d-000000000001', 'b1b2c3d4-0001-0001-000c-000000000001',
    'Equity', 'equity', '2026-09-30', 6300000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0006-000000000001', 'b1b2c3d4-0001-0001-000c-000000000001',
    'Rachel Torres', 'rtorres@marcusmillichap.com', '704-555-3400', 'Marcus & Millichap', 'Broker'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0009-000000000001', 'b1b2c3d4-0001-0001-000c-000000000001',
    'note', 'Received financials for 4 facilities. Rent roll analysis underway.', 'seed', now() - interval '2 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 13: Beacon Hill Life Science (Boston, sourced) ─────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-000d-000000000001', v_env_id,
    'Beacon Hill Life Science', 'sourced', 'JLL', 'core_plus', 'life_science',
    '2026-12-31', 180000000, 15.0, 1.90, 'Lab/office conversion near Kendall Square. Strong tenant pipeline.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0010-000000000001', 'b1b2c3d4-0001-0001-000d-000000000001',
    'Beacon Hill Life Science', '100 Binney St', 'Boston', 'MA', '02142',
    42.3601, -71.0589, 'life_science', NULL, 120000, 2010, 0.88, 10800000, 0.060
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-000e-000000000001', 'b1b2c3d4-0001-0001-000d-000000000001',
    'Equity', 'equity', '2026-12-31', 63000000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0007-000000000001', 'b1b2c3d4-0001-0001-000d-000000000001',
    'Andrew Prescott', 'aprescott@jll.com', '617-555-7800', 'JLL', 'Managing Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-000a-000000000001', 'b1b2c3d4-0001-0001-000d-000000000001',
    'note', 'Initial screening. Evaluating lab conversion costs and tenant credit.', 'seed', now() - interval '3 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 14: Lakeview Manufactured Housing (Nashville, sourced) ─────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-000e-000000000001', v_env_id,
    'Lakeview Manufactured Housing', 'sourced', 'Off-Market', 'value_add', 'manufactured_housing',
    '2026-09-15', 22000000, 19.0, 2.15, 'Community-owned MHC. Below-market lot rents. Infill location.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0011-000000000001', 'b1b2c3d4-0001-0001-000e-000000000001',
    'Lakeview Manufactured Housing', '4200 Briley Pkwy', 'Nashville', 'TN', '37217',
    36.1627, -86.7816, 'manufactured_housing', 280, NULL, 1992, 0.91, 1320000, 0.060
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-000f-000000000001', 'b1b2c3d4-0001-0001-000e-000000000001',
    'Equity', 'equity', '2026-09-15', 7700000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0008-000000000001', 'b1b2c3d4-0001-0001-000e-000000000001',
    'Jim Callahan', 'jcallahan@outlook.com', '615-555-4100', 'Private Owner', 'Seller'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-000b-000000000001', 'b1b2c3d4-0001-0001-000e-000000000001',
    'note', 'Off-market introduction via local operator contact. Requesting financials.', 'seed', now() - interval '1 day'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 15: Cascade Self Storage (Seattle, sourced) ────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-000f-000000000001', v_env_id,
    'Cascade Self Storage', 'sourced', 'Cushman & Wakefield', 'value_add', 'self_storage',
    '2026-10-15', 15000000, 17.0, 2.05, 'Climate-controlled facility. Expansion land included.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0012-000000000001', 'b1b2c3d4-0001-0001-000f-000000000001',
    'Cascade Self Storage', '1500 NW Leary Way', 'Seattle', 'WA', '98107',
    47.6062, -122.3321, 'self_storage', 450, NULL, 2009, 0.85, 975000, 0.065
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0010-000000000001', 'b1b2c3d4-0001-0001-000f-000000000001',
    'Equity', 'equity', '2026-10-15', 5250000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0009-000000000001', 'b1b2c3d4-0001-0001-000f-000000000001',
    'Megan Cho', 'mcho@cushwake.com', '206-555-6700', 'Cushman & Wakefield', 'Broker'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-000c-000000000001', 'b1b2c3d4-0001-0001-000f-000000000001',
    'note', 'OM received. Reviewing expansion entitlements and zoning.', 'seed', now() - interval '5 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 16: Mission Valley Multifamily (San Diego, screening) ──────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0010-000000000001', v_env_id,
    'Mission Valley Multifamily', 'screening', 'Eastdil Secured', 'value_add', 'multifamily',
    '2026-11-30', 68000000, 16.5, 2.00, 'Class B complex, 1998 vintage. Value-add through unit renovations.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0013-000000000001', 'b1b2c3d4-0001-0001-0010-000000000001',
    'Mission Valley Multifamily', '1600 Hotel Circle S', 'San Diego', 'CA', '92108',
    32.7749, -117.1502, 'multifamily', 280, 245000, 1998, 0.94, 3400000, 0.050
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0011-000000000001', 'b1b2c3d4-0001-0001-0010-000000000001',
    'Equity', 'equity', '2026-11-30', 23800000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-000a-000000000001', 'b1b2c3d4-0001-0001-0010-000000000001',
    'Carlos Reyes', 'creyes@eastdil.com', '858-555-1900', 'Eastdil Secured', 'Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-000d-000000000001', 'b1b2c3d4-0001-0001-0010-000000000001',
    'note', 'Screening committee review scheduled. Comp analysis in progress.', 'seed', now() - interval '6 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 17: Brickell Office Tower (Miami, screening) ───────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0011-000000000001', v_env_id,
    'Brickell Office Tower', 'screening', 'HFF', 'core_plus', 'office',
    '2026-12-31', 145000000, 13.5, 1.75, 'Class A trophy tower. 88% leased with WALT of 6.2 years.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0014-000000000001', 'b1b2c3d4-0001-0001-0011-000000000001',
    'Brickell Office Tower', '1221 Brickell Ave', 'Miami', 'FL', '33131',
    25.7617, -80.1918, 'office', NULL, 320000, 2016, 0.88, 7975000, 0.055
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0012-000000000001', 'b1b2c3d4-0001-0001-0011-000000000001',
    'Equity', 'equity', '2026-12-31', 50750000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-000b-000000000001', 'b1b2c3d4-0001-0001-0011-000000000001',
    'Victoria Mendes', 'vmendes@hff.com', '305-555-8200', 'HFF', 'Managing Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-000e-000000000001', 'b1b2c3d4-0001-0001-0011-000000000001',
    'note', 'Reviewing tenant credit profiles and lease rollover schedule.', 'seed', now() - interval '8 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 18: Triangle Research Park (Raleigh, screening) ────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0012-000000000001', v_env_id,
    'Triangle Research Park', 'screening', 'Newmark', 'value_add', 'life_science',
    '2026-11-30', 110000000, 17.5, 2.10, 'R&D campus adjacent to RTP. Wet lab conversion opportunity.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0015-000000000001', 'b1b2c3d4-0001-0001-0012-000000000001',
    'Triangle Research Park', '5000 Centregreen Way', 'Raleigh', 'NC', '27560',
    35.7796, -78.6382, 'life_science', NULL, 85000, 2005, 0.82, 6600000, 0.060
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0013-000000000001', 'b1b2c3d4-0001-0001-0012-000000000001',
    'Equity', 'equity', '2026-11-30', 38500000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-000c-000000000001', 'b1b2c3d4-0001-0001-0012-000000000001',
    'Nathan Bridges', 'nbridges@nmrk.com', '919-555-4500', 'Newmark', 'Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-000f-000000000001', 'b1b2c3d4-0001-0001-0012-000000000001',
    'note', 'Evaluating wet lab conversion costs. Tour scheduled for next week.', 'seed', now() - interval '4 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 19: Wasatch Industrial Park (Salt Lake City, screening) ────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0013-000000000001', v_env_id,
    'Wasatch Industrial Park', 'screening', 'CBRE', 'core_plus', 'industrial',
    '2026-10-31', 52000000, 15.0, 1.85, 'Distribution campus near I-15 corridor. 92% leased.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0016-000000000001', 'b1b2c3d4-0001-0001-0013-000000000001',
    'Wasatch Industrial Park', '2200 W California Ave', 'Salt Lake City', 'UT', '84104',
    40.7608, -111.8910, 'industrial', NULL, 280000, 2011, 0.92, 3120000, 0.060
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0014-000000000001', 'b1b2c3d4-0001-0001-0013-000000000001',
    'Equity', 'equity', '2026-10-31', 18200000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-000d-000000000001', 'b1b2c3d4-0001-0001-0013-000000000001',
    'Kyle Morrison', 'kmorrison@cbre.com', '801-555-3200', 'CBRE', 'Broker'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0010-000000000001', 'b1b2c3d4-0001-0001-0013-000000000001',
    'note', 'Financial package received. Analyzing tenant credit and lease terms.', 'seed', now() - interval '7 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 20: Midtown Mixed-Use Tower (Nashville, loi) ───────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0014-000000000001', v_env_id,
    'Midtown Mixed-Use Tower', 'loi', 'JLL', 'value_add', 'mixed_use',
    '2026-09-30', 88000000, 16.0, 2.00, 'LOI submitted. 350 units + 30K SF ground-floor retail. Strong walkability.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0017-000000000001', 'b1b2c3d4-0001-0001-0014-000000000001',
    'Midtown Mixed-Use Tower', '1800 Broadway', 'Nashville', 'TN', '37203',
    36.1580, -86.7830, 'mixed_use', 350, 330000, 2019, 0.93, 4840000, 0.055
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0015-000000000001', 'b1b2c3d4-0001-0001-0014-000000000001',
    'Equity', 'equity', '2026-09-30', 30800000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-000e-000000000001', 'b1b2c3d4-0001-0001-0014-000000000001',
    'Lauren Fischer', 'lfischer@jll.com', '615-555-8900', 'JLL', 'Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0011-000000000001', 'b1b2c3d4-0001-0001-0014-000000000001',
    'status_change', 'LOI submitted at $86M with 45-day DD period.', 'seed', now() - interval '2 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 21: Pacific Heights Senior Living (San Diego, loi) ─────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0015-000000000001', v_env_id,
    'Pacific Heights Senior Living', 'loi', 'Marcus & Millichap', 'value_add', 'senior_housing',
    '2026-10-31', 45000000, 18.0, 2.15, 'Assisted living + memory care. Occupancy recovery play.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0018-000000000001', 'b1b2c3d4-0001-0001-0015-000000000001',
    'Pacific Heights Senior Living', '4500 Clairemont Mesa Blvd', 'San Diego', 'CA', '92117',
    32.7500, -117.1600, 'senior_housing', 120, 95000, 2003, 0.78, 2925000, 0.065
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0016-000000000001', 'b1b2c3d4-0001-0001-0015-000000000001',
    'Equity', 'equity', '2026-10-31', 15750000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-000f-000000000001', 'b1b2c3d4-0001-0001-0015-000000000001',
    'Brian Stanton', 'bstanton@marcusmillichap.com', '858-555-2200', 'Marcus & Millichap', 'Senior Associate'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0012-000000000001', 'b1b2c3d4-0001-0001-0015-000000000001',
    'status_change', 'LOI executed. 60-day DD period begins.', 'seed', now() - interval '3 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 22: Wicker Park Retail (Chicago, loi) ──────────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0016-000000000001', v_env_id,
    'Wicker Park Retail', 'loi', 'Cushman & Wakefield', 'value_add', 'retail',
    '2026-10-15', 32000000, 17.5, 2.05, 'Mixed retail strip in high-traffic corridor. 3 vacancies to lease up.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0019-000000000001', 'b1b2c3d4-0001-0001-0016-000000000001',
    'Wicker Park Retail', '1600 N Milwaukee Ave', 'Chicago', 'IL', '60622',
    41.9088, -87.6796, 'retail', NULL, 65000, 2000, 0.85, 2240000, 0.070
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0017-000000000001', 'b1b2c3d4-0001-0001-0016-000000000001',
    'Equity', 'equity', '2026-10-15', 11200000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0010-000000000001', 'b1b2c3d4-0001-0001-0016-000000000001',
    'Amanda Kessler', 'akessler@cushwake.com', '312-555-4400', 'Cushman & Wakefield', 'Broker'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0013-000000000001', 'b1b2c3d4-0001-0001-0016-000000000001',
    'status_change', 'LOI submitted at $31M. Seller countered at $32M.', 'seed', now() - interval '5 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 23: Coral Gables Medical Campus (Miami, dd) ────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0017-000000000001', v_env_id,
    'Coral Gables Medical Campus', 'dd', 'JLL', 'core_plus', 'medical_office',
    '2026-08-31', 72000000, 14.5, 1.80, 'Multi-tenant MOB campus. Phase I ESA clean. Appraisal in progress.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-001a-000000000001', 'b1b2c3d4-0001-0001-0017-000000000001',
    'Coral Gables Medical Campus', '2801 Ponce de Leon Blvd', 'Miami', 'FL', '33134',
    25.7489, -80.2594, 'medical_office', NULL, 110000, 2012, 0.94, 4320000, 0.060
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0018-000000000001', 'b1b2c3d4-0001-0001-0017-000000000001',
    'Equity', 'equity', '2026-08-31', 25200000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0011-000000000001', 'b1b2c3d4-0001-0001-0017-000000000001',
    'Patricia Alvarez', 'palvarez@jll.com', '305-555-6100', 'JLL', 'Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0014-000000000001', 'b1b2c3d4-0001-0001-0017-000000000001',
    'document', 'Phase I ESA completed — no RECs. Appraisal ordered.', 'seed', now() - interval '6 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 24: Aurora Data Center II (Denver, dd) ─────────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0018-000000000001', v_env_id,
    'Aurora Data Center II', 'dd', 'Newmark', 'core_plus', 'data_center',
    '2026-09-15', 125000000, 14.5, 1.85, 'Tier IV facility. 20MW capacity. PPA in place for renewable energy.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-001b-000000000001', 'b1b2c3d4-0001-0001-0018-000000000001',
    'Aurora Data Center II', '15000 E 40th Ave', 'Aurora', 'CO', '80011',
    39.7294, -104.8319, 'data_center', NULL, 200000, 2018, 0.95, 6875000, 0.055
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-0019-000000000001', 'b1b2c3d4-0001-0001-0018-000000000001',
    'Equity', 'equity', '2026-09-15', 43750000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0012-000000000001', 'b1b2c3d4-0001-0001-0018-000000000001',
    'Robert Gallagher', 'rgallagher@nmrk.com', '303-555-9100', 'Newmark', 'Managing Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0015-000000000001', 'b1b2c3d4-0001-0001-0018-000000000001',
    'meeting', 'Site tour completed. Reviewed UPS and generator infrastructure.', 'seed', now() - interval '9 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 25: Ballard Self Storage (Seattle, dd) ─────────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-0019-000000000001', v_env_id,
    'Ballard Self Storage', 'dd', 'Off-Market', 'opportunistic', 'self_storage',
    '2026-08-15', 12000000, 20.0, 2.30, 'Mom-and-pop facility. Revenue management upside. DD ongoing.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-001c-000000000001', 'b1b2c3d4-0001-0001-0019-000000000001',
    'Ballard Self Storage', '5401 Leary Ave NW', 'Seattle', 'WA', '98107',
    47.6688, -122.3760, 'self_storage', 380, NULL, 2001, 0.82, 840000, 0.070
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-001a-000000000001', 'b1b2c3d4-0001-0001-0019-000000000001',
    'Equity', 'equity', '2026-08-15', 4200000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0013-000000000001', 'b1b2c3d4-0001-0001-0019-000000000001',
    'David Park', 'dpark@gmail.com', '206-555-3300', 'Private Seller', 'Owner'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0016-000000000001', 'b1b2c3d4-0001-0001-0019-000000000001',
    'document', 'Title report received. No liens or encumbrances.', 'seed', now() - interval '4 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 26: Brookhaven Student Housing (Atlanta, ic) ───────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-001a-000000000001', v_env_id,
    'Brookhaven Student Housing', 'ic', 'CBRE', 'value_add', 'student_housing',
    '2026-07-31', 38000000, 17.0, 2.05, 'IC memo submitted. Near Oglethorpe and Georgia State. 94% pre-leased.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-001d-000000000001', 'b1b2c3d4-0001-0001-001a-000000000001',
    'Brookhaven Student Housing', '4484 Peachtree Rd NE', 'Atlanta', 'GA', '30319',
    33.8651, -84.3365, 'student_housing', 450, 275000, 2014, 0.94, 2090000, 0.055
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-001b-000000000001', 'b1b2c3d4-0001-0001-001a-000000000001',
    'Equity', 'equity', '2026-07-31', 13300000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0014-000000000001', 'b1b2c3d4-0001-0001-001a-000000000001',
    'Jennifer Walsh', 'jwalsh@cbre.com', '404-555-7700', 'CBRE', 'Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0017-000000000001', 'b1b2c3d4-0001-0001-001a-000000000001',
    'status_change', 'IC memo circulated. Committee review in 5 business days.', 'seed', now() - interval '3 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 27: Bayshore Industrial Campus (Tampa, ic) ─────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-001b-000000000001', v_env_id,
    'Bayshore Industrial Campus', 'ic', 'Eastdil Secured', 'opportunistic', 'industrial',
    '2026-08-15', 85000000, 21.0, 2.40, 'IC presentation scheduled. Last-mile distribution with port access.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-001e-000000000001', 'b1b2c3d4-0001-0001-001b-000000000001',
    'Bayshore Industrial Campus', '5100 W Gandy Blvd', 'Tampa', 'FL', '33611',
    27.9506, -82.4572, 'industrial', NULL, 350000, 2009, 0.90, 5525000, 0.065
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-001c-000000000001', 'b1b2c3d4-0001-0001-001b-000000000001',
    'Equity', 'equity', '2026-08-15', 29750000, NULL, 'open'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0015-000000000001', 'b1b2c3d4-0001-0001-001b-000000000001',
    'Michael Donahue', 'mdonahue@eastdil.com', '813-555-8800', 'Eastdil Secured', 'Managing Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0018-000000000001', 'b1b2c3d4-0001-0001-001b-000000000001',
    'meeting', 'IC presentation prep meeting. Financial model finalized.', 'seed', now() - interval '2 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 28: Galleria Office Redevelopment (Dallas, closing) ────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-001c-000000000001', v_env_id,
    'Galleria Office Redevelopment', 'closing', 'HFF', 'opportunistic', 'office',
    '2026-05-31', 92000000, 22.0, 2.35, 'Closing docs in review. Redevelopment into creative office. Lender committed.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-001f-000000000001', 'b1b2c3d4-0001-0001-001c-000000000001',
    'Galleria Office Redevelopment', '13355 Noel Rd', 'Dallas', 'TX', '75240',
    32.9343, -96.8210, 'office', NULL, 240000, 2001, 0.65, 5060000, 0.055
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-001d-000000000001', 'b1b2c3d4-0001-0001-001c-000000000001',
    'Equity', 'equity', '2026-05-31', 32200000, NULL, 'committed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0016-000000000001', 'b1b2c3d4-0001-0001-001c-000000000001',
    'Steven Crawford', 'scrawford@hff.com', '214-555-5500', 'HFF', 'Director'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-0019-000000000001', 'b1b2c3d4-0001-0001-001c-000000000001',
    'status_change', 'PSA executed. Title and survey ordered. Targeting May close.', 'seed', now() - interval '8 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 29: Uptown Manufactured Housing (Charlotte, dead) ──────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by)
  VALUES (
    'b1b2c3d4-0001-0001-001d-000000000001', v_env_id,
    'Uptown Manufactured Housing', 'dead', 'Marcus & Millichap', 'value_add', 'manufactured_housing',
    '2026-11-30', 28000000, 19.0, 2.20, 'Dead — environmental concerns. Phase I identified potential RECs.', 'seed'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0020-000000000001', 'b1b2c3d4-0001-0001-001d-000000000001',
    'Uptown Manufactured Housing', '3200 N Tryon St', 'Charlotte', 'NC', '28206',
    35.2400, -80.8500, 'manufactured_housing', 200, NULL, 1988, 0.89, 1680000, 0.060
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-001e-000000000001', 'b1b2c3d4-0001-0001-001d-000000000001',
    'Equity', 'equity', '2026-11-30', 9800000, NULL, 'withdrawn'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0017-000000000001', 'b1b2c3d4-0001-0001-001d-000000000001',
    'Dana Mitchell', 'dmitchell@marcusmillichap.com', '704-555-2800', 'Marcus & Millichap', 'Broker'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-001a-000000000001', 'b1b2c3d4-0001-0001-001d-000000000001',
    'status_change', 'Deal killed. Phase I ESA identified RECs — soil contamination from adjacent dry cleaner.', 'seed', now() - interval '12 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Deal 30: SoDo Logistics Hub (Seattle, closed) ───────────────────────────
  INSERT INTO re_pipeline_deal (deal_id, env_id, deal_name, status, source, strategy, property_type,
    target_close_date, headline_price, target_irr, target_moic, notes, created_by, fund_id)
  VALUES (
    'b1b2c3d4-0001-0001-001e-000000000001', v_env_id,
    'SoDo Logistics Hub', 'closed', 'Direct/Off-Market', 'core_plus', 'industrial',
    '2026-01-31', 58000000, 15.5, 1.90, 'Closed. Converted to investment. Prime last-mile location near Port of Seattle.', 'seed', v_fund_id
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_property (property_id, deal_id, property_name, address, city, state, zip,
    lat, lon, property_type, units, sqft, year_built, occupancy, noi, asking_cap_rate)
  VALUES (
    'b1b2c3d4-0001-0002-0021-000000000001', 'b1b2c3d4-0001-0001-001e-000000000001',
    'SoDo Logistics Hub', '3800 1st Ave S', 'Seattle', 'WA', '98134',
    47.5800, -122.3300, 'industrial', NULL, 180000, 2013, 0.96, 3480000, 0.060
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_tranche (tranche_id, deal_id, tranche_name, tranche_type, close_date,
    commitment_amount, price, status)
  VALUES (
    'b1b2c3d4-0001-0003-001f-000000000001', 'b1b2c3d4-0001-0001-001e-000000000001',
    'Equity', 'equity', '2026-01-31', 20300000, NULL, 'funded'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_contact (contact_id, deal_id, name, email, phone, org, role)
  VALUES (
    'b1b2c3d4-0001-0004-0018-000000000001', 'b1b2c3d4-0001-0001-001e-000000000001',
    'Sandra Liu', 'sliu@directcap.com', '206-555-9400', 'Direct Capital', 'Principal'
  ) ON CONFLICT DO NOTHING;

  INSERT INTO re_pipeline_activity (activity_id, deal_id, activity_type, body, created_by, occurred_at)
  VALUES (
    'b1b2c3d4-0001-0005-001b-000000000001', 'b1b2c3d4-0001-0001-001e-000000000001',
    'status_change', 'Closed and funded. Asset transitioned to portfolio management.', 'seed', now() - interval '45 days'
  ) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Pipeline expansion seed: created 20 pipeline deals (11-30) with properties/tranches/contacts/activities';
END;
$$;
