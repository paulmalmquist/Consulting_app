-- 10016_factory_ncr_intelligence.sql
-- RS Demo: Factory & NCR Intelligence serving tables. The corpus is a deterministic SYNTHETIC NCR
-- narrative set (SEED=20260609, no program/supplier data); the analytics on top of it are REAL model
-- runs (sentence-transformer embeddings -> UMAP -> HDBSCAN -> c-TF-IDF; walk-forward backlog
-- forecast vs naive baseline) executed on Databricks (novendor_1.telemetry) and mirrored here by
-- telemetry-platform/databricks/16_mirror_ncr_serving.py. Every row carries provenance
-- ('databricks' | 'local_fallback') so the UI can label where the model actually ran.
-- Owning module: Telemetry Platform.

-- ── tel_ncr_records: one row per NCR (corpus + the model's cluster assignment + UMAP coords) ────
CREATE TABLE IF NOT EXISTS tel_ncr_records (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id        text NOT NULL,
    business_id   uuid NOT NULL,
    ncr_key       text NOT NULL,                 -- e.g. 'ncr_2026_00042'
    summary       text NOT NULL,                 -- redacted-style synthetic narrative
    defect_family text,                          -- generator ground-truth family (eval reference)
    workcell      text,
    severity      text,                          -- minor | major | critical
    opened_at     date NOT NULL,
    closed_at     date,                          -- NULL = still open
    reopened      boolean NOT NULL DEFAULT false,
    cluster_id    integer,                       -- HDBSCAN label; -1 = noise; NULL = not clustered
    umap_x        double precision,              -- real model output, not render-time jitter
    umap_y        double precision,
    provenance    text NOT NULL,                 -- databricks | local_fallback
    batch_id      text NOT NULL,                 -- mirror batch, idempotency scope
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, ncr_key)
);
CREATE INDEX IF NOT EXISTS idx_tel_ncr_records_tenant ON tel_ncr_records (env_id, business_id, opened_at);
ALTER TABLE tel_ncr_records ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_ncr_records_tenant ON tel_ncr_records
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_ncr_records IS
  'Telemetry Platform: synthetic NCR corpus rows with REAL clustering output (HDBSCAN cluster_id + UMAP coordinates) mirrored from the Databricks NCR pipeline. provenance labels where the model ran. Owning module: Telemetry Platform.';

-- ── tel_ncr_clusters: one row per discovered cluster (label, keywords, exemplars, trend) ────────
CREATE TABLE IF NOT EXISTS tel_ncr_clusters (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    cluster_id      integer NOT NULL,            -- HDBSCAN label (>= 0; noise is not a cluster row)
    label           text NOT NULL,               -- human label derived from top c-TF-IDF terms
    keywords        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- top c-TF-IDF keywords, ranked
    exemplars       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ncr_key, workcell, severity, summary}]
    n_records       integer NOT NULL,
    status          text NOT NULL,               -- rising | flat | declining (8-wk slope, declared)
    trend           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- weekly counts, oldest first (8 weeks)
    median_ttc_days double precision,            -- median open->close days for closed records
    reopen_rate     double precision,
    mlflow_run_id   text,                        -- clustering run provenance
    provenance      text NOT NULL,               -- databricks | local_fallback
    batch_id        text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, cluster_id)
);
ALTER TABLE tel_ncr_clusters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_ncr_clusters_tenant ON tel_ncr_clusters
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_ncr_clusters IS
  'Telemetry Platform: REAL HDBSCAN cluster summaries (c-TF-IDF keywords, centroid exemplars, weekly trend) over the synthetic NCR corpus, mirrored from the Databricks NCR pipeline. Owning module: Telemetry Platform.';

-- ── tel_ncr_backlog_weekly: weekly opened/closed/backlog history + walk-forward forecast ───────
CREATE TABLE IF NOT EXISTS tel_ncr_backlog_weekly (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id        text NOT NULL,
    business_id   uuid NOT NULL,
    week_start    date NOT NULL,
    kind          text NOT NULL,                 -- history | forecast
    opened        integer,                       -- history only
    closed        integer,                       -- history only
    backlog       integer,                       -- history only (open count at week end)
    fc            double precision,              -- forecast only (point forecast)
    lo            double precision,              -- forecast only (empirical 90% band)
    hi            double precision,
    mlflow_run_id text,                          -- forecast run provenance
    provenance    text NOT NULL,                 -- databricks | local_fallback
    batch_id      text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, week_start, kind)
);
ALTER TABLE tel_ncr_backlog_weekly ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_ncr_backlog_weekly_tenant ON tel_ncr_backlog_weekly
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_ncr_backlog_weekly IS
  'Telemetry Platform: weekly NCR opened/closed/backlog history plus the REAL walk-forward backlog forecast (point + empirical 90% band) mirrored from the Databricks NCR pipeline. Backtest metrics (MAE/MAPE/skill vs naive) live on the ncr_forecast tel_model_runs row. Owning module: Telemetry Platform.';

-- ── verification ────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('tel_ncr_records', 'tel_ncr_clusters', 'tel_ncr_backlog_weekly')
        AND rowsecurity = true;
    IF n <> 3 THEN
        RAISE EXCEPTION 'factory NCR intelligence migration incomplete: % of 3 tables with RLS', n;
    END IF;
    RAISE NOTICE 'factory NCR intelligence ready (3 tables, RLS on)';
END $$;
