# Stargate streaming lane

Simulated Stargate printer telemetry: Protobuf over Kafka, windowed anomaly
detection, and an SSE bridge feeding the Stargate Live dashboard
(`repo-b/.../telemetry/stargate`).

The bridge **core ships in the backend** (`backend/app/services/stargate_bridge.py`
+ `backend/app/routes/stargate_bridge.py`) so it deploys with Railway behind
`STARGATE_BRIDGE_ENABLED` (default off, capture mode in prod). This directory is
the **laptop entrypoint + producer tooling**: `bridge.py` is a thin wrapper
(`uvicorn bridge:app`), `signal_mapping.py` is a re-export shim of the backend
definition, and the producer/fixture tools run against any mode. The capture
fixture lives at `backend/app/data/stargate/replay_capture.jsonl` (so it ships
in the image); `capture_fixture.py` writes there.

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
| `signal_mapping.py` | Re-export shim of `backend/app/services/stargate_signal_mapping.py` (channel maps + anomaly predicate + 5s tumbling aggregator). One definition the producer, bridge, tests, and Flink SQL all agree on. |
| `producer.py` | N printers at `--rate` msgs/sec each, Protobuf through Schema Registry. Waveforms come from `rs_factory_seed.waveforms` (read-only import). |
| `bridge.py` | Thin laptop wrapper — `uvicorn bridge:app` calls the backend's `create_app()`. Core (ring buffers, SSE, modes) lives in `backend/app/services/stargate_bridge.py` + `backend/app/routes/stargate_bridge.py`. |
| `capture_fixture.py` | Regenerates `backend/app/data/stargate/replay_capture.jsonl` deterministically (includes the planted DLQ lines). |
| `proto_gen/` | Generated bindings for `infra/confluent/proto/stargate_telemetry.proto`. |

Tests live in `backend/tests/test_stargate_*.py`; capture-mode tests run with
no broker and no Kafka client installed.
