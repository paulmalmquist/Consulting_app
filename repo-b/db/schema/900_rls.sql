-- 900_rls.sql
-- Row-Level Security policies for all tenant-scoped tables.
-- Uses Supabase JWT pattern: current_setting('request.jwt.claims', true)::json->>'tenant_id'
-- Fallback: service role bypass (postgres role bypasses RLS by default).
--
-- JWT claim shape required:
-- {
--   "tenant_id": "uuid-string",
--   "actor_id": "uuid-string",   -- optional, for audit
--   "role": "authenticated"
-- }
--
-- If auth is not yet wired, the policies are still created but won't
-- block service-role (postgres) connections. They activate when
-- authenticated/anon roles are used.

-- Helper to extract tenant_id from JWT or session setting
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    -- Supabase JWT path
    NULLIF(
      current_setting('request.jwt.claims', true)::json->>'tenant_id',
      ''
    ),
    -- Fallback: app-level session setting (for backend service calls)
    NULLIF(
      current_setting('app.tenant_id', true),
      ''
    )
  )::uuid;
$$;

-- ─────────────────────────────────────────────
-- BACKBONE tables
-- ─────────────────────────────────────────────

ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON tenant
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE business ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY business_isolation ON business
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE actor ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY actor_isolation ON actor
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE role ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY role_isolation ON role
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE object ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY object_isolation ON object
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY event_log_isolation ON event_log
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE attachment ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY attachment_isolation ON attachment
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE tag ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tag_isolation ON tag
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE dataset ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY dataset_isolation ON dataset
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE rule_set ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rule_set_isolation ON rule_set
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE run ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY run_isolation ON run
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- REPORTING tables
-- ─────────────────────────────────────────────

ALTER TABLE metric ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY metric_isolation ON metric
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE dimension ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY dimension_isolation ON dimension
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE report ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY report_isolation ON report
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE dashboard ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY dashboard_isolation ON dashboard
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE insight ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY insight_isolation ON insight
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE saved_query ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY saved_query_isolation ON saved_query
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE fact_measurement ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY fact_measurement_isolation ON fact_measurement
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE fact_status_timeline ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY fact_status_timeline_isolation ON fact_status_timeline
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- ACCOUNTING tables
-- ─────────────────────────────────────────────

ALTER TABLE account ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY account_isolation ON account
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE cost_center ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY cost_center_isolation ON cost_center
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE entity_legal ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY entity_legal_isolation ON entity_legal
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE counterparty ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY counterparty_isolation ON counterparty
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE journal_entry ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY journal_entry_isolation ON journal_entry
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE journal_line ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY journal_line_isolation ON journal_line
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE invoice_ar ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY invoice_ar_isolation ON invoice_ar
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE invoice_line_ar ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY invoice_line_ar_isolation ON invoice_line_ar
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE bill_ap ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY bill_ap_isolation ON bill_ap
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE bill_line_ap ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY bill_line_ap_isolation ON bill_line_ap
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY payment_isolation ON payment
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE reconciliation ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY reconciliation_isolation ON reconciliation
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE close_task ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY close_task_isolation ON close_task
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- PROJECTS tables
-- ─────────────────────────────────────────────

ALTER TABLE project ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY project_isolation ON project
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE work_breakdown_item ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY wbs_isolation ON work_breakdown_item
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE milestone ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY milestone_isolation ON milestone
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE resource ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY resource_isolation ON resource
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE assignment ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY assignment_isolation ON assignment
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE timesheet ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY timesheet_isolation ON timesheet
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE time_entry ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY time_entry_isolation ON time_entry
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE issue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY issue_isolation ON issue
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE risk ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY risk_isolation ON risk
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE change_order ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY change_order_isolation ON change_order
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- PROPERTY tables
-- ─────────────────────────────────────────────

ALTER TABLE property ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY property_isolation ON property
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE unit ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY unit_isolation ON unit
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE tenant_party ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_party_isolation ON tenant_party
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE lease ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY lease_isolation ON lease
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE lease_charge ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY lease_charge_isolation ON lease_charge
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE work_order ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY work_order_isolation ON work_order
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE rent_roll_snapshot ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rent_roll_snapshot_isolation ON rent_roll_snapshot
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE capex_project ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY capex_project_isolation ON capex_project
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE loan ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY loan_isolation ON loan
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE appraisal ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY appraisal_isolation ON appraisal
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- MILESTONES tables
-- ─────────────────────────────────────────────

ALTER TABLE milestone_template ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY milestone_template_isolation ON milestone_template
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE milestone_instance ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY milestone_instance_isolation ON milestone_instance
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE milestone_event ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY milestone_event_isolation ON milestone_event
    USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────
-- MODULE REGISTRY (business_module is business-scoped)
-- ─────────────────────────────────────────────

ALTER TABLE business_module ENABLE ROW LEVEL SECURITY;
-- business_module doesn't have tenant_id directly; join through business.
-- For simplicity, use a subquery policy.
DO $$ BEGIN
  CREATE POLICY business_module_isolation ON business_module
    USING (
      EXISTS (
        SELECT 1 FROM business b
        WHERE b.business_id = business_module.business_id
          AND b.tenant_id = current_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
