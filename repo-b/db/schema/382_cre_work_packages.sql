-- CRE Intelligence: Work Packages (curated MCP tool chain workflows)
-- Enables Cherre-style "Action Blocks" via declarative tool_chain definitions.

CREATE TABLE IF NOT EXISTS cre_work_package (
  package_key         text PRIMARY KEY,
  display_name        text NOT NULL,
  description         text,
  category            text NOT NULL CHECK (category IN (
    'due_diligence', 'market_analysis', 'outreach', 'risk', 'reporting'
  )),
  tool_chain          jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_cost_usd  numeric(10,2),
  estimated_duration_s int,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cre_work_package_run (
  run_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL,
  business_id         uuid NOT NULL REFERENCES business(business_id),
  package_key         text NOT NULL REFERENCES cre_work_package(package_key),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
  inputs              jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs             jsonb NOT NULL DEFAULT '{}'::jsonb,
  step_results        jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cost_usd      numeric(10,2),
  total_duration_ms   int,
  error_summary       text,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_by          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpr_env ON cre_work_package_run (env_id, business_id);
CREATE INDEX IF NOT EXISTS idx_wpr_package ON cre_work_package_run (package_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpr_status ON cre_work_package_run (status) WHERE status IN ('pending', 'running');

-- RLS on runs (env-scoped), packages are shared catalog
ALTER TABLE cre_work_package_run ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cre_work_package_run_tenant_isolation ON cre_work_package_run;
CREATE POLICY cre_work_package_run_tenant_isolation
  ON cre_work_package_run
  USING (
    business_id IN (
      SELECT b.business_id FROM business b WHERE b.tenant_id = current_setting('app.tenant_id', true)::uuid
    )
  );
