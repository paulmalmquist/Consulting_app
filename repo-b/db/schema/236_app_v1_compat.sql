-- Compatibility patch for operational app/v1 tables used by current APIs and tests.

CREATE SCHEMA IF NOT EXISTS v1;

CREATE TABLE IF NOT EXISTS v1.environments (
  env_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name    text NOT NULL,
  industry       text NOT NULL DEFAULT 'general',
  industry_type  text,
  schema_name    text NOT NULL,
  notes          text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1.executions (
  execution_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid REFERENCES v1.environments(env_id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'queued',
  input_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1.execution_events (
  event_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id   uuid REFERENCES v1.executions(execution_id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  payload_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1.documents (
  doc_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid REFERENCES v1.environments(env_id) ON DELETE CASCADE,
  filename       text NOT NULL,
  status         text NOT NULL DEFAULT 'uploaded',
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v1.pipeline_stages (
  stage_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid REFERENCES v1.environments(env_id) ON DELETE CASCADE,
  key            text NOT NULL,
  label          text NOT NULL,
  sort_order     int NOT NULL DEFAULT 100,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, key)
);

CREATE TABLE IF NOT EXISTS v1.pipeline_cards (
  card_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid REFERENCES v1.environments(env_id) ON DELETE CASCADE,
  stage_id       uuid REFERENCES v1.pipeline_stages(stage_id) ON DELETE CASCADE,
  title          text NOT NULL,
  payload_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order     int NOT NULL DEFAULT 100,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Backward-compatible columns expected by some checks/tools.
ALTER TABLE IF EXISTS app.document_acl
  ADD COLUMN IF NOT EXISTS role_key text;

ALTER TABLE IF EXISTS app.executions
  ADD COLUMN IF NOT EXISTS output_json jsonb NOT NULL DEFAULT '{}'::jsonb;

