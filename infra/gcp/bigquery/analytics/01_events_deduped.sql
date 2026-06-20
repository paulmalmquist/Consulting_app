-- Plan 0004 Phase 6A — the deduped event view. THE foundation.
--
-- Raw winston_events_raw.events is append-only and CAN contain replay
-- duplicates: BigQuery streaming-insert insertId dedup only holds for a short
-- window (~1 min, same partition), so a historical replay of the same event
-- (same idempotency_key) writes a second raw row. Verified in Phase 5B:
-- replaying 3 HR signals produced 2 raw rows each.
--
-- Durable dedup is therefore done HERE, at read time, on the stable
-- content-addressed idempotency_key. Every analytics view below builds on this
-- view, never on the raw table. Aggregating raw rows directly would
-- double-count replayed events and chart numbers that lie.
--
-- Dedup policy: keep the EARLIEST row per idempotency_key by ingested_at (the
-- first time the platform observed the event), tie-broken by event_id for full
-- determinism. Dead-letter rows carry a non-null idempotency_key too
-- (dead_letter:<sha256> — Phase 5A fix), so distinct dead-letters keep distinct
-- keys and dedup the same way; a replayed bad payload collapses to one row.
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.events_deduped`
OPTIONS (
  description = "One row per idempotency_key (earliest by ingested_at, tie-break event_id) over winston_events_raw.events. Collapses replay duplicates. The canonical read layer — do not aggregate raw events directly."
) AS
SELECT
  * EXCEPT (_rn)
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY idempotency_key
      ORDER BY ingested_at ASC, event_id ASC
    ) AS _rn
  FROM `PROJECT.winston_events_raw.events`
)
WHERE _rn = 1;

-- Volume summary: raw vs deduped counts, so the dashboard can show the
-- "lake vs analytics" distinction WITHOUT the API ever touching the raw table
-- itself. The raw->deduped boundary legitimately lives in the analytics layer;
-- the API reads only this view. raw_rows here is a COUNT, never a content
-- aggregation.
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.event_volume_summary`
OPTIONS (
  description = "Raw vs deduped row counts + dead-letter count. The single place the raw table is counted, so API/UI never query raw directly."
) AS
SELECT
  (SELECT COUNT(*) FROM `PROJECT.winston_events_raw.events`)                       AS raw_rows,
  (SELECT COUNT(*) FROM `PROJECT.winston_events_analytics.events_deduped`)         AS deduped_rows,
  (SELECT COUNT(*) FROM `PROJECT.winston_events_analytics.events_deduped`
     WHERE dead_letter = TRUE)                                                     AS dead_letter_rows;
