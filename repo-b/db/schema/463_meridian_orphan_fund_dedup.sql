-- 463_meridian_orphan_fund_dedup.sql
-- Phase 0b: Quarantine orphan Meridian fund rows and repair active-row metadata.
--
-- ROOT CAUSE: A prior seed pass created two ghost fund rows with `d4560000-...`
-- UUIDs for MREF III and MCOF I. These orphan rows have entity graphs (deals/assets)
-- but zero cash events and zero authoritative snapshots. A subsequent seed created
-- the canonical `a1b2c3d4-...` rows that carry all economic data. The orphan rows
-- were never deleted and have accumulated stale re_fund_quarter_state entries that
-- contaminate any legacy NAV lookup joining across fund_id.
--
-- SPECIFIC CONTAMINATION:
--   d4560000-0003-0030-0004-000000000001  MREF III orphan  12 stale re_fund_quarter_state rows
--   d4560000-0003-0030-0005-000000000001  MCOF I orphan    10 stale re_fund_quarter_state rows
--   22 total stale rows feeding legacy rollups with phantom NAV values.
--
-- ACTIVE ROW METADATA ERRORS (also fixed here):
--   a1b2c3d4-0001-0010-0001-000000000001  MREF III active  vintage_year=2026 (should be 2019)
--                                                          status='investing' (should be 'harvesting')
--   a1b2c3d4-0002-0020-0001-000000000001  MCOF I active    fund_type='open_end' (should be 'closed_end')
--
-- FIX:
--   1. Fix metadata on both active canonical fund rows.
--   2. Quarantine both orphan fund rows (prefix name, set strategy='quarantined').
--   3. Delete stale re_fund_quarter_state rows for both orphan fund_ids.
--   4. Orphan deals/assets remain under their quarantined parent — excluded from
--      all active queries that filter by canonical fund_ids. No re-assignment needed
--      since these deals have no cash events or authoritative snapshots.
--
-- IDEMPOTENT: All operations guarded by existence/value checks. Safe to re-run.

