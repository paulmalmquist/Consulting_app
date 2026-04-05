-- ──────────────────────────────────────────────────────────────────────
-- 1002_repe_ml_features.sql
-- Computed ML features per asset per period, derived from
-- re_asset_quarter_state and related snapshot tables.
-- Owned by: historyrhymes ML pipeline / Databricks
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repe_ml_features (
  feature_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                TEXT NOT NULL,
  business_id           UUID NOT NULL,
  asset_id              UUID NOT NULL,
  quarter               TEXT NOT NULL,
  scenario_id           UUID,

  -- Growth / momentum features (from consecutive snapshots)
  noi_growth_qoq        NUMERIC(12,6),
  noi_growth_yoy        NUMERIC(12,6),
  occupancy_change_qoq  NUMERIC(12,6),
  occupancy_change_yoy  NUMERIC(12,6),
  expense_growth_qoq    NUMERIC(12,6),
  expense_growth_yoy    NUMERIC(12,6),
  revenue_growth_qoq    NUMERIC(12,6),
  revenue_growth_yoy    NUMERIC(12,6),

  -- Debt coverage & leverage (from snapshot)
  dscr                  NUMERIC(12,6),
  ltv                   NUMERIC(12,6),
  debt_yield            NUMERIC(12,6),

  -- Leasing & capital intensity
  lease_rollover_12m    NUMERIC(12,6),
  capex_ratio           NUMERIC(12,6),

  -- Maturity risk
  debt_maturity_months  INTEGER,

  -- Variance to underwriting
  noi_variance_to_uw    NUMERIC(12,6),

  -- Computation metadata
  inputs_hash           TEXT,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repe_ml_features_asset_quarter_scenario
  ON repe_ml_features (
    asset_id,
    quarter,
    COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE repe_ml_features ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY repe_ml_features_tenant_isolation ON repe_ml_features
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_repe_ml_features_asset_quarter
  ON repe_ml_features (asset_id, quarter);

CREATE INDEX IF NOT EXISTS idx_repe_ml_features_env
  ON repe_ml_features (env_id, quarter);

COMMENT ON TABLE repe_ml_features IS
  'Computed ML features per asset per period. All values derived from re_asset_quarter_state and related authoritative snapshot tables. Used by Databricks training pipeline for NOI forecasting, refi risk scoring, and distress classification.';
