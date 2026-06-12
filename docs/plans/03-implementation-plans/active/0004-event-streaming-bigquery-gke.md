# Dispatch Record 0004 — Event Streaming + BigQuery + GKE (Winston Streaming Backbone)

**Created:** 2026-06-03
**Status:** Phase 1 COMPLETE · Phase 2 COMPLETE · Phase 3A COMPLETE (real BQ write proven 2026-06-10) · Phase 3B COMPLETE (Confluent Cloud round-trip proven 2026-06-12; receipt below). Phases 4–6 planned. ADO: Story #521 under Feature #520 / Epic #221.
**Environment:** Shared Platform / Infrastructure — no per-environment folder. Owning surfaces: `backend/app/events/`, `infra/`, `scripts/streaming/`.
**Deliverable type:** Platform-core infrastructure (additive event backbone) + later GCP/GKE deployment.

Full design narrative: see the approved plan at `~/.claude/plans/lets-get-up-on-nested-unicorn.md`. This record is the dispatch/ticket view.

---

## Context

Winston is synchronous: the FastAPI backend (Railway, `authentic-sparkle`) writes executions and audit rows straight to Supabase Postgres; the frontend reads them back. No event bus, no message queue (Celery/Redis present in `requirements.txt` but unused), no Google Cloud footprint, no Kubernetes. This initiative adds a durable, replayable event stream that lands facts in BigQuery as an append-only analytical event lake, with new streaming workers running on GKE.

**Hard invariant:** Postgres/Supabase stays the system of record. BigQuery is observational (analytics, replay, audit) — never a read source for execution status, REPE KPIs, HR ledger, or `tel_*` predictions. Authoritative-State Lockdown (`docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`, `CLAUDE.md`) is unaffected; events are additive emissions.

---

## Architecture decisions (locked with the user)

1. **Bus = in-repo abstraction over the Kafka wire protocol.** The app depends on our own `EventEnvelope` + a `Transport` interface, never a vendor SDK. Local dev = Redpanda; cloud = GCP Managed Service for Apache Kafka (or Confluent / Strimzi — decided at Phase 3). A `PubSubTransport` stays a drop-in if Pub/Sub is preferred later. BigQuery is the sink regardless of transport.
2. **GKE scope = new stateless workers only.** The FastAPI API and every financial read stay on Railway. No API migration in this initiative. GKE hosts the BigQuery sink worker (Phase 4) and the HR ingestion worker (Phase 5).
3. **First real event = execution events.** `execution.started` + `execution.completed`/`execution.failed` from `run_execution()` — lowest-risk clean seam, no new infrastructure. History Rhymes signal ingestion is the showcase, sequenced at Phase 5.
4. **Fail closed, always.** Publishing is best-effort: a missing/unconfigured/unreachable broker degrades to a `NoopTransport` no-op that never raises and never blocks beyond a bounded timeout. CI (no broker) exercises this path.
5. **Tips lesson home = `docs/tips.md`** (canonical), not the root `./tips.md` duplicate.

---

## Dispatch routing

- **Owning surfaces (new):** `backend/app/events/`, `infra/local/`, `infra/gcp/` (Phase 2), `infra/k8s/` (Phase 4), `scripts/streaming/`.
- **Backend hook (Phase 1):** `backend/app/services/executions.py` (`run_execution` lifecycle emits), `backend/tests/test_events.py`.
- **Config:** event config is self-contained in `backend/app/events/config.py` (mirrors the flat `os.getenv` pattern in `backend/app/config.py`); no edit to the main config module.
- **DB/schema:** **none in Phase 1.** BigQuery DDL (Phase 2) lives in `infra/gcp/bigquery/`, governed by BigQuery, not the Supabase RLS Database Guardrails. A persisted `hr_*` table in Phase 5 would trigger the full RLS / `env_id` / sequential `repo-b/db/schema/NNN_*.sql` rules (or a documented single-tenant exemption).
- **Deployment:** Railway API unchanged (Phase 1–3). GCP (Artifact Registry, Workload Identity, Secret Manager, GKE Autopilot) is Phase 4 prep.
- **CI guardrails:** `backend-lint` (ruff `check app tests` + `pytest tests`) must pass with no broker; `repo-guardrails`; `db-schema-gate` sees no new schema file; `/health` unchanged.
- **Risk level:** Phase 1 = Low. Phases 2–4 = Low–Medium (GCP setup, reversible). Phase 5 = Medium.

