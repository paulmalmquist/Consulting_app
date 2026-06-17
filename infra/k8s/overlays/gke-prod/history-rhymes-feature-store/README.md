# History Rhymes Feature Store — GKE deployment (B7, infra only)

Kubernetes manifests for the feature-store lane, mirroring the `history-rhymes-polymarket`
lane. **This PR authors infra only** — no live deploy, no GKE recreate, no Confluent/BigQuery
apply, no production migration. `kubectl kustomize` validates the structure statically.

## What this lane will run (deferred to a runtime PR)

- **`hr-feature-store-ingest`** — selects enabled connectors (FRED/Census/VIX/FOMC/DefiLlama
  via the `FS_*_ENABLED` flags) and writes the SILVER layer (`hr_fs_readings`) to Postgres.
- **`hr-feature-store-materializer`** — runs the B1 gold materialization path (deterministic;
  reads the Phase A frame, not live external sources) into `hr_history_rhymes_model_observations`.

Both **`replicas: 0`** today. The worker entrypoints (`app.services.hr_feature_store.worker`,
`...materializer_worker`) — and harmonizing the FRED connector's `run_ingest` with B3–B6 — are a
separate runtime PR. Until then nothing runs and nothing can crash-loop.

## Default-off safety

- All `FS_*_ENABLED` flags are `false` in `configmap.yaml` → no live fetch even at replicas ≥ 1.
- `replicas: 0` → no pods.
- `BQ_ENABLED: "false"` → no BigQuery writes; no dataset/table is created by this PR.
- No `DATABASE_URL` → no silver/gold writes (the workers fail soft / no-op).

## Secrets (reuse existing, already provisioned)

- `winston-database-url` → `/var/run/winston-secrets/database-url` (silver/gold writes).
- `winston-fred-api-key` → `/var/run/winston-secrets/fred-api-key` (FRED + VIX-via-FRED only).
- **No secrets** for Census / FOMC text / DefiLlama — they are public/keyless.

## Activation (later, by ops — not in this PR)

1. Land the runtime worker entrypoints.
2. `kubectl apply -k infra/k8s/overlays/gke-prod/history-rhymes-feature-store` (after replacing
   `PROJECT_ID` + the immutable image tag).
3. Flip the relevant `FS_*_ENABLED` (and `FS_MATERIALIZER_ENABLED`) to `true` and bump replicas.

## BigQuery sink routing

The feature-store topics (`winston.hr.feature_store.{readings,pipeline_status,materialized}.v1`,
constants in `backend/app/events/topics.py`) are listed in `EVENT_SINK_TOPICS`. The shared
`winston-observational-sink` can be pointed at them when connector publishing is wired (later PR);
this PR adds **config + constants only**, no sink code and no new dataset/table.

## Validate

```bash
kubectl kustomize infra/k8s/base/history-rhymes-feature-store
kubectl kustomize infra/k8s/overlays/gke-prod/history-rhymes-feature-store
```
