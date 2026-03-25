-- 950_indexes.sql
-- Performance indexes for common query patterns.
-- All indexes use IF NOT EXISTS for idempotency.

-- ═══════════════════════════════════════════════════════
-- BACKBONE
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS business_tenant_idx ON business (tenant_id);
CREATE INDEX IF NOT EXISTS actor_tenant_idx ON actor (tenant_id);
CREATE INDEX IF NOT EXISTS role_tenant_idx ON role (tenant_id);
CREATE INDEX IF NOT EXISTS object_tenant_business_idx ON object (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS object_tenant_type_idx ON object (tenant_id, object_type_id);

-- object_version: find current version fast
-- (unique partial index already exists from 010_backbone.sql)
CREATE INDEX IF NOT EXISTS object_version_object_created_idx
  ON object_version (object_id, created_at DESC);

-- event_log: time-ordered per tenant
CREATE INDEX IF NOT EXISTS event_log_tenant_created_idx
  ON event_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_log_tenant_object_idx
  ON event_log (tenant_id, object_id) WHERE object_id IS NOT NULL;

-- attachment: by object
CREATE INDEX IF NOT EXISTS attachment_tenant_object_idx
  ON attachment (tenant_id, object_id) WHERE object_id IS NOT NULL;

-- tag: by tenant + key
CREATE INDEX IF NOT EXISTS tag_tenant_key_idx ON tag (tenant_id, key);

-- dataset & lineage
CREATE INDEX IF NOT EXISTS dataset_tenant_key_idx ON dataset (tenant_id, key);
CREATE INDEX IF NOT EXISTS dataset_version_dataset_idx
  ON dataset_version (dataset_id, version DESC);
CREATE INDEX IF NOT EXISTS rule_set_tenant_key_idx ON rule_set (tenant_id, key);
CREATE INDEX IF NOT EXISTS rule_version_rule_set_idx
  ON rule_version (rule_set_id, version DESC);
CREATE INDEX IF NOT EXISTS run_tenant_created_idx ON run (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS run_tenant_status_idx ON run (tenant_id, status);

-- ═══════════════════════════════════════════════════════
-- REPORTING
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS metric_tenant_key_idx ON metric (tenant_id, key);
CREATE INDEX IF NOT EXISTS dimension_tenant_key_idx ON dimension (tenant_id, key);
CREATE INDEX IF NOT EXISTS report_tenant_key_idx ON report (tenant_id, key);
CREATE INDEX IF NOT EXISTS dashboard_tenant_key_idx ON dashboard (tenant_id, key);
CREATE INDEX IF NOT EXISTS insight_tenant_created_idx
  ON insight (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS insight_tenant_business_idx
  ON insight (tenant_id, business_id) WHERE business_id IS NOT NULL;

-- fact_measurement: the primary analytical query surface
CREATE INDEX IF NOT EXISTS fact_measurement_tenant_business_metric_idx
  ON fact_measurement (tenant_id, business_id, metric_id);
CREATE INDEX IF NOT EXISTS fact_measurement_tenant_date_idx
  ON fact_measurement (tenant_id, date_key);
CREATE INDEX IF NOT EXISTS fact_measurement_run_idx
  ON fact_measurement (run_id);

-- fact_status_timeline
CREATE INDEX IF NOT EXISTS fact_status_timeline_tenant_object_idx
  ON fact_status_timeline (tenant_id, object_id, transitioned_at DESC);

-- ═══════════════════════════════════════════════════════
-- MODULE REGISTRY
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS business_module_business_idx
  ON business_module (business_id);

-- ═══════════════════════════════════════════════════════
-- ACCOUNTING
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS account_tenant_business_idx
  ON account (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS account_tenant_code_idx
  ON account (tenant_id, business_id, code);
CREATE INDEX IF NOT EXISTS counterparty_tenant_business_idx
  ON counterparty (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS journal_entry_tenant_business_idx
  ON journal_entry (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS journal_entry_tenant_date_idx
  ON journal_entry (tenant_id, business_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_line_entry_idx
  ON journal_line (journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_line_account_idx
  ON journal_line (account_id);
CREATE INDEX IF NOT EXISTS invoice_ar_tenant_business_idx
  ON invoice_ar (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS invoice_ar_tenant_status_idx
  ON invoice_ar (tenant_id, business_id, status);
CREATE INDEX IF NOT EXISTS bill_ap_tenant_business_idx
  ON bill_ap (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS bill_ap_tenant_status_idx
  ON bill_ap (tenant_id, business_id, status);
CREATE INDEX IF NOT EXISTS payment_tenant_business_idx
  ON payment (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS payment_tenant_date_idx
  ON payment (tenant_id, business_id, payment_date DESC);

-- ═══════════════════════════════════════════════════════
-- PROJECTS
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS project_tenant_business_idx
  ON project (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS project_tenant_status_idx
  ON project (tenant_id, business_id, status);
CREATE INDEX IF NOT EXISTS wbs_project_idx
  ON work_breakdown_item (project_id, sort_order);
CREATE INDEX IF NOT EXISTS milestone_project_idx
  ON milestone (project_id);
CREATE INDEX IF NOT EXISTS time_entry_timesheet_idx
  ON time_entry (timesheet_id);
CREATE INDEX IF NOT EXISTS time_entry_project_date_idx
  ON time_entry (project_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS issue_project_status_idx
  ON issue (project_id, status);
CREATE INDEX IF NOT EXISTS risk_project_status_idx
  ON risk (project_id, status);

-- ═══════════════════════════════════════════════════════
-- PROPERTY
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS property_tenant_business_idx
  ON property (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS unit_property_idx
  ON unit (property_id);
CREATE INDEX IF NOT EXISTS lease_tenant_business_idx
  ON lease (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS lease_property_idx
  ON lease (property_id);
CREATE INDEX IF NOT EXISTS lease_status_idx
  ON lease (tenant_id, business_id, status);
CREATE INDEX IF NOT EXISTS work_order_property_idx
  ON work_order (property_id);
CREATE INDEX IF NOT EXISTS rent_roll_snapshot_property_date_idx
  ON rent_roll_snapshot (property_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS rent_roll_snapshot_run_idx
  ON rent_roll_snapshot (run_id);
CREATE INDEX IF NOT EXISTS loan_tenant_business_idx
  ON loan (tenant_id, business_id);

-- ═══════════════════════════════════════════════════════
-- MILESTONES
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS milestone_template_tenant_business_idx
  ON milestone_template (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS milestone_instance_tenant_object_idx
  ON milestone_instance (tenant_id, object_id);
CREATE INDEX IF NOT EXISTS milestone_instance_status_idx
  ON milestone_instance (tenant_id, business_id, status);
CREATE INDEX IF NOT EXISTS milestone_event_instance_idx
  ON milestone_event (milestone_instance_id, created_at DESC);

-- ═══════════════════════════════════════════════════════
-- CRM Native
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS crm_account_tenant_business_idx
  ON crm_account (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS crm_account_counterparty_idx
  ON crm_account (counterparty_id) WHERE counterparty_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_contact_tenant_business_idx
  ON crm_contact (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS crm_contact_account_idx
  ON crm_contact (crm_account_id) WHERE crm_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_pipeline_stage_tenant_business_idx
  ON crm_pipeline_stage (tenant_id, business_id, stage_order);

CREATE INDEX IF NOT EXISTS crm_opportunity_tenant_business_idx
  ON crm_opportunity (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS crm_opportunity_stage_idx
  ON crm_opportunity (crm_pipeline_stage_id) WHERE crm_pipeline_stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_opportunity_status_idx
  ON crm_opportunity (tenant_id, business_id, status);
CREATE INDEX IF NOT EXISTS crm_opportunity_expected_close_idx
  ON crm_opportunity (tenant_id, business_id, expected_close_date DESC);

CREATE INDEX IF NOT EXISTS crm_opportunity_stage_history_opp_idx
  ON crm_opportunity_stage_history (crm_opportunity_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS crm_activity_tenant_business_idx
  ON crm_activity (tenant_id, business_id, activity_at DESC);
CREATE INDEX IF NOT EXISTS crm_activity_opportunity_idx
  ON crm_activity (crm_opportunity_id) WHERE crm_opportunity_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════
-- Reporting runtime
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS metric_permission_tenant_metric_idx
  ON metric_permission (tenant_id, metric_id);

CREATE INDEX IF NOT EXISTS report_run_tenant_business_idx
  ON report_run (tenant_id, business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_run_report_idx
  ON report_run (report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_run_status_idx
  ON report_run (tenant_id, status);

CREATE INDEX IF NOT EXISTS report_result_cache_report_hash_idx
  ON report_result_cache (tenant_id, report_id, query_hash);
CREATE INDEX IF NOT EXISTS report_result_cache_expiry_idx
  ON report_result_cache (expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS number_trace_report_run_idx
  ON number_trace (report_run_id);
CREATE INDEX IF NOT EXISTS number_trace_metric_idx
  ON number_trace (tenant_id, business_id, metric_id);
CREATE INDEX IF NOT EXISTS number_trace_row_trace_idx
  ON number_trace_row (number_trace_id);

CREATE INDEX IF NOT EXISTS report_materialization_job_status_idx
  ON report_materialization_job (tenant_id, business_id, status, created_at DESC);
