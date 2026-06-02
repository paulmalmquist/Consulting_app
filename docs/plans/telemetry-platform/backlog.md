# Telemetry Platform — Backlog

Open items, populated as tickets are cut. Each item should be specific enough that a fresh session
can act on it without asking questions.

## Open

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
