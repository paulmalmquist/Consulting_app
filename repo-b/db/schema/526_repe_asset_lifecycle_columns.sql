-- 526_repe_asset_lifecycle_columns.sql
-- Lifecycle columns on repe_asset for the bottom-up scope contract.
--
-- The asset_operating_cf_run runner (Phase 1-3 of authoritative-state lockdown
-- expansion) needs to distinguish in-scope assets from archived / quarantined
-- ones. Active = (archived_at IS NULL) AND (quarantined_at IS NULL) AND
-- parent repe_deal.stage IN ('closing','operating','exited'). Exited assets
-- are in scope for lifetime CF / DPI / IRR but excluded from current
-- ending-NAV unless they carry a residual value.
--
-- Quarantine is distinct from re_jv.strategy='quarantined' — that's an
-- orphan-dedup concept on the joint-venture side. Asset quarantine here
-- captures data-integrity exclusions (mismatched ownership, missing CFs,
-- failed validation) so the snapshot scope receipt names the reason.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS for safe re-apply.

BEGIN;

ALTER TABLE repe_asset
  ADD COLUMN IF NOT EXISTS archived_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quarantined_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quarantine_reason  TEXT;

CREATE INDEX IF NOT EXISTS idx_repe_asset_active_lifecycle
  ON repe_asset (deal_id)
  WHERE archived_at IS NULL AND quarantined_at IS NULL;

COMMENT ON COLUMN repe_asset.archived_at IS
  'Soft-archive timestamp. Active scope excludes assets where archived_at IS NOT NULL.';

COMMENT ON COLUMN repe_asset.quarantined_at IS
  'Quarantine timestamp set when an asset is excluded from authoritative rollups due to data integrity issues.';

COMMENT ON COLUMN repe_asset.quarantine_reason IS
  'Free-text reason for quarantine. Surfaced in scope receipts and audit_mode displays so reviewers see WHY an asset was excluded.';

COMMIT;
