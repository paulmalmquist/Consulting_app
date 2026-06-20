-- 10015_telemetry_streaming_slice.sql
-- RS Demo: live streaming ingestion path for the Telemetry Platform. Bronze (append-only, daily
-- partitioned raw frames) -> silver (conformed + deduped) -> gold (1-minute aggregates, restatable),
-- plus ETL watermarks, a fail-closed pipeline-status handshake, and DQ assertion history. Live rows
-- flow through the FROZEN champion scorer; fired events land in the existing tel_anomaly_events.
-- Source adapters: iss (Lightstreamer public feed) | capture (recorded session) | adsb (fallback).
-- Public-data only. Owning module: Telemetry Platform.

-- ── bronze: raw landed frames, append-only, daily PARTITION BY RANGE (480_inv_audit precedent) ──
CREATE TABLE IF NOT EXISTS tel_stream_readings_bronze (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    env_id      text NOT NULL,
    business_id uuid NOT NULL,
    source      text NOT NULL,                  -- iss | capture | adsb
    channel_key text NOT NULL,                  -- adapter-native key, e.g. 'USLAB000058'
    ts_source   timestamptz NOT NULL,           -- frame timestamp from the feed
    ts_ingest   timestamptz NOT NULL DEFAULT now(),
    value       double precision,
    payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
    batch_id    uuid NOT NULL,                  -- one per micro-batch flush
    PRIMARY KEY (id, ts_ingest)                 -- partition key must be in the PK
) PARTITION BY RANGE (ts_ingest);

-- Safety net for clock-skewed rows; should stay empty.
CREATE TABLE IF NOT EXISTS tel_stream_readings_bronze_default
    PARTITION OF tel_stream_readings_bronze DEFAULT;

-- Today + tomorrow partitions. Naming: tel_stream_readings_bronze_YYYY_MM_DD. The ingest worker
-- ensures current/next-day partitions before each flush, so this block only covers first boot.
DO $$
DECLARE
    v_day   date;
    v_pname text;
BEGIN
    FOR v_day IN SELECT d::date FROM generate_series(current_date, current_date + 1, interval '1 day') AS d LOOP
        v_pname := format('tel_stream_readings_bronze_%s', to_char(v_day, 'YYYY_MM_DD'));
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_pname) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF tel_stream_readings_bronze FOR VALUES FROM (%L) TO (%L)',
                v_pname, v_day, v_day + 1
            );
        END IF;
    END LOOP;
END $$;

ALTER TABLE tel_stream_readings_bronze ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_stream_readings_bronze_tenant ON tel_stream_readings_bronze
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_stream_readings_bronze IS
  'Telemetry Platform: append-only raw stream frames (live ingestion landing zone), daily partitioned by ts_ingest. Bronze accepts duplicates; dedupe happens at the silver merge. Owning module: Telemetry Platform.';

-- ── silver: conformed readings, deduped on (env_id, channel_id, ts_source) ─────────────────────
CREATE TABLE IF NOT EXISTS tel_stream_readings (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id       text NOT NULL,
    business_id  uuid NOT NULL,
    channel_id   uuid NOT NULL REFERENCES tel_telemetry_channels(id) ON DELETE CASCADE,
    channel_name text NOT NULL,
    ts_source    timestamptz NOT NULL,
    value        double precision NOT NULL,
    quality_flag text NOT NULL DEFAULT 'ok',    -- ok | late | out_of_range
    batch_id     uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, channel_id, ts_source)      -- the idempotency key: reruns merge to 0 rows
);
-- Query path: live tail reads + gold rollup both scan (env, channel, recent ts_source).
CREATE INDEX IF NOT EXISTS idx_tel_stream_readings_live
    ON tel_stream_readings (env_id, channel_id, ts_source DESC);
ALTER TABLE tel_stream_readings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_stream_readings_tenant ON tel_stream_readings
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_stream_readings IS
  'Telemetry Platform: silver conformed stream readings, deduped via UNIQUE (env_id, channel_id, ts_source); quality_flag marks late/out-of-range rows (excluded from gold). Owning module: Telemetry Platform.';

-- ── gold: 1-minute channel aggregates, restatable for late data ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_stream_minute_agg (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    channel_id      uuid NOT NULL,
    channel_name    text NOT NULL,
    minute_start    timestamptz NOT NULL,
    n               integer NOT NULL DEFAULT 0,
    v_min           double precision,
    v_max           double precision,
    v_avg           double precision,
    anomaly_count   integer NOT NULL DEFAULT 0,
    restated_at     timestamptz,                -- set when late data forced re-aggregation
    restated_reason text,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, channel_id, minute_start)
);
ALTER TABLE tel_stream_minute_agg ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_stream_minute_agg_tenant ON tel_stream_minute_agg
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_stream_minute_agg IS
  'Telemetry Platform: gold 1-minute stream aggregates (min/max/avg/count/anomaly_count), incrementally maintained from a watermark; late data restates affected minutes with restated_at + reason instead of silently mutating history. Owning module: Telemetry Platform.';

-- ── ETL watermarks (incremental high-water marks per job) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_etl_watermarks (
    env_id       text NOT NULL,
    business_id  uuid NOT NULL,
    job_name     text NOT NULL,                 -- silver_merge | gold_rollup | live_scoring
    watermark_ts timestamptz NOT NULL,
    last_run_id  uuid,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (env_id, job_name)
);
ALTER TABLE tel_etl_watermarks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_etl_watermarks_tenant ON tel_etl_watermarks
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_etl_watermarks IS
  'Telemetry Platform: incremental ETL high-water marks per (env, job). Reruns from an unchanged watermark process 0 rows (idempotency). Owning module: Telemetry Platform.';

