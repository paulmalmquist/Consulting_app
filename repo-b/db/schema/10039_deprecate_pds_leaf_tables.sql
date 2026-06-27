-- 10039_deprecate_pds_leaf_tables.sql
-- Deprecate the PDS analytics surface (Phase: PDS retirement). These 64 pds_* LEAF tables held the
-- PDS demo/analytics data; the data was exported (local NDJSON + gs://novendor-db-backups/supabase/)
-- and truncated, then dropped here. The 24 FK-referenced pds_* dimension tables are KEPT because the
-- Capital Projects (cp_*) module has real data depending on pds_projects/contracts/vendors.
-- Reversible: re-create from the pds schema migrations + re-seed (pds_analytics_seed.py) or restore
-- from the backup. IF EXISTS so this is idempotent and safe on a fresh CI database.

DROP TABLE IF EXISTS public."pds_account_owners" CASCADE;
DROP TABLE IF EXISTS public."pds_account_performance_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_analytics_timecards" CASCADE;
DROP TABLE IF EXISTS public."pds_backlog_fact" CASCADE;
DROP TABLE IF EXISTS public."pds_billing_fact" CASCADE;
DROP TABLE IF EXISTS public."pds_budget_lines" CASCADE;
DROP TABLE IF EXISTS public."pds_budget_revisions" CASCADE;
DROP TABLE IF EXISTS public."pds_business_line_performance_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_capacity_plans" CASCADE;
DROP TABLE IF EXISTS public."pds_change_orders" CASCADE;
DROP TABLE IF EXISTS public."pds_ci_actual" CASCADE;
DROP TABLE IF EXISTS public."pds_ci_plan" CASCADE;
DROP TABLE IF EXISTS public."pds_client_satisfaction_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_client_survey_responses" CASCADE;
DROP TABLE IF EXISTS public."pds_closeout_records" CASCADE;
DROP TABLE IF EXISTS public."pds_closeout_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_collection_fact" CASCADE;
DROP TABLE IF EXISTS public."pds_commitment_lines" CASCADE;
DROP TABLE IF EXISTS public."pds_contractor_claims" CASCADE;
DROP TABLE IF EXISTS public."pds_documents" CASCADE;
DROP TABLE IF EXISTS public."pds_exception" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_briefing_pack" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_comm_item" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_connector_run" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_integration_config" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_kpi_daily" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_narrative_draft" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_outcome" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_queue_action" CASCADE;
DROP TABLE IF EXISTS public."pds_exec_threshold_policy" CASCADE;
DROP TABLE IF EXISTS public."pds_fee_revenue_actual" CASCADE;
DROP TABLE IF EXISTS public."pds_fee_revenue_plan" CASCADE;
DROP TABLE IF EXISTS public."pds_forecast_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_forecast_versions" CASCADE;
DROP TABLE IF EXISTS public."pds_gaap_revenue_actual" CASCADE;
DROP TABLE IF EXISTS public."pds_gaap_revenue_plan" CASCADE;
DROP TABLE IF EXISTS public."pds_incidents" CASCADE;
DROP TABLE IF EXISTS public."pds_inspections" CASCADE;
DROP TABLE IF EXISTS public."pds_leader_coverage" CASCADE;
DROP TABLE IF EXISTS public."pds_market_performance_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_milestones" CASCADE;
DROP TABLE IF EXISTS public."pds_nps_responses" CASCADE;
DROP TABLE IF EXISTS public."pds_payments" CASCADE;
DROP TABLE IF EXISTS public."pds_permits" CASCADE;
DROP TABLE IF EXISTS public."pds_photos" CASCADE;
DROP TABLE IF EXISTS public."pds_pipeline_deal_stage_history" CASCADE;
DROP TABLE IF EXISTS public."pds_pipeline_snapshot_daily" CASCADE;
DROP TABLE IF EXISTS public."pds_portfolio_snapshots" CASCADE;
DROP TABLE IF EXISTS public."pds_project_assignments" CASCADE;
DROP TABLE IF EXISTS public."pds_project_health_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_punch_items" CASCADE;
DROP TABLE IF EXISTS public."pds_report_runs" CASCADE;
DROP TABLE IF EXISTS public."pds_resource_utilization_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_revenue_entries" CASCADE;
DROP TABLE IF EXISTS public."pds_risk_snapshots" CASCADE;
DROP TABLE IF EXISTS public."pds_risks" CASCADE;
DROP TABLE IF EXISTS public."pds_satisfaction_rollups" CASCADE;
DROP TABLE IF EXISTS public."pds_schedule_snapshots" CASCADE;
DROP TABLE IF EXISTS public."pds_survey_responses" CASCADE;
DROP TABLE IF EXISTS public."pds_technology_adoption" CASCADE;
DROP TABLE IF EXISTS public."pds_timecard_health_snapshot" CASCADE;
DROP TABLE IF EXISTS public."pds_timecards" CASCADE;
DROP TABLE IF EXISTS public."pds_vendor_score_snapshots" CASCADE;
DROP TABLE IF EXISTS public."pds_writeoff_fact" CASCADE;
