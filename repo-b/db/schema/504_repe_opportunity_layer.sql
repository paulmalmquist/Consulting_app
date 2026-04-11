-- Migration 504: repe_opportunity_layer.sql
--
-- Signals → Opportunities → Proto Underwrite → Model → Fund Impact → Approve → Live
--
-- Adds the pre-investment sourcing and paper-investing layer to the Meridian REPE
-- hierarchy. Opportunities remain isolated from official rollups until
-- convert_to_investment() is called and stage transitions to 'live'.
--
-- Key design rules:
--   1. Opportunity model runs NEVER write to re_asset_quarter_state, re_fund_quarter_state,
--      or re_investment_quarter_state until stage = 'live'.
--   2. All env-scoped tables use env_id uuid NOT NULL with RLS via app.env_id session setting.
--   3. repe_signal_sources is a global reference table — no env_id, no RLS.
--   4. Flat assumption columns are canonical v1 model inputs; JSON extension sections
--      may enrich generation but must not override flat columns.
--   5. Approval and conversion are distinct actions with distinct status tracking.


-- ─── Table 1: repe_signal_sources ────────────────────────────────────────────
-- Global reference table for signal data sources.
-- No env_id — shared across all environments. No RLS applied.

CREATE TABLE IF NOT EXISTS repe_signal_sources (
  source_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code   text NOT NULL UNIQUE,
  source_name   text NOT NULL,
  source_type   text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('broker','market_data','internal','news','ai_scan','manual')),
  feed_url      text,
  auto_refresh  boolean NOT NULL DEFAULT false,
  refresh_cron  text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE repe_signal_sources IS
  'Global reference table for market signal data sources (brokers, feeds, AI scans). '
  'No env_id — shared across all tenants. No RLS.';


-- ─── Table 2: repe_signals ────────────────────────────────────────────────────
-- Atomic market observations that may cluster into investment hypotheses.
-- env-scoped with RLS.

