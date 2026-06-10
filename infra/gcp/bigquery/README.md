# BigQuery — Winston Event Lake

Append-only raw event lake. **Not** a substitute for Supabase Postgres
(system of record). BigQuery holds analytics, replay, and observability
data only.

## Dataset

`winston_events_raw` — all domain event streams, one generic `events` table.
New domains add a topic constant in `backend/app/events/topics.py` and a sink
routing entry; no schema changes needed.

## Prerequisites

```bash
# Authenticate (one-time)
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

## Create the dataset

```bash
bq mk --location=US --dataset YOUR_PROJECT_ID:winston_events_raw
```

## Create the events table

```bash
bq mk \
  --table \
  --time_partitioning_type=DAY \
  --time_partitioning_field=ingested_at \
  --clustering_fields=event_type,business_id,run_id \
  YOUR_PROJECT_ID:winston_events_raw.events \
  infra/gcp/bigquery/events_schema.json
```

Or with the DDL file (requires the dataset to exist first):

```bash
bq query --use_legacy_sql=false < infra/gcp/bigquery/events_table.sql
```

## Verify a run landed

Replace `<test_run_id>` with the `run_id` from a real execution:

```sql
SELECT event_id, event_type, run_id, occurred_at, source
  FROM `YOUR_PROJECT_ID.winston_events_raw.events`
 WHERE run_id = '<test_run_id>'
 ORDER BY occurred_at;
```

A passing receipt shows:

```
execution.started
execution.completed
```

Or on a forced failure:

```
execution.started
execution.failed
```

Invalid envelopes never reach this table — they land as dead-letter rows
(`dead_letter = TRUE`) with a `dead_letter_reason`.

## Environment variables (sink worker)

| Variable | Example | Purpose |
|---|---|---|
| `BQ_PROJECT_ID` | `novendor-prod` | GCP project |
| `BQ_DATASET` | `winston_events_raw` | Target dataset (default: `winston_events_raw`) |
| `BQ_TABLE` | `events` | Target table (default: `events`) |
| `BQ_ENABLED` | `true` | Master switch (default: `false`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/run/secrets/sa.json` | Service account path (or use Workload Identity on GKE) |

## Notes

- `idempotency_key` is used as BigQuery `insertId` for best-effort dedup on streaming inserts.
- Hard dedup: run `SELECT DISTINCT` or `QUALIFY ROW_NUMBER() OVER (PARTITION BY idempotency_key ...)` on replays.
- The sink worker never writes to Postgres. It is observational only.
