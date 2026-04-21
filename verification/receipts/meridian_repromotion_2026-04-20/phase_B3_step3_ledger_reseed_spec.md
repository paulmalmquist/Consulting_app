# Step 3 — IGF VII Ledger Reseed Specification (Pre-Execution Review)

**Date:** 2026-04-20
**Status:** DRAFT — awaiting user sign-off
**Mutates:** `re_capital_ledger_entry` rows for fund `a1b2c3d4-0003-0030-0001-000000000001`
**Does NOT mutate:** `re_cash_event` (fund-level truth stays as-is), `repe_fund`, `re_partner_commitment`, released authoritative snapshots

This document specifies what a ledger reseed migration would do, before it is written or executed. Review carefully. No database changes occur from this document alone.

---

## Why this is needed (recap)

Engine fix (Step 1) shipped and verified structurally (Step 2). Tier-1 now correctly caps at `Σ unreturned_capital`. But `unreturned_capital` itself is computed from `re_capital_ledger_entry`, which has the wrong shape:

**Current ledger (bad):**
- 6 of 12 partners have zero contribution entries
- 2 GPs have contributions inflated to fund-level call amounts (Meridian GP: $900M on $25M committed; Winston GP: $212.5M on $10M committed)
- Σ(partner contributions) = $1,875,000,000 vs fund's `total_called` = $833M — off by ~$1.04B

**Target ledger (correct):**
- All 12 partners have contribution entries matching their commitment share
- Σ(partner contributions) = fund `total_called` exactly (invariant INV-L1)
- Per partner: `partner_contribution == fund_call × (commitment / total_commitment)` for the default case (invariant INV-L2)

---

## Options presented to user

### Option A — Proportional reseed (RECOMMENDED)

For each fund-level CALL event (from `re_cash_event`), compute each partner's share as `call_amount × (committed_amount / total_committed_amount)` and write one `re_capital_ledger_entry` row per (partner × CALL event) pair. Delete the existing broken ledger entries first in the same transaction.

**Pros:**
- Mathematically consistent with the fund's real call schedule (no invention)
- Proportional fills the 6 zero-contribution partners correctly
- Enforces INV-L1 + INV-L2 by construction
- Same approach that seed scripts *should* have used originally

**Cons:**
- Writes 108 new ledger rows (12 partners × 9 CALL events), deletes 29 existing rows
- Rewrites history — must be idempotent + audited
- Assumes all 12 partners participated pro-rata from day one (no side letters, no defaults)

### Option B — Reconstruct from capital account history

If a separate source of truth exists (bank transfer records, subscription documents, capital account audit), rebuild ledger from that source. Higher fidelity if the source exists. Not viable if we only have the current ledger + seed scripts.

**Pros:**
- Captures any real-world non-pro-rata dynamics (side letters, defaults, co-invest structures)
- Accurate to the fund's true cash-flow history

**Cons:**
- Requires source material that may not exist for a seeded demo environment
- Significantly more complex migration

### Recommendation

Option A unless you have non-pro-rata documents. This is a seeded Meridian demo environment, not a real fund with actual subscription docs — so the proportional assumption is the only principled default.

---

## If Option A — exact migration plan

### Inputs (live as of 2026-04-20)

**Partner commitments** (12 rows from `re_partner_commitment`):

| Partner | Type | Committed | Share |
|---|---|---:|---:|
| State Pension Fund | lp | $200,000,000 | 20.000% |
| University Endowment | lp | $150,000,000 | 15.000% |
| Sovereign Wealth Fund | lp | $140,000,000 | 14.000% |
| CalPERS Real Estate | lp | $125,000,000 | 12.500% |
| BlackRock Real Estate FoF | lp | $100,000,000 | 10.000% |
| Hartford Insurance Group | lp | $75,000,000 | 7.500% |
| Duke University Endowment | lp | $50,000,000 | 5.000% |
| Whitfield Family Office | lp | $50,000,000 | 5.000% |
| Texas Teachers Retirement | lp | $50,000,000 | 5.000% |
| Meridian Capital Management GP | gp | $25,000,000 | 2.500% |
| Evergreen Realty Co-Invest | co_invest | $25,000,000 | 2.500% |
| Winston Capital Management | gp | $10,000,000 | 1.000% |
| **TOTAL** | | **$1,000,000,000** | 100.000% |

