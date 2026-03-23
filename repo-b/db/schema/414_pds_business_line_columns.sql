-- 414_pds_business_line_columns.sql
-- Add business_line_id FK and employee FKs across the PDS schema.
-- All new columns are nullable for backward compatibility.

-- Resources: add primary business line
ALTER TABLE pds_resources
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

-- Analytics employees: add FK-based market/region/BL
ALTER TABLE pds_analytics_employees
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES pds_regions(region_id) ON DELETE SET NULL;

-- Projects: add business line
ALTER TABLE pds_projects
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

-- Analytics projects: add business line
ALTER TABLE pds_analytics_projects
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

-- 10 Accounting fact tables: add business_line_id
ALTER TABLE pds_fee_revenue_plan
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_fee_revenue_actual
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_gaap_revenue_plan
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_gaap_revenue_actual
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_ci_plan
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_ci_actual
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_backlog_fact
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_billing_fact
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_collection_fact
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_writeoff_fact
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

-- Pipeline deals: add BL + market + employee FK when the table is present
ALTER TABLE IF EXISTS pds_pipeline_deals
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES pds_markets(market_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_resource_id uuid REFERENCES pds_resources(resource_id) ON DELETE SET NULL;

-- Assignments: add business line
ALTER TABLE pds_project_assignments
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

ALTER TABLE pds_analytics_assignments
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

-- Revenue entries (370 analytics): add business line
ALTER TABLE pds_revenue_entries
  ADD COLUMN IF NOT EXISTS business_line_id uuid REFERENCES pds_business_lines(business_line_id) ON DELETE SET NULL;

-- Markets: add leader employee FK
ALTER TABLE pds_markets
  ADD COLUMN IF NOT EXISTS leader_resource_id uuid REFERENCES pds_resources(resource_id) ON DELETE SET NULL;

-- Regions: add leader employee FK
ALTER TABLE pds_regions
  ADD COLUMN IF NOT EXISTS leader_resource_id uuid REFERENCES pds_resources(resource_id) ON DELETE SET NULL;

-- Accounts: add owner employee FK
ALTER TABLE pds_accounts
  ADD COLUMN IF NOT EXISTS owner_resource_id uuid REFERENCES pds_resources(resource_id) ON DELETE SET NULL;

ALTER TABLE pds_account_owners
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES pds_resources(resource_id) ON DELETE SET NULL;
