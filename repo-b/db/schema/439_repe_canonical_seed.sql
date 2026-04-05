-- 439_repe_canonical_seed.sql
-- Canonical proof-step seed: deterministic asset-period snapshots for the 3
-- existing seed funds (Value-Add, Core-Plus, Opportunistic), covering 6 quarters.
--
-- PURPOSE: Populate re_asset_quarter_state so the fund portfolio page, KPI strips,
-- maps, and time-series charts can render from the canonical rollup chain immediately
-- after this migration runs — without requiring a manual quarter-close first.
--
-- SCOPE: Seed only. All rows are marked source='seed' or tagged via value_source.
-- DO NOT use these rows for audited reporting — they are controlled placeholders.
-- A real quarter-close run will overwrite them via ON CONFLICT DO UPDATE.
--
-- Depends on: 270 (re_asset_quarter_state, repe_asset, etc.)
--             378 (scenario_v2_seed — provides the 3 fund IDs and 15 asset IDs)
--             388 (portfolio_overview_seed — lat/lon, pipeline assets)
--             438 (canonical snapshot columns: value_reason, occupancy_reason, etc.)
--
-- Idempotent: ON CONFLICT DO NOTHING throughout.

DO $$
DECLARE
  -- Resolve current canonical assets dynamically instead of trusting legacy UUIDs.
  -- Clean installs may have already consumed the old IDs via ON CONFLICT DO NOTHING,
  -- so we anchor on fund + asset names and skip safely if the expected seed set is
  -- not present.
  v_assets uuid[] := ARRAY[]::uuid[];

  -- Quarters to seed (6 most recent)
  v_quarters text[] := ARRAY['2024Q3','2024Q4','2025Q1','2025Q2','2025Q3','2025Q4'];
  v_q text;

  -- Per-asset seed parameters (representative; not audited)
  -- Format: (asset_id, noi_q, revenue_q, opex_q, cost_basis, debt_balance, cap_rate, occupancy, units, is_unit_based)
  -- noi_q = quarterly NOI; asset_value = noi_q * 4 / cap_rate
  v_seed record;

  v_seed_run_id uuid := '00000000-feed-feed-feed-000000000001';
  v_asset_value numeric;
  v_nav         numeric;
  v_ltv         numeric;
  v_dscr        numeric;
