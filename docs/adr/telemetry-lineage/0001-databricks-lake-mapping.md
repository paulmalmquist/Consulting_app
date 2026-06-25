# ADR 0001 — Databricks lake lineage: land Stargate in a Bronze Delta table and stamp pointers notebook-side

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** Paul Malmquist (owner)
- **Supersedes:** —
- **Superseded by:** —
- **Related:** `docs/plans/` integrated master plan (telemetry productization + lineage), [`backend/app/services/telemetry_stream_lineage.py`](../../../backend/app/services/telemetry_stream_lineage.py), [`repo-b/db/schema/10034_telemetry_stream_databricks_pointers.sql`](../../../repo-b/db/schema/10034_telemetry_stream_databricks_pointers.sql), [`scripts/streaming/stargate/verify_lineage.py`](../../../scripts/streaming/stargate/verify_lineage.py)

## Context

The telemetry lineage drawer renders four provenance layers for a displayed anomaly or triage record: Kafka detection, AI triage, Databricks lake, and Postgres serving. The **Databricks lake** layer permanently reads `not_available` with `databricks_null_reason = databricks_table_mapping_not_configured`.

That is honest, not a bug. The `10034` migration added the pointer columns (`databricks_catalog/schema/table/path`, `delta_version`, `delta_commit_timestamp`, `databricks_job_id/run_id/notebook_path`, `databricks_lineage_status`, `databricks_null_reason`) to `tel_stream_kafka_rows` and a six-column subset to `tel_stream_triage_events`, all defaulting to `not_available`. Nothing ever writes a real pointer, because the Stargate printer stream (`stargate.printer.*`) lands in **neither Databricks nor BigQuery** today:

- The GKE Kafka→BigQuery sink ([`backend/app/events/sink_worker.py`](../../../backend/app/events/sink_worker.py)) only routes `winston.executions.v1` and `history-rhymes.signals.v1` to `winston_events_raw.events` (allow-list in `infra/k8s/base/deployment.yaml`). Stargate topics are not routed.
- `novendor_1.telemetry.*` on Databricks is the separate NASA C-MAPSS / SMAP / IMS + factory-NCR lane (`telemetry-platform/databricks/`), and that lane is batch-only. No Delta table holds the Stargate printer stream and no notebook reads from a Kafka topic.

So connecting the lake layer is not just wiring a pointer. It first requires a durable raw landing for the Stargate stream in Delta, then a job that stamps the pointer columns on the matching serving-slice rows. The lineage contract ([`telemetry_stream_lineage.py::_databricks_layer`](../../../backend/app/services/telemetry_stream_lineage.py)) is data-driven: it returns `available` the instant a row carries `databricks_lineage_status = 'available'` and real catalog/table/version.

One backend gap was found during scoping: the `_ROW_COLS` and `_TRIAGE_COLS` SELECT lists did not include the pointer columns, so even a row stamped `available` would surface null catalog/table/version. That SELECT fix is the first, lowest-risk step and is shipped alongside this ADR.

## Decision

Connect the lake layer by **landing the Stargate printer stream in a Bronze Delta table and stamping the Postgres pointer columns from a Databricks notebook**. Concretely:

1. **Target Databricks Delta, not the BigQuery sink.** The layer is labeled "Databricks lake" and the repo's pattern is that Databricks metadata is notebook-produced, never backend-produced. The backend stays read-only over Postgres; it never queries Delta at runtime (`backend/app/data/databricks_source.py` remains a stub and no `databricks-sql-connector` is added to the backend image).

2. **Bronze table:** `novendor_1.telemetry.bronze_stargate_printer`, partitioned by ingest date, holding the raw payload plus the Kafka coordinate (`kafka_topic, kafka_partition, kafka_offset`) so a Delta row joins back to `tel_stream_kafka_rows`. The join key is the globally unique `(kafka_topic, kafka_partition, kafka_offset)` triple; the Postgres row supplies `env_id` and `business_id`.

