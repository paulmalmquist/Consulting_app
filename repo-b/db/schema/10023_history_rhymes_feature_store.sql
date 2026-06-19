-- 10018_history_rhymes_feature_store.sql
-- History Rhymes Feature Store (B1): bronze landing zone, conformed silver,
-- model-ready gold observations, ETL watermarks, and cadence-aware pipeline
-- status.
--
-- Per ARCHITECTURE.md, hr_* is a documented single-tenant analytics module and
-- is exempt from env_id/business_id/RLS (these are service-role only tables that
-- feed the History Rhymes spine, exactly like 10017_history_rhymes_polymarket).
-- The no-RLS exemption is justified per-table in the COMMENT ON TABLE below.
--
-- Additive only. No connectors / live ingestion / k8s / BigQuery sink are
-- introduced here — only the schema + the contract the deterministic Phase A
-- materializer (and, later, real connectors) write into.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ── BRONZE: append-only raw landing zone ──────────────────────────────────────
-- Range-partitioned by ingest time with a catch-all default partition so inserts
-- never fail before time partitions are provisioned. Append-only; dedupe happens
-- at the silver merge.
CREATE TABLE IF NOT EXISTS public.hr_fs_readings_bronze (
    id             uuid NOT NULL DEFAULT gen_random_uuid(),
    connector      text NOT NULL,
    series_key     text NOT NULL,
    ts_source      timestamptz NOT NULL,
    ts_ingest      timestamptz NOT NULL DEFAULT now(),
    value          double precision,
    payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_quality text NOT NULL DEFAULT 'synthetic',
    batch_id       uuid,
    PRIMARY KEY (id, ts_ingest),
    CONSTRAINT hr_fs_bronze_source_quality_chk
        CHECK (source_quality IN ('synthetic', 'fixture', 'live', 'synthetic_fallback'))
) PARTITION BY RANGE (ts_ingest);

CREATE TABLE IF NOT EXISTS public.hr_fs_readings_bronze_default
    PARTITION OF public.hr_fs_readings_bronze DEFAULT;

CREATE INDEX IF NOT EXISTS idx_hr_fs_bronze_lookup
    ON public.hr_fs_readings_bronze (connector, series_key, ts_source);

COMMENT ON TABLE public.hr_fs_readings_bronze IS
  'History Rhymes Feature Store BRONZE: append-only raw landed readings (one row per connector/series/source-tick), range-partitioned by ts_ingest. Accepts duplicates; the silver merge dedupes. Single-tenant hr_* analytics — exempt from env_id/RLS per ARCHITECTURE.md (service-role only).';

-- ── SILVER: conformed, deduped, idempotent ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_fs_readings (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    connector      text NOT NULL,
    series_key     text NOT NULL,
    ts_source      timestamptz NOT NULL,
    value          double precision,
    quality_flag   text NOT NULL DEFAULT 'ok',
    null_reason    text,
    source_quality text NOT NULL DEFAULT 'synthetic',
    provenance     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hr_fs_silver_source_quality_chk
        CHECK (source_quality IN ('synthetic', 'fixture', 'live', 'synthetic_fallback')),
    UNIQUE (connector, series_key, ts_source)
);

COMMENT ON TABLE public.hr_fs_readings IS
  'History Rhymes Feature Store SILVER: conformed, deduped readings. Idempotency key UNIQUE(connector, series_key, ts_source) so re-ingest merges to zero new rows. null_reason is explicit (never blind-imputed). Single-tenant hr_* — exempt from env_id/RLS per ARCHITECTURE.md.';

