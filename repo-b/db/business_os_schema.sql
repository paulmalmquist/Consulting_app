-- Business OS Schema Extension
-- Adds department, capability, business provisioning, and execution tables
-- to the existing app schema.

-- ─────────────────────────────────────────────
-- DEPARTMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.departments (
  department_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  icon text NOT NULL DEFAULT 'folder',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- CAPABILITIES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.capabilities (
  capability_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES app.departments(department_id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'action', -- action | document_view | history | custom
  sort_order int NOT NULL DEFAULT 0,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, key)
);

-- ─────────────────────────────────────────────
-- BUSINESSES (top-level entity, maps to a tenant for UX)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.businesses (
  business_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES app.tenants(tenant_id),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  region text NOT NULL DEFAULT 'us',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS businesses_slug_idx ON app.businesses (slug);

-- ─────────────────────────────────────────────
-- BUSINESS_DEPARTMENTS (enabled departments per business)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.business_departments (
  business_id uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES app.departments(department_id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  sort_order_override int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, department_id)
);

-- ─────────────────────────────────────────────
-- BUSINESS_CAPABILITIES (enabled capabilities per business)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.business_capabilities (
  business_id uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES app.capabilities(capability_id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  sort_order_override int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, capability_id)
);

-- ─────────────────────────────────────────────
-- EXECUTIONS (run records)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 'execution_status'
  ) THEN
    CREATE TYPE app.execution_status AS ENUM (
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS app.executions (
  execution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  department_id uuid REFERENCES app.departments(department_id),
  capability_id uuid REFERENCES app.capabilities(capability_id),
  status app.execution_status NOT NULL DEFAULT 'queued',
  inputs_json jsonb DEFAULT '{}'::jsonb,
  outputs_json jsonb DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS executions_business_id_idx ON app.executions (business_id);
CREATE INDEX IF NOT EXISTS executions_business_dept_idx ON app.executions (business_id, department_id);
CREATE INDEX IF NOT EXISTS executions_business_cap_idx ON app.executions (business_id, capability_id);
CREATE INDEX IF NOT EXISTS executions_status_idx ON app.executions (status);

-- Add department_id to existing documents table (nullable, for scoping)
-- This is safe because it's a new nullable column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'documents' AND column_name = 'department_id'
  ) THEN
    ALTER TABLE app.documents ADD COLUMN department_id uuid REFERENCES app.departments(department_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'documents' AND column_name = 'business_id'
  ) THEN
    ALTER TABLE app.documents ADD COLUMN business_id uuid REFERENCES app.businesses(business_id);
  END IF;
END;
$$;

-- Trigger for executions updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'executions_set_updated_at'
  ) THEN
    CREATE TRIGGER executions_set_updated_at
      BEFORE UPDATE ON app.executions
      FOR EACH ROW
      EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;

-- Trigger for businesses updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'businesses_set_updated_at'
  ) THEN
    CREATE TRIGGER businesses_set_updated_at
      BEFORE UPDATE ON app.businesses
      FOR EACH ROW
      EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────
-- SEED: Default departments and capabilities
-- (These serve as the catalog; businesses opt-in via business_departments/business_capabilities)
-- ─────────────────────────────────────────────
INSERT INTO app.departments (key, label, icon, sort_order) VALUES
  ('finance', 'Finance', 'dollar-sign', 10),
  ('operations', 'Operations', 'settings', 20),
  ('hr', 'Human Resources', 'users', 30),
  ('sales', 'Sales', 'trending-up', 40),
  ('legal', 'Legal', 'shield', 50),
  ('it', 'IT & Technology', 'cpu', 60),
  ('marketing', 'Marketing', 'megaphone', 70)
ON CONFLICT (key) DO NOTHING;

