-- 272_pds_core.sql
-- Project & Development Services / Capital Projects OS canonical model.

CREATE TABLE IF NOT EXISTS pds_programs (
  program_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id           uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id      uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  name             text NOT NULL,
  status           text NOT NULL DEFAULT 'active',
  source           text NOT NULL DEFAULT 'manual',
  version_no       int NOT NULL DEFAULT 1,
  metadata_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by       text,
  updated_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_projects (
  project_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                     uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  program_id                 uuid REFERENCES pds_programs(program_id) ON DELETE SET NULL,
  name                       text NOT NULL,
  stage                      text NOT NULL DEFAULT 'planning',
  project_manager            text,
  approved_budget            numeric(28,12) NOT NULL DEFAULT 0,
  committed_amount           numeric(28,12) NOT NULL DEFAULT 0,
  spent_amount               numeric(28,12) NOT NULL DEFAULT 0,
  forecast_at_completion     numeric(28,12) NOT NULL DEFAULT 0,
  contingency_budget         numeric(28,12) NOT NULL DEFAULT 0,
  contingency_remaining      numeric(28,12) NOT NULL DEFAULT 0,
  pending_change_order_amount numeric(28,12) NOT NULL DEFAULT 0,
  next_milestone_date        date,
  risk_score                 numeric(18,6) NOT NULL DEFAULT 0,
  currency_code              text NOT NULL DEFAULT 'USD',
  status                     text NOT NULL DEFAULT 'active',
  source                     text NOT NULL DEFAULT 'manual',
  version_no                 int NOT NULL DEFAULT 1,
  metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                 text,
  updated_by                 text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_budget_versions (
  budget_version_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  version_no         int NOT NULL,
  period             text NOT NULL,
  approved_budget    numeric(28,12) NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'published',
  is_baseline        boolean NOT NULL DEFAULT false,
  source             text NOT NULL DEFAULT 'manual',
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         text,
  updated_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_no)
);

CREATE TABLE IF NOT EXISTS pds_budget_lines (
  budget_line_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  budget_version_id   uuid NOT NULL REFERENCES pds_budget_versions(budget_version_id) ON DELETE CASCADE,
  cost_code           text NOT NULL,
  line_label          text NOT NULL,
  approved_amount     numeric(28,12) NOT NULL DEFAULT 0,
  committed_amount    numeric(28,12) NOT NULL DEFAULT 0,
  invoiced_amount     numeric(28,12) NOT NULL DEFAULT 0,
  paid_amount         numeric(28,12) NOT NULL DEFAULT 0,
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_version_id, cost_code)
);

CREATE TABLE IF NOT EXISTS pds_budget_revisions (
  budget_revision_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  period              text NOT NULL,
  revision_ref        text NOT NULL,
  amount_delta        numeric(28,12) NOT NULL DEFAULT 0,
  reason              text,
  status              text NOT NULL DEFAULT 'approved',
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision_ref, version_no)
);

CREATE TABLE IF NOT EXISTS pds_contracts (
  contract_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  contract_number     text NOT NULL,
  vendor_name         text,
  contract_value      numeric(28,12) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'active',
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, contract_number)
);

CREATE TABLE IF NOT EXISTS pds_commitment_lines (
  commitment_line_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  contract_id         uuid REFERENCES pds_contracts(contract_id) ON DELETE SET NULL,
  period              text NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_change_orders (
  change_order_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id             uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  change_order_ref       text NOT NULL,
  status                 text NOT NULL DEFAULT 'pending',
  amount_impact          numeric(28,12) NOT NULL DEFAULT 0,
  schedule_impact_days   int NOT NULL DEFAULT 0,
  approval_required      boolean NOT NULL DEFAULT true,
  approved_at            timestamptz,
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, change_order_ref, version_no)
);

CREATE TABLE IF NOT EXISTS pds_invoices (
  invoice_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  invoice_number      text NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  invoice_date        date,
  status              text NOT NULL DEFAULT 'approved',
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, invoice_number, version_no)
);

CREATE TABLE IF NOT EXISTS pds_payments (
  payment_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  invoice_id          uuid REFERENCES pds_invoices(invoice_id) ON DELETE SET NULL,
  payment_ref         text NOT NULL,
  amount              numeric(28,12) NOT NULL DEFAULT 0,
  payment_date        date,
  status              text NOT NULL DEFAULT 'paid',
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, payment_ref, version_no)
);

CREATE TABLE IF NOT EXISTS pds_forecast_versions (
  forecast_version_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                      uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                 uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id                  uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  version_no                  int NOT NULL,
  period                      text NOT NULL,
  forecast_to_complete        numeric(28,12) NOT NULL DEFAULT 0,
  eac                         numeric(28,12) NOT NULL DEFAULT 0,
  status                      text NOT NULL DEFAULT 'published',
  source                      text NOT NULL DEFAULT 'manual',
  metadata_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                  text,
  updated_by                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_no)
);