-- ── GOLD: model-ready observations (the Phase A contract, materialized) ────────
CREATE TABLE IF NOT EXISTS public.hr_history_rhymes_model_observations (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id            text NOT NULL,
    as_of_date                date NOT NULL,
    model_obs_version         text NOT NULL,
    features_raw              jsonb NOT NULL DEFAULT '{}'::jsonb,
    features_normalized       jsonb NOT NULL DEFAULT '{}'::jsonb,
    features_z_score_2y       jsonb NOT NULL DEFAULT '{}'::jsonb,
    features_delta            jsonb NOT NULL DEFAULT '{}'::jsonb,
    features_velocity         jsonb NOT NULL DEFAULT '{}'::jsonb,
    features_acceleration     jsonb NOT NULL DEFAULT '{}'::jsonb,
    staleness_seconds         jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_quality            text NOT NULL DEFAULT 'synthetic',
    null_reason               text,
    feature_family_coverage   jsonb NOT NULL DEFAULT '{}'::jsonb,
    feature_vector            vector(256),
    text_embedding            vector(128),
    narrative_text            text,
    forward_return_30d        double precision,
    risk_event_30d            smallint,
    theme                     text,
    regime_label              text,
    is_crisis_anchor          boolean NOT NULL DEFAULT false,
    is_non_event              boolean NOT NULL DEFAULT false,
    model_readiness_score     double precision,
    readiness_degrade_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    lineage_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
    external_links_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
    provenance                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (observation_id, as_of_date, model_obs_version),
    CONSTRAINT hr_fs_gold_source_quality_chk
        CHECK (source_quality IN ('synthetic', 'fixture', 'live', 'synthetic_fallback')),
    CONSTRAINT hr_fs_gold_risk_event_chk
        CHECK (risk_event_30d IS NULL OR risk_event_30d IN (0, 1)),
    CONSTRAINT hr_fs_gold_readiness_chk
        CHECK (model_readiness_score IS NULL OR model_readiness_score BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS idx_hr_fs_model_obs_as_of
    ON public.hr_history_rhymes_model_observations (as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_fs_model_obs_vector
    ON public.hr_history_rhymes_model_observations
    USING hnsw (feature_vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 256);

COMMENT ON TABLE public.hr_history_rhymes_model_observations IS
  'History Rhymes Feature Store GOLD: model-ready observations (one row per observation_id/as_of_date/model_obs_version). features_normalized is keyed by the canonical QUANT_FEATURE_ORDER so the spine encoder consumes it directly; feature_vector is the 256-dim state vector. source_quality (synthetic|fixture|live|synthetic_fallback) is the single provenance badge; missing values are NULL, never zero-coerced. Single-tenant hr_* — exempt from env_id/RLS per ARCHITECTURE.md.';

-- ── ETL watermarks: incremental high-water marks for idempotent reruns ─────────
CREATE TABLE IF NOT EXISTS public.hr_fs_etl_watermarks (
    connector     text NOT NULL,
    job_name      text NOT NULL,
    watermark_ts  timestamptz NOT NULL,
    last_run_id   uuid,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (connector, job_name)
);

COMMENT ON TABLE public.hr_fs_etl_watermarks IS
  'History Rhymes Feature Store ETL watermarks: per (connector, job_name) high-water mark so reruns from an unchanged watermark produce zero new rows. Single-tenant hr_* — exempt from env_id/RLS per ARCHITECTURE.md.';

-- ── Pipeline status: cadence-aware freshness (fail-closed) ─────────────────────
CREATE TABLE IF NOT EXISTS public.hr_fs_pipeline_status (
    connector        text NOT NULL,
    surface          text NOT NULL,  -- bronze | silver | gold | <connector>
    status           text NOT NULL DEFAULT 'disabled',
    expected_cadence text,            -- daily | weekly | monthly | event (drives staleness)
    as_of_ts         timestamptz,
    lag_seconds      double precision,
    reason           text,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (connector, surface),
    CONSTRAINT hr_fs_status_chk
        CHECK (status IN ('fresh', 'stale', 'failed', 'disabled', 'unavailable'))
);

COMMENT ON TABLE public.hr_fs_pipeline_status IS
  'History Rhymes Feature Store pipeline status: fail-closed freshness per (connector, surface). expected_cadence makes staleness cadence-aware (a daily series stale != a minute series stale). The UI renders STALE rather than presenting stale data as current. Single-tenant hr_* — exempt from env_id/RLS per ARCHITECTURE.md.';

-- ── Verification: pgvector present + feature_vector is vector(256) ─────────────
-- The whole spine bridge depends on the 256-dim contract; fail loudly if wrong.
DO $$
DECLARE
    coltype text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'pgvector extension is not installed';
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod)
      INTO coltype
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'hr_history_rhymes_model_observations'
       AND a.attname = 'feature_vector'
       AND a.attnum > 0
       AND NOT a.attisdropped;

    IF coltype IS NULL THEN
        RAISE EXCEPTION 'feature_vector column is missing on hr_history_rhymes_model_observations';
    END IF;
    IF coltype <> 'vector(256)' THEN
        RAISE EXCEPTION 'feature_vector must be vector(256), found %', coltype;
    END IF;

    RAISE NOTICE 'hr_feature_store 10018 verification OK: feature_vector is % (dim 256)', coltype;
END $$;
