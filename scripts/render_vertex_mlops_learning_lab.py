#!/usr/bin/env python
"""Render a low-cost Vertex AI learning-lab bundle for Cloud Shell.

This does not call GCP. It writes a ready-to-run bundle that creates:
  - BigQuery source tables
  - Vertex Feature Groups + Features
  - Vertex Model Registry entries
  - Vertex Experiment runs

It intentionally does NOT create endpoints, online stores, feature views, or
managed Vertex training jobs.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import textwrap


TELEMETRY_JSONL = """\
{"entity_id":"engine-ar-014","feature_timestamp":"2026-06-22 12:00:00","chamber_pressure_mean":982.5,"chamber_pressure_std":14.2,"vibration_rms":0.18,"temp_max":712.0,"residual_score":0.07,"anomaly_label":0}
{"entity_id":"engine-ar-014","feature_timestamp":"2026-06-22 12:05:00","chamber_pressure_mean":991.1,"chamber_pressure_std":16.9,"vibration_rms":0.21,"temp_max":718.4,"residual_score":0.11,"anomaly_label":0}
{"entity_id":"engine-ar-027","feature_timestamp":"2026-06-22 12:10:00","chamber_pressure_mean":945.7,"chamber_pressure_std":38.4,"vibration_rms":0.49,"temp_max":746.2,"residual_score":0.61,"anomaly_label":1}
{"entity_id":"engine-ar-031","feature_timestamp":"2026-06-22 12:15:00","chamber_pressure_mean":1002.3,"chamber_pressure_std":12.7,"vibration_rms":0.16,"temp_max":705.8,"residual_score":0.04,"anomaly_label":0}
"""

FACTORY_JSONL = """\
{"entity_id":"part-lot-a17","feature_timestamp":"2026-06-22 09:00:00","supplier_risk_score":0.18,"print_temp_variance":0.07,"inspection_delta_mm":0.02,"prior_ncr_count":0,"rework_label":0}
{"entity_id":"part-lot-a18","feature_timestamp":"2026-06-22 09:15:00","supplier_risk_score":0.44,"print_temp_variance":0.22,"inspection_delta_mm":0.14,"prior_ncr_count":2,"rework_label":1}
{"entity_id":"part-lot-b04","feature_timestamp":"2026-06-22 09:30:00","supplier_risk_score":0.27,"print_temp_variance":0.11,"inspection_delta_mm":0.04,"prior_ncr_count":1,"rework_label":0}
{"entity_id":"part-lot-c22","feature_timestamp":"2026-06-22 09:45:00","supplier_risk_score":0.71,"print_temp_variance":0.34,"inspection_delta_mm":0.21,"prior_ncr_count":4,"rework_label":1}
"""

PROVIDER_JSONL = """\
{"entity_id":"ticket-security-posture","feature_timestamp":"2026-06-22 10:00:00","context_tokens":42000,"risk_score":0.82,"requires_code":true,"requires_schema":false,"latency_budget_sec":120,"preferred_route":"claude"}
{"entity_id":"ticket-doc-honesty","feature_timestamp":"2026-06-22 10:05:00","context_tokens":18000,"risk_score":0.37,"requires_code":false,"requires_schema":false,"latency_budget_sec":60,"preferred_route":"cheap_long_context"}
{"entity_id":"ticket-entity-graph","feature_timestamp":"2026-06-22 10:10:00","context_tokens":76000,"risk_score":0.91,"requires_code":true,"requires_schema":true,"latency_budget_sec":180,"preferred_route":"frontier"}
{"entity_id":"ticket-residual-panel","feature_timestamp":"2026-06-22 10:15:00","context_tokens":54000,"risk_score":0.68,"requires_code":true,"requires_schema":false,"latency_budget_sec":120,"preferred_route":"claude"}
"""

EVAL_RESULTS_JSONL = """\
{"model_name":"telemetry-anomaly-rf-learning-lab","run_name":"telemetry-anomaly-rf-baseline","metric_name":"f1","metric_value":0.82,"created_at":"2026-06-22 13:00:00","notes":"Toy local run logged for console learning; not production."}
{"model_name":"telemetry-anomaly-rf-learning-lab","run_name":"telemetry-anomaly-rf-tuning-trial-01","metric_name":"f1","metric_value":0.85,"created_at":"2026-06-22 13:05:00","notes":"Tuning-style run; no managed tuning job."}
{"model_name":"factory-rework-lr-learning-lab","run_name":"factory-rework-lr-baseline","metric_name":"review_queue_reduction","metric_value":0.31,"created_at":"2026-06-22 13:10:00","notes":"Toy local run."}
{"model_name":"provider-route-rf-learning-lab","run_name":"provider-route-rf-tuning-trial-02","metric_name":"escalation_accuracy","metric_value":0.94,"created_at":"2026-06-22 13:15:00","notes":"Toy provider routing eval."}
"""


def _render_create_feature_groups(project: str, location: str, dataset: str) -> str:
    return textwrap.dedent(
        f"""\
        from google.cloud import aiplatform
        from vertexai.resources.preview import feature_store

        PROJECT = "{project}"
        LOCATION = "{location}"
        DATASET = "{dataset}"

        aiplatform.init(project=PROJECT, location=LOCATION)

        groups = [
            {{
                "name": "telemetry_sensor_features",
                "table": f"bq://{{PROJECT}}.{{DATASET}}.telemetry_sensor_features",
                "entity_id_columns": ["entity_id"],
                "features": [
                    "chamber_pressure_mean",
                    "chamber_pressure_std",
                    "vibration_rms",
                    "temp_max",
                    "residual_score",
                    "anomaly_label",
                ],
            }},
            {{
                "name": "factory_quality_features",
                "table": f"bq://{{PROJECT}}.{{DATASET}}.factory_quality_features",
                "entity_id_columns": ["entity_id"],
                "features": [
                    "supplier_risk_score",
                    "print_temp_variance",
                    "inspection_delta_mm",
                    "prior_ncr_count",
                    "rework_label",
                ],
            }},
            {{
                "name": "provider_dispatch_features",
                "table": f"bq://{{PROJECT}}.{{DATASET}}.provider_dispatch_features",
                "entity_id_columns": ["entity_id"],
                "features": [
                    "context_tokens",
                    "risk_score",
                    "requires_code",
                    "requires_schema",
                    "latency_budget_sec",
                    "preferred_route",
                ],
            }},
        ]

        for group in groups:
            print(f"Creating feature group: {{group['name']}}")
            try:
                fg = feature_store.FeatureGroup.create(
                    name=group["name"],
                    source=feature_store.utils.FeatureGroupBigQuerySource(
                        uri=group["table"],
                        entity_id_columns=group["entity_id_columns"],
                    ),
                )
            except Exception as exc:
                print(f"Feature group create failed or already exists for {{group['name']}}: {{exc}}")
                fg = feature_store.FeatureGroup(group["name"])

            for feature_name in group["features"]:
                print(f"  Creating feature: {{feature_name}}")
                try:
                    fg.create_feature(
                        name=feature_name,
                        version_column_name=feature_name,
                    )
                except Exception as exc:
                    print(f"  Feature create failed or already exists for {{feature_name}}: {{exc}}")

        print("Done.")
        """
    )


TRAIN_TINY_MODELS = textwrap.dedent(
    """\
    import json
    from pathlib import Path

    import joblib
    import numpy as np
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    np.random.seed(42)

    base = Path("/tmp/vertex-mlops-lab/models")
    for name in ("telemetry_anomaly_rf", "factory_rework_lr", "provider_route_rf"):
        (base / name).mkdir(parents=True, exist_ok=True)

    X_tel = np.array([
        [982.5, 14.2, 0.18, 712.0, 0.07],
        [991.1, 16.9, 0.21, 718.4, 0.11],
        [945.7, 38.4, 0.49, 746.2, 0.61],
        [1002.3, 12.7, 0.16, 705.8, 0.04],
        [933.2, 42.1, 0.55, 759.1, 0.74],
        [997.8, 15.4, 0.19, 710.2, 0.08],
    ])
    y_tel = np.array([0, 0, 1, 0, 1, 0])
    tel_model = RandomForestClassifier(n_estimators=25, random_state=42)
    tel_model.fit(X_tel, y_tel)
    joblib.dump(tel_model, base / "telemetry_anomaly_rf" / "model.joblib")

    X_factory = np.array([
        [0.18, 0.07, 0.02, 0],
        [0.44, 0.22, 0.14, 2],
        [0.27, 0.11, 0.04, 1],
        [0.71, 0.34, 0.21, 4],
        [0.33, 0.18, 0.09, 1],
        [0.81, 0.42, 0.29, 5],
    ])
    y_factory = np.array([0, 1, 0, 1, 0, 1])
    factory_model = Pipeline([
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(random_state=42)),
    ])
    factory_model.fit(X_factory, y_factory)
    joblib.dump(factory_model, base / "factory_rework_lr" / "model.joblib")

    X_provider = np.array([
        [42000, 0.82, 1, 0, 120],
        [18000, 0.37, 0, 0, 60],
        [76000, 0.91, 1, 1, 180],
        [54000, 0.68, 1, 0, 120],
        [110000, 0.95, 1, 1, 240],
        [9000, 0.22, 0, 0, 45],
    ])
    y_provider = np.array([0.76, 0.21, 0.93, 0.69, 0.98, 0.14])
    provider_model = RandomForestRegressor(n_estimators=25, random_state=42)
    provider_model.fit(X_provider, y_provider)
    joblib.dump(provider_model, base / "provider_route_rf" / "model.joblib")

    cards = {
        "telemetry_anomaly_rf": {
            "purpose": "Toy telemetry anomaly classifier for Model Registry learning.",
            "decision": "Flags off-nominal telemetry windows for review.",
            "not_for_production": True,
        },
        "factory_rework_lr": {
            "purpose": "Toy factory rework classifier for Model Registry learning.",
            "decision": "Predicts whether a part/lot needs rework review.",
            "not_for_production": True,
        },
        "provider_route_rf": {
            "purpose": "Toy provider-routing risk/cost regressor for Model Registry learning.",
            "decision": "Scores whether a ticket should route to frontier model vs cheaper route.",
            "not_for_production": True,
        },
    }

    for name, card in cards.items():
        with (base / name / "model_card.json").open("w", encoding="utf-8") as handle:
            json.dump(card, handle, indent=2)

    print("Wrote tiny model artifacts.")
    """
)


def _render_create_experiments(project: str, location: str) -> str:
    return textwrap.dedent(
        f"""\
        import random
        import time

        from google.cloud import aiplatform

        PROJECT = "{project}"
        LOCATION = "{location}"
        EXPERIMENT = "telemetry-mlops-learning-lab"

        aiplatform.init(
            project=PROJECT,
            location=LOCATION,
            experiment=EXPERIMENT,
            experiment_description=(
                "Low-cost learning lab: local toy runs logged to Vertex Experiments. "
                "No endpoints, no managed training jobs."
            ),
        )

        runs = [
            {{
                "run": "telemetry-anomaly-rf-baseline",
                "params": {{
                    "model_family": "random_forest",
                    "n_estimators": 25,
                    "max_depth": "none",
                    "feature_group": "telemetry_sensor_features",
                    "training_mode": "local_cloud_shell",
                }},
                "metrics": {{
                    "precision": 0.86,
                    "recall": 0.79,
                    "f1": 0.82,
                    "false_positive_rate": 0.08,
                }},
            }},
            {{
                "run": "telemetry-anomaly-rf-tuning-trial-01",
                "params": {{
                    "model_family": "random_forest",
                    "n_estimators": 50,
                    "max_depth": 4,
                    "feature_group": "telemetry_sensor_features",
                    "training_mode": "local_cloud_shell",
                }},
                "metrics": {{
                    "precision": 0.88,
                    "recall": 0.83,
                    "f1": 0.85,
                    "false_positive_rate": 0.07,
                }},
            }},
            {{
                "run": "factory-rework-lr-baseline",
                "params": {{
                    "model_family": "logistic_regression",
                    "regularization": "l2",
                    "feature_group": "factory_quality_features",
                    "training_mode": "local_cloud_shell",
                }},
                "metrics": {{
                    "precision": 0.81,
                    "recall": 0.76,
                    "f1": 0.78,
                    "review_queue_reduction": 0.31,
                }},
            }},
            {{
                "run": "provider-route-rf-tuning-trial-01",
                "params": {{
                    "model_family": "random_forest_regressor",
                    "n_estimators": 25,
                    "target": "routing_risk_score",
                    "feature_group": "provider_dispatch_features",
                    "training_mode": "local_cloud_shell",
                }},
                "metrics": {{
                    "mae": 0.07,
                    "rmse": 0.09,
                    "budget_overrun_rate": 0.02,
                    "escalation_accuracy": 0.91,
                }},
            }},
            {{
                "run": "provider-route-rf-tuning-trial-02",
                "params": {{
                    "model_family": "random_forest_regressor",
                    "n_estimators": 75,
                    "target": "routing_risk_score",
                    "feature_group": "provider_dispatch_features",
                    "training_mode": "local_cloud_shell",
                }},
                "metrics": {{
                    "mae": 0.05,
                    "rmse": 0.07,
                    "budget_overrun_rate": 0.01,
                    "escalation_accuracy": 0.94,
                }},
            }},
        ]

        for spec in runs:
            print(f"Logging run: {{spec['run']}}")
            with aiplatform.start_run(spec["run"]) as run:
                run.log_params(spec["params"])
                run.log_metrics(spec["metrics"])
                for step in range(1, 6):
                    run.log_time_series_metrics(
                        {{
                            "train_loss": max(0.01, 1.0 / step + random.random() * 0.03),
                            "eval_score": min(0.99, 0.65 + step * 0.05 + random.random() * 0.02),
                        }},
                        step=step,
                    )
                    time.sleep(0.1)

        print("Done logging Vertex Experiment runs.")
        """
    )


def _render_run_script(project: str, region: str, bq_location: str, dataset: str, bucket: str) -> str:
    return textwrap.dedent(
        f"""\
        #!/usr/bin/env bash
        set -euo pipefail

        PROJECT_ID="{project}"
        REGION="{region}"
        BQ_LOCATION="{bq_location}"
        DATASET="{dataset}"
        BUCKET="{bucket}"

        gcloud config set project "$PROJECT_ID"

        gcloud services enable \\
          aiplatform.googleapis.com \\
          bigquery.googleapis.com \\
          storage.googleapis.com

        gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://$BUCKET" || true

        bq --location="$BQ_LOCATION" mk \\
          --dataset \\
          --description "Low-cost Vertex AI learning lab: features, models, experiments, no endpoints" \\
          "$PROJECT_ID:$DATASET" || true

        bq load --source_format=NEWLINE_DELIMITED_JSON --autodetect \\
          "$PROJECT_ID:$DATASET.telemetry_sensor_features" telemetry_features.jsonl

        bq load --source_format=NEWLINE_DELIMITED_JSON --autodetect \\
          "$PROJECT_ID:$DATASET.factory_quality_features" factory_quality_features.jsonl

        bq load --source_format=NEWLINE_DELIMITED_JSON --autodetect \\
          "$PROJECT_ID:$DATASET.provider_dispatch_features" provider_dispatch_features.jsonl

        python3 -m pip install --user --upgrade google-cloud-aiplatform pandas scikit-learn joblib

        python3 create_feature_groups.py
        python3 train_tiny_models.py

        gsutil -m cp -r /tmp/vertex-mlops-lab/models/* "gs://$BUCKET/models/"

        SKLEARN_SERVING_IMAGE="us-docker.pkg.dev/vertex-ai/prediction/sklearn-cpu.1-0:latest"

        gcloud ai models upload \\
          --region="$REGION" \\
          --display-name="telemetry-anomaly-rf-learning-lab" \\
          --description="Toy telemetry anomaly classifier. Registered for MLOps console learning only. Not deployed." \\
          --container-image-uri="$SKLEARN_SERVING_IMAGE" \\
          --artifact-uri="gs://$BUCKET/models/telemetry_anomaly_rf" \\
          --labels=lab=mlops-learning,domain=telemetry,serving=not-deployed

        sleep 3

        gcloud ai models upload \\
          --region="$REGION" \\
          --display-name="factory-rework-lr-learning-lab" \\
          --description="Toy factory rework classifier. Registered for MLOps console learning only. Not deployed." \\
          --container-image-uri="$SKLEARN_SERVING_IMAGE" \\
          --artifact-uri="gs://$BUCKET/models/factory_rework_lr" \\
          --labels=lab=mlops-learning,domain=factory,serving=not-deployed

        sleep 3

        gcloud ai models upload \\
          --region="$REGION" \\
          --display-name="provider-route-rf-learning-lab" \\
          --description="Toy provider-routing model. Registered for MLOps console learning only. Not deployed." \\
          --container-image-uri="$SKLEARN_SERVING_IMAGE" \\
          --artifact-uri="gs://$BUCKET/models/provider_route_rf" \\
          --labels=lab=mlops-learning,domain=ai-dispatch,serving=not-deployed

        python3 create_vertex_experiments.py

        bq load --source_format=NEWLINE_DELIMITED_JSON --autodetect \\
          "$PROJECT_ID:$DATASET.model_eval_results" model_eval_results.jsonl

        echo "BigQuery tables:"
        bq ls "$PROJECT_ID:$DATASET"

        echo "Feature groups:"
        curl -s \\
          -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
          "https://$REGION-aiplatform.googleapis.com/v1/projects/$PROJECT_ID/locations/$REGION/featureGroups" \\
          | python3 -m json.tool

        echo "Vertex models:"
        gcloud ai models list --region="$REGION" --filter='labels.lab=mlops-learning'

        echo "Experiment runs:"
        python3 - <<'PY'
        from google.cloud import aiplatform

        aiplatform.init(
            project="{project}",
            location="{region}",
            experiment="telemetry-mlops-learning-lab",
        )

        for run in aiplatform.ExperimentRun.list():
            print(run.name)
        PY
        """
    )


README = """\
# Vertex MLOps Learning Lab

This bundle creates real clickable Vertex AI and BigQuery artifacts with a low-cost profile.

Created:
- BigQuery source tables
- Vertex Feature Groups + Features
- Vertex Model Registry entries
- Vertex Experiment runs
- A small evaluation-results table

Intentionally not created:
- Vertex endpoints
- online stores
- feature views
- managed Vertex training jobs

Run from Google Cloud Shell:

```bash
chmod +x run_cloud_shell.sh
./run_cloud_shell.sh
```

Hard stop: if the console tries to push you into online serving, feature views, sync jobs, or endpoint deployment, stop there unless you explicitly want to incur serving cost.
"""


def write_bundle(out_dir: Path, project: str, region: str, bq_location: str, dataset: str, bucket: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "README.md": README,
        "telemetry_features.jsonl": TELEMETRY_JSONL,
        "factory_quality_features.jsonl": FACTORY_JSONL,
        "provider_dispatch_features.jsonl": PROVIDER_JSONL,
        "model_eval_results.jsonl": EVAL_RESULTS_JSONL,
        "create_feature_groups.py": _render_create_feature_groups(project, region, dataset),
        "train_tiny_models.py": TRAIN_TINY_MODELS,
        "create_vertex_experiments.py": _render_create_experiments(project, region),
        "run_cloud_shell.sh": _render_run_script(project, region, bq_location, dataset, bucket),
    }
    for name, content in files.items():
        path = out_dir / name
        path.write_text(content, encoding="utf-8", newline="\n")
        if name.endswith(".sh"):
            path.chmod(0o755)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a Cloud Shell bundle for a low-cost Vertex AI learning lab")
    parser.add_argument("--output-dir", default="artifacts/vertex-mlops-learning-lab", help="where to write the bundle")
    parser.add_argument("--project-id", default="novendor-events-prod")
    parser.add_argument("--region", default="us-east4")
    parser.add_argument("--bq-location", default="us-east4")
    parser.add_argument("--dataset", default="mlops_learning_lab")
    parser.add_argument("--bucket", default=None, help="defaults to <project-id>-vertex-mlops-lab")
    args = parser.parse_args()

    bucket = args.bucket or f"{args.project_id}-vertex-mlops-lab"
    out_dir = Path(args.output_dir)
    write_bundle(out_dir, args.project_id, args.region, args.bq_location, args.dataset, bucket)
    print(f"Rendered bundle to {out_dir.resolve()}")
    print("No cloud calls were made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