CREATE TABLE IF NOT EXISTS repe_signals (
  signal_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id           uuid NOT NULL,
  source_id        uuid REFERENCES repe_signal_sources(source_id) ON DELETE SET NULL,
  signal_type      text NOT NULL
    CHECK (signal_type IN (
      'cap_rate_move','vacancy_trend','rent_growth','distress',
      'development_pipeline','macro','transaction','custom'
    )),
  market           text,
  submarket        text,
  property_type    text,
  signal_date      date NOT NULL,
  strength         numeric(5,2),   -- 0-100 computed score
  raw_value        numeric(18,4),  -- raw data point
  direction        text
    CHECK (direction IS NULL OR direction IN ('positive','negative','neutral')),
  signal_headline  text NOT NULL,
  signal_body      text,
  ai_generated     boolean NOT NULL DEFAULT false,
  ai_model_version text,
  metadata_json    jsonb NOT NULL DEFAULT '{}',
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repe_signals_env_type_date
  ON repe_signals (env_id, signal_type, signal_date DESC);

CREATE INDEX IF NOT EXISTS idx_repe_signals_env_market_date
  ON repe_signals (env_id, market, signal_date DESC);

CREATE INDEX IF NOT EXISTS idx_repe_signals_env_id
  ON repe_signals (env_id);

COMMENT ON TABLE repe_signals IS
  'Atomic market observations (cap rate moves, distress, rent growth, macro) '
  'that may be linked to investment opportunities. env-scoped. '
  'Owning module: repe_opportunity_layer.';


-- ─── Table 3: repe_opportunities ─────────────────────────────────────────────
-- Structured investment hypotheses with full lifecycle:
--   signal → hypothesis → underwriting → modeled → ic_ready → approved → live → archived
-- approved = IC approved, still isolated.
-- live = real re_investment exists, enters official rollups.

CREATE TABLE IF NOT EXISTS repe_opportunities (
  opportunity_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                      uuid NOT NULL,
  fund_id                     uuid REFERENCES repe_fund(fund_id) ON DELETE SET NULL,
  name                        text NOT NULL,
  thesis                      text,
  property_type               text,
  market                      text,
  submarket                   text,
  lat                         numeric(10,7),
  lon                         numeric(11,7),
  strategy                    text
    CHECK (strategy IS NULL OR strategy IN (
      'core','core_plus','value_add','opportunistic','debt','development'
    )),
  stage                       text NOT NULL DEFAULT 'signal'
    CHECK (stage IN (
      'signal','hypothesis','underwriting','modeled',
      'ic_ready','approved','live','archived'
    )),
  priority                    text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  target_equity_check         numeric(18,2),
  target_ltv                  numeric(10,4),

  -- Score components (all 0-100, nullable until computed)
  score_return_estimated      numeric(6,4),  -- pre-model rough estimate
  score_return_modeled        numeric(6,4),  -- overwritten after first model run
  score_source                text NOT NULL DEFAULT 'estimated'
    CHECK (score_source IN ('estimated','modeled')),
  score_fund_fit              numeric(6,4),
  score_signal                numeric(6,4),
  score_execution             numeric(6,4),
  score_risk_penalty          numeric(6,4),
  composite_score             numeric(6,4),

  -- AI provenance
  ai_generated                boolean NOT NULL DEFAULT false,
  ai_model_version            text,

  -- Lifecycle links (deferred FK for current_assumption_version_id added below)
  current_assumption_version_id uuid,
  promoted_investment_id      uuid,  -- references repe_deal.deal_id after conversion

  created_by                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repe_opportunities_env_stage_score
  ON repe_opportunities (env_id, stage, composite_score DESC);

CREATE INDEX IF NOT EXISTS idx_repe_opportunities_env_fund_stage
  ON repe_opportunities (env_id, fund_id, stage);

CREATE INDEX IF NOT EXISTS idx_repe_opportunities_env_id
  ON repe_opportunities (env_id);

COMMENT ON TABLE repe_opportunities IS
  'Structured investment hypotheses with full lifecycle management. '
  'Isolated from official rollups until stage = ''live''. '
  'Owning module: repe_opportunity_layer.';


-- ─── Table 4: repe_opportunity_signal_links ───────────────────────────────────
-- Many-to-many: opportunity ↔ signals with attribution weight.

CREATE TABLE IF NOT EXISTS repe_opportunity_signal_links (
  link_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            uuid NOT NULL,
  opportunity_id    uuid NOT NULL
    REFERENCES repe_opportunities(opportunity_id) ON DELETE CASCADE,
  signal_id         uuid NOT NULL
    REFERENCES repe_signals(signal_id) ON DELETE CASCADE,
  weight            numeric(5,4) NOT NULL DEFAULT 1.0,
  attribution_note  text,
  linked_by         text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_repe_opp_signal_links_opp
  ON repe_opportunity_signal_links (opportunity_id);

CREATE INDEX IF NOT EXISTS idx_repe_opp_signal_links_signal
  ON repe_opportunity_signal_links (signal_id);

COMMENT ON TABLE repe_opportunity_signal_links IS
  'Join table linking opportunities to supporting market signals with attribution weights. '
  'Owning module: repe_opportunity_layer.';


-- ─── Table 5: repe_opportunity_assumption_versions ───────────────────────────
-- Versioned underwriting assumptions for paper investing.
-- CANONICAL PRECEDENCE RULE: flat columns are the authoritative v1 model inputs.
-- JSON extension sections (operating_json etc.) may enrich generation but must not
-- override flat column values.

CREATE TABLE IF NOT EXISTS repe_opportunity_assumption_versions (
  assumption_version_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL,
  opportunity_id         uuid NOT NULL
    REFERENCES repe_opportunities(opportunity_id) ON DELETE CASCADE,
  version_number         integer NOT NULL DEFAULT 1,
  label                  text,  -- e.g. 'Base Case', 'Upside', 'Stress'

  -- Canonical flat inputs (read by run_opportunity_model)
  purchase_price         numeric(18,2),
  equity_check           numeric(18,2),
  loan_amount            numeric(18,2),
  ltv                    numeric(10,4),
  interest_rate_pct      numeric(10,4),
  io_period_months       integer,
  amort_years            integer,
  loan_term_years        integer,
  base_noi               numeric(18,2),
  rent_growth_pct        numeric(10,4),
  vacancy_pct            numeric(10,4),
  expense_growth_pct     numeric(10,4),
  mgmt_fee_pct           numeric(10,4),
  exit_cap_rate_pct      numeric(10,4),
  exit_year              integer NOT NULL DEFAULT 5,
  disposition_cost_pct   numeric(10,4) NOT NULL DEFAULT 0.02,
  discount_rate_pct      numeric(10,4),
  hold_years             integer NOT NULL DEFAULT 5,
  capex_reserve_pct      numeric(10,4),
  fee_load_pct           numeric(10,4) NOT NULL DEFAULT 0.015,

  -- Structured extension sections (optional, do NOT override flat columns)
  operating_json         jsonb NOT NULL DEFAULT '{}',
  lease_json             jsonb NOT NULL DEFAULT '{}',
  capex_json             jsonb NOT NULL DEFAULT '{}',
  debt_json              jsonb NOT NULL DEFAULT '{}',
  exit_json              jsonb NOT NULL DEFAULT '{}',

  is_current             boolean NOT NULL DEFAULT false,
  notes                  text,
  created_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (opportunity_id, version_number)
);

-- Partial index: fast lookup of current version per opportunity
CREATE UNIQUE INDEX IF NOT EXISTS idx_repe_opp_assumption_current
  ON repe_opportunity_assumption_versions (opportunity_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_repe_opp_assumption_opp
  ON repe_opportunity_assumption_versions (opportunity_id);

COMMENT ON TABLE repe_opportunity_assumption_versions IS
  'Versioned underwriting assumptions for paper investing. '
  'Flat columns are canonical v1 model inputs; JSON sections are optional extensions. '
  'Only one version per opportunity may have is_current = true (enforced by partial unique index). '
  'Owning module: repe_opportunity_layer.';


-- ─── Table 6: repe_opportunity_model_runs ────────────────────────────────────
-- Run records for opportunity paper-invest model executions.
-- These NEVER write to re_asset_quarter_state or re_fund_quarter_state.

CREATE TABLE IF NOT EXISTS repe_opportunity_model_runs (
  model_run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL,
  opportunity_id        uuid NOT NULL
    REFERENCES repe_opportunities(opportunity_id) ON DELETE CASCADE,
  assumption_version_id uuid NOT NULL
    REFERENCES repe_opportunity_assumption_versions(assumption_version_id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','failed')),
  input_hash            text,  -- SHA-256 of assumption inputs for idempotency
  error_message         text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  triggered_by          text NOT NULL DEFAULT 'api'
);

CREATE INDEX IF NOT EXISTS idx_repe_opp_model_runs_opp
  ON repe_opportunity_model_runs (opportunity_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_repe_opp_model_runs_assumption
  ON repe_opportunity_model_runs (assumption_version_id);

COMMENT ON TABLE repe_opportunity_model_runs IS
  'Run records for opportunity paper-invest model executions. '
  'Outputs are isolated to repe_opportunity_model_outputs. '
  'These runs NEVER write to re_asset_quarter_state, re_fund_quarter_state, '
  'or re_investment_quarter_state. '
  'Owning module: repe_opportunity_layer.';


-- ─── Table 7: repe_opportunity_model_outputs ─────────────────────────────────
-- Isolated deterministic financial outputs per model run.
-- Full provenance: assumption_version_id + engine_version + run_timestamp required.

CREATE TABLE IF NOT EXISTS repe_opportunity_model_outputs (
  output_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL,
  model_run_id           uuid NOT NULL UNIQUE
    REFERENCES repe_opportunity_model_runs(model_run_id) ON DELETE CASCADE,
  opportunity_id         uuid NOT NULL
    REFERENCES repe_opportunities(opportunity_id) ON DELETE CASCADE,

  -- Provenance (mandatory — shown in UI)
  assumption_version_id  uuid NOT NULL
    REFERENCES repe_opportunity_assumption_versions(assumption_version_id),
  engine_version         text NOT NULL DEFAULT 'scenario_engine_v2',
  run_timestamp          timestamptz NOT NULL DEFAULT now(),

  -- Return metrics
  gross_irr              numeric(10,6),
  net_irr                numeric(10,6),
  gross_equity_multiple  numeric(10,4),
  net_equity_multiple    numeric(10,4),
  tvpi                   numeric(10,4),
  dpi                    numeric(10,4),
  nav                    numeric(18,2),

  -- Risk metrics
  min_dscr               numeric(10,4),
  exit_ltv               numeric(10,4),
  debt_yield             numeric(10,4),

  -- Projected cashflows (array of period objects)
  cashflow_json          jsonb NOT NULL DEFAULT '[]',

  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repe_opp_model_outputs_opp
  ON repe_opportunity_model_outputs (opportunity_id);

COMMENT ON TABLE repe_opportunity_model_outputs IS
  'Isolated financial outputs from opportunity paper-invest model runs. '
  'Contains full provenance: assumption_version_id, engine_version, run_timestamp. '
  'Never contains data from re_asset_quarter_state or official rollup tables. '
  'Owning module: repe_opportunity_layer.';


-- ─── Table 8: repe_opportunity_fund_impacts ───────────────────────────────────
-- Fund-level comparison: pre vs post adding this opportunity.
-- Enhanced with capital, leverage, and duration metrics for full fund-fit analysis.

CREATE TABLE IF NOT EXISTS repe_opportunity_fund_impacts (
  fund_impact_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                      uuid NOT NULL,
  opportunity_id              uuid NOT NULL
    REFERENCES repe_opportunities(opportunity_id) ON DELETE CASCADE,
  model_run_id                uuid NOT NULL
    REFERENCES repe_opportunity_model_runs(model_run_id) ON DELETE CASCADE,
  fund_id                     uuid NOT NULL
    REFERENCES repe_fund(fund_id) ON DELETE CASCADE,

  -- Pre-impact (current fund state at time of computation)
  fund_nav_before             numeric(18,2),
  fund_gross_irr_before       numeric(10,6),
  fund_net_irr_before         numeric(10,6),
  fund_tvpi_before            numeric(10,4),
  fund_dpi_before             numeric(10,4),

  -- Post-impact (fund with this opportunity added)
  fund_nav_after              numeric(18,2),
  fund_gross_irr_after        numeric(10,6),
  fund_net_irr_after          numeric(10,6),
  fund_tvpi_after             numeric(10,4),
  fund_dpi_after              numeric(10,4),

  -- Deltas
  irr_delta                   numeric(10,6),
  tvpi_delta                  numeric(10,4),
  nav_delta                   numeric(18,2),

  -- Enhanced fund fit
  capital_available_before    numeric(18,2),
  capital_available_after     numeric(18,2),
  duration_impact_years       numeric(10,4),
  leverage_ratio_before       numeric(10,4),
  leverage_ratio_after        numeric(10,4),

  -- Fund fit score and breakdown
  fund_fit_score              numeric(5,2),  -- 0-100
  fit_rationale               text,
  allocation_pct              numeric(8,4),
  fund_fit_breakdown_json     jsonb NOT NULL DEFAULT '{}',
  -- Stores: {mandate, geography, concentration, capital_availability, duration, leverage_tolerance}

  created_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (opportunity_id, model_run_id, fund_id)
);

CREATE INDEX IF NOT EXISTS idx_repe_opp_fund_impacts_opp
  ON repe_opportunity_fund_impacts (opportunity_id);

COMMENT ON TABLE repe_opportunity_fund_impacts IS
  'Fund-level comparison showing pre/post impact of adding an opportunity. '
  'Includes 6-component fund_fit_breakdown_json. '
  'Data sourced from re_fund_quarter_state at time of computation. '
  'Owning module: repe_opportunity_layer.';


-- ─── Table 9: repe_opportunity_promotions ────────────────────────────────────
-- Audit trail for IC approval and conversion to real investment.
-- Two distinct lifecycle events:
--   approved = IC voted yes, stage → approved. Still isolated.
--   conversion_status → completed = real investment created, stage → live.

CREATE TABLE IF NOT EXISTS repe_opportunity_promotions (
  promotion_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                   uuid NOT NULL,
  opportunity_id           uuid NOT NULL
    REFERENCES repe_opportunities(opportunity_id) ON DELETE CASCADE,
  assumption_version_id    uuid NOT NULL
    REFERENCES repe_opportunity_assumption_versions(assumption_version_id),
  model_run_id             uuid NOT NULL
    REFERENCES repe_opportunity_model_runs(model_run_id),

  -- nullable until convert_to_investment() completes
  promoted_to_investment_id uuid,

  promotion_status         text NOT NULL DEFAULT 'pending'
    CHECK (promotion_status IN ('pending','approved','rejected','rolled_back')),

  -- Conversion tracking (separate from approval)
  conversion_status        text NOT NULL DEFAULT 'pending'
    CHECK (conversion_status IN ('pending','completed','failed')),
  converted_at             timestamptz,
  conversion_error         text,

  ic_memo_text             text,
  promoted_by              text,
  approved_by              text,
  promoted_at              timestamptz NOT NULL DEFAULT now(),
  approved_at              timestamptz,
  notes                    text
);

CREATE INDEX IF NOT EXISTS idx_repe_opp_promotions_opp
  ON repe_opportunity_promotions (opportunity_id);

COMMENT ON TABLE repe_opportunity_promotions IS
  'Audit trail for IC approval and conversion of opportunities to real investments. '
  'promotion_status tracks IC decision; conversion_status tracks investment creation. '
  'promoted_to_investment_id is null until conversion_status = ''completed''. '
  'Owning module: repe_opportunity_layer.';


-- ─── Deferred FK: repe_opportunities.current_assumption_version_id ────────────
-- Resolves circular dependency: opportunities → assumption_versions → opportunities

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_opportunities_current_assumption'
      AND conrelid = 'repe_opportunities'::regclass
  ) THEN
    ALTER TABLE repe_opportunities
      ADD CONSTRAINT fk_opportunities_current_assumption
      FOREIGN KEY (current_assumption_version_id)
      REFERENCES repe_opportunity_assumption_versions(assumption_version_id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;


-- ─── Updated_at triggers ──────────────────────────────────────────────────────
-- Applied to mutable tables. Conditional on app.set_updated_at() existing.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'set_updated_at' AND n.nspname = 'app'
  ) THEN
    BEGIN
      CREATE TRIGGER repe_signal_sources_set_updated_at
        BEFORE UPDATE ON repe_signal_sources
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      CREATE TRIGGER repe_signals_set_updated_at
        BEFORE UPDATE ON repe_signals
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      CREATE TRIGGER repe_opportunities_set_updated_at
        BEFORE UPDATE ON repe_opportunities
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      CREATE TRIGGER repe_opp_assumption_versions_set_updated_at
        BEFORE UPDATE ON repe_opportunity_assumption_versions
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;


-- ─── RLS: Enable and create policies for all env-scoped tables ────────────────
-- repe_signal_sources has no RLS (global reference table).
-- All other tables use env_id = session setting.

ALTER TABLE repe_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY repe_signals_tenant_isolation ON repe_signals
    FOR ALL
    USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
    WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repe_opportunities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY repe_opportunities_tenant_isolation ON repe_opportunities
    FOR ALL
    USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
    WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repe_opportunity_signal_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY repe_opportunity_signal_links_tenant_isolation ON repe_opportunity_signal_links
    FOR ALL
    USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
    WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repe_opportunity_assumption_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY repe_opportunity_assumption_versions_tenant_isolation ON repe_opportunity_assumption_versions
    FOR ALL
    USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
    WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repe_opportunity_model_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY repe_opportunity_model_runs_tenant_isolation ON repe_opportunity_model_runs
    FOR ALL
    USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
    WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repe_opportunity_model_outputs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY repe_opportunity_model_outputs_tenant_isolation ON repe_opportunity_model_outputs
    FOR ALL
    USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
    WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repe_opportunity_fund_impacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY repe_opportunity_fund_impacts_tenant_isolation ON repe_opportunity_fund_impacts
    FOR ALL
    USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
    WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE repe_opportunity_promotions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY repe_opportunity_promotions_tenant_isolation ON repe_opportunity_promotions
    FOR ALL
    USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
    WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
