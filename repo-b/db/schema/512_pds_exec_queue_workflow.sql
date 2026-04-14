-- Sub-Phase 1B: extend pds_exec_queue_item for real workflow + close-the-loop
-- Adds financial + assignment + resolution columns. priority_score is intentionally
-- NOT stored as a generated column (it depends on NOW() and would be stale at rest);
-- it is computed in the service layer so the formula can evolve independently.

ALTER TABLE pds_exec_queue_item
  ADD COLUMN IF NOT EXISTS variance numeric(28,12),
  ADD COLUMN IF NOT EXISTS starting_variance numeric(28,12),
  ADD COLUMN IF NOT EXISTS recovery_value numeric(28,12),
  ADD COLUMN IF NOT EXISTS assigned_owner text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Backfill: starting_variance captures the variance when the item was opened.
-- For any rows already carrying a variance we preserve it as the baseline.
UPDATE pds_exec_queue_item
   SET starting_variance = variance
 WHERE starting_variance IS NULL
   AND variance IS NOT NULL;

COMMENT ON COLUMN pds_exec_queue_item.variance IS
  'Current dollar variance tied to this intervention (signed; negative = overrun).';
COMMENT ON COLUMN pds_exec_queue_item.starting_variance IS
  'Variance captured when the item was opened. Used for close-the-loop delta.';
COMMENT ON COLUMN pds_exec_queue_item.recovery_value IS
  'Dollar value recovered by executing this intervention (set by owner).';
COMMENT ON COLUMN pds_exec_queue_item.assigned_owner IS
  'Human-accountable owner. recommended_owner is the system suggestion; assigned_owner overrides it.';
COMMENT ON COLUMN pds_exec_queue_item.resolved_at IS
  'Timestamp status transitioned to closed. Enables time-to-resolution metrics.';

-- Supporting index for priority-ordered queue reads at the service layer.
CREATE INDEX IF NOT EXISTS pds_exec_queue_item_env_status_variance_idx
  ON pds_exec_queue_item (env_id, business_id, status, ABS(COALESCE(variance, 0)) DESC);
