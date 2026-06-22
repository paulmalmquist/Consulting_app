# Telemetry — Local Seed Backlog

Items that **cannot be safely seeded from an agent coding session** because they need local files,
local model artifacts, GPU/model provisioning, credentials/secrets, Supabase admin access, or
Railway/Vercel secrets. Everything else in the telemetry audit is either wired to real backend data
now or fails closed now (see `data-source-matrix.md`).

Each surface currently **fails closed** (explicit `null_reason` / EmptyState) until its item is seeded
from a local session — none of them fake data.

---

## Seed Backlog Item: Factory / NCR intelligence (`/api/telemetry/ncr`)

### Missing dependency
`tel_ncr_records`, `tel_ncr_clusters`, `tel_ncr_backlog_weekly` rows for `telemetry-demo`. Requires the
Databricks NCR clustering + backlog-forecast mirror (c-TF-IDF + UMAP/HDBSCAN + walk-forward forecast).

### Why this session skipped it
Real clustering output must come from the Databricks pipeline; it cannot be deterministically
hand-seeded without fabricating cluster geometry.

### Exact local steps
1. Run the Databricks NCR pipeline (telemetry-platform Databricks notebooks) to produce the mirror.
2. Apply `telemetry-platform/databricks/seed_ncr_serving.sql` against Supabase `ozboonlsplroialdwuxj`
   (`node repo-b/db/schema/apply.js` path or `supabase db query --linked`).

### Files / tables affected
`repo-b/db/schema/10016_factory_ncr_intelligence.sql`; `tel_ncr_records|clusters|backlog_weekly`.

### Expected verification
`GET /api/telemetry/ncr?env_id=telemetry-demo&business_id=7e1eb000-0000-4000-a000-000000000001`
returns non-empty clusters/backlog (not `null_reason: data_not_ingested`).

---

## Seed Backlog Item: Fused state vectors (`/api/telemetry/fused-vector-info`)

### Missing dependency
`tel_fused_state_vectors`, `tel_feature_manifest` (Phase 7A) for `telemetry-demo`.

### Why this session skipped it
256-d fused vectors come from a Databricks export; not safely hand-seeded.

### Exact local steps
Run the Phase 7A export, then seed the two tables via `apply.js`/Supabase.

### Files / tables affected
`repo-b/db/schema/10009_telemetry_fused_vectors.sql`; the two tables above.

### Expected verification
`/fused-vector-info` returns `available: true` with a real `vector_count`.

---

## Seed Backlog Item: Live stream worker (`/api/telemetry/stream/*`)

### Missing dependency
A running ingest worker + `TELEMETRY_STREAM_ENABLED=1` (and stream admin key for source switching);
populates `tel_stream_readings*`, `tel_pipeline_status`, `tel_dq_assertions`.

### Why this session skipped it
Requires a deployed worker process and Railway env vars/secrets — not creatable from an agent session.

### Exact local steps
Set `TELEMETRY_STREAM_ENABLED=1` (+ `TELEMETRY_STREAM_ADMIN_KEY`) on the backend service and deploy the
worker; optionally drive the `iss_capture.json` adapter.

### Files / tables affected
`backend/app/routes/telemetry.py` stream routes; `repo-b/db/schema/10015_telemetry_streaming_slice.sql`.

### Expected verification
`/stream/health` reports `fresh` per channel; `/stream/live` returns channels instead of `STALE`.

---

## Seed Backlog Item: Stargate SSE bridge (`/telemetry/stargate`)

### Missing dependency
`NEXT_PUBLIC_STARGATE_BRIDGE_URL` + a running bridge process (local printer/telemetry source).

### Why this session skipped it
Needs a local hardware/bridge endpoint and a Vercel env var.

### Exact local steps
Start the bridge locally, set `NEXT_PUBLIC_STARGATE_BRIDGE_URL`, redeploy repo-b.

### Files / tables affected
`repo-b/src/components/telemetry/StargateConsole.tsx`; `repo-b/src/lib/lab/stargateStream.ts`.

### Expected verification
Stargate shows "stream live" instead of "not configured".

---

## Seed Backlog Item: RUL Calibration live endpoint (`/telemetry/calibration`)

### Missing dependency
A `/api/telemetry/calibration` route + a Databricks calibration export. The page currently renders the
committed `calibrationEvidence.ts` evidence artifact (clearly labeled "not live data").

### Why this session skipped it
Requires the Databricks calibration job output; building a fabricated endpoint would violate the
no-fake-data rule.

### Exact local steps
Export calibration trajectory from Databricks; add a serving table + `/api/telemetry/calibration`
route; wire `RulCalibration.tsx` to it with fail-closed states.

### Files / tables affected
`repo-b/src/components/telemetry/RulCalibration.tsx`; `repo-b/src/lib/telemetry/calibrationEvidence.ts`.

### Expected verification
Calibration page reads from the endpoint; label flips from "evidence artifact" to live + provenance.

---

## Seed Backlog Item: Post-change degradation watcher source (Spike Inspector)

### Missing dependency
A durable post-change watcher table (runs-after-change degradation), mirrored from the ADE-Ops
post-change watcher. The Spike Inspector's analyzer currently covers anomaly-rate, drift, and model
health; it has no post-change-degradation source.

### Why this session skipped it
No seeded table exists; the watcher needs real run-over-run history after a tracked change.

### Exact local steps
Stand up the watcher table + an analyzer finding family that reads it; seed from real post-change runs.

### Files / tables affected
`backend/app/services/telemetry_analyzer.py` (new finding family); a new `tel_*` watcher table.

### Expected verification
A post-change degradation finding appears in `/api/telemetry/findings` when degradation is present.

---

## Seed Backlog Item: Gemma tier lifecycle (Control Tower)

### Missing dependency
Vertex AI credentials + GPU + `CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED=true`.

### Why this session skipped it
GPU provisioning and Vertex secrets are never created from an agent session.

### Exact local steps
Configure Vertex creds + the lifecycle flag on the backend; warm/teardown via the Control Tower.

### Files / tables affected
`backend/app/routes/telemetry_control_tower.py`; `tel_ct_gemma_state|job`.

### Expected verification
`/control-tower/gemma-tier` reports a live/warming state from Vertex instead of cold/unavailable.
