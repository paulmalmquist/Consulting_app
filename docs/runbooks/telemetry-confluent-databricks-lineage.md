# Telemetry lineage runbook — Confluent → Databricks → Postgres

How to start, check, and safely shut down the Stargate telemetry lineage demo. The lineage proves how a
displayed anomaly/triage flows through real infrastructure:

```
Confluent Kafka (Stargate topics)
  -> Streaming Agent triage (stargate.printer.anomaly.triage.v1)
  -> durable consumer (default-off)
  -> Lakebase/Postgres serving slice (tel_stream_kafka_rows / tel_stream_triage_events)
  -> FastAPI lineage routes (/api/telemetry/stream/*)
  -> frontend lineage drawer (Stargate console)
```

**Honesty boundary.** Confluent is real transport (topic/partition/offset + schema proof). Databricks/Delta
is the raw lake (no Stargate→Delta mapping configured yet — lineage fails closed
`databricks_table_mapping_not_configured`). Lakebase/Postgres is the **serving/provenance slice**, not the
raw lake. Stargate is **deterministic synthetic printer replay through real Confluent infrastructure** —
not live physical telemetry. The deterministic Flink rule detects; the Streaming Agent **explains**.

## Architecture map

| Layer | What | Where |
|---|---|---|
| Producer / replay | deterministic printer waveforms | `scripts/streaming/stargate/producer.py` (+ `capture_fixture.py`) |
| Transport | Confluent Kafka `stargate.printer.*` topics | `infra/confluent/stargate/topics/` |
| Detect | managed Flink 5s agg + anomaly route | `infra/confluent/stargate/flink/01,02_*.sql` |
| Explain | Streaming Agent → triage topic | `infra/confluent/stargate/agents/` |
| Sink | durable serving-slice consumer (default off) | `backend/app/services/telemetry_stream_consumer.py` |
| Serve | `tel_stream_kafka_rows` / `tel_stream_triage_events` / `tel_stream_consumer_offsets` | `repo-b/db/schema/10033`, `10034` (Lakebase) |
| API | lineage/provenance routes | `backend/app/services/telemetry_stream_lineage.py`, `backend/app/routes/telemetry.py` |
| UI | lineage drawer | `repo-b/src/components/telemetry/stargate/StreamLineageDrawer.tsx` |

## Prerequisites

- `confluent login --save` (interactive, one-time — see `infra/confluent/stargate/README.md`).
- The Stargate cluster + topics + Flink statements provisioned (`infra/confluent/stargate/provision.ps1`).
- The Streaming Agent re-created from `infra/confluent/stargate/agents/` (model + connection + statements).
- Backend deployed from `main` (Railway is **not** GitHub-connected — deploy with
  `scripts/deploy_backend.sh`, verify `/api/version`). The `10034` schema is already applied to Lakebase.

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `CONFLUENT_BOOTSTRAP_SERVERS`, `CONFLUENT_API_KEY/SECRET` | broker access (producer + consumer) | local Redpanda |
| `CONFLUENT_SR_URL`, `CONFLUENT_SR_API_KEY/SECRET` | Schema Registry | localhost:8081 |
| `TELEMETRY_KAFKA_CONSUMER_ENABLED` | gate the durable consumer | `0` (off) |
| `TELEMETRY_KAFKA_CONSUMER_GROUP` | consumer group | `stargate-bridge-sink` |
| `TELEMETRY_KAFKA_RAW_SAMPLE_RATE` | persist raw telemetry iff `offset % N == 0` | `50` |
| `TELEMETRY_DATABASE_URL` | Lakebase serving slice (Railway `authentic-sparkle`) | — |

Secrets are shown once and never written to disk; keep them in `scripts/streaming/stargate/.env`
(gitignored) or the shell. **Never commit credentials.**

## Confirm the Confluent side exists

