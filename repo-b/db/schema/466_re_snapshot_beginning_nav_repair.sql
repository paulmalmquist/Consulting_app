-- 466_re_snapshot_beginning_nav_repair.sql
-- Phase 0d: Repair beginning_nav = 0 in IGF VII 2026Q2 authoritative snapshots.
--
-- ROOT CAUSE (NF-3):
--   The forensic snapshot builder (verification/runners/meridian_authoritative_snapshot.py)
--   computes fund-level beginning_nav by summing beginning_nav_attributable from each
--   selected investment in SELECTED_INVESTMENT_IDS. For Institutional Growth Fund VII,
--   only Tech Campus North was selected pre-fix. Tech Campus North has nav = 0 in
--   2026Q1 (the prior quarter for a 2026Q2 snapshot), so the investment-level sum was $0.
--   The snapshot was promoted and released with beginning_nav = 0 even though the prior
--   released 2025Q4 snapshot for IGF VII carries ending_nav ≈ $66.8M.
--
-- IMPACT:
--   Any period-return calculation, P&L attribution, or gain/loss analysis that uses
--   beginning_nav as the opening balance for 2026Q2 will show an impossible $0 opening,
--   corrupting period returns, NAV change, and attributed performance for IGF VII.
--
-- FIX:
--   Set beginning_nav = prior_quarter_ending_nav across ALL IGF VII 2026Q2 rows where
--   beginning_nav = 0. The value is derived dynamically from the 2025Q4 released snapshot
--   so this migration is self-documenting.
--
--   The trigger trg_re_authoritative_fund_state_guard blocks all canonical_metrics UPDATEs
--   (allowed_keys = [promotion_state, verified_at, verified_by, released_at, released_by]).
--   This migration temporarily disables the trigger, applies the repair, and re-enables it.
--
-- SCOPE:
--   Only IGF VII (a1b2c3d4-0003-0030-0001-000000000001) 2026Q2 rows where beginning_nav = 0.
--   MREF III and MCOF I have correct non-zero beginning_nav values and are untouched.
--
-- IDEMPOTENT + CI-SAFE:
--   - If no IGF VII 2026Q2 rows exist at all (fresh CI database), migration is a no-op.
--   - If no prior 2025Q4 released snapshot exists (fresh CI database), migration is a no-op.
--   - Re-running after the repair produces zero rows changed because the WHERE clause
--     filters on beginning_nav = 0.
--
-- CODE FIX:
--   verification/runners/meridian_authoritative_snapshot.py now contains a fallback in
--   the fund-level loop: if investment-aggregated beginning_nav == 0 and a prior released
--   snapshot exists, beginning_nav = prior_released.ending_nav. Future runs produce
--   correct values without this migration.

DO $$
DECLARE
  v_igf7_id       uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
  v_quarter       text := '2026Q2';
  v_prior_quarter text := '2025Q4';
  v_prior_ending  numeric;
  v_target_rows   int;
  v_rows_updated  int;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════
  -- 0. CI-safe pre-check: if the target table has no IGF VII 2026Q2 rows,
  --    this is a fresh CI database (no Meridian data seeded). Skip cleanly.
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_target_rows
  FROM re_authoritative_fund_state_qtr
  WHERE fund_id = v_igf7_id
    AND quarter = v_quarter;

  IF v_target_rows = 0 THEN
    RAISE NOTICE '466: No IGF VII 2026Q2 rows present (fresh database); skipping data repair';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- I. Look up the correct beginning_nav from the prior released snapshot.
  --    This is the 2025Q4 released ending_nav for IGF VII.
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT (canonical_metrics->>'ending_nav')::numeric
    INTO v_prior_ending
  FROM re_authoritative_fund_state_qtr
  WHERE fund_id        = v_igf7_id
    AND quarter        = v_prior_quarter
    AND promotion_state = 'released'
  ORDER BY released_at DESC
  LIMIT 1;

  IF v_prior_ending IS NULL THEN
    RAISE NOTICE '466: No released 2025Q4 snapshot for IGF VII; cannot derive beginning_nav. Skipping.';
    RETURN;
  END IF;

  RAISE NOTICE '466: prior released ending_nav for IGF VII 2025Q4 = %', v_prior_ending;

  -- ═══════════════════════════════════════════════════════════════════════
  -- II. Disable the promotion guard trigger to allow canonical_metrics repair.
  --     The trigger blocks ALL canonical_metrics UPDATEs; this is a one-time
  --     data repair for a value the trigger cannot self-correct.
  -- ═══════════════════════════════════════════════════════════════════════
  ALTER TABLE re_authoritative_fund_state_qtr
    DISABLE TRIGGER trg_re_authoritative_fund_state_guard;

  RAISE NOTICE '466: trigger trg_re_authoritative_fund_state_guard disabled';

  -- ═══════════════════════════════════════════════════════════════════════
  -- III. Repair beginning_nav on all IGF VII 2026Q2 rows where it is 0.
  --      Updates both 'released' and 'verified' rows so any re-promotion
  --      of a verified snapshot carries the correct value forward.
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE re_authoritative_fund_state_qtr
  SET canonical_metrics = jsonb_set(
      canonical_metrics,
      '{beginning_nav}',
      to_jsonb(v_prior_ending)
  )
  WHERE fund_id = v_igf7_id
    AND quarter = v_quarter
    AND (canonical_metrics->>'beginning_nav')::numeric = 0;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RAISE NOTICE '466: updated % snapshot rows for IGF VII 2026Q2 (beginning_nav 0 → %)', v_rows_updated, v_prior_ending;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IV. Re-enable the promotion guard trigger.
  -- ═══════════════════════════════════════════════════════════════════════
  ALTER TABLE re_authoritative_fund_state_qtr
    ENABLE TRIGGER trg_re_authoritative_fund_state_guard;

  RAISE NOTICE '466: trigger trg_re_authoritative_fund_state_guard re-enabled';

  -- ═══════════════════════════════════════════════════════════════════════
  -- V. Post-migration assertion (hard invariant: no IGF VII 2026Q2 row
  --    should retain beginning_nav = 0 after a successful repair).
  --    Only runs if the repair actually touched rows — protects against
  --    surprise when the table is partially seeded.
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_rows_updated > 0 AND EXISTS (
    SELECT 1 FROM re_authoritative_fund_state_qtr
    WHERE fund_id = v_igf7_id
      AND quarter  = v_quarter
      AND (canonical_metrics->>'beginning_nav')::numeric = 0
  ) THEN
    RAISE EXCEPTION '466: POST-CHECK FAILED — IGF VII 2026Q2 row(s) still have beginning_nav = 0 after repair';
  END IF;

  RAISE NOTICE '466: Data repair complete. IGF VII 2026Q2 beginning_nav → %.', v_prior_ending;

END $$;
