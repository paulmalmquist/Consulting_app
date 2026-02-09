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

-- TODO: Add append-only event tables for audit trail
-- TODO: Add RLS policies for business_departments, business_capabilities, executions
