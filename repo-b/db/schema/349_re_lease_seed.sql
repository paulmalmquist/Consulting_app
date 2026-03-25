-- 349: Seed Meridian Office Tower — Class A office asset with full lease layer.
-- Asset UUID: a1b2c3d4-9001-0001-0006-000000000001
-- Building: 200,000 SF gross / 148,000 SF leasable, 18 floors, Midtown Atlanta GA
-- 8 tenants, 10 spaces, 8 leases, rent steps, lease events, documents, rent roll snapshots.
-- Safe to re-run: ON CONFLICT DO NOTHING / DO UPDATE throughout.

DO $$
DECLARE
  v_business_id uuid := 'a1b2c3d4-0001-0001-0001-000000000001'::uuid;  -- Meridian Capital Mgmt
  v_fund_id     uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;  -- IGF VII
  v_asset_id    uuid := 'a1b2c3d4-9001-0001-0006-000000000001'::uuid;  -- Meridian Office Tower
  v_deal_id     uuid;

  -- Tenant UUIDs
  v_t1  uuid := 'b0010000-0001-0001-0001-000000000001'::uuid;  -- Hartley & Simmons LLP
  v_t2  uuid := 'b0010000-0001-0001-0002-000000000001'::uuid;  -- First National Bank of Georgia
  v_t3  uuid := 'b0010000-0001-0001-0003-000000000001'::uuid;  -- Apex Technology Services
  v_t4  uuid := 'b0010000-0001-0001-0004-000000000001'::uuid;  -- Southeast Medical Administrators
  v_t5  uuid := 'b0010000-0001-0001-0005-000000000001'::uuid;  -- CommonDesk
  v_t6  uuid := 'b0010000-0001-0001-0006-000000000001'::uuid;  -- Vanguard Professional Group
  v_t7  uuid := 'b0010000-0001-0001-0007-000000000001'::uuid;  -- Mercer Bowen Architecture
  v_t8  uuid := 'b0010000-0001-0001-0008-000000000001'::uuid;  -- Atlantic Shield Insurance

  -- Space UUIDs
  v_sp1  uuid := 'b0020000-0001-0001-0001-000000000001'::uuid;  -- Suite 200 (vacant)
  v_sp2  uuid := 'b0020000-0001-0001-0002-000000000001'::uuid;  -- Suite 300 (CommonDesk)
  v_sp3  uuid := 'b0020000-0001-0001-0003-000000000001'::uuid;  -- Suite 400 (SE Medical)
  v_sp4  uuid := 'b0020000-0001-0001-0004-000000000001'::uuid;  -- Suite 500 (Mercer Bowen)
  v_sp5  uuid := 'b0020000-0001-0001-0005-000000000001'::uuid;  -- Suites 600-700 (First National)
  v_sp6  uuid := 'b0020000-0001-0001-0006-000000000001'::uuid;  -- Suite 800 (Atlantic Shield)
  v_sp7  uuid := 'b0020000-0001-0001-0007-000000000001'::uuid;  -- Suite 900 (Apex Technology)
  v_sp8  uuid := 'b0020000-0001-0001-0008-000000000001'::uuid;  -- Suite 1000 (Vanguard)
  v_sp9  uuid := 'b0020000-0001-0001-0009-000000000001'::uuid;  -- Suite 1100 (vacant)
  v_sp10 uuid := 'b0020000-0001-0001-0010-000000000001'::uuid;  -- Suites 1400-1800 (Hartley)

  -- Lease UUIDs
  v_l1  uuid := 'b0030000-0001-0001-0001-000000000001'::uuid;  -- Hartley lease
  v_l2  uuid := 'b0030000-0001-0001-0002-000000000001'::uuid;  -- First National lease
  v_l3  uuid := 'b0030000-0001-0001-0003-000000000001'::uuid;  -- Apex Technology lease
  v_l4  uuid := 'b0030000-0001-0001-0004-000000000001'::uuid;  -- SE Medical lease
  v_l5  uuid := 'b0030000-0001-0001-0005-000000000001'::uuid;  -- CommonDesk lease
  v_l6  uuid := 'b0030000-0001-0001-0006-000000000001'::uuid;  -- Vanguard lease
  v_l7  uuid := 'b0030000-0001-0001-0007-000000000001'::uuid;  -- Mercer Bowen lease
  v_l8  uuid := 'b0030000-0001-0001-0008-000000000001'::uuid;  -- Atlantic Shield lease

