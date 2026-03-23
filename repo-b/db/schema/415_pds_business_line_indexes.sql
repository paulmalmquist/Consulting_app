-- 415_pds_business_line_indexes.sql
-- Partial indexes for all new business_line_id columns.

CREATE INDEX IF NOT EXISTS idx_pds_resources_bl
  ON pds_resources (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_projects_bl
  ON pds_projects (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_analytics_projects_bl
  ON pds_analytics_projects (env_id, business_id, business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_analytics_employees_bl
  ON pds_analytics_employees (env_id, business_id, business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_fee_plan_bl
  ON pds_fee_revenue_plan (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_fee_actual_bl
  ON pds_fee_revenue_actual (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_gaap_plan_bl
  ON pds_gaap_revenue_plan (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_gaap_actual_bl
  ON pds_gaap_revenue_actual (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_ci_plan_bl
  ON pds_ci_plan (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_ci_actual_bl
  ON pds_ci_actual (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_backlog_bl
  ON pds_backlog_fact (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_billing_bl
  ON pds_billing_fact (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_collection_bl
  ON pds_collection_fact (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_writeoff_bl
  ON pds_writeoff_fact (business_line_id) WHERE business_line_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.pds_pipeline_deals') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pds_pipeline_bl
      ON pds_pipeline_deals (business_line_id) WHERE business_line_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_pds_pipeline_market
      ON pds_pipeline_deals (market_id) WHERE market_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_pds_pipeline_owner
      ON pds_pipeline_deals (owner_resource_id) WHERE owner_resource_id IS NOT NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_pds_revenue_entries_bl
  ON pds_revenue_entries (env_id, business_id, business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_assignments_bl
  ON pds_project_assignments (business_line_id) WHERE business_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_analytics_assignments_bl
  ON pds_analytics_assignments (env_id, business_id, business_line_id) WHERE business_line_id IS NOT NULL;
