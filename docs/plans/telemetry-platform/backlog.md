# Telemetry Platform — Backlog

Open items, populated as tickets are cut. Each item should be specific enough that a fresh session
can act on it without asking questions.

## Done

- **RUL Calibration evidence-surface redesign (2026-06-29).** Redesigned `/lab/env/[envId]/telemetry/calibration`
  from "chart + metrics" into an inspectable ML evidence surface: CSS hero + evidence-contract strip,
  tooltip'd clickable metric cards, a 5-step evidence artifact trail, a recharts trajectory chart with
  hover tooltip + click-to-inspect + late-risk zone, clickable coverage rows + reliability bins, and one
  `RulEvidenceDrawer` covering 6 drill-through kinds with provenance + specific null reasons (no fake
  ids). Typed evidence in `lib/telemetry/rulCalibrationEvidence.ts`. Frontend-only; 12 component tests +
  333/333 telemetry tests green. Dispatch record:
  `docs/plans/03-implementation-plans/active/rul-calibration-evidence-surface.md`.

## Open

- **Telemetry Calibration Layer — active plan (post-Gate-0 pivot).** The Telemetry Trust Layer thesis
  (embedding-distance trust) was KILLED by Gate 0 — distance anti-correlated with RUL error on FD001
  (`docs/plans/03-implementation-plans/evidence/telemetry-trust-negative-result-writeup.md`, commit
  `383536bd`). The successor build is calibrated RUL uncertainty (conformal intervals, PICP/MPIW/CRPS,
  reliability diagram, one thin demo screen): `docs/plans/03-implementation-plans/active/telemetry-calibration-layer.md`.
  First ticket: "Reproduce and calibrate C-MAPSS FD001 RUL baseline" (Databricks/notebook-only, no UI/
  API/schema). **Do not revive SupCon / contrastive retrieval / novelty-distance trust** without a new
  approved falsification plan. (Independent of the in-flight RS Factory PR 3 work in `next-session.md`.)

- **IMS vibration feature engineering (deferred from Phase 1).** The 1.075 GB IMS bearing archive
  (`phm-datasets.s3.amazonaws.com/NASA/4.+Bearings.zip`) is downloaded and verified real; Bronze
  holds its provenance (`novendor_1.telemetry.bronze_ims`). Extracting the triple-nested
  zip→IMS.7z→{1st,2nd,3rd}_test.rar and engineering time/frequency-domain vibration features (RMS,
  kurtosis, FFT bands) is not done — it does not gate the replay demo. Needs `unrar`/`rarfile` (not
  currently installed). Pick up when a predictive-maintenance dashboard view is wanted. The 2nd_test
  run is the canonical run-to-failure used in most IMS papers.

- **v2 verify gate fails: `app.environment_contract` missing (platform-wide, not telemetry).**
  Provisioning the telemetry env (`dc82d39d-9be2-49b0-a01d-c7181b13a8b6`) returned lifecycle `failed`
  and `GET /v2/environments/{id}/verify` 500s with `relation "app.environment_contract" does not
  exist`. This affects every v2 environment in this database, not telemetry specifically. The env row,
  both-registry sync, routing, and serving all work regardless. Fix = migrate the
  `app.environment_contract` table (owned by the v2 provisioning subsystem) so the contract verifier
  and the `create_rows`/`health_check` stages pass. Out of telemetry scope.

## Watch / decide later

- Reviewer access model for the public demo (public read-only vs invite-code vs authenticated tenant)
  — decided in Phase 4.
- Confirm the `claude_token.txt` token is a Databricks `dapi…` PAT, not an Anthropic key — checked at
  the Phase 1 gate.
- Whether the serving API needs the `mlflow` client in `backend/requirements.txt` or can read
  promoted-model metadata from `tel_model_runs` — decided in Phase 3. (Phase 2 note: the anomaly
  champion is a cheap rule — per-channel scale + k threshold on `abs(value - value_rmean50)` — so the
  serving layer can re-implement it without any MLflow/pyspark dependency. The RUL champion is an
  sklearn GBM; serving RUL would need either the sklearn artifact loaded or the model re-fit offline.)
- **PCA anomaly model underperformed the baseline (F1 0.42 vs 0.64).** Not a blocker — the baseline
  was promoted honestly. If a stronger anomaly model is wanted later, an LSTM/temporal autoencoder on
  the rolling-feature sequence is the natural next attempt (deferred; not required for the demo).

## AI Build & Operations Reference (shipped 2026-06-27) — follow-ups

- Capture an authenticated desktop+mobile screenshot of `/lab/env/[envId]/telemetry/ai-build-ops` into
  `docs/plans/telemetry-platform/screenshots/` (this session verified by build + render tests; the route
  is auth-gated so no headless screenshot was taken).
- Keep `repo-b/src/components/telemetry/buildops/manifest.ts` in step with the code — it is a
  hand-maintained inventory; if an endpoint/MCP tool/CI job/page changes, update the matching row.
- Optional: add a focused Playwright route/render check if reference-nav e2e coverage is introduced.

## Relativity MES — real Dataproc PySpark medallion (2026-06-27, DONE)

Flipped `novendor-events-prod.relativity_mes` from a cosmetic medallion (silver = no-op views, gold =
Python literals; see the audit) to a real one built by Dataproc Serverless PySpark. Shipped:
`telemetry-platform/dataproc/relativity_mes/` — `load_ugly_bronze.py` (realistic dirty all-STRING
bronze), `jobs/rel_silver.py` (cast/normalize/dedup/quarantine + `_reject` sinks + `dq_*` cols),
`jobs/rel_gold.py` (5 marts joined/aggregated from silver), `sync_serving_from_bq.py` (Lakebase serving
← BQ gold, `serving_provenance='dataproc-gold'`), `audit_medallion.py` (fail-closed healthy gate),
`apply_descriptions.py`. Frontend learned `dataproc-gold` (LineageSourceConsole + relativityMes.ts +
test). ADR 0005 supersedes 0004. Audit verdict now **healthy** (9/9 checks); invariants hold.

Follow-ups (deferred):
- Wrap the 6 steps in one orchestrator script (currently run sequentially by hand).
- Column-level descriptions (table-level done; audit's column-desc check is still 0).
- ML on silver/gold marts (Vertex, like `mlops_learning_lab`) — natural next step per ADR 0005.
- Add table partitioning/clustering if the dataset ever grows beyond a few hundred rows (currently
  unjustified at this scale; audit noted 0 partition/cluster).
