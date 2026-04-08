-- 455_fund_quarter_state_from_actuals.sql
--
-- Purpose: Re-derive fund quarter states from actual asset/investment data.
-- Replaces formula-based IRR, synthetic NAV, and fabricated capital draws from
-- seeds 441 and 359 with values computed from actual ledger entries and asset rollups.
--
-- Principles:
--   - NULL beats fabrication: if no asset data, NAV = NULL (not formula)
--   - IRR from cash flows only: use xirr_from_fund_ledger() or NULL
--   - DSCR/LTV from assets: if no assets for this quarter, NULL (not placeholder)
--   - data_status and irr_source columns track provenance
--
-- Depends on: 442 (xirr function), 452 (contract columns), 453/454 (asset/investment data)
-- Idempotent: ON CONFLICT DO UPDATE throughout.

DO $$
DECLARE
  v_quarters text[] := ARRAY[
    '2024Q3','2024Q4','2025Q1','2025Q2','2025Q3','2025Q4',
    '2026Q1','2026Q2','2026Q3','2026Q4'
  ];
  v_q text;
  v_fund RECORD;
  v_run_id uuid := '00000000-feed-feed-feed-000000000004';
  v_fund_count int := 0;
  v_row_count int := 0;

  -- Computed values
  v_total_nav numeric;
  v_total_committed numeric;
  v_total_called numeric;
  v_total_distributed numeric;
  v_dpi numeric;
  v_rvpi numeric;
  v_tvpi numeric;
  v_weighted_ltv numeric;
  v_weighted_dscr numeric;
  v_gross_irr numeric;
  v_net_irr numeric;
  v_irr_source text;
  v_data_status text;
  v_has_assets int;