```bash
confluent kafka topic list                                  # expect stargate.printer.* incl. anomaly.triage.v1
confluent schema-registry schema list --subject-prefix stargate
confluent flink statement list --cloud gcp --region us-east1 # agg, anomaly route, triage agent
```

## Enable the backend consumer (intentional)

The consumer is default-off. Enable it deliberately for a rehearsal, then turn it back off:

```bash
# Railway backend service (authentic-sparkle)
railway variables set TELEMETRY_KAFKA_CONSUMER_ENABLED=1 --service authentic-sparkle
# redeploy so the lifespan picks it up
cd backend && bash ../scripts/deploy_backend.sh
```

## Run the producer (demo mode)

```bash
cd scripts/streaming/stargate
python producer.py --mode cloud --rate 50 --printers 4 --duration 300   # ~60k msgs over 5 min
```

A pre-failure print job crosses both anomaly thresholds (`melt_pool_temp_c < 1400 AND arm_vibration_g >
0.08`), so the Flink route emits anomalies, the agent emits triage, and the consumer persists rows.

## Check rows landed in Lakebase/Postgres

```sql
-- via supabase db query --linked, or get_telemetry_cursor / psql against TELEMETRY_DATABASE_URL
SELECT record_kind, count(*) FROM tel_stream_kafka_rows
  WHERE env_id='telemetry-demo' GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) FROM tel_stream_triage_events WHERE env_id='telemetry-demo';
SELECT topic, partition, last_processed_offset, status FROM tel_stream_consumer_offsets
  WHERE env_id='telemetry-demo';
```

## Call the FastAPI lineage routes

```bash
B=https://novendor.ai   # or the Railway backend / localhost:8000
Q="env_id=telemetry-demo&business_id=7e1eb000-0000-4000-a000-000000000001"
curl -s "$B/api/telemetry/stream/kafka/rows?$Q&limit=5"
curl -s "$B/api/telemetry/stream/kafka/triage/latest?$Q"
curl -s "$B/api/telemetry/stream/lineage/anomaly/<anomaly_id>?$Q"
```

Or run the verifier (PASS/WARN/FAIL, no secrets):

```bash
python scripts/streaming/stargate/verify_lineage.py --base https://novendor.ai
```

## Open the frontend drawer

`https://novendor.ai/lab/env/telemetry-demo/telemetry/stargate` → click a routed anomaly in the **Anomaly
ticker** → the lineage drawer shows Kafka detection → AI triage → Databricks lake (not_available) →
Postgres serving row. With the consumer off / nothing emitted, the drawer fails closed honestly.

## Shut down (cost hygiene — do this every time)

```bash
# 1. stop the producer (^C or let --duration elapse)
# 2. turn the consumer back off
railway variables set TELEMETRY_KAFKA_CONSUMER_ENABLED=0 --service authentic-sparkle && \
  cd backend && bash ../scripts/deploy_backend.sh
# 3. park the Stargate lane (lossless) + Flink at 0 CFU
pwsh skills/confluent-stargate-lifecycle/scripts/lifecycle.ps1 -Action stop-serving
# 4. confirm parked
pwsh skills/confluent-stargate-lifecycle/scripts/lifecycle.ps1 -Action status
confluent flink compute-pool list      # pool should be parked / deletable
```

**Confluent cost caveat:** the Kafka cluster bills by throughput/storage **while it exists** (the Stargate
topics are tiny); the **Flink compute pool is the line item that grows while idle** — park it at 0 CFU or
delete it. Delete any sample connector (`sample_data_*`) if it is not in use. `stop-serving` does not
destroy topics/schemas; deleting the cluster does.

## Known honest gaps

- **No Stargate→Delta mapping** yet, so the Databricks lake layer always reports `not_available` /
  `databricks_table_mapping_not_configured`. A follow-up ticket connects a real Delta table when it exists.
- The Streaming Agent bills per OpenAI call — do not leave its statement running against a high-rate feed.
- The consumer is default-off; the lineage routes/drawer fail closed (honest) until it is intentionally
  enabled and rows land.
