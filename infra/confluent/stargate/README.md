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

```powershell
confluent flink statement create agg5s --compute-pool <pool-id> --sql-file .\flink\01_agg_5s.sql
confluent flink statement create anomaly-route --compute-pool <pool-id> --sql-file .\flink\02_anomaly_route.sql
confluent flink statement list
```

`01` produces 5-second tumbling aggregates; `02` routes rows matching
`melt_pool_temp_c < 1400 AND arm_vibration_g > 0.08` to the anomalies topic.
The predicate is locked to `signal_mapping.py` by
`backend/tests/test_stargate_codec.py::TestFlinkSqlLock`.

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
