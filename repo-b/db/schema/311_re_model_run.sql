-- 311_re_model_run.sql
-- Create re_model_run table for tracking model execution runs
-- Supports baseline and scenario run results

CREATE TABLE IF NOT EXISTS re_model_run (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          uuid NOT NULL REFERENCES re_model(model_id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  triggered_by      text NOT NULL DEFAULT 'api'
    CHECK (triggered_by IN ('api', 'seed', 'schedule')),
  error_message     text,
  result_summary    jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_model_run_model ON re_model_run(model_id);
CREATE INDEX IF NOT EXISTS idx_re_model_run_status ON re_model_run(status);

-- re_model_run_result: fund-level impact results from a run
CREATE TABLE IF NOT EXISTS re_model_run_result (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES re_model_run(id) ON DELETE CASCADE,
  fund_id           uuid NOT NULL,
  metric            text NOT NULL
    CHECK (metric IN ('tvpi', 'irr', 'moic', 'dpi', 'pip', 'gross_irr')),
  base_value        numeric(28,12),
  model_value       numeric(28,12),
  variance          numeric(28,12),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, fund_id, metric)
);

CREATE INDEX IF NOT EXISTS idx_re_model_run_result_run ON re_model_run_result(run_id);
CREATE INDEX IF NOT EXISTS idx_re_model_run_result_fund ON re_model_run_result(fund_id);