-- ── pipeline status: the fail-closed mark-refreshed handshake ───────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_pipeline_status (
    env_id      text NOT NULL,
    business_id uuid NOT NULL,
    surface     text NOT NULL,                  -- stream_ingest | silver | gold
    status      text NOT NULL DEFAULT 'fresh',  -- fresh | stale | failed
    as_of_ts    timestamptz NOT NULL DEFAULT now(),
    reason      text,
    PRIMARY KEY (env_id, surface)
);
ALTER TABLE tel_pipeline_status ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_pipeline_status_tenant ON tel_pipeline_status
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_pipeline_status IS
  'Telemetry Platform: per-surface pipeline freshness handshake (fresh|stale|failed + reason). Downstream pages read this and fail closed (STALE banner, frozen charts) instead of rendering stale data as current. Owning module: Telemetry Platform.';

-- ── DQ assertion history ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_dq_assertions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id         text NOT NULL,
    business_id    uuid NOT NULL,
    job_name       text NOT NULL,
    table_name     text NOT NULL,
    assertion_name text NOT NULL,               -- freshness | row_count_delta | value_range:<channel>
    passed         boolean NOT NULL,
    observed       text,
    threshold      text,
    run_ts         timestamptz NOT NULL DEFAULT now()
);
-- Query path: the assertion board reads the most recent N per env.
CREATE INDEX IF NOT EXISTS idx_tel_dq_assertions_recent
    ON tel_dq_assertions (env_id, business_id, run_ts DESC);
ALTER TABLE tel_dq_assertions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_dq_assertions_tenant ON tel_dq_assertions
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_dq_assertions IS
  'Telemetry Platform: data-quality assertion results history (freshness, row-count delta, value-range vs channel redlines). A failed assertion flips tel_pipeline_status for the surface. Owning module: Telemetry Platform.';

-- ── seed: the ISS live stream run + curated public Lightstreamer channels ───────────────────────
-- tel_telemetry_channels FKs to tel_test_runs, so the live stream gets a synthetic run row.
INSERT INTO tel_test_runs (id, env_id, business_id, run_key, dataset, unit_or_channel, spacecraft, status)
VALUES ('7e1e57ea-0000-4000-a000-000000000100', 'telemetry-demo', '7e1eb000-0000-4000-a000-000000000001',
        'iss_live:stream', 'iss_live', 'ISS', 'ISS', 'streaming')
ON CONFLICT (env_id, business_id, run_key) DO NOTHING;

-- Curated public ISS Lightstreamer items (ISSLIVE adapter). Units per the public telemetry listing;
-- redlines only where physically defensible (drive the value_range assertions), else NULL.
INSERT INTO tel_telemetry_channels (id, env_id, business_id, run_id, channel_name, unit, redline_low, redline_high)
SELECT v.id::uuid, 'telemetry-demo', '7e1eb000-0000-4000-a000-000000000001', r.id, v.channel_name, v.unit, v.lo, v.hi
FROM (VALUES
    ('7e1e57ea-0000-4000-a000-000000000101', 'USLAB000058',  'mmHg', 700::float8, 790::float8),  -- Lab cabin pressure
    ('7e1e57ea-0000-4000-a000-000000000102', 'USLAB000059',  'degC', 15::float8,  32::float8),   -- Lab cabin temperature
    -- 062/063/064: live feed records small unitless values (1.0 / 1.0 / 5.0) — NOT mmHg partial
    -- pressures. Semantics unconfirmed, so no unit and no redlines (honest: assertions only fire on
    -- channels whose physical meaning is verified).
    ('7e1e57ea-0000-4000-a000-000000000103', 'USLAB000062',  NULL,   NULL, NULL),
    ('7e1e57ea-0000-4000-a000-000000000104', 'USLAB000063',  NULL,   NULL, NULL),
    ('7e1e57ea-0000-4000-a000-000000000105', 'USLAB000064',  NULL,   NULL, NULL),
    ('7e1e57ea-0000-4000-a000-000000000106', 'AIRLOCK000049','mmHg', NULL, NULL),                -- Crewlock pressure
    ('7e1e57ea-0000-4000-a000-000000000107', 'NODE3000005',  'pct',  0::float8, 100::float8),    -- Urine tank qty
    ('7e1e57ea-0000-4000-a000-000000000108', 'NODE3000008',  'pct',  0::float8, 100::float8),    -- Waste water tank qty
    ('7e1e57ea-0000-4000-a000-000000000109', 'NODE3000009',  'pct',  0::float8, 100::float8),    -- Clean water tank qty
    ('7e1e57ea-0000-4000-a000-00000000010a', 'S4000001',     'V',    NULL, NULL),                -- 1A solar array voltage
    ('7e1e57ea-0000-4000-a000-00000000010b', 'S6000004',     'V',    NULL, NULL),                -- 4B solar array voltage
    ('7e1e57ea-0000-4000-a000-00000000010c', 'P4000001',     'V',    NULL, NULL)                 -- 2A solar array voltage
) AS v(id, channel_name, unit, lo, hi)
JOIN tel_test_runs r
  ON r.env_id = 'telemetry-demo'
 AND r.business_id = '7e1eb000-0000-4000-a000-000000000001'
 AND r.run_key = 'iss_live:stream'
ON CONFLICT (env_id, business_id, run_id, channel_name) DO NOTHING;

-- ── verification ─────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('tel_stream_readings_bronze', 'tel_stream_readings', 'tel_stream_minute_agg',
                          'tel_etl_watermarks', 'tel_pipeline_status', 'tel_dq_assertions')
        AND rowsecurity = true;
    IF n <> 6 THEN
        RAISE EXCEPTION 'telemetry streaming slice migration incomplete: % of 6 tables with RLS', n;
    END IF;
    RAISE NOTICE 'telemetry streaming slice ready (6 tables, RLS on)';
END $$;
