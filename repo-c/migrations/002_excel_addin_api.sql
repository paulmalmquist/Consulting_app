-- Excel add-in support metadata.

CREATE SCHEMA IF NOT EXISTS platform;

ALTER TABLE IF EXISTS platform.environments
  ADD COLUMN IF NOT EXISTS pipeline_stage_name text;

CREATE INDEX IF NOT EXISTS idx_audit_log_workbook_id
  ON platform.audit_log ((details ->> 'workbook_id'));
