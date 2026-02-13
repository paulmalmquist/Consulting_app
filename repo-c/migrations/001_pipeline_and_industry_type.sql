-- Adds environment industry_type and pipeline stage/card model.
-- Idempotent so it can run safely on existing environments.

CREATE SCHEMA IF NOT EXISTS platform;

ALTER TABLE IF EXISTS platform.environments
  ADD COLUMN IF NOT EXISTS industry_type text;

UPDATE platform.environments
SET industry_type = industry
WHERE industry_type IS NULL OR btrim(industry_type) = '';

ALTER TABLE IF EXISTS platform.environments
  ALTER COLUMN industry_type SET DEFAULT 'general';

CREATE TABLE IF NOT EXISTS platform.pipeline_stages (
  stage_id uuid PRIMARY KEY,
  env_id uuid NOT NULL REFERENCES platform.environments(env_id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  stage_name text NOT NULL,
  order_index int NOT NULL,
  color_token text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.pipeline_cards (
  card_id uuid PRIMARY KEY,
  env_id uuid NOT NULL REFERENCES platform.environments(env_id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES platform.pipeline_stages(stage_id),
  title text NOT NULL,
  account_name text,
  owner text,
  value_cents bigint,
  priority text NOT NULL DEFAULT 'medium',
  rank int NOT NULL DEFAULT 100,
  due_date date,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_env_active
  ON platform.pipeline_stages (env_id, order_index)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_pipeline_cards_env_active
  ON platform.pipeline_cards (env_id, stage_id, rank)
  WHERE is_deleted = false;
