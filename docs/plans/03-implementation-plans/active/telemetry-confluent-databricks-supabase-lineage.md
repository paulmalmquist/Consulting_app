# Telemetry Confluent → Databricks → Postgres Lineage Walkthrough

**Status:** Active — Ticket 1 **blocked on owner-role apply** (schema written + dry-run validated)
**Started:** 2026-06-24
**Risk:** Medium (Ticket 1: additive schema; later tickets higher with consumer/Confluent access)
**Linked build plan:** [Telemetry Platform Build](0003-telemetry-platform-build.md)
**Related:** [Telemetry Metadata Explorer](telemetry-metadata-explorer.md) (visual lineage UI),
[Event Streaming / BigQuery / GKE](0004-event-streaming-bigquery-gke.md) (raw-history sink)

## Objective

Make the telemetry environment prove how a displayed anomaly or triage record flows end to end:

```
Confluent Kafka  →  Databricks/Delta raw lake  →  Postgres serving slice  →  FastAPI  →  frontend lineage drawer
                                                   (Lakebase in prod / Supabase local)
```

Plus the AI-triage lane (the Streaming Agent **explains** anomalies, it does not detect them):

```
stargate.printer.anomalies.v1  →  Paul_Streaming_Agent / stargate-anomaly-triage-gpt4o
  →  stargate.printer.anomaly.triage.v1  →  Postgres triage projection  →  drawer
```

## Product truth (honesty boundary)

- Confluent Kafka = live event transport, topic/partition/offset + schema proof.
- Databricks/Delta = durable RAW/historical telemetry lake, model/eval/feature history.
- Postgres serving slice (Databricks **Lakebase** managed Postgres via `TELEMETRY_DATABASE_URL` in
  telemetry/prod; **Supabase** Postgres fallback locally) = latest rows, anomaly/triage summaries,
  receipts, and **pointers** into the lake. **Not** the lake, not a raw warehouse.
- Stargate is deterministic synthetic printer replay carried through real infrastructure — not live
  physical rocket/printer telemetry. The deterministic stream/Flink/anomaly rules detect; the agent
  triages. Missing lineage layers must **fail closed** with an explicit `*_unavailable` reason, never
  faked.

## Session Brief (Ticket 1)

- **Requested work:** next slice of the Confluent + Databricks + Postgres telemetry lineage walkthrough.
- **Routed plan:** this file.
- **Environment:** Telemetry / Stargate.
- **Shared standards touched:** Data/schema (additive migration, RLS, tenant scope). No AI-runtime,
  design-system, or deployment change in this ticket.
- **Expected source areas:** `repo-b/db/schema/`, `docs/plans/`, `tips.md`.
- **Acceptance criteria:** see Ticket 1 below.
- **Risk level:** Medium (additive DDL only).
- **Out of scope:** consumer, routes, frontend, Confluent/Flink runtime, secrets.

## Key context: 10033 already shipped the provenance core

`repo-b/db/schema/10033_telemetry_kafka_stream_provenance.sql` (committed in `2ae69ce9`) already created
`tel_stream_kafka_rows` (Kafka provenance: topic/partition/offset/schema-id, replay-safe UNIQUE on the
Kafka coordinate) and `tel_stream_consumer_offsets`. Ticket 1 therefore does **not** recreate them — it
**extends** them additively in `10034`. Rewriting the committed `10033` would violate the repo's
additive / never-edit-shipped-migration convention.

## Ticket order

1. **Postgres provenance/serving schema — Databricks lake pointers + triage projection (additive `10034`).** ← in progress
2. Durable Kafka serving-slice consumer (`backend/app/services/telemetry_stream_consumer.py`), default off
   (`TELEMETRY_KAFKA_CONSUMER_ENABLED=false`); deterministic raw sampling (`kafka_offset % N`).
3. Confluent Streaming Agent triage output → `stargate.printer.anomaly.triage.v1`; save reproducibility
   artifacts under `infra/confluent/stargate/agents/`.
4. FastAPI lineage/provenance routes (`/api/telemetry/stream/kafka/...`, `/api/telemetry/stream/lineage/anomaly/{id}`).
5. Frontend Stargate lineage drawer: Kafka detection → AI triage → Databricks lake → Postgres serving row,
   with explicit unavailable states.
6. Confluent contract/catalog metadata hygiene.
7. Runbook + verification script.
8. Live replay / end-to-end rehearsal (with Flink pool start→stop→park-at-0-CFU cleanup).

## Ticket 1 — implementation

New additive migration `repo-b/db/schema/10034_telemetry_stream_databricks_pointers.sql`:

- `ALTER TABLE tel_stream_kafka_rows` (all `ADD COLUMN IF NOT EXISTS`):
  - `kafka_key`; source descriptors `source_system` (default `'confluent_kafka'`), `source_kind`,
    `producer_version`; correlation ids `run_id`, `anomaly_id`, `triage_id`.
  - Databricks lake pointers: `databricks_catalog/schema/table/path`, `delta_version`,
    `delta_commit_timestamp`, `databricks_job_id/run_id/notebook_path`, `databricks_lineage_status`
    (default `'not_available'`), `databricks_null_reason`.
  - Extend `record_kind` CHECK (drop + re-add in one block) to
    `telemetry_sample|telemetry|agg5s|anomaly|triage|dlq|execution|signal` — legacy values retained so
    no existing row is rejected.
  - Partial indexes on `anomaly_id`, `triage_id`, `(databricks_catalog, schema, table)`.
  - Column comments disambiguating `run_id` (print/test run) vs `databricks_run_id` (Databricks job-run),
    and documenting the fail-closed lineage status.
- `ALTER TABLE tel_stream_consumer_offsets`: add `next_committed_offset`, `lag`, `status` (default
  `'unknown'`), `null_reason`. PK unchanged.
- New `tel_stream_triage_events` projection (PK `triage_id`, FK `kafka_row_id → tel_stream_kafka_rows`,
  `requires_human_review` default `true`, `status` default `not_available`, same fail-closed Databricks
  pointer block) + RLS tenant policy + indexes + table comment.
- Trailing `DO $$` verification: triage table + RLS, 11 Databricks pointer columns present, CHECK admits
  `'triage'`, and defaults (`databricks_lineage_status = not_available`, `requires_human_review = true`).

### Acceptance criteria

- Additive migration `10034` exists; `tel_stream_kafka_rows` carries the Databricks pointer block;
  `tel_stream_triage_events` exists with RLS; `tel_stream_consumer_offsets` gains lag/status receipts.
- Kafka idempotency UNIQUE (from 10033) still rejects a replayed `(env, business, topic, partition,
  offset)`.
- `databricks_lineage_status` defaults to `not_available`; no fake offsets or Delta pointers inserted.
- No destructive change; existing telemetry frontend/API/Stargate SSE untouched; no Confluent/Flink
  runtime change; no secrets.

## Discovery note — Databricks Stargate mapping

`novendor_1.telemetry.*` Delta tables are the **separate NASA C-MAPSS/SMAP/IMS ML lane**, not the
Stargate printer stream. No concrete Delta table is mapped to the Stargate stream yet, so the lake
pointers fail closed (`databricks_lineage_status = 'not_available'`,
`databricks_null_reason = 'databricks_table_mapping_not_configured'`). A follow-up ticket should connect
known Delta tables once a Stargate→Delta mapping exists.

## Session update — 2026-06-24 (Ticket 1)

**Done:** migration `repo-b/db/schema/10034_telemetry_stream_databricks_pointers.sql` written; active
plan + `docs/tips.md` lessons added (tips.md merge conflict was already resolved upstream this session).

**Tests run:**
- `node repo-b/db/schema/apply.js --files 10034 --dry-run` → PASS (39 statements; `DO $$` blocks split
  whole).
- Live apply against Lakebase (`TELEMETRY_DATABASE_URL`, Railway `authentic-sparkle`) → **FAILED at
  statement 1**: `ERROR 42501 must be owner of table tel_stream_kafka_rows`.

**Blocker (apply):** the Lakebase `tel_*` tables are owned by the human Databricks role
`paulmalmquist@gmail.com`. The only reachable credential is the runtime `telemetry_app` role
(`rolsuper=false`, `rolcreaterole=false`, member of only itself, **not** a member of the owner role —
no `SET ROLE` path). DDL therefore cannot run as `telemetry_app`. **`10034` must be applied as the
owner**, either via the Databricks SQL editor authenticated as `paulmalmquist@gmail.com` (paste the
file; confirm the trailing `DO $$` NOTICE), or with an owner connection string passed to
`node repo-b/db/schema/apply.js --files 10034` (then revoke). I did **not** fabricate a successful
apply and did **not** create fallback/duplicate tables.

**Pre-apply state captured (read-only, as `telemetry_app`):** on Lakebase, `tel_stream_kafka_rows` has
no `databricks_*` columns, `tel_stream_triage_events` does not exist, and the `record_kind` CHECK is the
legacy `('telemetry','anomaly','agg5s')` — exactly what `10034` extends. Confirmed `tel_stream_*` tables
are absent on Supabase (`to_regclass` → null), so Supabase is the wrong target.

**Ticket 1 status:** **blocked** — schema complete and dry-run validated; live apply + post-apply
verification pending owner-role access. Do **not** start Ticket 2 until `10034` is applied and verified.

**Risks/unknowns:** owner credential is the interactive Databricks human login (not in Railway/Vercel/
Supabase). No Stargate→Delta mapping yet (pointers stay `not_available`).
