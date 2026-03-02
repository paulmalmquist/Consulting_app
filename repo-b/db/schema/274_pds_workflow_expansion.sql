-- 274_pds_workflow_expansion.sql
-- Additive workflow expansion for the canonical PDS data model.

ALTER TABLE IF EXISTS pds_projects
  ADD COLUMN IF NOT EXISTS project_code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS target_end_date date;

ALTER TABLE IF EXISTS pds_contracts
  ADD COLUMN IF NOT EXISTS vendor_id uuid,
  ADD COLUMN IF NOT EXISTS scope_description text,
  ADD COLUMN IF NOT EXISTS executed_date date;

CREATE TABLE IF NOT EXISTS pds_vendors (
  vendor_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  vendor_name         text NOT NULL,
  trade               text,
  license_number      text,
  insurance_expiry    date,
  contact_name        text,
  contact_email       text,
  status              text NOT NULL DEFAULT 'active',
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, vendor_name)
);

ALTER TABLE IF EXISTS pds_contracts
  DROP CONSTRAINT IF EXISTS fk_pds_contracts_vendor_id;

ALTER TABLE IF EXISTS pds_contracts
  ADD CONSTRAINT fk_pds_contracts_vendor_id
  FOREIGN KEY (vendor_id) REFERENCES pds_vendors(vendor_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS pds_rfis (
  rfi_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  rfi_number          text NOT NULL,
  subject             text NOT NULL,
  description         text,
  assigned_to         text,
  due_date            date,
  priority            text NOT NULL DEFAULT 'normal',
  response_text       text,
  responded_at        timestamptz,
  status              text NOT NULL DEFAULT 'open',
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, rfi_number)
);

CREATE TABLE IF NOT EXISTS pds_submittals (
  submittal_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  vendor_id           uuid REFERENCES pds_vendors(vendor_id) ON DELETE SET NULL,
  submittal_number    text NOT NULL,
  description         text,
  spec_section        text,
  required_date       date,
  submitted_date      date,
  reviewed_date       date,
  review_notes        text,
  status              text NOT NULL DEFAULT 'pending',
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, submittal_number)
);

CREATE TABLE IF NOT EXISTS pds_documents (
  pds_document_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  rfi_id              uuid REFERENCES pds_rfis(rfi_id) ON DELETE SET NULL,
  submittal_id        uuid REFERENCES pds_submittals(submittal_id) ON DELETE SET NULL,
  title               text NOT NULL,
  document_type       text NOT NULL DEFAULT 'general',
  version_label       text,
  storage_key         text,
  status              text NOT NULL DEFAULT 'active',
  source              text NOT NULL DEFAULT 'manual',
  version_no          int NOT NULL DEFAULT 1,
  metadata_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS pds_site_reports
  ADD COLUMN IF NOT EXISTS weather text,
  ADD COLUMN IF NOT EXISTS temperature_high int,
  ADD COLUMN IF NOT EXISTS temperature_low int,
  ADD COLUMN IF NOT EXISTS workers_on_site int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS work_performed text,
  ADD COLUMN IF NOT EXISTS delays text,
  ADD COLUMN IF NOT EXISTS safety_incidents text;

CREATE INDEX IF NOT EXISTS idx_pds_vendors_env_status
  ON pds_vendors (env_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_rfis_project_status
  ON pds_rfis (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_submittals_project_status
  ON pds_submittals (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_documents_project_type
  ON pds_documents (project_id, document_type, created_at DESC);
