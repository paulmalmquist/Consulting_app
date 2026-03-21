-- 370_pds_analytics_schema.sql
-- PDS Winston analytics domain tables.
-- Extends existing pds_accounts with analytics columns and adds new tables
-- for revenue tracking, utilization, NPS surveys, technology adoption,
-- and employee/assignment analytics.

-- ─────────────────────────────────────────────
-- ALTER pds_accounts: add analytics-specific columns
-- ─────────────────────────────────────────────

ALTER TABLE pds_accounts
  ADD COLUMN IF NOT EXISTS parent_account_id uuid REFERENCES pds_accounts(account_id),
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS governance_track text,
  ADD COLUMN IF NOT EXISTS annual_contract_value numeric(15,2),
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS region text;

COMMENT ON COLUMN pds_accounts.tier IS 'Enterprise, Mid-Market, or SMB';
COMMENT ON COLUMN pds_accounts.governance_track IS 'variable or dedicated';
COMMENT ON COLUMN pds_accounts.parent_account_id IS 'Self-referential FK for subsidiary relationships';

DO $$ BEGIN
  ALTER TABLE pds_accounts
    ADD CONSTRAINT chk_pds_accounts_tier
    CHECK (tier IS NULL OR tier IN ('Enterprise', 'Mid-Market', 'SMB'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE pds_accounts
    ADD CONSTRAINT chk_pds_accounts_governance_track
    CHECK (governance_track IS NULL OR governance_track IN ('variable', 'dedicated'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- pds_analytics_employees
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pds_analytics_employees (
  employee_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  resource_id            uuid REFERENCES pds_resources(resource_id) ON DELETE SET NULL,
  full_name              text NOT NULL,
  email                  text,
  role_level             text NOT NULL CHECK (role_level IN ('junior', 'mid', 'senior_manager', 'director', 'executive')),
  department             text,
  region                 text,
  market                 text,
  standard_hours_per_week numeric(4,1) NOT NULL DEFAULT 40,
  is_active              boolean NOT NULL DEFAULT true,
  hire_date              date,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pds_analytics_employees IS 'Employee master for PDS utilization and billing analytics';

-- ─────────────────────────────────────────────
-- pds_analytics_projects
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pds_analytics_projects (
  project_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  account_id             uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  pds_project_id         uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  project_name           text NOT NULL,
  project_type           text,
  service_line_key       text,
  market                 text,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
  governance_track       text CHECK (governance_track IS NULL OR governance_track IN ('variable', 'dedicated')),
  total_budget           numeric(15,2),
  fee_type               text CHECK (fee_type IS NULL OR fee_type IN ('percentage_of_construction', 'fixed_fee', 'time_and_materials', 'retainer')),
  fee_percentage         numeric(5,4),
  fee_amount             numeric(15,2),
  start_date             date,
  planned_end_date       date,
  actual_end_date        date,
  percent_complete       numeric(5,2),
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pds_analytics_projects IS 'Analytics-focused project data with fee structure and governance tracking';
COMMENT ON COLUMN pds_analytics_projects.project_type IS 'Project Management, Development Management, Construction Management, Cost Management, Design, Multi-site Program, Location Strategy, Large Development Advisory, Tétris';
COMMENT ON COLUMN pds_analytics_projects.pds_project_id IS 'Optional link back to operational pds_projects record';

-- ─────────────────────────────────────────────
-- pds_revenue_entries
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pds_revenue_entries (
  entry_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id             uuid REFERENCES pds_analytics_projects(project_id) ON DELETE SET NULL,
  account_id             uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  period                 date NOT NULL,
  service_line           text,
  version                text NOT NULL CHECK (version IN ('actual', 'budget', 'forecast_3_9', 'forecast_6_6', 'forecast_9_3', 'plan')),
  recognized_revenue     numeric(15,2),
  billed_revenue         numeric(15,2),
  unbilled_revenue       numeric(15,2),
  deferred_revenue       numeric(15,2),
  backlog                numeric(15,2),
  cost                   numeric(15,2),
  margin_pct             numeric(5,4),
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, project_id, period, version)
);

COMMENT ON TABLE pds_revenue_entries IS 'Monthly revenue by version (actual, budget, forecasts) with ASC 606 recognition breakdown';
COMMENT ON COLUMN pds_revenue_entries.period IS 'First of month date grain';
COMMENT ON COLUMN pds_revenue_entries.version IS 'actual=past, budget=annual, forecast_X_Y=rolling forecast variants, plan=original annual plan';

-- ─────────────────────────────────────────────
-- pds_analytics_assignments
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pds_analytics_assignments (
  assignment_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  employee_id            uuid NOT NULL REFERENCES pds_analytics_employees(employee_id) ON DELETE CASCADE,
  project_id             uuid REFERENCES pds_analytics_projects(project_id) ON DELETE SET NULL,
  role_level             text CHECK (role_level IN ('junior', 'mid', 'senior_manager', 'director', 'executive')),
  allocation_pct         numeric(5,2),
  start_date             date,
  end_date               date,
  billing_rate           numeric(10,2),
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pds_analytics_assignments IS 'Employee-to-project assignments with billing rate economics';

-- ─────────────────────────────────────────────
-- pds_analytics_timecards
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pds_analytics_timecards (
  timecard_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  employee_id            uuid NOT NULL REFERENCES pds_analytics_employees(employee_id) ON DELETE CASCADE,
  project_id             uuid REFERENCES pds_analytics_projects(project_id) ON DELETE SET NULL,
  assignment_id          uuid REFERENCES pds_analytics_assignments(assignment_id) ON DELETE SET NULL,
  work_date              date NOT NULL,
  hours                  numeric(4,2) NOT NULL,
  is_billable            boolean NOT NULL DEFAULT true,
  task_code              text,
  billing_rate           numeric(10,2),
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, employee_id, project_id, work_date, task_code)
);

COMMENT ON TABLE pds_analytics_timecards IS 'Daily-grain timecard entries for utilization analytics';

-- ─────────────────────────────────────────────
-- pds_nps_responses
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pds_nps_responses (
  response_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  account_id             uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id             uuid REFERENCES pds_analytics_projects(project_id) ON DELETE SET NULL,
  survey_date            date NOT NULL,
  nps_score              smallint CHECK (nps_score BETWEEN 0 AND 10),
  overall_satisfaction   smallint CHECK (overall_satisfaction BETWEEN 1 AND 5),
  schedule_adherence     smallint CHECK (schedule_adherence BETWEEN 1 AND 5),
  budget_management      smallint CHECK (budget_management BETWEEN 1 AND 5),
  communication_quality  smallint CHECK (communication_quality BETWEEN 1 AND 5),
  team_responsiveness    smallint CHECK (team_responsiveness BETWEEN 1 AND 5),
  problem_resolution     smallint CHECK (problem_resolution BETWEEN 1 AND 5),
  vendor_management      smallint CHECK (vendor_management BETWEEN 1 AND 5),
  safety_performance     smallint CHECK (safety_performance BETWEEN 1 AND 5),
  innovation_value_engineering smallint CHECK (innovation_value_engineering BETWEEN 1 AND 5),
  open_comment_positive  text,
  open_comment_improvement text,
  respondent_role        text,
  respondent_name        text,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pds_nps_responses IS 'Client NPS and multi-dimension satisfaction survey responses';
COMMENT ON COLUMN pds_nps_responses.nps_score IS '0-10 NPS scale: 9-10 Promoter, 7-8 Passive, 0-6 Detractor';

-- ─────────────────────────────────────────────
-- pds_technology_adoption
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pds_technology_adoption (
  adoption_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  account_id             uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  tool_name              text NOT NULL,
  period                 date NOT NULL,
  licensed_users         int,
  active_users           int,
  dau                    int,
  mau                    int,
  avg_session_duration_min numeric(6,2),
  features_available     int,
  features_adopted       int,
  onboarding_completion_pct numeric(5,2),
  time_to_value_days     int,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pds_technology_adoption IS 'Monthly technology platform adoption metrics per account per tool';
COMMENT ON COLUMN pds_technology_adoption.tool_name IS 'INGENIOUS.BUILD, JLL Falcon, JLL Azara, Corrigo, BIM 360, Procore';
COMMENT ON COLUMN pds_technology_adoption.period IS 'First of month date grain';
