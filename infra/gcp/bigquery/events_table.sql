-- BigQuery table: winston_events_raw.events
--
-- One row per EventEnvelope. All domain event streams land here; event_type
-- distinguishes them. Column names match the EventEnvelope wire contract
-- exactly so the sink worker can map fields without a translation layer.
--
-- Apply with:
--   bq query --use_legacy_sql=false < infra/gcp/bigquery/events_table.sql
--
-- Or via the bq CLI:
--   bq mk --table \
--     --time_partitioning_type=DAY \
--     --time_partitioning_field=ingested_at \
--     --clustering_fields=event_type,business_id,run_id \
--     PROJECT_ID:winston_events_raw.events \
--     infra/gcp/bigquery/events_schema.json
--
-- To verify a row landed after a test run:
--   SELECT event_id, event_type, run_id, occurred_at, source
--     FROM `PROJECT_ID.winston_events_raw.events`
--    WHERE run_id = '<test_run_id>'
--    ORDER BY occurred_at;
-- Expected: execution.started row + execution.completed (or execution.failed) row.

CREATE TABLE IF NOT EXISTS `winston_events_raw.events` (
  -- identity / idempotency
  event_id        STRING    NOT NULL,
  idempotency_key STRING    NOT NULL,
  event_type      STRING    NOT NULL,
  schema_version  INT64     NOT NULL,

  -- time (UTC)
  occurred_at     TIMESTAMP NOT NULL,
  published_at    TIMESTAMP,

  -- correlation
  correlation_id  STRING,
  run_id          STRING,

  -- tenancy (nullable — single-tenant domains omit these)
  business_id     STRING,
  env_id          STRING,

  -- producer + payload
  source          STRING    NOT NULL,
  payload         JSON,

  -- sink metadata
  ingested_at     TIMESTAMP NOT NULL,
  dead_letter     BOOL      NOT NULL DEFAULT FALSE,
  dead_letter_reason STRING
)
PARTITION BY DATE(ingested_at)
CLUSTER BY event_type, business_id, run_id
OPTIONS (
  description = "Raw Winston domain events — all streams, append-only. "
                "Dead-letter rows have dead_letter=TRUE and a failure reason. "
                "idempotency_key is used as BigQuery insertId for best-effort dedup."
);
