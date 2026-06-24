---
id: confluent-stargate-lifecycle
kind: skill
status: active
source_of_truth: true
topic: streaming-infra
owners:
  - orchestration
  - cross-repo
intent_tags:
  - confluent
  - kafka
  - cost-control
  - streaming-spine
  - infra-lifecycle
triggers:
  - stop the kafka cluster
  - stop confluent serving
  - pause confluent
  - kill the stargate connector
  - stop the flink statements
  - delete the kafka cluster
  - confluent cost control
  - recreate the kafka cluster
  - tear down stargate streaming
  - export the kafka topics and schemas
  - broker cold / broker warm / broker hot
entrypoint: true
handoff_to:
  - feature-dev
when_to_use: "Use to stop Confluent Cloud serving costs on the Stargate streaming spine without losing the data shape, to export topics/schemas/connectors/Flink as reproducible IaC, to delete the cluster when cost matters more than the data, to recreate it from the export, and to reflect the current broker cost state on the Telemetry Mission Control PIPELINE panel."
when_not_to_use: "Do not use for the in-process ISS Lightstreamer live stream (that path has no Kafka — see skills/telemetry-data-interrogation and MissionControlStream). Do not use for one-off topic reads. Do not delete the cluster without a fresh export on disk."
surface_paths:
  - infra/confluent/stargate/
  - skills/confluent-stargate-lifecycle/
  - backend/app/services/telemetry_stream_etl.py
name: confluent-stargate-lifecycle
description: "Tiered, CLI-driven lifecycle control for the Confluent Cloud Stargate streaming spine. Stops serving costs cheaply and losslessly (delete connectors + stop running Flink statements — pools cannot be set to 0 CFU), exports topics/schemas/connectors/Flink to infra/confluent/stargate/ as reproducible IaC, deletes the cluster (and Flink pools) only behind an export gate + explicit confirm, recreates it from the export, and binds the verified broker cost state to the Telemetry Mission Control PIPELINE panel."
---

# Confluent Stargate Lifecycle

The honest framing first, because it decides everything else.

**Confluent Cloud is not sleepable.** There is no "pause the cluster like a VM."
You have exactly two cost states that matter:

1. **Serving stopped, cluster alive** — you stop the connectors and Flink
   compute. The Kafka cluster keeps billing its hourly base, but the expensive
   active pieces (connector task-hours, Flink CFU-hours) go to zero. **Topics,
   their data within retention, and the Schema Registry subjects all survive.**
   This is the cheap, lossless move.

2. **Cluster deleted** — the only way to stop the cluster's own hourly bill.
   **This destroys the topics and the data in them.** Schema Registry is
   environment-scoped, so subjects *may* survive a cluster delete, but never
   rely on it. Recreate everything from the export.

So the answer to "are we just stopping the serving — the topics and schema
don't go away?" is: **yes, as long as you stop at tier 1.** You only lose
topics if you go to tier 2 and delete the cluster.

This skill encodes that as four tiers, always exporting before anything
destructive, and reflects the resulting cost state on your live graph.

## Live environment (verified)

```
Confluent org login : paulmalmquist@gmail.com (confluent.cloud)
Environment         : env-vwkk2z  (default, Stream Governance ADVANCED)
Kafka cluster       : lkc-gqpvvyv (cluster_0, STANDARD, gcp/us-east1)
Flink pools         : lfcp-22wznzq (stargate-demo-pool, max_cfu 5)
                      lfcp-v7pqqvj (GCP.us-east1.env-vwkk2z.cd0d, max_cfu 10)
Connectors          : lcc-xqoppz1 (sample_data, source) — the active cost
Topics              : history-rhymes.signals.v1, sample_data_stock_trades,
                      stargate.printer.{telemetry,telemetry.agg5s,anomalies,dlq}.v1,
                      winston.{executions,dead-letter}.v1
Schema subjects     : sample_data_stock_trades-value,
                      stargate.printer.{telemetry,telemetry.agg5s,anomalies}.v1-value
```

> NOTE: `cluster_0` is a **STANDARD** cluster — it bills a flat hourly base, not
> CKU-hours. CKU/CKU-hour billing applies to **Dedicated** clusters only. The
> skill reads the real cluster type at runtime and reports the correct cost unit;
> do not hardcode "CKU" in any message.

## Graph bind — how cost state reaches Mission Control

