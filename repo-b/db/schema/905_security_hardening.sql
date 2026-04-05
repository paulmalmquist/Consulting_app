-- 905_security_hardening.sql
-- Remediates Security Advisor critical findings:
-- 1) RLS disabled on public tables
-- 2) Views running without security_invoker=true

-- ====================================================================
-- RLS: missing tables
-- ====================================================================

ALTER TABLE IF EXISTS actor_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dashboard_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dataset_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dim_currency ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dim_date ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fx_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS metric_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS module ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS module_dependency ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS object_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS object_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS object_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rule_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS run_output ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- Tenant-isolation policies for join/version tables
-- ====================================================================

DO $$ BEGIN
  CREATE POLICY actor_role_isolation ON actor_role
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM actor a
        WHERE a.actor_id = actor_role.actor_id
          AND a.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM actor a
        WHERE a.actor_id = actor_role.actor_id
          AND a.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY role_permission_isolation ON role_permission
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM role r
        WHERE r.role_id = role_permission.role_id
          AND r.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM role r
        WHERE r.role_id = role_permission.role_id
          AND r.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY object_version_isolation ON object_version
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM object o
        WHERE o.object_id = object_version.object_id
          AND o.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM object o
        WHERE o.object_id = object_version.object_id
          AND o.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY object_tag_isolation ON object_tag
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM object o
        WHERE o.object_id = object_tag.object_id
          AND o.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM object o
        WHERE o.object_id = object_tag.object_id
          AND o.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY dataset_version_isolation ON dataset_version
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM dataset d
        WHERE d.dataset_id = dataset_version.dataset_id
          AND d.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM dataset d
        WHERE d.dataset_id = dataset_version.dataset_id
          AND d.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY rule_version_isolation ON rule_version
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM rule_set rs
        WHERE rs.rule_set_id = rule_version.rule_set_id
          AND rs.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM rule_set rs
        WHERE rs.rule_set_id = rule_version.rule_set_id
          AND rs.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY run_output_isolation ON run_output
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM run r
        WHERE r.run_id = run_output.run_id
          AND r.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM run r
        WHERE r.run_id = run_output.run_id
          AND r.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY metric_version_isolation ON metric_version
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM metric m
        WHERE m.metric_id = metric_version.metric_id
          AND m.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM metric m
        WHERE m.metric_id = metric_version.metric_id
          AND m.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY report_version_isolation ON report_version
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM report r
        WHERE r.report_id = report_version.report_id
          AND r.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM report r
        WHERE r.report_id = report_version.report_id
          AND r.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY dashboard_version_isolation ON dashboard_version
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM dashboard d
        WHERE d.dashboard_id = dashboard_version.dashboard_id
          AND d.tenant_id = current_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM dashboard d
        WHERE d.dashboard_id = dashboard_version.dashboard_id
          AND d.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ====================================================================
-- Read-only policies for global/public lookup tables
-- ====================================================================

-- Supabase-managed roles like authenticated do not exist on a plain local
-- Postgres bootstrap. Create a no-login compatibility stub so the policy DDL
-- stays portable while preserving the intended target role name.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

DO $$ BEGIN
  CREATE POLICY permission_read_authenticated ON permission
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY object_type_read_authenticated ON object_type
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY module_read_authenticated ON module
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY module_dependency_read_authenticated ON module_dependency
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY dim_date_read_authenticated ON dim_date
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY dim_currency_read_authenticated ON dim_currency
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY fx_rate_read_authenticated ON fx_rate
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ====================================================================
-- Views: force invoker semantics (remove definer-style execution)
-- ====================================================================

ALTER VIEW IF EXISTS v_lease_active SET (security_invoker = true);
ALTER VIEW IF EXISTS v_milestone_instance_detail SET (security_invoker = true);
ALTER VIEW IF EXISTS v_object_current_version SET (security_invoker = true);
ALTER VIEW IF EXISTS v_project_current SET (security_invoker = true);
ALTER VIEW IF EXISTS v_property_current SET (security_invoker = true);
ALTER VIEW IF EXISTS v_run_detail SET (security_invoker = true);
