-- 391: Add input_hash to re_model_run for idempotent recalculation
ALTER TABLE re_model_run ADD COLUMN IF NOT EXISTS input_hash text;