The Telemetry Mission Control **PIPELINE** panel
([MissionControlStream.tsx:301-313](../../repo-b/src/components/telemetry/MissionControlStream.tsx#L301))
renders `live.pipeline.surfaces` verbatim — a `{ surface: {status, reason} }`
map sourced straight from the `tel_pipeline_status` table
([telemetry_stream_etl.py:460,549](../../backend/app/services/telemetry_stream_etl.py#L460)).

The bind needs **no backend or frontend code change.** The skill writes one row:

```
surface = 'broker'
status  = 'hot' | 'warm' | 'cold' | 'gone'
reason  = human-readable cost line, e.g. 'serving stopped · topics retained · $0.00/hr active'
```

into `tel_pipeline_status` for `env_id='telemetry-demo'`,
`business_id='7e1eb000-0000-4000-a000-000000000001'`. The panel then shows a
`broker` row alongside `stream_ingest / silver / gold`.

### Honest cost states (the only states this skill claims)

These are defined by **observable facts**, never by a command's exit code. A pool's
`max_cfu` is only a ceiling (min 5 — there is no 0); it is NOT the cost lever. Flink
CFU-hours bill on statements in a running state (`RUNNING`/`PENDING`/`DEGRADED`), so
"stopped" is defined by statements, not by pool capacity.

| status | observable definition | who sets it |
|---|---|---|
| `hot` (write `fresh`) | cluster up AND (≥1 connector running OR ≥1 running Flink statement) | `status`, `recreate` |
| `warm` (idle/parked) | cluster up, 0 connectors, 0 running Flink statements, topics retained | `stop-serving`, `status` |
| `gone` (deleted) | Kafka cluster removed AND Flink pools removed | `delete-cluster` |

There is no separate `cold` — "all compute parked" and "serving stopped" are the same
observable state (`warm`): no running statements. `stop-serving` writes `warm` **only after
re-querying and confirming** zero running statements; if any remain it writes `hot` and
fails loudly rather than claiming a false parked state.

Panel rendering: any status that isn't the literal string `fresh` paints red. The top-level
STALE banner trips only on the stream's own `pipeline.status`, not the `broker` row, so a red
`broker · warm` never freezes the charts. Healthy serving writes `fresh` (green); otherwise
write the real `warm`/`gone` token and let `reason` carry the cost story.

## Tiers

Run everything through `scripts/lifecycle.ps1`. Each tier is idempotent and
prints what it did. The script reads/writes `infra/confluent/stargate/state.json`
and mirrors that state to the graph on every run.

### Tier 0 — `status`  (read-only, always safe)

Reports the live inventory (cluster type + cost unit, connectors and their
state, Flink pools and current/max CFU, topic count, schema subject count) and
the current `state.json`. Writes the matching `broker` row to the graph.

```powershell
pwsh skills/confluent-stargate-lifecycle/scripts/lifecycle.ps1 -Action status
```

### Tier 1 — `export`  (read-only against Confluent, writes IaC to disk)

Dumps everything needed to recreate the spine into `infra/confluent/stargate/`:
topics + their configs, Schema Registry subjects (latest schema per subject),
connector configs, Flink pool definitions, and a manifest. **This is the gate
for any destructive action** — tier 3 refuses to run without a fresh export.

```powershell
pwsh skills/confluent-stargate-lifecycle/scripts/lifecycle.ps1 -Action export
```

### Tier 2 — `stop-serving`  (cheap, lossless)

Deletes the `sample_data` connector (pausing leaves task-hours billing — delete
it) and **stops any running Flink statements** (the only thing that bills CFU-hours).
It does **not** touch `max_cfu` — a pool's minimum ceiling is 5, never 0, and
`--max-cfu 0` is silently rejected by the CLI at exit 0. An idle pool with no
running statements accrues no CFU-hours, so the pool is left in place.
**Topics, data, and schemas are untouched.** After stopping, it re-queries and
writes `broker = warm` **only if** zero statements are still running; otherwise it
writes `broker = hot` and fails loudly rather than claim a false parked state.

```powershell
pwsh skills/confluent-stargate-lifecycle/scripts/lifecycle.ps1 -Action stop-serving
```

### Tier 3 — `delete-cluster`  (destructive, export-gated, double-confirm)

Refuses unless a fresh `infra/confluent/stargate/manifest.json` exists (run
`export` first) AND you pass `-ConfirmDelete lkc-gqpvvyv`. Deletes the cluster
(which destroys its topics and data) and then deletes the Flink pools so the lane
is fully torn down. Writes `broker = gone` to the graph.

```powershell
pwsh skills/confluent-stargate-lifecycle/scripts/lifecycle.ps1 -Action delete-cluster -ConfirmDelete lkc-gqpvvyv
```

### Tier 4 — `recreate`  (rebuild from export)

Recreates a cluster, topics, schema subjects, Flink pool, and connector from the
exported IaC, then writes `broker = hot` (status `fresh`) to the graph. Prints
the new cluster ID so you can repoint producers.

```powershell
pwsh skills/confluent-stargate-lifecycle/scripts/lifecycle.ps1 -Action recreate
```

## Banned patterns

```
- Deleting the cluster without a fresh export on disk (data loss with no recovery path)
- Pausing the connector instead of deleting it (task-hours keep billing)
- Setting --max-cfu to 0 to "park" a pool (rejected at exit 0; valid values are 5/10/20/30/40/50)
- Trusting a confluent CLI exit code alone (it can exit 0 while rejecting the argument in stdout)
- Claiming a 'parked'/'warm' cost state without re-querying to confirm 0 running statements
- Hardcoding "CKU" in cost messages for a STANDARD cluster (read the real type)
- Writing a 'broker' status other than 'fresh' for a healthy serving cluster (false red)
- Proceeding when `confluent` CLI is missing or unauthenticated (fail closed)
- Touching the in-process ISS live stream path (it has no Kafka — wrong subsystem)
```

## Fail-closed preconditions

Before any action the script asserts:

1. `confluent` CLI on PATH and `confluent context list` shows a current login.
2. `env-vwkk2z` is reachable and resolves the expected cluster.
3. For `delete-cluster`: a `manifest.json` exists and `-ConfirmDelete` matches the live cluster ID.
4. For graph writes: `TELEMETRY_DATABASE_URL` is resolvable (the tel_* tables are on Lakebase, not Supabase — see memory `project_telemetry_lakebase_migration`).

If any precondition fails, the script stops and prints the exact failing command
and remediation — it never half-applies a tier.
