-- 10008_telemetry_backfill_metadata.sql
-- Additive: mark which telemetry serving rows are deterministic backfill (Phase 6) vs live /score
-- receipts. This lets the backfill reset delete ONLY its own prior rows
-- (env_id='telemetry-demo' AND is_backfilled=true) and preserve live receipts (is_backfilled=false).
-- Owning module: Telemetry Platform.
--
-- is_backfilled: true for rows materialized by 13_backfill_serving.py / seed_serving_backfill.sql.
-- backfill_batch_id: stable id of the backfill batch that wrote the row (for idempotent re-runs).

ALTER TABLE tel_test_runs          ADD COLUMN IF NOT EXISTS is_backfilled boolean NOT NULL DEFAULT false;
ALTER TABLE tel_test_runs          ADD COLUMN IF NOT EXISTS backfill_batch_id text;
ALTER TABLE tel_telemetry_channels ADD COLUMN IF NOT EXISTS is_backfilled boolean NOT NULL DEFAULT false;
ALTER TABLE tel_telemetry_channels ADD COLUMN IF NOT EXISTS backfill_batch_id text;
ALTER TABLE tel_predictions        ADD COLUMN IF NOT EXISTS is_backfilled boolean NOT NULL DEFAULT false;
ALTER TABLE tel_predictions        ADD COLUMN IF NOT EXISTS backfill_batch_id text;
ALTER TABLE tel_anomaly_events     ADD COLUMN IF NOT EXISTS is_backfilled boolean NOT NULL DEFAULT false;
ALTER TABLE tel_anomaly_events     ADD COLUMN IF NOT EXISTS backfill_batch_id text;
ALTER TABLE tel_drift_metrics      ADD COLUMN IF NOT EXISTS is_backfilled boolean NOT NULL DEFAULT false;
ALTER TABLE tel_drift_metrics      ADD COLUMN IF NOT EXISTS backfill_batch_id text;

COMMENT ON COLUMN tel_predictions.is_backfilled IS
  'true = deterministic backfill (Phase 6, real champion outputs over public NASA windows); false = live /score receipt.';

-- verification: all 5 tables carry the two columns
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
      WHERE table_schema='public' AND column_name='is_backfilled'
        AND table_name IN ('tel_test_runs','tel_telemetry_channels','tel_predictions',
                           'tel_anomaly_events','tel_drift_metrics');
    RAISE NOTICE 'telemetry backfill metadata: % of 5 tables have is_backfilled', n;
    IF n < 5 THEN RAISE EXCEPTION 'backfill metadata migration incomplete: % of 5', n; END IF;
END $$;
