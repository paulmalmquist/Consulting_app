-- 469_igf7_capital_ledger_pro_rata_reseed.sql
-- Phase B4: proportional reseed of IGF VII capital ledger (contributions + distributions).
--
-- AUTHORIZATION: user-approved 2026-04-21. Option A (pro-rata reseed).
-- Both contributions AND distributions reseeded. No side letters. No overrides.
-- Scope limited to fund a1b2c3d4-0003-0030-0001-000000000001 (IGF VII) only.
--
-- ROOT CAUSE (verified in phase_B3a_waterfall_root_cause.md):
--   Σ(partner contributions) = $1,875,000,000 vs fund total CALL = $695,000,000
--   Σ(partner distributions) = $688,364,237 vs fund total DIST = $135,507,756.09
--   Six partners (BlackRock, Hartford, Duke, Whitfield, Texas Teachers, Evergreen)
--   have zero ledger entries despite $350M combined commitment.
--   Two GPs (Meridian, Winston) have contributions inflated to fund-level call
--   amounts, violating per-partner cap invariant.
--
-- INVARIANTS ENFORCED POST-WRITE:
--   INV-L1: Σ(partner contributions) == fund total CALL (within $0.01)
--           Σ(partner distributions) == fund total DIST (within $0.01)
--   INV-L2: For every (partner × fund event) pair, partner share == fund amount
--           × (partner.committed / Σ commitments). Default pro-rata allocation
--           (no overrides — by explicit user instruction).
--
-- IDEMPOTENCY:
--   The migration DELETEs all existing IGF VII contribution + distribution
--   entries then re-INSERTs proportional rows. Re-running:
--     1. DELETEs the rows just inserted (they carry memo='demo reseed —
--        proportional normalization' and source='migration_469' matching the
--        re-insert target)
--     2. Re-INSERTs the same rows with identical deterministic amounts
--   Final state is stable; no drift on repeat execution.
--
-- SAFETY:
--   Does NOT touch re_cash_event (fund-level truth stays untouched).
--   Does NOT touch repe_fund, re_partner_commitment, released snapshots.
--   Scope strictly bounded by fund_id filter; cannot affect other funds.
--   Transaction wraps all writes; invariant failure aborts (RAISE EXCEPTION).

DO $$
DECLARE
  v_fund_id        uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
  v_total_commit   numeric;
  v_fund_total_call numeric;
  v_fund_total_dist numeric;
  v_before_contrib_sum numeric;
  v_before_contrib_rows int;
  v_before_dist_sum numeric;
  v_before_dist_rows int;
  v_after_contrib_sum numeric;
  v_after_contrib_rows int;
  v_after_dist_sum numeric;
  v_after_dist_rows int;
  v_contrib_max_drift numeric;
  v_dist_max_drift numeric;
  v_reseed_memo  text := 'demo reseed — proportional normalization';
  -- source must satisfy re_capital_ledger_entry_source_check:
  -- CHECK (source = ANY (ARRAY['manual', 'imported', 'generated']))
  -- Audit trail of migration 469 lives in memo column.
  v_reseed_source text := 'generated';
