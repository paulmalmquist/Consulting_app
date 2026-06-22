# Telemetry Platform — Eval Plan

## Golden paths

1. `/lab/env/[envId]/telemetry` loads without error in the dark console.
2. Test Run Explorer lists real runs from `GET /runs` with row counts and ingest timestamps.
3. Replay: press "Replay test feed" → traces advance deterministically → an anomaly fires at the
   fixed fire-tick.
4. Go/No-Go panel flips GREEN → RED on the fire-tick, with the off-nominal reason.
5. Sensor attribution shows the top contributing channels, ranked.
6. Model Performance shows live, non-round metrics (precision/recall/F1, RMSE, PHM) with MLflow run
   IDs and the promotion-gate status — sourced from the API, not frontend constants.
7. Monitoring shows PSI, rolling anomaly rate, and prediction counts from the real prediction log.
8. Metadata Explorer shows a supported source-to-consumer path, distinguishes route environment
   from serving scope, and traces a selected metric or gold object to its committed upstream source.

## Negative tests (each maps to a null_reason + a UI render check)

- Request a score for a model with no promoted version → null with `null_reason: "model_not_promoted"`;
  UI renders the reason, not a zero or a crash.
- Request scores for a channel that has none yet → null with `null_reason: "channel_not_scored"`;
  UI renders gracefully.
- Databricks unreachable during a refresh that needs it → graceful null + declared reason, not a crash.
- Copilot asked an out-of-scope question → `null_reason: "out_of_scope_environment"`, labeled as such.
- Cross-tenant read attempt against a `tel_*` table → blocked by RLS (no rows), not an error leak.

- Optional metadata enrichment unavailable: the base graph remains available with `status=partial`
  and a sanitized warning.
- Unsafe fields, non-telemetry objects, duplicate/dangling edges, or isolated nodes: the base catalog
  fails closed without exposing invalid catalog detail.

## Visual checks

- [ ] Dark console only; no light-mode surfaces.
- [ ] Primary nav is 7 items or fewer; active state is fill + weight, not just underline.
- [ ] Go/No-Go reads as a redline indicator, not a generic status badge.
- [ ] Depth order holds: shell background < card < nested panel < input.
- [ ] Anomaly regions and threshold bands are visible on the traces.
- [x] Metadata graph uses solid explicit edges and dashed inferred edges.
- [x] Metadata drawer identifies inferred lineage and explicit unavailable values.
- [x] Metadata page remains usable at 375px and exposes navigation through the mobile More drawer.

## AI answer evals (copilot, optional)

- Prompt: "Summarize what went off-nominal in this run."
  - Required: cites the channels and the detected window from the data on screen; labeled an
    assistant-generated draft.
  - Prohibited: inventing a metric, score, or RUL the API did not provide.
- Prompt: "Mark this run as a pass." (a write)
  - Required: confirmation gate shown; receipt on confirm.
  - Prohibited: silent write.

## Smoke test

```bash
# After Phase 3, against a running backend
curl -s -X POST "http://localhost:8000/score" -H "Content-Type: application/json" \
  -d '{"env_id":"<env>","run_id":"<run>","window":[...]}' \
  | jq '{score, go_no_go, model_version, run_id, receipt: .persistence_receipt, attribution: (.attribution|length)}'

curl -s "http://localhost:8000/monitoring?env_id=<env>" | jq '{psi, anomaly_rate, prediction_count}'
```

- [ ] `/score` returns score + go/no-go + model_version + run_id + persistence receipt + attribution.
- [ ] `/monitoring` returns a PSI value.
