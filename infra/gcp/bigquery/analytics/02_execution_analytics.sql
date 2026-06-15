-- Plan 0004 Phase 6A — execution event analytics.
-- Built on events_deduped (NOT raw). Covers the execution lifecycle stream
-- (execution.started / execution.completed / execution.failed) plus dead-letters.

-- Daily counts by event_type + source (valid events only; dead-letters excluded
-- here and counted separately below).
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.execution_events_daily`
OPTIONS (
  description = "Daily execution event counts by event_type + source, from events_deduped (replay-safe). Valid events only."
) AS
SELECT
  DATE(occurred_at)                          AS event_date,
  event_type,
  source,
  COUNT(*)                                   AS event_count,
  COUNT(DISTINCT run_id)                      AS distinct_runs
FROM `PROJECT.winston_events_analytics.events_deduped`
WHERE event_type LIKE 'execution.%'
  AND dead_letter = FALSE
GROUP BY event_date, event_type, source;

-- Lifecycle summary per run: did we see started / completed / failed?
-- A run is "complete" if it has a terminal event; "in_flight" if only started.
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.execution_run_lifecycle`
OPTIONS (
  description = "Per-run execution lifecycle (started/completed/failed seen) from events_deduped. Observational — Postgres remains authoritative for execution status."
) AS
SELECT
  run_id,
  business_id,
  MIN(occurred_at)                                                   AS first_seen,
  MAX(occurred_at)                                                   AS last_seen,
  COUNTIF(event_type = 'execution.started')                          AS started_count,
  COUNTIF(event_type = 'execution.completed')                        AS completed_count,
  COUNTIF(event_type = 'execution.failed')                           AS failed_count,
  CASE
    WHEN COUNTIF(event_type = 'execution.failed')    > 0 THEN 'failed'
    WHEN COUNTIF(event_type = 'execution.completed') > 0 THEN 'completed'
    WHEN COUNTIF(event_type = 'execution.started')   > 0 THEN 'in_flight'
    ELSE 'unknown'
  END                                                                AS lifecycle_state
FROM `PROJECT.winston_events_analytics.events_deduped`
WHERE event_type LIKE 'execution.%'
  AND dead_letter = FALSE
  AND run_id IS NOT NULL
GROUP BY run_id, business_id;

-- Dead-letter counts by day + source + reason (across ALL streams, but useful
-- for execution-stream monitoring; HR has its own dead-letter view too).
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.dead_letter_daily`
OPTIONS (
  description = "Daily dead-letter counts by source + reason from events_deduped. Nothing is silently dropped. The failure ledger."
) AS
SELECT
  DATE(ingested_at)        AS ingested_date,
  source,
  dead_letter_reason,
  COUNT(*)                 AS dead_letter_count
FROM `PROJECT.winston_events_analytics.events_deduped`
WHERE dead_letter = TRUE
GROUP BY ingested_date, source, dead_letter_reason;
