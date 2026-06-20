-- 10006_telemetry_serving.sql
-- Telemetry Platform serving + persistence schema (Phase 3).
-- Owning module: Telemetry Platform (NASA aerospace analog: turbofan RUL, satellite/bearing anomaly
-- detection). Heavy data + training live in Databricks (novendor_1.telemetry); these tables are the
-- operational serving layer in Supabase: test-run metadata, channel definitions, per-prediction
-- receipts, anomaly events, promoted-model metadata mirrored from the MLflow registry, and drift
-- metrics for /monitoring.
--
-- Convention: matches 525_execution_board.sql — env_id text NOT NULL + business_id uuid NOT NULL,
-- RLS enabled with the current_setting('app.env_id', true) tenant policy (the ARCHITECTURE.md
-- guardrail), in idempotent DO blocks. The serving code additionally filters by business_id and
-- validates the business via public.business (resolve_tenant_id); it does not rely on the GUC being
-- set, so the policy is defense-in-depth, not the only isolation.
-- Prefix tel_ is registered in ARCHITECTURE.md.

-- ── tel_test_runs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_test_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    run_key         text NOT NULL,                 -- stable external key, e.g. 'smap_msl:D-4:test'
    dataset         text NOT NULL,                 -- cmapss | smap_msl | ims
    unit_or_channel text NOT NULL,                 -- C-MAPSS unit id or SMAP/MSL channel id
    spacecraft      text,                          -- SMAP | MSL (null for C-MAPSS)
    row_count       integer NOT NULL DEFAULT 0,
    ingest_at       timestamptz,
    status          text NOT NULL DEFAULT 'ingested',
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, run_key)
);
ALTER TABLE tel_test_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_test_runs_tenant ON tel_test_runs
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_test_runs IS 'Telemetry Platform: one row per ingested test run (dataset, unit/channel, row count). Owning module: Telemetry Platform.';

-- ── tel_telemetry_channels ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_telemetry_channels (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    run_id          uuid NOT NULL REFERENCES tel_test_runs(id) ON DELETE CASCADE,
    channel_name    text NOT NULL,                 -- e.g. 'value', 'sensor_2'
    unit            text,                          -- engineering unit if known
    redline_low     double precision,             -- threshold band (nullable)
    redline_high    double precision,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, run_id, channel_name)
);
ALTER TABLE tel_telemetry_channels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_telemetry_channels_tenant ON tel_telemetry_channels
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_telemetry_channels IS 'Telemetry Platform: channel definitions per run (name, unit, redline thresholds). Owning module: Telemetry Platform.';

-- ── tel_model_runs ───────────────────────────────────────────────────────────
-- Promoted-model metadata mirrored from the MLflow / Unity Catalog registry.
CREATE TABLE IF NOT EXISTS tel_model_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    model_name      text NOT NULL,                 -- e.g. 'tel_anomaly_detector'
    model_kind      text NOT NULL,                 -- anomaly | rul
    model_version   text NOT NULL,                 -- registry version, e.g. '1'
    model_alias     text,                          -- e.g. 'champion'
    mlflow_run_id   text NOT NULL,
    experiment_id   text,
    metrics         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- exact logged metrics
    gate            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- declared gate + decision
    promotion_state text NOT NULL DEFAULT 'promoted',    -- promoted | model_not_promoted
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, model_name, model_version)
);
ALTER TABLE tel_model_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_model_runs_tenant ON tel_model_runs
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_model_runs IS 'Telemetry Platform: promoted-model metadata mirrored from MLflow/UC registry (run id, metrics, gate decision). Owning module: Telemetry Platform.';

-- ── tel_predictions ──────────────────────────────────────────────────────────
-- One row per /score call (the persistence receipt).
CREATE TABLE IF NOT EXISTS tel_predictions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    run_id          uuid REFERENCES tel_test_runs(id) ON DELETE SET NULL,
    channel_name    text,
    window_start_t  integer,
    window_end_t    integer,
    anomaly_score   double precision,
    threshold       double precision,
    verdict         text NOT NULL,                 -- GO | NO_GO | NOT_AVAILABLE
    null_reason     text,                          -- set when verdict = NOT_AVAILABLE
    model_name      text,
    model_version   text,
    mlflow_run_id   text,
    attribution     jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ranked contributing channels
    created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tel_predictions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_predictions_tenant ON tel_predictions
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_predictions IS 'Telemetry Platform: one row per /score call — score, verdict, attribution, model attribution, persistence receipt. Owning module: Telemetry Platform.';

CREATE INDEX IF NOT EXISTS tel_predictions_env_created_idx
    ON tel_predictions (env_id, business_id, created_at DESC);
-- Query path: /monitoring rolling-window aggregates over recent predictions per tenant.

-- ── tel_anomaly_events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_anomaly_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    run_id          uuid REFERENCES tel_test_runs(id) ON DELETE CASCADE,
    channel_name    text,
    start_t         integer,
    end_t           integer,
    anomaly_class   text,                          -- point | contextual
    confidence      double precision,
    source          text NOT NULL DEFAULT 'model', -- model | label
    created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tel_anomaly_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_anomaly_events_tenant ON tel_anomaly_events
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_anomaly_events IS 'Telemetry Platform: detected/labeled anomaly windows (point vs contextual, contributing channels). Owning module: Telemetry Platform.';

-- ── tel_drift_metrics ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_drift_metrics (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    model_name      text,
    metric_name     text NOT NULL,                 -- e.g. 'psi' | 'rolling_anomaly_rate'
    metric_value    double precision,
    window_label    text,                          -- e.g. '24h'
    computed_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tel_drift_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_drift_metrics_tenant ON tel_drift_metrics
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_drift_metrics IS 'Telemetry Platform: drift / PSI / rolling anomaly rate for /monitoring. Owning module: Telemetry Platform.';

-- ── verification ─────────────────────────────────────────────────────────────
-- Expect 6 tel_ tables, all with rowsecurity = true.
DO $$
DECLARE n_tables int; n_rls int;
BEGIN
    SELECT count(*) INTO n_tables FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'tel\_%';
    SELECT count(*) INTO n_rls FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'tel\_%' AND rowsecurity = true;
    RAISE NOTICE 'telemetry serving: % tel_ tables, % with RLS enabled', n_tables, n_rls;
    IF n_tables < 6 OR n_rls < 6 THEN
        RAISE EXCEPTION 'telemetry serving migration incomplete: % tables / % RLS', n_tables, n_rls;
    END IF;
END $$;
