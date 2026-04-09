-- 457_fix_capital_ledger_dedup.sql
--
-- Fixes duplicate capital ledger entries where both "generated" and "manual"
-- source entries exist for the same fund. The duplicates inflate total_called
-- and total_distributed, causing defects like:
--   - Meridian Real Estate Fund III: pct_invested = 859% (should be ~96%)
--   - Institutional Growth Fund VII: inflated distribution totals
--
-- Strategy:
--   1. Delete "generated" entries for funds that also have "manual" entries
--   2. Recompute fund_quarter_state capital metrics from cleaned ledger
--
-- Affected funds (confirmed via Phase 0 audit):
--   - a1b2c3d4-0001-0010-0001-000000000001 (MREF-III): 62 contribution, 54 distribution dupes
--   - a1b2c3d4-0003-0030-0001-000000000001 (IGF-VII): 108 distribution dupes
--
-- Idempotent: DELETE WHERE source='generated' is safe to re-run.
-- Does NOT touch funds that only have "generated" entries (no "manual" counterpart).

DO $$
DECLARE
  v_deleted_count int;
  v_fund RECORD;
  v_q text;
  v_quarters text[] := ARRAY[
    '2024Q3','2024Q4','2025Q1','2025Q2','2025Q3',
    '2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'
  ];
  v_total_called numeric;
  v_total_distributed numeric;
  v_total_committed numeric;
  v_dpi numeric;
  v_rvpi numeric;
  v_tvpi numeric;
  v_nav numeric;
  v_updated int := 0;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 1: Delete "generated" ledger entries for funds that have both sources
  -- ═══════════════════════════════════════════════════════════════════════

  DELETE FROM re_capital_ledger_entry
  WHERE source = 'generated'
    AND fund_id IN (
      -- Only funds that have BOTH "generated" and "manual" entries
      SELECT fund_id
      FROM re_capital_ledger_entry
      GROUP BY fund_id
      HAVING COUNT(DISTINCT source) FILTER (WHERE source IN ('generated', 'manual')) = 2
    );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE '457: Deleted % duplicate "generated" capital ledger entries', v_deleted_count;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 2: Recompute fund_quarter_state capital metrics from cleaned ledger
  -- Only for funds that had duplicates (the ones we just cleaned)
  -- ═══════════════════════════════════════════════════════════════════════

  FOR v_fund IN
    SELECT DISTINCT f.fund_id, f.name
    FROM repe_fund f
    WHERE f.fund_id IN (
      'a1b2c3d4-0001-0010-0001-000000000001',  -- MREF-III
      'a1b2c3d4-0003-0030-0001-000000000001'   -- IGF-VII
    )
  LOOP
    FOREACH v_q IN ARRAY v_quarters LOOP

      -- Cumulative called through this quarter
      SELECT COALESCE(SUM(amount), 0)
      INTO v_total_called
      FROM re_capital_ledger_entry
      WHERE fund_id = v_fund.fund_id
        AND entry_type = 'contribution'
        AND quarter <= v_q;

      -- Cumulative distributed through this quarter
      SELECT COALESCE(SUM(amount), 0)
      INTO v_total_distributed
      FROM re_capital_ledger_entry
      WHERE fund_id = v_fund.fund_id
        AND entry_type = 'distribution'
        AND quarter <= v_q;

      -- Committed from partner commitments
      SELECT COALESCE(SUM(committed_amount), 0)
      INTO v_total_committed
      FROM re_partner_commitment
      WHERE fund_id = v_fund.fund_id;

      -- Get existing NAV for ratio computation
      SELECT portfolio_nav
      INTO v_nav
      FROM re_fund_quarter_state
      WHERE fund_id = v_fund.fund_id
        AND quarter = v_q
        AND scenario_id IS NULL
      ORDER BY created_at DESC
      LIMIT 1;

      -- Compute ratios
      IF v_total_called > 0 THEN
        v_dpi  := ROUND(v_total_distributed / v_total_called, 4);
        v_rvpi := CASE WHEN v_nav IS NOT NULL
          THEN ROUND(v_nav / v_total_called, 4)
          ELSE NULL END;
        v_tvpi := CASE WHEN v_nav IS NOT NULL
          THEN ROUND((v_total_distributed + v_nav) / v_total_called, 4)
          ELSE NULL END;
      ELSE
        v_dpi := NULL; v_rvpi := NULL; v_tvpi := NULL;
      END IF;

      -- Update the fund_quarter_state row if it exists
      UPDATE re_fund_quarter_state
      SET
        total_called = v_total_called,
        total_committed = v_total_committed,
        total_distributed = v_total_distributed,
        dpi = v_dpi,
        rvpi = v_rvpi,
        tvpi = v_tvpi,
        inputs_hash = 'fix:457:dedup:' || v_fund.fund_id || ':' || v_q
      WHERE fund_id = v_fund.fund_id
        AND quarter = v_q
        AND scenario_id IS NULL;

      IF FOUND THEN
        v_updated := v_updated + 1;
      END IF;

    END LOOP;
  END LOOP;

  RAISE NOTICE '457: Updated % fund_quarter_state rows with corrected capital metrics', v_updated;
END $$;
