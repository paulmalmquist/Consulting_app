-- 453_asset_state_growth_and_realism.sql
--
-- Purpose: Overwrite static seed values with deterministic quarter-over-quarter
-- growth curves and realistic financial parameters. Extends coverage to 2026Q4.
--
-- This migration:
--   1. Updates existing 2024Q3-2025Q4 rows with property-type-specific cap rates and DSCR
--   2. Adds new rows for 2026Q1-2026Q4 with growth applied
--   3. Sets data_status='seed' and source='seed' on all rows
--   4. Uses deterministic formulas (no randomness, no fallbacks)
--
-- Depends on: 439 (canonical seed), 452 (snapshot contract columns)
-- Idempotent: ON CONFLICT DO UPDATE throughout.

DO $$
DECLARE
  v_assets uuid[] := ARRAY[]::uuid[];
  v_asset_names text[] := ARRAY[]::text[];
  v_property_types text[] := ARRAY[]::text[];

  -- All quarters: 10 quarters from 2024Q3 to 2026Q4
  v_quarters text[] := ARRAY[
    '2024Q3','2024Q4','2025Q1','2025Q2','2025Q3','2025Q4',
    '2026Q1','2026Q2','2026Q3','2026Q4'
  ];

  v_seed_run_id uuid := '00000000-feed-feed-feed-000000000002';
  v_q text;
  i int;  -- asset index (1-based)
  qi int; -- quarter index (1-based)

  -- Per-asset base parameters (quarterly values, indexed 1-15)
  v_base_noi      numeric[] := ARRAY[
    875000, 720000, 980000, 650000, 810000,                -- Atlas: MF,MF,industrial,industrial,MF
    1100000, 750000, 920000, 1050000, 680000, 1400000,     -- Meridian: office,retail,MF,office,retail,MF(luxury)
    1200000, 680000, 890000, 1350000                       -- Summit: healthcare,healthcare,flex,industrial
  ];
  v_base_revenue  numeric[] := ARRAY[
    1300000, 1050000, 1450000, 950000, 1200000,
    1650000, 1100000, 1380000, 1550000, 1020000, 2100000,
    1800000, 1020000, 1300000, 2000000
  ];
  v_base_opex     numeric[] := ARRAY[
    470000, 360000, 525000, 340000, 430000,
    610000, 390000, 510000, 560000, 380000, 770000,
    660000, 380000, 460000, 710000
  ];
  v_debt_balance  numeric[] := ARRAY[
    14500000, 11200000, 15800000, 10500000, 13000000,
    22000000, 12500000, 17000000, 20000000, 11500000, 28000000,
    25000000, 11000000, 14000000, 27000000
  ];
  v_debt_service  numeric[] := ARRAY[
    580000, 450000, 640000, 420000, 520000,     -- target DSCR ~1.5x for MF/industrial
    660000, 500000, 570000, 640000, 440000, 870000,  -- ~1.5-1.7x for office/retail/MF
    750000, 430000, 560000, 850000              -- ~1.5-1.6x for healthcare/flex/industrial
  ];
  v_occupancy     numeric[] := ARRAY[
    0.92, 0.89, 0.87, 0.91, 0.94,
    0.88, 0.93, 0.91, 0.86, 0.95, 0.97,
    0.93, 0.90, 0.88, 0.85
  ];
  v_capex         numeric[] := ARRAY[
    55000, 40000, 65000, 35000, 48000,
    80000, 45000, 60000, 75000, 40000, 95000,
    70000, 38000, 50000, 80000
  ];

  -- Property-type cap rates (realistic)
  v_cap_rates     numeric[] := ARRAY[
    0.0525, 0.0525, 0.0575, 0.0575, 0.0525,   -- Atlas: MF,MF,industrial,industrial,MF
    0.0700, 0.0750, 0.0525, 0.0700, 0.0750, 0.0500, -- Meridian: office,retail,MF,office,retail,luxury MF
    0.0700, 0.0700, 0.0650, 0.0575              -- Summit: healthcare,healthcare,flex,industrial
  ];

  -- Growth rates per quarter (deterministic, property-type based)
  v_growth_rates  numeric[] := ARRAY[
    0.005, 0.005, 0.004, 0.004, 0.005,         -- MF/industrial
    -0.001, 0.002, 0.005, -0.001, 0.002, 0.006, -- office(neg)/retail/MF
    0.003, 0.003, 0.004, 0.004                  -- healthcare/flex/industrial
  ];

  -- Computed values per iteration
  v_noi_q numeric;
  v_rev_q numeric;
  v_opex_q numeric;
  v_occ_q numeric;
  v_asset_value numeric;
  v_nav numeric;
  v_ltv numeric;
  v_dscr numeric;
  v_debt_yield numeric;
  v_ds_q numeric;
