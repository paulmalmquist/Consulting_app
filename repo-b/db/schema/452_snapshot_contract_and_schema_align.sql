-- 452_snapshot_contract_and_schema_align.sql
--
-- Purpose: Enforce canonical snapshot contract on quarterly state tables.
--
-- 1. Add missing operating columns to re_asset_quarter_state (fix quarter-close INSERT mismatch)
-- 2. Add data_status, irr_source columns for auditability
-- 3. Add version, locked, source columns for snapshot immutability
-- 4. Add operating columns to re_investment_quarter_state (enable rollup of NOI, revenue, etc.)
-- 5. Add immutability trigger for locked rows
-- 6. Deprecate re_asset_financial_state via comment
--
-- Depends on: 270 (re_institutional_model), 283 (operational lineage)
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout.

-- ═══════════════════════════════════════════════════════════════════════════
-- I. re_asset_quarter_state — add missing operating columns
--    (fixes re_quarter_close.py INSERT that references columns not yet in schema)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE re_asset_quarter_state
  ADD COLUMN IF NOT EXISTS other_income       numeric(28,12),
  ADD COLUMN IF NOT EXISTS leasing_costs      numeric(28,12),
  ADD COLUMN IF NOT EXISTS tenant_improvements numeric(28,12),
  ADD COLUMN IF NOT EXISTS free_rent          numeric(28,12),
  ADD COLUMN IF NOT EXISTS net_cash_flow      numeric(28,12),
  ADD COLUMN IF NOT EXISTS implied_equity_value numeric(28,12),
  ADD COLUMN IF NOT EXISTS value_source       text;

-- ═══════════════════════════════════════════════════════════════════════════
-- II. Snapshot contract columns — all quarterly state tables
-- ═══════════════════════════════════════════════════════════════════════════

-- data_status: tracks whether the row is fully sourced or partial/estimated
-- source: tracks provenance (seed, actual accounting, model output, quarter-close engine)
-- version: monotonic version counter per (entity, quarter, scenario)
-- locked: prevents mutation after period close

-- re_asset_quarter_state
ALTER TABLE re_asset_quarter_state
  ADD COLUMN IF NOT EXISTS data_status text NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS version     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS locked      boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE re_asset_quarter_state
    ADD CONSTRAINT chk_asset_qs_data_status
    CHECK (data_status IN ('valid', 'missing_source', 'partial', 'estimated', 'seed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE re_asset_quarter_state
    ADD CONSTRAINT chk_asset_qs_source
    CHECK (source IN ('seed', 'actual', 'model', 'quarter_close'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- re_investment_quarter_state
ALTER TABLE re_investment_quarter_state
  ADD COLUMN IF NOT EXISTS data_status text NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS irr_source  text,
  ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS version     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS locked      boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE re_investment_quarter_state
    ADD CONSTRAINT chk_inv_qs_data_status
    CHECK (data_status IN ('valid', 'missing_source', 'partial', 'estimated', 'seed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE re_investment_quarter_state
    ADD CONSTRAINT chk_inv_qs_irr_source
    CHECK (irr_source IN ('computed_xirr', 'not_available'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- re_fund_quarter_state
ALTER TABLE re_fund_quarter_state
  ADD COLUMN IF NOT EXISTS data_status text NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS irr_source  text,
  ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS version     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS locked      boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE re_fund_quarter_state
    ADD CONSTRAINT chk_fund_qs_data_status
    CHECK (data_status IN ('valid', 'missing_source', 'partial', 'estimated', 'seed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE re_fund_quarter_state
    ADD CONSTRAINT chk_fund_qs_irr_source
    CHECK (irr_source IN ('computed_xirr', 'not_available'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- III. re_investment_quarter_state — add operating columns for rollup
--      (enables investment detail pages to show NOI, revenue, occupancy, etc.)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE re_investment_quarter_state
  ADD COLUMN IF NOT EXISTS noi            numeric(28,12),
  ADD COLUMN IF NOT EXISTS revenue        numeric(28,12),
  ADD COLUMN IF NOT EXISTS opex           numeric(28,12),
  ADD COLUMN IF NOT EXISTS occupancy      numeric(18,12),
  ADD COLUMN IF NOT EXISTS debt_service   numeric(28,12),
  ADD COLUMN IF NOT EXISTS debt_balance   numeric(28,12),
  ADD COLUMN IF NOT EXISTS asset_value    numeric(28,12),
  ADD COLUMN IF NOT EXISTS cash_balance   numeric(28,12);

-- ═══════════════════════════════════════════════════════════════════════════
-- IV. Immutability trigger — prevent mutation of locked rows
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_locked_quarter_state_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.locked THEN
    RAISE EXCEPTION 'Cannot modify locked quarter state (table=%, id=%, quarter=%)',
      TG_TABLE_NAME, OLD.id, OLD.quarter;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all three state tables
DO $$ BEGIN
  CREATE TRIGGER trg_prevent_locked_asset_qs
    BEFORE UPDATE OR DELETE ON re_asset_quarter_state
    FOR EACH ROW EXECUTE FUNCTION prevent_locked_quarter_state_mutation();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_prevent_locked_investment_qs
    BEFORE UPDATE OR DELETE ON re_investment_quarter_state
    FOR EACH ROW EXECUTE FUNCTION prevent_locked_quarter_state_mutation();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_prevent_locked_fund_qs
    BEFORE UPDATE OR DELETE ON re_fund_quarter_state
    FOR EACH ROW EXECUTE FUNCTION prevent_locked_quarter_state_mutation();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- V. Deprecate re_asset_financial_state for operational use
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE re_asset_quarter_state IS
  'Canonical asset-level quarterly snapshot. All rollup, surveillance, reporting, '
  'and API services MUST read from this table. Written by quarter-close engine and seeds.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 're_asset_financial_state') THEN
    EXECUTE $x$
      COMMENT ON TABLE re_asset_financial_state IS
        'DEPRECATED for operational use — valuation archive only. '
        'Canonical source of truth is re_asset_quarter_state. '
        'No service may compute financial metrics from this table.'
    $x$;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VI. Reconciliation log table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS repe_reconciliation_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         text NOT NULL,
  quarter        text NOT NULL,
  check_name     text NOT NULL,
  expected_value numeric(28,12),
  actual_value   numeric(28,12),
  discrepancy    numeric(28,12),
  status         text NOT NULL CHECK (status IN ('pass', 'fail', 'warn')),
  detail_json    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE repe_reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_repe_reconciliation_quarter
  ON repe_reconciliation_log(env_id, quarter, check_name);
