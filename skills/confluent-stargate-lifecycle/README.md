# confluent-stargate-lifecycle

Tiered, CLI-driven cost control for the Confluent Cloud Stargate streaming spine,
with the broker cost state bound to the Telemetry Mission Control PIPELINE panel.

Read [`SKILL.md`](SKILL.md) for the full contract. Quick reference:

```powershell
# tier 0 — read-only inventory (cluster type, connectors, Flink CFU, topics, schemas)
pwsh scripts/lifecycle.ps1 -Action status

# tier 1 — export topics/schemas/connectors/Flink to infra/confluent/stargate/ (the delete gate)
pwsh scripts/lifecycle.ps1 -Action export

# tier 2 — stop serving costs, keep topics + schemas (delete connectors, stop running Flink statements)
pwsh scripts/lifecycle.ps1 -Action stop-serving

# tier 3 — delete the cluster (DESTROYS topics); needs a fresh export + explicit confirm
pwsh scripts/lifecycle.ps1 -Action delete-cluster -ConfirmDelete lkc-gqpvvyv

# tier 4 — recreate the lane from the export (delegates to infra/confluent/stargate/provision.ps1)
pwsh scripts/lifecycle.ps1 -Action recreate
```

## What survives what

| Action | Connectors | Flink compute | Topics + data | Schema subjects | Cluster bill |
|---|---|---|---|---|---|
| `stop-serving` | deleted | running statements stopped; pools left idle (0 CFU-hours) | **kept** | **kept** | still bills base |
| `delete-cluster` | gone | pools deleted | **destroyed** | env-scoped, export anyway | **stops** |

Flink pools cannot be "parked at 0 CFU" — the minimum ceiling is 5. CFU-hours bill on
*running statements*, so `stop-serving` stops those and leaves the idle pool (which costs
nothing) in place. It claims `warm` only after confirming 0 running statements.

The short answer to "are we just stopping serving — topics/schema stay?":
**yes, if you stop at `stop-serving`.** Topics only disappear at `delete-cluster`.

## Tests

```powershell
pwsh scripts/lifecycle.Tests.ps1   # framework-free; guards the cost-truth invariants
```

Covers the core trap: `--max-cfu 0` returns exit 0 while rejecting the argument, the JSON
preamble stripping, the running-statement classification, and a source check that the script
never reintroduces `--max-cfu 0`.

## Graph bind

The skill writes one row to `tel_pipeline_status` (`env_id='telemetry-demo'`,
`surface='broker'`) via [`scripts/graph_bind.py`](scripts/graph_bind.py). The
Mission Control PIPELINE panel renders that table directly, so a `broker` row
appears next to `stream_ingest / silver / gold` with no app code change. Healthy
serving writes status `fresh` (green); stopped/parked/deleted write
`warm`/`cold`/`gone` with the cost story in the `reason` field.

Graph writes need `TELEMETRY_DATABASE_URL` (Lakebase, set on the Railway backend
`authentic-sparkle` service, not in `backend/.env` by default). The script fails
closed with a remediation hint if it can't resolve the URL. Pass `-SkipGraph` to
run the Confluent actions without touching the panel.

## Files this skill owns / writes

- `scripts/lifecycle.ps1` — the tiered orchestrator (Confluent CLI)
- `scripts/graph_bind.py` — the single `tel_pipeline_status` broker-row writer
- `infra/confluent/stargate/{topics,schemas,connectors,flink}/` + `manifest.json` — export output
  (complements the pre-existing `provision.ps1` / runbook in that folder; does not replace them)