BEGIN

  FOR v_fund IN
    SELECT f.fund_id, f.business_id, f.name
    FROM repe_fund f
    ORDER BY f.name
  LOOP
    v_fund_count := v_fund_count + 1;

    FOREACH v_q IN ARRAY v_quarters LOOP

      -- ═══ NAV: SUM from asset quarter states (no fallback) ═══
      SELECT SUM(qs.nav), COUNT(*)
      INTO v_total_nav, v_has_assets
      FROM re_asset_quarter_state qs
      JOIN repe_asset a ON a.asset_id = qs.asset_id
      JOIN repe_deal d ON d.deal_id = a.deal_id
      WHERE d.fund_id = v_fund.fund_id
        AND qs.quarter = v_q
        AND qs.scenario_id IS NULL;

      -- If no asset data for this quarter, set NULL (not fabricated)
      IF NOT v_has_assets OR v_total_nav IS NULL THEN
        v_total_nav := NULL;
        v_data_status := 'missing_source';
      ELSE
        v_data_status := 'seed';
      END IF;

      -- ═══ Committed: from partner commitments (NULL if none) ═══
      SELECT SUM(pc.committed_amount)
      INTO v_total_committed
      FROM re_partner_commitment pc
      WHERE pc.fund_id = v_fund.fund_id;
      -- No fallback to $200M. NULL if no commitments seeded.

      -- ═══ Called: from capital ledger (NULL if none) ═══
      SELECT SUM(cle.amount)
      INTO v_total_called
      FROM re_capital_ledger_entry cle
      WHERE cle.fund_id = v_fund.fund_id
        AND cle.entry_type = 'contribution'
        AND cle.quarter <= v_q;
      -- No fallback ramp formula.

      -- ═══ Distributed: from capital ledger (NULL if none) ═══
      SELECT SUM(cle.amount)
      INTO v_total_distributed
      FROM re_capital_ledger_entry cle
      WHERE cle.fund_id = v_fund.fund_id
        AND cle.entry_type = 'distribution'
        AND cle.quarter <= v_q;
      -- No fallback distribution ramp.

      -- ═══ Ratios: only if denominators exist ═══
      IF v_total_called IS NOT NULL AND v_total_called > 0 THEN
        v_dpi  := ROUND(COALESCE(v_total_distributed, 0) / v_total_called, 4);
        v_rvpi := CASE WHEN v_total_nav IS NOT NULL
          THEN ROUND(v_total_nav / v_total_called, 4)
          ELSE NULL END;
        v_tvpi := CASE WHEN v_total_nav IS NOT NULL
          THEN ROUND((COALESCE(v_total_distributed, 0) + v_total_nav) / v_total_called, 4)
          ELSE NULL END;
      ELSE
        v_dpi := NULL; v_rvpi := NULL; v_tvpi := NULL;
      END IF;

      -- ═══ Weighted LTV / DSCR from assets (NULL if no assets) ═══
      SELECT
        SUM(qs.ltv * qs.asset_value) / NULLIF(SUM(qs.asset_value), 0),
        SUM(qs.dscr * qs.asset_value) / NULLIF(SUM(qs.asset_value), 0)
      INTO v_weighted_ltv, v_weighted_dscr
      FROM re_asset_quarter_state qs
      JOIN repe_asset a ON a.asset_id = qs.asset_id
      JOIN repe_deal d ON d.deal_id = a.deal_id
      WHERE d.fund_id = v_fund.fund_id
        AND qs.quarter = v_q
        AND qs.scenario_id IS NULL;
      -- No placeholder values. NULL if no assets.

      -- ═══ IRR: from xirr function if cash flows exist, else NULL ═══
      v_gross_irr := NULL;
      v_net_irr := NULL;
      v_irr_source := 'not_available';

      -- Try xirr_from_fund_ledger if the function exists and fund has ledger entries
      IF EXISTS (SELECT 1 FROM re_capital_ledger_entry WHERE fund_id = v_fund.fund_id LIMIT 1) THEN
        BEGIN
          SELECT gross_irr, net_irr
          INTO v_gross_irr, v_net_irr
          FROM xirr_from_fund_ledger(v_fund.fund_id, v_q);
          IF v_gross_irr IS NOT NULL THEN
            v_irr_source := 'computed_xirr';
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- xirr function may not exist or may fail; leave as NULL
          v_gross_irr := NULL;
          v_net_irr := NULL;
          v_irr_source := 'not_available';
        END;
      END IF;

      -- Only insert if we have SOME data (either NAV or capital activity)
      IF v_total_nav IS NOT NULL OR v_total_called IS NOT NULL THEN
        INSERT INTO re_fund_quarter_state (
          id, fund_id, quarter, scenario_id, run_id,
          portfolio_nav, total_committed, total_called, total_distributed,
          dpi, rvpi, tvpi,
          gross_irr, net_irr,
          weighted_ltv, weighted_dscr,
          data_status, irr_source, source, version,
          inputs_hash, created_at
        ) VALUES (
          gen_random_uuid(),
          v_fund.fund_id, v_q, NULL, v_run_id,
          v_total_nav, v_total_committed, v_total_called, v_total_distributed,
          v_dpi, v_rvpi, v_tvpi,
          v_gross_irr, v_net_irr,
          v_weighted_ltv, v_weighted_dscr,
          v_data_status, v_irr_source, 'seed', 1,
          md5('seed-455-' || v_fund.fund_id || '-' || v_q), now()
        )
        ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
          portfolio_nav = EXCLUDED.portfolio_nav,
          total_committed = EXCLUDED.total_committed,
          total_called = EXCLUDED.total_called,
          total_distributed = EXCLUDED.total_distributed,
          dpi = EXCLUDED.dpi,
          rvpi = EXCLUDED.rvpi,
          tvpi = EXCLUDED.tvpi,
          gross_irr = EXCLUDED.gross_irr,
          net_irr = EXCLUDED.net_irr,
          weighted_ltv = EXCLUDED.weighted_ltv,
          weighted_dscr = EXCLUDED.weighted_dscr,
          data_status = EXCLUDED.data_status,
          irr_source = EXCLUDED.irr_source,
          source = EXCLUDED.source,
          inputs_hash = EXCLUDED.inputs_hash,
          run_id = EXCLUDED.run_id;

        v_row_count := v_row_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '455: Re-derived % fund quarter state rows across % funds (no fallback math).', v_row_count, v_fund_count;
END $$;
