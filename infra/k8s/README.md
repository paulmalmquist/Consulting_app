# Winston event sink worker on GKE (Plan 0004 Phase 4)

Deploys the observational BigQuery sink worker (`app.events.sink_worker`) to GKE
Autopilot. The worker consumes `winston.executions.v1` from Confluent Cloud and
writes raw rows to `winston_events_raw.events`. BigQuery auth is via **Workload
Identity** — no service-account key file in the pod.

```
infra/k8s/
  base/                 Deployment + ServiceAccount + kustomization
  overlays/gke-dev/     namespace + WI annotation + image pin + secret template
```

## Guardrails

Observational only: consume → validate → write raw row → dead-letter on failure.
No Postgres writes, no execution-status mutation, no side effects, no AI.
BigQuery is append-only and never an app read source. GKE hosts only this new
stateless worker; the FastAPI API and all financial reads stay on Railway.

## One-time GCP setup

```bash
PROJECT=paultest-d3cb1
REGION=us-east1
GSA=winston-bq-sink@$PROJECT.iam.gserviceaccount.com

# APIs
gcloud services enable container.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com --project $PROJECT

# Artifact Registry
gcloud artifacts repositories create winston-events \
  --repository-format=docker --location=$REGION --project $PROJECT

# GCP service account for the worker + BigQuery roles
gcloud iam service-accounts create winston-bq-sink --project $PROJECT
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$GSA" --role=roles/bigquery.dataEditor --condition=None
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$GSA" --role=roles/bigquery.jobUser --condition=None

# GKE Autopilot cluster (Workload Identity is on by default on Autopilot)
gcloud container clusters create-auto winston-events-dev \
  --location=$REGION --project $PROJECT
```

## Workload Identity binding

After the cluster exists, bind the Kubernetes SA (`winston-bq-sink` in the
`winston-events` namespace) to the GCP SA:

```bash
gcloud iam service-accounts add-iam-policy-binding $GSA \
  --role=roles/iam.workloadIdentityUser \
  --member="serviceAccount:$PROJECT.svc.id.goog[winston-events/winston-bq-sink]"
```

The KSA carries the `iam.gke.io/gcp-service-account` annotation (set in the
gke-dev overlay), which completes the link.

## Build + push the image

```bash
IMG=us-east1-docker.pkg.dev/$PROJECT/winston-events/winston-bq-sink:0.1.0
docker build -f backend/Dockerfile.sink-worker -t $IMG .   # context = repo root
gcloud auth print-access-token | docker login -u oauth2accesstoken \
  --password-stdin https://$REGION-docker.pkg.dev
docker push $IMG
```

(If Docker's `credHelpers` points `*-docker.pkg.dev` at `gcloud` but
`docker-credential-gcloud` is not on PATH, remove that entry from
`~/.docker/config.json` and use the access-token login above.)

## Deploy

```bash
gcloud container clusters get-credentials winston-events-dev \
  --location=$REGION --project $PROJECT

# Render namespace + manifests
kubectl apply -k infra/k8s/overlays/gke-dev

# Create the broker/credential Secret imperatively (NOT committed):
kubectl create secret generic winston-bq-sink-secrets -n winston-events \
  --from-literal=EVENTS_BROKER_URL='pkc-xxxxx.us-east1.gcp.confluent.cloud:9092' \
  --from-literal=EVENTS_SASL_USERNAME='<confluent api key>' \
  --from-literal=EVENTS_SASL_PASSWORD='<confluent api secret>' \
  --from-literal=BQ_PROJECT_ID="$PROJECT"

kubectl rollout status deploy/winston-bq-sink -n winston-events
kubectl logs -f deploy/winston-bq-sink -n winston-events
```

## Acceptance receipt

Publish one event (locally, `scripts/streaming/publish_smoke.py` with the
broker env set), then confirm the GKE pod drained it:

```bash
kubectl logs deploy/winston-bq-sink -n winston-events | grep "handled"
# -> sink_worker: handled winston.executions.v1/... status=ok
```

and the row is in BigQuery:

```sql
SELECT event_id, event_type, run_id, source, dead_letter
FROM `paultest-d3cb1.winston_events_raw.events`
WHERE run_id = '<published run_id>';
```

## Teardown

```bash
gcloud container clusters delete winston-events-dev --location=$REGION --project $PROJECT
```
