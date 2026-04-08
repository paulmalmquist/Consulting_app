-- 454_investment_quarter_state_complete.sql
--
-- Purpose: Ensure every investment (repe_deal) has quarterly state rows by
-- aggregating from child re_asset_quarter_state rows.
--
-- This covers Atlas, Summit, and Granite Peak fund families that were missing
-- investment-level quarterly data (359 only covered IGF-VII, 425 only Meridian).
--
-- Depends on: 270 (schema), 452 (new columns), 453 (asset states through 2026Q4)
-- Idempotent: ON CONFLICT DO UPDATE throughout.

DO $$
DECLARE
  v_quarters text[] := ARRAY[
    '2024Q3','2024Q4','2025Q1','2025Q2','2025Q3','2025Q4',
    '2026Q1','2026Q2','2026Q3','2026Q4'
  ];
  v_q text;
  v_run_id uuid := '00000000-feed-feed-feed-000000000003';
  r RECORD;
  v_total_nav numeric;
  v_total_noi numeric;
  v_total_revenue numeric;
  v_total_opex numeric;
  v_total_debt_service numeric;
  v_total_debt_balance numeric;
  v_total_asset_value numeric;
  v_total_cash numeric;
  v_weighted_occ_sum numeric;
  v_weighted_occ_weight numeric;
  v_occupancy numeric;
  v_committed numeric;
  v_invested numeric;
  v_realized numeric;
  v_equity_multiple numeric;
  v_asset_count int;
  v_deal_count int := 0;
  v_row_count int := 0;
BEGIN
  -- Loop through every deal × every quarter
  FOR r IN
    SELECT d.deal_id, d.name AS deal_name, d.committed_capital, d.invested_capital,
           d.realized_distributions, f.name AS fund_name
    FROM repe_deal d
    JOIN repe_fund f ON f.fund_id = d.fund_id
    ORDER BY f.name, d.name
  LOOP
    v_deal_count := v_deal_count + 1;

    FOREACH v_q IN ARRAY v_quarters LOOP
      -- Aggregate from child assets
      SELECT
        COALESCE(SUM(qs.nav), NULL),
        COALESCE(SUM(qs.noi), NULL),
        COALESCE(SUM(qs.revenue), NULL),
        COALESCE(SUM(qs.opex), NULL),
        COALESCE(SUM(qs.debt_service), NULL),
        COALESCE(SUM(qs.debt_balance), NULL),
        COALESCE(SUM(qs.asset_value), NULL),
        COALESCE(SUM(qs.cash_balance), NULL),
        SUM(qs.occupancy * qs.asset_value),
        SUM(CASE WHEN qs.occupancy IS NOT NULL THEN qs.asset_value ELSE 0 END),
        COUNT(*)
      INTO
        v_total_nav, v_total_noi, v_total_revenue, v_total_opex,
        v_total_debt_service, v_total_debt_balance, v_total_asset_value,
        v_total_cash, v_weighted_occ_sum, v_weighted_occ_weight, v_asset_count
      FROM re_asset_quarter_state qs
      JOIN repe_asset a ON a.asset_id = qs.asset_id
      WHERE a.deal_id = r.deal_id
        AND qs.quarter = v_q
        AND qs.scenario_id IS NULL;

      -- Skip if no asset data for this quarter
      IF v_asset_count = 0 OR v_total_nav IS NULL THEN
        CONTINUE;
      END IF;

      -- Weighted occupancy
      v_occupancy := CASE WHEN v_weighted_occ_weight > 0
        THEN ROUND(v_weighted_occ_sum / v_weighted_occ_weight, 4)
        ELSE NULL END;

      -- Capital metrics from deal record
      v_committed := COALESCE(r.committed_capital, 0);
      v_invested  := COALESCE(r.invested_capital, 0);
      v_realized  := COALESCE(r.realized_distributions, 0);
      v_equity_multiple := CASE WHEN v_invested > 0
        THEN ROUND((v_realized + v_total_nav) / v_invested, 4)
        ELSE NULL END;

      INSERT INTO re_investment_quarter_state (
        id, investment_id, quarter, scenario_id, run_id,
        nav, committed_capital, invested_capital,
        realized_distributions, unrealized_value,
        gross_asset_value, debt_balance, cash_balance,
        equity_multiple,
        noi, revenue, opex, occupancy, debt_service, asset_value,
        data_status, source, version,
        inputs_hash
      ) VALUES (
        gen_random_uuid(),
        r.deal_id, v_q, NULL, v_run_id,
        v_total_nav, v_committed, v_invested,
        v_realized, v_total_nav,
        v_total_asset_value, v_total_debt_balance, v_total_cash,
        v_equity_multiple,
        v_total_noi, v_total_revenue, v_total_opex, v_occupancy, v_total_debt_service, v_total_asset_value,
        'seed', 'seed', 1,
        md5('seed-454-' || r.deal_id || '-' || v_q)
      )
      ON CONFLICT (investment_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
      DO UPDATE SET
        nav = EXCLUDED.nav,
        committed_capital = EXCLUDED.committed_capital,
        invested_capital = EXCLUDED.invested_capital,
        realized_distributions = EXCLUDED.realized_distributions,
        unrealized_value = EXCLUDED.unrealized_value,
        gross_asset_value = EXCLUDED.gross_asset_value,
        debt_balance = EXCLUDED.debt_balance,
        cash_balance = EXCLUDED.cash_balance,
        equity_multiple = EXCLUDED.equity_multiple,
        noi = EXCLUDED.noi,
        revenue = EXCLUDED.revenue,
        opex = EXCLUDED.opex,
        occupancy = EXCLUDED.occupancy,
        debt_service = EXCLUDED.debt_service,
        asset_value = EXCLUDED.asset_value,
        data_status = EXCLUDED.data_status,
        source = EXCLUDED.source,
        inputs_hash = EXCLUDED.inputs_hash,
        run_id = EXCLUDED.run_id;

      v_row_count := v_row_count + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE '454: Seeded % investment quarter state rows across % deals.', v_row_count, v_deal_count;
END $$;