CREATE TABLE IF NOT EXISTS pds_milestones (
  milestone_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id             uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id              uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  milestone_name          text NOT NULL,
  baseline_date           date,
  current_date            date,
  actual_date             date,
  slip_reason             text,
  is_critical             boolean NOT NULL DEFAULT false,
  source                  text NOT NULL DEFAULT 'manual',
  version_no              int NOT NULL DEFAULT 1,
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by              text,
  updated_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_schedule_snapshots (
  schedule_snapshot_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  period                text NOT NULL,
  milestone_health      text NOT NULL DEFAULT 'on_track',
  total_slip_days       int NOT NULL DEFAULT 0,
  critical_flags        int NOT NULL DEFAULT 0,
  source                text NOT NULL DEFAULT 'engine',
  version_no            int NOT NULL DEFAULT 1,
  snapshot_hash         text,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_risks (
  risk_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  risk_title            text NOT NULL,
  probability           numeric(18,12) NOT NULL DEFAULT 0,
  impact_amount         numeric(28,12) NOT NULL DEFAULT 0,
  impact_days           int NOT NULL DEFAULT 0,
  mitigation_owner      text,
  status                text NOT NULL DEFAULT 'open',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_risk_snapshots (
  risk_snapshot_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  period                text NOT NULL,
  expected_exposure     numeric(28,12) NOT NULL DEFAULT 0,
  expected_impact_days  numeric(28,12) NOT NULL DEFAULT 0,
  top_risk_count        int NOT NULL DEFAULT 0,
  source                text NOT NULL DEFAULT 'engine',
  version_no            int NOT NULL DEFAULT 1,
  snapshot_hash         text,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_site_reports (
  site_report_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  report_date           date NOT NULL,
  summary               text,
  blockers              text,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_photos (
  photo_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  site_report_id        uuid REFERENCES pds_site_reports(site_report_id) ON DELETE SET NULL,
  photo_url             text NOT NULL,
  caption               text,
  captured_at           timestamptz,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_inspections (
  inspection_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  inspection_type       text NOT NULL,
  inspection_date       date,
  status                text NOT NULL DEFAULT 'open',
  findings              text,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_incidents (
  incident_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  incident_date         date,
  severity              text NOT NULL DEFAULT 'medium',
  summary               text NOT NULL,
  status                text NOT NULL DEFAULT 'open',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_punch_items (
  punch_item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  title                 text NOT NULL,
  status                text NOT NULL DEFAULT 'open',
  assignee              text,
  due_date              date,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_survey_templates (
  survey_template_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  template_name         text NOT NULL,
  audience              text NOT NULL,
  questions_json        jsonb NOT NULL DEFAULT '[]'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_survey_responses (
  survey_response_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  survey_template_id    uuid REFERENCES pds_survey_templates(survey_template_id) ON DELETE SET NULL,
  vendor_name           text,
  respondent_type       text NOT NULL,
  score                 numeric(18,12),
  responses_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_vendor_score_snapshots (
  vendor_score_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                   uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id              uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id               uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  vendor_name              text NOT NULL,
  period                   text NOT NULL,
  vendor_score             numeric(18,12) NOT NULL DEFAULT 0,
  on_time_rate             numeric(18,12) NOT NULL DEFAULT 0,
  punch_speed_score        numeric(18,12) NOT NULL DEFAULT 0,
  dispute_count            int NOT NULL DEFAULT 0,
  source                   text NOT NULL DEFAULT 'engine',
  version_no               int NOT NULL DEFAULT 1,
  snapshot_hash            text,
  metadata_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by               text,
  updated_by               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_portfolio_snapshots (
  portfolio_snapshot_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                   uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id              uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id               uuid REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  period                   text NOT NULL,
  approved_budget          numeric(28,12) NOT NULL DEFAULT 0,
  revisions_amount         numeric(28,12) NOT NULL DEFAULT 0,
  committed                numeric(28,12) NOT NULL DEFAULT 0,
  invoiced                 numeric(28,12) NOT NULL DEFAULT 0,
  paid                     numeric(28,12) NOT NULL DEFAULT 0,
  forecast_to_complete     numeric(28,12) NOT NULL DEFAULT 0,
  eac                      numeric(28,12) NOT NULL DEFAULT 0,
  variance                 numeric(28,12) NOT NULL DEFAULT 0,
  contingency_remaining    numeric(28,12) NOT NULL DEFAULT 0,
  pending_change_orders    numeric(28,12) NOT NULL DEFAULT 0,
  open_change_order_count  int NOT NULL DEFAULT 0,
  pending_approval_count   int NOT NULL DEFAULT 0,
  top_risk_count           int NOT NULL DEFAULT 0,
  source                   text NOT NULL DEFAULT 'engine',
  version_no               int NOT NULL DEFAULT 1,
  snapshot_hash            text,
  metadata_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by               text,
  updated_by               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pds_report_runs (
  report_run_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                   uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id              uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  period                   text NOT NULL,
  run_id                   text NOT NULL,
  status                   text NOT NULL DEFAULT 'completed',
  snapshot_hash            text,
  deterministic_deltas_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_refs_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  narrative_text           text,
  source                   text NOT NULL DEFAULT 'engine',
  version_no               int NOT NULL DEFAULT 1,
  metadata_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by               text,
  updated_by               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
