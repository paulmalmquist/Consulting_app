# Local streaming backbone

Dev-only Redpanda (Kafka-wire) broker for exercising Winston's event backbone
locally. Redpanda speaks the same Kafka protocol the cloud broker will, so
backend code is identical between here and production.

## Start

```bash
docker compose -f infra/local/docker-compose.streaming.yml up -d
```

- Kafka API: `localhost:9092`
- Console: http://localhost:8080

## Publish a real event from the backend

By default the event backbone is **inert** (no-op transport). Enable it with:

```bash
export EVENTS_ENABLED=true
export EVENTS_BROKER_URL=localhost:9092
# the Kafka client is an optional dependency, install it to actually publish:
pip install confluent-kafka
```

Then run the smoke script:

```bash
python scripts/streaming/publish_smoke.py
```

With the broker up it prints `transport=kafka` and a message appears on
`winston.executions.v1` in the console. With nothing exported it prints
`transport=noop` and publishes nothing — the same fail-closed path CI runs.

## Stop

```bash
docker compose -f infra/local/docker-compose.streaming.yml down        # keep data
docker compose -f infra/local/docker-compose.streaming.yml down -v     # wipe data
```

## What this is not

Not a production dependency. Production uses a managed Kafka broker (Phase 3)
and a GKE sink worker (Phase 4) that drains topics into BigQuery. See
`docs/plans/03-implementation-plans/active/0004-event-streaming-bigquery-gke.md`.