-- Finance capabilities
INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json) VALUES
  ((SELECT department_id FROM app.departments WHERE key='finance'), 'invoice_processing', 'Invoice Processing', 'action', 10, '{"inputs":[{"name":"vendor","type":"text","label":"Vendor Name"},{"name":"amount","type":"number","label":"Amount"},{"name":"invoice_file","type":"file","label":"Invoice PDF"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='finance'), 'expense_review', 'Expense Review', 'action', 20, '{"inputs":[{"name":"employee","type":"text","label":"Employee"},{"name":"report_file","type":"file","label":"Expense Report"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='finance'), 'finance_documents', 'Documents', 'document_view', 90, '{}'),
  ((SELECT department_id FROM app.departments WHERE key='finance'), 'finance_history', 'Run History', 'history', 95, '{}')
ON CONFLICT (department_id, key) DO NOTHING;

-- Operations capabilities
INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json) VALUES
  ((SELECT department_id FROM app.departments WHERE key='operations'), 'quality_check', 'Quality Check', 'action', 10, '{"inputs":[{"name":"batch_id","type":"text","label":"Batch ID"},{"name":"checklist_file","type":"file","label":"Checklist"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='operations'), 'vendor_onboarding', 'Vendor Onboarding', 'action', 20, '{"inputs":[{"name":"vendor_name","type":"text","label":"Vendor Name"},{"name":"contract_file","type":"file","label":"Contract"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='operations'), 'ops_documents', 'Documents', 'document_view', 90, '{}'),
  ((SELECT department_id FROM app.departments WHERE key='operations'), 'ops_history', 'Run History', 'history', 95, '{}')
ON CONFLICT (department_id, key) DO NOTHING;

-- HR capabilities
INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json) VALUES
  ((SELECT department_id FROM app.departments WHERE key='hr'), 'onboard_employee', 'Onboard Employee', 'action', 10, '{"inputs":[{"name":"employee_name","type":"text","label":"Employee Name"},{"name":"role","type":"text","label":"Role"},{"name":"offer_letter","type":"file","label":"Offer Letter"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='hr'), 'policy_review', 'Policy Review', 'action', 20, '{"inputs":[{"name":"policy_name","type":"text","label":"Policy Name"},{"name":"policy_file","type":"file","label":"Policy Document"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='hr'), 'hr_documents', 'Documents', 'document_view', 90, '{}'),
  ((SELECT department_id FROM app.departments WHERE key='hr'), 'hr_history', 'Run History', 'history', 95, '{}')
ON CONFLICT (department_id, key) DO NOTHING;

-- Sales capabilities
INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json) VALUES
  ((SELECT department_id FROM app.departments WHERE key='sales'), 'proposal_gen', 'Generate Proposal', 'action', 10, '{"inputs":[{"name":"client_name","type":"text","label":"Client Name"},{"name":"scope","type":"textarea","label":"Scope Description"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='sales'), 'contract_review', 'Contract Review', 'action', 20, '{"inputs":[{"name":"contract_file","type":"file","label":"Contract Document"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='sales'), 'sales_documents', 'Documents', 'document_view', 90, '{}'),
  ((SELECT department_id FROM app.departments WHERE key='sales'), 'sales_history', 'Run History', 'history', 95, '{}')
ON CONFLICT (department_id, key) DO NOTHING;

-- Legal capabilities
INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json) VALUES
  ((SELECT department_id FROM app.departments WHERE key='legal'), 'compliance_check', 'Compliance Check', 'action', 10, '{"inputs":[{"name":"regulation","type":"text","label":"Regulation"},{"name":"evidence_file","type":"file","label":"Evidence Document"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='legal'), 'legal_documents', 'Documents', 'document_view', 90, '{}'),
  ((SELECT department_id FROM app.departments WHERE key='legal'), 'legal_history', 'Run History', 'history', 95, '{}')
ON CONFLICT (department_id, key) DO NOTHING;

-- IT capabilities
INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json) VALUES
  ((SELECT department_id FROM app.departments WHERE key='it'), 'incident_report', 'Incident Report', 'action', 10, '{"inputs":[{"name":"severity","type":"text","label":"Severity (P1-P4)"},{"name":"description","type":"textarea","label":"Incident Description"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='it'), 'change_request', 'Change Request', 'action', 20, '{"inputs":[{"name":"system","type":"text","label":"System"},{"name":"change_description","type":"textarea","label":"Change Description"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='it'), 'it_documents', 'Documents', 'document_view', 90, '{}'),
  ((SELECT department_id FROM app.departments WHERE key='it'), 'it_history', 'Run History', 'history', 95, '{}')
ON CONFLICT (department_id, key) DO NOTHING;

-- Marketing capabilities
INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json) VALUES
  ((SELECT department_id FROM app.departments WHERE key='marketing'), 'campaign_brief', 'Campaign Brief', 'action', 10, '{"inputs":[{"name":"campaign_name","type":"text","label":"Campaign Name"},{"name":"brief","type":"textarea","label":"Brief Description"},{"name":"assets","type":"file","label":"Brand Assets"}]}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='marketing'), 'marketing_documents', 'Documents', 'document_view', 90, '{}'),
  ((SELECT department_id FROM app.departments WHERE key='marketing'), 'marketing_history', 'Run History', 'history', 95, '{}')
ON CONFLICT (department_id, key) DO NOTHING;

-- ─────────────────────────────────────────────
-- WORK SYSTEM (Ownership-first; replaces Slack/helpdesk)
-- ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 'work_item_type'
  ) THEN
    CREATE TYPE app.work_item_type AS ENUM (
      'request', 'task', 'incident', 'decision', 'question'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 'work_item_status'
  ) THEN
    CREATE TYPE app.work_item_status AS ENUM (
      'open', 'in_progress', 'waiting', 'blocked', 'resolved', 'closed'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 'work_comment_type'
  ) THEN
    CREATE TYPE app.work_comment_type AS ENUM (
      'clarification', 'evidence', 'proposal', 'status_update'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 'work_resolution_outcome'
  ) THEN
    CREATE TYPE app.work_resolution_outcome AS ENUM (
      'solved', 'deferred', 'rejected'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS app.work_items (
  work_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  business_id uuid NOT NULL REFERENCES app.businesses(business_id),
  department_id uuid NULL REFERENCES app.departments(department_id),
  capability_id uuid NULL REFERENCES app.capabilities(capability_id),
  type app.work_item_type NOT NULL,
  status app.work_item_status NOT NULL DEFAULT 'open',
  owner text NOT NULL,
  priority int NULL CHECK (priority >= 1 AND priority <= 5),
  title text NOT NULL,
  description text NULL,
  created_by text NOT NULL,
  updated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_items_business_status_idx
  ON app.work_items (business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS work_items_business_owner_idx
  ON app.work_items (business_id, owner, created_at DESC);
CREATE INDEX IF NOT EXISTS work_items_business_dept_idx
  ON app.work_items (business_id, department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_items_business_cap_idx
  ON app.work_items (business_id, capability_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.work_comments (
  comment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  work_item_id uuid NOT NULL REFERENCES app.work_items(work_item_id) ON DELETE CASCADE,
  comment_type app.work_comment_type NOT NULL,
  author text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_comments_item_idx
  ON app.work_comments (work_item_id, created_at ASC);

CREATE TABLE IF NOT EXISTS app.work_resolutions (
  resolution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  work_item_id uuid NOT NULL UNIQUE REFERENCES app.work_items(work_item_id) ON DELETE CASCADE,
  summary text NOT NULL,
  outcome app.work_resolution_outcome NOT NULL,
  linked_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_executions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- AUDIT EVENTS (append-only)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES app.tenants(tenant_id),
  business_id uuid NULL REFERENCES app.businesses(business_id),
  actor text NOT NULL,
  action text NOT NULL,
  tool_name text NOT NULL,
  object_type text NULL,
  object_id uuid NULL,
  success boolean NOT NULL,
  latency_ms int NOT NULL,
  input_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_business_idx
  ON app.audit_events (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_tool_idx
  ON app.audit_events (tool_name, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_success_idx
  ON app.audit_events (success, created_at DESC);

-- ─────────────────────────────────────────────
-- DOCUMENT TAGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.document_tags (
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  document_id uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system',
  PRIMARY KEY (document_id, tag)
);

CREATE INDEX IF NOT EXISTS document_tags_tenant_tag_idx
  ON app.document_tags (tenant_id, tag);

-- ─────────────────────────────────────────────
-- TRIGGERS for updated_at
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'work_items_set_updated_at'
  ) THEN
    CREATE TRIGGER work_items_set_updated_at
      BEFORE UPDATE ON app.work_items
      FOR EACH ROW
      EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;

-- RLS policies for new tables
ALTER TABLE IF EXISTS app.work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.work_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.work_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.document_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS work_items_tenant_isolation
  ON app.work_items
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS work_comments_tenant_isolation
  ON app.work_comments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS work_resolutions_tenant_isolation
  ON app.work_resolutions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS audit_events_tenant_isolation
  ON app.audit_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS document_tags_tenant_isolation
  ON app.document_tags
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─────────────────────────────────────────────
-- COMPLIANCE PRIMITIVES (SOC 2 MVP)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NULL REFERENCES app.tenants(tenant_id),
  business_id uuid NULL REFERENCES app.businesses(business_id),
  user_id text NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action_type text NOT NULL,
  before_state jsonb NULL,
  after_state jsonb NULL,
  ip_address inet NULL,
  session_id text NULL
);

CREATE INDEX IF NOT EXISTS event_log_timestamp_idx ON app.event_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS event_log_entity_idx ON app.event_log (entity_type, entity_id, timestamp DESC);

CREATE OR REPLACE FUNCTION app.prevent_event_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'app.event_log is append-only; % is not allowed', TG_OP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'event_log_no_update') THEN
    CREATE TRIGGER event_log_no_update
      BEFORE UPDATE ON app.event_log
      FOR EACH ROW EXECUTE FUNCTION app.prevent_event_log_mutation();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'event_log_no_delete') THEN
    CREATE TRIGGER event_log_no_delete
      BEFORE DELETE ON app.event_log
      FOR EACH ROW EXECUTE FUNCTION app.prevent_event_log_mutation();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS app.segregation_of_duties_rules (
  rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES app.tenants(tenant_id),
  entity_type text NOT NULL,
  creator_action text NOT NULL,
  approver_action text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.role_change_log (
  role_change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES app.tenants(tenant_id),
  actor_id text NOT NULL,
  target_user_id text NOT NULL,
  role_key text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('grant', 'revoke')),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.configuration_change_log (
  configuration_change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES app.tenants(tenant_id),
  changed_by text NOT NULL,
  config_type text NOT NULL CHECK (config_type IN ('chart_of_accounts', 'roles', 'workflows', 'thresholds')),
  config_key text NOT NULL,
  before_state jsonb NULL,
  after_state jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.journal_entries (
  journal_entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  business_id uuid NOT NULL REFERENCES app.businesses(business_id),
  entry_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted')),
  total_debits numeric(18,2) NOT NULL DEFAULT 0,
  total_credits numeric(18,2) NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  approved_by text NULL,
  posted_by text NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, entry_number)
);

CREATE TABLE IF NOT EXISTS app.journal_entry_versions (
  journal_entry_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES app.journal_entries(journal_entry_id) ON DELETE CASCADE,
  version_number int NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'approved', 'posted')),
  snapshot jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_entry_id, version_number)
);

CREATE TABLE IF NOT EXISTS app.deployment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_hash text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('dev', 'stage', 'prod')),
  deployed_by text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.compliance_controls (
  control_id text PRIMARY KEY,
  description text NOT NULL,
  control_type text NOT NULL CHECK (control_type IN ('Preventative', 'Detective')),
  system_component text NOT NULL,
  evidence_generated text NOT NULL,
  frequency text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'misconfigured')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.access_review_tasks (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES app.tenants(tenant_id),
  review_period_start date NOT NULL,
  review_period_end date NOT NULL,
  generated_by text NOT NULL,
  reviewer text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved')),
  signoff_notes text NULL,
  signed_off_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.backup_verification_log (
  backup_verification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'stage', 'prod')),
  backup_tested_at timestamptz NOT NULL,
  restore_confirmed boolean NOT NULL,
  evidence_notes text NULL,
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.incidents (
  incident_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES app.tenants(tenant_id),
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  created_by text NOT NULL,
  resolution_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS app.incident_timeline (
  timeline_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES app.incidents(incident_id) ON DELETE CASCADE,
  event_time timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  note text NOT NULL
);

ALTER TABLE IF EXISTS app.event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.deployment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.compliance_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.access_review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.backup_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.incident_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS event_log_tenant_isolation
  ON app.event_log
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS access_review_tasks_tenant_isolation
  ON app.access_review_tasks
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS incidents_tenant_isolation
  ON app.incidents
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO app.segregation_of_duties_rules (entity_type, creator_action, approver_action, active)
VALUES ('journal_entry', 'create', 'approve', true)
ON CONFLICT DO NOTHING;
