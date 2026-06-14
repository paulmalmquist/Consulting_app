-- winston_ops.audit_events_bq
--
-- BigQuery mirror of Postgres app.audit_events, the durable home for historical
-- compliance and cost analytics (plan PR 3 / Resource Selection Doctrine). Postgres
-- holds the ~30-day operational hot window; everything older lives here.
--
-- This is a SCHEMA DOCUMENT. PR 3 ships:
--   - this DDL (documentation),
--   - scripts/export_audit_to_bq.py (manual batch export, fail-closed),
-- and explicitly does NOT ship continuous replication or a scheduled export.
--
-- Load via the manual script. Idempotency is by audit_event_id (MERGE on re-run).
-- Partitioned by ingest day and clustered by tool_name for cost-efficient scans.

CREATE TABLE IF NOT EXISTS `winston_ops.audit_events_bq` (
  audit_event_id   STRING   NOT NULL,   -- uuid, the MERGE key
  tenant_id        STRING,
  business_id      STRING,
  actor            STRING   NOT NULL,
  action           STRING   NOT NULL,
  tool_name        STRING   NOT NULL,
  object_type      STRING,
  object_id        STRING,
  success          BOOL     NOT NULL,
  latency_ms       INT64    NOT NULL,
  input_redacted   JSON,                -- already redacted at write time in Postgres
  output_redacted  JSON,
  error_message    STRING,
  created_at       TIMESTAMP NOT NULL,
  exported_at      TIMESTAMP NOT NULL   -- when the row landed in BigQuery
)
PARTITION BY DATE(created_at)
CLUSTER BY tool_name, success;

-- Suggested MERGE shape used by the exporter (idempotent re-runs):
--
-- MERGE `winston_ops.audit_events_bq` T
-- USING <staged batch> S
-- ON T.audit_event_id = S.audit_event_id
-- WHEN NOT MATCHED THEN INSERT ROW;
