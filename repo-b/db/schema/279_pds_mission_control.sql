-- 279_pds_mission_control.sql
-- Mission control expansion for PDS: true permit and contractor claim records.

ALTER TABLE IF EXISTS pds_projects
  ADD COLUMN IF NOT EXISTS intervention_score numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intervention_state text NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS last_risk_evaluated_at timestamptz;

ALTER TABLE IF EXISTS pds_milestones
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS is_on_critical_path boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS pds_change_orders
  ADD COLUMN IF NOT EXISTS approval_due_at date,
  ADD COLUMN IF NOT EXISTS owner_name text;

ALTER TABLE IF EXISTS pds_inspections
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS blocking_flag boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS pds_permits (
  permit_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  permit_type          text NOT NULL,
  authority_name       text,
  status               text NOT NULL DEFAULT 'pending',
  required_by_date     date,
  expiration_date      date,
  owner_name           text,
  blocking_flag        boolean NOT NULL DEFAULT false,
  submitted_at         timestamptz,
  approved_at          timestamptz,
  notes                text,
  source               text NOT NULL DEFAULT 'manual',
  version_no           int NOT NULL DEFAULT 1,
  metadata_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by           text,
  updated_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pds_permits_project_status
  ON pds_permits (project_id, status, COALESCE(required_by_date, expiration_date), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_permits_project_expiration
  ON pds_permits (project_id, expiration_date)
  WHERE expiration_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS pds_contractor_claims (
  contractor_claim_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  contract_id          uuid REFERENCES pds_contracts(contract_id) ON DELETE SET NULL,
  vendor_id            uuid REFERENCES pds_vendors(vendor_id) ON DELETE SET NULL,
  vendor_name          text,
  claim_ref            text NOT NULL,
  claim_type           text NOT NULL DEFAULT 'change',
  status               text NOT NULL DEFAULT 'open',
  claimed_amount       numeric(28,12) NOT NULL DEFAULT 0,
  exposure_amount      numeric(28,12) NOT NULL DEFAULT 0,
  received_at          timestamptz,
  response_due_at      date,
  owner_name           text,
  summary              text,
  source               text NOT NULL DEFAULT 'manual',
  version_no           int NOT NULL DEFAULT 1,
  metadata_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by           text,
  updated_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, claim_ref, version_no)
);

CREATE INDEX IF NOT EXISTS idx_pds_claims_project_status
  ON pds_contractor_claims (project_id, status, response_due_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_claims_vendor
  ON pds_contractor_claims (vendor_id, project_id, created_at DESC)
  WHERE vendor_id IS NOT NULL;