BEGIN
  -- Resolve assets dynamically (same as 439)
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
    JOIN repe_fund f ON f.name = e.fund_name
    JOIN repe_deal d ON d.fund_id = f.fund_id
    JOIN repe_asset a ON a.deal_id = d.deal_id AND a.name = e.asset_name
  ) resolved;

  IF COALESCE(array_length(v_assets, 1), 0) <> 15 THEN
    RAISE NOTICE '453: Expected 15 canonical seed assets but found %. Skipping.', COALESCE(array_length(v_assets, 1), 0);
    RETURN;
  END IF;

  -- Loop through every asset × every quarter
  FOR i IN 1..15 LOOP
    qi := 0;
    FOREACH v_q IN ARRAY v_quarters LOOP
      qi := qi + 1;

      -- Deterministic growth: compound from base over quarter index
      v_noi_q   := ROUND(v_base_noi[i]    * power(1 + v_growth_rates[i], qi - 1), 0);
      v_rev_q   := ROUND(v_base_revenue[i] * power(1 + v_growth_rates[i], qi - 1), 0);
      v_opex_q  := ROUND(v_base_opex[i]    * power(1 + v_growth_rates[i] * 0.7, qi - 1), 0); -- opex grows slower
      v_ds_q    := v_debt_service[i]; -- debt service is fixed (amortization schedule)

      -- Occupancy: slight seasonal variation (deterministic, +/- 2pp)
      v_occ_q   := v_occupancy[i] + 0.01 * sin(qi * 1.57); -- sin wave gives +/-1pp variation

      -- Valuation: NOI / cap rate (annualized = quarterly * 4)
      v_asset_value := ROUND(v_noi_q * 4 / v_cap_rates[i], 0);
      v_nav         := v_asset_value - v_debt_balance[i];
      v_ltv         := ROUND(v_debt_balance[i]::numeric / NULLIF(v_asset_value, 0), 4);
      v_dscr        := ROUND(v_noi_q::numeric / NULLIF(v_ds_q, 0), 2);
      v_debt_yield  := ROUND(v_noi_q::numeric / NULLIF(v_debt_balance[i], 0), 4);

      INSERT INTO re_asset_quarter_state (
        id, asset_id, quarter, scenario_id, run_id, accounting_basis,
        noi, revenue, other_income, opex, capex, debt_service,
        leasing_costs, tenant_improvements, free_rent, net_cash_flow,
        occupancy, debt_balance, cash_balance,
        asset_value, implied_equity_value, nav,
        ltv, dscr, debt_yield,
        valuation_method, value_source,
        data_status, source, version,
        inputs_hash
      ) VALUES (
        gen_random_uuid(),
        v_assets[i], v_q, NULL, v_seed_run_id, 'accrual',
        v_noi_q, v_rev_q, ROUND(v_rev_q * 0.035, 0), v_opex_q, v_capex[i], v_ds_q,
        0, 0, 0, v_noi_q - v_ds_q,
        v_occ_q, v_debt_balance[i], 0,
        v_asset_value, v_nav, v_nav,
        v_ltv, v_dscr, v_debt_yield,
        'cap_rate', 'seed',
        'seed', 'seed', 1,
        md5('seed-453-' || i || '-' || v_q)
      )
      ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
      DO UPDATE SET
        noi = EXCLUDED.noi,
        revenue = EXCLUDED.revenue,
        other_income = EXCLUDED.other_income,
        opex = EXCLUDED.opex,
        capex = EXCLUDED.capex,
        debt_service = EXCLUDED.debt_service,
        net_cash_flow = EXCLUDED.net_cash_flow,
        occupancy = EXCLUDED.occupancy,
        debt_balance = EXCLUDED.debt_balance,
        asset_value = EXCLUDED.asset_value,
        implied_equity_value = EXCLUDED.implied_equity_value,
        nav = EXCLUDED.nav,
        ltv = EXCLUDED.ltv,
        dscr = EXCLUDED.dscr,
        debt_yield = EXCLUDED.debt_yield,
        data_status = EXCLUDED.data_status,
        source = EXCLUDED.source,
        inputs_hash = EXCLUDED.inputs_hash,
        run_id = EXCLUDED.run_id;

    END LOOP;
  END LOOP;

  RAISE NOTICE '453: Seeded 15 assets × 10 quarters = 150 asset quarter state rows with growth + realistic params.';
END $$;
