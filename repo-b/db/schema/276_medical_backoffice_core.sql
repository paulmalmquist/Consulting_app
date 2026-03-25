-- 276_medical_backoffice_core.sql
-- Medical Office Backoffice model: tenant CRM, lease/revenue, compliance, work orders, vendors, capex.

CREATE TABLE IF NOT EXISTS medoffice_properties (
  property_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  property_name          text NOT NULL,
  market                 text,
  status                 text NOT NULL DEFAULT 'active',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medoffice_tenants (
  tenant_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  property_id            uuid NOT NULL REFERENCES medoffice_properties(property_id) ON DELETE CASCADE,
  legal_name             text NOT NULL,
  specialty              text,
  npi_number             text,
  license_status         text,
  coi_expiration_date    date,
  risk_level             text NOT NULL DEFAULT 'medium',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medoffice_leases (
  lease_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  property_id            uuid NOT NULL REFERENCES medoffice_properties(property_id) ON DELETE CASCADE,
  tenant_id              uuid NOT NULL REFERENCES medoffice_tenants(tenant_id) ON DELETE CASCADE,
  lease_number           text NOT NULL,
  start_date             date,
  end_date               date,
  monthly_base_rent      numeric(28,12) NOT NULL DEFAULT 0,
  escalator_type         text,
  status                 text NOT NULL DEFAULT 'active',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lease_number)
);

CREATE TABLE IF NOT EXISTS medoffice_ar_entries (
  ar_entry_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  tenant_id              uuid NOT NULL REFERENCES medoffice_tenants(tenant_id) ON DELETE CASCADE,
  period                 text NOT NULL,
  invoice_amount         numeric(28,12) NOT NULL DEFAULT 0,
  paid_amount            numeric(28,12) NOT NULL DEFAULT 0,
  outstanding_amount     numeric(28,12) NOT NULL DEFAULT 0,
  aging_bucket           text,
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medoffice_compliance_items (
  compliance_item_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  property_id            uuid NOT NULL REFERENCES medoffice_properties(property_id) ON DELETE CASCADE,
  compliance_type        text NOT NULL,
  due_date               date,
  status                 text NOT NULL DEFAULT 'open',
  severity               text NOT NULL DEFAULT 'medium',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medoffice_work_orders (
  work_order_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  property_id            uuid NOT NULL REFERENCES medoffice_properties(property_id) ON DELETE CASCADE,
  tenant_id              uuid REFERENCES medoffice_tenants(tenant_id) ON DELETE SET NULL,
  title                  text NOT NULL,
  priority               text NOT NULL DEFAULT 'medium',
  status                 text NOT NULL DEFAULT 'open',
  due_date               date,
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medoffice_vendor_contracts (
  vendor_contract_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  property_id            uuid NOT NULL REFERENCES medoffice_properties(property_id) ON DELETE CASCADE,
  vendor_name            text NOT NULL,
  service_type           text,
  contract_value         numeric(28,12) NOT NULL DEFAULT 0,
  start_date             date,
  end_date               date,
  status                 text NOT NULL DEFAULT 'active',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medoffice_capex_plans (
  capex_plan_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  property_id            uuid NOT NULL REFERENCES medoffice_properties(property_id) ON DELETE CASCADE,
  plan_name              text NOT NULL,
  horizon_years          int NOT NULL DEFAULT 5,
  total_budget           numeric(28,12) NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'draft',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
