-- 290: Seed 5 sector-specific assets with capacity fields and quarter state data.
-- These attach to existing investments under the first available fund.
-- Safe to re-run: uses ON CONFLICT DO NOTHING and deterministic UUIDs.

-- Deterministic UUIDs for the 5 seed assets (generated from namespace)
-- These are stable across reruns so ON CONFLICT works correctly.

DO $$
DECLARE
  v_deal_id uuid;
  v_fund_id uuid;
  v_asset_ids uuid[] := ARRAY[
    'a1b2c3d4-9001-0001-0001-000000000001'::uuid, -- Parkview Residences (multifamily)
    'a1b2c3d4-9001-0001-0002-000000000001'::uuid, -- Heritage Senior Living
    'a1b2c3d4-9001-0001-0003-000000000001'::uuid, -- Campus Edge Apartments (student)
    'a1b2c3d4-9001-0001-0004-000000000001'::uuid, -- Meridian Medical Plaza (MOB)
    'a1b2c3d4-9001-0001-0005-000000000001'::uuid  -- Gateway Distribution Center (industrial)
  ];
  v_names text[] := ARRAY[
    'Parkview Residences',
    'Heritage Senior Living',
    'Campus Edge Apartments',
    'Meridian Medical Plaza',
    'Gateway Distribution Center'
  ];
  v_property_types text[] := ARRAY[
    'multifamily',
    'senior_housing',
    'student_housing',
    'medical_office',
    'industrial'
  ];
  v_cities text[] := ARRAY['Chicago', 'Scottsdale', 'Austin', 'Atlanta', 'Dallas'];
  v_states text[] := ARRAY['IL', 'AZ', 'TX', 'GA', 'TX'];
  v_msas text[] := ARRAY[
    'Chicago-Naperville-Elgin',
    'Phoenix-Mesa-Chandler',
    'Austin-Round Rock-Georgetown',
    'Atlanta-Sandy Springs-Alpharetta',
    'Dallas-Fort Worth-Arlington'
  ];
  v_units int[] := ARRAY[280, NULL, NULL, NULL, NULL];
  v_sq_ft numeric[] := ARRAY[NULL, 68000, 195000, 85000, 380000];
  i int;
BEGIN
  -- Find first deal to attach to
  SELECT d.deal_id, d.fund_id INTO v_deal_id, v_fund_id
  FROM repe_deal d
  ORDER BY d.created_at ASC
  LIMIT 1;

  IF v_deal_id IS NULL THEN
    RAISE NOTICE 'No deals found — skipping sector seed data';
    RETURN;
  END IF;

  FOR i IN 1..5 LOOP
    -- Insert asset
    INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, asset_status)
    VALUES (v_asset_ids[i], v_deal_id, 'property', v_names[i], 'active')
    ON CONFLICT (asset_id) DO NOTHING;

    -- Insert property details
    INSERT INTO repe_property_asset (
      asset_id, property_type, units, market, city, state, msa,
      square_feet, year_built, current_noi, occupancy
    )
    VALUES (
      v_asset_ids[i],
      v_property_types[i],
      v_units[i],
      v_msas[i],
      v_cities[i],
      v_states[i],
      v_msas[i],
      v_sq_ft[i],
      2000 + (i * 4),
      (500000 + i * 200000)::numeric,
      0.90 + (i * 0.01)
    )
    ON CONFLICT (asset_id) DO UPDATE SET
      property_type = EXCLUDED.property_type,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      msa = EXCLUDED.msa;
  END LOOP;

  -- === Sector-specific capacity fields ===

  -- Multifamily: Parkview Residences
  UPDATE repe_property_asset SET
    avg_rent_per_unit = 1850,
    unit_mix_json = '{"studio": 40, "1br": 120, "2br": 100, "3br": 20}'::jsonb
  WHERE asset_id = v_asset_ids[1];

  -- Senior Housing: Heritage Senior Living
  UPDATE repe_property_asset SET
    beds = 120,
    licensed_beds = 120,
    care_mix_json = '{"independent_living": 50, "assisted_living": 45, "memory_care": 25}'::jsonb,
    revenue_per_occupied_bed = 7500
  WHERE asset_id = v_asset_ids[2];

  -- Student Housing: Campus Edge Apartments
  UPDATE repe_property_asset SET
    beds_student = 450,
    preleased_pct = 0.94,
    university_name = 'University of Texas at Austin'
  WHERE asset_id = v_asset_ids[3];

  -- MOB: Meridian Medical Plaza
  UPDATE repe_property_asset SET
    leasable_sf = 85000,
    leased_sf = 78000,
    walt_years = 6.2,
    anchor_tenant = 'Piedmont Healthcare',
    health_system_affiliation = 'Piedmont Healthcare System'
  WHERE asset_id = v_asset_ids[4];

  -- Industrial: Gateway Distribution Center
  UPDATE repe_property_asset SET
    warehouse_sf = 340000,
    office_sf = 40000,
    clear_height_ft = 36,
    dock_doors = 42,
    rail_served = true
  WHERE asset_id = v_asset_ids[5];

  -- === Quarter state data (4 quarters: 2025Q2 through 2026Q1) ===
  -- Each asset gets NOI, revenue, opex, occupancy, value, debt

  INSERT INTO re_asset_quarter_state (
    asset_id, quarter, scenario_id,
    noi, revenue, opex, occupancy,
    asset_value, nav, debt_balance, debt_service,
    valuation_method, run_id, created_at
  )
  SELECT
    a.asset_id,
    q.quarter,
    NULL,  -- base scenario
    a.base_noi * q.growth_factor,
    a.base_noi * q.growth_factor * 1.6,  -- revenue ~ 1.6x NOI (60% margin)
    a.base_noi * q.growth_factor * 0.6,  -- opex ~ 0.6x NOI
    a.base_occ + (q.occ_delta),
    a.base_noi * q.growth_factor / a.cap_rate,  -- value = annualized NOI / cap
    a.base_noi * q.growth_factor / a.cap_rate - a.debt,  -- nav = value - debt
    a.debt,
    a.debt * 0.015,  -- quarterly debt service ~ 6% annual / 4
    a.val_method,
    gen_random_uuid(),
    NOW() - (4 - q.idx) * INTERVAL '90 days'
  FROM (
    VALUES
      (v_asset_ids[1], 700000::numeric, 0.93::numeric, 0.050::numeric, 22000000::numeric, 'cap_rate'::text),
      (v_asset_ids[2], 900000::numeric, 0.88::numeric, 0.065::numeric, 18000000::numeric, 'blended'::text),
      (v_asset_ids[3], 500000::numeric, 0.94::numeric, 0.050::numeric, 15000000::numeric, 'cap_rate'::text),
      (v_asset_ids[4], 850000::numeric, 0.92::numeric, 0.060::numeric, 20000000::numeric, 'blended'::text),
      (v_asset_ids[5], 1200000::numeric, 0.96::numeric, 0.045::numeric, 30000000::numeric, 'dcf'::text)
  ) AS a(asset_id, base_noi, base_occ, cap_rate, debt, val_method)
  CROSS JOIN (
    VALUES
      ('2025Q2', 1, 0.98::numeric, 0.00::numeric),
      ('2025Q3', 2, 1.00::numeric, 0.005::numeric),
      ('2025Q4', 3, 1.01::numeric, 0.01::numeric),
      ('2026Q1', 4, 1.02::numeric, 0.015::numeric)
  ) AS q(quarter, idx, growth_factor, occ_delta)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seeded 5 sector assets with 4 quarters of data each under deal %', v_deal_id;
END $$;
