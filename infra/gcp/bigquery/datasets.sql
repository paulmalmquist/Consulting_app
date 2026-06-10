-- BigQuery dataset definitions for Winston event lake.
--
-- Apply with:
--   bq mk --location=US --dataset PROJECT_ID:winston_events_raw
--
-- The raw dataset is append-only. It is NOT a substitute for Supabase Postgres
-- (system of record). BigQuery is analytics, replay, and observability only.

CREATE SCHEMA IF NOT EXISTS `winston_events_raw`
  OPTIONS (
    description = "Raw Winston domain events — append-only event lake. "
                  "Never a read source for authoritative financial or operational state.",
    location     = "US"
  );