---

## Ticket index

| # | Phase | Ticket | DB migration | Risk | Status |
|---|---|---|---|---|---|
| 1 | 1 | `backend/app/events/` primitives (envelope, topics, config, transport, publisher) | No | Low | DONE |
| 2 | 1 | `infra/local/docker-compose.streaming.yml` + README (Redpanda) | No | Low | DONE |
| 3 | 1 | `scripts/streaming/publish_smoke.py` | No | Low | DONE |
| 4 | 1 | Wire `execution.started/completed/failed` into `executions.py` (no behavior change) | No | Low | DONE |
| 5 | 1 | `backend/tests/test_events.py` (FakeBroker, no-op, lifecycle, fail-on-broker-down) | No | Low | DONE |
| 6 | 2 | BigQuery `winston_events_raw.events` DDL in `infra/gcp/bigquery/` | No (BQ only) | Low–Med | DONE |
| 7 | 2 | Observational sink worker `backend/app/events/sink.py` + 21 tests | No | Med | DONE |
| 8a | 3A | `google-cloud-bigquery` in requirements.txt; `scripts/streaming/bq_smoke.py` real-write proof | No | Low | DONE (2026-06-10) |
| 8b | 3B | Cloud broker (Confluent Cloud) + transport security cutover via env; `confluent-kafka` in requirements.txt; `scripts/streaming/broker_smoke.py` round-trip | No | Med | DONE (2026-06-12) |
| 9 | 4 | `infra/k8s/` base + overlays; deploy sink worker to GKE Autopilot (Workload Identity) | No | Med | TODO |
| 10 | 5 | HR signal ingestion workers publish the 8 signals; `winston_raw.hr_signal_events` | Maybe | Med | TODO |
| 11 | 6 | `winston_analytics` dataset, scheduled rollups, replay tooling | No | Low | TODO |

---

## Phase 1 — per-ticket detail (delivered)

### Ticket 1 — event primitives
`backend/app/events/`: `envelope.py` (`EventEnvelope`, pydantic 2.10.4; required `idempotency_key`/`event_type`/`occurred_at`; optional `business_id`/`env_id`; `source_service` matches the BQ receipt column; `to_wire()` → JSON bytes). `topics.py` (`Topics.EXECUTIONS/HR_SIGNALS/DEAD_LETTER`, versioned `.v1`). `config.py` (flat `os.getenv`: `EVENTS_ENABLED`, `EVENTS_BROKER_URL`, `EVENTS_TRANSPORT`, `EVENTS_PUBLISH_TIMEOUT_MS`). `transport.py` (`Transport` protocol, `NoopTransport`, lazy-import `KafkaTransport` with bounded flush, `get_transport()` fail-closed resolver + cached Kafka singleton + `reset_transport()`). `publisher.py` (`publish_event()` — best-effort, never raises, returns bool).
**Acceptance:** ruff clean; importing the package has zero startup cost (executions imports it lazily inside the function).

### Ticket 2 — local broker
`infra/local/docker-compose.streaming.yml` — single-node Redpanda (external listener advertised `localhost:9092`, internal `redpanda:29092` for the console) + Redpanda Console on `:8080`. `infra/local/README.md` documents start/enable/stop. Dev-only; no production dependency.

### Ticket 3 — smoke script
`scripts/streaming/publish_smoke.py` — builds one `execution.completed` envelope, prints resolved transport (`kafka|noop`), wire bytes, and whether the publish was accepted. Runs as a no-op proof with nothing exported (the CI path) or a real publish with `EVENTS_ENABLED=true EVENTS_BROKER_URL=localhost:9092` + `confluent-kafka` installed.

