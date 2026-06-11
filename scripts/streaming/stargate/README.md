# Stargate streaming lane

Simulated Stargate printer telemetry: Protobuf over Kafka, windowed anomaly
detection, and an SSE bridge feeding the Stargate Live dashboard
(`repo-b/.../telemetry/stargate`). Standalone by design — nothing here touches
the shared backend app, its requirements, or the database.

## Setup

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

## Run it

```powershell
# Zero dependencies — replay the checked-in capture fixture:
.\demo_dryrun.ps1

# Local broker (Redpanda + Schema Registry via docker compose):
.\demo_dryrun.ps1 -Mode local

# Confluent Cloud (PR 4: CONFLUENT_* env set, topics provisioned):
.\demo_dryrun.ps1 -Mode cloud
```

Dashboard: `npm run dev` in repo-b, then `/lab/env/<envId>/telemetry/stargate`.
Bridge endpoints: `/stargate/stream` (SSE), `/snapshot`, `/dlq`, `/health` on :8100.

## Pieces

| File | What it is |
|---|---|
| `signal_mapping.py` | Channel maps + anomaly predicate + 5s tumbling aggregator. The single definition the producer, bridge, tests, and (in cloud mode) the Flink SQL all agree on. |
| `producer.py` | N printers at `--rate` msgs/sec each, Protobuf through Schema Registry. Waveforms come from `rs_factory_seed.waveforms` (read-only import). |
| `bridge.py` | FastAPI SSE bridge with `cloud` / `local` / `capture` modes and four ring buffers. The health payload names which engine produced the aggregates. |
| `capture_fixture.py` | Regenerates `fixtures/replay_capture.jsonl` deterministically (includes the planted DLQ lines). |
| `proto_gen/` | Generated bindings for `infra/confluent/proto/stargate_telemetry.proto`. |

Tests live in `backend/tests/test_stargate_*.py`; capture-mode tests run with
no broker and no Kafka client installed.
