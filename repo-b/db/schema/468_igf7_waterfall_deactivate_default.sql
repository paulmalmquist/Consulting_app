-- 468_igf7_waterfall_deactivate_default.sql
-- Phase B2 (revised): deactivate the orphaned "Default" waterfall definition
-- on IGF VII so run_waterfall deterministically picks the correct definition.
--
-- FINDING (2026-04-20 B1 forensic):
--   IGF VII (a1b2c3d4-0003-0030-0001-000000000001) has TWO is_active=true waterfall
--   definitions in re_waterfall_definition:
--     • "IGF VII Standard Waterfall" (european, definition_id ends in ...000099)
--         — fully populated: tier 1 100/0 LP/GP, tier 2 100/0 + 8% hurdle,
--         tier 3 0/100 catch-up, tier 4 80/20 split. Correct.
--     • "Default" (american, definition_id ends in ...a496cfa98ec8)
--         — tier 1-3 have NULL split_lp / split_gp. Broken.
--   Both have version = 1. run_waterfall at services/re_waterfall_runtime.py:46-53
--   picks "WHERE is_active = true ORDER BY version DESC LIMIT 1" — the tie is
--   resolved by DB internal row order (non-deterministic). With two active rows
--   and no reliable tiebreaker, execution is undefined.
--
-- FIX:
--   Set is_active = false on the "Default" definition so run_waterfall
--   unambiguously selects "IGF VII Standard Waterfall". The original plan's
--   migration 468 (populate NULL splits on "Default") is obsoleted — no tier
--   repair is needed because the correct definition already exists.
--
-- IDEMPOTENT: The WHERE clause restricts to rows that are still active AND
-- still named "Default". Re-running is a no-op once "Default" is inactive.
--
-- SAFETY: The migration does NOT delete the "Default" row or its tiers. It
-- only sets is_active = false so waterfall runs exclude it. If investigation
-- later determines "Default" should be restored, simply flip the flag back.

DO $$
DECLARE
  v_igf7_fund_id  uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
  v_rows_updated  int;
BEGIN
  UPDATE re_waterfall_definition
  SET is_active = false
  WHERE fund_id = v_igf7_fund_id
    AND name = 'Default'
    AND is_active = true;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RAISE NOTICE 'Deactivated % "Default" waterfall definition(s) for IGF VII (a1b2c3d4-0003-0030-0001-000000000001).', v_rows_updated;

  -- Sanity check: verify exactly one active definition remains.
  DECLARE v_active_count int;
  BEGIN
    SELECT COUNT(*) INTO v_active_count
    FROM re_waterfall_definition
    WHERE fund_id = v_igf7_fund_id AND is_active = true;

    IF v_active_count <> 1 THEN
      RAISE NOTICE 'WARNING: expected exactly 1 active waterfall for IGF VII post-migration; found %.', v_active_count;
    ELSE
      RAISE NOTICE 'Confirmed: 1 active waterfall definition remains for IGF VII.';
    END IF;
  END;
END $$;
