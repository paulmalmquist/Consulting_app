-- 425_meridian_investment_backfill.sql
-- Backfill missing investment sub-records for all Meridian Capital assets:
--   1. repe_property_asset: property_type, market, city, state, msa, square_feet
--   2. re_asset_quarter_state: quarterly financial snapshots for the latest 4 quarters
--   3. re_investment_quarter_state: investment-level rollups
--
-- This fixes the "No type / No market / No valuation / Pending" display
-- on fund detail pages for all 3 Meridian funds.
--
-- Depends on: 265 (object model), 270 (institutional model), 285 (accounting)
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout.

DO $$
DECLARE
  v_env_id uuid := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  r RECORD;
  v_pt text;
  v_city text;
  v_state text;
  v_msa text;
  v_sf numeric;
  v_units int;
  v_noi numeric;
  v_occ numeric;
  v_q text;
  v_quarters text[] := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1'];
  v_base_noi numeric;
  v_base_value numeric;
  v_growth numeric;
  v_qi int;
  v_run_id uuid;
  v_deal_rec RECORD;
  v_deal_nav numeric;
  v_deal_noi numeric;
  v_deal_value numeric;
  v_deal_debt numeric;
  v_asset_count int;
BEGIN

  -- Resolve business_id for the Meridian environment
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE NOTICE '425: No business binding for Meridian env, skipping';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- I. BACKFILL repe_property_asset FOR ASSETS MISSING PROPERTY TYPE
  -- ═══════════════════════════════════════════════════════════════════════
  -- Assign property_type and location based on asset name patterns.
  -- This is a heuristic approach — actual property types should be verified.

  FOR r IN
    SELECT a.asset_id, a.name, a.asset_type,
           pa.property_type AS existing_type,
           pa.city AS existing_city,
           pa.square_feet AS existing_sf
    FROM repe_asset a
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    WHERE f.business_id = v_business_id
      AND (pa.property_type IS NULL OR pa.market IS NULL OR pa.city IS NULL)
  LOOP
    -- Assign property type based on asset name heuristics
    v_pt := CASE
      WHEN r.name ILIKE '%multifamily%' OR r.name ILIKE '%residential%'
           OR r.name ILIKE '%apartment%' OR r.name ILIKE '%heights%'
           OR r.name ILIKE '%village%' OR r.name ILIKE '%park %'
           OR r.name ILIKE '%towers%' OR r.name ILIKE '%commons%' THEN 'multifamily'
      WHEN r.name ILIKE '%senior%' OR r.name ILIKE '%care%' THEN 'senior_housing'
      WHEN r.name ILIKE '%student%' OR r.name ILIKE '%campus%' THEN 'student_housing'
      WHEN r.name ILIKE '%office%' OR r.name ILIKE '%tower%' OR r.name ILIKE '%corporate%' THEN 'office'
      WHEN r.name ILIKE '%medical%' OR r.name ILIKE '%health%' OR r.name ILIKE '%med %' THEN 'medical_office'
      WHEN r.name ILIKE '%industrial%' OR r.name ILIKE '%warehouse%'
           OR r.name ILIKE '%distribution%' OR r.name ILIKE '%logistics%' THEN 'industrial'
      WHEN r.name ILIKE '%retail%' OR r.name ILIKE '%plaza%' OR r.name ILIKE '%center%'
           OR r.name ILIKE '%mall%' OR r.name ILIKE '%shop%' THEN 'retail'
      WHEN r.name ILIKE '%hotel%' OR r.name ILIKE '%hospitality%' THEN 'hospitality'
      WHEN r.name ILIKE '%storage%' THEN 'self_storage'
      WHEN r.name ILIKE '%data%' THEN 'data_center'
      WHEN r.asset_type = 'cmbs' THEN 'cmbs_conduit'
      ELSE 'multifamily'  -- default for Meridian's primary strategy
    END;

    -- Assign city/state/MSA from a rotating set of top REPE metros
    v_city := CASE (hashtext(r.name::text) % 8)
      WHEN 0 THEN 'Atlanta'     WHEN 1 THEN 'Dallas'
      WHEN 2 THEN 'Phoenix'     WHEN 3 THEN 'Denver'
      WHEN 4 THEN 'Nashville'   WHEN 5 THEN 'Charlotte'
      WHEN 6 THEN 'Tampa'       ELSE 'Austin'
    END;
    v_state := CASE v_city
      WHEN 'Atlanta' THEN 'GA'   WHEN 'Dallas' THEN 'TX'
      WHEN 'Phoenix' THEN 'AZ'   WHEN 'Denver' THEN 'CO'
      WHEN 'Nashville' THEN 'TN' WHEN 'Charlotte' THEN 'NC'
      WHEN 'Tampa' THEN 'FL'     ELSE 'TX'
    END;
    v_msa := CASE v_city
      WHEN 'Atlanta' THEN 'Atlanta-Sandy Springs-Alpharetta'
      WHEN 'Dallas' THEN 'Dallas-Fort Worth-Arlington'
      WHEN 'Phoenix' THEN 'Phoenix-Mesa-Chandler'
      WHEN 'Denver' THEN 'Denver-Aurora-Lakewood'
      WHEN 'Nashville' THEN 'Nashville-Davidson-Murfreesboro'
      WHEN 'Charlotte' THEN 'Charlotte-Concord-Gastonia'
      WHEN 'Tampa' THEN 'Tampa-St. Petersburg-Clearwater'
      ELSE 'Austin-Round Rock-Georgetown'
    END;

    -- Assign size based on property type
    v_units := NULL;
    v_sf := NULL;
    IF v_pt IN ('multifamily', 'senior_housing', 'student_housing') THEN
      v_units := 80 + (abs(hashtext(r.name::text)) % 300);  -- 80-380 units
    ELSE
      v_sf := 50000 + (abs(hashtext(r.name::text)) % 350000);  -- 50K-400K SF
    END IF;

    -- Assign base NOI and occupancy
    v_noi := CASE v_pt
      WHEN 'multifamily' THEN 800000 + (abs(hashtext(r.name::text)) % 2000000)
      WHEN 'office' THEN 1200000 + (abs(hashtext(r.name::text)) % 3000000)
      WHEN 'industrial' THEN 600000 + (abs(hashtext(r.name::text)) % 1500000)
      WHEN 'medical_office' THEN 900000 + (abs(hashtext(r.name::text)) % 1500000)
      WHEN 'retail' THEN 500000 + (abs(hashtext(r.name::text)) % 1000000)
      ELSE 700000 + (abs(hashtext(r.name::text)) % 1500000)
    END;
    v_occ := 0.82 + (abs(hashtext(r.name::text || 'occ') % 16) / 100.0);  -- 82-97%

    -- Upsert property asset record
    INSERT INTO repe_property_asset (
      asset_id, property_type, market, city, state, msa,
      square_feet, units, current_noi, occupancy
    )
    VALUES (
      r.asset_id, v_pt, v_msa, v_city, v_state, v_msa,
      v_sf, v_units, v_noi, v_occ
    )
    ON CONFLICT (asset_id) DO UPDATE SET
      property_type = COALESCE(repe_property_asset.property_type, EXCLUDED.property_type),
      market        = COALESCE(repe_property_asset.market, EXCLUDED.market),
      city          = COALESCE(repe_property_asset.city, EXCLUDED.city),
      state         = COALESCE(repe_property_asset.state, EXCLUDED.state),
      msa           = COALESCE(repe_property_asset.msa, EXCLUDED.msa),
      square_feet   = COALESCE(repe_property_asset.square_feet, EXCLUDED.square_feet),
      units         = COALESCE(repe_property_asset.units, EXCLUDED.units),
      current_noi   = COALESCE(repe_property_asset.current_noi, EXCLUDED.current_noi),
      occupancy     = COALESCE(repe_property_asset.occupancy, EXCLUDED.occupancy);

    RAISE NOTICE '425: Backfilled property_asset for % (%) — % in %',
      r.name, r.asset_id, v_pt, v_city;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- II. BACKFILL re_asset_quarter_state FOR ASSETS MISSING QUARTERLY DATA
  -- ═══════════════════════════════════════════════════════════════════════

  FOR r IN
    SELECT a.asset_id, a.name,
           pa.current_noi, pa.occupancy, pa.square_feet, pa.units,
           pa.property_type,
           COALESCE(l.upb, 0) AS debt_balance
    FROM repe_asset a
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    LEFT JOIN re_loan l ON l.asset_id = a.asset_id
    WHERE f.business_id = v_business_id
      AND NOT EXISTS (
        SELECT 1 FROM re_asset_quarter_state qs
        WHERE qs.asset_id = a.asset_id AND qs.scenario_id IS NULL
        LIMIT 1
      )
  LOOP
    v_base_noi := COALESCE(r.current_noi, 800000);
    -- Asset value = annualized NOI / cap rate (5.5-7% depending on type)
    v_base_value := CASE r.property_type
      WHEN 'multifamily' THEN v_base_noi * 4 / 0.055
      WHEN 'industrial' THEN v_base_noi * 4 / 0.06
      WHEN 'office' THEN v_base_noi * 4 / 0.065
      WHEN 'medical_office' THEN v_base_noi * 4 / 0.06
      WHEN 'retail' THEN v_base_noi * 4 / 0.07
      ELSE v_base_noi * 4 / 0.06
    END;

    FOR v_qi IN 1..array_length(v_quarters, 1) LOOP
      v_q := v_quarters[v_qi];
      v_growth := 1.0 + (v_qi - 1) * 0.005;  -- 0.5% growth per quarter
      v_run_id := gen_random_uuid();

      INSERT INTO re_asset_quarter_state (
        id, asset_id, quarter, scenario_id,
        noi, revenue, opex, capex, debt_service, occupancy,
        debt_balance, asset_value, nav,
        valuation_method, inputs_hash, run_id, created_at
      )
      VALUES (
        gen_random_uuid(),
        r.asset_id,
        v_q,
        NULL,  -- base scenario
        ROUND(v_base_noi * v_growth, 2),
        ROUND(v_base_noi * v_growth * 1.67, 2),  -- gross revenue ~1.67x NOI
        ROUND(v_base_noi * v_growth * 0.67, 2),   -- opex ~67% of NOI
        ROUND(v_base_noi * v_growth * 0.08, 2),   -- capex ~8% of NOI
        ROUND(r.debt_balance * 0.015, 2),          -- quarterly debt service
        COALESCE(r.occupancy, 0.90) + (v_qi - 1) * 0.002,
        r.debt_balance,
        ROUND(v_base_value * v_growth, 2),
        ROUND(v_base_value * v_growth - r.debt_balance, 2),  -- NAV = value - debt
        'cap_rate',
        md5(r.asset_id::text || v_q),
        v_run_id,
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

    RAISE NOTICE '425: Seeded quarter states for % (%)', r.name, r.asset_id;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- III. BACKFILL re_investment_quarter_state (DEAL-LEVEL ROLLUPS)
  -- ═══════════════════════════════════════════════════════════════════════

  FOR v_deal_rec IN
    SELECT d.deal_id, d.name, d.fund_id,
           COALESCE(d.committed_capital, 50000000) AS committed,
           COALESCE(d.invested_capital, 40000000) AS invested
    FROM repe_deal d
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE f.business_id = v_business_id
  LOOP
    FOR v_qi IN 1..array_length(v_quarters, 1) LOOP
      v_q := v_quarters[v_qi];

      -- Aggregate from asset quarter states
      SELECT
        COALESCE(SUM(qs.nav), 0),
        COALESCE(SUM(qs.noi), 0),
        COALESCE(SUM(qs.asset_value), 0),
        COALESCE(SUM(qs.debt_balance), 0),
        COUNT(DISTINCT qs.asset_id)
      INTO v_deal_nav, v_deal_noi, v_deal_value, v_deal_debt, v_asset_count
      FROM repe_asset a
      JOIN re_asset_quarter_state qs ON qs.asset_id = a.asset_id
        AND qs.quarter = v_q AND qs.scenario_id IS NULL
      WHERE a.deal_id = v_deal_rec.deal_id;

      -- Skip if no asset data
      IF v_asset_count = 0 THEN CONTINUE; END IF;

      v_run_id := gen_random_uuid();

      INSERT INTO re_investment_quarter_state (
        id, investment_id, quarter, scenario_id, run_id,
        nav, committed_capital, invested_capital,
        realized_distributions, unrealized_value,
        gross_irr, net_irr, equity_multiple,
        inputs_hash, created_at
      )
      VALUES (
        gen_random_uuid(),
        v_deal_rec.deal_id,
        v_q,
        NULL,
        v_run_id,
        v_deal_nav,
        v_deal_rec.committed,
        v_deal_rec.invested,
        ROUND(v_deal_rec.invested * 0.12 * v_qi / 5.0, 2),  -- growing distributions
        v_deal_value - v_deal_debt,
        -- IRR: base 8-18% depending on vintage, growing slightly
        0.08 + (abs(hashtext(v_deal_rec.deal_id::text)) % 10) / 100.0 + v_qi * 0.002,
        -- Net IRR: ~2-3% below gross
        0.06 + (abs(hashtext(v_deal_rec.deal_id::text)) % 10) / 100.0 + v_qi * 0.002,
        -- Equity multiple: 1.0 + growing
        1.0 + (v_qi * 0.06) + (abs(hashtext(v_deal_rec.deal_id::text || 'em') % 20) / 100.0),
        md5(v_deal_rec.deal_id::text || v_q),
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

    RAISE NOTICE '425: Seeded investment quarter states for % (%)',
      v_deal_rec.name, v_deal_rec.deal_id;
  END LOOP;

  RAISE NOTICE '425: Meridian investment backfill complete';

END $$;
