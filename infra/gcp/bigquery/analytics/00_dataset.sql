-- Plan 0004 Phase 6A — analytics dataset.
-- The semantic layer. Every rollup/dashboard reads from here, NEVER from the
-- raw winston_events_raw.events table directly (raw is append-only and may
-- contain replay duplicates — see 01_events_deduped.sql).
--
-- Replace PROJECT with the target project (e.g. paultest-d3cb1) or run via the
-- README bq commands which template it.
CREATE SCHEMA IF NOT EXISTS `PROJECT.winston_events_analytics`
OPTIONS (
  location = "US",
  description = "Winston event analytics. Deduped views + rollups over winston_events_raw.events. Read layer for analytics. Raw table stays append-only."
);
