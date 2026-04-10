-- 458_re_fund_expense_qtr_unique.sql
--
-- Authoritative State Lockdown — Phase 6a
--
-- Purpose: Make (env_id, business_id, fund_id, quarter, expense_type) a
-- unique key on re_fund_expense_qtr so that re-runs of the seed and the
-- accrual writers can UPSERT instead of inserting duplicate rows.
--
-- Background: The Meridian verification on 2026-04-10 surfaced 3 open
-- audit exceptions for IGF VII 2026Q2 — three duplicate fund-expense
-- rows per expense type (admin, audit, legal) caused by raw INSERTs in
-- backend/app/services/re_fi_seed.py. The audit pack already
-- deduplicates with DISTINCT ON (expense_type), so the bridge math is
-- correct, but the duplicates still flag as exceptions and block
-- release.
--
-- This migration:
--   1) Deletes pre-existing duplicate rows (keeping the most recent
--      created_at per natural key).
--   2) Adds a unique constraint enforcing one row per
--      (env_id, business_id, fund_id, quarter, expense_type).
--
-- After this lands, the seed/accrual code (Phase 6a follow-on) switches
-- to ON CONFLICT DO UPDATE on this constraint.
--
-- Owner: REPE financial intelligence module (see 278_re_financial_intelligence.sql).
-- Reference: docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariant 6 — Immutability).

BEGIN;

-- Step 1: dedupe. Keep the row with the latest created_at (and the
-- largest id as a tiebreak so the result is deterministic).
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY env_id, business_id, fund_id, quarter, expense_type
            ORDER BY created_at DESC, id DESC
        ) AS rn
    FROM re_fund_expense_qtr
)
DELETE FROM re_fund_expense_qtr
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: add the unique constraint. Use IF NOT EXISTS pattern via
-- DO block since UNIQUE constraints don't have IF NOT EXISTS in
-- Postgres.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 're_fund_expense_qtr_unique_natural_key'
    ) THEN
        ALTER TABLE re_fund_expense_qtr
            ADD CONSTRAINT re_fund_expense_qtr_unique_natural_key
            UNIQUE (env_id, business_id, fund_id, quarter, expense_type);
    END IF;
END $$;

COMMENT ON CONSTRAINT re_fund_expense_qtr_unique_natural_key
    ON re_fund_expense_qtr
    IS 'Authoritative State Lockdown invariant: one expense row per (env, business, fund, quarter, type). Re-runs UPSERT instead of duplicate-INSERT. See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.';

COMMIT;
