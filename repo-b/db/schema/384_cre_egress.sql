-- CRE Intelligence: Data egress configuration and run tracking
-- Supports S3, SFTP, and Snowflake export targets.

CREATE TABLE IF NOT EXISTS cre_egress_config (
  config_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL,
  business_id         uuid NOT NULL REFERENCES business(business_id),
  config_name         text NOT NULL,
  transport           text NOT NULL CHECK (transport IN ('s3', 'sftp', 'snowflake')),
  connection_details  bytea NOT NULL,
  target_tables       text[] NOT NULL,
  schedule_cron       text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cre_egress_run (
  run_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id           uuid NOT NULL REFERENCES cre_egress_config(config_id),
  status              text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  rows_exported       int NOT NULL DEFAULT 0,
  high_water_mark     timestamptz,
  error_summary       text,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_egress_config_env ON cre_egress_config (env_id, business_id);
CREATE INDEX IF NOT EXISTS idx_egress_run_config ON cre_egress_run (config_id, started_at DESC);

ALTER TABLE cre_egress_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY cre_egress_config_tenant_isolation ON cre_egress_config
  USING (business_id IN (SELECT b.business_id FROM business b WHERE b.tenant_id = current_setting('app.tenant_id', true)::uuid));

ALTER TABLE cre_egress_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY cre_egress_run_tenant_isolation ON cre_egress_run
  USING (config_id IN (SELECT c.config_id FROM cre_egress_config c
    WHERE c.business_id IN (SELECT b.business_id FROM business b WHERE b.tenant_id = current_setting('app.tenant_id', true)::uuid)));
