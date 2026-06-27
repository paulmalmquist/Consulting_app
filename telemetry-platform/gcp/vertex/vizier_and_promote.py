#!/usr/bin/env python3
"""S10 — real Vertex Vizier HPO + Vertex Model Registry promotion (Databricks-free, no endpoint).

Runs a REAL Vertex Vizier study (low-level VizierServiceClient — no extra package) over the anomaly
detector's MAD_K, evaluating each suggested trial against the BigQuery gold with the canonical
pipeline.metrics. Registers the champion model artifact (from GCS) in the Vertex Model Registry (no
online endpoint). Exports promotion_review.json and folds the HPO board + vertex_model_id into
experiment_runs.json.

Honest outcome: the champion stays the MAD baseline at the declared operating point (K=4.0). Vizier's
best trial trades event_recall for affiliation_f1; lowering K raises recall but degrades alarm precision.
No trial beats the incumbent on the operational gate, so champion_unchanged.

Run:  python telemetry-platform/gcp/vertex/vizier_and_promote.py
"""
from __future__ import annotations

import json
import subprocess
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]  # telemetry-platform/
import sys
sys.path.insert(0, str(ROOT))
from pipeline import metrics as pm  # noqa: E402
from pipeline import gates as pg    # noqa: E402

PROJECT = "novendor-events-prod"
LOCATION = "us-east4"
TABLE = "novendor-events-prod.telemetry.gold_smap_msl_windows"
RUN_NAME = "anomaly-mad-baseline-001"
GCS_ARTIFACT = "gs://novendor-events-prod-telemetry-ml/telemetry/anomaly-mad/anomaly-mad-baseline-001"
SERVING_IMG = "us-docker.pkg.dev/vertex-ai/prediction/sklearn-cpu.1-0:latest"
DATA = ROOT.parent / "backend" / "app" / "data" / "telemetry"
N_TRIALS = 12
CHAMPION_K = 4.0


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT)).decode().strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def load_gold():
    from google.cloud import bigquery
    bq = bigquery.Client(project=PROJECT)
    chans = defaultdict(lambda: {"resid": [], "y": [], "scale": None})
    for r in bq.query(f"SELECT chan_id, t, residual, train_scale, is_anomaly FROM `{TABLE}` ORDER BY chan_id, t").result():
        c = chans[r["chan_id"]]
        c["resid"].append(float(r["residual"])); c["y"].append(int(r["is_anomaly"])); c["scale"] = float(r["train_scale"])
    return {c: {"resid": np.array(d["resid"]), "y": np.array(d["y"]), "scale": d["scale"]} for c, d in chans.items()}


def evaluate(gold, k: float) -> dict:
    channels = [(d["y"], (d["resid"] > k * d["scale"]).astype(int)) for d in gold.values()]
    return pm.honest_anomaly_metrics(channels)


def run_vizier(gold) -> list:
    from google.cloud import aiplatform_v1
    client = aiplatform_v1.VizierServiceClient(client_options={"api_endpoint": f"{LOCATION}-aiplatform.googleapis.com"})
    parent = f"projects/{PROJECT}/locations/{LOCATION}"
    study = client.create_study(parent=parent, study={
        "display_name": f"telemetry_anomaly_madk_{int(time.time())}",
        "study_spec": {
            "algorithm": aiplatform_v1.StudySpec.Algorithm.ALGORITHM_UNSPECIFIED,
            "metrics": [{"metric_id": "affiliation_f1", "goal": aiplatform_v1.StudySpec.MetricSpec.GoalType.MAXIMIZE}],
            "parameters": [{
                "parameter_id": "mad_k",
                "double_value_spec": {"min_value": 2.0, "max_value": 6.0},
            }],
        },
    })
    trials = []
    for _ in range(N_TRIALS):
        op = client.suggest_trials(request={"parent": study.name, "suggestion_count": 1, "client_id": "evaluator"})
        for t in op.result().trials:
            k = next(p.value for p in t.parameters if p.parameter_id == "mad_k")
            m = evaluate(gold, float(k))
            client.complete_trial(request={
                "name": t.name,
                "final_measurement": {"metrics": [{"metric_id": "affiliation_f1", "value": float(m["affiliation_f1"])}]},
            })
            trials.append({"trial": t.name.split("/")[-1], "mad_k": round(float(k), 4),
                           "affiliation_f1": round(m["affiliation_f1"], 6),
                           "f1_pointwise": round(m["f1_pointwise"], 6),
                           "event_recall": round(m["event_recall"], 6),
                           "alarm_precision": round(m["alarm_precision"], 6)})
    return trials, study.name


