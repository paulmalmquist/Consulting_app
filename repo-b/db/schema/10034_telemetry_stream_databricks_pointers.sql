-- 10034_telemetry_stream_databricks_pointers.sql
-- Telemetry Platform: additive lineage extension to the Stargate Kafka serving slice shipped in
-- 10033_telemetry_kafka_stream_provenance.sql. Adds (1) Databricks/Delta lake pointer columns so a
-- served row can name the raw-lake table/version it corresponds to, (2) the AI-triage record kinds +
-- correlation ids, and (3) a tel_stream_triage_events projection the lineage drawer/route read.
--
-- Architecture / honesty boundary:
--   Databricks/Delta is the DURABLE RAW telemetry lake. The Postgres serving slice — backed by
--   Databricks Lakebase (managed Postgres, TELEMETRY_DATABASE_URL) in telemetry/prod and Supabase
--   Postgres locally where that URL is unset — holds only the serving/provenance slice: latest rows,
--   anomaly/triage summaries, receipts, and POINTERS into the lake. It is NOT the lake. No raw Kafka
--   stream is copied here in full; raw telemetry is deterministically sampled (kafka_offset % N) by the
--   consumer. No concrete Databricks Delta table is mapped to the Stargate printer stream yet, so the
--   lake pointers fail closed: databricks_lineage_status defaults to 'not_available'. We never fabricate
--   a Delta pointer or a Kafka offset.
--
-- Additive + idempotent only. Re-runnable. Does not rewrite 10033, does not drop data, does not change
-- any committed primary key. Owning module: Telemetry Platform.

-- ── tel_stream_kafka_rows: Kafka extras + source descriptors + correlation ids + Databricks pointers ──
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS kafka_key            text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS source_system        text NOT NULL DEFAULT 'confluent_kafka';
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS source_kind          text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS producer_version     text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS run_id               text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS anomaly_id           text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS triage_id            text;
-- Databricks/Delta lake pointers — name the raw-lake object a served row came from. Fail-closed by default.
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_catalog        text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_schema         text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_table          text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_path           text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS delta_version             bigint;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS delta_commit_timestamp    timestamptz;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_job_id         text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_run_id         text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_notebook_path  text;
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_lineage_status text NOT NULL DEFAULT 'not_available';
ALTER TABLE tel_stream_kafka_rows ADD COLUMN IF NOT EXISTS databricks_null_reason    text;

-- Extend record_kind. The legacy values (telemetry, agg5s, anomaly) stay in the allowed set so the new
-- CHECK can never reject an existing committed row; the lineage chain adds telemetry_sample, triage,
-- dlq, execution, signal. Drop + re-add in one transaction so the table is never left without a CHECK.
DO $$
BEGIN
    ALTER TABLE tel_stream_kafka_rows DROP CONSTRAINT IF EXISTS tel_stream_kafka_rows_record_kind_chk;
    ALTER TABLE tel_stream_kafka_rows ADD  CONSTRAINT tel_stream_kafka_rows_record_kind_chk
        CHECK (record_kind IN (
            'telemetry_sample', 'telemetry', 'agg5s', 'anomaly', 'triage', 'dlq', 'execution', 'signal'
        ));
END $$;

-- Provenance/lineage lookup paths (tenant-scoped, partial — these ids are usually null on a raw sample).
CREATE INDEX IF NOT EXISTS idx_tel_stream_kafka_rows_anomaly
    ON tel_stream_kafka_rows (env_id, business_id, anomaly_id)
    WHERE anomaly_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tel_stream_kafka_rows_triage
    ON tel_stream_kafka_rows (env_id, business_id, triage_id)
    WHERE triage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tel_stream_kafka_rows_databricks
    ON tel_stream_kafka_rows (env_id, business_id, databricks_catalog, databricks_schema, databricks_table)
    WHERE databricks_table IS NOT NULL;

COMMENT ON COLUMN tel_stream_kafka_rows.run_id IS
  'Print/test run id from the telemetry payload — the manufacturing run. NOT the Databricks job-run id (see databricks_run_id).';
COMMENT ON COLUMN tel_stream_kafka_rows.databricks_run_id IS
  'Databricks job-RUN id that produced/refreshed the linked Delta object. NOT the print/test run_id.';
COMMENT ON COLUMN tel_stream_kafka_rows.databricks_lineage_status IS
  'Linkage state to the Databricks/Delta raw lake: available | not_available. Explicit only — never inferred. Defaults not_available; set databricks_null_reason when not available (e.g. databricks_table_mapping_not_configured).';
COMMENT ON COLUMN tel_stream_kafka_rows.databricks_null_reason IS
  'Why the Databricks lake pointer is absent when databricks_lineage_status = not_available (e.g. databricks_table_mapping_not_configured, databricks_lineage_unavailable). Null when status = available.';

-- ── tel_stream_consumer_offsets: lag + status receipts (PK unchanged from 10033) ──────────────────────
ALTER TABLE tel_stream_consumer_offsets ADD COLUMN IF NOT EXISTS next_committed_offset bigint;
ALTER TABLE tel_stream_consumer_offsets ADD COLUMN IF NOT EXISTS lag                   bigint;
ALTER TABLE tel_stream_consumer_offsets ADD COLUMN IF NOT EXISTS status                text NOT NULL DEFAULT 'unknown';
ALTER TABLE tel_stream_consumer_offsets ADD COLUMN IF NOT EXISTS null_reason           text;
COMMENT ON COLUMN tel_stream_consumer_offsets.status IS
  'Fail-closed consumer health: ok | lagging | stalled | unknown. Defaults unknown until a runner reports.';

