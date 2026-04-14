-- 508_granite_peak_bottom_up_seed.sql
-- Hand-crafted cash-flow fixture for Granite Peak Value-Add Fund IV so the
-- bottom-up engine (schema 507) has a believable, end-to-end example:
--   * 1 realized exit (Granite Peak Crossing Apartments)
--   * 1 pre-exit with authoritative NAV terminal value (Cedar Bluff Industrial)
--   * 1 pre-exit with NOI/cap-rate terminal value (Sunbelt Logistics Park)
--
-- Targets high-teens / low-20s asset IRRs — believable, not flashy. The seed
-- is idempotent (ON CONFLICT DO NOTHING) and scopes to whichever business owns
-- a 'Granite Peak Value-Add Fund IV' fund row. If no such fund exists yet
-- (TS-driven seed not run), this file is a no-op.

DO $$
DECLARE
  v_fund_row      record;
  v_deal_id       uuid;
  v_asset1_id     uuid := '11111111-1111-4111-8111-000000000001'::uuid;
  v_asset2_id     uuid := '11111111-1111-4111-8111-000000000002'::uuid;
  v_asset3_id     uuid := '11111111-1111-4111-8111-000000000003'::uuid;
  v_env_id        text;
BEGIN
  FOR v_fund_row IN
    SELECT fund_id, business_id
    FROM repe_fund
    WHERE name = 'Granite Peak Value-Add Fund IV'
  LOOP
    -- Resolve env_id: pick whichever env_id already exists on this business's
    -- RE tables; default to 'demo' if none present.
    SELECT env_id INTO v_env_id
    FROM re_authoritative_asset_state_qtr
    WHERE business_id = v_fund_row.business_id
    LIMIT 1;
    IF v_env_id IS NULL THEN
      v_env_id := 'demo';
    END IF;

    -- One operating deal wraps all three assets. Use fund_id as namespace for
    -- a deterministic deal UUID so reruns are idempotent.
    v_deal_id := ('11111111-1111-4111-8111-' || substring(replace(v_fund_row.fund_id::text, '-', ''), 1, 12))::uuid;

    INSERT INTO repe_deal (deal_id, fund_id, name, deal_type, stage)
    VALUES (v_deal_id, v_fund_row.fund_id, 'Granite Peak Value-Add Deals', 'equity', 'operating')
    ON CONFLICT (deal_id) DO NOTHING;

    -- ─── Asset 1: Granite Peak Crossing Apartments (realized exit)
    -- Acq Q1 2022 @ $25M; 8 quarters of operating net CF @ ~$420K; exit Q1 2024 @ $30.5M net.
    -- Target gross IRR: ~17-19% over a 2-year hold.
    INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis)
    VALUES (v_asset1_id, v_deal_id, 'property', 'Granite Peak Crossing Apartments',
            DATE '2022-02-15', 25000000)
    ON CONFLICT (asset_id) DO NOTHING;
    INSERT INTO repe_property_asset (asset_id, property_type, units, market, occupancy)
    VALUES (v_asset1_id, 'multifamily', 284, 'Atlanta, GA', 0.94)
    ON CONFLICT (asset_id) DO NOTHING;

    -- ─── Asset 2: Cedar Bluff Industrial (pre-exit, authoritative NAV)
    -- Acq Q2 2023 @ $18M; steady industrial NOI; NAV at 2026-Q1 = $22.5M.
    -- Target IRR: ~13-15% over a 3-year hold.
    INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis)
    VALUES (v_asset2_id, v_deal_id, 'property', 'Cedar Bluff Industrial',
            DATE '2023-05-10', 18000000)
    ON CONFLICT (asset_id) DO NOTHING;
    INSERT INTO repe_property_asset (asset_id, property_type, market, occupancy)
    VALUES (v_asset2_id, 'industrial', 'Charlotte, NC', 0.97)
    ON CONFLICT (asset_id) DO NOTHING;

    -- ─── Asset 3: Sunbelt Logistics Park (pre-exit, NOI/cap fallback)
    -- Acq Q4 2023 @ $32M at 6.5% entry cap; TTM NOI ~$2.87M at 2026-Q1;
    -- projected exit cap 6.75% → terminal ~$42.5M (mild cap compression
    -- + 3-4% NOI growth). Target IRR: ~17-20% over a 2.25-year hold.
    INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis)
    VALUES (v_asset3_id, v_deal_id, 'property', 'Sunbelt Logistics Park',
            DATE '2023-11-05', 32000000)
    ON CONFLICT (asset_id) DO NOTHING;
    INSERT INTO repe_property_asset (asset_id, property_type, market, occupancy)
    VALUES (v_asset3_id, 'industrial', 'Dallas-Fort Worth, TX', 0.95)
    ON CONFLICT (asset_id) DO NOTHING;

    -- ────────────────────────────────────────────────────────────────────
    -- Operating quarters for Asset 1 (Granite Peak Crossing Apartments).
    -- 8 quarters, net CF ≈ $420K/qtr after opex + debt service.
    -- ────────────────────────────────────────────────────────────────────
    INSERT INTO re_asset_operating_qtr (
      asset_id, quarter, revenue, other_income, opex, capex, debt_service, inputs_hash, source_type
    ) VALUES
      (v_asset1_id, '2022-Q2', 1350000, 25000,  450000, 40000,  480000, 'seed-granite-1-2022q2', 'seed'),
      (v_asset1_id, '2022-Q3', 1370000, 27000,  460000, 35000,  480000, 'seed-granite-1-2022q3', 'seed'),
      (v_asset1_id, '2022-Q4', 1400000, 28000,  470000, 30000,  480000, 'seed-granite-1-2022q4', 'seed'),
      (v_asset1_id, '2023-Q1', 1430000, 30000,  480000, 45000,  480000, 'seed-granite-1-2023q1', 'seed'),
      (v_asset1_id, '2023-Q2', 1460000, 32000,  490000, 25000,  480000, 'seed-granite-1-2023q2', 'seed'),
      (v_asset1_id, '2023-Q3', 1490000, 34000,  500000, 20000,  480000, 'seed-granite-1-2023q3', 'seed'),
      (v_asset1_id, '2023-Q4', 1510000, 35000,  505000, 30000,  480000, 'seed-granite-1-2023q4', 'seed'),
      (v_asset1_id, '2024-Q1', 1530000, 36000,  510000, 25000,  480000, 'seed-granite-1-2024q1', 'seed')
    ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

    INSERT INTO re_asset_exit_event (
      env_id, business_id, asset_id, status, exit_quarter, exit_date,
      gross_sale_price, selling_costs, debt_payoff, net_proceeds, notes
    ) VALUES (
      v_env_id, v_fund_row.business_id, v_asset1_id, 'realized', '2024-Q1', DATE '2024-02-28',
      31000000, 500000, 0, 30500000,
      'Realized exit at a 5.5% cap on trailing NOI — see fund IC memo.'
    ) ON CONFLICT (asset_id, revision_at) DO NOTHING;

    -- ────────────────────────────────────────────────────────────────────
    -- Operating quarters for Asset 2 (Cedar Bluff Industrial).
    -- Q3 2023 through Q1 2026: 11 quarters, net CF ≈ $290K/qtr.
    -- ────────────────────────────────────────────────────────────────────
    INSERT INTO re_asset_operating_qtr (
      asset_id, quarter, revenue, other_income, opex, capex, debt_service, inputs_hash, source_type
    ) VALUES
      (v_asset2_id, '2023-Q3',  780000,  8000,  195000, 25000,  275000, 'seed-granite-2-2023q3', 'seed'),
      (v_asset2_id, '2023-Q4',  790000,  8000,  198000, 20000,  275000, 'seed-granite-2-2023q4', 'seed'),
      (v_asset2_id, '2024-Q1',  800000,  8000,  200000, 30000,  275000, 'seed-granite-2-2024q1', 'seed'),
      (v_asset2_id, '2024-Q2',  810000,  8500,  202000, 20000,  275000, 'seed-granite-2-2024q2', 'seed'),
      (v_asset2_id, '2024-Q3',  820000,  9000,  205000, 25000,  275000, 'seed-granite-2-2024q3', 'seed'),
      (v_asset2_id, '2024-Q4',  835000,  9000,  208000, 30000,  275000, 'seed-granite-2-2024q4', 'seed'),
      (v_asset2_id, '2025-Q1',  845000,  9500,  210000, 25000,  275000, 'seed-granite-2-2025q1', 'seed'),
      (v_asset2_id, '2025-Q2',  860000, 10000,  213000, 20000,  275000, 'seed-granite-2-2025q2', 'seed'),
      (v_asset2_id, '2025-Q3',  870000, 10000,  215000, 25000,  275000, 'seed-granite-2-2025q3', 'seed'),
      (v_asset2_id, '2025-Q4',  880000, 10500,  217000, 30000,  275000, 'seed-granite-2-2025q4', 'seed'),
      (v_asset2_id, '2026-Q1',  890000, 11000,  220000, 25000,  275000, 'seed-granite-2-2026q1', 'seed')
    ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

    -- Authoritative NAV terminal value for Asset 2 at 2026-Q1 ≈ $22.5M. Write
    -- it as a released authoritative_asset_state_qtr snapshot so the engine
    -- finds it on the top-priority lookup.
    IF NOT EXISTS (
      SELECT 1 FROM re_authoritative_snapshot_run
      WHERE snapshot_version = 'granite-peak-seed-v1'
    ) THEN
      INSERT INTO re_authoritative_snapshot_run (
        snapshot_version, env_id, business_id, methodology_version,
        run_status, created_by, released_at, released_by
      ) VALUES (
        'granite-peak-seed-v1', v_env_id, v_fund_row.business_id,
        'granite_peak_bottom_up_seed_v1', 'released', 'seed_bottom_up',
        now(), 'seed_bottom_up'
      );
    END IF;

    INSERT INTO re_authoritative_asset_state_qtr (
      audit_run_id, snapshot_version, promotion_state,
      env_id, business_id, fund_id, investment_id, asset_id, quarter,
      period_start, period_end, trust_status, canonical_metrics,
      null_reasons, formulas, provenance, inputs_hash
    )
    SELECT
      r.audit_run_id, 'granite-peak-seed-v1', 'released',
      v_env_id, v_fund_row.business_id, v_fund_row.fund_id, v_deal_id,
      v_asset2_id, '2026-Q1',
      DATE '2026-01-01', DATE '2026-03-31', 'trusted',
      jsonb_build_object('nav', 22500000, 'asset_value', 22500000),
      '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
      'seed-granite-2-nav-2026q1'
    FROM re_authoritative_snapshot_run r
    WHERE r.snapshot_version = 'granite-peak-seed-v1'
    ON CONFLICT (audit_run_id, asset_id, quarter) DO NOTHING;

    -- ────────────────────────────────────────────────────────────────────
    -- Operating quarters for Asset 3 (Sunbelt Logistics Park).
    -- Q1 2024 through Q1 2026: 9 quarters, net CF ≈ $550K/qtr.
    -- Exit event present but with status 'projected' (not realized) and
    -- exit_quarter in the future — so the engine falls back to NOI/cap.
    -- ────────────────────────────────────────────────────────────────────
    -- Operating quarters tuned so TTM NOI at 2026-Q1 ≈ $2.87M and terminal
    -- value at 6.75% cap ≈ $42.5M. This is believable for a Class-A industrial
    -- park bought at 6.5% entry cap with modest NOI growth.
    INSERT INTO re_asset_operating_qtr (
      asset_id, quarter, revenue, other_income, opex, capex, debt_service, inputs_hash, source_type
    ) VALUES
      (v_asset3_id, '2024-Q1', 1080000, 15000,  340000, 60000,  540000, 'seed-granite-3-2024q1', 'seed'),
      (v_asset3_id, '2024-Q2', 1090000, 15000,  343000, 40000,  540000, 'seed-granite-3-2024q2', 'seed'),
      (v_asset3_id, '2024-Q3', 1100000, 16000,  345000, 40000,  540000, 'seed-granite-3-2024q3', 'seed'),
      (v_asset3_id, '2024-Q4', 1110000, 16000,  348000, 50000,  540000, 'seed-granite-3-2024q4', 'seed'),
      (v_asset3_id, '2025-Q1', 1120000, 17000,  350000, 40000,  540000, 'seed-granite-3-2025q1', 'seed'),
      (v_asset3_id, '2025-Q2', 1130000, 17000,  353000, 35000,  540000, 'seed-granite-3-2025q2', 'seed'),
      (v_asset3_id, '2025-Q3', 1140000, 18000,  355000, 40000,  540000, 'seed-granite-3-2025q3', 'seed'),
      (v_asset3_id, '2025-Q4', 1150000, 18000,  358000, 45000,  540000, 'seed-granite-3-2025q4', 'seed'),
      (v_asset3_id, '2026-Q1', 1160000, 19000,  360000, 40000,  540000, 'seed-granite-3-2026q1', 'seed')
    ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

    INSERT INTO re_asset_exit_event (
      env_id, business_id, asset_id, status, exit_quarter, exit_date,
      gross_sale_price, selling_costs, debt_payoff, net_proceeds, projected_cap_rate, notes
    ) VALUES (
      v_env_id, v_fund_row.business_id, v_asset3_id, 'projected', '2027-Q1', DATE '2027-02-28',
      42500000, 850000, 0, 41650000, 0.0675,
      'Projected exit at 6.75% cap on TTM NOI; asset still in hold at 2026-Q1.'
    ) ON CONFLICT (asset_id, revision_at) DO NOTHING;

  END LOOP;
END $$;