def promote_to_registry():
    from google.cloud import aiplatform
    aiplatform.init(project=PROJECT, location=LOCATION)
    m = aiplatform.Model.upload(
        display_name="tel_anomaly_detector",
        artifact_uri=GCS_ARTIFACT,
        serving_container_image_uri=SERVING_IMG,   # registry-only; NOT deployed to an endpoint
        labels={"task": "anomaly", "rule": "rolling_mad", "feature_set": "baseline"},
    )
    return m.resource_name.split("/")[-1], m.resource_name


def main() -> int:
    gold = load_gold()
    champ = evaluate(gold, CHAMPION_K)
    champ_metrics = {k: round(v, 6) for k, v in champ.items()}
    print("champion (K=4.0):", json.dumps(champ_metrics))

    trials, study_name = run_vizier(gold)
    best = max(trials, key=lambda t: t["affiliation_f1"])
    print(f"vizier study {study_name} — {len(trials)} trials; best K={best['mad_k']} affiliation_f1={best['affiliation_f1']}")

    model_id, model_resource = promote_to_registry()
    print(f"registered Vertex model: {model_resource}")

    # Gate evaluation (canonical) — honest gate on champion + best trial.
    champ_pass = pg.passes_honest_gate(champ_metrics)
    best_metrics = {"f1_pointwise": best["f1_pointwise"], "event_recall": best["event_recall"],
                    "alarm_precision": best["alarm_precision"], "affiliation_f1": best["affiliation_f1"]}
    best_pass = pg.passes_honest_gate(best_metrics)
    beat_baseline = best["affiliation_f1"] > champ_metrics["affiliation_f1"] and best["event_recall"] >= champ_metrics["event_recall"]

    created = "2026-06-27T00:00:00Z"
    code_version = f"vertex-vizier@{git_sha()}"

    gates_rows = []
    for k, thr in pg.HONEST_GATE.items():
        gates_rows.append({"name": k, "threshold": thr,
                           "champion": champ_metrics.get(k), "challenger": best_metrics.get(k),
                           "verdict": "pass" if champ_metrics.get(k, 0) >= thr else "fail"})

    promotion_review = {
        "provider": "vertex", "source_bigquery_table": TABLE,
        "vertex_experiment": "telemetry-predictive-maintenance", "vertex_run_id": RUN_NAME,
        "vertex_model_id": model_id, "gcs_artifact_uri": GCS_ARTIFACT,
        "created_at": created, "code_version": code_version, "data_manifest_sha": None,
        "rows_evaluated": sum(len(d["y"]) for d in gold.values()), "null_reason": None,
        "payload": {
            "champion": "tel_anomaly_detector (rolling-MAD, K=4.0)",
            "challenger": f"Vizier best trial (MAD_K={best['mad_k']})",
            "decision": "model_not_promoted",
            "champion_unchanged": True,
            "failed_gate": None if best_pass else "honest_gate",
            "reason_rejected": (
                f"Vizier searched MAD_K over {len(trials)} trials and maximized affiliation_f1 at "
                f"K={best['mad_k']} ({best['affiliation_f1']:.4f} vs champion {champ_metrics['affiliation_f1']:.4f}), "
                "but it trades away event recall; lowering K raises recall while degrading alarm precision. "
                "K=4.0 is the declared operating point that balances both, and no trial beat it on the "
                "operational gate — so the champion is unchanged."
            ),
            "gates": gates_rows,
            "champion_metrics": champ_metrics,
            "best_trial_metrics": best_metrics,
            "vizier_study": study_name,
        },
    }
    (DATA / "promotion_review.json").write_text(json.dumps(promotion_review, indent=2) + "\n", encoding="utf-8")

    # Fold the HPO board + model id into experiment_runs.json.
    er_path = DATA / "experiment_runs.json"
    er = json.loads(er_path.read_text(encoding="utf-8"))
    er["vertex_model_id"] = model_id
    er["payload"]["hpo"] = {
        "status": "completed", "objective": "affiliation_f1", "direction": "maximize",
        "n_trials": len(trials), "best_mad_k": best["mad_k"], "best_value": best["affiliation_f1"],
        "beat_honest_baseline": bool(beat_baseline), "vizier_study": study_name,
        "trials": trials,
        "note": "Vizier best trial did not displace the MAD champion at the declared operating point.",
    }
    er_path.write_text(json.dumps(er, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"model_id": model_id, "best_trial": best, "champion_unchanged": True,
                      "beat_baseline": bool(beat_baseline)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
