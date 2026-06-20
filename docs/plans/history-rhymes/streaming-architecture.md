# History Rhymes — Streaming Architecture (S1)

**Created:** 2026-06-12 (PR 4, ADO #544)
**Dispatch record:** `docs/plans/03-implementation-plans/active/history-rhymes-telemetry-cockpit-refactor.md`
**Spine:** reuses `backend/app/events/` (envelope, publisher, KafkaTransport, NoopTransport, BigQuery sink). New code is additive: a topic helper, a consumer module (PR 11), and the `backend/app/services/hr_stream/` package (PR 5+).

The shape:

```
source (synthetic | replay fixture | Confluent/Google Kafka)
  → normalized HrSignalEvent
  → ring buffer (in-process, broker-less dev) and/or broker publish
  → consumer (PR 11) → persist: hr_signal_events bronze → hr_signal_latest silver (PR 12)
  → GET /api/hr/v1/stream/{health,signals/latest} (PR 6, PR 13)
  → cockpit signal tiles + stream health chip
```

Hierarchy, repeated on purpose: **cockpit first, synthetic/replay second, live Kafka third.**

## Topic taxonomy

Prefix `HR_KAFKA_TOPIC_PREFIX` (default `hr.dev`; stage/prod use `hr.stage` / `hr.prod`). `.v1` suffix follows the existing repo convention in `backend/app/events/topics.py`.

| Topic | Carries |
|---|---|
| `{prefix}.signal.macro.v1` | yc_10y2y, macro_surprise |
| `{prefix}.signal.market.v1` | (reserved — no current tile) |
| `{prefix}.signal.crypto.v1` | mvrv_z, crypto_flow |
| `{prefix}.signal.credit.v1` | cmbs_delinq |
| `{prefix}.signal.real_estate.v1` | housing |
| `{prefix}.signal.sentiment.v1` | fed_tone |
| `{prefix}.signal.options.v1` | vix_term |
| `{prefix}.alerts.v1` | alert events (honeypot/crowding/divergence/data_quality/regime_shift) |
| `{prefix}.snapshots.v1` | full 8-signal snapshot events |

The signal→domain crosswalk is the one shipped in `repo-b/src/lib/historyrhymes/signals.ts` (`SIGNAL_KEYS`); the backend mirror lives in `hr_stream/contracts.py` (PR 5) with a cross-reference comment. The two lists must stay identical.

**Relationship to the legacy constant:** `Topics.HR_SIGNALS = "winston.hr.signals.v1"` and its BigQuery sink routing are untouched. The `hr.{env}.*` namespace is additive; nothing consumes or republishes across the two.

**Partitioning:** partition key = `signal_key`. Per-key ordering is what the silver upsert needs; cross-key ordering is not required.

**Idempotency:** `idempotency_key = sha256(f"{signal_key}|{observed_at}|{source}")`. Bronze inserts are `ON CONFLICT (idempotency_key) DO NOTHING`; replay and consumer restarts are therefore harmless.

## Normalized signal event contract

Pydantic models land in `backend/app/services/hr_stream/contracts.py` (PR 5).

```json
{
  "event_id": "9f2c…-uuid",
  "event_type": "signal.observed",
  "source": "synthetic|replay|fred|cboe|coinglass|glassnode|manual|confluent|google_kafka",
  "topic": "hr.dev.signal.macro.v1",
  "signal_key": "yc_10y2y",
  "domain": "macro",
  "observed_at": "2026-06-12T14:30:00Z",
  "ingested_at": "2026-06-12T14:30:02Z",
  "value": 0.53,
  "unit": "percentage_points",
  "previous_value": 0.47,
  "delta": 0.06,
  "window": "daily",
  "freshness_ttl_seconds": 86400,
  "quality": {
    "status": "fresh",
    "null_reason": null,
    "source_lag_seconds": 2,
    "validation_errors": []
  },
  "tags": ["yield_curve", "macro"],
  "raw": { "provider_payload_ref": null }
}
```

Rules:
- `value` may be null **only** with `quality.status = "missing"` and a non-null `null_reason`. A null value with no reason fails validation.
- `observed_at` is the source timestamp; `ingested_at` is when our pipeline saw it. Replay preserves `observed_at` and stamps a fresh `ingested_at` — replayed data is never disguised as current.
- `delta` is producer-computed when `previous_value` is known; consumers never infer it.

## Alert event contract

```json
{
  "event_id": "uuid",
  "event_type": "alert.triggered",
  "alert_type": "honeypot|crowding|divergence|data_quality|regime_shift",
  "severity": "info|watch|warning|critical",
  "message": "VIX term structure moved into backwardation while credit spreads remain compressed.",
  "signal_keys": ["vix_term", "cmbs_delinq"],
  "observed_at": "2026-06-12T14:30:00Z",
  "recommended_action": "pause|watch|reduce_confidence|review",
  "evidence": { "snapshot_id": null, "brief_id": null, "match_request_id": null }
}
```

## Modes (`HR_STREAM_MODE`)

| Mode | Behavior | Honesty requirement |
|---|---|---|
| `off` (default) | No stream code runs. No background task is scheduled. Health = `not_configured`. | Cockpit tiles say `source: weekly brief (static)`. |
| `synthetic` | Deterministic seeded generator (PR 5) ticks in-process: ring buffer always; broker publish best-effort when one is configured. | Cockpit labels `stream · synthetic`. Synthetic is never presented as market data. |
| `replay` | Captured JSONL fixture replayed through the same handler path (PR 13). `observed_at` preserved. | Health = `replaying`; tiles label `stream · replay`. |
| `live_kafka` | Consumer (PR 11) against Confluent or the Google branch; persist + offsets (PR 12). | Mode/provider in health; loss → `disconnected` with reason, tiles revert to brief values with an explicit note. |

**No silent fallback between modes.** A failed live consumer does not become synthetic; it becomes `disconnected` with a `degraded_reason`, and the cockpit shows it.

## Stream health semantics (`GET /api/hr/v1/stream/health`, PR 6)

```json
{
  "mode": "synthetic", "provider": null, "status": "connected",
  "consumer_group": "hr-cockpit-dev", "topic_prefix": "hr.dev",
  "latest_event_at": "2026-06-12T14:30:00Z", "lag_seconds": 4,
  "degraded_reason": null
}
```

| Status | Meaning |
|---|---|
| `connected` | Events flowing; lag below threshold (3× tick interval / consumer poll cycle). |
| `delayed` | Configured and consuming, but lag at/above threshold. Reason states the lag. |
| `replaying` | Replay mode active. |
| `disconnected` | Configured but not delivering (consumer error, empty ring, invalid credentials). Reason mandatory. |
| `not_configured` | Mode `off` or required config absent. HTTP 200 — never a 500. |

Fail-closed tie-break: any ambiguity degrades downward (unknown lag → `disconnected`). The payload is allowlisted to the fields above — no bootstrap URLs with embedded credentials, no API keys, ever; PR 6's pytest asserts this.

## Provider abstraction (`HR_KAFKA_PROVIDER`, PR 11)

`build_consumer_config(provider, …) -> dict` in `backend/app/events/consumer.py`:

| | `confluent` (default) | `google` |
|---|---|---|
| security.protocol | `SASL_SSL` | `SASL_SSL` |
| sasl.mechanisms | `PLAIN` | per deployment — verified at implementation time |
| auth | `HR_KAFKA_API_KEY` / `HR_KAFKA_API_SECRET` | same env vars, provider-specific semantics |

"Google" deliberately underspecified: it means whatever GCP Kafka-compatible deployment is actually available — Google Cloud Managed Service for Apache Kafka, Confluent Cloud on GCP, or another GCP-hosted Kafka-compatible endpoint. Exact mechanism (e.g. OAUTHBEARER vs PLAIN) is confirmed against the real deployment's env/docs before PR 11 merges; the abstraction guarantees the choice stays a config branch, not an architecture fork. Confluent-first per the Phase 3B decision in `0004-event-streaming-bigquery-gke.md`.

Credentials are env-only (`HR_KAFKA_API_KEY/SECRET`); code never reads the root `confluent)_kafka_api.json`. Consumer `repr`/logs are tested for non-leakage.

## Env vars (read call-time in `hr_stream/config.py` for pytest monkeypatching)

```
HR_STREAM_MODE=off|synthetic|replay|live_kafka     (default off)
HR_KAFKA_PROVIDER=confluent|google                 (default confluent)
HR_KAFKA_BOOTSTRAP=
HR_KAFKA_API_KEY=            # env only — never from the credential JSON file
HR_KAFKA_API_SECRET=
HR_KAFKA_SASL_MECHANISM=PLAIN
HR_KAFKA_SCHEMA_REGISTRY_URL=
HR_KAFKA_CONSUMER_GROUP=hr-cockpit-dev
HR_KAFKA_TOPIC_PREFIX=hr.dev
```

Local broker for wire checks: `infra/local/docker-compose.streaming.yml` (Redpanda :9092, console :8080); smoke via `scripts/streaming/publish_smoke.py`.

## Storage mapping (medallion, PR 12 — migration 10016)

| Table | Layer | Notes |
|---|---|---|
| `hr_signal_events` | bronze | Append-only, `idempotency_key` UNIQUE, index `(signal_key, observed_at DESC)` |
| `hr_signal_latest` | silver | PK `signal_key`; upsert only when `observed_at` is newer than the stored row |
| `hr_stream_offsets` | — | PK (consumer_group, topic, partition); replayability + evidence |
| `hr_stream_health` | — | Singleton row, default `not_configured`; the health route's DB-backed source in replay/live |

hr_* single-tenant exemption applies (no env_id/RLS — ARCHITECTURE.md); header comment + `COMMENT ON TABLE` on every table; all `IF NOT EXISTS`. Confirm table-name convention against existing `hr_*`/`wss_*` schema files and re-glob `repo-b/db/schema/100*.sql` immediately before merge (10015 is doc-reserved by the telemetry streaming slice).

## Failure modes and tests

| Failure | Behavior | Test |
|---|---|---|
| No broker configured | NoopTransport/NoopConsumer; synthetic still works via ring | `test_hr_stream_synthetic.py` |
| Malformed payload | Dead-letter callback (reusing `Topics.DEAD_LETTER` semantics); never crashes the consumer loop | `test_hr_stream_consumer.py` |
| Duplicate delivery / replay overlap | Bronze `DO NOTHING`; silver newer-only upsert | `test_hr_stream_persist.py` |
| Older event after newer | Silver unchanged | `test_hr_stream_persist.py` |
| Feed silent past threshold | Health → `delayed`/`disconnected` with reason; cockpit chip changes; tiles revert to brief with note | `test_hr_stream_runner.py` + cockpit vitest |
| DB down in replay/live | Health → `disconnected` + reason (never 500) | `test_hr_stream_health.py` |
| Invalid credentials in live mode | Consumer fails closed to Noop; `disconnected` + reason | `test_hr_stream_consumer.py` |
