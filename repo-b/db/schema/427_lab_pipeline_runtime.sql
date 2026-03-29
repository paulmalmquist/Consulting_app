-- Durable v1 pipeline runtime columns for backend-owned Demo Lab routes.

ALTER TABLE IF EXISTS v1.pipeline_stages
  ADD COLUMN IF NOT EXISTS color_token text;

ALTER TABLE IF EXISTS v1.pipeline_stages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS v1.pipeline_cards
  ADD COLUMN IF NOT EXISTS account_name text;

ALTER TABLE IF EXISTS v1.pipeline_cards
  ADD COLUMN IF NOT EXISTS owner text;

ALTER TABLE IF EXISTS v1.pipeline_cards
  ADD COLUMN IF NOT EXISTS value_cents bigint;

ALTER TABLE IF EXISTS v1.pipeline_cards
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';

ALTER TABLE IF EXISTS v1.pipeline_cards
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE IF EXISTS v1.pipeline_cards
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE IF EXISTS v1.pipeline_cards
  ADD COLUMN IF NOT EXISTS rank int NOT NULL DEFAULT 100;

ALTER TABLE IF EXISTS v1.pipeline_cards
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_v1_pipeline_stages_env_sort
  ON v1.pipeline_stages (env_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_v1_pipeline_cards_env_rank
  ON v1.pipeline_cards (env_id, rank, created_at);

CREATE INDEX IF NOT EXISTS idx_v1_pipeline_cards_stage_rank
  ON v1.pipeline_cards (stage_id, rank, created_at);
