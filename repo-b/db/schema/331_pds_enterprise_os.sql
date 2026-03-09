-- 331_pds_enterprise_os.sql
-- Stone PDS workspace-template metadata plus enterprise management domain tables.

ALTER TABLE IF EXISTS app.environments
  ADD COLUMN IF NOT EXISTS workspace_template_key text;

ALTER TABLE IF EXISTS v1.environments
  ADD COLUMN IF NOT EXISTS workspace_template_key text;

CREATE INDEX IF NOT EXISTS idx_app_environments_workspace_template
  ON app.environments (workspace_template_key)
  WHERE workspace_template_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS pds_regions (
  region_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  region_code        text NOT NULL,
  region_name        text NOT NULL,
  leader_name        text,
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, region_code)
);

CREATE TABLE IF NOT EXISTS pds_markets (
  market_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  region_id          uuid REFERENCES pds_regions(region_id) ON DELETE SET NULL,
  market_code        text NOT NULL,
  market_name        text NOT NULL,
  sector             text,
  leader_name        text,
  status             text NOT NULL DEFAULT 'active',
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, market_code)
);

CREATE TABLE IF NOT EXISTS pds_clients (
  client_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  client_code        text NOT NULL,
  client_name        text NOT NULL,
  industry           text,
  client_tier        text NOT NULL DEFAULT 'strategic',
  status             text NOT NULL DEFAULT 'active',
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, client_code)
);

CREATE TABLE IF NOT EXISTS pds_accounts (
  account_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  client_id          uuid REFERENCES pds_clients(client_id) ON DELETE SET NULL,
  market_id          uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_code       text NOT NULL,
  account_name       text NOT NULL,
  owner_name         text,
  strategic_flag     boolean NOT NULL DEFAULT true,
  status             text NOT NULL DEFAULT 'active',
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, account_code)
);

