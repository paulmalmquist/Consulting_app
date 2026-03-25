-- Migration 296: Extend re_model with model_type + locked_at,
-- add underwriting/forecast link tables and model results cache.

-- Extend re_model
ALTER TABLE re_model
  ADD COLUMN IF NOT EXISTS model_type text DEFAULT 'scenario'
    CHECK (model_type IN ('underwriting_io','forecast','scenario','downside','upside')),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- 1:1 link between investment and its underwriting (IO) model
CREATE TABLE IF NOT EXISTS re_investment_underwriting_link (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id   uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  model_id        uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  linked_at       timestamptz NOT NULL DEFAULT now(),
  linked_by       text,
  UNIQUE (investment_id)
);

-- 1:1 link between investment and its current forecast model
CREATE TABLE IF NOT EXISTS re_investment_forecast_link (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id   uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  model_id        uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  linked_at       timestamptz NOT NULL DEFAULT now(),
  linked_by       text,
  UNIQUE (investment_id)
);

-- Cached model results at investment level (populated after model runs)
CREATE TABLE IF NOT EXISTS re_model_results_investment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  investment_id   uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  metrics_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  compute_version text NOT NULL DEFAULT 'v1',
  run_id          uuid,
  UNIQUE (model_id, investment_id, compute_version)
);

CREATE INDEX IF NOT EXISTS idx_re_model_results_inv_model ON re_model_results_investment(model_id);
CREATE INDEX IF NOT EXISTS idx_re_model_results_inv_inv ON re_model_results_investment(investment_id);
CREATE INDEX IF NOT EXISTS idx_re_uw_link_inv ON re_investment_underwriting_link(investment_id);
CREATE INDEX IF NOT EXISTS idx_re_fc_link_inv ON re_investment_forecast_link(investment_id);
