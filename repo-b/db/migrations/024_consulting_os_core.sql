-- =============================================================================
-- 024_consulting_os_core.sql
-- Novendor Consulting Operating System – Core Tables (Phase 1)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Accounts – target company profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_accounts (
  account_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  company_name          text NOT NULL,
  industry              text,
  sub_industry          text,
  employee_count        int,
  annual_revenue        numeric(16,2),
  headquarters          text,
  website_url           text,
  primary_contact_name  text,
  primary_contact_email text,
  primary_contact_role  text,
  champion_name         text,
  champion_email        text,
  engagement_stage      text NOT NULL DEFAULT 'discovery',
  pain_summary          text,
  vendor_count          int NOT NULL DEFAULT 0,
  system_count          int NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'active',
  notes                 text,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, company_name)
);

CREATE INDEX IF NOT EXISTS idx_nv_accounts_env ON nv_accounts (env_id, business_id);
CREATE INDEX IF NOT EXISTS idx_nv_accounts_stage ON nv_accounts (engagement_stage);

COMMENT ON TABLE nv_accounts IS 'Target company profiles for Novendor consulting engagements';
COMMENT ON COLUMN nv_accounts.engagement_stage IS 'discovery | audit | blueprint | build | governance | closed';

-- ---------------------------------------------------------------------------
-- 2. Account contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_account_contacts (
  contact_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES nv_accounts(account_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  full_name             text NOT NULL,
  email                 text,
  phone                 text,
  role                  text,
  department            text,
  is_champion           boolean NOT NULL DEFAULT false,
  is_decision_maker     boolean NOT NULL DEFAULT false,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_contacts_account ON nv_account_contacts (account_id);

-- ---------------------------------------------------------------------------
-- 3. Source systems – client system inventory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_source_systems (
  system_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES nv_accounts(account_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  system_name           text NOT NULL,
  vendor_name           text,
  system_category       text NOT NULL DEFAULT 'other',
  system_role           text DEFAULT 'work',
  department            text,
  annual_cost           numeric(14,2),
  user_count            int,
  integration_count     int DEFAULT 0,
  data_quality_score    numeric(3,2),
  exportability         text DEFAULT 'unknown',
  pain_level            text DEFAULT 'low',
  disposition           text DEFAULT 'unknown',
  lock_in_risk          text DEFAULT 'unknown',
  replacement_candidate boolean NOT NULL DEFAULT false,
  notes                 text,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_systems_account ON nv_source_systems (account_id);

COMMENT ON COLUMN nv_source_systems.system_category IS 'erp | crm | hrms | accounting | reporting | spreadsheet | custom | other';
COMMENT ON COLUMN nv_source_systems.system_role IS 'record | work | report';
COMMENT ON COLUMN nv_source_systems.pain_level IS 'low | medium | high | critical';
COMMENT ON COLUMN nv_source_systems.disposition IS 'keep | absorb | stabilize | replace | retire | unknown';

-- ---------------------------------------------------------------------------
-- 4. Vendors – vendor catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_vendors (
  vendor_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES nv_accounts(account_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  vendor_name           text NOT NULL,
  category              text,
  annual_spend          numeric(14,2),
  contract_end_date     date,
  lock_in_risk          text DEFAULT 'unknown',
  replacement_difficulty text DEFAULT 'medium',
  capabilities          text[],
  notes                 text,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_vendors_account ON nv_vendors (account_id);

-- ---------------------------------------------------------------------------
-- 5. Source artifacts – uploaded files
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_source_artifacts (
  artifact_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES nv_accounts(account_id) ON DELETE CASCADE,
  system_id             uuid REFERENCES nv_source_systems(system_id) ON DELETE SET NULL,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  filename              text NOT NULL,
  mime_type             text,
  size_bytes            bigint,
  storage_key           text,
  file_type             text NOT NULL DEFAULT 'other',
  row_count             int,
  column_count          int,
  schema_inferred       jsonb,
  column_profile        jsonb,
  processing_status     text NOT NULL DEFAULT 'pending',
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_artifacts_account ON nv_source_artifacts (account_id);

COMMENT ON COLUMN nv_source_artifacts.file_type IS 'excel | csv | pdf | screenshot | export | other';
COMMENT ON COLUMN nv_source_artifacts.processing_status IS 'pending | processing | complete | failed';

-- ---------------------------------------------------------------------------
-- 6. Ingestion jobs – file processing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_ingestion_jobs (
  job_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id           uuid NOT NULL REFERENCES nv_source_artifacts(artifact_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  job_type              text NOT NULL DEFAULT 'profile',
  status                text NOT NULL DEFAULT 'queued',
  rows_processed        int DEFAULT 0,
  rows_failed           int DEFAULT 0,
  error_message         text,
  started_at            timestamptz,
  completed_at          timestamptz,
  result_json           jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_jobs_artifact ON nv_ingestion_jobs (artifact_id);

COMMENT ON COLUMN nv_ingestion_jobs.job_type IS 'profile | ingest | transform';
COMMENT ON COLUMN nv_ingestion_jobs.status IS 'queued | running | complete | failed';

-- ---------------------------------------------------------------------------
-- 7. Canonical entities – target data model
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_canonical_entities (
  entity_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES nv_accounts(account_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  entity_name           text NOT NULL,
  description           text,
  source_count          int NOT NULL DEFAULT 0,
  field_count           int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_entities_account ON nv_canonical_entities (account_id);

-- ---------------------------------------------------------------------------
-- 8. Entity mappings – source → canonical
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_entity_mappings (
  mapping_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             uuid NOT NULL REFERENCES nv_canonical_entities(entity_id) ON DELETE CASCADE,
  system_id             uuid REFERENCES nv_source_systems(system_id) ON DELETE SET NULL,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  source_table          text,
  source_description    text,
  confidence_score      numeric(3,2) DEFAULT 0.50,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_emappings_entity ON nv_entity_mappings (entity_id);

-- ---------------------------------------------------------------------------
-- 9. Field mappings – field-level source → target
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_field_mappings (
  field_mapping_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id            uuid NOT NULL REFERENCES nv_entity_mappings(mapping_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  source_field          text NOT NULL,
  target_field          text NOT NULL,
  data_type             text,
  transformation_rule   text,
  confidence_score      numeric(3,2) DEFAULT 0.50,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_fmappings_mapping ON nv_field_mappings (mapping_id);

-- ---------------------------------------------------------------------------
-- 10. Discovery sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_discovery_sessions (
  session_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES nv_accounts(account_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  session_date          date NOT NULL DEFAULT CURRENT_DATE,
  attendees             text,
  notes                 text,
  files_requested       text,
  next_steps            text,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_sessions_account ON nv_discovery_sessions (account_id);

-- ---------------------------------------------------------------------------
-- 11. Pain points
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_pain_points (
  pain_point_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES nv_accounts(account_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  category              text NOT NULL DEFAULT 'process',
  title                 text NOT NULL,
  description           text,
  severity              text NOT NULL DEFAULT 'medium',
  estimated_annual_cost numeric(14,2),
  affected_systems      uuid[],
  source                text DEFAULT 'manual',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_pain_account ON nv_pain_points (account_id);

COMMENT ON COLUMN nv_pain_points.category IS 'process | data | vendor | reporting | compliance | integration';
COMMENT ON COLUMN nv_pain_points.severity IS 'low | medium | high | critical';

-- ---------------------------------------------------------------------------
-- 12. Audit log – cross-environment trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nv_audit_log (
  log_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid REFERENCES nv_accounts(account_id) ON DELETE SET NULL,
  env_id                uuid NOT NULL,
  business_id           uuid NOT NULL,
  environment           text NOT NULL,
  action                text NOT NULL,
  actor                 text,
  detail_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nv_audit_account ON nv_audit_log (account_id);
CREATE INDEX IF NOT EXISTS idx_nv_audit_env ON nv_audit_log (env_id, business_id);
