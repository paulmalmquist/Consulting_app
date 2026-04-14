-- Sub-Phase 2B: data-health and suppressed-data surfaces for PDS executive.
-- Captures pipeline runs and per-row exceptions so the Data Health bar can show
-- exception counts, failed pipelines, and sample rows. Exceptions may also be
-- surfaced inline via SuppressedDataChip wherever a metric filters records.

CREATE TABLE IF NOT EXISTS pds_pipeline_run (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id          uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  pipeline_name   text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text NOT NULL DEFAULT 'running',
  rows_processed  integer NOT NULL DEFAULT 0,
  rows_failed     integer NOT NULL DEFAULT 0,
  detail_json     jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE pds_pipeline_run IS
  'PDS data pipeline run ledger. Data Health bar reads the latest run per pipeline_name; any non-success status counts as a failed pipeline.';

ALTER TABLE pds_pipeline_run ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pds_pipeline_run_env_isolation ON pds_pipeline_run;
CREATE POLICY pds_pipeline_run_env_isolation ON pds_pipeline_run
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS pds_pipeline_run_env_started_idx
  ON pds_pipeline_run (env_id, business_id, pipeline_name, started_at DESC);


CREATE TABLE IF NOT EXISTS pds_exception (
  exception_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id    uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  run_id         uuid REFERENCES pds_pipeline_run(run_id) ON DELETE SET NULL,
  source_table   text NOT NULL,
  source_row_id  uuid,
  error_type     text NOT NULL,
  sample_row_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pds_exception IS
  'Per-row data exceptions flagged by pipelines (NOT NULL, FK violation, DUPLICATE, etc.). Surfaced in UI via SuppressedDataChip and DataHealthDrawer.';

ALTER TABLE pds_exception ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pds_exception_env_isolation ON pds_exception;
CREATE POLICY pds_exception_env_isolation ON pds_exception
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS pds_exception_env_source_idx
  ON pds_exception (env_id, business_id, source_table, created_at DESC);
CREATE INDEX IF NOT EXISTS pds_exception_run_idx
  ON pds_exception (run_id);
