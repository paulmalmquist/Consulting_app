-- 273_pds_indexes_and_constraints.sql
-- Deterministic keys and lookup indexes for PDS snapshot/replay workflows.

CREATE UNIQUE INDEX IF NOT EXISTS idx_pds_schedule_snapshot_period
  ON pds_schedule_snapshots (env_id, project_id, period);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pds_risk_snapshot_period
  ON pds_risk_snapshots (env_id, project_id, period);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pds_vendor_score_snapshot_period
  ON pds_vendor_score_snapshots (env_id, project_id, vendor_name, period);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pds_portfolio_snapshot_period
  ON pds_portfolio_snapshots (env_id, project_id, period);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pds_report_runs_period
  ON pds_report_runs (env_id, period, run_id);

CREATE INDEX IF NOT EXISTS idx_pds_projects_env_stage
  ON pds_projects (env_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_budget_versions_project_period
  ON pds_budget_versions (project_id, period, version_no DESC);

CREATE INDEX IF NOT EXISTS idx_pds_change_orders_project_status
  ON pds_change_orders (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_risks_project_status
  ON pds_risks (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_milestones_project_dates
  ON pds_milestones (project_id, baseline_date, current_date, actual_date);

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

ALTER TABLE IF EXISTS pds_change_orders
  DROP CONSTRAINT IF EXISTS chk_pds_change_orders_status;

ALTER TABLE IF EXISTS pds_change_orders
  ADD CONSTRAINT chk_pds_change_orders_status
  CHECK (status IN ('pending', 'approved', 'rejected', 'implemented'))
  NOT VALID;

ALTER TABLE IF EXISTS pds_risks
  DROP CONSTRAINT IF EXISTS chk_pds_risk_probability;

ALTER TABLE IF EXISTS pds_risks
  ADD CONSTRAINT chk_pds_risk_probability
  CHECK (probability >= 0 AND probability <= 1)
  NOT VALID;
