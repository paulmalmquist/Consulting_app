# GKE Autopilot deployment

This overlay deploys three single-replica processes:

- `hr-polymarket-ingest`: Gamma discovery, public market WebSocket, CLOB
  reconciliation, and raw `EventEnvelope` publishing.
- `hr-polymarket-materializer`: Postgres minute features plus a forecast
  sidecar. The sidecar remains fail-closed until a family calibration artifact
  replaces the checked-in empty registry.
- `winston-observational-sink`: Confluent to
  `winston_events_raw.events`. It never supplies application reads.

## One-time setup

```powershell
.\provision-gcp.ps1 `
  -ProjectId paultest-d3cb1 `
  -ClusterName YOUR_AUTOPILOT_CLUSTER `
  -Location us-east1
```

Then provision Confluent:

```powershell
..\..\..\..\confluent\history-rhymes-polymarket\provision.ps1 `
  -GcpProjectId paultest-d3cb1
```

Populate Secret Manager values for:

- `winston-database-url`
- `winston-fred-api-key`
- `winston-databricks-host`
- `winston-databricks-pat`

Polymarket has no API key. Do not create wallet or trading credentials.

## Render and deploy

Replace `PROJECT_ID` and `REPLACE_WITH_IMMUTABLE_TAG` in this overlay with the
target project and immutable backend image tag. Verify before applying:

```powershell
kubectl kustomize . > rendered.yaml
Select-String -Path rendered.yaml -Pattern "PROJECT_ID|REPLACE_WITH"
kubectl apply --server-side -f rendered.yaml
kubectl -n winston-streaming rollout status deploy/hr-polymarket-ingest
kubectl -n winston-streaming rollout status deploy/hr-polymarket-materializer
kubectl -n winston-streaming rollout status deploy/winston-observational-sink
```

The Secret Manager add-on mounts files directly. Credentials are not copied
into Kubernetes Secrets and no service-account JSON is used.

## Rollout gates

1. Keep Railway `HR_POLYMARKET_ENABLED=false`.
2. Validate capture and Confluent offsets.
3. Run a 24-hour stream soak.
4. Replace the empty calibration registry only for families that pass the
   50-observation Brier/ECE gates.
5. Run the routine page in shadow for seven days.
6. Enable the Railway API/UI flag after the evidence receipt is recorded.
