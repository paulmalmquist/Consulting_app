-- 416_pds_business_line_snapshot.sql
-- Performance snapshot keyed by business line, mirroring pds_market_performance_snapshot.

CREATE TABLE IF NOT EXISTS pds_business_line_performance_snapshot (
  bl_performance_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  business_line_id      uuid NOT NULL REFERENCES pds_business_lines(business_line_id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL,
  horizon               text NOT NULL,
  fee_plan              numeric(28,12) NOT NULL DEFAULT 0,
  fee_actual            numeric(28,12) NOT NULL DEFAULT 0,
  gaap_plan             numeric(28,12) NOT NULL DEFAULT 0,
  gaap_actual           numeric(28,12) NOT NULL DEFAULT 0,
  ci_plan               numeric(28,12) NOT NULL DEFAULT 0,
  ci_actual             numeric(28,12) NOT NULL DEFAULT 0,
  backlog               numeric(28,12) NOT NULL DEFAULT 0,
  forecast              numeric(28,12) NOT NULL DEFAULT 0,
  red_projects          int NOT NULL DEFAULT 0,
  client_risk_accounts  int NOT NULL DEFAULT 0,
  utilization_pct       numeric(10,4) NOT NULL DEFAULT 0,
  timecard_compliance_pct numeric(10,4) NOT NULL DEFAULT 0,
  satisfaction_score    numeric(10,4) NOT NULL DEFAULT 0,
  health_status         text NOT NULL DEFAULT 'green',
  reason_codes_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  explainability_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date, horizon, business_line_id)
);

CREATE INDEX IF NOT EXISTS idx_pds_bl_snapshot_lookup
  ON pds_business_line_performance_snapshot (env_id, business_id, horizon, snapshot_date DESC);

-- Add business_line_id to existing market snapshot for cross-cut queries.
ALTER TABLE pds_market_performance_snapshot
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;
