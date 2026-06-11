# RS demo runbook — Stargate streaming + Factory ML

The frozen command set for the live demo, the failure modes that can bite on
stage, and the 12-minute narrative. Companion to
`docs/plans/RS_STARGATE_FACTORY_ML_SESSION_PLAN.md` (evidence) and
`infra/confluent/stargate/README.md` (cloud provisioning detail).

Demo surfaces: `/lab/env/<envId>/telemetry/stargate` and
`/lab/env/<envId>/telemetry/factory-ml` (repo-b, `npm run dev` or the deployed
site). Bridge on :8100. All commands below run from the repo root unless noted.

## Pre-demo checklist (T-30 minutes)

```powershell
# 1. Tests still green (no broker, no cloud needed)
cd backend; python -m pytest tests/test_stargate_codec.py tests/test_stargate_bridge.py tests/test_stargate_producer_shapes.py -q; cd ..

# 2. Confluent session alive (login lasts ~8h; re-run if expired)
confluent environment list          # errors -> confluent login --save

# 3. Resume the two Flink statements (stopped after every session for cost)
confluent flink statement resume agg5s --cloud gcp --region us-east1 --environment env-vwkk2z
confluent flink statement resume anomaly-route --cloud gcp --region us-east1 --environment env-vwkk2z
confluent flink statement list --cloud gcp --region us-east1 --environment env-vwkk2z   # both RUNNING

# 4. Bridge + producer, cloud mode (creds in scripts/streaming/stargate/.env)
cd scripts\streaming\stargate
Get-Content .env | ForEach-Object { $n, $v = $_ -split '=', 2; Set-Item env:$n $v }
Start-Process .\.venv\Scripts\python.exe -ArgumentList "-m","uvicorn","bridge:app","--port","8100"
.\.venv\Scripts\python.exe producer.py --mode cloud --rate 250   # leave running

# 5. Dashboard up, both pages render, health badge says "Managed Flink"
```

If anything in 2–4 fails on stage, fall back one mode (table below) and keep
talking — the narrative survives every fallback.

## The frozen commands, by beat

| Beat | Command | Expected on screen |
|---|---|---|
| Schema contract | `confluent schema-registry schema list --subject-prefix stargate` | v1 + v2 on the subject |
| Evolution (live) | `confluent schema-registry schema create --subject stargate.printer.telemetry.v1-value --type protobuf --schema infra\confluent\proto\stargate_telemetry_v2.proto` | "already registered" / version 2 — BACKWARD gate holds |
| Throughput | producer already running at `--rate 250` | Stargate page: ~1,000 msgs/s, melt-pool sphere climbing layers |
| Managed Flink | `confluent flink statement list ...` | agg5s + anomaly-route RUNNING; amber 5s-avg line is Flink output |
| Anomaly routing | wait for a `*-PRE_FAILURE` job (every 6th job, ~72s into a cycle) | red bands on the chart, ticker fills, melt-pool sphere goes dark red |
| Break it on purpose | `python bad_producer.py --mode cloud` (run LAST — see failure table) | DLQ panel counts up with deserialize reasons |
| Factory ML pivot | open `/telemetry/factory-ml` | readiness gauges, VEH-TR-003 blocked |
| Honest ML | Model Quality tab | run-failure AUC 0.977 beside near-chance QMS targets — tell the signal-vs-no-signal story |
| SCN-005 | Layer Heatmap tab, amber rows | 00088 rhymes with failed 00041 |
| Time travel | `cd skills\rs-factory-ml\scripts; python time_travel_demo.py` (needs `DATABRICKS_PAT`; pull via `vercel env pull`) | corrupt → VERSION AS OF → RESTORE → checksum identical |

## What can fail live, and the fallback