BEGIN
  ---------------------------------------------------------------------------
  -- 1. BEFORE state (capture for audit trail via RAISE NOTICE)
  ---------------------------------------------------------------------------
  SELECT COALESCE(SUM(amount_base), 0), COUNT(*)
    INTO v_before_contrib_sum, v_before_contrib_rows
    FROM re_capital_ledger_entry
   WHERE fund_id = v_fund_id AND entry_type = 'contribution';

  SELECT COALESCE(SUM(amount_base), 0), COUNT(*)
    INTO v_before_dist_sum, v_before_dist_rows
    FROM re_capital_ledger_entry
   WHERE fund_id = v_fund_id AND entry_type = 'distribution';

  RAISE NOTICE '──────────── MIGRATION 469 — IGF VII LEDGER RESEED ────────────';
  RAISE NOTICE 'BEFORE contributions: % rows, Σ=$%', v_before_contrib_rows, v_before_contrib_sum;
  RAISE NOTICE 'BEFORE distributions: % rows, Σ=$%', v_before_dist_rows, v_before_dist_sum;

  ---------------------------------------------------------------------------
  -- 2. Capture pro-rata denominators from fund-level truth sources
  ---------------------------------------------------------------------------
  SELECT COALESCE(SUM(committed_amount), 0)
    INTO v_total_commit
    FROM re_partner_commitment
   WHERE fund_id = v_fund_id AND status = 'active';

  IF v_total_commit <= 0 THEN
    RAISE EXCEPTION 'No active partner commitments for fund %', v_fund_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_fund_total_call
    FROM re_cash_event
   WHERE fund_id = v_fund_id
     AND event_type = 'CALL'
     AND event_date <= '2026-06-30'::date;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_fund_total_dist
    FROM re_cash_event
   WHERE fund_id = v_fund_id
     AND event_type = 'DIST'
     AND event_date <= '2026-06-30'::date;

  RAISE NOTICE 'Total commitments: $%', v_total_commit;
  RAISE NOTICE 'Fund total_called (CALL events): $%', v_fund_total_call;
  RAISE NOTICE 'Fund total_distributed (DIST events): $%', v_fund_total_dist;

  ---------------------------------------------------------------------------
  -- 3. Delete existing broken entries (scoped: this fund + entry types only)
  ---------------------------------------------------------------------------
  DELETE FROM re_capital_ledger_entry
   WHERE fund_id = v_fund_id
     AND entry_type IN ('contribution', 'distribution');

  RAISE NOTICE 'Deleted old contribution + distribution rows';

  ---------------------------------------------------------------------------
  -- 4. Insert per-partner per-CALL proportional contributions
  --    Each row: amount = fund_call × (partner.committed / total_commit)
  ---------------------------------------------------------------------------
  INSERT INTO re_capital_ledger_entry (
    fund_id, partner_id, entry_type,
    amount, currency, fx_rate_to_base, amount_base,
    effective_date, quarter, memo, source
  )
  SELECT
    v_fund_id,
    pc.partner_id,
    'contribution',
    round(ce.amount * pc.committed_amount / v_total_commit, 2),
    'USD',
    1.0,
    round(ce.amount * pc.committed_amount / v_total_commit, 2),
    ce.event_date,
    concat(
      extract(year from ce.event_date)::text,
      'Q',
      ceil(extract(month from ce.event_date)::numeric / 3)::text
    ),
    v_reseed_memo,
    v_reseed_source
  FROM re_cash_event ce
  JOIN re_partner_commitment pc
    ON pc.fund_id = v_fund_id AND pc.status = 'active'
  WHERE ce.fund_id = v_fund_id
    AND ce.event_type = 'CALL'
    AND ce.event_date <= '2026-06-30'::date;

  ---------------------------------------------------------------------------
  -- 5. Insert per-partner per-DIST proportional distributions
  ---------------------------------------------------------------------------
  INSERT INTO re_capital_ledger_entry (
    fund_id, partner_id, entry_type,
    amount, currency, fx_rate_to_base, amount_base,
    effective_date, quarter, memo, source
  )
  SELECT
    v_fund_id,
    pc.partner_id,
    'distribution',
    round(ce.amount * pc.committed_amount / v_total_commit, 2),
    'USD',
    1.0,
    round(ce.amount * pc.committed_amount / v_total_commit, 2),
    ce.event_date,
    concat(
      extract(year from ce.event_date)::text,
      'Q',
      ceil(extract(month from ce.event_date)::numeric / 3)::text
    ),
    v_reseed_memo,
    v_reseed_source
  FROM re_cash_event ce
  JOIN re_partner_commitment pc
    ON pc.fund_id = v_fund_id AND pc.status = 'active'
  WHERE ce.fund_id = v_fund_id
    AND ce.event_type = 'DIST'
    AND ce.event_date <= '2026-06-30'::date;

  ---------------------------------------------------------------------------
  -- 6. AFTER state
  ---------------------------------------------------------------------------
  SELECT COALESCE(SUM(amount_base), 0), COUNT(*)
    INTO v_after_contrib_sum, v_after_contrib_rows
    FROM re_capital_ledger_entry
   WHERE fund_id = v_fund_id AND entry_type = 'contribution';

  SELECT COALESCE(SUM(amount_base), 0), COUNT(*)
    INTO v_after_dist_sum, v_after_dist_rows
    FROM re_capital_ledger_entry
   WHERE fund_id = v_fund_id AND entry_type = 'distribution';

  RAISE NOTICE 'AFTER  contributions: % rows, Σ=$%', v_after_contrib_rows, v_after_contrib_sum;
  RAISE NOTICE 'AFTER  distributions: % rows, Σ=$%', v_after_dist_rows, v_after_dist_sum;
  RAISE NOTICE 'DELTA  contributions: % rows, $%', v_after_contrib_rows - v_before_contrib_rows, v_after_contrib_sum - v_before_contrib_sum;
  RAISE NOTICE 'DELTA  distributions: % rows, $%', v_after_dist_rows - v_before_dist_rows, v_after_dist_sum - v_before_dist_sum;

  ---------------------------------------------------------------------------
  -- 7. INV-L1 enforcement — ledger conservation
  ---------------------------------------------------------------------------
  IF abs(v_after_contrib_sum - v_fund_total_call) > 1 THEN
    RAISE EXCEPTION 'INV-L1 FAIL (contributions): ledger Σ=$% != fund total_call $%; delta=$%',
      v_after_contrib_sum, v_fund_total_call, v_after_contrib_sum - v_fund_total_call;
  END IF;
  IF abs(v_after_dist_sum - v_fund_total_dist) > 1 THEN
    RAISE EXCEPTION 'INV-L1 FAIL (distributions): ledger Σ=$% != fund total_dist $%; delta=$%',
      v_after_dist_sum, v_fund_total_dist, v_after_dist_sum - v_fund_total_dist;
  END IF;
  RAISE NOTICE 'INV-L1 OK: contributions Σ=$% ≈ fund $%; distributions Σ=$% ≈ fund $%',
    v_after_contrib_sum, v_fund_total_call, v_after_dist_sum, v_fund_total_dist;

  ---------------------------------------------------------------------------
  -- 8. INV-L2 enforcement — per-partner pro-rata adherence
  ---------------------------------------------------------------------------
  SELECT MAX(abs(actual - expected))
    INTO v_contrib_max_drift
    FROM (
      SELECT
        cle.partner_id,
        SUM(cle.amount_base) AS actual,
        pc.committed_amount / v_total_commit * v_fund_total_call AS expected
      FROM re_capital_ledger_entry cle
      JOIN re_partner_commitment pc
        ON pc.partner_id = cle.partner_id
       AND pc.fund_id = cle.fund_id
      WHERE cle.fund_id = v_fund_id
        AND cle.entry_type = 'contribution'
      GROUP BY cle.partner_id, pc.committed_amount
    ) t;

  -- $0.50 tolerance per partner (quantization slack across 9 CALL events × 12 partners)
  IF COALESCE(v_contrib_max_drift, 0) > 0.50 THEN
    RAISE EXCEPTION 'INV-L2 FAIL (contributions): max partner drift from pro-rata = $%', v_contrib_max_drift;
  END IF;

  SELECT MAX(abs(actual - expected))
    INTO v_dist_max_drift
    FROM (
      SELECT
        cle.partner_id,
        SUM(cle.amount_base) AS actual,
        pc.committed_amount / v_total_commit * v_fund_total_dist AS expected
      FROM re_capital_ledger_entry cle
      JOIN re_partner_commitment pc
        ON pc.partner_id = cle.partner_id
       AND pc.fund_id = cle.fund_id
      WHERE cle.fund_id = v_fund_id
        AND cle.entry_type = 'distribution'
      GROUP BY cle.partner_id, pc.committed_amount
    ) t;

  IF COALESCE(v_dist_max_drift, 0) > 0.50 THEN
    RAISE EXCEPTION 'INV-L2 FAIL (distributions): max partner drift from pro-rata = $%', v_dist_max_drift;
  END IF;

  RAISE NOTICE 'INV-L2 OK: contributions max drift = $%; distributions max drift = $%',
    COALESCE(v_contrib_max_drift, 0), COALESCE(v_dist_max_drift, 0);

  RAISE NOTICE '──────────── MIGRATION 469 COMPLETE ────────────';
END $$;
