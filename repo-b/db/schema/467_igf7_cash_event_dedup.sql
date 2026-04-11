-- 467_igf7_cash_event_dedup.sql
-- Phase 1: Remove 16 duplicate re_cash_event rows for Institutional Growth Fund VII.
--
-- ROOT CAUSE:
--   The 456_meridian_three_fund_seed.sql seed was run 3 times on 2026-02-27:
--     - 16:57:03  First run inserted pre-2026 events (these were deduplicated by migration 433)
--     - 16:58:13  First run with 2026 Q1/Q2 events (CORRECT — originals to keep)
--     - 20:08:19  Seed re-run — 2026 events re-inserted without idempotency guard (DUPLICATE)
--     - 20:10:39  Seed re-run again — 2026 events inserted a third time (DUPLICATE)
--
-- DUPLICATED EVENTS (8 events, each with 2 extra copies = 16 duplicate rows):
--   2026-01-15  CALL     $25,000,000.00   (3 rows → keep earliest, delete 2)
--   2026-01-15  FEE         $93,750.00    (3 rows → keep earliest, delete 2)
--   2026-03-31  DIST     $1,500,000.00    (3 rows → keep earliest, delete 2)
--   2026-03-31  EXPENSE     $45,000.00    (3 rows → keep earliest, delete 2)
--   2026-04-15  CALL    $10,000,000.00    (3 rows → keep earliest, delete 2)
--   2026-04-15  FEE         $93,750.00    (3 rows → keep earliest, delete 2)
--   2026-06-30  DIST     $2,000,000.00    (3 rows → keep earliest, delete 2)
--   2026-06-30  EXPENSE     $52,000.00    (3 rows → keep earliest, delete 2)
--
-- METRIC CONTAMINATION (confirmed):
--   Excess CALL:    +$70,000,000   → paid_in_capital, IRR, DPI, TVPI all inflated
--   Excess DIST:    +$7,000,000    → DPI slightly overstated
--   Excess FEE:     +$375,000      → net_irr and net_tvpi slightly degraded
--   Excess EXPENSE: +$194,000      → net metrics slightly degraded
--
-- IDEMPOTENT: DELETE uses CTE with row_number(); if duplicates are already removed,
--   the CTE finds no rows with row_num > 1 and deletes nothing.
--
-- PATTERN: mirrors migration 433_meridian_ledger_dedup.sql.

DO $$
DECLARE
  v_igf7_id     uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
  v_deleted_cnt int;
  v_remaining   int;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════
  -- I. Early exit if no duplicates present (idempotency)
  -- ═══════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM re_cash_event
    WHERE fund_id    = v_igf7_id
      AND event_type IN ('CALL','DIST','FEE','EXPENSE')
    GROUP BY fund_id, event_date, event_type, amount, coalesce(investment_id::text, '')
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '467: No duplicate cash events found for IGF VII — already deduplicated, nothing to do.';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- II. Delete duplicate rows (keep earliest by created_at per logical key)
  -- ═══════════════════════════════════════════════════════════════════════
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY fund_id, event_date, event_type, amount, coalesce(investment_id::text, '')
        ORDER BY created_at ASC
      ) AS rn
    FROM re_cash_event
    WHERE fund_id    = v_igf7_id
      AND event_type IN ('CALL','DIST','FEE','EXPENSE')
  ),
  to_delete AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  DELETE FROM re_cash_event
  WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS v_deleted_cnt = ROW_COUNT;
  RAISE NOTICE '467: Deleted % duplicate re_cash_event rows for IGF VII.', v_deleted_cnt;

  -- ═══════════════════════════════════════════════════════════════════════
  -- III. Post-migration assertions
  -- ═══════════════════════════════════════════════════════════════════════

  -- No remaining duplicates
  IF EXISTS (
    SELECT 1 FROM re_cash_event
    WHERE fund_id    = v_igf7_id
      AND event_type IN ('CALL','DIST','FEE','EXPENSE')
    GROUP BY fund_id, event_date, event_type, amount, coalesce(investment_id::text, '')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '467: POST-CHECK FAILED — duplicate cash events still exist for IGF VII';
  END IF;

  -- Row count should be reasonable (Phase 1 baseline: 11 CALL + 13 DIST + 16 FEE + 5 EXPENSE = 45 unique rows)
  SELECT count(*) INTO v_remaining
  FROM re_cash_event
  WHERE fund_id    = v_igf7_id
    AND event_type IN ('CALL','DIST','FEE','EXPENSE');

  RAISE NOTICE '467: Post-dedup IGF VII CALL/DIST/FEE/EXPENSE row count: % (expected ~45)', v_remaining;

  IF v_remaining > 50 THEN
    RAISE EXCEPTION '467: POST-CHECK FAILED — IGF VII still has % CALL/DIST/FEE/EXPENSE rows (expected ~45)', v_remaining;
  END IF;

  RAISE NOTICE '467: All post-migration assertions passed. IGF VII cash event dedup complete.';

END $$;
