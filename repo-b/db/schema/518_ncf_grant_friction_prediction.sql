-- 518_ncf_grant_friction_prediction.sql
-- NCF Grant Friction / Delay Risk Model output table.
-- Per-grant risk scores produced by the ncf_grant_friction MLflow model, synced
-- nightly from Databricks gold_grant_friction_preds into Supabase. Consumed by
-- the NCF Executive view (operational lens) and the Winston service layer.
--
-- Governance:
--   - env_id-scoped, RLS-enforced (tenant isolation)
--   - fail-closed contract: rows missing => null_reason, never a fabricated score
--   - not an authoritative-state read; this is a new governed signal

CREATE TABLE IF NOT EXISTS ncf_grant_friction_prediction (
  prediction_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  grant_id              uuid NOT NULL REFERENCES ncf_grant(grant_id) ON DELETE CASCADE,
  risk_score            numeric(6, 4),
  risk_band             text CHECK (risk_band IS NULL OR risk_band IN ('low', 'watch', 'high')),
  top_drivers           jsonb NOT NULL DEFAULT '[]'::jsonb,
  prediction_timestamp  timestamptz NOT NULL DEFAULT now(),
  model_version         text NOT NULL,
  model_run_id          text NOT NULL,
  calibration_brier     numeric(6, 4),
  confidence_note       text,
  null_reason           text,
  CONSTRAINT ncf_grant_friction_prediction_score_xor_null
    CHECK ((risk_score IS NOT NULL AND null_reason IS NULL)
        OR (risk_score IS NULL AND null_reason IS NOT NULL)),
  UNIQUE (env_id, grant_id)
);

COMMENT ON TABLE ncf_grant_friction_prediction IS
  'Per-grant friction/delay risk scores produced by the ncf_grant_friction MLflow model, synced from Databricks novendor_1.ncf_ml.gold_grant_friction_preds. risk_score XOR null_reason; top_drivers is a SHAP-derived array of {feature, direction, contribution} objects. Not an authoritative-state read.';

CREATE INDEX IF NOT EXISTS ncf_grant_friction_prediction_env_band_idx
  ON ncf_grant_friction_prediction (env_id, risk_band)
  WHERE risk_band IS NOT NULL;

CREATE INDEX IF NOT EXISTS ncf_grant_friction_prediction_grant_idx
  ON ncf_grant_friction_prediction (env_id, grant_id);

ALTER TABLE ncf_grant_friction_prediction ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncf_grant_friction_prediction_env_isolation ON ncf_grant_friction_prediction;
CREATE POLICY ncf_grant_friction_prediction_env_isolation ON ncf_grant_friction_prediction
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
