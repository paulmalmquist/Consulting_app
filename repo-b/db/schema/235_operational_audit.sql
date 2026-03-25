-- 235_operational_audit.sql
-- Operational hardening: ensure audit table exists for app-layer audit hooks.

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.audit_events (
  audit_event_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  business_id     uuid,
  actor           text NOT NULL,
  action          text NOT NULL,
  tool_name       text NOT NULL,
  object_type     text,
  object_id       uuid,
  success         boolean NOT NULL DEFAULT true,
  latency_ms      int NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  input_redacted  jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx
  ON app.audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_tool_success_idx
  ON app.audit_events (tool_name, success, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_business_idx
  ON app.audit_events (business_id, created_at DESC);
