-- 315_pds_projects.sql
-- Recovery migration for environments where pds_projects was never created.
-- Matches the current service-level project shape used by backend/app/services/pds.py.

CREATE TABLE IF NOT EXISTS pds_projects (
  project_id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                      uuid NOT NULL,
  business_id                 uuid NOT NULL,
  program_id                  uuid,
  name                        text NOT NULL,
  project_code                text,
  description                 text,
  sector                      text,
  project_type                text,
  stage                       text NOT NULL DEFAULT 'planning',
  status                      text NOT NULL DEFAULT 'active',
  project_manager             text,
  start_date                  date,
  target_end_date             date,
  approved_budget             numeric(28,12) NOT NULL DEFAULT 0,
  committed_amount            numeric(28,12) NOT NULL DEFAULT 0,
  spent_amount                numeric(28,12) NOT NULL DEFAULT 0,
  forecast_at_completion      numeric(28,12) NOT NULL DEFAULT 0,
  contingency_budget          numeric(28,12) NOT NULL DEFAULT 0,
  contingency_remaining       numeric(28,12) NOT NULL DEFAULT 0,
  pending_change_order_amount numeric(28,12) NOT NULL DEFAULT 0,
  next_milestone_date         date,
  risk_score                  numeric(18,6) NOT NULL DEFAULT 0,
  currency_code               text NOT NULL DEFAULT 'USD',
  source                      text NOT NULL DEFAULT 'manual',
  version_no                  int NOT NULL DEFAULT 1,
  metadata_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  intervention_score          numeric(18,6) NOT NULL DEFAULT 0,
  intervention_state          text NOT NULL DEFAULT 'green',
  last_risk_evaluated_at      timestamptz,
  created_by                  text,
  updated_by                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS pds_projects
  ADD COLUMN IF NOT EXISTS project_code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS target_end_date date,
  ADD COLUMN IF NOT EXISTS intervention_score numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intervention_state text NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS last_risk_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS committed_amount numeric(28,12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spent_amount numeric(28,12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_at_completion numeric(28,12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_change_order_amount numeric(28,12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_score numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS version_no int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pds_projects_env ON pds_projects(env_id);
CREATE INDEX IF NOT EXISTS idx_pds_projects_business ON pds_projects(business_id);
CREATE INDEX IF NOT EXISTS idx_pds_projects_env_stage
  ON pds_projects (env_id, stage, created_at DESC);

ALTER TABLE IF EXISTS pds_projects
  DROP CONSTRAINT IF EXISTS chk_pds_projects_stage;

ALTER TABLE IF EXISTS pds_projects
  ADD CONSTRAINT chk_pds_projects_stage
  CHECK (stage IN ('planning', 'preconstruction', 'procurement', 'construction', 'closeout', 'completed', 'on_hold'))
  NOT VALID;

ALTER TABLE IF EXISTS pds_projects
  DROP CONSTRAINT IF EXISTS chk_pds_projects_status;

ALTER TABLE IF EXISTS pds_projects
  ADD CONSTRAINT chk_pds_projects_status
  CHECK (status IN ('active', 'archived', 'cancelled'))
  NOT VALID;
