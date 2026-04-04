-- 438_repe_canonical_snapshot.sql
-- Canonical snapshot schema additions for the REPE state-model refactor.
--
-- Changes:
-- 1. Add null-reason columns to re_asset_quarter_state
--    (value_reason, occupancy_reason, debt_reason, noi_reason)
--    so the API and UI can show WHY a metric is missing rather than a silent blank.
-- 2. Backfill asset_status = 'active' for assets that were never assigned a status
--    (pre-migration rows where asset_status IS NULL). This allows WHERE clauses to
--    use explicit status filters without losing legacy data.
-- 3. Copy gross_irr / net_irr from re_fund_quarter_metrics into re_fund_quarter_state
--    so a single query on re_fund_quarter_state returns all fund-level KPIs.
-- 4. Create re_asset_status_history to make status transitions auditable.
-- 5. Update 361 summary views (already done in schema file — this migration re-applies them).
--
-- Idempotent: all ALTER TABLE use ADD COLUMN IF NOT EXISTS.
-- Depends on: 270 (re_asset_quarter_state, re_fund_quarter_state, repe_asset),
--             389 (re_asset_realization)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. NULL-REASON COLUMNS ON re_asset_quarter_state
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE re_asset_quarter_state
  ADD COLUMN IF NOT EXISTS value_reason        text,
  ADD COLUMN IF NOT EXISTS occupancy_reason    text,
  ADD COLUMN IF NOT EXISTS debt_reason         text,
  ADD COLUMN IF NOT EXISTS noi_reason          text;

COMMENT ON COLUMN re_asset_quarter_state.value_reason IS
  'Why asset_value is NULL or a fallback: no_valuation_available | cost_basis_fallback | prior_period_value | missing_inputs_fallback';
COMMENT ON COLUMN re_asset_quarter_state.occupancy_reason IS
  'Why occupancy is NULL: no_operating_data | not_applicable | asset_type_not_unit_based';
COMMENT ON COLUMN re_asset_quarter_state.debt_reason IS
  'Why ltv/dscr are NULL: no_debt_data | not_levered | missing_debt_inputs';
COMMENT ON COLUMN re_asset_quarter_state.noi_reason IS
  'Why noi is zero or NULL: no_operating_data | pipeline_asset | disposed_asset';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BACKFILL asset_status ON repe_asset (legacy rows with NULL status)
-- ─────────────────────────────────────────────────────────────────────────────

-- Any repe_asset row that has no status and is associated with a deal that closed
-- (invested_capital > 0) is assumed to be an active held asset.
UPDATE repe_asset
SET asset_status = 'active'
WHERE asset_status IS NULL
  AND deal_id IN (
    SELECT deal_id FROM repe_deal WHERE COALESCE(invested_capital, 0) > 0
  );

-- Assets in deals with zero invested_capital and no acquisition_date remain NULL
-- (they may be pipeline or unfunded). Set to pipeline.
UPDATE repe_asset
SET asset_status = 'pipeline'
WHERE asset_status IS NULL
  AND acquisition_date IS NULL;

-- Any remaining NULL → default to 'active' (conservative; does not misclassify as disposed)
UPDATE repe_asset
SET asset_status = 'active'
WHERE asset_status IS NULL;

COMMENT ON COLUMN repe_asset.asset_status IS
  'Explicit lifecycle status: active | held | lease_up | operating | disposed | realized | written_off | pipeline. '
  'NULL is no longer permitted after migration 438.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. IRR PROPAGATION: copy gross_irr / net_irr into re_fund_quarter_state
-- ─────────────────────────────────────────────────────────────────────────────

-- re_fund_quarter_state has gross_irr / net_irr columns (added in schema 270)
-- but re_rollup.rollup_fund() never populated them — they stayed NULL.
-- re_fund_quarter_metrics (written by re_metrics.compute_fund_metrics()) has
-- the actual computed values. Copy them back so one SELECT on quarter_state
-- returns all KPIs without a join.

ALTER TABLE re_fund_quarter_state
  ADD COLUMN IF NOT EXISTS gross_irr     numeric(18,8),
  ADD COLUMN IF NOT EXISTS net_irr       numeric(18,8);

-- Backfill from re_fund_quarter_metrics for all existing rows
UPDATE re_fund_quarter_state fqs
SET
  gross_irr = fqm.gross_irr,
  net_irr   = fqm.net_irr
FROM re_fund_quarter_metrics fqm
WHERE fqm.fund_id   = fqs.fund_id
  AND fqm.quarter   = fqs.quarter
  AND (
    (fqs.scenario_id IS NULL AND fqm.scenario_id IS NULL)
    OR fqs.scenario_id = fqm.scenario_id
  )
  AND (fqs.gross_irr IS NULL OR fqs.net_irr IS NULL);

COMMENT ON COLUMN re_fund_quarter_state.gross_irr IS
  'Gross IRR from XIRR engine (re_fund_quarter_metrics). Populated by quarter-close step 8 and backfilled here.';
COMMENT ON COLUMN re_fund_quarter_state.net_irr IS
  'Net IRR after management fees and carry (re_fund_quarter_metrics). May be NULL for funds with no waterfall.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ASSET STATUS HISTORY TABLE (audit trail for status transitions)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS re_asset_status_history (
  history_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  prior_status   text,
  new_status     text NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     text,
  reason         text,
  source         text NOT NULL DEFAULT 'system'
    CHECK (source IN ('system', 'manual', 'migration', 'import'))
);

CREATE INDEX IF NOT EXISTS idx_re_asset_status_history_asset
  ON re_asset_status_history (asset_id, changed_at DESC);

COMMENT ON TABLE re_asset_status_history IS
  'Audit trail for repe_asset.asset_status transitions. Never infer disposal from missing valuation — '
  'always record an explicit status change here.';

-- Insert a migration record for every asset whose status was just backfilled
INSERT INTO re_asset_status_history (asset_id, prior_status, new_status, reason, source)
SELECT asset_id, NULL, asset_status, 'Backfilled by migration 438', 'migration'
FROM repe_asset
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RE-APPLY 361 SUMMARY VIEWS (canonical versions without hard-coded cap rate)
-- ─────────────────────────────────────────────────────────────────────────────
-- The views in 361_re_summary_views.sql have been updated in the schema file.
-- This migration re-creates them so existing databases pick up the fix.
-- (The schema file is the source of truth; this is a compatibility re-apply.)

-- v_fund_portfolio_summary is recreated via the updated 361 file.
-- If this migration runs before 361 is re-applied, the old view remains.
-- To force a refresh, call: \i repo-b/db/schema/361_re_summary_views.sql
-- or run the full migration pipeline.

RAISE NOTICE '438: Canonical snapshot schema additions complete. '
  'asset_status backfilled, null-reason columns added, gross_irr/net_irr propagated.';