BEGIN
  WITH expected_assets(ord, fund_name, asset_name) AS (
    VALUES
      (1,  'Atlas Value-Add Fund IV',     'Parkview Gardens MF'),
      (2,  'Atlas Value-Add Fund IV',     'Lakeshore Terrace MF'),
      (3,  'Atlas Value-Add Fund IV',     'Metro Logistics Hub'),
      (4,  'Atlas Value-Add Fund IV',     'Riverside Industrial'),
      (5,  'Atlas Value-Add Fund IV',     'Sunset Ridge Apartments'),
      (6,  'Meridian Core-Plus Income',   'Beacon Tower Office'),
      (7,  'Meridian Core-Plus Income',   'Harbor Square Retail'),
      (8,  'Meridian Core-Plus Income',   'Midtown Crossing MF'),
      (9,  'Meridian Core-Plus Income',   'Westgate Office Park'),
      (10, 'Meridian Core-Plus Income',   'The Promenade Retail'),
      (11, 'Meridian Core-Plus Income',   'Skyline Luxury Residences'),
      (12, 'Summit Opportunistic III',    'Heritage Senior Living'),
      (13, 'Summit Opportunistic III',    'Oakwood Memory Care'),
      (14, 'Summit Opportunistic III',    'Commerce Park Flex'),
      (15, 'Summit Opportunistic III',    'Gateway Distribution Ctr')
  )
  SELECT array_agg(resolved.asset_id ORDER BY resolved.ord)
  INTO v_assets
  FROM (
    SELECT e.ord, a.asset_id
    FROM expected_assets e
    JOIN repe_fund f
      ON f.name = e.fund_name
    JOIN repe_deal d
      ON d.fund_id = f.fund_id
    JOIN repe_asset a
      ON a.deal_id = d.deal_id
     AND a.name = e.asset_name
  ) resolved;

  IF COALESCE(array_length(v_assets, 1), 0) <> 15 THEN
    RAISE NOTICE '439: Expected 15 canonical seed assets but found %. Skipping quarter-state seed.',
      COALESCE(array_length(v_assets, 1), 0);
    RETURN;
  END IF;

  -- ── Value-Add Fund IV assets ───────────────────────────────────────────────

  FOR v_q IN SELECT unnest(v_quarters) LOOP
    -- Asset 001: Dallas Midtown MF (multifamily, 240 units, ~92% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[1], v_q, NULL, v_seed_run_id, 'accrual',
      875000, 1300000, 45000, 470000, 55000, 260000,
      0, 0, 0, 560000,
      0.92, 14500000, 0,
      23333333, 8833333, 8833333,  -- asset_value = 875000*4/0.15 cap_rate=0.15 → ~23.3M; debt 14.5M
      0.62, 3.37, 0.24,           -- ltv=14.5/23.3, dscr=875/260
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-001-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 002: Austin South Congress MF (multifamily, 180 units, ~89% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[2], v_q, NULL, v_seed_run_id, 'accrual',
      720000, 1050000, 30000, 360000, 40000, 210000,
      0, 0, 0, 470000,
      0.89, 11200000, 0,
      19200000, 8000000, 8000000,
      0.58, 3.43, 0.26,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-002-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 003: Houston Energy Corridor MF (280 units, ~87% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[3], v_q, NULL, v_seed_run_id, 'accrual',
      980000, 1450000, 55000, 525000, 65000, 290000,
      0, 0, 0, 625000,
      0.87, 15800000, 0,
      26133333, 10333333, 10333333,
      0.60, 3.38, 0.25,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-003-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 004: San Antonio Riverwalk Mixed (200 units, ~91% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[4], v_q, NULL, v_seed_run_id, 'accrual',
      630000, 920000, 25000, 315000, 35000, 190000,
      0, 0, 0, 405000,
      0.91, 10000000, 0,
      16800000, 6800000, 6800000,
      0.60, 3.32, 0.25,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-004-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 005: Denver Cherry Creek MF (160 units, ~93% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[5], v_q, NULL, v_seed_run_id, 'accrual',
      810000, 1160000, 40000, 390000, 50000, 240000,
      0, 0, 0, 520000,
      0.93, 12800000, 0,
      21600000, 8800000, 8800000,
      0.59, 3.38, 0.25,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-005-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- ── Core-Plus Fund III assets ──────────────────────────────────────────────

    -- Asset 006: Chicago River North Office (180k sf, ~88% leased)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[6], v_q, NULL, v_seed_run_id, 'accrual',
      1250000, 1800000, 0, 550000, 120000, 370000,
      85000, 40000, 0, 635000,
      0.88, 22000000, 0,
      31250000, 9250000, 9250000,
      0.70, 3.38, 0.23,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-006-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 007: Miami Brickell Industrial (320k sf, ~95% leased)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[7], v_q, NULL, v_seed_run_id, 'accrual',
      1420000, 1900000, 0, 480000, 90000, 420000,
      0, 0, 0, 910000,
      0.95, 23500000, 0,
      35500000, 12000000, 12000000,
      0.66, 3.38, 0.24,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-007-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 008: Atlanta Midtown Office (240k sf, ~85% leased)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[8], v_q, NULL, v_seed_run_id, 'accrual',
      1100000, 1650000, 0, 550000, 130000, 325000,
      90000, 45000, 0, 510000,
      0.85, 18200000, 0,
      27500000, 9300000, 9300000,
      0.66, 3.38, 0.24,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-008-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 009: Phoenix Camelback Retail (180k sf, ~90% leased)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[9], v_q, NULL, v_seed_run_id, 'accrual',
      950000, 1350000, 0, 400000, 80000, 280000,
      0, 0, 0, 590000,
      0.90, 15700000, 0,
      23750000, 8050000, 8050000,
      0.66, 3.39, 0.24,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-009-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 010: Orlando Lake Nona MF (220 units, ~94% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[10], v_q, NULL, v_seed_run_id, 'accrual',
      820000, 1170000, 35000, 385000, 45000, 245000,
      0, 0, 0, 530000,
      0.94, 13500000, 0,
      21866667, 8366667, 8366667,
      0.62, 3.35, 0.24,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-010-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 011: Nashville Gulch MF (190 units, ~92% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[11], v_q, NULL, v_seed_run_id, 'accrual',
      760000, 1090000, 30000, 360000, 42000, 225000,
      0, 0, 0, 493000,
      0.92, 12400000, 0,
      20266667, 7866667, 7866667,
      0.61, 3.38, 0.24,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-011-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- ── Opportunistic Fund III assets ──────────────────────────────────────────

    -- Asset 012: Charlotte South End MF (320 units, ~86% occ — value-add lease-up)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[12], v_q, NULL, v_seed_run_id, 'accrual',
      1100000, 1700000, 50000, 650000, 180000, 325000,
      0, 0, 0, 595000,
      0.86, 19000000, 0,
      27500000, 8500000, 8500000,
      0.69, 3.38, 0.23,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-012-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 013: Raleigh Research Triangle Industrial (420k sf, ~91% leased)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[13], v_q, NULL, v_seed_run_id, 'accrual',
      1380000, 1870000, 0, 490000, 130000, 410000,
      0, 0, 0, 840000,
      0.91, 22800000, 0,
      34500000, 11700000, 11700000,
      0.66, 3.37, 0.24,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-013-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 014: Tampa Westshore MF (260 units, ~90% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[14], v_q, NULL, v_seed_run_id, 'accrual',
      930000, 1340000, 40000, 450000, 70000, 275000,
      0, 0, 0, 585000,
      0.90, 15400000, 0,
      23250000, 7850000, 7850000,
      0.66, 3.38, 0.24,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-014-' || v_q)
    ) ON CONFLICT DO NOTHING;

    -- Asset 015: Jacksonville Beach MF (180 units, ~88% occ)
    INSERT INTO re_asset_quarter_state (
      asset_id, quarter, scenario_id, run_id, accounting_basis,
      noi, revenue, other_income, opex, capex, debt_service,
      leasing_costs, tenant_improvements, free_rent, net_cash_flow,
      occupancy, debt_balance, cash_balance,
      asset_value, implied_equity_value, nav,
      ltv, dscr, debt_yield,
      valuation_method, value_source,
      value_reason, occupancy_reason, debt_reason, noi_reason,
      inputs_hash
    ) VALUES (
      v_assets[15], v_q, NULL, v_seed_run_id, 'accrual',
      680000, 990000, 25000, 335000, 50000, 200000,
      0, 0, 0, 430000,
      0.88, 11200000, 0,
      17000000, 5800000, 5800000,
      0.66, 3.40, 0.25,
      'cap_rate', 'seed',
      NULL, NULL, NULL, NULL,
      md5('seed-015-' || v_q)
    ) ON CONFLICT DO NOTHING;

  END LOOP;  -- quarters

  -- ── Pipeline assets: explicitly mark as pipeline with NO snapshot ────────────
  -- Pipeline assets (c0000002-...) have asset_status='pipeline' and SHOULD NOT
  -- have quarter-state rows — they are not in the active NAV rollup.
  -- This is correct behavior; verify by checking they don't appear in the fund rollup.

  RAISE NOTICE '439: Canonical seed complete — 15 assets × 6 quarters = 90 snapshot rows inserted.';

END $$;
