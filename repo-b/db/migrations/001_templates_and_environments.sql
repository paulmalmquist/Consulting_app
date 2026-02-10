-- Migration 001: Add templates and environments tables
-- These support real data for the template picker and Lab environment management.

-- ─────────────────────────────────────────────
-- TEMPLATES (replace hardcoded Python dict)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  departments jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- ENVIRONMENTS (Lab demo environments)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.environments (
  env_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  industry text NOT NULL DEFAULT 'general',
  schema_name text NOT NULL DEFAULT 'app',
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'environments_set_updated_at'
  ) THEN
    CREATE TRIGGER environments_set_updated_at
      BEFORE UPDATE ON app.environments
      FOR EACH ROW
      EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────
-- SEED: Default templates
-- ─────────────────────────────────────────────
INSERT INTO app.templates (key, label, description, departments, capabilities) VALUES
  (
    'starter',
    'Starter',
    'Core business departments: Finance, Operations, HR',
    '["finance", "operations", "hr"]'::jsonb,
    '["invoice_processing", "expense_review", "finance_documents", "finance_history", "quality_check", "vendor_onboarding", "ops_documents", "ops_history", "onboard_employee", "policy_review", "hr_documents", "hr_history"]'::jsonb
  ),
  (
    'growth',
    'Growth',
    'Starter + Sales and Marketing',
    '["finance", "operations", "hr", "sales", "marketing"]'::jsonb,
    '["invoice_processing", "expense_review", "finance_documents", "finance_history", "quality_check", "vendor_onboarding", "ops_documents", "ops_history", "onboard_employee", "policy_review", "hr_documents", "hr_history", "proposal_gen", "contract_review", "sales_documents", "sales_history", "campaign_brief", "marketing_documents", "marketing_history"]'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    'All departments and capabilities',
    '["finance", "operations", "hr", "sales", "legal", "it", "marketing"]'::jsonb,
    '"__all__"'::jsonb
  )
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  departments = EXCLUDED.departments,
  capabilities = EXCLUDED.capabilities;
