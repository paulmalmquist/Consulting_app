-- 356: Seed lease stacks for 4 additional assets — multifamily, industrial, retail, senior housing.
-- Resolves asset_ids dynamically from repe_asset + repe_property_asset.
-- Safe to re-run: ON CONFLICT DO NOTHING throughout.

DO $$
DECLARE
  v_business_id uuid := 'a1b2c3d4-0001-0001-0001-000000000001'::uuid;  -- Meridian Capital Mgmt

  -- Asset IDs resolved dynamically
  v_mf_asset_id   uuid;  -- multifamily
  v_ind_asset_id   uuid;  -- industrial
  v_ret_asset_id   uuid;  -- retail
  v_sh_asset_id    uuid;  -- senior housing

  -- ── MULTIFAMILY ──────────────────────────────────────────────────────────
  -- Tenant UUIDs
  v_mf_t1  uuid := 'b0010000-0002-0001-0001-000000000001'::uuid;  -- Sarah Mitchell
  v_mf_t2  uuid := 'b0010000-0002-0001-0002-000000000001'::uuid;  -- James & Linda Torres
  v_mf_t3  uuid := 'b0010000-0002-0001-0003-000000000001'::uuid;  -- David Kim
  v_mf_t4  uuid := 'b0010000-0002-0001-0004-000000000001'::uuid;  -- Maria Gonzalez
  v_mf_t5  uuid := 'b0010000-0002-0001-0005-000000000001'::uuid;  -- Robert Chen
  v_mf_t6  uuid := 'b0010000-0002-0001-0006-000000000001'::uuid;  -- Amanda Williams

  -- Space UUIDs
  v_mf_sp1 uuid := 'b0020000-0002-0001-0001-000000000001'::uuid;  -- Unit 101 (Studio)
  v_mf_sp2 uuid := 'b0020000-0002-0001-0002-000000000001'::uuid;  -- Unit 102 (Studio)
  v_mf_sp3 uuid := 'b0020000-0002-0001-0003-000000000001'::uuid;  -- Unit 201 (1BR)
  v_mf_sp4 uuid := 'b0020000-0002-0001-0004-000000000001'::uuid;  -- Unit 202 (1BR)
  v_mf_sp5 uuid := 'b0020000-0002-0001-0005-000000000001'::uuid;  -- Unit 301 (2BR)
  v_mf_sp6 uuid := 'b0020000-0002-0001-0006-000000000001'::uuid;  -- Unit 302 (2BR)
  v_mf_sp7 uuid := 'b0020000-0002-0001-0007-000000000001'::uuid;  -- Unit 303 (2BR)
  v_mf_sp8 uuid := 'b0020000-0002-0001-0008-000000000001'::uuid;  -- Unit 401 (3BR)

  -- Lease UUIDs
  v_mf_l1  uuid := 'b0030000-0002-0001-0001-000000000001'::uuid;  -- Mitchell → Unit 101
  v_mf_l2  uuid := 'b0030000-0002-0001-0002-000000000001'::uuid;  -- Torres → Unit 201
  v_mf_l3  uuid := 'b0030000-0002-0001-0003-000000000001'::uuid;  -- Kim → Unit 202
  v_mf_l4  uuid := 'b0030000-0002-0001-0004-000000000001'::uuid;  -- Gonzalez → Unit 301
  v_mf_l5  uuid := 'b0030000-0002-0001-0005-000000000001'::uuid;  -- Chen → Unit 302
  v_mf_l6  uuid := 'b0030000-0002-0001-0006-000000000001'::uuid;  -- Williams → Unit 401

  -- ── INDUSTRIAL ───────────────────────────────────────────────────────────
  -- Tenant UUIDs
  v_ind_t1 uuid := 'b0010000-0003-0001-0001-000000000001'::uuid;  -- Velocity Distribution LLC
  v_ind_t2 uuid := 'b0010000-0003-0001-0002-000000000001'::uuid;  -- Precision Manufacturing Inc
  v_ind_t3 uuid := 'b0010000-0003-0001-0003-000000000001'::uuid;  -- Central States Cold Storage

  -- Space UUIDs
  v_ind_sp1 uuid := 'b0020000-0003-0001-0001-000000000001'::uuid;  -- Bay A
  v_ind_sp2 uuid := 'b0020000-0003-0001-0002-000000000001'::uuid;  -- Bay B
  v_ind_sp3 uuid := 'b0020000-0003-0001-0003-000000000001'::uuid;  -- Bay C
  v_ind_sp4 uuid := 'b0020000-0003-0001-0004-000000000001'::uuid;  -- Bay D

  -- Lease UUIDs
  v_ind_l1 uuid := 'b0030000-0003-0001-0001-000000000001'::uuid;  -- Velocity → Bay A
  v_ind_l2 uuid := 'b0030000-0003-0001-0002-000000000001'::uuid;  -- Precision → Bay B
  v_ind_l3 uuid := 'b0030000-0003-0001-0003-000000000001'::uuid;  -- Central States → Bay C

  -- ── RETAIL ───────────────────────────────────────────────────────────────
  -- Tenant UUIDs
  v_ret_t1 uuid := 'b0010000-0004-0001-0001-000000000001'::uuid;  -- Whole Earth Market
  v_ret_t2 uuid := 'b0010000-0004-0001-0002-000000000001'::uuid;  -- CoreFit Athletics
  v_ret_t3 uuid := 'b0010000-0004-0001-0003-000000000001'::uuid;  -- Bella Vita Ristorante
  v_ret_t4 uuid := 'b0010000-0004-0001-0004-000000000001'::uuid;  -- Pacific Brew Coffee

  -- Space UUIDs
  v_ret_sp1 uuid := 'b0020000-0004-0001-0001-000000000001'::uuid;  -- Anchor Space
  v_ret_sp2 uuid := 'b0020000-0004-0001-0002-000000000001'::uuid;  -- Suite A
  v_ret_sp3 uuid := 'b0020000-0004-0001-0003-000000000001'::uuid;  -- Suite B
  v_ret_sp4 uuid := 'b0020000-0004-0001-0004-000000000001'::uuid;  -- Pad Site
  v_ret_sp5 uuid := 'b0020000-0004-0001-0005-000000000001'::uuid;  -- Suite C

  -- Lease UUIDs
  v_ret_l1 uuid := 'b0030000-0004-0001-0001-000000000001'::uuid;  -- Whole Earth → Anchor
  v_ret_l2 uuid := 'b0030000-0004-0001-0002-000000000001'::uuid;  -- CoreFit → Suite A
  v_ret_l3 uuid := 'b0030000-0004-0001-0003-000000000001'::uuid;  -- Bella Vita → Suite B
  v_ret_l4 uuid := 'b0030000-0004-0001-0004-000000000001'::uuid;  -- Pacific Brew → Pad Site

  -- ── SENIOR HOUSING ───────────────────────────────────────────────────────
  -- Tenant UUIDs
  v_sh_t1 uuid := 'b0010000-0005-0001-0001-000000000001'::uuid;  -- Eleanor Whitfield
  v_sh_t2 uuid := 'b0010000-0005-0001-0002-000000000001'::uuid;  -- Harold Benson
  v_sh_t3 uuid := 'b0010000-0005-0001-0003-000000000001'::uuid;  -- Dorothy Kramer
  v_sh_t4 uuid := 'b0010000-0005-0001-0004-000000000001'::uuid;  -- George Tanaka
  v_sh_t5 uuid := 'b0010000-0005-0001-0005-000000000001'::uuid;  -- Margaret O'Brien
  v_sh_t6 uuid := 'b0010000-0005-0001-0006-000000000001'::uuid;  -- Frank DeLuca
  v_sh_t7 uuid := 'b0010000-0005-0001-0007-000000000001'::uuid;  -- Ruth Yamamoto
  v_sh_t8 uuid := 'b0010000-0005-0001-0008-000000000001'::uuid;  -- Walter Norris

  -- Space UUIDs
  v_sh_sp1  uuid := 'b0020000-0005-0001-0001-000000000001'::uuid;  -- Room 101
  v_sh_sp2  uuid := 'b0020000-0005-0001-0002-000000000001'::uuid;  -- Room 102
  v_sh_sp3  uuid := 'b0020000-0005-0001-0003-000000000001'::uuid;  -- Room 103
  v_sh_sp4  uuid := 'b0020000-0005-0001-0004-000000000001'::uuid;  -- Room 104
  v_sh_sp5  uuid := 'b0020000-0005-0001-0005-000000000001'::uuid;  -- Suite 201
  v_sh_sp6  uuid := 'b0020000-0005-0001-0006-000000000001'::uuid;  -- Suite 202
  v_sh_sp7  uuid := 'b0020000-0005-0001-0007-000000000001'::uuid;  -- Suite 203
  v_sh_sp8  uuid := 'b0020000-0005-0001-0008-000000000001'::uuid;  -- Suite 301
  v_sh_sp9  uuid := 'b0020000-0005-0001-0009-000000000001'::uuid;  -- Suite 302
  v_sh_sp10 uuid := 'b0020000-0005-0001-000a-000000000001'::uuid;  -- Suite 303

  -- Lease UUIDs
  v_sh_l1 uuid := 'b0030000-0005-0001-0001-000000000001'::uuid;  -- Whitfield → Room 101
  v_sh_l2 uuid := 'b0030000-0005-0001-0002-000000000001'::uuid;  -- Benson → Room 102
  v_sh_l3 uuid := 'b0030000-0005-0001-0003-000000000001'::uuid;  -- Kramer → Room 103
  v_sh_l4 uuid := 'b0030000-0005-0001-0004-000000000001'::uuid;  -- Tanaka → Suite 201
  v_sh_l5 uuid := 'b0030000-0005-0001-0005-000000000001'::uuid;  -- O'Brien → Suite 202
  v_sh_l6 uuid := 'b0030000-0005-0001-0006-000000000001'::uuid;  -- DeLuca → Suite 203
  v_sh_l7 uuid := 'b0030000-0005-0001-0007-000000000001'::uuid;  -- Yamamoto → Suite 301
  v_sh_l8 uuid := 'b0030000-0005-0001-0008-000000000001'::uuid;  -- Norris → Suite 302