3. **Ingest mechanism:** a scheduled Spark **batch** read from Kafka over a bounded offset range per run (not structured streaming, not a derived copy from the Postgres serving slice). This lands the true raw stream, reuses the existing batch-only Databricks lane (no long-running cluster), and keeps cost bounded. The batch job must be cost-safe: bounded offset range, an explicit max-records-per-run cap, a dry-run / log-only mode that runs first, a job cluster that tears down after the run, a clear stop condition when caught up, and a visible job receipt (rows appended, offset range, Delta version, run id) each run.

4. **Pointer stamping:** a scheduled Databricks notebook reads the bronze table's current version and commit timestamp via `DESCRIBE HISTORY ... LIMIT 1` (reusing `skills/rs-factory-ml/scripts/databricks_client.py::sql_dicts`, the pattern in `time_travel_demo.py`), then `UPDATE`s `tel_stream_kafka_rows` and `tel_stream_triage_events`, setting the pointer columns and flipping `databricks_lineage_status` to `available` on rows whose Kafka coordinate is present in Delta. Idempotent: re-running re-stamps the same version. It connects over `TELEMETRY_DATABASE_URL` (Lakebase, on Railway `authentic-sparkle`) as `telemetry_app`, which already holds UPDATE on these tables.

The honesty boundary is preserved: Postgres stays the serving slice, Delta becomes the real raw lake, and a pointer only ever carries a value a job actually verified against Delta. Pointers are never inferred. Absent a verified Delta row, the layer stays `not_available` with an explicit `null_reason`.

This ADR being **Accepted** fixes the *architecture* (Delta + notebook-side stamping). It does not pre-approve any particular notebook implementation. Each follow-up PR earns its own review with evidence (job receipts, `verify_lineage.py` output).

## Alternatives considered

- **Confluent managed Databricks Delta Lake sink connector (Kafka→Delta directly).** The cleanest real-time path and the right production upgrade, but it adds a managed connector to operate (cost plus lifecycle through the `confluent-stargate-lifecycle` skill). Deferred as the upgrade once real-time is needed; the scheduled batch read meets the demo need at bounded cost.
- **Spark Structured Streaming notebook (`readStream` from Kafka → Delta).** A new pattern for this repo (batch-only today) that needs a long-running job and cluster. Rejected as over-heavy for current needs.
- **Route Stargate through the existing BigQuery sink and read Delta from BigQuery.** Rejected: the layer is "Databricks lake," and adding Stargate to the Winston BigQuery sink mixes two unrelated lanes.
- **Derive the Delta table from the Postgres serving slice.** Rejected: the serving slice is deterministically sampled (`kafka_offset % N`), so a Delta table built from it would be a derived copy, not the raw lake, which breaks the honesty boundary.
- **Rename or hide the layer.** Rejected: the layer is correctly fail-closed today; the goal is to make it real, not to relabel an honest gap.

## Consequences

- Positive: the lineage drawer's Databricks section becomes real and verifiable; the backend stays a single read-only Postgres surface; Databricks remains notebook-produced; cost stays bounded through the batch-with-teardown shape.
- Negative / cost: a new Bronze Delta table and two scheduled Databricks jobs to operate; raw Stargate payloads are now stored in Delta (retention and partitioning to manage); real-time lineage waits for the connector upgrade.
- Follow-ups (tracked as the lineage workstream PRs): Ticket A (Bronze Delta landing), Ticket B (pointer-stamping job), Ticket C (the `_ROW_COLS`/`_TRIAGE_COLS` SELECT fix shipped with this ADR, plus the end-to-end verification).

## Validation

`python scripts/streaming/stargate/verify_lineage.py --base https://novendor.ai` shows `databricks_lake.status = available` with a real `catalog/schema/table/delta_version` for a stamped row, and the lineage drawer renders the populated Databricks section instead of the fail-closed note. Re-running the stamping job re-stamps the same `delta_version` with no duplicate Delta rows for a replayed offset range. Revisit if Stargate moves to a real-time Delta sink or if raw-payload retention in Delta becomes a cost concern.
