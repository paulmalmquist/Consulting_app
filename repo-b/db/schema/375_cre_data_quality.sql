-- CRE Intelligence: Data quality checks
-- Stores per-run quality check results (row counts, fill rates, value ranges, etc.)

CREATE TABLE IF NOT EXISTS cre_quality_check (
  check_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES cre_ingest_run(run_id),
  source_key    text NOT NULL,
  table_name    text NOT NULL,
  check_type    text NOT NULL CHECK (check_type IN (
    'row_count', 'fill_rate', 'value_range', 'freshness', 'referential'
  )),
  check_name    text NOT NULL,
  passed        boolean NOT NULL,
  metric_value  numeric(18,6),
  threshold     numeric(18,6),
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_check_run
  ON cre_quality_check (run_id);
CREATE INDEX IF NOT EXISTS idx_quality_check_source
  ON cre_quality_check (source_key, created_at DESC);
