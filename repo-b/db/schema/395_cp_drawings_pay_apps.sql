-- 395_cp_drawings_pay_apps.sql
-- Drawing register and AIA G702/G703-style pay applications.

CREATE TABLE IF NOT EXISTS cp_drawing (
  drawing_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id       uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  discipline        text NOT NULL
    CHECK (discipline IN ('architectural','structural','mechanical','electrical','plumbing','civil','landscape','fire_protection','other')),
  sheet_number      text NOT NULL,
  title             text NOT NULL,
  revision          text NOT NULL DEFAULT 'A',
  issue_date        date,
  received_date     date,
  status            text NOT NULL DEFAULT 'current'
    CHECK (status IN ('current','superseded','for_review','void')),
  storage_key       text,
  notes             text,
  source            text NOT NULL DEFAULT 'manual',
  version_no        int NOT NULL DEFAULT 1,
  metadata_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        text,
  updated_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, discipline, sheet_number, revision)
);

CREATE TABLE IF NOT EXISTS cp_pay_app (
  pay_app_id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                      uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                 uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id                  uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  contract_id                 uuid REFERENCES pds_contracts(contract_id) ON DELETE SET NULL,
  vendor_id                   uuid REFERENCES pds_vendors(vendor_id) ON DELETE SET NULL,
  pay_app_number              int NOT NULL,
  billing_period_start        date,
  billing_period_end          date,
  scheduled_value             numeric(28,12) NOT NULL DEFAULT 0,
  work_completed_previous     numeric(28,12) NOT NULL DEFAULT 0,
  work_completed_this_period  numeric(28,12) NOT NULL DEFAULT 0,
  stored_materials_previous   numeric(28,12) NOT NULL DEFAULT 0,
  stored_materials_current    numeric(28,12) NOT NULL DEFAULT 0,
  total_completed_stored      numeric(28,12) NOT NULL DEFAULT 0,
  retainage_pct               numeric(8,4) NOT NULL DEFAULT 10.0000,
  retainage_amount            numeric(28,12) NOT NULL DEFAULT 0,
  total_earned_less_retainage numeric(28,12) NOT NULL DEFAULT 0,
  previous_payments           numeric(28,12) NOT NULL DEFAULT 0,
  current_payment_due         numeric(28,12) NOT NULL DEFAULT 0,
  balance_to_finish           numeric(28,12) NOT NULL DEFAULT 0,
  status                      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','under_review','approved','paid','rejected')),
  submitted_date              date,
  approved_date               date,
  paid_date                   date,
  source                      text NOT NULL DEFAULT 'manual',
  version_no                  int NOT NULL DEFAULT 1,
  metadata_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                  text,
  updated_by                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, contract_id, pay_app_number)
);
