-- 371_pds_analytics_indexes.sql
-- Composite indexes for PDS analytics tables.
-- Optimizes time-series queries, FK lookups, and common filter patterns.

-- ─────────────────────────────────────────────
-- pds_accounts (new columns)
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pds_accounts_governance
  ON pds_accounts (env_id, business_id, governance_track)
  WHERE governance_track IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_accounts_tier
  ON pds_accounts (env_id, business_id, tier)
  WHERE tier IS NOT NULL;

-- ─────────────────────────────────────────────
-- pds_analytics_employees
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pds_analytics_employees_biz
  ON pds_analytics_employees (env_id, business_id);

CREATE INDEX IF NOT EXISTS idx_pds_analytics_employees_role
  ON pds_analytics_employees (env_id, business_id, role_level);

CREATE INDEX IF NOT EXISTS idx_pds_analytics_employees_region
  ON pds_analytics_employees (env_id, business_id, region)
  WHERE region IS NOT NULL;

-- ─────────────────────────────────────────────
-- pds_analytics_projects
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pds_analytics_projects_biz
  ON pds_analytics_projects (env_id, business_id);

CREATE INDEX IF NOT EXISTS idx_pds_analytics_projects_account
  ON pds_analytics_projects (env_id, business_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_analytics_projects_status
  ON pds_analytics_projects (env_id, business_id, status);

CREATE INDEX IF NOT EXISTS idx_pds_analytics_projects_governance
  ON pds_analytics_projects (env_id, business_id, governance_track)
  WHERE governance_track IS NOT NULL;

-- ─────────────────────────────────────────────
-- pds_revenue_entries
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pds_revenue_entries_period
  ON pds_revenue_entries (env_id, business_id, period);

CREATE INDEX IF NOT EXISTS idx_pds_revenue_entries_project
  ON pds_revenue_entries (env_id, business_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_revenue_entries_account
  ON pds_revenue_entries (env_id, business_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_revenue_entries_version_period
  ON pds_revenue_entries (env_id, business_id, version, period);

-- ─────────────────────────────────────────────
-- pds_analytics_assignments
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pds_analytics_assignments_employee
  ON pds_analytics_assignments (env_id, business_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_pds_analytics_assignments_project
  ON pds_analytics_assignments (env_id, business_id, project_id)
  WHERE project_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- pds_analytics_timecards
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pds_analytics_timecards_employee_date
  ON pds_analytics_timecards (env_id, business_id, employee_id, work_date);

CREATE INDEX IF NOT EXISTS idx_pds_analytics_timecards_period
  ON pds_analytics_timecards (env_id, business_id, work_date);

CREATE INDEX IF NOT EXISTS idx_pds_analytics_timecards_project
  ON pds_analytics_timecards (env_id, business_id, project_id)
  WHERE project_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- pds_nps_responses
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pds_nps_responses_account
  ON pds_nps_responses (env_id, business_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_nps_responses_date
  ON pds_nps_responses (env_id, business_id, survey_date);

-- ─────────────────────────────────────────────
-- pds_technology_adoption
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pds_technology_adoption_account
  ON pds_technology_adoption (env_id, business_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_technology_adoption_period
  ON pds_technology_adoption (env_id, business_id, period);

CREATE INDEX IF NOT EXISTS idx_pds_technology_adoption_tool
  ON pds_technology_adoption (env_id, business_id, tool_name, period);
