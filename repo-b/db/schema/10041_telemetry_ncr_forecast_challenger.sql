-- 10041_telemetry_ncr_forecast_challenger.sql
-- Promote the NCR-backlog-forecast NAIVE baseline to a real challenger row so the Model Registry shows
-- a champion-vs-challenger comparison for ncr_forecast instead of a lone model.
--
-- This is NOT new evidence: the drift-aware champion (tel_ncr_forecast) already records the naive
-- random-walk baseline it was backtested against, inline in its own metrics jsonb
-- (mae_naive, mape_naive_pct, skill_vs_naive) from the SAME 8-fold walk-forward backtest. We simply
-- surface that already-computed baseline as its own row so the page can render it beside the champion.
-- The drift model's edge is honestly modest (skill_vs_naive ~ 0.0125 = ~1.25% better MAE than naive).
--
-- INSERT ... SELECT from the champion row guarantees a fully-valid row (every NOT NULL column inherited);
-- the naive shares the champion's mlflow_run_id/experiment because both came from the one backtest run.
-- Idempotent via ON CONFLICT on the (env_id, business_id, model_name, model_version) unique key.
INSERT INTO tel_model_runs
    (env_id, business_id, model_name, model_kind, model_version, model_alias,
     mlflow_run_id, experiment_id, metrics, gate, promotion_state, created_at)
SELECT
    env_id, business_id,
    'tel_ncr_forecast_naive'                          AS model_name,
    model_kind,
    '1'                                               AS model_version,
    NULL                                              AS model_alias,
    mlflow_run_id, experiment_id,
    jsonb_build_object(
        'mae',         (metrics->>'mae_naive')::numeric,
        'mape_pct',    (metrics->>'mape_naive_pct')::numeric,
        'backtest_folds', metrics->'backtest_folds',
        'provenance',  metrics->>'provenance',
        'method',      'naive random-walk baseline (carry-forward last value)',
        'baseline_note', 'Held comparison for tel_ncr_forecast. These MAE/MAPE are the naive baseline '
                       || 'the drift-aware champion was backtested against (same 8-fold walk-forward run). '
                       || 'Champion skill_vs_naive ~= ' || COALESCE(metrics->>'skill_vs_naive','n/a')
                       || ' (a modest, honest edge).'
    )                                                 AS metrics,
    jsonb_build_object(
        'decision', 'held_comparison',
        'selected_over', NULL,
        'primary_metric', 'mae',
        'champion_mae', (metrics->>'mae')::numeric,
        'challenger_mae', (metrics->>'mae_naive')::numeric,
        'champion_ahead', ((metrics->>'mae')::numeric <= (metrics->>'mae_naive')::numeric),
        'note', 'Drift-aware forecast champion vs naive random-walk baseline; lower MAE wins.'
    )                                                 AS gate,
    'model_not_promoted'                              AS promotion_state,
    created_at
FROM tel_model_runs
WHERE env_id = 'telemetry-demo'
  AND business_id = '7e1eb000-0000-4000-a000-000000000001'
  AND model_kind = 'ncr_forecast'
  AND model_name = 'tel_ncr_forecast'
ON CONFLICT (env_id, business_id, model_name, model_version)
DO UPDATE SET metrics = EXCLUDED.metrics, gate = EXCLUDED.gate,
              promotion_state = EXCLUDED.promotion_state;
