-- 413_pds_leader_coverage.sql
-- Many-to-many bridge: employee x market x business_line with effective dates.
-- Models the JLL operating grain where "leader" = coverage combination.
-- One employee can cover multiple market + business-line combinations,
-- and those assignments can change over time via effective dating.

CREATE TABLE IF NOT EXISTS pds_leader_coverage (
  leader_coverage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  resource_id        uuid NOT NULL REFERENCES pds_resources(resource_id) ON DELETE CASCADE,
  market_id          uuid NOT NULL REFERENCES pds_markets(market_id) ON DELETE CASCADE,
  business_line_id   uuid NOT NULL REFERENCES pds_business_lines(business_line_id) ON DELETE CASCADE,
  coverage_role      text NOT NULL DEFAULT 'leader',
  effective_from     date NOT NULL DEFAULT CURRENT_DATE,
  effective_to       date,
  is_primary         boolean NOT NULL DEFAULT true,
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, resource_id, market_id, business_line_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_pds_leader_coverage_market_bl
  ON pds_leader_coverage (env_id, business_id, market_id, business_line_id)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_pds_leader_coverage_resource
  ON pds_leader_coverage (env_id, business_id, resource_id)
  WHERE effective_to IS NULL;
