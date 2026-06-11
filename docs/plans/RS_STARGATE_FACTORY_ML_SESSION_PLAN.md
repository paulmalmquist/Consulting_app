# RS Stargate + Factory ML — campaign plan and PR log

One coding campaign, three stacked PRs. This document is the running record:
what each PR contains, the evidence it closed with, and the handoff into the
next one. Board: Epic #497 → Features #530 (Stargate streaming) and #531
(Factory ML); stories #532 (PR 3), #533 (PR 4), #534 (PR 5).

The PR stack sits on the generator PRs:

| PR | Branch | Base | Scope |
|---|---|---|---|
| #146 | feat/rs-factory-digital-thread | main | Generator foundation (merged scope, draft) |
| #148 | feat/rs-factory-generator-pr2 | #146 | Generator scenarios + gold layer |
| PR 3 | feat/rs-stargate-slice | #148 @ 13315bee | Stargate local/capture slice + dashboard |
| PR 4 | feat/rs-stargate-cloud | PR 3 | Confluent Cloud, Schema Registry, Flink, DLQ |
| PR 5 | feat/rs-factory-ml | PR 4 | Databricks medallion, MLflow, time travel, export |

Fencing for the whole campaign: `rs_factory_seed/**` is read-only (run it,
import from it, never edit it); the ISS streaming-slice files
(`backend/app/services/telemetry_stream_*`, `repo-b/.../telemetry/stream/`),
`backend/app/routes/telemetry.py`, `backend/app/services/environment_seed_packs_v2/`,
`repo-b/db/schema/`, `backend/requirements.txt`, `backend/app/main.py`, and
`.github/workflows/ci.yml` are not touched. The Stargate lane uses no Postgres:
live state is ring-buffered in the bridge, ML serving is a static JSON export.

## PR 3 — Stargate local/capture vertical slice

The slice runs with zero cloud dependency and zero new backend dependencies.

What ships:

- `infra/confluent/proto/stargate_telemetry.proto` — the v1 topic contract.
  Generated bindings checked in at `scripts/streaming/stargate/proto_gen/`.
- `backend/app/events/protobuf_codec.py` — Schema Registry serializer/
  deserializer builders + librdkafka conf from `CONFLUENT_*` env. Lazy imports;
  sits beside the existing transport, which is unchanged.
- `scripts/streaming/stargate/` — the lane's tooling, with its own venv:
  - `signal_mapping.py` — channel maps, the anomaly predicate
    (temp < 1400°C AND vibration > 0.08g), and the 5s tumbling aggregator the
    bridge runs when no Flink exists. One definition, imported everywhere.
  - `producer.py` — N simulated printers at `--rate` msgs/sec each, Protobuf
    through Schema Registry. Signal shapes come from `rs_factory_seed.waveforms`
    (read-only import); every sixth print job is a pre-failure pattern that is
    guaranteed (by test) to cross the anomaly predicate.
  - `bridge.py` — standalone FastAPI app on :8100. Consumes telemetry into
    four ring buffers and serves `/stargate/stream` (SSE, 100ms coalesced
    frames, per-connection cursors), `/snapshot`, `/dlq`, `/health`. Modes:
    `local` (Redpanda + labeled Flink emulation), `capture` (checked-in fixture
    replay — the CI path and the demo floor), `cloud` (lands in PR 4).
  - `capture_fixture.py` + `fixtures/replay_capture.jsonl` — deterministic
    60s fixture: normal + pre-failure segments per printer, three planted bad
    lines for the DLQ path.
  - `demo_dryrun.ps1` — one-command boot for any mode.
- `repo-b` — the Stargate Live page (`telemetry/stargate`): R3F 3D toolhead
  view (deposited-path trail, melt-pool sphere colored by temperature),
  dual-axis temp/vibration chart with the 5s average overlay and anomaly
  bands, anomaly ticker, DLQ feed. Client state sits in fixed-size circular
  buffers in refs; React state is a version counter. New deps: `three`,
  `@react-three/fiber@^8` (React 18-compatible), `@types/three`.
- Tests: `backend/tests/test_stargate_codec.py`, `test_stargate_bridge.py`,
  `test_stargate_producer_shapes.py`. Bridge and shape tests run in backend CI
  as-is; wire-format round-trips skip cleanly where confluent-kafka is absent
  and run in the lane venv.

Decisions worth recording:

- SSE over websockets: the flow is one-directional, EventSource reconnects on
  its own, and plain HTTP crosses proxies without upgrade headaches.
- Standalone uvicorn app over a backend route: the demo lane must not touch
  shared backend wiring or Railway deploys. Folding it in later is a follow-up,
  not a regret.
- Negative slope on the temperature map: the seed's pre-failure waveform rises,
  but the failure mode that matters in deposition is a melt-pool temperature
  drop, so raw-up maps to cold-pool-down.

