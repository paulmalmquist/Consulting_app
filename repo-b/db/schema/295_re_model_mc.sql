-- 295_re_model_mc.sql
-- Monte Carlo tables scoped to models (extends existing asset-level MC).
-- Stores per-run metadata and per-entity (asset/investment/fund) result summaries.

-- ═══════════════════════════════════════════════════════════════════════════
-- re_model_mc_run: one Monte Carlo execution for a model
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_model_mc_run (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id                 uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  fund_id                  uuid NOT NULL REFERENCES repe_fund(fund_id),
  quarter                  text NOT NULL,
  n_sims                   int NOT NULL,
  seed                     bigint NOT NULL,
  distribution_params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed')),
  error_message            text,
  started_at               timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_model_mc_run_model ON re_model_mc_run(model_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- re_model_mc_result: summary statistics per entity per MC run
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS re_model_mc_result (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mc_run_id                   uuid NOT NULL REFERENCES re_model_mc_run(id) ON DELETE CASCADE,
  result_level                text NOT NULL DEFAULT 'fund'
    CHECK (result_level IN ('asset', 'investment', 'fund')),
  entity_id                   uuid,
  mean_irr                    numeric(10,6),
  median_irr                  numeric(10,6),
  std_irr                     numeric(10,6),
  impairment_probability      numeric(10,6),
  var_95                      numeric(18,2),
  expected_moic               numeric(10,4),
  promote_trigger_probability numeric(10,6),
  percentile_buckets_json     jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_model_mc_result_run ON re_model_mc_result(mc_run_id);
