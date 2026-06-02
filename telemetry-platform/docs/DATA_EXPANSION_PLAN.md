# Data Expansion Plan — N-CMAPSS + IMS

> **Status: plan, not built.** Nothing in this doc has shipped. It records what exists on disk today,
> what the run-to-failure expansion needs, and how it reuses the pattern already running. The legacy
> SMAP/MSL path stays untouched while this is built. This is Track B in
> [CREDIBILITY_ROADMAP.md](CREDIBILITY_ROADMAP.md).

## Why expand

SMAP/MSL is a legacy anomaly baseline with documented benchmark problems (see
[BENCHMARK_CRITIQUE.md](BENCHMARK_CRITIQUE.md)). The headline should be run-to-failure prognostics on
engine-like hardware. C-MAPSS RUL already runs and is real. The next two datasets push the prognostics
claim further while staying public:

- **N-CMAPSS** — NASA's newer turbofan degradation set. Full flight envelopes, operating-condition
  settings, longer run-to-failure trajectories than the original C-MAPSS. The serious RUL story.
- **IMS bearing** — run-to-failure vibration data from the NASA/UCR bearing test rig. Real components
  driven to failure, useful for RUL-residual monitoring and a vibration-feature anomaly track.

Both are honest proxies for engine health. Neither is a specific firm's test stand, and neither is
rocket ground truth. That caveat stays visible.

## On-disk state today (verified)

| Dataset | Files present | Pipeline state |
|---|---|---|
| C-MAPSS FD001–FD004 | `data/cmapss/{train,test,RUL}_FD00{1..4}.txt`, `manifest_cmapss.json` | through Gold; FD001 RUL champion live |
| SMAP/MSL | `data/smap_msl/arrays/{train,test}/*.npy`, `labeled_anomalies.csv` | through Gold; legacy anomaly champion live |
| IMS bearing | `data/ims/4.+Bearings.zip` (~1.1 GB), `download_ims.py`, `manifest_ims.json` | **downloaded, not extracted** |
| N-CMAPSS | none | **not downloaded** (no download script yet) |

So C-MAPSS FD002–FD004 are downloaded but only FD001 is modeled; IMS is one unzip away from ingest; and
N-CMAPSS needs a download script written from scratch.

## The pattern this reuses

The medallion layout already in `telemetry-platform/databricks/` is the template, so the new work is
ingest + features + one model notebook per dataset, not new infrastructure:

- `data/download_*.py` + `manifest_*.json` for reproducible pulls.
- Bronze (`02_/03_/04_*`) lands raw rows as-is.
- Silver (`05_silver.py`) types and cleans, no rolling features.
- Gold (`06_gold.py`) computes rolling features with `ROWS BETWEEN n PRECEDING AND CURRENT ROW`
  partitioned so train/test never leak. C-MAPSS already builds `gold_cmapss_features` this way.
- Train notebooks (`08_/09_*`) log to MLflow, gate on a metric declared before training, write a row to
  `tel_model_runs` (jsonb `metrics`, no schema change needed for new keys), and promote a `@champion`
  alias only if the gate clears.
- Serving (`backend/app/services/telemetry_serving.py`) reads the registry-backed rows; the frontend
  reads the serving API. No hardcoded numbers.

## New work, in build order

1. **IMS extraction + Bronze.** Unzip `4.+Bearings.zip`, parse the per-timestamp vibration files into
   `(bearing_id, run, t, channel, value)`, land `bronze_ims`. Write `download_ims.py` extraction step +
   a manifest checksum so the unzip is reproducible.
2. **IMS Silver/Gold.** Vibration features (RMS, kurtosis, spectral band energy, crest factor) on the
   trailing-window frame. Derive a run-to-failure RUL target from the known failure time per run.
3. **N-CMAPSS download + Bronze.** New `download_ncmapss.py` + manifest. Parse the HDF5 units into
   `(unit, cycle, op_setting_*, sensor_*)`, land `bronze_ncmapss`.
4. **N-CMAPSS Silver/Gold.** Carry the operating-condition settings as features (the thing original
   C-MAPSS lacks), build the RUL target, and the same trailing rolling features.
5. **RUL champion on N-CMAPSS,** gated on a declared RMSE, benchmarked head-to-head against the FD001
   champion so the comparison is explicit rather than implied.
6. **RUL-residual drift monitoring** for both, surfaced on the existing Monitoring view.
7. **Replay trace** for one N-CMAPSS unit, the same deterministic-replay shape as the t=728 SMAP/MSL
   demo, so the loop reads identically across datasets.

## Gate for this track (Track B)

The N-CMAPSS RUL champion clears a declared RMSE gate on real data and is benchmarked head-to-head
against FD001; IMS bearing RUL is modeled from real run-to-failure vibration; no regression in the
legacy SMAP/MSL or C-MAPSS paths. Until then, this stays labeled "planned" everywhere it appears.
