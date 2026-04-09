-- Compatibility patch for operational app/v1 tables used by current APIs and tests.

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS v1;

-- Bootstrap the legacy app schema expected by later numbered migrations and
-- by the backend services. Clean installs cannot assume these tables preexist.

CREATE TABLE IF NOT EXISTS app.tenants (
  tenant_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.businesses (
  business_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE,
  region         text NOT NULL DEFAULT 'us',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.departments (
  department_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text NOT NULL UNIQUE,
  label          text NOT NULL,
  icon           text,
  sort_order     int NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS app.capabilities (
  capability_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  uuid NOT NULL REFERENCES app.departments(department_id) ON DELETE CASCADE,
  key            text NOT NULL,
  label          text NOT NULL,
  kind           text NOT NULL DEFAULT 'action',
  sort_order     int NOT NULL DEFAULT 100,
  metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (department_id, key)
);

CREATE TABLE IF NOT EXISTS app.templates (
  key            text PRIMARY KEY,
  label          text NOT NULL,
  description    text,
  departments    jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities   jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS app.environments (
  env_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name       text NOT NULL,
  industry          text NOT NULL DEFAULT 'general',
  industry_type     text,
  schema_name       text NOT NULL,
  notes             text,
  is_active         boolean NOT NULL DEFAULT true,
  business_id       uuid REFERENCES app.businesses(business_id) ON DELETE SET NULL,
  repe_initialized  boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.business_departments (
  business_id          uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  department_id        uuid NOT NULL REFERENCES app.departments(department_id) ON DELETE CASCADE,
  enabled              boolean NOT NULL DEFAULT true,
  environment_id       uuid REFERENCES app.environments(env_id) ON DELETE CASCADE,
  sort_order_override  int,
  PRIMARY KEY (business_id, department_id)
);
ALTER TABLE app.business_departments ADD COLUMN IF NOT EXISTS environment_id uuid REFERENCES app.environments(env_id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS app.business_capabilities (
  business_id          uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  capability_id        uuid NOT NULL REFERENCES app.capabilities(capability_id) ON DELETE CASCADE,
  enabled              boolean NOT NULL DEFAULT true,
  environment_id       uuid REFERENCES app.environments(env_id) ON DELETE CASCADE,
  sort_order_override  int,
  PRIMARY KEY (business_id, capability_id)
);
ALTER TABLE app.business_capabilities ADD COLUMN IF NOT EXISTS environment_id uuid REFERENCES app.environments(env_id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS app.executions (
  execution_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  department_id   uuid REFERENCES app.departments(department_id) ON DELETE SET NULL,
  capability_id   uuid REFERENCES app.capabilities(capability_id) ON DELETE SET NULL,
  env_id          uuid REFERENCES app.environments(env_id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'queued',
  input_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_type  text,
  result_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  logs_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.departments (key, label, icon, sort_order)
VALUES
  ('projects', 'Projects', 'briefcase', 10),
  ('finance', 'Finance', 'wallet', 20),
  ('legal', 'Legal', 'scale', 30),
  ('operations', 'Operations', 'settings', 40),
  ('executive', 'Executive', 'sparkles', 50),
  ('accounting', 'Accounting', 'calculator', 60),
  ('reporting', 'Reporting', 'bar-chart', 70),
  ('documents', 'Documents', 'file-text', 80),
  ('crm', 'CRM', 'users', 90),
  ('compliance', 'Compliance', 'shield', 100),
  ('hr', 'HR', 'user-round', 110),
  ('real-estate', 'Real Estate', 'building', 120)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS v1.environments (
  env_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name    text NOT NULL,
  industry       text NOT NULL DEFAULT 'general',
  industry_type  text,
  schema_name    text NOT NULL,
  notes          text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1.executions (
  execution_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid REFERENCES v1.environments(env_id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'queued',
  input_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1.execution_events (
  event_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id   uuid REFERENCES v1.executions(execution_id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  payload_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1.documents (
  doc_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid REFERENCES v1.environments(env_id) ON DELETE CASCADE,
  filename       text NOT NULL,
  status         text NOT NULL DEFAULT 'uploaded',
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1.pipeline_stages (
  stage_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid REFERENCES v1.environments(env_id) ON DELETE CASCADE,
  key            text NOT NULL,
  label          text NOT NULL,
  sort_order     int NOT NULL DEFAULT 100,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, key)
);

CREATE TABLE IF NOT EXISTS v1.pipeline_cards (
  card_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid REFERENCES v1.environments(env_id) ON DELETE CASCADE,
  stage_id       uuid REFERENCES v1.pipeline_stages(stage_id) ON DELETE CASCADE,
  title          text NOT NULL,
  payload_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order     int NOT NULL DEFAULT 100,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Backward-compatible columns expected by some checks/tools.
ALTER TABLE IF EXISTS app.document_acl
  ADD COLUMN IF NOT EXISTS role_key text;

ALTER TABLE IF EXISTS app.executions
  ADD COLUMN IF NOT EXISTS output_json jsonb NOT NULL DEFAULT '{}'::jsonb;