CREATE TABLE IF NOT EXISTS pds_account_owners (
  account_owner_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  account_id         uuid NOT NULL REFERENCES pds_accounts(account_id) ON DELETE CASCADE,
  owner_name         text NOT NULL,
  owner_role         text NOT NULL,
  owner_email        text,
  is_primary         boolean NOT NULL DEFAULT false,
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS pds_projects
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES pds_clients(client_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_executive text,
  ADD COLUMN IF NOT EXISTS closeout_target_date date,
  ADD COLUMN IF NOT EXISTS substantial_completion_date date;

CREATE INDEX IF NOT EXISTS idx_pds_projects_market ON pds_projects (market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pds_projects_account ON pds_projects (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pds_projects_client ON pds_projects (client_id) WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pds_fee_revenue_plan (
  fee_revenue_plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id           uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id          uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id          uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date         date NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_fee_revenue_actual (
  fee_revenue_actual_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id             uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id            uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id            uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date           date NOT NULL,
  amount                numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_gaap_revenue_plan (
  gaap_revenue_plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id            uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id           uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id           uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date          date NOT NULL,
  amount               numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_gaap_revenue_actual (
  gaap_revenue_actual_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id              uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id             uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id             uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date            date NOT NULL,
  amount                 numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_ci_plan (
  ci_plan_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id           uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id          uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id          uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date         date NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_ci_actual (
  ci_actual_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id           uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id          uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id          uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date         date NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_backlog_fact (
  backlog_fact_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id           uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id          uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id          uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date         date NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_billing_fact (
  billing_fact_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id           uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id          uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id          uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date         date NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_collection_fact (
  collection_fact_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id           uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id          uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id          uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date         date NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_writeoff_fact (
  writeoff_fact_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id           uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  account_id          uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id          uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  period_date         date NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  reason_code         text,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_resources (
  resource_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  home_market_id      uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  resource_code       text NOT NULL,
  full_name           text NOT NULL,
  title               text,
  role_preset         text,
  employment_status   text NOT NULL DEFAULT 'active',
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, resource_code)
);

CREATE TABLE IF NOT EXISTS pds_project_assignments (
  assignment_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  resource_id         uuid NOT NULL REFERENCES pds_resources(resource_id) ON DELETE CASCADE,
  role_name           text NOT NULL,
  allocation_pct      numeric(10,4) NOT NULL DEFAULT 0,
  billable_target_pct numeric(10,4) NOT NULL DEFAULT 0,
  start_date          date,
  end_date            date,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_capacity_plans (
  capacity_plan_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  resource_id         uuid NOT NULL REFERENCES pds_resources(resource_id) ON DELETE CASCADE,
  period_date         date NOT NULL,
  capacity_hours      numeric(18,6) NOT NULL DEFAULT 0,
  billable_target_hours numeric(18,6) NOT NULL DEFAULT 0,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_timecards (
  timecard_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  resource_id         uuid NOT NULL REFERENCES pds_resources(resource_id) ON DELETE CASCADE,
  project_id          uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  week_ending         date NOT NULL,
  submitted_at        timestamptz,
  approved_at         timestamptz,
  status              text NOT NULL DEFAULT 'draft',
  hours               numeric(18,6) NOT NULL DEFAULT 0,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_closeout_records (
  closeout_record_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  closeout_target_date date,
  substantial_completion_date date,
  actual_closeout_date date,
  final_billing_status text NOT NULL DEFAULT 'pending',
  survey_sent_at      timestamptz,
  lessons_learned_captured_at timestamptz,
  open_blockers_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL DEFAULT 'active',
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

CREATE TABLE IF NOT EXISTS pds_client_survey_responses (
  client_survey_response_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                   uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id              uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  client_id                uuid REFERENCES pds_clients(client_id) ON DELETE SET NULL,
  account_id               uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  project_id               uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  response_date            date NOT NULL,
  score                    numeric(10,4) NOT NULL DEFAULT 0,
  sentiment                text,
  respondent_name          text,
  metadata_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_satisfaction_rollups (
  satisfaction_rollup_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  client_id             uuid REFERENCES pds_clients(client_id) ON DELETE SET NULL,
  account_id            uuid REFERENCES pds_accounts(account_id) ON DELETE SET NULL,
  period_date           date NOT NULL,
  average_score         numeric(10,4) NOT NULL DEFAULT 0,
  response_count        int NOT NULL DEFAULT 0,
  trend_delta           numeric(10,4) NOT NULL DEFAULT 0,
  risk_state            text NOT NULL DEFAULT 'green',
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, account_id, period_date)
);

CREATE TABLE IF NOT EXISTS pds_market_performance_snapshot (
  market_performance_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  market_id             uuid NOT NULL REFERENCES pds_markets(market_id) ON DELETE CASCADE,
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
  UNIQUE (env_id, business_id, snapshot_date, horizon, market_id)
);

CREATE TABLE IF NOT EXISTS pds_account_performance_snapshot (
  account_performance_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  account_id            uuid NOT NULL REFERENCES pds_accounts(account_id) ON DELETE CASCADE,
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
  collections_lag       numeric(28,12) NOT NULL DEFAULT 0,
  writeoff_leakage      numeric(28,12) NOT NULL DEFAULT 0,
  red_projects          int NOT NULL DEFAULT 0,
  satisfaction_score    numeric(10,4) NOT NULL DEFAULT 0,
  account_risk_score    numeric(18,6) NOT NULL DEFAULT 0,
  health_status         text NOT NULL DEFAULT 'green',
  reason_codes_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  explainability_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date, horizon, account_id)
);

CREATE TABLE IF NOT EXISTS pds_project_health_snapshot (
  project_health_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL,
  horizon               text NOT NULL,
  fee_variance          numeric(28,12) NOT NULL DEFAULT 0,
  gaap_variance         numeric(28,12) NOT NULL DEFAULT 0,
  ci_variance           numeric(28,12) NOT NULL DEFAULT 0,
  schedule_slip_days    int NOT NULL DEFAULT 0,
  labor_overrun_pct     numeric(10,4) NOT NULL DEFAULT 0,
  timecard_delinquent_count int NOT NULL DEFAULT 0,
  claims_exposure       numeric(28,12) NOT NULL DEFAULT 0,
  change_order_exposure numeric(28,12) NOT NULL DEFAULT 0,
  permit_exposure       int NOT NULL DEFAULT 0,
  closeout_aging_days   int NOT NULL DEFAULT 0,
  satisfaction_score    numeric(10,4) NOT NULL DEFAULT 0,
  risk_score            numeric(18,6) NOT NULL DEFAULT 0,
  severity              text NOT NULL DEFAULT 'green',
  reason_codes_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_action    text,
  recommended_owner     text,
  explainability_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date, horizon, project_id)
);

CREATE TABLE IF NOT EXISTS pds_resource_utilization_snapshot (
  resource_utilization_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  resource_id           uuid NOT NULL REFERENCES pds_resources(resource_id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL,
  horizon               text NOT NULL,
  assigned_hours        numeric(18,6) NOT NULL DEFAULT 0,
  capacity_hours        numeric(18,6) NOT NULL DEFAULT 0,
  utilization_pct       numeric(10,4) NOT NULL DEFAULT 0,
  billable_mix_pct      numeric(10,4) NOT NULL DEFAULT 0,
  staffing_gap_flag     boolean NOT NULL DEFAULT false,
  overload_flag         boolean NOT NULL DEFAULT false,
  delinquent_timecards  int NOT NULL DEFAULT 0,
  reason_codes_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  explainability_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date, horizon, resource_id)
);

CREATE TABLE IF NOT EXISTS pds_timecard_health_snapshot (
  timecard_health_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  resource_id           uuid REFERENCES pds_resources(resource_id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL,
  horizon               text NOT NULL,
  submitted_pct         numeric(10,4) NOT NULL DEFAULT 0,
  delinquent_count      int NOT NULL DEFAULT 0,
  overdue_hours         numeric(18,6) NOT NULL DEFAULT 0,
  reason_codes_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  explainability_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date, horizon, resource_id)
);

CREATE TABLE IF NOT EXISTS pds_forecast_snapshot (
  forecast_snapshot_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL,
  horizon               text NOT NULL,
  entity_type           text NOT NULL,
  entity_id             uuid NOT NULL,
  forecast_month        date NOT NULL,
  current_value         numeric(28,12) NOT NULL DEFAULT 0,
  prior_value           numeric(28,12) NOT NULL DEFAULT 0,
  delta_value           numeric(28,12) NOT NULL DEFAULT 0,
  override_value        numeric(28,12),
  override_reason       text,
  confidence_score      numeric(10,4) NOT NULL DEFAULT 0,
  explainability_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date, horizon, entity_type, entity_id, forecast_month)
);

CREATE TABLE IF NOT EXISTS pds_client_satisfaction_snapshot (
  client_satisfaction_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  account_id            uuid REFERENCES pds_accounts(account_id) ON DELETE CASCADE,
  client_id             uuid REFERENCES pds_clients(client_id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL,
  horizon               text NOT NULL,
  average_score         numeric(10,4) NOT NULL DEFAULT 0,
  trend_delta           numeric(10,4) NOT NULL DEFAULT 0,
  response_count        int NOT NULL DEFAULT 0,
  repeat_award_score    numeric(10,4) NOT NULL DEFAULT 0,
  risk_state            text NOT NULL DEFAULT 'green',
  reason_codes_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  explainability_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date, horizon, account_id)
);

CREATE TABLE IF NOT EXISTS pds_closeout_snapshot (
  closeout_snapshot_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  snapshot_date         date NOT NULL,
  horizon               text NOT NULL,
  closeout_target_date  date,
  substantial_completion_date date,
  actual_closeout_date  date,
  closeout_aging_days   int NOT NULL DEFAULT 0,
  blocker_count         int NOT NULL DEFAULT 0,
  final_billing_status  text NOT NULL DEFAULT 'pending',
  survey_status         text NOT NULL DEFAULT 'pending',
  lessons_learned_status text NOT NULL DEFAULT 'pending',
  risk_state            text NOT NULL DEFAULT 'green',
  reason_codes_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  explainability_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date, horizon, project_id)
);

CREATE INDEX IF NOT EXISTS idx_pds_market_snapshot_lookup
  ON pds_market_performance_snapshot (env_id, business_id, horizon, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_pds_account_snapshot_lookup
  ON pds_account_performance_snapshot (env_id, business_id, horizon, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_pds_project_health_snapshot_lookup
  ON pds_project_health_snapshot (env_id, business_id, horizon, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_pds_resource_snapshot_lookup
  ON pds_resource_utilization_snapshot (env_id, business_id, horizon, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_pds_timecard_snapshot_lookup
  ON pds_timecard_health_snapshot (env_id, business_id, horizon, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_pds_forecast_snapshot_lookup
  ON pds_forecast_snapshot (env_id, business_id, horizon, entity_type, snapshot_date DESC, forecast_month);

CREATE INDEX IF NOT EXISTS idx_pds_client_satisfaction_snapshot_lookup
  ON pds_client_satisfaction_snapshot (env_id, business_id, horizon, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_pds_closeout_snapshot_lookup
  ON pds_closeout_snapshot (env_id, business_id, horizon, snapshot_date DESC);
