# Winston event analytics (Plan 0004 Phase 6A)

The BigQuery semantic layer over the raw event lake. Every rollup, query, and
(future) dashboard reads from `winston_events_analytics`, **never** from the raw
`winston_events_raw.events` table directly.

## Why a deduped layer exists (read this first)

`winston_events_raw.events` is **append-only and may contain replay duplicates.**
BigQuery streaming-insert `insertId` dedup only holds for a short window
(~1 min, same partition). A historical replay of an event (same
`idempotency_key`) lands outside that window and writes a second raw row —
verified in Phase 5B (replaying 3 HR signals produced 2 raw rows each).

**Aggregating raw rows directly double-counts replayed events and produces
numbers that lie.** `events_deduped` collapses duplicates on the stable
`idempotency_key` (earliest by `ingested_at`, tie-break `event_id`). All other
views build on it.

## Files (apply in order)

| File | Creates |
|---|---|
| `00_dataset.sql` | `winston_events_analytics` dataset |
| `01_events_deduped.sql` | `events_deduped` view — the dedup foundation |
| `02_execution_analytics.sql` | `execution_events_daily`, `execution_run_lifecycle`, `dead_letter_daily` |
| `03_hr_signal_analytics.sql` | `hr_signals_observed`, `hr_signal_latest`, `hr_signal_freshness_summary`, `hr_signal_counts_daily`, `hr_dead_letters` |

## Apply

The SQL uses `PROJECT` as a placeholder. Substitute the target project and run
each file. With the `bq` CLI:

```bash
PROJECT=paultest-d3cb1
for f in 00_dataset 01_events_deduped 02_execution_analytics 03_hr_signal_analytics; do
  sed "s/PROJECT/$PROJECT/g" "infra/gcp/bigquery/analytics/$f.sql" \
    | bq query --use_legacy_sql=false --project_id="$PROJECT"
done
```

Or via the Python client (no `bq` CLI / no python3.14 dependency) — see the
apply snippet in `infra/gcp/bigquery/setup_gcp_auth.md`. Auth is ADC locally
(`gcloud auth application-default login`); no credentials are committed.

## Acceptance queries

**1. Raw vs deduped count (proves dedup is doing work):**
```sql
SELECT
  (SELECT COUNT(*) FROM `PROJECT.winston_events_raw.events`)              AS raw_rows,
  (SELECT COUNT(*) FROM `PROJECT.winston_events_analytics.events_deduped`) AS deduped_rows;
-- deduped_rows < raw_rows when replay duplicates exist.
```

**2. Deduped HR signals collapse to 8 for the replayed bundle:**
```sql
SELECT COUNT(*) AS hr_signal_rows
FROM `PROJECT.winston_events_analytics.events_deduped`
WHERE run_id = 'hr-bundle:2026-06-15' AND event_type = 'hr.signal.observed';
-- expect 8 (raw had duplicates from the bounded replay)
```

**3. Latest value of every HR signal:**
```sql
SELECT signal_name, signal_value_json, staleness_status, as_of_date
FROM `PROJECT.winston_events_analytics.hr_signal_latest`
ORDER BY signal_name;
-- expect all 8 canonical signals
```

**4. Dead-letter analytics shows the malformed event:**
```sql
SELECT source, dead_letter_reason, raw_payload
FROM `PROJECT.winston_events_analytics.hr_dead_letters`;
```

**5. Execution event counts:**
```sql
SELECT event_date, event_type, source, event_count
FROM `PROJECT.winston_events_analytics.execution_events_daily`
ORDER BY event_date DESC, event_type;
```

## Guardrails

- BigQuery stays observational / append-only — never an app read source.
- No Postgres mutation, no migration. These are read-only views.
- Replay safety = stable `idempotency_key` + this query-time dedup. `insertId`
  does NOT provide durable dedup; do not rely on it.
