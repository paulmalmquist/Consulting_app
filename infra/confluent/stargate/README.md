# Stargate lane — Confluent Cloud runbook

Cloud provisioning for the Stargate streaming demo (PR 4 of the RS demo
campaign). Distinct from the Winston event-backbone Phase 3B work in
`infra/confluent/README.md`: that lane connects `backend/app/events/` to
`winston.*` topics with the `EVENTS_*` env contract; this lane owns the
`stargate.*` topics, Schema Registry subjects, and managed Flink, with the
`CONFLUENT_*` env contract read by `backend/app/events/protobuf_codec.py`.
Same cluster, two non-overlapping resource sets.

## One-time prerequisite (interactive, cannot be scripted)

```powershell
confluent login --save
```

The repo-root `confluent)_kafka_api.json` key is cluster-scoped; management
commands (topics, SR, service accounts, Flink pools) need an authenticated CLI
session. Everything after login is scripted and idempotent.

## Provision

```powershell
cd infra\confluent\stargate
.\provision.ps1              # discovery + topics + SR + service account + Flink pool
.\provision.ps1 -SkipFlink   # skip the compute pool (no CFU cost)
```

The script prints the `CONFLUENT_*` env exports for the producer and bridge at
the end. Secrets are shown once and never written to disk; put them in
`scripts/streaming/stargate/.env` (gitignored) or the shell.

## Flink statements

Statements are single-SQL: submit each CREATE TABLE and each INSERT
separately (the checked-in `flink/*.sql` files pair them for readability).
This CLI version (v4.x) takes `--database <kafka-cluster-id>` and
`--environment <env-id>` — there is no `--catalog` flag.

```powershell
confluent flink statement create agg5s --sql "<INSERT from 01_agg_5s.sql>" `
  --compute-pool <pool-id> --database <lkc-id> --environment <env-id> `
  --cloud gcp --region us-east1 `
  --property "sql.tables.scan.startup.mode=latest-offset" --wait
confluent flink statement list --cloud gcp --region us-east1 --environment <env-id>
```

`01` produces 5-second tumbling aggregates; `02` routes rows matching
`melt_pool_temp_c < 1400 AND arm_vibration_g > 0.08` to the anomalies topic.
The predicate is locked to `signal_mapping.py` by
`backend/tests/test_stargate_codec.py::TestFlinkSqlLock`.

Two lessons from the live verification (2026-06-11):

- **Flink owns its sink topics.** Do not pre-create `agg5s`/`anomalies`
  topics; the CREATE TABLE statements bind topic + json-registry schema
  together, and a pre-existing topic leaves Flink an inferred binary table it
  cannot insert into. The provision script only creates `telemetry` and `dlq`.
- **Poison records fail-stop managed Flink.** The DLQ beat's corrupted
  payloads killed both INSERT statements at the bad offsets (deserialization
  error; this Flink version has no skip-on-error knob). The bridge degraded
  gracefully — that contrast IS the demo point. Ordering: run the DLQ beat
  after the Flink beats, then resubmit the statements with
  `startup.mode=latest-offset` to skip past the poison.

## The schema-evolution beat (live, during the demo)

```powershell
confluent schema-registry schema create --subject stargate.printer.telemetry.v1-value `
  --type protobuf --schema ..\proto\stargate_telemetry_v2.proto
```

The subject has BACKWARD compatibility; registering v2 (adds optional
`laser_power_w`) passes the check on stage while the v1 producer keeps running.

## Verification

```powershell
confluent kafka topic list
confluent schema-registry schema list --subject-prefix stargate
confluent flink statement list
# anomalies routed live while producer.py runs a pre-failure job:
confluent kafka topic consume stargate.printer.anomalies.v1 --from-beginning
# DLQ beat:
python ..\..\..\scripts\streaming\stargate\bad_producer.py --mode cloud
```

## Cost hygiene

Pause or delete the Flink pool when the demo is done:

```powershell
confluent flink compute-pool list
confluent flink compute-pool delete <pool-id>
```

A Basic cluster bills by throughput/storage and the stargate topics are tiny;
the compute pool is the only line item that grows while idle.
