# BigQuery — Winston Event Lake

Append-only raw event lake. **Not** a substitute for Supabase Postgres
(system of record). BigQuery holds analytics, replay, and observability
data only.

## Dataset and table

`winston_events_raw.events` — all domain event streams, one generic table.
New domains add a topic constant in `backend/app/events/topics.py` and a sink
routing entry; no schema changes needed.

## Prerequisites

```bash
# Install gcloud CLI (one-time, if not present)
# https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Set Application Default Credentials (ADC) — used by the Python SDK
gcloud auth application-default login
```

Alternatively, use a service account key:
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# Never commit this file. Add *.json to .gitignore for any key directory.
```

## Create the dataset

```bash
bq mk --location=US --dataset YOUR_PROJECT_ID:winston_events_raw
```

## Create the events table

```bash
# Schema-file approach (preferred — matches sink worker column names exactly)
bq mk \
  --table \
  --time_partitioning_type=DAY \
  --time_partitioning_field=ingested_at \
  --clustering_fields=event_type,business_id,run_id \
  YOUR_PROJECT_ID:winston_events_raw.events \
  infra/gcp/bigquery/events_schema.json

# Or DDL approach (requires dataset to exist first):
# Replace YOUR_PROJECT_ID in events_table.sql, then:
bq query --use_legacy_sql=false < infra/gcp/bigquery/events_table.sql
```

## Phase 3A smoke — prove one real write

Set env vars, then run from the repo root:

```bash
export BQ_ENABLED=true
export BQ_PROJECT_ID=your-gcp-project
# BQ_DATASET and BQ_TABLE default to winston_events_raw / events

python scripts/streaming/bq_smoke.py
```

The script:
1. Builds one `execution.completed` EventEnvelope with a fresh `run_id`
2. Runs `process_message()` (same path as a real Kafka consumer)
3. Writes to BigQuery via `write_row_to_bq()` with `idempotency_key` as `insertId`
4. Queries back the row by `run_id` and prints the acceptance receipt

**Streaming insert propagation:** BigQuery streaming inserts are visible within
seconds, not immediately. If the query returns 0 rows, wait ~10 seconds and
re-run the acceptance query manually.

## Full acceptance query (Phase 3A→3B)

Once the Kafka→sink→BQ pipeline is live, run one execution via the API, capture
the `run_id` from the response, then query:

```sql
SELECT
  event_id,
  idempotency_key,
  event_type,
  run_id,
  occurred_at,
  published_at,
  ingested_at,
  source,
  dead_letter,
  dead_letter_reason
FROM `YOUR_PROJECT_ID.winston_events_raw.events`
WHERE run_id = '<run_id_from_api_response>'
ORDER BY ingested_at DESC;
```

A passing Phase 3B receipt shows the lifecycle pair for that `run_id`:

```
event_type             occurred_at
----                   -----------
execution.started      2026-06-10T...
execution.completed    2026-06-10T...
```

Or on a forced failure: `execution.started` + `execution.failed`.

Invalid envelopes never reach this table — they land as `dead_letter=true` rows
with a `dead_letter_reason`.

## Environment variables (sink worker)

| Variable | Example | Purpose |
|---|---|---|
| `BQ_ENABLED` | `true` | Master switch (default: `false` — inert unless set) |
| `BQ_PROJECT_ID` | `novendor-prod` | GCP project |
| `BQ_DATASET` | `winston_events_raw` | Target dataset (default: `winston_events_raw`) |
| `BQ_TABLE` | `events` | Target table (default: `events`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/run/secrets/sa.json` | SA key path (or use Workload Identity on GKE — preferred) |

## Deduplication

- Streaming insert: `insertId = idempotency_key` (BigQuery best-effort dedup).
- Hard dedup on replay:
  ```sql
  SELECT * EXCEPT (row_num) FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY ingested_at) AS row_num
    FROM `YOUR_PROJECT_ID.winston_events_raw.events`
  ) WHERE row_num = 1
  ```

## Guardrails

- The sink worker **never writes to Postgres**. It is observational only.
- BigQuery is **never a read source** for execution status, REPE KPIs, or HR ledger.
- `BQ_ENABLED=false` (default) means `write_row_to_bq` is a no-op — safe in CI.
- `google-cloud-bigquery` is in `requirements.txt`; it lazy-imports inside `sink.py`
  so its absence is caught as a `BigQuerySinkError` (routed to dead-letter), not a crash.
