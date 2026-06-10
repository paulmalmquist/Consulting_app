# GCP Auth Setup — Phase 3A.1

Run these steps once on the machine where you'll run `bq_smoke.py`.
No credentials are committed to the repo. This is a local-only setup.

## Option A: Application Default Credentials (recommended for dev)

### 1. Install gcloud CLI (if not present)

Windows:
```powershell
# Download and run the installer from:
# https://cloud.google.com/sdk/docs/install#windows
# Or via winget:
winget install Google.CloudSDK
```

Restart your shell after install.

### 2. Authenticate

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login
```

The last command opens a browser window. After consent, ADC is written to
`~/.config/gcloud/application_default_credentials.json` (never committed).

### 3. Set env vars and run the smoke

```bash
export BQ_ENABLED=true
export BQ_PROJECT_ID=YOUR_PROJECT_ID
# BQ_DATASET and BQ_TABLE default to winston_events_raw / events

python scripts/streaming/bq_smoke.py
```

---

## Option B: Service account key (CI / server contexts)

### 1. Create a service account in GCP Console

Required roles:
- `roles/bigquery.dataEditor` (insert rows)
- `roles/bigquery.jobUser` (run queries for the receipt)

### 2. Download the JSON key

Save it to a path **outside the repo** (e.g. `~/novendor-bq-sa.json`).
Never put it under `c:/Projects/Consulting_app/` — it would be picked up by
git status. The `.gitignore` at repo root does not cover `*.json` globally.

### 3. Set env vars and run the smoke

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/novendor-bq-sa.json
export BQ_ENABLED=true
export BQ_PROJECT_ID=YOUR_PROJECT_ID

python scripts/streaming/bq_smoke.py
```

---

## Apply BigQuery DDL first (one-time)

Before the smoke will write, the dataset and table must exist:

```bash
# Create dataset
bq mk --location=US --dataset YOUR_PROJECT_ID:winston_events_raw

# Create events table from schema descriptor
bq mk \
  --table \
  --time_partitioning_type=DAY \
  --time_partitioning_field=ingested_at \
  --clustering_fields=event_type,business_id,run_id \
  YOUR_PROJECT_ID:winston_events_raw.events \
  infra/gcp/bigquery/events_schema.json

# Verify
bq show YOUR_PROJECT_ID:winston_events_raw.events
```

---

## Expected smoke output (once credentials work)

```
Winston Event Streaming — Phase 3A BigQuery smoke
------------------------------------------------------------
BQ_ENABLED    = True
BQ_PROJECT_ID = YOUR_PROJECT_ID
BQ_DATASET    = winston_events_raw
BQ_TABLE      = events

Envelope built:
  event_id        = <uuid>
  event_type      = execution.completed
  idempotency_key = execution.completed:<uuid>
  run_id          = <uuid>
  business_id     = <uuid>
------------------------------------------------------------
Wire bytes (NNN bytes):
  {"event_id": "...", "event_type": "execution.completed", ...}
------------------------------------------------------------
Running process_message() → validate → map → write_row_to_bq ...
Result: {"status": "ok", "event_type": "execution.completed", "event_id": "..."}
------------------------------------------------------------
Querying BigQuery for acceptance receipt ...

Acceptance query:
SELECT event_id, idempotency_key, event_type, run_id, ...
  FROM `YOUR_PROJECT_ID.winston_events_raw.events`
 WHERE run_id = '<uuid>'
 ORDER BY ingested_at DESC
 LIMIT 5

Acceptance receipt:
------------------------------------------------------------
  event_id          = <uuid>
  event_type        = execution.completed
  idempotency_key   = execution.completed:<uuid>
  run_id            = <uuid>
  occurred_at       = 2026-06-10 ...
  published_at      = 2026-06-10 ...
  ingested_at       = 2026-06-10 ...
  source            = backend
  dead_letter       = False
  dead_letter_reason = None

------------------------------------------------------------
Phase 3A PASS: 1 row(s) in `YOUR_PROJECT_ID.winston_events_raw.events` for run_id=<uuid>
```

Note: BigQuery streaming inserts have a short propagation delay (~5–30 seconds).
If the query returns 0 rows immediately, wait and re-run — the write happened.
The smoke script prints the acceptance query for manual re-run if needed.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `DefaultCredentialsError: Your default credentials were not found` | Run `gcloud auth application-default login` |
| `BQ_PROJECT_ID is not set` | `export BQ_PROJECT_ID=your-project` |
| `google-cloud-bigquery is not installed` | `pip install google-cloud-bigquery>=3.11` |
| `403 Access Denied` | SA needs `roles/bigquery.dataEditor` + `roles/bigquery.jobUser` |
| `404 Not found: Dataset` | Run the `bq mk --dataset` command above |
| `404 Not found: Table` | Run the `bq mk --table` command above |
| 0 rows after write | Wait 10–30s; streaming inserts propagate with a short delay |
