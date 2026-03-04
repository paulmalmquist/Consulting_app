-- 306_cross_fund_models.sql
-- Transforms the model architecture from fund-scoped to cross-fund.
-- Adds scenario workspace, asset plucking, cash flow overrides, and run engine tables.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1a. Make re_model cross-fund capable
-- ═══════════════════════════════════════════════════════════════════════════

-- Add env_id for environment-level scoping
ALTER TABLE re_model ADD COLUMN IF NOT EXISTS env_id uuid;

-- Rename fund_id → primary_fund_id (optional context, not hard scope)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 're_model' AND column_name = 'fund_id'
  ) THEN
    ALTER TABLE re_model RENAME COLUMN fund_id TO primary_fund_id;
  END IF;
END $$;

-- Make primary_fund_id nullable
ALTER TABLE re_model ALTER COLUMN primary_fund_id DROP NOT NULL;

-- Drop old unique constraint and create new one
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 're_model_fund_id_name_key' AND table_name = 're_model'
  ) THEN
    ALTER TABLE re_model DROP CONSTRAINT re_model_fund_id_name_key;
  END IF;
END $$;

-- New unique: (env_id, name) — models are unique per environment
DO $$ BEGIN
  ALTER TABLE re_model ADD CONSTRAINT re_model_env_name_key UNIQUE (env_id, name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_re_model_env ON re_model(env_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1b. re_model_scenarios: child scenarios under a model
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_model_scenarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  is_base       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, name)
);

CREATE INDEX IF NOT EXISTS idx_re_model_scenarios_model ON re_model_scenarios(model_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1c. re_model_scenario_assets: assets plucked into a scenario from any fund
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_model_scenario_assets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id           uuid NOT NULL REFERENCES re_model_scenarios(id) ON DELETE CASCADE,
  asset_id              uuid NOT NULL REFERENCES repe_asset(asset_id),
  source_fund_id        uuid REFERENCES repe_fund(fund_id),
  source_investment_id  uuid,
  added_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_re_model_scenario_assets_scenario ON re_model_scenario_assets(scenario_id);
CREATE INDEX IF NOT EXISTS idx_re_model_scenario_assets_asset ON re_model_scenario_assets(asset_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1d. re_scenario_overrides: per-scenario cash flow assumption overrides
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_scenario_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id   uuid NOT NULL REFERENCES re_model_scenarios(id) ON DELETE CASCADE,
  scope_type    text NOT NULL CHECK (scope_type IN ('asset', 'investment', 'fund')),
  scope_id      uuid NOT NULL,
  key           text NOT NULL,
  value_json    jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, scope_type, scope_id, key)
);

CREATE INDEX IF NOT EXISTS idx_re_scenario_overrides_scenario ON re_scenario_overrides(scenario_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1e. re_model_runs: scenario run results
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_model_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id  uuid,
  scenario_id       uuid NOT NULL REFERENCES re_model_scenarios(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed')),
  started_at        timestamptz,
  finished_at       timestamptz,
  inputs_hash       text,
  engine_version    text DEFAULT '1.0',
  outputs_json      jsonb,
  summary_json      jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_model_runs_scenario ON re_model_runs(scenario_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1f. Asset cash flow schedule tables
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS asset_revenue_schedule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  period_date date NOT NULL,
  revenue     numeric(28,12) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_date)
);

CREATE INDEX IF NOT EXISTS idx_asset_revenue_schedule_asset ON asset_revenue_schedule(asset_id);

CREATE TABLE IF NOT EXISTS asset_expense_schedule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  period_date date NOT NULL,
  expense     numeric(28,12) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_date)
);

CREATE INDEX IF NOT EXISTS idx_asset_expense_schedule_asset ON asset_expense_schedule(asset_id);

CREATE TABLE IF NOT EXISTS asset_amort_schedule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  period_date   date NOT NULL,
  amort_amount  numeric(28,12) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_date)
);

CREATE INDEX IF NOT EXISTS idx_asset_amort_schedule_asset ON asset_amort_schedule(asset_id);
