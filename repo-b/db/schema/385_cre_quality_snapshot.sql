-- CRE Intelligence: Quality snapshots for fill rate heatmaps and schema drift

CREATE TABLE IF NOT EXISTS cre_quality_snapshot (
  snapshot_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id          uuid NOT NULL,
  business_id     uuid NOT NULL,
  table_name      text NOT NULL,
  column_name     text NOT NULL,
  total_rows      int NOT NULL,
  non_null_rows   int NOT NULL,
  fill_rate       numeric(5,4) NOT NULL,
  source_key      text,
  computed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_snapshot_env ON cre_quality_snapshot (env_id, business_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_snapshot_table ON cre_quality_snapshot (table_name, column_name);