**Fund-level CALL events** (9 rows from `re_cash_event` where `event_type='CALL' AND event_date <= '2026-06-30'`):

| Date | Quarter | Amount |
|---|---|---:|
| 2024-03-01 | 2024Q1 | $148,750,000 |
| 2024-06-01 | 2024Q2 | $127,500,000 |
| 2024-09-01 | 2024Q3 | $85,000,000 |
| 2025-01-15 | 2025Q1 | $63,750,000 |
| 2025-04-15 | 2025Q2 | $100,000,000 |
| 2025-07-15 | 2025Q3 | $75,000,000 |
| 2025-10-15 | 2025Q4 | $60,000,000 |
| 2026-01-15 | 2026Q1 | $25,000,000 |
| 2026-04-15 | 2026Q2 | $10,000,000 |
| **TOTAL** | — | **$695,000,000** |

### Target per-partner rows (sample — State Pension Fund, 20% share)

| Quarter | Call | Partner contribution (20%) |
|---|---:|---:|
| 2024Q1 | $148,750,000 | $29,750,000 |
| 2024Q2 | $127,500,000 | $25,500,000 |
| 2024Q3 | $85,000,000 | $17,000,000 |
| 2025Q1 | $63,750,000 | $12,750,000 |
| 2025Q2 | $100,000,000 | $20,000,000 |
| 2025Q3 | $75,000,000 | $15,000,000 |
| 2025Q4 | $60,000,000 | $12,000,000 |
| 2026Q1 | $25,000,000 | $5,000,000 |
| 2026Q2 | $10,000,000 | $2,000,000 |
| **TOTAL** | $695,000,000 | **$139,000,000** |

vs. current State Pension ledger: $212,500,000 contributed (error: +$73.5M over-booked).

### Migration structure

```sql
-- Migration 469_igf7_capital_ledger_pro_rata_reseed.sql (draft)
-- Idempotent: re-running on a clean ledger is a no-op.
-- Full audit trail via RAISE NOTICE on before/after row counts and sums.

DO $$
DECLARE
  v_fund_id     uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
  v_total_commit numeric;
  v_before_sum   numeric;
  v_after_sum    numeric;
  v_before_rows  int;
  v_after_rows   int;
BEGIN
  -- 1. Capture before state
  SELECT COALESCE(SUM(amount_base), 0), COUNT(*)
    INTO v_before_sum, v_before_rows
    FROM re_capital_ledger_entry
   WHERE fund_id = v_fund_id
     AND entry_type = 'contribution';

  RAISE NOTICE 'BEFORE: % contribution rows summing to $%', v_before_rows, v_before_sum;

  -- 2. Capture total commitment for pro-rata denominator
  SELECT SUM(committed_amount) INTO v_total_commit
    FROM re_partner_commitment
   WHERE fund_id = v_fund_id AND status = 'active';

  IF v_total_commit <= 0 THEN
    RAISE EXCEPTION 'No active commitments for fund %', v_fund_id;
  END IF;

  -- 3. Delete existing broken contribution entries (only if pattern matches
  --    current bad shape — prevents accidental rerun on already-fixed data)
  DELETE FROM re_capital_ledger_entry
   WHERE fund_id = v_fund_id
     AND entry_type = 'contribution'
     AND amount_base NOT IN (
       -- Acceptable pro-rata amounts derived below
       SELECT (ce.amount * pc.committed_amount / v_total_commit)::numeric
         FROM re_cash_event ce
         CROSS JOIN re_partner_commitment pc
        WHERE ce.fund_id = v_fund_id AND ce.event_type = 'CALL'
          AND pc.fund_id = v_fund_id AND pc.status = 'active'
     );

  -- 4. Insert per-partner per-CALL pro-rata contributions
  INSERT INTO re_capital_ledger_entry (
    fund_id, partner_id, quarter, entry_type, amount_base, entry_date, notes
  )
  SELECT
    v_fund_id,
    pc.partner_id,
    -- Derive quarter from event_date (2024-03 → 2024Q1, etc.)
    concat(
      extract(year from ce.event_date)::text,
      'Q',
      ceil(extract(month from ce.event_date)::numeric / 3)::text
    ) AS quarter,
    'contribution',
    round(ce.amount * pc.committed_amount / v_total_commit, 2) AS amount_base,
    ce.event_date,
    'pro_rata_reseed_v1 — migration 469'
  FROM re_cash_event ce
  JOIN re_partner_commitment pc
    ON pc.fund_id = v_fund_id AND pc.status = 'active'
  WHERE ce.fund_id = v_fund_id
    AND ce.event_type = 'CALL'
    AND ce.event_date <= '2026-06-30'::date
  ON CONFLICT DO NOTHING;  -- idempotency: if a row with same keys exists, skip

  -- 5. Verify post-fix invariants
  SELECT COALESCE(SUM(amount_base), 0), COUNT(*)
    INTO v_after_sum, v_after_rows
    FROM re_capital_ledger_entry
   WHERE fund_id = v_fund_id
     AND entry_type = 'contribution';

  RAISE NOTICE 'AFTER:  % contribution rows summing to $%', v_after_rows, v_after_sum;
  RAISE NOTICE 'DELTA:  % rows, $% change', v_after_rows - v_before_rows, v_after_sum - v_before_sum;

  -- INV-L1: Σ(partner contributions) must equal fund total CALL events
  DECLARE v_fund_total numeric;
  BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_fund_total
      FROM re_cash_event
     WHERE fund_id = v_fund_id
       AND event_type = 'CALL'
       AND event_date <= '2026-06-30'::date;

    IF abs(v_after_sum - v_fund_total) > 1 THEN
      RAISE EXCEPTION 'INV-L1 violation: ledger sum % != fund total_call %',
        v_after_sum, v_fund_total;
    END IF;
  END;

  -- INV-L2: no partner's share deviates from its commitment ratio by >$1
  DECLARE v_max_drift numeric;
  BEGIN
    SELECT MAX(abs(actual - expected))
      INTO v_max_drift
      FROM (
        SELECT
          cle.partner_id,
          SUM(cle.amount_base) AS actual,
          pc.committed_amount / v_total_commit * v_after_sum AS expected
        FROM re_capital_ledger_entry cle
        JOIN re_partner_commitment pc ON pc.partner_id = cle.partner_id
        WHERE cle.fund_id = v_fund_id
          AND cle.entry_type = 'contribution'
          AND pc.fund_id = v_fund_id
        GROUP BY cle.partner_id, pc.committed_amount
      ) t;

    IF v_max_drift > 1 THEN
      RAISE EXCEPTION 'INV-L2 violation: max partner drift from pro-rata = $%', v_max_drift;
    END IF;
  END;

  RAISE NOTICE 'OK: INV-L1 and INV-L2 satisfied';
END $$;
```

