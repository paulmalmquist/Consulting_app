-- 267_repe_fund_workflow.sql
-- PR0.5: REPE workflow hardening for fund wizard + entity-attached documents.

-- -----------------------------------------------------------------------------
-- Fund metadata expansion
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS repe_fund
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS inception_date date,
  ADD COLUMN IF NOT EXISTS quarter_cadence text NOT NULL DEFAULT 'quarterly',
  ADD COLUMN IF NOT EXISTS target_sectors_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_geographies_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_leverage_min numeric(18,12),
  ADD COLUMN IF NOT EXISTS target_leverage_max numeric(18,12),
  ADD COLUMN IF NOT EXISTS target_hold_period_min_years int,
  ADD COLUMN IF NOT EXISTS target_hold_period_max_years int,
  ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS repe_fund
  DROP CONSTRAINT IF EXISTS chk_repe_fund_quarter_cadence;

ALTER TABLE IF EXISTS repe_fund
  ADD CONSTRAINT chk_repe_fund_quarter_cadence
  CHECK (quarter_cadence IN ('monthly', 'quarterly', 'semi_annual', 'annual'));

-- -----------------------------------------------------------------------------
-- Seeded defaults: scenario + waterfall definition + ownership setup
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repe_fund_scenario (
  scenario_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id          uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  name             text NOT NULL,
  scenario_type    text NOT NULL DEFAULT 'base' CHECK (scenario_type IN ('base', 'stress', 'upside', 'downside', 'custom')),
  is_base          boolean NOT NULL DEFAULT false,
  assumptions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repe_fund_scenario_single_base
  ON repe_fund_scenario (fund_id)
  WHERE is_base = true;

CREATE TABLE IF NOT EXISTS repe_fund_waterfall_definition (
  waterfall_definition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id                 uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  name                    text NOT NULL DEFAULT 'Default Waterfall',
  style                   text NOT NULL CHECK (style IN ('european', 'american')),
  definition_json         jsonb NOT NULL,
  is_default              boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repe_fund_waterfall_single_default
  ON repe_fund_waterfall_definition (fund_id)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS repe_fund_entity_link (
  fund_entity_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id             uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  entity_id           uuid NOT NULL REFERENCES repe_entity(entity_id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('gp', 'lp', 'manager')),
  ownership_percent   numeric(18,12),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, entity_id, role)
);

-- -----------------------------------------------------------------------------
-- Documents: backend-authoritative entity attachments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.document_entity_links (
  document_entity_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id             uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  env_id                  uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  entity_type             text NOT NULL CHECK (entity_type IN ('fund', 'investment', 'asset')),
  entity_id               uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, env_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_entity_links_lookup
  ON app.document_entity_links (env_id, entity_type, entity_id, created_at DESC);