DO $$
DECLARE
  v_mref_active  uuid := 'a1b2c3d4-0001-0010-0001-000000000001'::uuid;
  v_mcof_active  uuid := 'a1b2c3d4-0002-0020-0001-000000000001'::uuid;
  v_mref_orphan  uuid := 'd4560000-0003-0030-0004-000000000001'::uuid;
  v_mcof_orphan  uuid := 'd4560000-0003-0030-0005-000000000001'::uuid;
  v_mref_state_rows_deleted int;
  v_mcof_state_rows_deleted int;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════
  -- I. Fix MREF III active row metadata
  --    vintage_year: 2026 → 2019 (inception 2019-03-01, confirmed in seed 456)
  --    status: 'investing' → 'harvesting' (10-year fund in harvest phase)
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE repe_fund
  SET
    vintage_year = 2019,
    status       = 'harvesting'
  WHERE fund_id     = v_mref_active
    AND (vintage_year != 2019 OR status != 'harvesting');

  IF NOT FOUND THEN
    RAISE NOTICE '463: MREF III active metadata already correct — no update needed';
  ELSE
    RAISE NOTICE '463: MREF III active metadata corrected (vintage_year→2019, status→harvesting)';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- II. Fix MCOF I active row metadata
  --     fund_type: 'open_end' → 'closed_end' (confirmed in seed 456)
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE repe_fund
  SET fund_type = 'closed_end'
  WHERE fund_id    = v_mcof_active
    AND fund_type != 'closed_end';

  IF NOT FOUND THEN
    RAISE NOTICE '463: MCOF I active fund_type already correct — no update needed';
  ELSE
    RAISE NOTICE '463: MCOF I active fund_type corrected (open_end→closed_end)';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- III. Quarantine MREF III orphan row
  --      strategy CHECK constraint only allows 'equity'|'debt'; use status='closed'
  --      as the quarantine sentinel (allowed value, excludes from active queries).
  --      Name prefix '[QUARANTINED]' makes it visually obvious in any admin view.
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE repe_fund
  SET
    name   = '[QUARANTINED] Meridian Real Estate Fund III',
    status = 'closed'
  WHERE fund_id = v_mref_orphan
    AND status != 'closed';

  IF NOT FOUND THEN
    RAISE NOTICE '463: MREF III orphan already quarantined — no update needed';
  ELSE
    RAISE NOTICE '463: MREF III orphan quarantined (status=closed)';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IV. Quarantine MCOF I orphan row
  -- ═══════════════════════════════════════════════════════════════════════
  UPDATE repe_fund
  SET
    name   = '[QUARANTINED] Meridian Credit Opportunities Fund I',
    status = 'closed'
  WHERE fund_id = v_mcof_orphan
    AND status != 'closed';

  IF NOT FOUND THEN
    RAISE NOTICE '463: MCOF I orphan already quarantined — no update needed';
  ELSE
    RAISE NOTICE '463: MCOF I orphan quarantined (status=closed)';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- V. Delete stale re_fund_quarter_state rows for orphan fund_ids
  --    These are the primary contamination source: 12 rows for MREF III orphan
  --    and 10 rows for MCOF I orphan. Any legacy NAV query joining across fund_id
  --    without explicit canonical-fund filtering will otherwise pick these up.
  --    SAFE: orphan rows have no authoritative snapshots (confirmed Phase 0 query).
  -- ═══════════════════════════════════════════════════════════════════════
  DELETE FROM re_fund_quarter_state
  WHERE fund_id = v_mref_orphan;
  GET DIAGNOSTICS v_mref_state_rows_deleted = ROW_COUNT;

  DELETE FROM re_fund_quarter_state
  WHERE fund_id = v_mcof_orphan;
  GET DIAGNOSTICS v_mcof_state_rows_deleted = ROW_COUNT;

  RAISE NOTICE '463: Deleted % re_fund_quarter_state rows for MREF III orphan', v_mref_state_rows_deleted;
  RAISE NOTICE '463: Deleted % re_fund_quarter_state rows for MCOF I orphan', v_mcof_state_rows_deleted;
  RAISE NOTICE '463: Orphan dedup complete. Total stale state rows removed: %', v_mref_state_rows_deleted + v_mcof_state_rows_deleted;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VI. Verification assertions
  --     These RAISE EXCEPTION (rolling back the transaction) if post-state
  --     violates expected invariants. Ensures migration cannot silently succeed
  --     in a broken state.
  -- ═══════════════════════════════════════════════════════════════════════

  -- Assert active rows have correct metadata
  IF EXISTS (
    SELECT 1 FROM repe_fund
    WHERE fund_id = v_mref_active
      AND (vintage_year != 2019 OR status != 'harvesting')
  ) THEN
    RAISE EXCEPTION '463: POST-CHECK FAILED — MREF III active row still has wrong metadata';
  END IF;

  IF EXISTS (
    SELECT 1 FROM repe_fund
    WHERE fund_id = v_mcof_active
      AND fund_type != 'closed_end'
  ) THEN
    RAISE EXCEPTION '463: POST-CHECK FAILED — MCOF I active row still has wrong fund_type';
  END IF;

  -- Assert orphan rows are quarantined (status='closed', name prefixed)
  IF EXISTS (
    SELECT 1 FROM repe_fund
    WHERE fund_id IN (v_mref_orphan, v_mcof_orphan)
      AND status != 'closed'
  ) THEN
    RAISE EXCEPTION '463: POST-CHECK FAILED — orphan fund row not quarantined (status != closed)';
  END IF;

  -- Assert no remaining re_fund_quarter_state rows for orphans
  IF EXISTS (
    SELECT 1 FROM re_fund_quarter_state
    WHERE fund_id IN (v_mref_orphan, v_mcof_orphan)
  ) THEN
    RAISE EXCEPTION '463: POST-CHECK FAILED — stale re_fund_quarter_state rows remain for orphan funds';
  END IF;

  RAISE NOTICE '463: All post-migration assertions passed.';

END $$;
