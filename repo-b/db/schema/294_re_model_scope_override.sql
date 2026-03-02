-- 294_re_model_scope_override.sql
-- Extends re_model with strategy/snapshot fields.
-- Adds model scope (entity selection) and model override (assumption deltas) tables.

-- ═══════════════════════════════════════════════════════════════════════════
-- Extend re_model with strategy_type, base_snapshot_id, updated_at
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE re_model
  ADD COLUMN IF NOT EXISTS base_snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS strategy_type text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$ BEGIN
  ALTER TABLE re_model
    ADD CONSTRAINT chk_re_model_strategy_type
    CHECK (strategy_type IS NULL OR strategy_type IN ('equity', 'credit', 'cmbs', 'mixed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- re_model_scope: which entities are in-scope for this model
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_model_scope (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  scope_type    text NOT NULL
    CHECK (scope_type IN ('fund', 'investment', 'jv', 'asset')),
  scope_node_id uuid NOT NULL,
  include       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, scope_type, scope_node_id)
);

CREATE INDEX IF NOT EXISTS idx_re_model_scope_model ON re_model_scope(model_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- re_model_override: assumption overrides scoped to a model
-- Mirrors re_assumption_override but keyed on model_id
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_model_override (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  scope_node_type text NOT NULL
    CHECK (scope_node_type IN ('fund', 'investment', 'jv', 'asset')),
  scope_node_id   uuid NOT NULL,
  key             text NOT NULL,
  value_type      text NOT NULL DEFAULT 'decimal'
    CHECK (value_type IN ('decimal', 'int', 'string', 'bool', 'curve_json')),
  value_decimal   numeric(28,12),
  value_int       int,
  value_text      text,
  value_json      jsonb,
  reason          text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, scope_node_type, scope_node_id, key)
);

CREATE INDEX IF NOT EXISTS idx_re_model_override_model ON re_model_override(model_id);
