-- 292_re_model_version_spine.sql
-- Adds Model > Scenario > Version > Run spine to the RE platform.
-- Model: fund-level container grouping scenarios under a named analytical framework.
-- Version: immutable snapshot of a scenario's assumptions, enabling audit and comparison.

-- ═══════════════════════════════════════════════════════════════════════════
-- re_model: Fund-scoped analytical model container
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_model (
  model_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id      uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'archived')),
  created_by   text,
  approved_at  timestamptz,
  approved_by  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, name)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- re_scenario_version: Immutable snapshot of a scenario under a model
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_scenario_version (
  version_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id        uuid NOT NULL REFERENCES re_scenario(scenario_id) ON DELETE CASCADE,
  model_id           uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  version_number     int NOT NULL DEFAULT 1,
  label              text,
  assumption_set_id  uuid,
  is_locked          boolean NOT NULL DEFAULT false,
  locked_at          timestamptz,
  locked_by          text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, version_number)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Add model_id FK to re_scenario
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 're_scenario' AND column_name = 'model_id'
  ) THEN
    ALTER TABLE re_scenario ADD COLUMN model_id uuid REFERENCES re_model(model_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Add version_id FK to quarter state tables
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 're_asset_quarter_state' AND column_name = 'version_id'
  ) THEN
    ALTER TABLE re_asset_quarter_state ADD COLUMN version_id uuid REFERENCES re_scenario_version(version_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 're_investment_quarter_state' AND column_name = 'version_id'
  ) THEN
    ALTER TABLE re_investment_quarter_state ADD COLUMN version_id uuid REFERENCES re_scenario_version(version_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 're_fund_quarter_state' AND column_name = 'version_id'
  ) THEN
    ALTER TABLE re_fund_quarter_state ADD COLUMN version_id uuid REFERENCES re_scenario_version(version_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_re_model_fund ON re_model(fund_id);
CREATE INDEX IF NOT EXISTS idx_re_scenario_version_scenario ON re_scenario_version(scenario_id);
CREATE INDEX IF NOT EXISTS idx_re_scenario_version_model ON re_scenario_version(model_id);
CREATE INDEX IF NOT EXISTS idx_re_scenario_model ON re_scenario(model_id);
