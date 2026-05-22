"""Stage 05 — train models.

Local path: the local contract does not fit a real model; it emits a
deterministic synthetic validation metric block (parity-critical — diffed by
the parity gate). A Track E leakage guard runs first.
Spark path: trains LogisticRegression + RandomForest with PySpark ML and logs
to MLflow.

Honesty note: the local metric is a synthetic validation signal, NOT expected
production performance, and the metric row carries that warning explicitly.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from ..config import WeatherRiskConfig
from .features import LABEL_COLUMNS, MODEL_FEATURE_COLUMNS


def assert_no_leakage(feature_columns: list[str]) -> None:
    """Track E leakage guard: fail closed if a label column is used as a feature.

    The model features must not include any column that encodes the outcome
    (`work_order_surge_14d_flag`, `inspection_failure_flag`, etc.). This catches
    target leakage before any model is fit.
    """
    leaking = sorted(set(feature_columns) & LABEL_COLUMNS)
    if leaking:
        raise RuntimeError(
            f"Target leakage detected: label column(s) used as model features: {leaking}"
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def run(
    config: WeatherRiskConfig,
    features: list[dict[str, Any]],
    run_id: str,
) -> list[dict[str, Any]]:
    """Local train stage: leakage guard + deterministic synthetic metric block.

    Output is byte-stable against the baseline `model_metrics.json`.
    """
    # Track E: leakage guard before producing any metric.
    assert_no_leakage(MODEL_FEATURE_COLUMNS)

    if not features:
        raise RuntimeError("Train stage received zero feature rows.")

    return [
        {
            "run_id": run_id,
            "mlflow_run_id": None,
            "task_type": "classification",
            "model_name": "local_contract_weather_ops_baseline",
            "is_best": True,
            "train_count": int(len(features) * 0.8),
            "test_count": len(features) - int(len(features) * 0.8),
            "metric_name": "synthetic_top_decile_capture_rate",
            "metric_value": 0.72,
            "params_json": json.dumps({"model": "deterministic local contract baseline"}),
            "feature_columns_json": json.dumps(sorted(features[0].keys())),
            "created_at": _utc_now(),
            "metric_honesty_warning": (
                "Local contract metric is a synthetic validation signal, "
                "not expected production performance."
            ),
        }
    ]


def run_spark(spark, dbutils, mlflow):  # pragma: no cover - Databricks runtime
    """Databricks train stage: fit LR + RF, log to MLflow, write model_metrics."""
    from pyspark.ml import Pipeline
    from pyspark.ml.classification import LogisticRegression, RandomForestClassifier
    from pyspark.ml.evaluation import BinaryClassificationEvaluator
    from pyspark.ml.feature import VectorAssembler

    features = spark.table("gold_property_weather_ops_features")
    feature_cols = list(MODEL_FEATURE_COLUMNS)

    # Track E: leakage guard on the Spark path too.
    assert_no_leakage(feature_cols)

    train, test = features.randomSplit([0.8, 0.2], seed=42)
    assembler = VectorAssembler(inputCols=feature_cols, outputCol="features")
    models = [
        ("logistic_regression", LogisticRegression(labelCol="work_order_surge_14d_flag", featuresCol="features")),
        (
            "random_forest_classifier",
            RandomForestClassifier(labelCol="work_order_surge_14d_flag", featuresCol="features", seed=42),
        ),
    ]
    metrics = []
    evaluator = BinaryClassificationEvaluator(
        labelCol="work_order_surge_14d_flag", metricName="areaUnderROC"
    )
    for name, estimator in models:
        with mlflow.start_run(run_name=name) as run:
            pipeline = Pipeline(stages=[assembler, estimator])
            fitted = pipeline.fit(train)
            scored = fitted.transform(test)
            auc = evaluator.evaluate(scored)
            mlflow.log_metric("auc", auc)
            mlflow.log_param("feature_columns", ",".join(feature_cols))
            model_artifact_status = "logged"
            model_artifact_error = ""
            try:
                mlflow.spark.log_model(fitted, name)
            except Exception as exc:
                model_artifact_status = "not_logged"
                model_artifact_error = f"{type(exc).__name__}: {str(exc)[:300]}"
                mlflow.set_tag("model_artifact_status", model_artifact_status)
                mlflow.set_tag("model_artifact_error", model_artifact_error)
            metrics.append(
                {
                    "model_name": name,
                    "mlflow_run_id": run.info.run_id,
                    "metric_name": "auc",
                    "metric_value": float(auc),
                    "is_best": False,
                    "model_artifact_status": model_artifact_status,
                    "model_artifact_error": model_artifact_error,
                }
            )
    best = max(metrics, key=lambda row: row["metric_value"])
    for row in metrics:
        row["is_best"] = row["model_name"] == best["model_name"]
    spark.createDataFrame(metrics).write.mode("overwrite").saveAsTable("model_metrics")
    dbutils.jobs.taskValues.set(key="best_model_name", value=best["model_name"])
    return metrics
