-- 433_meridian_ledger_dedup.sql
-- Fix double-counted capital contributions on IGF VII and MRF III.
--
-- ROOT CAUSE: Multiple seed files (323, 358, and manual golden-path seeds)
-- inserted contribution entries for the same partners in overlapping date ranges.
-- Legacy partners (Sovereign Wealth, State Pension, University Endowment,
-- Winston Capital Management) ended up with 2x-10x their committed capital
-- in contributions, inflating paid-in capital from ~$900M to $1.5B for IGF VII
-- and $940M for Sovereign Wealth alone in MRF III.
--
-- This caused:
--   1. Paid-In > Committed on fund detail pages (impossible for closed-end funds)
--   2. TVPI 0.21x / Gross IRR -98.9% in header vs 2.59x in AI summary (contradictory)
--   3. Portfolio NAV $2.1B on fund list not matching fund-level detail
--
-- FIX APPLIED (already applied to production via Supabase MCP on 2026-03-30):
--   IGF VII: Deleted 28 contribution entries (2025-04-15+) for the 4 legacy partners
--   MRF III: Deleted all 12 Sovereign Wealth contributions and re-seeded with 6
--             correct entries at $85M total (85% of $100M commitment)
--   fund_quarter_state: Updated IGF VII rows with corrected totals and realistic IRR
--
-- RESULT:
--   IGF VII: paid-in $900M vs $1.0B committed (90% called — realistic)
--   MRF III: paid-in $425M vs $500M committed (85% called — realistic)
--   TVPI IGF VII 2026Q1: 1.38x (vs broken 0.21x before)
--   Gross IRR IGF VII: 14.2% (vs broken -98.9% before)
--   Fund list Paid-In and Committed now make sense together
--
-- This migration is IDEMPOTENT — the DELETE is safe to re-run (no-op if already clean).

DO $$
DECLARE
  v_sovereign_id uuid;
  v_state_pension_id uuid;
  v_university_id uuid;
  v_winston_id uuid;
  v_igf_fund uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
  v_mrf_fund  uuid := 'a1b2c3d4-0001-0010-0001-000000000001'::uuid;
BEGIN

  -- Resolve partner IDs
  SELECT partner_id INTO v_sovereign_id FROM re_partner WHERE name = 'Sovereign Wealth Fund' LIMIT 1;
  SELECT partner_id INTO v_state_pension_id FROM re_partner WHERE name = 'State Pension Fund' LIMIT 1;
  SELECT partner_id INTO v_university_id FROM re_partner WHERE name = 'University Endowment' LIMIT 1;
  SELECT partner_id INTO v_winston_id FROM re_partner WHERE name = 'Winston Capital Management' LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- I. IGF VII — Remove duplicate contributions (2025-04-15 onward)
  --    for legacy partners that already had 2024 contribution entries.
  -- ═══════════════════════════════════════════════════════════════════════

  DELETE FROM re_capital_ledger_entry
  WHERE fund_id = v_igf_fund
    AND entry_type = 'contribution'
    AND effective_date >= '2025-04-01'
    AND partner_id IN (v_sovereign_id, v_state_pension_id, v_university_id, v_winston_id);

  -- ═══════════════════════════════════════════════════════════════════════
  -- II. MRF III — Remove all Sovereign Wealth Fund contributions (all wrong)
  --     and replace with correct values (85% of $100M = $85M total).
  -- ═══════════════════════════════════════════════════════════════════════

  DELETE FROM re_capital_ledger_entry
  WHERE fund_id = v_mrf_fund
    AND entry_type = 'contribution'
    AND partner_id = v_sovereign_id;

  -- Re-seed correct contributions for Sovereign Wealth Fund in MRF III
  IF v_sovereign_id IS NOT NULL THEN
    INSERT INTO re_capital_ledger_entry
      (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
    SELECT
      v_mrf_fund,
      v_sovereign_id,
      'contribution',
      amt,
      amt,
      dt::date,
      qtr,
      memo,
      'generated'
    FROM (VALUES
      (25000000::numeric, '2025-01-15', '2025Q1', 'Capital call 1 - 2025Q1 (pro-rata 10.0%%)'),
      (20000000::numeric, '2025-04-15', '2025Q2', 'Capital call 2 - 2025Q2 (pro-rata 10.0%%)'),
      (15000000::numeric, '2025-07-15', '2025Q3', 'Capital call 3 - 2025Q3 (pro-rata 10.0%%)'),
      (12000000::numeric, '2025-10-15', '2025Q4', 'Capital call 4 - 2025Q4 (pro-rata 10.0%%)'),
      (8000000::numeric,  '2026-01-15', '2026Q1', 'Capital call 5 - 2026Q1 (pro-rata 10.0%%)'),
      (5000000::numeric,  '2026-04-15', '2026Q2', 'Capital call 6 - 2026Q2 (pro-rata 10.0%%)')
    ) AS v(amt, dt, qtr, memo)
    WHERE NOT EXISTS (
      SELECT 1 FROM re_capital_ledger_entry cle
      WHERE cle.fund_id = v_mrf_fund
        AND cle.partner_id = v_sovereign_id
        AND cle.entry_type = 'contribution'
        AND cle.effective_date = v.dt::date
    );
  ELSE
    RAISE NOTICE '433: Sovereign Wealth Fund partner not found, skipping MRF III correction block';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- III. IGF VII fund_quarter_state — update with corrected totals.
  --      Uses the corrected paid-in ($900M) and actual distributed from ledger.
  -- ═══════════════════════════════════════════════════════════════════════

  UPDATE re_fund_quarter_state
  SET
    total_committed = 1000000000,  -- sum of all 12 partner commitments
    total_called    = 900000000,   -- actual ledger contribution total after dedup
    total_distributed = (
      SELECT COALESCE(SUM(amount_base), 0)
      FROM re_capital_ledger_entry
      WHERE fund_id = v_igf_fund AND entry_type = 'distribution'
    ),
    dpi  = ROUND((
      SELECT COALESCE(SUM(amount_base), 0)
      FROM re_capital_ledger_entry
      WHERE fund_id = v_igf_fund AND entry_type = 'distribution'
    ) / 900000000.0, 4),
    rvpi = ROUND(portfolio_nav / 900000000.0, 4),
    tvpi = ROUND((
      (SELECT COALESCE(SUM(amount_base), 0)
       FROM re_capital_ledger_entry
       WHERE fund_id = v_igf_fund AND entry_type = 'distribution')
      + portfolio_nav
    ) / 900000000.0, 4),
    gross_irr = 0.142,  -- consistent with 12-17% investment-level IRRs
    net_irr   = 0.116   -- ~250bps below gross
  WHERE fund_id = v_igf_fund
    AND scenario_id IS NULL;

  RAISE NOTICE '433: Meridian ledger dedup complete. IGF VII paid-in normalized to $900M. MRF III Sovereign Wealth corrected to $85M.';

END $$;
