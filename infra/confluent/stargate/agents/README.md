# Stargate anomaly-triage agent — reproducibility artifacts

The Confluent **Streaming Agent** that turns deterministic anomaly events into structured AI triage.
Deployed agent: `Paul_Streaming_Agent`, model `stargate-anomaly-triage-gpt4o`. These files exist so the
agent can be re-created from the repo; nothing here is auto-submitted (the agent runs in Confluent).

```
stargate.printer.anomalies.v1            (input — deterministic detection event, from Flink 02)
  → Paul_Streaming_Agent / stargate-anomaly-triage-gpt4o
    → stargate.printer.anomaly.triage.v1 (output — this agent's triage)
      → backend/app/services/telemetry_stream_consumer.py  (durable consumer, Ticket 2)
        → tel_stream_triage_events                          (Postgres projection, Ticket 1 / 10034)
```

**Role boundary (load-bearing):** the upstream Flink rule
(`../flink/02_anomaly_route.sql`, `melt_pool_temp_c < 1400 AND arm_vibration_g > 0.08`) **detects**;
the agent only **explains and triages**. The agent is never the detector. Stargate is deterministic
synthetic printer replay carried through real infrastructure — not live physical telemetry.

## Files

| File | What it is |
|---|---|
| `anomaly_triage_agent.sql` | Re-creatable model + sink-table + agent INSERT (anomalies → model → triage). Submit each statement separately, same as the `flink/*.sql` lane. |
| `anomaly_triage_system_prompt.md` | The model's system prompt — **single source of truth for the output contract**. Paste verbatim into the model's `openai.system_prompt`. |
| `anomaly_triage_output.schema.json` | json-registry value schema for `stargate.printer.anomaly.triage.v1`. Field names == the consumer + `tel_stream_triage_events`. |
| `../topics/stargate.printer.anomaly.triage.v1.json` | Topic inventory entry (documentation). The topic is **Flink-owned**: the agent's `CREATE TABLE … WITH json-registry` binds topic + schema together, so do **not** pre-create it (same rule as agg5s/anomalies — see `../README.md`). |

## Contract lock (do not drift)

The triage JSON field names are a contract shared by three places — change them together or not at all:

1. `anomaly_triage_system_prompt.md` (what the model emits)
2. `anomaly_triage_output.schema.json` (the registered value schema)
3. `backend/app/services/telemetry_stream_consumer.py::persist_row` (what the consumer reads into
   `tel_stream_triage_events`): `triage_id, anomaly_id, printer_id, print_job_id, run_id, severity,
   status, incident_summary, likely_cause, leading_indicators, recommended_action, confidence,
   requires_human_review, null_reason`.

Fail-closed semantics are part of the contract: `status` defaults to `not_available`,
`requires_human_review` defaults to `true`, `severity` is null when not triaged.

## Re-create the agent (Confluent CLI; secrets stay out of the repo)

Prerequisite: `confluent login --save` (interactive, one-time — see `../README.md`).

```powershell
# 1. Connection holds the OpenAI endpoint + key. Created out-of-band so no secret lands in the repo.
confluent flink connection create stargate-openai-connection `
  --cloud gcp --region us-east1 --environment <env-id> `
  --type openai --endpoint https://api.openai.com/v1/chat/completions `
  --api-key "$env:OPENAI_API_KEY"

# 2. Model — paste the system prompt from anomaly_triage_system_prompt.md verbatim.
confluent flink statement create triage-model `
  --sql "<CREATE MODEL block from anomaly_triage_agent.sql, with openai.system_prompt filled in>" `
  --compute-pool <pool-id> --database <lkc-id> --environment <env-id> --cloud gcp --region us-east1 --wait

# 3. Sink table + agent statement (each separately; Flink owns the triage topic).
confluent flink statement create triage-table `
  --sql "<CREATE TABLE stargate.printer.anomaly.triage.v1 block>" `
  --compute-pool <pool-id> --database <lkc-id> --environment <env-id> --cloud gcp --region us-east1 --wait
confluent flink statement create triage-agent `
  --sql "<INSERT INTO stargate.printer.anomaly.triage.v1 … block>" `
  --compute-pool <pool-id> --database <lkc-id> --environment <env-id> --cloud gcp --region us-east1 `
  --property "sql.tables.scan.startup.mode=latest-offset" --wait
```

## Verify

```powershell
confluent flink statement list --cloud gcp --region us-east1 --environment <env-id>
# triage rows emitted while the anomaly route runs:
confluent kafka topic consume stargate.printer.anomaly.triage.v1 --from-beginning
```

End to end (with the Ticket-2 consumer on, `TELEMETRY_KAFKA_CONSUMER_ENABLED=1` + `CONFLUENT_*`):
triage rows land in `tel_stream_kafka_rows` (record_kind=`triage`) and upsert `tel_stream_triage_events`
keyed on `triage_id`.

## Cost hygiene

The model + agent statement run on the same Flink compute pool as `flink/01`/`02`. Park or delete the
pool when the demo is done (see `../README.md` and `skills/confluent-stargate-lifecycle/`). The agent
also bills per OpenAI call — do not leave the agent statement running against a live high-rate feed.