Evidence (checkpoint A): recorded below when the PR opens.

## PR 4 — Confluent Cloud + Schema Registry + Flink + DLQ (cloud-verified; see Checkpoint B2)

Status: built, tested locally, and verified live against Confluent Cloud on
2026-06-11 after one interactive `confluent login --save` (the repo-root
`confluent)_kafka_api.json` key is cluster-scoped and could not drive
management commands). Provisioning, Flink statements, the schema-evolution
beat, the anomaly route, and the DLQ beat all ran for real — evidence in
Checkpoint B2 below, lessons folded into `infra/confluent/stargate/README.md`.

Toe-stepping note: the Phase 3B event-backbone session (clone at
C:\Projects\cons_rs_demo, branch feat/cloud-broker-event-transport) has
uncommitted work modifying backend/app/events/config.py + transport.py and
creating infra/confluent/README.md with an EVENTS_* env contract and
winston.* topics. This lane was kept disjoint on purpose: stargate.* topics,
CONFLUENT_* env, all files under infra/confluent/stargate/ and
infra/confluent/proto/ — no shared filenames, no shared cluster resources.

Original handoff list (all delivered except the cloud run):

- `infra/confluent/provision.ps1`: discovery (`confluent environment list`,
  cluster + SR describe), topics (`stargate.printer.telemetry.v1` 6 partitions,
  `agg5s.v1`, `anomalies.v1`, `dlq.v1` 7d retention), service account + ACLs,
  Protobuf subject registration with BACKWARD compatibility, Flink compute
  pool. The repo-root `confluent)_kafka_api.json` holds only a key/secret pair
  of unverified scope — the script must discover or mint cluster + SR keys.
- `proto/stargate_telemetry_v2.proto` (optional `laser_power_w`) — register
  live as the schema-evolution beat.
- Flink statements as files: `flink/01_agg_5s.sql` (5s tumbling window,
  AVG temp / MAX vibration per printer) and `02_anomaly_route.sql` (the
  predicate, verbatim). Declare JSON value format on the sink tables so the
  bridge's cloud mode can read them without an Avro path.
- Extend `test_stargate_codec.py` to parse `02_anomaly_route.sql` and assert
  its constants equal `signal_mapping`'s — the two definitions must not drift.
- `bad_producer.py` for the live DLQ beat; bridge cloud mode consumes the
  Flink-fed agg/anomaly topics (decode path already in place).
- Env rows for `docs/reference/ENV_KEYS.md`: `CONFLUENT_BOOTSTRAP_SERVERS`,
  `CONFLUENT_API_KEY/SECRET`, `CONFLUENT_SR_URL`, `CONFLUENT_SR_API_KEY/SECRET`,
  `STARGATE_MODE`, `NEXT_PUBLIC_STARGATE_BRIDGE_URL`.
- Pause the Flink pool after verification; cost notes in the runbook.

## PR 5 — Factory ML on Databricks (queued)

Handoff into PR 5:

- Build the seed fixture from the pinned #148 head (`13315bee`):
  `python -m rs_factory_seed build --profile medium`; record
  `output/manifest.json` sha into every bronze table.
- `skills/rs-factory-ml/` mirroring ncf-grant-friction's notebook layout;
  Databricks client wrapped from `skills/historyrhymes/scripts/databricks_client.py`;
  schema `novendor_1.rs_factory` (new — never historyrhymes/ncf_ml).
- Loader: parquet → UC Volume (DBFS fallback) → `bronze_<table>` CTAS with
  `_loaded_at` + manifest sha; fail-closed row-count assertions.
- Silver: rolling window features over `fact_process_feature_window`
  (window_index is the layer axis); explicit salted join against the
  deliberately skewed `raw_iot_telemetry_samples`; both join timings logged.
- Gold: outcome chain run → article → serial → QMS inspections;
  `min_strength_margin` (derived stand-in, stated as such) + `passed`;
  `gold_print_quality_train`, `gold_readiness_summary`, `gold_layer_heatmap`.
- Training: XGBoost + baselines, GroupKFold by part_id, MLflow experiment
  RSFactoryML, SHAP top-15, leakage-exclusion manifest.
- `05_time_travel_demo.py` transcript beat; `06_export_dashboard_json.py`
  writes `repo-b/public/labs/factory-ml/*.json` shaped to the rs_jsx contracts.
- Factory ML page wiring `ReadinessGauge`, `LayerHeatmap` (SCN-005 pair
  highlight), `FeatureImportancePanel`, `RegistryPanel`, `NcrPanel`.
- SCN anchors that must reproduce: SCN-004 FPY 0.78 → 0.91; SCN-005 golden
  pair TEST-HOTFIRE-2026-00041 / 00088; VEH-TR-003 blocked by 4 open NCRs.