### Distributions — separate consideration

Distributions have the same seeding pattern (partner DIST entries track the fund-level DIST events). Recommend reseeding distributions in the **same migration** using the same per-partner pro-rata formula applied to `event_type = 'DIST'`. Otherwise `unreturned = contributions - distributions` stays inconsistent.

### What stays unchanged

- `re_cash_event` (fund-level CALL/DIST/FEE/EXPENSE/OPERATING_CASH events) — **truth source, do not touch**
- `repe_fund` / `re_partner_commitment` — partner roster and commitments are correct
- Released authoritative snapshots — remain at `inv5-rebuild-20260411-full-scope` until Step 7

---

## Questions requiring user decision before migration is written

1. **Option A or Option B?** If B, point me at the source document(s).
2. **Pro-rata distributions too** (recommended) or only contributions?
3. **Side letters / defaults / non-pro-rata deals?** If any partner should not follow pro-rata (e.g., a co-invest that only participates in specific deals), tell me before migration 469 is written — the migration must have an explicit allowlist for such cases.
4. **Acceptable risk that this rewrites 29 existing ledger rows?** The rows exist but carry wrong numbers. No real-world money is affected (seeded demo data), but the operation is not trivially reversible if distributions are consumed downstream.

---

## If user approves

- Write `repo-b/db/schema/469_igf7_capital_ledger_pro_rata_reseed.sql` matching the DO $$ block above, idempotent, with both INV-L1 and INV-L2 runtime assertions
- Apply via `mcp__claude_ai_Supabase__apply_migration`
- Capture before/after state as receipt `phase_B4_step4_ledger_reseed_result.md`
- Re-run IGF VII 2026Q2 shadow waterfall (Step 5)
- Hand-build receipts for 4 partners (State Pension, BlackRock, SWF, Meridian GP) and diff against engine output (Step 6)
- Only if all gates pass → Step 7 (invalidate → rebuild → promote)

Stop here and await answers.
