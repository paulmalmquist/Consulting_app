-- Plan 0004 Phase 6A — History Rhymes signal analytics.
-- Built on events_deduped (NOT raw). HR signal payload fields live in the JSON
-- `payload` column: signal_name, signal_value, signal_timestamp, source,
-- staleness_status, confidence, units, as_of_date. signal_value may be a scalar,
-- a JSON object (housing), or a string (fed_tone) — extracted with JSON_QUERY so
-- any type survives.

-- Base projection: one clean row per deduped hr.signal.observed event.
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.hr_signals_observed`
OPTIONS (
  description = "Flattened hr.signal.observed events from events_deduped (replay-safe). signal_value kept as JSON to preserve scalar/object/string."
) AS
SELECT
  event_id,
  occurred_at,
  ingested_at,
  JSON_VALUE(payload, '$.signal_name')        AS signal_name,
  JSON_QUERY(payload, '$.signal_value')       AS signal_value_json,
  JSON_VALUE(payload, '$.as_of_date')         AS as_of_date,
  JSON_VALUE(payload, '$.staleness_status')   AS staleness_status,
  JSON_VALUE(payload, '$.source')             AS signal_source,
  SAFE_CAST(JSON_VALUE(payload, '$.confidence') AS FLOAT64) AS confidence,
  JSON_VALUE(payload, '$.units')              AS units,
  run_id
FROM `PROJECT.winston_events_analytics.events_deduped`
WHERE event_type = 'hr.signal.observed'
  AND dead_letter = FALSE;

-- Latest observed value per signal_name (by as_of_date, then ingested_at).
-- Returns one row per signal — the current state of each HR signal.
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.hr_signal_latest`
OPTIONS (
  description = "Latest value per HR signal_name (by as_of_date then ingested_at) from events_deduped. One row per signal."
) AS
SELECT * EXCEPT (_rn)
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY signal_name
      ORDER BY as_of_date DESC, ingested_at DESC
    ) AS _rn
  FROM `PROJECT.winston_events_analytics.hr_signals_observed`
)
WHERE _rn = 1;

-- Freshness/staleness summary: how many signals at each staleness level, latest.
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.hr_signal_freshness_summary`
OPTIONS (
  description = "Count of HR signals by staleness_status at their latest observation."
) AS
SELECT
  staleness_status,
  COUNT(*)                              AS signal_count,
  ARRAY_AGG(signal_name ORDER BY signal_name) AS signals
FROM `PROJECT.winston_events_analytics.hr_signal_latest`
GROUP BY staleness_status;

-- Daily event counts by signal_name.
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.hr_signal_counts_daily`
OPTIONS (
  description = "Daily hr.signal.observed counts by signal_name from events_deduped (replay-safe)."
) AS
SELECT
  as_of_date,
  signal_name,
  COUNT(*)                AS observation_count
FROM `PROJECT.winston_events_analytics.hr_signals_observed`
GROUP BY as_of_date, signal_name;

-- HR dead-letter detail: malformed HR-stream payloads, by reason + source.
-- (HR dead-letters come from history-rhymes.signals.v1; the raw bytes are
-- preserved in payload.$.raw so a bad signal is debuggable.)
CREATE OR REPLACE VIEW `PROJECT.winston_events_analytics.hr_dead_letters`
OPTIONS (
  description = "Dead-letter rows whose preserved raw payload references HR signals, by reason. Nothing dropped silently."
) AS
SELECT
  event_id,
  ingested_at,
  source,
  dead_letter_reason,
  JSON_VALUE(payload, '$.raw')   AS raw_payload
FROM `PROJECT.winston_events_analytics.events_deduped`
WHERE dead_letter = TRUE
  AND JSON_VALUE(payload, '$.raw') LIKE '%signal_name%';