### Ticket 4 — execution lifecycle wiring
`backend/app/services/executions.py`: `_emit_execution_event()` helper (best-effort, observability-only). `execution.started` after the `RETURNING execution_id` insert; the work is wrapped in `try/except` that emits `execution.failed` (with the error class) and **re-raises** so the transaction rolls back and the API surfaces the error unchanged; `execution.completed` after the cursor context commits, immediately before the (unchanged) return. `dry_run` emits nothing. `RunExecutionResponse` is byte-identical.

### Ticket 5 — tests
`backend/tests/test_events.py`: `FakeBroker` (modeled on conftest's `FakeCursor`) records offered envelopes. 8 tests — transport no-op when disabled / when no broker URL; publisher never raises on transport error; envelope roundtrip + optional tenancy; `run_execution` emits `started`→`completed` in order best-effort; still completes when the broker raises; emits `failed` and re-raises on `ValueError`.

**Phase 1 verification (run 2026-06-03):**
- `python -m ruff check app/events app/services/executions.py tests/test_events.py` → clean.
- `python -m pytest tests/test_events.py -q` → 8 passed.
- `python -m pytest tests/test_executions.py -q` → 3 passed (no regression).
- `python ../scripts/streaming/publish_smoke.py` (no broker) → `transport=noop`, `published=False`.

---

## Phase 2 — per-ticket detail (delivered)

### Ticket 6 — BigQuery DDL
`infra/gcp/bigquery/`: `datasets.sql` (CREATE SCHEMA `winston_events_raw`), `events_table.sql` (generic `events` table — all domains land here; `PARTITION BY DATE(ingested_at)`, `CLUSTER BY event_type, business_id, run_id`), `events_schema.json` (bq mk --table descriptor), `README.md` (`bq` commands, env vars, acceptance receipt query).

Column: `source` maps from `EventEnvelope.source_service` (envelope field name → BQ column `source`). `dead_letter` and `dead_letter_reason` columns in the same table so dead-letter rows are queryable alongside valid rows.

### Ticket 7 — observational sink worker
`backend/app/events/sink.py`:
- `validate_envelope(raw_bytes)` — parse → pydantic `EventEnvelope.model_validate`; raises `InvalidEnvelope` on any failure.
- `envelope_to_bq_row(envelope)` — field-for-field mapping; `source_service` → `source`; payload serialized as JSON string for BQ JSON column.
- `write_row_to_bq(row, insert_id)` — lazy-imports `google.cloud.bigquery`; `insert_rows_json` with `row_ids=[insert_id]`; raises `BigQuerySinkError` on errors list or exception; no-op when `BQ_ENABLED=False`.
- `process_message(raw_bytes)` — orchestrates validate → map → write; BQ failure routes to dead-letter (not silent success); returns `{"status": "ok"|"dead_letter", ...}`.
- `_route_dead_letter(raw_bytes, reason, ingested_at)` — publishes to `Topics.DEAD_LETTER` (best-effort Kafka) + writes BQ dead-letter row (best-effort).

`backend/tests/test_events_sink.py` — 21 tests, no credentials, all mocked:
- Row mapping (all fields, `source` field, optional tenancy, payload JSON)
- Validation (valid roundtrip, non-JSON, missing fields, wrong type)
- `process_message` happy path + BQ disabled no-op
- `process_message` invalid JSON → dead_letter
- `process_message` BQ error → dead_letter (NOT silent success)
- `write_row_to_bq` no-op / missing project / import error / BQ errors list / insertId

**Phase 2 verification (2026-06-09):**
- `ruff check app tests` → clean.
- `pytest tests/test_events_sink.py -q` → 21 passed (no credentials).
- `pytest tests/test_events.py tests/test_events_sink.py tests/test_executions.py -q` → 32 passed.
- `check_repo_guardrails.mjs` + `validate_assistant_runtime.mjs` → both passed.
- Real BQ write: skipped (BQ_ENABLED=False, no credentials configured). Exercised via mock in `test_write_row_uses_idempotency_key_as_insert_id` and `test_write_row_raises_sink_error_on_bq_errors_list`.

## Phase 3A — per-ticket detail (COMPLETE 2026-06-10)

### Ticket 8a — google-cloud-bigquery + bq_smoke.py
`backend/requirements.txt`: added `google-cloud-bigquery>=3.11` with comment.
`scripts/streaming/bq_smoke.py`: end-to-end smoke for real BQ writes. Two modes:
- Default (streaming): full `process_message()` path with `insert_rows_json` — requires billing account that covers BigQuery streaming inserts.
- `--batch` flag: `validate_envelope` + `envelope_to_bq_row` + `load_table_from_json` load job — free-tier compatible, proves auth/write/query-back without streaming billing. Production sink is unchanged.
`infra/gcp/bigquery/README.md`: ADC vs service-account credential options, bq_smoke.py usage, streaming insert propagation note, dedup query.
`infra/gcp/bigquery/setup_gcp_auth.md`: step-by-step runbook for Option A (gcloud ADC) and Option B (SA key), DDL apply commands, expected smoke output, troubleshooting table. GCP project: `paultest-d3cb1`, dataset: `winston_events_raw`.

**Phase 3A verification (2026-06-10):**
- `ruff check app tests ../scripts/streaming/bq_smoke.py` → clean.
- `python scripts/streaming/bq_smoke.py` (no credentials) → `BQ_ENABLED=false -- no write performed (no-op path)` → exit 0.
- `BQ_ENABLED=true BQ_PROJECT_ID=paultest-d3cb1 python scripts/streaming/bq_smoke.py --batch` → Phase 3A PASS. See acceptance receipt below.
- ADC: gcloud 572.0.0 installed via winget, `gcloud auth application-default login` completed.

**Phase 3A acceptance receipt — streaming insert (insert_rows_json), 2026-06-10:**
```
  event_id         = c46951c7-5b63-482b-8d66-99ddb64b3833
  event_type       = execution.completed
  idempotency_key  = execution.completed:cbcf6ecb-1bc4-4257-82f4-9735de3942ed
  run_id           = cbcf6ecb-1bc4-4257-82f4-9735de3942ed
  occurred_at      = 2026-06-10 13:52:16.186513+00:00
  published_at     = 2026-06-10 13:52:16.186562+00:00
  ingested_at      = 2026-06-10 13:52:16.186678+00:00
  source           = backend
  dead_letter      = False
  dead_letter_reason = None
```
Table: `paultest-d3cb1.winston_events_raw.events`
Write method: `insert_rows_json` (streaming insert, NOT a load job — production path)
Billing account: `01C91A-EBBE34-ED09D2` ("Novendor GCP") — general-purpose, linked to `paultest-d3cb1`

**Streaming inserts note:** BigQuery `insertAll` requires a general-purpose billing account with a payment method. "My Maps Billing Account" (Maps Platform-specific) does NOT cover streaming inserts. The `--batch` flag on `bq_smoke.py` uses a free-tier load job as a fallback; the sink code itself is unchanged.

**Credential note:** never commit service account JSON. Use `gcloud auth application-default login` for local dev; Workload Identity for GKE (Phase 4).

## Phase 3B — per-ticket detail (IN PROGRESS)

### Ticket 8b — Confluent Cloud broker transport cutover
**Broker decision:** Confluent Cloud (fastest credible managed-Kafka receipt; same `confluent-kafka` client as GCP Managed Kafka; reversible via env). GCP Managed Kafka deferred to Phase 4/GKE.

**Code (landed on `feat/cloud-broker-event-transport`, ADO Story #521):**
- `backend/app/events/config.py`: added `EVENTS_SECURITY_PROTOCOL` (default `PLAINTEXT`), `EVENTS_SASL_MECHANISM` (default `PLAIN`), `EVENTS_SASL_USERNAME`, `EVENTS_SASL_PASSWORD`, and `producer_security_config()` — returns SASL/SSL librdkafka keys only when the protocol is non-PLAINTEXT, so the local Redpanda path is unchanged.
- `backend/app/events/transport.py`: `KafkaTransport.__init__` merges `producer_security_config()` into the producer config. No new transport class; the existing `get_transport()` fail-closed resolver is untouched.
- `backend/requirements.txt`: added `confluent-kafka>=2.3` (lazy-imported; absent/unconfigured → NoopTransport, so default-off behavior is unchanged).
- `scripts/streaming/broker_smoke.py`: round-trip smoke — `publish_event` → broker → consume back → existing `sink.process_message` → BigQuery receipt by `run_id`. The consumer lives only in this script (the long-running sink-worker consumer is Phase 4). `--no-bq` flag proves the broker round-trip alone.
- `infra/confluent/README.md`: env contract, console setup, smoke usage, guardrails.
- `backend/tests/test_events_broker_config.py`: 8 tests — security-config resolution (PLAINTEXT/SASL_SSL/SSL/SASL_PLAINTEXT), transport stays no-op when disabled even with SASL set, no-op when `confluent-kafka` absent, and that `KafkaTransport` applies the security keys to the producer (PLAINTEXT has none).

**Verification (no broker):**
- `pytest tests/test_events_broker_config.py tests/test_events.py tests/test_events_sink.py -q` → 37 passed.
- `ruff check app/events/config.py app/events/transport.py tests/test_events_broker_config.py ../scripts/streaming/broker_smoke.py` → clean.

**Phase 3B acceptance receipt — real Confluent Cloud round-trip (2026-06-12):**
```
publish_event(...) -> Confluent Cloud (SASL_SSL) -> winston.executions.v1
  -> consumed back (506 bytes, run_id matched) -> sink.process_message()
  -> BigQuery winston_events_raw.events

  event_id    = 66c09521-1431-4321-985d-36ca4324d372
  event_type  = execution.completed
  run_id      = 888e72bd-d031-45a5-86f1-f584cf611c20
  source      = broker_smoke
  ingested_at = 2026-06-12 17:58:09 UTC
  dead_letter = False
```
Broker: `pkc-619z3.us-east1.gcp.confluent.cloud:9092` (Confluent Cloud Basic, cluster_0).
Topics `winston.executions.v1` + `winston.dead-letter.v1` created on the cluster.
BigQuery: `paultest-d3cb1.winston_events_raw.events` (sink unchanged from Phase 2/3A).

**Credential note:** Confluent API key/secret live in env vars only. Never committed, never logged (the smoke redacts the username and never prints the secret). Auth lesson (recorded in tips.md): a Kafka SASL key must be **cluster-scoped and tied to a user account with admin RBAC** — a Global/Cloud API key fails auth, and a service-account key on a cluster with existing ACLs is deny-by-default (TOPIC_AUTHORIZATION_FAILED) until granted topic ACLs.

## Phase 3B+ — milestones (planned)

- **Phase 4 — GKE.** `infra/k8s/{base,overlays/{local,gke-dev,gke-prod}}`; deploy the observational sink to GKE Autopilot with Workload Identity. **First GKE worker is the sink, observational only**; any worker that acts on events is a separate, later, separately-reviewed deliverable.
- **Phase 5 — HR showcase.** Ingestion workers publish the 8 History Rhymes signals as events; `winston_raw.hr_signal_events`; the decision runner still reads Postgres.
- **Phase 6 — analytics.** `winston_analytics` dataset, scheduled rollups, replay tooling.

---

## End-to-end acceptance receipt (closes Phase 2)

With the sink draining `winston.executions.v1` → `winston_raw.execution_events`, run one execution, then:

```sql
SELECT event_id, event_type, run_id, occurred_at, source
FROM `YOUR_PROJECT_ID.winston_events_raw.events`
WHERE run_id = '<test_run_id>'
ORDER BY occurred_at;
```

Passing result: the lifecycle pair for that `run_id` — `execution.started` then `execution.completed` (or `execution.started` then `execution.failed`). Invalid envelopes never reach the table; they land on `winston.dead-letter.v1` with a `failure_reason`.

---

## tips.md lesson (recorded in `docs/tips.md`)

Best-effort event emits must fail closed to a `NoopTransport` when no broker is configured, and tests must assert the no-op path — CI runs `pytest tests -q` with no broker, so any publisher that raises or blocks on a missing broker reds the build.
