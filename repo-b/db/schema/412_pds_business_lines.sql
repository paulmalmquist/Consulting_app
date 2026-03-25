-- 412_pds_business_lines.sql
-- Normalized business line (service line) dimension for JLL PDS.
-- Maps to JLL's operating service lines: Project Management, Development Management,
-- Construction Management, Cost Management, Design, Multi-site Program,
-- Location Strategy, Large Development Advisory, Tetris.

CREATE TABLE IF NOT EXISTS pds_business_lines (
  business_line_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  line_code          text NOT NULL,
  line_name          text NOT NULL,
  line_category      text,
  sort_order         int NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, line_code)
);

CREATE INDEX IF NOT EXISTS idx_pds_business_lines_lookup
  ON pds_business_lines (env_id, business_id, is_active);
