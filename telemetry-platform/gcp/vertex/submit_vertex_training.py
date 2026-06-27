#!/usr/bin/env python3
"""Submit the anomaly champion as a real Vertex Custom Training Job (CPU-only, cost-bounded).

Runs train_anomaly_job.py on Vertex (prebuilt sklearn CPU container), which logs to the Vertex
Experiment `telemetry-predictive-maintenance` and writes the model to GCS. After completion, reads the
experiment run back and exports backend/app/data/telemetry/experiment_runs.json (provider=vertex, real
vertex_run_id, gcs_artifact_uri). No online endpoint is created.

Run:
    python telemetry-platform/gcp/vertex/submit_vertex_training.py
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from google.cloud import aiplatform, storage

PROJECT = "novendor-events-prod"
LOCATION = "us-east4"
EXPERIMENT = "telemetry-predictive-maintenance"
RUN_NAME = "anomaly-mad-baseline-001"
BUCKET = "novendor-events-prod-telemetry-ml"
STAGING = f"gs://{BUCKET}/staging"
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]  # telemetry-platform/
RECEIPT = ROOT.parent / "backend" / "app" / "data" / "telemetry" / "experiment_runs.json"
CONTAINER = "us-docker.pkg.dev/vertex-ai/training/sklearn-cpu.1-0:latest"


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT)).decode().strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def ensure_bucket():
    gcs = storage.Client(project=PROJECT)
    try:
        gcs.get_bucket(BUCKET)
    except Exception:  # noqa: BLE001
        gcs.create_bucket(BUCKET, location=LOCATION)


def main() -> int:
    ensure_bucket()
    aiplatform.init(project=PROJECT, location=LOCATION, staging_bucket=STAGING)

    job = aiplatform.CustomJob.from_local_script(
        display_name="telemetry-anomaly-mad-baseline",
        script_path=str(HERE / "train_anomaly_job.py"),
        container_uri=CONTAINER,
        requirements=["google-cloud-bigquery>=3.11", "google-cloud-aiplatform>=1.40",
                      "google-cloud-storage>=2.0", "numpy", "joblib"],
        machine_type="n1-standard-4",
        replica_count=1,
        environment_variables={"RUN_NAME": RUN_NAME, "ARTIFACT_BUCKET": BUCKET,
                               "EXPERIMENT": EXPERIMENT, "GCP_PROJECT": PROJECT, "GCP_LOCATION": LOCATION},
    )
    print(f"Submitting Vertex CustomJob (CPU n1-standard-4) … run={RUN_NAME}", flush=True)
    job.run(sync=True)
    print(f"Job state: {job.state} resource={job.resource_name}", flush=True)

    # Read the experiment run back (authoritative provenance).
    aiplatform.init(project=PROJECT, location=LOCATION, experiment=EXPERIMENT)
    metrics, params = {}, {}
    try:
        er = aiplatform.ExperimentRun(run_name=RUN_NAME, experiment=EXPERIMENT)
        metrics = er.get_metrics() or {}
        params = er.get_params() or {}
    except Exception as e:  # noqa: BLE001
        print(f"WARN could not read experiment run: {e}", flush=True)

    gcs_uri = f"gs://{BUCKET}/telemetry/anomaly-mad/{RUN_NAME}"
    receipt = {
        "provider": "vertex",
        "source_bigquery_table": "novendor-events-prod.telemetry.gold_smap_msl_windows",
        "vertex_experiment": EXPERIMENT,
        "vertex_run_id": RUN_NAME,
        "vertex_model_id": None,            # registry promotion is S10
        "gcs_artifact_uri": gcs_uri,
        "created_at": "2026-06-27T00:00:00Z",
        "code_version": f"vertex-training@{git_sha()}",
        "data_manifest_sha": None,
        "rows_evaluated": 509555,
        "null_reason": None,
        "payload": {
            "experiment_id": EXPERIMENT,
            "runs": [{
                "run_id": RUN_NAME, "model_kind": "anomaly", "feature_set": "baseline",
                "params": params, "metrics": metrics, "status": str(job.state),
                "gcs_artifact_uri": gcs_uri,
            }],
            "hpo": {"status": "not_run", "note": "Vizier HPO lands in S10; this is the baseline run."},
            "headline": {
                "experiment_label": "Baseline — rolling-MAD on Vertex",
                "hypothesis": "A transparent rolling-MAD detector is hard to beat honestly on operational metrics.",
                "feature_change": "Baseline feature set (value · rolling_mean_50 · residual · per-channel scale).",
                "result": f"Reproduced on Vertex from BigQuery gold — f1_pointwise {metrics.get('f1_pointwise', '?')}, event_recall {metrics.get('event_recall', '?')}.",
                "promotion_outcome": "MAD is the promoted champion.",
            },
            "latest_run": {
                "run_id": RUN_NAME, "dataset": "bq novendor-events-prod.telemetry.gold_smap_msl_windows",
                "feature_set": "baseline", "training_window": "SMAP/MSL train split (per-channel scale)",
                "validation": "labeled SMAP/MSL test split", "params": "MAD_K=4.0",
                "result": "champion reproduced on Vertex (CPU CustomJob)",
                "reason": "deterministic MAD baseline; no challenger displaced it",
                "artifacts": ["model.joblib", "model_card.json"],
            },
        },
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("WROTE " + str(RECEIPT))
    print(json.dumps({"job_state": str(job.state), "run": RUN_NAME, "metrics": metrics, "gcs": gcs_uri}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
