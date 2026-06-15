# Confluent Cloud — Phase 3B broker

The cloud broker for the Winston event backbone. Local dev uses Redpanda
(`infra/local/docker-compose.streaming.yml`); cloud uses Confluent Cloud. The
app speaks the Kafka wire protocol through `app/events/transport.py` — the only
difference between the two is connection config, set via env vars. No code
branches on the broker vendor.

## Why Confluent (vs GCP Managed Kafka)

Fastest credible managed-Kafka receipt. Same `confluent-kafka` client either
way; the transport abstraction makes the broker a one-line env change. GCP
Managed Kafka is deferred to Phase 4 when GKE / Workload Identity is the story.

## Env contract

Set these locally (never commit the key/secret):

```bash
export EVENTS_ENABLED=true
export EVENTS_BROKER_URL=pkc-xxxxx.<region>.<provider>.confluent.cloud:9092
export EVENTS_SECURITY_PROTOCOL=SASL_SSL
export EVENTS_SASL_MECHANISM=PLAIN
export EVENTS_SASL_USERNAME=<confluent api key>
export EVENTS_SASL_PASSWORD=<confluent api secret>
```

| Var | Local Redpanda | Confluent Cloud |
|---|---|---|
| `EVENTS_ENABLED` | `true` | `true` |
| `EVENTS_BROKER_URL` | `localhost:9092` | `pkc-….confluent.cloud:9092` |
| `EVENTS_SECURITY_PROTOCOL` | unset (`PLAINTEXT`) | `SASL_SSL` |
| `EVENTS_SASL_MECHANISM` | — | `PLAIN` |
| `EVENTS_SASL_USERNAME` | — | API key |
| `EVENTS_SASL_PASSWORD` | — | API secret |

When `EVENTS_SECURITY_PROTOCOL` is `PLAINTEXT` (the default), no SASL keys are
added to the producer config — the local Redpanda path is unchanged.
`config.producer_security_config()` is the single place that derives these
librdkafka settings.

## Console setup (one-time)

1. Create a **Basic** cluster at [confluent.cloud](https://confluent.cloud).
2. **Cluster → Cluster Settings → Endpoints** → copy the **bootstrap server**.
3. **Clients / API Keys → Add key**, scoped to the cluster → copy **key** + **secret** (secret shown once).
4. **Topics → Add topic** → create `winston.executions.v1` (and
   `winston.dead-letter.v1`). A Basic cluster does not auto-create topics, so
   make them before the smoke runs.

## Smoke (real broker round-trip)

```bash
# broker round-trip only (no BigQuery):
python scripts/streaming/broker_smoke.py --no-bq

# full receipt (broker -> sink -> BigQuery):
export BQ_ENABLED=true
export BQ_PROJECT_ID=<gcp project>   # ADC: gcloud auth application-default login
python scripts/streaming/broker_smoke.py
```

The smoke publishes one `execution.completed` event through
`publish_event(...)`, consumes it back off the broker, runs the consumed bytes
through the existing `sink.process_message()`, and queries the BigQuery receipt
by `run_id`. The consumer lives only in the smoke script — the long-running
sink-worker consumer is Phase 4 (GKE).

## Guardrails

- BigQuery stays observational / append-only — never a read source.
- The sink never writes to Postgres.
- Default-off: with `EVENTS_ENABLED` unset, the transport is a no-op.
- API key/secret live in env only. Never commit them, never log the secret.