BEGIN

  -- ════════════════════════════════════════════════════════════════════════
  -- ASSET 1: MULTIFAMILY
  -- ════════════════════════════════════════════════════════════════════════

  SELECT a.asset_id INTO v_mf_asset_id
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  WHERE LOWER(pa.property_type) = 'multifamily'
  LIMIT 1;

  IF v_mf_asset_id IS NULL THEN
    RAISE NOTICE '356: No multifamily asset found — skipping multifamily seed';
  ELSE

    -- ── Tenants ──────────────────────────────────────────────────────────
    INSERT INTO re_tenant (tenant_id, business_id, name, industry, credit_rating, is_anchor)
    VALUES
      (v_mf_t1, v_business_id, 'Sarah Mitchell',        'individual', NULL,  false),
      (v_mf_t2, v_business_id, 'James & Linda Torres',  'individual', NULL,  false),
      (v_mf_t3, v_business_id, 'David Kim',             'individual', NULL,  false),
      (v_mf_t4, v_business_id, 'Maria Gonzalez',        'individual', NULL,  false),
      (v_mf_t5, v_business_id, 'Robert Chen',           'individual', NULL,  false),
      (v_mf_t6, v_business_id, 'Amanda Williams',       'individual', NULL,  false)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- ── Spaces ───────────────────────────────────────────────────────────
    INSERT INTO re_asset_space (space_id, asset_id, suite_number, floor, rentable_sf, space_type, status)
    VALUES
      (v_mf_sp1, v_mf_asset_id, 'Unit 101', 1, 550,  'flex', 'leased'),
      (v_mf_sp2, v_mf_asset_id, 'Unit 102', 1, 550,  'flex', 'vacant'),
      (v_mf_sp3, v_mf_asset_id, 'Unit 201', 2, 750,  'flex',    'leased'),
      (v_mf_sp4, v_mf_asset_id, 'Unit 202', 2, 750,  'flex',    'leased'),
      (v_mf_sp5, v_mf_asset_id, 'Unit 301', 3, 1050, 'flex',    'leased'),
      (v_mf_sp6, v_mf_asset_id, 'Unit 302', 3, 1050, 'flex',    'leased'),
      (v_mf_sp7, v_mf_asset_id, 'Unit 303', 3, 1050, 'flex',    'vacant'),
      (v_mf_sp8, v_mf_asset_id, 'Unit 401', 4, 1350, 'flex',    'leased')
    ON CONFLICT (space_id) DO NOTHING;
    -- Total: 7,100 SF; Leased: 5,500 SF (6 of 8 units); Vacant: 1,600 SF

    -- ── Leases ───────────────────────────────────────────────────────────
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
      -- Mitchell → Unit 101 (Studio): $1,650/mo = $36.00 PSF/yr
      (v_mf_l1, v_mf_asset_id, v_mf_sp1, v_mf_t1,
       'modified_gross', 'active',
       '2025-08-01', '2026-07-31',
       36.00, 550,
       0, 0,
       NULL, false, false,
       'Studio unit — 12-month term'),

      -- Torres → Unit 201 (1BR): $2,100/mo = $33.60 PSF/yr
      (v_mf_l2, v_mf_asset_id, v_mf_sp3, v_mf_t2,
       'modified_gross', 'active',
       '2025-06-01', '2026-05-31',
       33.60, 750,
       0, 0,
       NULL, false, false,
       '1BR unit — 12-month term'),

      -- Kim → Unit 202 (1BR): $2,150/mo = $34.40 PSF/yr
      (v_mf_l3, v_mf_asset_id, v_mf_sp4, v_mf_t3,
       'modified_gross', 'active',
       '2025-10-01', '2026-09-30',
       34.40, 750,
       0, 0,
       NULL, false, false,
       '1BR unit — 12-month term'),

      -- Gonzalez → Unit 301 (2BR): $2,850/mo = $32.57 PSF/yr
      (v_mf_l4, v_mf_asset_id, v_mf_sp5, v_mf_t4,
       'modified_gross', 'active',
       '2025-04-01', '2026-03-31',
       32.57, 1050,
       0, 0,
       NULL, false, false,
       '2BR unit — 12-month term, expiring soon'),

      -- Chen → Unit 302 (2BR): $2,900/mo = $33.14 PSF/yr
      (v_mf_l5, v_mf_asset_id, v_mf_sp6, v_mf_t5,
       'modified_gross', 'active',
       '2025-09-01', '2026-08-31',
       33.14, 1050,
       0, 0,
       NULL, false, false,
       '2BR unit — 12-month term'),

      -- Williams → Unit 401 (3BR): $3,450/mo = $30.67 PSF/yr
      (v_mf_l6, v_mf_asset_id, v_mf_sp8, v_mf_t6,
       'modified_gross', 'active',
       '2025-07-01', '2026-06-30',
       30.67, 1350,
       0, 0,
       NULL, false, false,
       '3BR unit — 12-month term')
    ON CONFLICT (lease_id) DO NOTHING;

    -- ── Lease steps (flat — 12-month residential, no escalation) ─────────
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_mf_l1, '2025-08-01', '2026-07-31', 36.00, 1650, 'fixed', NULL),
      (gen_random_uuid(), v_mf_l2, '2025-06-01', '2026-05-31', 33.60, 2100, 'fixed', NULL),
      (gen_random_uuid(), v_mf_l3, '2025-10-01', '2026-09-30', 34.40, 2150, 'fixed', NULL),
      (gen_random_uuid(), v_mf_l4, '2025-04-01', '2026-03-31', 32.57, 2850, 'fixed', NULL),
      (gen_random_uuid(), v_mf_l5, '2025-09-01', '2026-08-31', 33.14, 2900, 'fixed', NULL),
      (gen_random_uuid(), v_mf_l6, '2025-07-01', '2026-06-30', 30.67, 3450, 'fixed', NULL)
    ON CONFLICT DO NOTHING;

    -- ── Lease events ─────────────────────────────────────────────────────
    INSERT INTO re_lease_event (event_id, lease_id, event_type, event_date, notice_due_date, description, is_resolved)
    VALUES
      ('d0010000-0002-0001-0001-000000000001'::uuid,
       v_mf_l4, 'expiration_notice', '2026-03-31', '2025-12-31',
       'Gonzalez lease expiring 2026-03-31. Renewal notice due by end of 2025.',
       false)
    ON CONFLICT (event_id) DO NOTHING;

    -- ── Rent roll snapshots ──────────────────────────────────────────────
    INSERT INTO re_rent_roll_snapshot (
      snapshot_id, asset_id, as_of_date, quarter,
      total_sf, leased_sf, occupied_sf,
      economic_occupancy, physical_occupancy,
      weighted_avg_rent_psf, total_annual_base_rent,
      walt_years, market_rent_psf, mark_to_market_pct,
      source
    )
    VALUES
      ('e0010000-0002-0001-0001-000000000001'::uuid,
       v_mf_asset_id, '2025-12-31', '2025Q4',
       7100, 5500, 5500,
       0.7746, 0.7746,
       33.23, 182765,
       0.6, 29400.00, -0.1150,
       'seed'),

      ('e0010000-0002-0001-0002-000000000001'::uuid,
       v_mf_asset_id, '2026-03-31', '2026Q1',
       7100, 5500, 5500,
       0.7746, 0.7746,
       33.23, 182765,
       0.6, 29400.00, -0.1150,
       'seed')
    ON CONFLICT (snapshot_id) DO NOTHING;

    -- ── Lease documents ──────────────────────────────────────────────────
    INSERT INTO re_lease_document (doc_id, lease_id, doc_type, file_name, parser_status, confidence)
    VALUES
      ('c0010000-0002-0001-0001-000000000001'::uuid,
       v_mf_l1, 'original_lease',
       'Mitchell_Unit101_Lease_2025.pdf',
       'complete', 0.9200),

      ('c0010000-0002-0001-0002-000000000001'::uuid,
       v_mf_l4, 'original_lease',
       'Gonzalez_Unit301_Lease_2025.pdf',
       'complete', 0.9100)
    ON CONFLICT (doc_id) DO NOTHING;

    RAISE NOTICE '356: Seeded multifamily lease stack for asset %', v_mf_asset_id;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- ASSET 2: INDUSTRIAL
  -- ════════════════════════════════════════════════════════════════════════

  SELECT a.asset_id INTO v_ind_asset_id
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  WHERE LOWER(pa.property_type) = 'industrial'
  LIMIT 1;

  IF v_ind_asset_id IS NULL THEN
    RAISE NOTICE '356: No industrial asset found — skipping industrial seed';
  ELSE

    -- ── Tenants ──────────────────────────────────────────────────────────
    INSERT INTO re_tenant (tenant_id, business_id, name, industry, credit_rating, is_anchor)
    VALUES
      (v_ind_t1, v_business_id, 'Velocity Distribution LLC',    'logistics',     'BBB+', true),
      (v_ind_t2, v_business_id, 'Precision Manufacturing Inc',  'manufacturing', 'BBB',  false),
      (v_ind_t3, v_business_id, 'Central States Cold Storage',  'cold_storage',  'BBB-', false)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- ── Spaces ───────────────────────────────────────────────────────────
    INSERT INTO re_asset_space (space_id, asset_id, suite_number, floor, rentable_sf, space_type, status)
    VALUES
      (v_ind_sp1, v_ind_asset_id, 'Bay A', 1, 45000, 'storage', 'leased'),
      (v_ind_sp2, v_ind_asset_id, 'Bay B', 1, 35000, 'storage', 'leased'),
      (v_ind_sp3, v_ind_asset_id, 'Bay C', 1, 28000, 'storage', 'leased'),
      (v_ind_sp4, v_ind_asset_id, 'Bay D', 1, 22000, 'storage', 'vacant')
    ON CONFLICT (space_id) DO NOTHING;
    -- Total: 130,000 SF; Leased: 108,000 SF; Vacant: 22,000 SF

    -- ── Leases ───────────────────────────────────────────────────────────
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
      -- Velocity → Bay A: $8.50/SF/yr NNN, 10-year, 1×5yr option
      (v_ind_l1, v_ind_asset_id, v_ind_sp1, v_ind_t1,
       'nnn', 'active',
       '2020-01-01', '2030-12-31',
       8.50, 45000,
       0, 15.00,
       '1 x 5-year option at FMV', false, false,
       'Anchor tenant — logistics hub, clear height 36ft'),

      -- Precision → Bay B: $9.25/SF/yr NNN, 7-year
      (v_ind_l2, v_ind_asset_id, v_ind_sp2, v_ind_t2,
       'nnn', 'active',
       '2022-06-01', '2029-05-31',
       9.25, 35000,
       0, 10.00,
       NULL, false, false,
       'Manufacturing tenant — heavy power, dock-high loading'),

      -- Central States → Bay C: $10.50/SF/yr NNN, 7-year
      (v_ind_l3, v_ind_asset_id, v_ind_sp3, v_ind_t3,
       'nnn', 'active',
       '2023-03-01', '2030-02-28',
       10.50, 28000,
       0, 20.00,
       NULL, false, false,
       'Cold storage tenant — refrigeration infrastructure')
    ON CONFLICT (lease_id) DO NOTHING;

    -- ── Lease steps (2.5% bumps every 3 years) ──────────────────────────
    -- Velocity: base $8.50, step at yr 3 ($8.71), yr 6 ($8.93), yr 9 ($9.15)
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_ind_l1, '2020-01-01', '2022-12-31',  8.50, 45000*8.50/12,  'fixed', NULL),
      (gen_random_uuid(), v_ind_l1, '2023-01-01', '2025-12-31',  8.71, 45000*8.71/12,  'percentage', 2.50),
      (gen_random_uuid(), v_ind_l1, '2026-01-01', '2028-12-31',  8.93, 45000*8.93/12,  'percentage', 2.50),
      (gen_random_uuid(), v_ind_l1, '2029-01-01', '2030-12-31',  9.15, 45000*9.15/12,  'percentage', 2.50)
    ON CONFLICT DO NOTHING;

    -- Precision: base $9.25, step at yr 3 ($9.48)
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_ind_l2, '2022-06-01', '2025-05-31',  9.25, 35000*9.25/12,  'fixed', NULL),
      (gen_random_uuid(), v_ind_l2, '2025-06-01', '2029-05-31',  9.48, 35000*9.48/12,  'percentage', 2.50)
    ON CONFLICT DO NOTHING;

    -- Central States: base $10.50, step at yr 3 ($10.76)
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_ind_l3, '2023-03-01', '2026-02-28', 10.50, 28000*10.50/12, 'fixed', NULL),
      (gen_random_uuid(), v_ind_l3, '2026-03-01', '2030-02-28', 10.76, 28000*10.76/12, 'percentage', 2.50)
    ON CONFLICT DO NOTHING;

    -- ── Lease charges (NNN pass-throughs) ────────────────────────────────
    INSERT INTO re_lease_charge (charge_id, lease_id, charge_type, amount_psf, recoverable)
    VALUES
      (gen_random_uuid(), v_ind_l1, 'cam',       2.50, true),
      (gen_random_uuid(), v_ind_l1, 'taxes',     1.80, true),
      (gen_random_uuid(), v_ind_l1, 'insurance', 0.45, true),
      (gen_random_uuid(), v_ind_l2, 'cam',       2.50, true),
      (gen_random_uuid(), v_ind_l2, 'taxes',     1.80, true),
      (gen_random_uuid(), v_ind_l2, 'insurance', 0.45, true),
      (gen_random_uuid(), v_ind_l3, 'cam',       2.50, true),
      (gen_random_uuid(), v_ind_l3, 'taxes',     1.80, true),
      (gen_random_uuid(), v_ind_l3, 'insurance', 0.45, true)
    ON CONFLICT DO NOTHING;

    -- ── Rent roll snapshots ──────────────────────────────────────────────
    INSERT INTO re_rent_roll_snapshot (
      snapshot_id, asset_id, as_of_date, quarter,
      total_sf, leased_sf, occupied_sf,
      economic_occupancy, physical_occupancy,
      weighted_avg_rent_psf, total_annual_base_rent,
      walt_years, market_rent_psf, mark_to_market_pct,
      source
    )
    VALUES
      ('e0010000-0003-0001-0001-000000000001'::uuid,
       v_ind_asset_id, '2025-12-31', '2025Q4',
       130000, 108000, 108000,
       0.8308, 0.8308,
       9.24, 997920,
       4.8, 9.50, 0.0281,
       'seed'),

      ('e0010000-0003-0001-0002-000000000001'::uuid,
       v_ind_asset_id, '2026-03-31', '2026Q1',
       130000, 108000, 108000,
       0.8308, 0.8308,
       9.24, 997920,
       4.8, 9.50, 0.0281,
       'seed')
    ON CONFLICT (snapshot_id) DO NOTHING;

    -- ── Lease documents ──────────────────────────────────────────────────
    INSERT INTO re_lease_document (doc_id, lease_id, doc_type, file_name, parser_status, confidence)
    VALUES
      ('c0010000-0003-0001-0001-000000000001'::uuid,
       v_ind_l1, 'original_lease',
       'Velocity_Distribution_BayA_Lease_2020.pdf',
       'complete', 0.9500),

      ('c0010000-0003-0001-0002-000000000001'::uuid,
       v_ind_l3, 'amendment',
       'Central_States_Cold_Storage_Amendment_2024.pdf',
       'complete', 0.9000)
    ON CONFLICT (doc_id) DO NOTHING;

    RAISE NOTICE '356: Seeded industrial lease stack for asset %', v_ind_asset_id;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- ASSET 3: RETAIL
  -- ════════════════════════════════════════════════════════════════════════

  SELECT a.asset_id INTO v_ret_asset_id
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  WHERE LOWER(pa.property_type) = 'retail'
  LIMIT 1;

  IF v_ret_asset_id IS NULL THEN
    -- Fallback: find any asset not yet used
    SELECT a.asset_id INTO v_ret_asset_id
    FROM repe_asset a
    JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    WHERE a.asset_id NOT IN (v_mf_asset_id, v_ind_asset_id)
    LIMIT 1;
  END IF;

  IF v_ret_asset_id IS NULL THEN
    RAISE NOTICE '356: No retail asset found — skipping retail seed';
  ELSE

    -- ── Tenants ──────────────────────────────────────────────────────────
    INSERT INTO re_tenant (tenant_id, business_id, name, industry, credit_rating, is_anchor)
    VALUES
      (v_ret_t1, v_business_id, 'Whole Earth Market',     'grocery',       'A',   true),
      (v_ret_t2, v_business_id, 'CoreFit Athletics',      'fitness',       'BB+', false),
      (v_ret_t3, v_business_id, 'Bella Vita Ristorante',  'restaurant',    'BB',  false),
      (v_ret_t4, v_business_id, 'Pacific Brew Coffee',    'food_beverage', 'BB-', false)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- ── Spaces ───────────────────────────────────────────────────────────
    INSERT INTO re_asset_space (space_id, asset_id, suite_number, floor, rentable_sf, space_type, status)
    VALUES
      (v_ret_sp1, v_ret_asset_id, 'Anchor Space', 1, 35000, 'retail', 'leased'),
      (v_ret_sp2, v_ret_asset_id, 'Suite A',      1, 8000,  'retail', 'leased'),
      (v_ret_sp3, v_ret_asset_id, 'Suite B',      1, 6500,  'retail', 'leased'),
      (v_ret_sp4, v_ret_asset_id, 'Pad Site',     1, 4000,  'retail', 'leased'),
      (v_ret_sp5, v_ret_asset_id, 'Suite C',      1, 5500,  'retail', 'vacant')
    ON CONFLICT (space_id) DO NOTHING;
    -- Total: 59,000 SF; Leased: 53,500 SF; Vacant: 5,500 SF

    -- ── Leases ───────────────────────────────────────────────────────────
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
      -- Whole Earth → Anchor: $18.00/SF/yr NNN, 16-year, 3×5yr options
      (v_ret_l1, v_ret_asset_id, v_ret_sp1, v_ret_t1,
       'nnn', 'active',
       '2019-01-01', '2034-12-31',
       18.00, 35000,
       6, 85.00,
       '3 x 5-year options at FMV', false, false,
       'Grocery anchor — below market, co-tenancy clause'),

      -- CoreFit → Suite A: $28.00/SF/yr modified_gross, 5-year
      (v_ret_l2, v_ret_asset_id, v_ret_sp2, v_ret_t2,
       'modified_gross', 'active',
       '2023-04-01', '2028-03-31',
       28.00, 8000,
       0, 35.00,
       NULL, false, false,
       'Fitness tenant — high build-out'),

      -- Bella Vita → Suite B: $32.00/SF/yr full_service, 5-year, percentage rent
      (v_ret_l3, v_ret_asset_id, v_ret_sp3, v_ret_t3,
       'full_service', 'active',
       '2024-01-01', '2028-12-31',
       32.00, 6500,
       2, 50.00,
       NULL, false, false,
       'Restaurant — percentage rent 6%% over $1.2M gross sales'),

      -- Pacific Brew → Pad Site: $35.00/SF/yr NNN, 5-year
      (v_ret_l4, v_ret_asset_id, v_ret_sp4, v_ret_t4,
       'nnn', 'active',
       '2024-06-01', '2029-05-31',
       35.00, 4000,
       0, 25.00,
       NULL, false, false,
       'Drive-through pad site — high visibility')
    ON CONFLICT (lease_id) DO NOTHING;

    -- ── Lease steps ──────────────────────────────────────────────────────
    -- Whole Earth: 2% bumps every 5 years
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_ret_l1, '2019-01-01', '2023-12-31', 18.00, 35000*18.00/12, 'fixed', NULL),
      (gen_random_uuid(), v_ret_l1, '2024-01-01', '2028-12-31', 18.36, 35000*18.36/12, 'percentage', 2.00),
      (gen_random_uuid(), v_ret_l1, '2029-01-01', '2034-12-31', 18.73, 35000*18.73/12, 'percentage', 2.00)
    ON CONFLICT DO NOTHING;

    -- CoreFit: 3% bump at midterm
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_ret_l2, '2023-04-01', '2025-09-30', 28.00, 8000*28.00/12, 'fixed', NULL),
      (gen_random_uuid(), v_ret_l2, '2025-10-01', '2028-03-31', 28.84, 8000*28.84/12, 'percentage', 3.00)
    ON CONFLICT DO NOTHING;

    -- Bella Vita: 3% bump at midterm
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_ret_l3, '2024-01-01', '2026-06-30', 32.00, 6500*32.00/12, 'fixed', NULL),
      (gen_random_uuid(), v_ret_l3, '2026-07-01', '2028-12-31', 32.96, 6500*32.96/12, 'percentage', 3.00)
    ON CONFLICT DO NOTHING;

    -- Pacific Brew: 2.5% bump at midterm
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_ret_l4, '2024-06-01', '2026-11-30', 35.00, 4000*35.00/12, 'fixed', NULL),
      (gen_random_uuid(), v_ret_l4, '2026-12-01', '2029-05-31', 35.88, 4000*35.88/12, 'percentage', 2.50)
    ON CONFLICT DO NOTHING;

    -- ── Lease charges (NNN pass-throughs for Whole Earth and Pacific Brew) ─
    INSERT INTO re_lease_charge (charge_id, lease_id, charge_type, amount_psf, recoverable)
    VALUES
      (gen_random_uuid(), v_ret_l1, 'cam',       6.50, true),
      (gen_random_uuid(), v_ret_l1, 'taxes',     3.80, true),
      (gen_random_uuid(), v_ret_l1, 'insurance', 0.65, true),
      (gen_random_uuid(), v_ret_l4, 'cam',       6.50, true),
      (gen_random_uuid(), v_ret_l4, 'taxes',     3.80, true),
      (gen_random_uuid(), v_ret_l4, 'insurance', 0.65, true)
    ON CONFLICT DO NOTHING;

    -- ── Lease events ─────────────────────────────────────────────────────
    INSERT INTO re_lease_event (event_id, lease_id, event_type, event_date, notice_due_date, description, is_resolved)
    VALUES
      ('d0010000-0004-0001-0001-000000000001'::uuid,
       v_ret_l2, 'option_notice_due', '2028-03-31', '2027-09-30',
       'CoreFit Athletics lease expires March 2028. Option notice due by Sept 30, 2027.',
       false)
    ON CONFLICT (event_id) DO NOTHING;

    -- ── Rent roll snapshots ──────────────────────────────────────────────
    INSERT INTO re_rent_roll_snapshot (
      snapshot_id, asset_id, as_of_date, quarter,
      total_sf, leased_sf, occupied_sf,
      economic_occupancy, physical_occupancy,
      weighted_avg_rent_psf, total_annual_base_rent,
      walt_years, market_rent_psf, mark_to_market_pct,
      source
    )
    VALUES
      ('e0010000-0004-0001-0001-000000000001'::uuid,
       v_ret_asset_id, '2025-12-31', '2025Q4',
       59000, 53500, 53500,
       0.9068, 0.9068,
       22.97, 1228850,
       5.2, 26.00, 0.1319,
       'seed'),

      ('e0010000-0004-0001-0002-000000000001'::uuid,
       v_ret_asset_id, '2026-03-31', '2026Q1',
       59000, 53500, 53500,
       0.9068, 0.9068,
       22.97, 1228850,
       5.2, 26.00, 0.1319,
       'seed')
    ON CONFLICT (snapshot_id) DO NOTHING;

    -- ── Lease documents ──────────────────────────────────────────────────
    INSERT INTO re_lease_document (doc_id, lease_id, doc_type, file_name, parser_status, confidence)
    VALUES
      ('c0010000-0004-0001-0001-000000000001'::uuid,
       v_ret_l1, 'original_lease',
       'Whole_Earth_Market_Anchor_Lease_2019.pdf',
       'complete', 0.9500),

      ('c0010000-0004-0001-0002-000000000001'::uuid,
       v_ret_l3, 'original_lease',
       'Bella_Vita_Ristorante_SuiteB_Lease_2024.pdf',
       'complete', 0.9300)
    ON CONFLICT (doc_id) DO NOTHING;

    RAISE NOTICE '356: Seeded retail lease stack for asset %', v_ret_asset_id;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- ASSET 4: SENIOR HOUSING
  -- ════════════════════════════════════════════════════════════════════════

  SELECT a.asset_id INTO v_sh_asset_id
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  WHERE LOWER(pa.property_type) IN ('senior_housing', 'senior housing')
  LIMIT 1;

  IF v_sh_asset_id IS NULL THEN
    SELECT a.asset_id INTO v_sh_asset_id
    FROM repe_asset a
    JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    WHERE LOWER(pa.property_type) = 'hotel' OR LOWER(pa.property_type) = 'hospitality'
    LIMIT 1;
  END IF;

  IF v_sh_asset_id IS NULL THEN
    RAISE NOTICE '356: No senior housing / hotel asset found — skipping senior housing seed';
  ELSE

    -- ── Tenants (8 residents) ────────────────────────────────────────────
    INSERT INTO re_tenant (tenant_id, business_id, name, industry, credit_rating, is_anchor)
    VALUES
      (v_sh_t1, v_business_id, 'Eleanor Whitfield',   'individual', NULL, false),
      (v_sh_t2, v_business_id, 'Harold Benson',       'individual', NULL, false),
      (v_sh_t3, v_business_id, 'Dorothy Kramer',      'individual', NULL, false),
      (v_sh_t4, v_business_id, 'George Tanaka',       'individual', NULL, false),
      (v_sh_t5, v_business_id, 'Margaret O''Brien',   'individual', NULL, false),
      (v_sh_t6, v_business_id, 'Frank DeLuca',        'individual', NULL, false),
      (v_sh_t7, v_business_id, 'Ruth Yamamoto',       'individual', NULL, false),
      (v_sh_t8, v_business_id, 'Walter Norris',       'individual', NULL, false)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- ── Spaces (10 units: 4 assisted, 3 independent, 3 memory care) ────
    INSERT INTO re_asset_space (space_id, asset_id, suite_number, floor, rentable_sf, space_type, status)
    VALUES
      (v_sh_sp1,  v_sh_asset_id, 'Room 101',  1, 400, 'flex',    'leased'),
      (v_sh_sp2,  v_sh_asset_id, 'Room 102',  1, 400, 'flex',    'leased'),
      (v_sh_sp3,  v_sh_asset_id, 'Room 103',  1, 400, 'flex',    'leased'),
      (v_sh_sp4,  v_sh_asset_id, 'Room 104',  1, 400, 'flex',    'vacant'),
      (v_sh_sp5,  v_sh_asset_id, 'Suite 201', 2, 650, 'flex', 'leased'),
      (v_sh_sp6,  v_sh_asset_id, 'Suite 202', 2, 650, 'flex', 'leased'),
      (v_sh_sp7,  v_sh_asset_id, 'Suite 203', 2, 650, 'flex', 'leased'),
      (v_sh_sp8,  v_sh_asset_id, 'Suite 301', 3, 550, 'flex',        'leased'),
      (v_sh_sp9,  v_sh_asset_id, 'Suite 302', 3, 550, 'flex',        'leased'),
      (v_sh_sp10, v_sh_asset_id, 'Suite 303', 3, 550, 'flex',        'vacant')
    ON CONFLICT (space_id) DO NOTHING;
    -- Total: 5,200 SF; Leased: 4,200 SF (8 of 10 units); Vacant: 1,000 SF

    -- ── Leases (month-to-month, modified_gross) ─────────────────────────
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
      -- Assisted living residents: $6,200/mo = $186.00 PSF/yr
      (v_sh_l1, v_sh_asset_id, v_sh_sp1, v_sh_t1,
       'modified_gross', 'active',
       '2024-03-01', '2026-12-31',
       186.00, 400,
       0, 0,
       NULL, false, false,
       'Assisted living — month-to-month with 30-day notice'),

      (v_sh_l2, v_sh_asset_id, v_sh_sp2, v_sh_t2,
       'modified_gross', 'active',
       '2024-06-01', '2026-12-31',
       186.00, 400,
       0, 0,
       NULL, false, false,
       'Assisted living — month-to-month with 30-day notice'),

      (v_sh_l3, v_sh_asset_id, v_sh_sp3, v_sh_t3,
       'modified_gross', 'active',
       '2024-09-01', '2026-12-31',
       186.00, 400,
       0, 0,
       NULL, false, false,
       'Assisted living — month-to-month with 30-day notice'),

      -- Independent living residents: $4,800/mo = $88.62 PSF/yr
      (v_sh_l4, v_sh_asset_id, v_sh_sp5, v_sh_t4,
       'modified_gross', 'active',
       '2024-01-01', '2026-12-31',
       88.62, 650,
       0, 0,
       NULL, false, false,
       'Independent living — month-to-month with 30-day notice'),

      (v_sh_l5, v_sh_asset_id, v_sh_sp6, v_sh_t5,
       'modified_gross', 'active',
       '2024-05-01', '2026-12-31',
       88.62, 650,
       0, 0,
       NULL, false, false,
       'Independent living — month-to-month with 30-day notice'),

      (v_sh_l6, v_sh_asset_id, v_sh_sp7, v_sh_t6,
       'modified_gross', 'active',
       '2024-08-01', '2026-12-31',
       88.62, 650,
       0, 0,
       NULL, false, false,
       'Independent living — month-to-month with 30-day notice'),

      -- Memory care residents: $7,500/mo = $163.64 PSF/yr
      (v_sh_l7, v_sh_asset_id, v_sh_sp8, v_sh_t7,
       'modified_gross', 'active',
       '2025-01-01', '2026-12-31',
       163.64, 550,
       0, 0,
       NULL, false, false,
       'Memory care — month-to-month with 30-day notice'),

      (v_sh_l8, v_sh_asset_id, v_sh_sp9, v_sh_t8,
       'modified_gross', 'active',
       '2025-04-01', '2026-12-31',
       163.64, 550,
       0, 0,
       NULL, false, false,
       'Memory care — month-to-month with 30-day notice')
    ON CONFLICT (lease_id) DO NOTHING;

    -- ── Lease steps (flat — month-to-month, no escalation) ───────────────
    INSERT INTO re_lease_step (step_id, lease_id, step_start_date, step_end_date, annual_rent_psf, monthly_rent, escalation_type, escalation_pct)
    VALUES
      (gen_random_uuid(), v_sh_l1, '2024-03-01', '2026-12-31', 186.00, 6200, 'fixed', NULL),
      (gen_random_uuid(), v_sh_l2, '2024-06-01', '2026-12-31', 186.00, 6200, 'fixed', NULL),
      (gen_random_uuid(), v_sh_l3, '2024-09-01', '2026-12-31', 186.00, 6200, 'fixed', NULL),
      (gen_random_uuid(), v_sh_l4, '2024-01-01', '2026-12-31',  88.62, 4800, 'fixed', NULL),
      (gen_random_uuid(), v_sh_l5, '2024-05-01', '2026-12-31',  88.62, 4800, 'fixed', NULL),
      (gen_random_uuid(), v_sh_l6, '2024-08-01', '2026-12-31',  88.62, 4800, 'fixed', NULL),
      (gen_random_uuid(), v_sh_l7, '2025-01-01', '2026-12-31', 163.64, 7500, 'fixed', NULL),
      (gen_random_uuid(), v_sh_l8, '2025-04-01', '2026-12-31', 163.64, 7500, 'fixed', NULL)
    ON CONFLICT DO NOTHING;

    -- ── Lease events (annual rate increase notice) ───────────────────────
    INSERT INTO re_lease_event (event_id, lease_id, event_type, event_date, notice_due_date, description, is_resolved)
    VALUES
      ('d0010000-0005-0001-0001-000000000001'::uuid,
       v_sh_l1, 'rent_step', '2026-07-01', '2026-06-30',
       'Annual rate increase effective July 2026 for all residents. 30-day notice required.',
       false),
      ('d0010000-0005-0001-0002-000000000001'::uuid,
       v_sh_l4, 'rent_step', '2026-07-01', '2026-06-30',
       'Annual rate increase effective July 2026 for independent living residents.',
       false),
      ('d0010000-0005-0001-0003-000000000001'::uuid,
       v_sh_l7, 'rent_step', '2026-07-01', '2026-06-30',
       'Annual rate increase effective July 2026 for memory care residents.',
       false)
    ON CONFLICT (event_id) DO NOTHING;

    -- ── Rent roll snapshots ──────────────────────────────────────────────
    INSERT INTO re_rent_roll_snapshot (
      snapshot_id, asset_id, as_of_date, quarter,
      total_sf, leased_sf, occupied_sf,
      economic_occupancy, physical_occupancy,
      weighted_avg_rent_psf, total_annual_base_rent,
      walt_years, market_rent_psf, mark_to_market_pct,
      source
    )
    VALUES
      ('e0010000-0005-0001-0001-000000000001'::uuid,
       v_sh_asset_id, '2025-12-31', '2025Q4',
       5200, 4200, 4200,
       0.8077, 0.8077,
       141.14, 592800,
       0.5, 139.20, -0.0137,
       'seed'),

      ('e0010000-0005-0001-0002-000000000001'::uuid,
       v_sh_asset_id, '2026-03-31', '2026Q1',
       5200, 4200, 4200,
       0.8077, 0.8077,
       141.14, 592800,
       0.5, 139.20, -0.0137,
       'seed')
    ON CONFLICT (snapshot_id) DO NOTHING;

    -- ── Lease documents ──────────────────────────────────────────────────
    INSERT INTO re_lease_document (doc_id, lease_id, doc_type, file_name, parser_status, confidence)
    VALUES
      ('c0010000-0005-0001-0001-000000000001'::uuid,
       v_sh_l1, 'original_lease',
       'Whitfield_Room101_Residency_Agreement_2024.pdf',
       'complete', 0.9100),

      ('c0010000-0005-0001-0002-000000000001'::uuid,
       v_sh_l4, 'original_lease',
       'Tanaka_Suite201_Residency_Agreement_2024.pdf',
       'complete', 0.9300)
    ON CONFLICT (doc_id) DO NOTHING;

    RAISE NOTICE '356: Seeded senior housing lease stack for asset %', v_sh_asset_id;
  END IF;

  RAISE NOTICE '356: Lease expansion seed complete';
END $$;