BEGIN

  -- ── 1. Find / resolve deal under IGF VII ──────────────────────────────────
  SELECT d.deal_id INTO v_deal_id
  FROM repe_deal d
  WHERE d.fund_id = v_fund_id
  ORDER BY d.created_at ASC
  LIMIT 1;

  IF v_deal_id IS NULL THEN
    SELECT d.deal_id INTO v_deal_id
    FROM repe_deal d
    ORDER BY d.created_at ASC
    LIMIT 1;
  END IF;

  IF v_deal_id IS NULL THEN
    RAISE NOTICE '349: No deals found — skipping Meridian Office Tower seed';
    RETURN;
  END IF;

  -- ── 2. Asset ──────────────────────────────────────────────────────────────
  INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, asset_status)
  VALUES (v_asset_id, v_deal_id, 'property', 'Meridian Office Tower', 'active')
  ON CONFLICT (asset_id) DO UPDATE SET
    name         = EXCLUDED.name,
    asset_status = EXCLUDED.asset_status;

  INSERT INTO repe_property_asset (
    asset_id, property_type, market, city, state, msa,
    square_feet, year_built, current_noi, occupancy,
    address, leasable_sf, leased_sf, walt_years, anchor_tenant
  )
  VALUES (
    v_asset_id, 'office',
    'Midtown Atlanta', 'Atlanta', 'GA', 'Atlanta-Sandy Springs-Alpharetta',
    200000, 2006,
    2800000,   -- annualized NOI ($700K/quarter × 4)
    0.880,
    '1400 Peachtree Street NE, Atlanta, GA 30309',
    148000,    -- leasable RSF
    130200,    -- leased SF (sum of 8 leases: see below)
    3.3,       -- WALT in years (as of 2026Q1)
    'Hartley & Simmons LLP'
  )
  ON CONFLICT (asset_id) DO UPDATE SET
    property_type  = EXCLUDED.property_type,
    market         = EXCLUDED.market,
    city           = EXCLUDED.city,
    state          = EXCLUDED.state,
    msa            = EXCLUDED.msa,
    square_feet    = EXCLUDED.square_feet,
    current_noi    = EXCLUDED.current_noi,
    occupancy      = EXCLUDED.occupancy,
    leasable_sf    = EXCLUDED.leasable_sf,
    leased_sf      = EXCLUDED.leased_sf,
    walt_years     = EXCLUDED.walt_years,
    anchor_tenant  = EXCLUDED.anchor_tenant;

  -- ── 3. Quarter state (4 quarters: 2025Q2–2026Q1) ─────────────────────────
  -- base_noi: $700K/quarter. asset_value = annualized NOI / 6.0% cap rate.
  INSERT INTO re_asset_quarter_state (
    id, asset_id, quarter, scenario_id,
    noi, revenue, opex, occupancy,
    asset_value, nav, debt_balance, debt_service,
    valuation_method, inputs_hash, run_id, created_at
  )
  SELECT
    gen_random_uuid(),
    v_asset_id,
    q.quarter,
    NULL,
    700000 * q.growth,               -- NOI (quarterly)
    700000 * q.growth * 1.55,        -- revenue (~55% NOI margin)
    700000 * q.growth * 0.55,        -- opex
    0.880 + q.occ_delta,
    (700000 * q.growth * 4) / 0.060, -- asset value = annualized NOI / cap rate
    (700000 * q.growth * 4) / 0.060 - 24000000,
    24000000,
    24000000 * 0.015,
    'cap_rate',
    'seed:' || v_asset_id::text || ':' || q.quarter,
    gen_random_uuid(),
    NOW() - q.age
  FROM (
    VALUES
      ('2025Q2', 0.98::numeric, 0.000::numeric, INTERVAL '270 days'),
      ('2025Q3', 1.00::numeric, 0.003::numeric, INTERVAL '180 days'),
      ('2025Q4', 1.01::numeric, 0.006::numeric, INTERVAL '90 days'),
      ('2026Q1', 1.02::numeric, 0.010::numeric, INTERVAL '0 days')
  ) AS q(quarter, growth, occ_delta, age)
  ON CONFLICT DO NOTHING;

  -- ── 4. Tenants ────────────────────────────────────────────────────────────
  -- Tenant SF breakdown (total leased = 130,200 SF):
  --   Hartley & Simmons:  36,000 SF
  --   First National:     24,000 SF
  --   Apex Technology:    14,400 SF
  --   SE Medical:         10,200 SF
  --   CommonDesk:         13,200 SF
  --   Vanguard:           12,000 SF
  --   Mercer Bowen:        8,400 SF  ← below-market at $40 vs $48 market
  --   Atlantic Shield:    12,000 SF
  --   Total:             130,200 SF leased; 17,800 SF vacant (88.0% occ)

  INSERT INTO re_tenant (tenant_id, business_id, name, industry, credit_rating, is_anchor)
  VALUES
    (v_t1, v_business_id, 'Hartley & Simmons LLP',           'legal',                 'A-',   true),
    (v_t2, v_business_id, 'First National Bank of Georgia',   'banking',               'A',    false),
    (v_t3, v_business_id, 'Apex Technology Services',         'technology',            'BBB+', false),
    (v_t4, v_business_id, 'Southeast Medical Administrators', 'healthcare',            'BBB',  false),
    (v_t5, v_business_id, 'CommonDesk',                       'coworking',             'BB',   false),
    (v_t6, v_business_id, 'Vanguard Professional Group',      'professional_services', 'BBB+', false),
    (v_t7, v_business_id, 'Mercer Bowen Architecture',        'architecture',          'BBB-', false),
    (v_t8, v_business_id, 'Atlantic Shield Insurance',        'insurance',             'A-',   false)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- ── 5. Spaces ─────────────────────────────────────────────────────────────
  INSERT INTO re_asset_space (space_id, asset_id, suite_number, floor, rentable_sf, space_type, status)
  VALUES
    (v_sp1,  v_asset_id, 'Suite 200',       2,  9400,  'office', 'vacant'),
    (v_sp2,  v_asset_id, 'Suite 300',       3,  13200, 'office', 'leased'),
    (v_sp3,  v_asset_id, 'Suite 400',       4,  10200, 'office', 'leased'),
    (v_sp4,  v_asset_id, 'Suite 500',       5,  8400,  'office', 'leased'),
    (v_sp5,  v_asset_id, 'Suites 600–700',  6,  24000, 'office', 'leased'),
    (v_sp6,  v_asset_id, 'Suite 800',       8,  12000, 'office', 'leased'),
    (v_sp7,  v_asset_id, 'Suite 900',       9,  14400, 'office', 'leased'),
    (v_sp8,  v_asset_id, 'Suite 1000',      10, 12000, 'office', 'leased'),
    (v_sp9,  v_asset_id, 'Suite 1100',      11, 8400,  'office', 'vacant'),
    (v_sp10, v_asset_id, 'Suites 1400–1800',14, 36000, 'office', 'leased')
  ON CONFLICT (space_id) DO NOTHING;
  -- Total spaces:   148,000 SF (9,400 + 13,200 + 10,200 + 8,400 + 24,000 + 12,000 + 14,400 + 12,000 + 8,400 + 36,000)
  -- Vacant:          17,800 SF (Suite 200 + Suite 1100)
  -- Leased:         130,200 SF

  -- ── 6. Leases ─────────────────────────────────────────────────────────────
  INSERT INTO re_lease (
    lease_id, asset_id, space_id, tenant_id,
    lease_type, status,
    commencement_date, expiration_date,
    base_rent_psf, rentable_sf,
    free_rent_months, ti_allowance_psf,
    renewal_options, expansion_option, termination_option,
    notes
  )
  VALUES
    -- Hartley & Simmons LLP: anchor, full-service, 2021–2031, 2×5yr renewal options
    (v_l1, v_asset_id, v_sp10, v_t1,
     'full_service', 'active',
     '2021-01-01', '2031-12-31',
     46.50, 36000,
     6, 75.00,
     '2 x 5-year options at FMV', false, false,
     'Anchor tenant — floors 14-18'),

    -- First National Bank of Georgia: full-service, 2020–2027, 1×5yr
    (v_l2, v_asset_id, v_sp5, v_t2,
     'full_service', 'active',
     '2020-06-01', '2027-05-31',
     42.00, 24000,
     3, 60.00,
     '1 x 5-year option at FMV', false, false,
     'Near-term expiry — lease watch 2026'),

    -- Apex Technology Services: NNN, 2022–2029, expansion option
    (v_l3, v_asset_id, v_sp7, v_t3,
     'nnn', 'active',
     '2022-03-01', '2029-02-28',
     44.00, 14400,
     0, 55.00,
     NULL, true, false,
     'Expansion option — Suite 1100 preferred'),

    -- Southeast Medical Administrators: full-service, 2023–2028
    (v_l4, v_asset_id, v_sp3, v_t4,
     'full_service', 'active',
     '2023-07-01', '2028-06-30',
     43.50, 10200,
     0, 45.00,
     NULL, false, false,
     NULL),

    -- CommonDesk: modified gross, 2024–2026 ← near-term rollover
    (v_l5, v_asset_id, v_sp2, v_t5,
     'modified_gross', 'active',
     '2024-01-01', '2026-12-31',
     38.00, 13200,
     2, 25.00,
     NULL, false, false,
     'Near-term expiry Dec 2026 — renewal probability uncertain'),

    -- Vanguard Professional Group: full-service, 2022–2030, 1×5yr
    (v_l6, v_asset_id, v_sp8, v_t6,
     'full_service', 'active',
     '2022-09-01', '2030-08-31',
     45.00, 12000,
     0, 60.00,
     '1 x 5-year option at FMV', false, false,
     NULL),

    -- Mercer Bowen Architecture: full-service, 2023–2028 ← below-market ($40 vs $48 market)
    (v_l7, v_asset_id, v_sp4, v_t7,
     'full_service', 'active',
     '2023-01-01', '2028-12-31',
     40.00, 8400,
     0, 40.00,
     NULL, false, false,
     'Below market — $8 PSF upside at lease renewal'),

    -- Atlantic Shield Insurance: NNN, 2021–2029, 1×3yr
    (v_l8, v_asset_id, v_sp6, v_t8,
     'nnn', 'active',
     '2021-06-01', '2029-05-31',
     46.00, 12000,
     0, 65.00,
     '1 x 3-year option at FMV', false, false,
     NULL)
  ON CONFLICT (lease_id) DO NOTHING;

  -- ── 7. Lease steps (annual rent escalations) ──────────────────────────────

  -- Hartley & Simmons: 3% annual steps (v_l1)
  -- Base: $46.50 PSF from 2021-01-01
  -- Steps at years 3, 5, 7, 9 (every 2 years for simplicity)
  INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
  VALUES
    (gen_random_uuid(), v_l1, '2021-01-01', '2022-12-31', 46.50, 36000*46.50/12, 'fixed', NULL),
    (gen_random_uuid(), v_l1, '2023-01-01', '2024-12-31', 47.95, 36000*47.95/12, 'percentage', 3.00),
    (gen_random_uuid(), v_l1, '2025-01-01', '2026-12-31', 49.43, 36000*49.43/12, 'percentage', 3.00),
    (gen_random_uuid(), v_l1, '2027-01-01', '2028-12-31', 50.91, 36000*50.91/12, 'percentage', 3.00),
    (gen_random_uuid(), v_l1, '2029-01-01', '2031-12-31', 52.44, 36000*52.44/12, 'percentage', 3.00)
  ON CONFLICT DO NOTHING;

  -- First National Bank: 3% step at midterm (v_l2)
  INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
  VALUES
    (gen_random_uuid(), v_l2, '2020-06-01', '2023-05-31', 42.00, 24000*42.00/12, 'fixed', NULL),
    (gen_random_uuid(), v_l2, '2023-06-01', '2027-05-31', 43.26, 24000*43.26/12, 'percentage', 3.00)
  ON CONFLICT DO NOTHING;

  -- Apex Technology: 2.5% step at midterm (v_l3)
  INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
  VALUES
    (gen_random_uuid(), v_l3, '2022-03-01', '2025-08-31', 44.00, 14400*44.00/12, 'fixed', NULL),
    (gen_random_uuid(), v_l3, '2025-09-01', '2029-02-28', 45.10, 14400*45.10/12, 'percentage', 2.50)
  ON CONFLICT DO NOTHING;

  -- Southeast Medical: 2.5% step at midterm (v_l4)
  INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
  VALUES
    (gen_random_uuid(), v_l4, '2023-07-01', '2025-12-31', 43.50, 10200*43.50/12, 'fixed', NULL),
    (gen_random_uuid(), v_l4, '2026-01-01', '2028-06-30', 44.59, 10200*44.59/12, 'percentage', 2.50)
  ON CONFLICT DO NOTHING;

  -- CommonDesk: flat (no step) (v_l5)
  INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
  VALUES
    (gen_random_uuid(), v_l5, '2024-01-01', '2026-12-31', 38.00, 13200*38.00/12, 'fixed', NULL)
  ON CONFLICT DO NOTHING;

  -- Vanguard: 2.5% step at midterm (v_l6)
  INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
  VALUES
    (gen_random_uuid(), v_l6, '2022-09-01', '2026-08-31', 45.00, 12000*45.00/12, 'fixed', NULL),
    (gen_random_uuid(), v_l6, '2026-09-01', '2030-08-31', 46.13, 12000*46.13/12, 'percentage', 2.50)
  ON CONFLICT DO NOTHING;

  -- Mercer Bowen: flat (below-market, no escalation negotiated) (v_l7)
  INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
  VALUES
    (gen_random_uuid(), v_l7, '2023-01-01', '2028-12-31', 40.00, 8400*40.00/12, 'fixed', NULL)
  ON CONFLICT DO NOTHING;

  -- Atlantic Shield: 2.5% step at midterm (v_l8)
  INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
  VALUES
    (gen_random_uuid(), v_l8, '2021-06-01', '2025-05-31', 46.00, 12000*46.00/12, 'fixed', NULL),
    (gen_random_uuid(), v_l8, '2025-06-01', '2029-05-31', 47.15, 12000*47.15/12, 'percentage', 2.50)
  ON CONFLICT DO NOTHING;

  -- ── 8. Lease charges (sample CAM for NNN leases) ─────────────────────────
  INSERT INTO re_lease_charge (charge_id, lease_id, charge_type, amount_psf, recoverable)
  VALUES
    (gen_random_uuid(), v_l3, 'cam',       8.50,  true),
    (gen_random_uuid(), v_l3, 'taxes',     6.20,  true),
    (gen_random_uuid(), v_l3, 'insurance', 0.85,  true),
    (gen_random_uuid(), v_l8, 'cam',       8.50,  true),
    (gen_random_uuid(), v_l8, 'taxes',     6.20,  true),
    (gen_random_uuid(), v_l8, 'insurance', 0.85,  true)
  ON CONFLICT DO NOTHING;

  -- ── 9. Lease documents ────────────────────────────────────────────────────
  INSERT INTO re_lease_document (doc_id, lease_id, doc_type, file_name, parser_status, confidence)
  VALUES
    ('c0010000-0001-0001-0001-000000000001'::uuid,
     v_l1, 'original_lease',
     'Hartley_Simmons_LLP_Lease_2021.pdf',
     'complete', 0.9400),

    ('c0010000-0001-0001-0002-000000000001'::uuid,
     v_l2, 'amendment',
     'First_National_Bank_Amendment_2023.pdf',
     'complete', 0.9100)
  ON CONFLICT (doc_id) DO NOTHING;

  -- ── 10. Lease events ─────────────────────────────────────────────────────
  INSERT INTO re_lease_event (event_id, lease_id, event_type, event_date, notice_due_date, description, is_resolved)
  VALUES
    -- CommonDesk: must give 90-day notice by June 30, 2026 to exercise any extension
    ('d0010000-0001-0001-0001-000000000001'::uuid,
     v_l5, 'option_notice_due', '2026-12-31', '2026-09-30',
     'CommonDesk lease expires Dec 31, 2026. Renewal probability under review — flex demand softening.',
     false),

    -- First National Bank: 6-month notice before May 2027 expiry
    ('d0010000-0001-0001-0002-000000000001'::uuid,
     v_l2, 'expiration_notice', '2027-05-31', '2026-11-30',
     'First National Bank lease expires May 31, 2027. Begin renewal dialogue Q3 2026.',
     false)
  ON CONFLICT (event_id) DO NOTHING;

  -- ── 11. Rent roll snapshots ───────────────────────────────────────────────
  -- 2025Q4 snapshot (pre-Jan escalations):
  --   Total leased SF: 130,200
  --   Weighted avg rent PSF: ~$43.50 (slightly lower before Jan step-ups)
  --   Annual base rent: 130,200 × $43.50 = $5,663,700
  --   WALT: 3.5 years (as of Dec 31, 2025)
  --   Market PSF: $47.50; Mark-to-market: ($47.50 - $43.50)/$43.50 = 9.2%

  INSERT INTO re_rent_roll_snapshot (
    snapshot_id, asset_id, as_of_date, quarter,
    total_sf, leased_sf, occupied_sf,
    economic_occupancy, physical_occupancy,
    weighted_avg_rent_psf, total_annual_base_rent,
    walt_years, market_rent_psf, mark_to_market_pct,
    source
  )
  VALUES
    ('e0010000-0001-0001-0001-000000000001'::uuid,
     v_asset_id, '2025-12-31', '2025Q4',
     148000, 130200, 130200,
     0.879730, 0.879730,
     43.50, 5663700,
     3.5, 47.50, 0.0920,
     'seed'),

    ('e0010000-0001-0001-0002-000000000001'::uuid,
     v_asset_id, '2026-03-31', '2026Q1',
     148000, 130200, 130200,
     0.879730, 0.879730,
     43.69, 5684838,
     3.3, 48.00, 0.0986,
     'seed')
  ON CONFLICT (asset_id, as_of_date) DO NOTHING;

  RAISE NOTICE '349: Seeded Meridian Office Tower (%) under deal % (fund %)',
    v_asset_id, v_deal_id, v_fund_id;
END $$;