## Evidence log

### Checkpoint A — PR 3 (2026-06-11)

- Tests, lane venv (confluent-kafka 2.14.2 installed): `pytest backend/tests/test_stargate_*.py --noconftest` → **23 passed**, including the Schema Registry framing round-trip against the client lib's MockSchemaRegistryClient.
- Tests, backend environment (CI parity, no schemaregistry extras): **22 passed, 1 skipped** — the SR round-trip skips cleanly where the extras are absent.
- Local E2E (Redpanda compose): producer pushed **9,940 Protobuf messages at ~397/s** through Schema Registry; bridge consumed 9,480 (group joined at `latest`), telemetry ring full at 2,000, **64 tumbling windows** with nominal values (avg_temp ≈ 1501°C, max_vib ≈ 0.035g); SSE emitted a snapshot frame then 100ms deltas (curl capture).
- Capture determinism: two cold starts in capture mode produced **identical state** — sha `0477A8A8ACF69F3E` both runs; 600-tail telemetry, 48 windows, **148 anomalous samples** from the pre-failure segments, **3 DLQ entries** from the planted bad lines.
- Frontend: `npm run lint` exit 0; `npm run build` exit 0 with the stargate route compiled. Fix recorded: `src/types/r3f.d.ts` bridges fiber v8's element map into @types/react v19's JSX namespace.

### Checkpoint B — PR 4 (2026-06-11)

- Tests: **27 passed** in the lane venv — adds the Flink-SQL constants lock
  (parses 02_anomaly_route.sql, asserts equality with `signal_mapping`), the
  schema-evolution proof (v1 reader skips hand-built v2 field 11 and preserves
  it on re-serialize), and the json-registry frame decoder.
- DLQ beat, live against local Redpanda: `bad_producer.py` sent 5 corrupted
  payloads (raw JSON, bad magic byte, truncated frame, log-line text, empty);
  bridge `/stargate/dlq` count went **0 → 5**, each entry carrying its real
  deserialization reason (`Invalid magic byte`, `Unexpected EOF while reading
  index`, …). Nothing crashed; ingestion continued.
- Cloud verification: completed 2026-06-11 — see Checkpoint B2.

### Checkpoint B2 — PR 4 cloud verification (2026-06-11)

- Authenticated via `confluent login --save` (env `env-vwkk2z`, cluster
  `lkc-gqpvvyv` gcp/us-east1, SR `lsrc-pgnzz12`).
- `provision.ps1` completed end to end: topics (`telemetry` 6 partitions,
  `dlq` 7d retention — agg5s/anomalies are Flink-owned, see runbook), v1
  Protobuf schema registered with BACKWARD compatibility, service account
  `sa-5w51vmn` with prefix-scoped Kafka ACLs + SR DeveloperRead RBAC, cluster
  and SR keys written to the gitignored lane `.env`, Flink pool `lfcp-22wznzq`.
- **Schema evolution live**: v2 (`laser_power_w`) registered as version 2 on
  the same subject — the BACKWARD gate passed (IDs 100002 → 100003).
- **Flink**: 4 statements submitted (2 CREATE TABLE COMPLETED, 2 INSERT
  RUNNING). Producer pushed **89,200 Protobuf messages at ~993/s** with
  auto-register off (SR lookup only — registration stays a provisioning act);
  managed Flink produced 5s windows (n=1250 = 250/s x 5s, avg_temp ≈ 1499°C)
  and routed **anomaly rows from the pre-failure jobs**
  (e.g. JOB-00-0005-PRE_FAILURE, 1353°C / 0.110g), captured both in the
  bridge (200-row ring full) and via CLI consume.
- **DLQ beat, cloud**: `bad_producer.py --mode cloud` took `/stargate/dlq`
  **0 → 10** — each corrupted payload appears as its decode failure AND
  consumed back off the DLQ topic (full route proven).
- **Poison-record finding**: the corrupted payloads fail-stopped both Flink
  INSERT statements at the bad offsets (no skip-on-error knob in this Flink
  version) while the bridge degraded gracefully — the contrast is now a demo
  beat. Recovery proven: resubmit with
  `sql.tables.scan.startup.mode=latest-offset`; statements returned to
  RUNNING and produced 23 more windows from a fresh burst (68 → 91).
- Fixes folded back into the lane: provision script (SR id field, .env key
  handling, idempotent re-runs, RBAC grant, Flink-owned topics, PS 5.1
  stderr handling), `CONFLUENT_SR_AUTO_REGISTER` toggle in the codec,
  `CAST(layer AS INT)` in the anomaly route (proto uint32 infers BIGINT).
- Cleanup: both INSERT statements stopped, bridge stopped, pool idle
  (no running statements = no CFU burn).
