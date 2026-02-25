-- 270_re_institutional_model.sql
-- Institutional RE platform: ownership-first hierarchy with deterministic quarterly state,
-- capital/cashflow ledgers, partner model, waterfall runtime, scenario system, and provenance.
--
-- Hierarchy: Fund → Investment (repe_deal) → JV → Asset
-- All financial rollups flow: Asset → JV → Investment → Fund

-- =============================================================================
-- I. ALTER EXISTING TABLES (additive only)
-- =============================================================================

-- Fund: add strategy_type supporting credit/cmbs beyond equity/debt
ALTER TABLE IF EXISTS repe_fund
  ADD COLUMN IF NOT EXISTS strategy_type text;

DO $$ BEGIN
  ALTER TABLE repe_fund
    ADD CONSTRAINT chk_repe_fund_strategy_type
    CHECK (strategy_type IS NULL OR strategy_type IN ('equity', 'credit', 'cmbs'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Deal (= Investment): add capital tracking columns
ALTER TABLE IF EXISTS repe_deal
  ADD COLUMN IF NOT EXISTS committed_capital  numeric(28,12),
  ADD COLUMN IF NOT EXISTS invested_capital   numeric(28,12),
  ADD COLUMN IF NOT EXISTS realized_distributions numeric(28,12);

-- Asset: add JV linkage, acquisition tracking, status
ALTER TABLE IF EXISTS repe_asset
  ADD COLUMN IF NOT EXISTS acquisition_date date,
  ADD COLUMN IF NOT EXISTS cost_basis       numeric(28,12),
  ADD COLUMN IF NOT EXISTS asset_status     text;

DO $$ BEGIN
  ALTER TABLE repe_asset
    ADD CONSTRAINT chk_repe_asset_status
    CHECK (asset_status IS NULL OR asset_status IN (
      'pipeline', 'active', 'held', 'exited', 'written_off'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Property detail: add physical attributes
ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS address   text,
  ADD COLUMN IF NOT EXISTS gross_sf  numeric(18,4),
  ADD COLUMN IF NOT EXISTS year_built int;

-- =============================================================================
-- II. JV ENTITY LAYER
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_jv (
  jv_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id      uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  legal_name         text NOT NULL,
  ownership_percent  numeric(18,12) NOT NULL DEFAULT 1.0
    CHECK (ownership_percent > 0 AND ownership_percent <= 1),
  gp_percent         numeric(18,12)
    CHECK (gp_percent IS NULL OR (gp_percent >= 0 AND gp_percent <= 1)),
  lp_percent         numeric(18,12)
    CHECK (lp_percent IS NULL OR (lp_percent >= 0 AND lp_percent <= 1)),
  promote_structure_id uuid,
  status             text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dissolved', 'pending')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_jv_investment ON re_jv(investment_id);

-- Add JV FK to asset (nullable for backward compat)
ALTER TABLE IF EXISTS repe_asset
  ADD COLUMN IF NOT EXISTS jv_id uuid;

DO $$ BEGIN
  ALTER TABLE repe_asset
    ADD CONSTRAINT fk_repe_asset_jv FOREIGN KEY (jv_id) REFERENCES re_jv(jv_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- III. LOAN DETAIL EXTENSION (credit / cmbs assets)
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_loan_detail (
  asset_id          uuid PRIMARY KEY REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  original_balance  numeric(28,12) NOT NULL,
  current_balance   numeric(28,12) NOT NULL,
  coupon            numeric(18,12),
  maturity_date     date,
  rating            text,
  ltv               numeric(18,12),
  dscr              numeric(18,12),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- IV. ASSET-TO-ACCOUNT MAPPING (GL integration)
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_asset_account_map (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id   uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN (
    'rental_income', 'opex', 'debt_service', 'capex', 'cash',
    'noi', 'nav', 'revenue', 'interest_income'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, account_id, role)
);

CREATE INDEX IF NOT EXISTS idx_re_asset_account_map_asset ON re_asset_account_map(asset_id);

-- =============================================================================
-- V. QUARTERLY STATE TABLES (deterministic snapshots)
-- =============================================================================

-- Asset-level quarterly state (authoritative, written by quarter-close engine)
CREATE TABLE IF NOT EXISTS re_asset_quarter_state (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  quarter           text NOT NULL,
  scenario_id       uuid,
  run_id            uuid NOT NULL,
  accounting_basis  text NOT NULL DEFAULT 'accrual'
    CHECK (accounting_basis IN ('cash', 'accrual')),
  noi               numeric(28,12),
  revenue           numeric(28,12),
  opex              numeric(28,12),
  capex             numeric(28,12),
  debt_service      numeric(28,12),
  occupancy         numeric(18,12),
  debt_balance      numeric(28,12),
  cash_balance      numeric(28,12),
  asset_value       numeric(28,12),
  nav               numeric(28,12),
  valuation_method  text CHECK (valuation_method IS NULL OR valuation_method IN (
    'cap_rate', 'dcf', 'blended', 'market', 'loan_mark'
  )),
  inputs_hash       text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_asset_quarter_state_unique
  ON re_asset_quarter_state(asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_re_asset_quarter_state_run ON re_asset_quarter_state(run_id);

-- JV quarterly state (rollup from assets)
CREATE TABLE IF NOT EXISTS re_jv_quarter_state (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jv_id          uuid NOT NULL REFERENCES re_jv(jv_id) ON DELETE CASCADE,
  quarter        text NOT NULL,
  scenario_id    uuid,
  run_id         uuid NOT NULL,
  nav            numeric(28,12),
  noi            numeric(28,12),
  debt_balance   numeric(28,12),
  cash_balance   numeric(28,12),
  inputs_hash    text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_jv_quarter_state_unique
  ON re_jv_quarter_state(jv_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Investment quarterly state (rollup from JVs)
CREATE TABLE IF NOT EXISTS re_investment_quarter_state (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id          uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  quarter                text NOT NULL,
  scenario_id            uuid,
  run_id                 uuid NOT NULL,
  nav                    numeric(28,12),
  committed_capital      numeric(28,12),
  invested_capital       numeric(28,12),
  realized_distributions numeric(28,12),
  unrealized_value       numeric(28,12),
  gross_irr              numeric(18,12),
  net_irr                numeric(18,12),
  equity_multiple        numeric(18,12),
  inputs_hash            text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_investment_quarter_state_unique
  ON re_investment_quarter_state(investment_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Fund quarterly state (rollup from investments)
CREATE TABLE IF NOT EXISTS re_fund_quarter_state (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id             uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  quarter             text NOT NULL,
  scenario_id         uuid,
  run_id              uuid NOT NULL,
  portfolio_nav       numeric(28,12),
  total_committed     numeric(28,12),
  total_called        numeric(28,12),
  total_distributed   numeric(28,12),
  dpi                 numeric(18,12),
  rvpi                numeric(18,12),
  tvpi                numeric(18,12),
  gross_irr           numeric(18,12),
  net_irr             numeric(18,12),
  weighted_ltv        numeric(18,12),
  weighted_dscr       numeric(18,12),
  inputs_hash         text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_fund_quarter_state_unique
  ON re_fund_quarter_state(fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- =============================================================================
-- VI. PARTNER MODEL
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_partner (
  partner_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  entity_id     uuid REFERENCES repe_entity(entity_id),
  name          text NOT NULL,
  partner_type  text NOT NULL CHECK (partner_type IN ('gp', 'lp', 'co_invest', 'sponsor')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_partner_business ON re_partner(business_id);

CREATE TABLE IF NOT EXISTS re_partner_commitment (
  commitment_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid NOT NULL REFERENCES re_partner(partner_id) ON DELETE CASCADE,
  fund_id          uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  committed_amount numeric(28,12) NOT NULL CHECK (committed_amount > 0),
  commitment_date  date NOT NULL,
  status           text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fully_called', 'cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, fund_id)
);

CREATE TABLE IF NOT EXISTS re_jv_partner_share (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jv_id             uuid NOT NULL REFERENCES re_jv(jv_id) ON DELETE CASCADE,
  partner_id        uuid NOT NULL REFERENCES re_partner(partner_id) ON DELETE CASCADE,
  ownership_percent numeric(18,12) NOT NULL CHECK (ownership_percent > 0 AND ownership_percent <= 1),
  share_class       text NOT NULL DEFAULT 'common'
    CHECK (share_class IN ('common', 'pref', 'promote')),
  effective_from    date NOT NULL,
  effective_to      date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jv_id, partner_id, share_class, effective_from)
);

-- =============================================================================
-- VII. CAPITAL LEDGER (append-only, immutable entries)
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_capital_ledger_entry (
  entry_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id         uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  investment_id   uuid REFERENCES repe_deal(deal_id),
  jv_id           uuid REFERENCES re_jv(jv_id),
  partner_id      uuid NOT NULL REFERENCES re_partner(partner_id),
  entry_type      text NOT NULL CHECK (entry_type IN (
    'commitment', 'contribution', 'distribution', 'fee',
    'recallable_dist', 'trueup', 'reversal'
  )),
  amount          numeric(28,12) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  fx_rate_to_base numeric(18,12) NOT NULL DEFAULT 1.0,
  amount_base     numeric(28,12) NOT NULL,
  effective_date  date NOT NULL,
  quarter         text NOT NULL,
  memo            text,
  source          text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'imported', 'generated')),
  source_ref      uuid,
  run_id          uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_capital_ledger_fund_quarter
  ON re_capital_ledger_entry(fund_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_capital_ledger_partner
  ON re_capital_ledger_entry(partner_id, fund_id, quarter);

-- =============================================================================
-- VIII. CASHFLOW LEDGER (economic cash movements at asset/JV level)
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_cashflow_ledger_entry (
  entry_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id        uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  jv_id          uuid REFERENCES re_jv(jv_id),
  asset_id       uuid REFERENCES repe_asset(asset_id),
  cashflow_type  text NOT NULL CHECK (cashflow_type IN (
    'operating_cf', 'capex', 'debt_draw', 'debt_paydown',
    'sale_proceeds', 'refinancing_proceeds', 'fees'
  )),
  amount_base    numeric(28,12) NOT NULL,
  effective_date date NOT NULL,
  quarter        text NOT NULL,
  memo           text,
  run_id         uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_cashflow_ledger_fund_quarter
  ON re_cashflow_ledger_entry(fund_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_cashflow_ledger_asset
  ON re_cashflow_ledger_entry(asset_id, quarter);

-- =============================================================================
-- IX. PARTNER QUARTER METRICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_partner_quarter_metrics (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           uuid NOT NULL REFERENCES re_partner(partner_id) ON DELETE CASCADE,
  fund_id              uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  quarter              text NOT NULL,
  scenario_id          uuid,
  run_id               uuid NOT NULL,
  contributed_to_date  numeric(28,12),
  distributed_to_date  numeric(28,12),
  nav                  numeric(28,12),
  dpi                  numeric(18,12),
  tvpi                 numeric(18,12),
  irr                  numeric(18,12),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_partner_quarter_metrics_unique
  ON re_partner_quarter_metrics(partner_id, fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS re_fund_quarter_metrics (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id              uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  quarter              text NOT NULL,
  scenario_id          uuid,
  run_id               uuid NOT NULL,
  contributed_to_date  numeric(28,12),
  distributed_to_date  numeric(28,12),
  nav                  numeric(28,12),
  dpi                  numeric(18,12),
  tvpi                 numeric(18,12),
  irr                  numeric(18,12),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_fund_quarter_metrics_unique
  ON re_fund_quarter_metrics(fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- =============================================================================
-- X. WATERFALL DEFINITION + RUNTIME
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_waterfall_definition (
  definition_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id        uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  name           text NOT NULL DEFAULT 'Default',
  waterfall_type text NOT NULL CHECK (waterfall_type IN ('european', 'american')),
  version        int NOT NULL DEFAULT 1,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, name, version)
);

CREATE TABLE IF NOT EXISTS re_waterfall_tier (
  tier_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id  uuid NOT NULL REFERENCES re_waterfall_definition(definition_id) ON DELETE CASCADE,
  tier_order     int NOT NULL,
  tier_type      text NOT NULL CHECK (tier_type IN (
    'return_of_capital', 'preferred_return', 'catch_up', 'split', 'promote'
  )),
  hurdle_rate       numeric(18,12),
  split_gp          numeric(18,12),
  split_lp          numeric(18,12),
  catch_up_percent  numeric(18,12),
  notes             text,
  UNIQUE (definition_id, tier_order)
);

CREATE TABLE IF NOT EXISTS re_waterfall_run (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id         uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  definition_id   uuid NOT NULL REFERENCES re_waterfall_definition(definition_id),
  quarter         text NOT NULL,
  scenario_id     uuid,
  run_type        text NOT NULL DEFAULT 'shadow'
    CHECK (run_type IN ('shadow', 'actual', 'proposed')),
  total_distributable numeric(28,12),
  inputs_hash     text,
  status          text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_waterfall_run_fund
  ON re_waterfall_run(fund_id, quarter);

CREATE TABLE IF NOT EXISTS re_waterfall_run_result (
  result_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid NOT NULL REFERENCES re_waterfall_run(run_id) ON DELETE CASCADE,
  partner_id   uuid NOT NULL REFERENCES re_partner(partner_id),
  tier_code    text NOT NULL,
  payout_type  text NOT NULL,
  amount       numeric(28,12) NOT NULL,
  tier_breakdown_json jsonb,
  ending_capital_balance numeric(28,12),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_waterfall_run_result_run
  ON re_waterfall_run_result(run_id);

-- =============================================================================
-- XI. SCENARIO SYSTEM
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_scenario (
  scenario_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id            uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text,
  scenario_type      text NOT NULL DEFAULT 'base'
    CHECK (scenario_type IN ('base', 'stress', 'upside', 'downside', 'custom')),
  is_base            boolean NOT NULL DEFAULT false,
  parent_scenario_id uuid REFERENCES re_scenario(scenario_id),
  base_assumption_set_id uuid,
  status             text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_scenario_single_base
  ON re_scenario(fund_id) WHERE is_base = true;

CREATE TABLE IF NOT EXISTS re_assumption_set (
  assumption_set_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id           uuid REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  name              text NOT NULL,
  version           int NOT NULL DEFAULT 1,
  inputs_hash       text,
  notes             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, name, version)
);

CREATE TABLE IF NOT EXISTS re_assumption_value (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_set_id uuid NOT NULL REFERENCES re_assumption_set(assumption_set_id) ON DELETE CASCADE,
  scope_type        text NOT NULL DEFAULT 'fund'
    CHECK (scope_type IN ('fund', 'investment', 'jv', 'asset', 'asset_type_property', 'asset_type_loan')),
  key               text NOT NULL,
  value_type        text NOT NULL DEFAULT 'decimal'
    CHECK (value_type IN ('decimal', 'int', 'string', 'bool', 'curve_json')),
  value_decimal     numeric(18,12),
  value_int         int,
  value_text        text,
  value_json        jsonb,
  unit              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assumption_set_id, scope_type, key)
);

CREATE TABLE IF NOT EXISTS re_assumption_override (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id       uuid NOT NULL REFERENCES re_scenario(scenario_id) ON DELETE CASCADE,
  scope_node_type   text NOT NULL CHECK (scope_node_type IN ('fund', 'investment', 'jv', 'asset')),
  scope_node_id     uuid NOT NULL,
  key               text NOT NULL,
  value_type        text NOT NULL DEFAULT 'decimal'
    CHECK (value_type IN ('decimal', 'int', 'string', 'bool', 'curve_json')),
  value_decimal     numeric(18,12),
  value_int         int,
  value_text        text,
  value_json        jsonb,
  reason            text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, scope_node_type, scope_node_id, key)
);

-- =============================================================================
-- XII. RUN PROVENANCE
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_run_provenance (
  provenance_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                     uuid NOT NULL,
  run_type                   text NOT NULL CHECK (run_type IN (
    'quarter_close', 'valuation', 'waterfall', 'metrics', 'rollup'
  )),
  fund_id                    uuid NOT NULL REFERENCES repe_fund(fund_id),
  quarter                    text NOT NULL,
  scenario_id                uuid,
  base_assumption_set_id     uuid,
  effective_assumptions_hash text,
  effective_assumptions_json jsonb,
  ledger_inputs_hash         text,
  accounting_inputs_hash     text,
  valuation_inputs_hash      text,
  status                     text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed')),
  error_message              text,
  triggered_by               text,
  started_at                 timestamptz NOT NULL DEFAULT now(),
  completed_at               timestamptz,
  metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_re_run_provenance_fund
  ON re_run_provenance(fund_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_run_provenance_run
  ON re_run_provenance(run_id);

-- =============================================================================
-- XIII. COMPATIBILITY VIEW
-- =============================================================================

CREATE OR REPLACE VIEW re_investment AS
  SELECT
    deal_id AS investment_id,
    fund_id,
    name,
    deal_type AS investment_type,
    stage,
    sponsor,
    target_close_date,
    committed_capital,
    invested_capital,
    realized_distributions,
    created_at
  FROM repe_deal;
