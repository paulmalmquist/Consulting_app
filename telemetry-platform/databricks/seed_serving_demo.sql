-- Phase 3 seed — telemetry demo tenant + serving data.
-- Creates a dedicated, clearly-labeled telemetry demo tenant/business so the FastAPI serving layer
-- has real data to return (the Phase 4 v2 pipeline will provision the production env; this is the
-- Phase 3 serving fixture). Idempotent via ON CONFLICT.
--
-- Fixed env_id for the telemetry demo so the contract is reproducible:
--   env_id      = 'telemetry-demo'
-- The business_id/tenant_id use fixed UUIDs so re-runs are stable.

-- tenant + business (canonical public path; resolve_tenant_id depends on public.business)
INSERT INTO public.tenant (tenant_id, name, slug, is_active)
VALUES ('7e1e0000-0000-4000-a000-000000000001', 'Telemetry Demo', 'telemetry-demo', true)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.business (business_id, tenant_id, name, slug, region, is_active)
VALUES ('7e1eb000-0000-4000-a000-000000000001', '7e1e0000-0000-4000-a000-000000000001',
        'Telemetry Demo', 'telemetry-demo', 'us', true)
ON CONFLICT (business_id) DO NOTHING;

-- Promoted-model metadata, mirrored from the MLflow / Unity Catalog registry (Phase 2 champions).
INSERT INTO tel_model_runs
    (env_id, business_id, model_name, model_kind, model_version, model_alias,
     mlflow_run_id, experiment_id, metrics, gate, promotion_state)
VALUES
    ('telemetry-demo', '7e1eb000-0000-4000-a000-000000000001',
     'tel_anomaly_detector', 'anomaly', '1', 'champion',
     '4a48cb6af8714609b9581d66e904544c', '3740651530987773',
     '{"precision":0.5460286697630902,"recall":0.7691330132730867,"f1":0.6386571043323628}'::jsonb,
     '{"metric":"f1","threshold":0.30,"decision":"promoted","selected_over":"pca_recon(f1=0.4196)"}'::jsonb,
     'promoted'),
    ('telemetry-demo', '7e1eb000-0000-4000-a000-000000000001',
     'tel_rul_regressor', 'rul', '1', 'champion',
     'c970fdcc57d24f518cb8d3bc1a9fa3fc', '3740651530987773',
     '{"rmse":20.321851416076,"phm":1423.3269302516078}'::jsonb,
     '{"metric":"rmse","threshold":25.0,"decision":"promoted","selected_over":"linear(rmse=21.70)"}'::jsonb,
     'promoted')
ON CONFLICT (env_id, business_id, model_name, model_version) DO UPDATE
    SET metrics = EXCLUDED.metrics, gate = EXCLUDED.gate, model_alias = EXCLUDED.model_alias;

-- Runner-up models (real MLflow runs from Phase 2) so the dashboard shows the baseline-vs-stronger
-- comparison. These are NOT promoted (model_alias NULL, promotion_state 'evaluated'): the simple MAD
-- baseline beat the PCA model on F1; the GBM beat the linear baseline on RMSE.
INSERT INTO tel_model_runs
    (env_id, business_id, model_name, model_kind, model_version, model_alias,
     mlflow_run_id, experiment_id, metrics, gate, promotion_state)
VALUES
    ('telemetry-demo', '7e1eb000-0000-4000-a000-000000000001',
     'tel_anomaly_pca', 'anomaly', '1', NULL,
     '8e99b41142c14948b37aadade59e5aad', '3740651530987773',
     '{"precision":0.8725776874659266,"recall":0.2762245442279331,"f1":0.4196150866948698}'::jsonb,
     '{"metric":"f1","threshold":0.30,"decision":"evaluated","note":"lower F1 than MAD baseline"}'::jsonb,
     'evaluated'),
    ('telemetry-demo', '7e1eb000-0000-4000-a000-000000000001',
     'tel_rul_linear', 'rul', '1', NULL,
     'b3c8ddc1df974875b9ddbb4f3621e0d5', '3740651530987773',
     '{"rmse":21.702448390120548,"phm":1036.1390874014483}'::jsonb,
     '{"metric":"rmse","threshold":25.0,"decision":"evaluated","note":"higher RMSE than GBM"}'::jsonb,
     'evaluated')
ON CONFLICT (env_id, business_id, model_name, model_version) DO UPDATE
    SET metrics = EXCLUDED.metrics, gate = EXCLUDED.gate, promotion_state = EXCLUDED.promotion_state;

-- Demo test run: the D-4 (MSL) replay channel scored by the champion (Phase 2 gold_replay_feed_scored).
INSERT INTO tel_test_runs
    (id, env_id, business_id, run_key, dataset, unit_or_channel, spacecraft, row_count, ingest_at, status)
VALUES
    ('7e1e7a00-0000-4000-a000-000000000001', 'telemetry-demo', '7e1eb000-0000-4000-a000-000000000001',
     'smap_msl:D-4:test', 'smap_msl', 'D-4', 'MSL', 8473, now(), 'ingested')
ON CONFLICT (env_id, business_id, run_key) DO UPDATE SET row_count = EXCLUDED.row_count;

INSERT INTO tel_telemetry_channels
    (env_id, business_id, run_id, channel_name, unit, redline_low, redline_high)
VALUES
    ('telemetry-demo', '7e1eb000-0000-4000-a000-000000000001',
     '7e1e7a00-0000-4000-a000-000000000001', 'value', 'normalized', NULL, NULL)
ON CONFLICT (env_id, business_id, run_id, channel_name) DO NOTHING;

SELECT 'seeded' AS status,
    (SELECT count(*) FROM tel_model_runs WHERE env_id='telemetry-demo') AS model_runs,
    (SELECT count(*) FROM tel_test_runs WHERE env_id='telemetry-demo') AS test_runs,
    (SELECT count(*) FROM tel_telemetry_channels WHERE env_id='telemetry-demo') AS channels;
