-- 411_resume_system_components.sql
-- Extends resume environment with system architecture components and deployment framing.
-- Powers the interactive AI Operating System showcase.

-- ── System Architecture Components ──────────────────────────────────

CREATE TABLE IF NOT EXISTS resume_system_components (
  component_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid NOT NULL,
  business_id    uuid NOT NULL,
  layer          text NOT NULL
                 CHECK (layer IN ('data_platform', 'ai_layer', 'investment_engine', 'bi_layer', 'governance')),
  name           text NOT NULL,
  description    text,
  tools          jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcomes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  connections    jsonb NOT NULL DEFAULT '[]'::jsonb,
  icon_key       text,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_sys_comp_env ON resume_system_components (env_id);
CREATE INDEX IF NOT EXISTS idx_resume_sys_comp_biz ON resume_system_components (business_id);

-- ── Deployments (role reframing) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS resume_deployments (
  deployment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id          uuid NOT NULL,
  business_id     uuid NOT NULL,
  role_id         uuid REFERENCES resume_roles(role_id) ON DELETE SET NULL,
  deployment_name text NOT NULL,
  system_type     text NOT NULL
                  CHECK (system_type IN ('data_warehouse', 'ai_platform', 'bi_service_line', 'full_stack_platform')),
  problem         text,
  architecture    text,
  before_state    jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('active', 'completed')),
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_deploy_env ON resume_deployments (env_id);
CREATE INDEX IF NOT EXISTS idx_resume_deploy_biz ON resume_deployments (business_id);