| Failure | Symptom | Fallback | Cost of fallback |
|---|---|---|---|
| Confluent session expired | CLI errors, producer can't connect | `confluent login --save` (30s), or drop to local mode | none / lose "managed" labels |
| Cloud unreachable / Flink pool gone | health badge not "Managed Flink" | `.\demo_dryrun.ps1 -Mode local` — Redpanda + labeled Flink emulation | badge says "local emulation" — say so out loud, it's a feature |
| Docker/Redpanda also down | local mode dead | `.\demo_dryrun.ps1` (capture mode) — zero dependencies | recorded session, badge says "capture"; anomalies + DLQ still render |
| bad_producer kills the Flink statements | statements FAILED mid-demo | expected! This IS the poison-record beat — narrate it, then resubmit with `--property "sql.tables.scan.startup.mode=latest-offset"` | 60s of live recovery, which lands well |
| Databricks warehouse cold | time-travel script waits ~2 min on start | run `time_travel_demo.py` once at T-30 so the warehouse is warm | none if pre-warmed |
| Exports look stale | factory-ml page footer shows old run id | they're committed JSON — stale is impossible unless the repo is stale | n/a |
| Browser dies | nothing renders | the time-travel transcript + CLI consume are terminal-only beats; finish there | lose the visuals, keep the proof |

Ordering rule learned the hard way: **run `bad_producer.py` after the Flink
beats, not before** — poison records fail-stop managed Flink statements (the
bridge survives; that contrast is the point, but you want Flink alive for the
windows beat first).

## 12-minute narrative

1. **(1 min) The contract, not the chart.** Open the proto file and the SR
   subject list. "Telemetry is a governed, versioned contract — not JSON
   hoping for the best." Register v2 live; the BACKWARD gate passes.
2. **(2 min) The stream.** Stargate page: ~1,000 Protobuf msgs/s, the 3D
   toolhead laying layers, melt-pool color tracking temperature. Point at the
   health badge: "the 5-second average line is managed Flink's output topic,
   not client math."
3. **(2 min) Anomaly routing.** A pre-failure job crosses both thresholds —
   cold melt pool AND vibration spike together. Bands appear; the rows are in
   their own topic (show the CLI consume). "Detection is a stream job with a
   governed predicate; the dashboard just renders it. The same predicate is
   test-locked between the Flink SQL and the Python fallback."
4. **(1 min) Break it on purpose.** bad_producer. DLQ counts up with real
   deserialize reasons. "Bad data is routed and visible, never dropped, never
   fatal — and watch what it does to a naive stream job" (the poison-record
   recovery, if time allows).
5. **(1 min) The floor.** Flip to capture mode. Same dashboard, honest
   "recorded capture" badge. "The demo does not depend on the network, and it
   never pretends a fallback is the real thing."
6. **(3 min) The batch side.** Factory ML page. Bronze counts reconciled to a
   deterministic manifest, provenance footer with the build sha and MLflow run
   id. Then the headline: "Three models. The run-failure model scores 0.977
   because limit violations and waveform drift genuinely predict failed runs.
   The two QMS models score at chance — because in this dataset, inspection
   outcomes are independent of telemetry by construction, and the pipeline
   says so instead of laundering it. That is the platform's job: tell you
   where the digital thread supports prediction and where it does not."
7. **(1 min) SCN-005.** Heatmap, amber pair: the inconclusive hot-fire rhymes
   with the failed one — similarity with receipts, traceable to feature
   windows.
8. **(1 min) Time travel.** Corrupt the gold table, query the prior version,
   restore, checksums match. "Rollback is a statement, not a war room."

Close: "Everything you watched is a stacked, reviewed PR chain with evidence
logs, work items, and honest fallbacks. That is the operating model, demoed."

## Post-demo (T+5)

```powershell
confluent flink statement stop agg5s --cloud gcp --region us-east1 --environment env-vwkk2z
confluent flink statement stop anomaly-route --cloud gcp --region us-east1 --environment env-vwkk2z
# stop the producer/bridge windows; Databricks warehouse auto-stops at 15 min idle
```