-- ── tel_stream_triage_events: AI-triage projection for the lineage drawer / triage routes ─────────────
CREATE TABLE IF NOT EXISTS tel_stream_triage_events (
    triage_id              text PRIMARY KEY,
    env_id                 text NOT NULL,
    business_id            uuid NOT NULL,
    -- Correlation back to the upstream detection event + manufacturing context.
    anomaly_id             text,
    printer_id             text,
    print_job_id           text,
    run_id                 text,                              -- print/test run id, not a Databricks run id
    -- Triage output (the Streaming Agent explains; it is NOT the detector). status fails closed.
    severity               text,                              -- low | medium | high | critical | null
    status                 text NOT NULL DEFAULT 'not_available',  -- ok | not_available
    incident_summary       text,
    likely_cause           text,
    leading_indicators     jsonb NOT NULL DEFAULT '[]'::jsonb,
    recommended_action     text,
    confidence             text,                              -- low | medium | high
    requires_human_review  boolean NOT NULL DEFAULT true,
    null_reason            text,
    -- Kafka provenance of the triage record itself (the triage topic coordinate).
    kafka_row_id           uuid REFERENCES tel_stream_kafka_rows(id),
    kafka_topic            text,
    kafka_partition        integer,
    kafka_offset           bigint,
    -- Databricks/Delta lake pointer for the triage record (fail-closed, same contract as above).
    databricks_catalog        text,
    databricks_schema         text,
    databricks_table          text,
    delta_version             bigint,
    databricks_lineage_status text NOT NULL DEFAULT 'not_available',
    databricks_null_reason    text,
    created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tel_stream_triage_events_tail
    ON tel_stream_triage_events (env_id, business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tel_stream_triage_events_anomaly
    ON tel_stream_triage_events (env_id, business_id, anomaly_id)
    WHERE anomaly_id IS NOT NULL;
ALTER TABLE tel_stream_triage_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_stream_triage_events_tenant ON tel_stream_triage_events
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_stream_triage_events IS
  'Telemetry Platform: AI-triage projection over the Stargate anomaly-triage topic (stargate.printer.anomaly.triage.v1). The Streaming Agent EXPLAINS upstream anomaly events; it is not the detector. status/severity fail closed (not_available). Databricks pointers fail closed until a Delta mapping is configured. Postgres serving slice (Lakebase in prod / Supabase locally), not the raw lake. Owning module: Telemetry Platform.';
COMMENT ON COLUMN tel_stream_triage_events.databricks_lineage_status IS
  'Linkage to the Databricks/Delta raw lake: available | not_available. Explicit only — never inferred. Defaults not_available.';

-- ── verification ─────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_triage_rls int;
    n_db_cols    int;
    chk_admits   boolean;
    lineage_def  text;
    review_def   text;
BEGIN
    -- (a) triage table exists with RLS on
    SELECT count(*) INTO n_triage_rls FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'tel_stream_triage_events' AND rowsecurity = true;

    -- (b) Databricks pointer columns landed on tel_stream_kafka_rows (expect all 11)
    SELECT count(*) INTO n_db_cols FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tel_stream_kafka_rows'
        AND column_name IN (
            'databricks_catalog','databricks_schema','databricks_table','databricks_path','delta_version',
            'delta_commit_timestamp','databricks_job_id','databricks_run_id','databricks_notebook_path',
            'databricks_lineage_status','databricks_null_reason');

    -- (c) the new record_kind CHECK admits 'triage'
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tel_stream_kafka_rows_record_kind_chk'
          AND pg_get_constraintdef(oid) LIKE '%''triage''%'
    ) INTO chk_admits;

    -- (d) defaults: databricks_lineage_status = not_available, requires_human_review = true
    SELECT column_default INTO lineage_def FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tel_stream_kafka_rows' AND column_name='databricks_lineage_status';
    SELECT column_default INTO review_def FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tel_stream_triage_events' AND column_name='requires_human_review';

    IF n_triage_rls <> 1 THEN
        RAISE EXCEPTION 'telemetry 10034 incomplete: tel_stream_triage_events missing or RLS off (% of 1)', n_triage_rls;
    END IF;
    IF n_db_cols <> 11 THEN
        RAISE EXCEPTION 'telemetry 10034 incomplete: % of 11 Databricks pointer columns on tel_stream_kafka_rows', n_db_cols;
    END IF;
    IF NOT chk_admits THEN
        RAISE EXCEPTION 'telemetry 10034 incomplete: record_kind CHECK does not admit triage';
    END IF;
    IF lineage_def IS NULL OR lineage_def NOT LIKE '%not_available%' THEN
        RAISE EXCEPTION 'telemetry 10034 incomplete: databricks_lineage_status default is % (expected not_available)', lineage_def;
    END IF;
    IF review_def IS NULL OR review_def NOT LIKE '%true%' THEN
        RAISE EXCEPTION 'telemetry 10034 incomplete: requires_human_review default is % (expected true)', review_def;
    END IF;

    RAISE NOTICE 'telemetry 10034 ready (triage table + RLS, 11 Databricks pointer cols, record_kind admits triage, defaults verified)';
END $$;
