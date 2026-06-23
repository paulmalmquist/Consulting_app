-- 10033_telemetry_kafka_stream_provenance.sql
-- Telemetry Platform: durable Kafka -> Supabase landing for the Stargate streaming lane, with full
-- per-row Kafka provenance (topic / partition / offset / schema id+subject+version). This is the
-- durable serving layer the lineage drawer reads to PROVE "this telemetry row came from this Kafka
-- topic, this partition, this offset, using this schema, and landed in this Supabase row."
--
-- The in-memory bridge (app/services/stargate_bridge.py) stays the live SSE view; this lane is the
-- durable, replay-safe sink written by app/services/telemetry_stream_consumer.py (env-gated,
-- default off). Raw telemetry is sampled deterministically (kafka_offset % N) by the consumer;
-- anomalies and 5s aggregates are persisted in full. Full-volume raw history lives in Kafka
-- retention + the BigQuery sink. Postgres stores DECODED JSON, never raw wire bytes.
-- Owning module: Telemetry Platform.

-- ── durable streamed rows + Kafka provenance ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_stream_kafka_rows (
    id                 uuid NOT NULL DEFAULT gen_random_uuid(),
    env_id             text NOT NULL,
    business_id        uuid NOT NULL,
    record_kind        text NOT NULL,                 -- telemetry | anomaly | agg5s
    -- Kafka provenance: the coordinates that prove where the value came from.
    kafka_topic        text NOT NULL,                 -- canonical topic, e.g. stargate.printer.telemetry.v1
    kafka_partition    integer NOT NULL,
    kafka_offset       bigint NOT NULL,
    kafka_timestamp    timestamptz,                   -- broker-side record timestamp (nullable)
    consumer_group     text NOT NULL,                 -- e.g. stargate-bridge-sink
    -- Schema identity: the wire frame carries a schema ID, not subject/version. schema_id is always
    -- present; subject/version/type come from an SR lookup that may fail closed (schema_null_reason).
    schema_id          integer NOT NULL,
    schema_subject     text,
    schema_version     integer,
    schema_type        text,                          -- PROTOBUF | JSON | AVRO
    schema_null_reason text,                          -- e.g. schema_subject_lookup_unavailable
    -- Convenience denormalization for the serving tail / drawer (also in decoded_payload).
    printer_id         text,
    print_job_id       text,
    decoded_payload    jsonb NOT NULL,                -- decoded message, normalized to JSON
    normalized_payload jsonb,                          -- application-shaped view (units/labels), optional
    ingested_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    -- Replay-safe idempotency: a Kafka coordinate maps to exactly one tenant row. Re-running the
    -- consumer over the same offsets upserts to 0 new rows. business_id is in the key to match the
    -- tenant model. This UNIQUE also serves the provenance-lookup path.
    UNIQUE (env_id, business_id, kafka_topic, kafka_partition, kafka_offset),
    CONSTRAINT tel_stream_kafka_rows_record_kind_chk
        CHECK (record_kind IN ('telemetry', 'anomaly', 'agg5s'))
);
-- Query path: the serving tail reads the most recent N rows per (env, business, kind).
CREATE INDEX IF NOT EXISTS idx_tel_stream_kafka_rows_tail
    ON tel_stream_kafka_rows (env_id, business_id, record_kind, ingested_at DESC);
ALTER TABLE tel_stream_kafka_rows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_stream_kafka_rows_tenant ON tel_stream_kafka_rows
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_stream_kafka_rows IS
  'Telemetry Platform: durable landing for Stargate-lane Kafka rows with full provenance (topic/partition/offset + schema id/subject/version). Replay-safe via UNIQUE (env_id, business_id, kafka_topic, kafka_partition, kafka_offset). Raw telemetry is deterministically sampled (offset % N); anomalies + agg5s persist in full. Owning module: Telemetry Platform.';
COMMENT ON COLUMN tel_stream_kafka_rows.decoded_payload IS
  'Decoded Kafka message normalized to JSON (field names + units intact) for serving/debug — NOT the raw binary Protobuf / Confluent wire bytes.';
COMMENT ON COLUMN tel_stream_kafka_rows.schema_id IS
  'Confluent Schema Registry schema ID read from the message wire frame (always present). subject/version/type are resolved via an SR lookup and may be null with schema_null_reason set.';

-- ── consumer offset receipts (mirror hr_stream_offsets) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_stream_consumer_offsets (
    env_id                text NOT NULL,
    business_id           uuid NOT NULL,
    consumer_group        text NOT NULL,
    topic                 text NOT NULL,
    partition             integer NOT NULL,
    last_processed_offset bigint NOT NULL,            -- last offset durably handled (human-meaningful)
    updated_at            timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (env_id, consumer_group, topic, partition)
);
ALTER TABLE tel_stream_consumer_offsets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_stream_consumer_offsets_tenant ON tel_stream_consumer_offsets
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_stream_consumer_offsets IS
  'Telemetry Platform: durable consumer offset receipts for the Stargate Kafka sink. last_processed_offset is the last offset durably written (the consumer commits Kafka offset = last_processed_offset + 1). Owning module: Telemetry Platform.';

-- ── verification ─────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('tel_stream_kafka_rows', 'tel_stream_consumer_offsets')
        AND rowsecurity = true;
    IF n <> 2 THEN
        RAISE EXCEPTION 'telemetry kafka provenance migration incomplete: % of 2 tables with RLS', n;
    END IF;
    RAISE NOTICE 'telemetry kafka stream provenance ready (2 tables, RLS on)';
END $$;
