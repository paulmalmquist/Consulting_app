-- 314_pds_executive_integration.sql
-- Connector runs, communication ingestion records, and integration configs.

CREATE TABLE IF NOT EXISTS pds_exec_connector_run (
  connector_run_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  connector_key        text NOT NULL,
  run_mode             text NOT NULL DEFAULT 'live',
  status               text NOT NULL DEFAULT 'running',
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  rows_read            int NOT NULL DEFAULT 0,
  rows_written         int NOT NULL DEFAULT 0,
  error_summary        text,
  payload_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_artifact_path    text,
  token_cost           numeric(18,6) NOT NULL DEFAULT 0,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pds_exec_connector_mode CHECK (run_mode IN ('live', 'mock', 'manual')),
  CONSTRAINT chk_pds_exec_connector_status CHECK (status IN ('running', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_pds_exec_connector_recent
  ON pds_exec_connector_run (env_id, business_id, connector_key, started_at DESC);

CREATE TABLE IF NOT EXISTS pds_exec_comm_item (
  comm_item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  provider             text NOT NULL,
  external_id          text NOT NULL,
  thread_id            text,
  comm_type            text NOT NULL,
  direction            text NOT NULL DEFAULT 'inbound',
  subject              text,
  sender               text,
  recipients_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at          timestamptz,
  body_text            text,
  summary_text         text,
  classification       text NOT NULL DEFAULT 'unknown',
  decision_code        text REFERENCES pds_exec_decision_catalog(decision_code) ON DELETE SET NULL,
  project_id           uuid REFERENCES pds_projects(project_id) ON DELETE SET NULL,
  metadata_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id),
  CONSTRAINT chk_pds_exec_comm_type CHECK (comm_type IN ('email', 'calendar_event', 'meeting_transcript', 'message')),
  CONSTRAINT chk_pds_exec_comm_direction CHECK (direction IN ('inbound', 'outbound', 'internal')),
  CONSTRAINT chk_pds_exec_comm_classification CHECK (
    classification IN ('decision_request', 'delegation', 'status_update', 'risk_alert', 'noise', 'unknown')
  )
);

CREATE INDEX IF NOT EXISTS idx_pds_exec_comm_recent
  ON pds_exec_comm_item (env_id, business_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_exec_comm_classification
  ON pds_exec_comm_item (env_id, business_id, classification, occurred_at DESC);

CREATE TABLE IF NOT EXISTS pds_exec_integration_config (
  integration_config_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id             uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  provider_key            text NOT NULL,
  display_name            text,
  config_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref              text,
  is_enabled              boolean NOT NULL DEFAULT true,
  last_validated_at       timestamptz,
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by              text,
  updated_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, provider_key)
);

CREATE INDEX IF NOT EXISTS idx_pds_exec_integration_enabled
  ON pds_exec_integration_config (env_id, business_id, is_enabled, provider_key);
