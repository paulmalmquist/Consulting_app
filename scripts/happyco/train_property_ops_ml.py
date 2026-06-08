from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, roc_auc_score
    from sklearn.model_selection import train_test_split
except ModuleNotFoundError:  # pragma: no cover - exercised in lean local envs
    LogisticRegression = None  # type: ignore[assignment]
    accuracy_score = None  # type: ignore[assignment]
    roc_auc_score = None  # type: ignore[assignment]
    train_test_split = None  # type: ignore[assignment]


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.services import operator_property_ops as property_ops_svc  # noqa: E402


MODEL_NAME = "happyco_property_maintenance_escalation_risk"
MODEL_VERSION = "happyco-property-ops-risk-v1"
DEMO_CAVEAT = (
    "Synthetic demo model trained on deterministic demo data. "
    "Not HappyCo production data and not evidence of real-world expected performance."
)
NUMERIC_FEATURES = [
    "trailing_30_day_work_order_count",
    "trailing_60_day_work_order_count",
    "repeat_work_order_rate",
    "reopened_work_order_rate",
    "average_aging_days",
    "inspection_severity_score",
    "hvac_finding_count",
    "plumbing_finding_count",
    "moisture_finding_count",
    "safety_finding_count",
    "vendor_first_time_fix_rate",
    "vendor_average_aging",
    "resident_impact_proxy_count",
    "property_unit_count",
    "prior_escalation_flag",
]
TARGET = "maintenance_escalation_risk_30d"


def _load_feature_rows(_fixture_path: Path) -> list[dict[str, Any]]:
    # The fixture path is accepted so the command documents its source dependency.
    # The service is the single materialization owner for the canonical demo contract.
    return property_ops_svc.ml_feature_rows()


def _feature_names(rows: list[dict[str, Any]]) -> list[str]:
    categories = sorted({str(row["category"]) for row in rows})
    peer_groups = sorted({str(row["peer_group"]) for row in rows})
    return (
        NUMERIC_FEATURES
        + [f"category__{category}" for category in categories]
        + [f"peer_group__{peer_group}" for peer_group in peer_groups]
    )


def _matrix(rows: list[dict[str, Any]], feature_names: list[str]) -> np.ndarray:
    categories = [name.removeprefix("category__") for name in feature_names if name.startswith("category__")]
    peer_groups = [name.removeprefix("peer_group__") for name in feature_names if name.startswith("peer_group__")]
    matrix: list[list[float]] = []
    for row in rows:
        values: list[float] = []
        for feature in NUMERIC_FEATURES:
            raw = row.get(feature)
            values.append(0.0 if raw is None else float(raw))
        values.extend(1.0 if row["category"] == category else 0.0 for category in categories)
        values.extend(1.0 if row["peer_group"] == peer_group else 0.0 for peer_group in peer_groups)
        matrix.append(values)
    return np.array(matrix, dtype=float)


def _risk_band(score: float) -> str:
    if score >= 0.7:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


def _top_drivers(row_values: np.ndarray, coefficients: np.ndarray, feature_names: list[str]) -> list[dict[str, Any]]:
    contributions = row_values * coefficients
    ranked = sorted(
        [
            {
                "feature": feature,
                "coefficient": round(float(coef), 6),
                "feature_value": round(float(value), 6),
                "contribution": round(float(contribution), 6),
            }
            for feature, coef, value, contribution in zip(feature_names, coefficients, row_values, contributions)
        ],
        key=lambda item: abs(item["contribution"]),
        reverse=True,
    )
    return ranked[:3]


def _sigmoid(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(values, -30, 30)
    return 1.0 / (1.0 + np.exp(-clipped))


def _manual_train_test_split(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(42)
    train_indices: list[int] = []
    test_indices: list[int] = []
    for klass in sorted(set(y.tolist())):
        indices = np.where(y == klass)[0]
        rng.shuffle(indices)
        test_count = max(1, int(round(len(indices) * 0.33)))
        test_indices.extend(indices[:test_count].tolist())
        train_indices.extend(indices[test_count:].tolist())
    return x[train_indices], x[test_indices], y[train_indices], y[test_indices]


def _manual_accuracy(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(y_true == y_pred))


def _manual_auc(y_true: np.ndarray, scores: np.ndarray) -> float | None:
    positives = scores[y_true == 1]
    negatives = scores[y_true == 0]
    if len(positives) == 0 or len(negatives) == 0:
        return None
    wins = 0.0
    total = float(len(positives) * len(negatives))
    for pos in positives:
        for neg in negatives:
            if pos > neg:
                wins += 1.0
            elif pos == neg:
                wins += 0.5
    return wins / total


def _fit_numpy_logistic(train_x: np.ndarray, train_y: np.ndarray) -> dict[str, np.ndarray]:
    mean = train_x.mean(axis=0)
    std = train_x.std(axis=0)
    std[std == 0] = 1.0
    x_scaled = (train_x - mean) / std
    design = np.column_stack([np.ones(len(x_scaled)), x_scaled])
    weights = np.zeros(design.shape[1])
    class_weight = np.where(train_y == 1, len(train_y) / max(1, int(train_y.sum())), len(train_y) / max(1, int((1 - train_y).sum())))
    learning_rate = 0.08
    l2 = 0.01
    for _ in range(3000):
        pred = _sigmoid(design @ weights)
        gradient = (design.T @ ((pred - train_y) * class_weight)) / len(train_y)
        gradient[1:] += l2 * weights[1:]
        weights -= learning_rate * gradient
    return {"intercept": weights[:1], "coefficients": weights[1:] / std, "mean": mean, "std": std, "scaled_weights": weights}


def _predict_numpy_logistic(model: dict[str, np.ndarray], x: np.ndarray) -> np.ndarray:
    scaled = (x - model["mean"]) / model["std"]
    design = np.column_stack([np.ones(len(scaled)), scaled])
    return _sigmoid(design @ model["scaled_weights"])


def _write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key in fieldnames})


def _write_model_card(path: Path, metrics: dict[str, Any], registry: dict[str, Any]) -> None:
    path.write_text(
        "\n".join(
            [
                "# HappyCo Property Ops Predictive Maintenance Risk Model",
                "",
                "## Purpose",
                "Demonstrate a Databricks-ready, product-facing ML workflow for property operations risk.",
                "",
                "## Use Case",
                "Predict whether a property/building/category cluster is likely to produce a repeat work order, reopened ticket, or maintenance escalation in the next 30 days.",
                "",
                "## Data",
                "- Source: deterministic synthetic HappyCo Property Ops fixture.",
                "- Caveat: not HappyCo production data.",
                "- Pipeline frame: Bronze operational extracts -> Silver canonical records -> Gold benchmark/features -> ML feature table -> batch inference.",
                "",
                "## Model",
                f"- Name: `{registry['model_name']}`",
                f"- Version: `{registry['model_version']}`",
                "- Type: logistic regression.",
                "- Priority: explainability over raw performance.",
                "",
                "## Metrics",
                f"- Accuracy: {metrics['accuracy']}",
                f"- ROC AUC: {metrics['roc_auc']}",
                f"- Positive rows: {metrics['positive_rows']}",
                f"- Total rows: {metrics['total_rows']}",
                "",
                "## Honesty Note",
                metrics["metric_honesty_warning"],
                "",
                "## Deployment Status",
                f"`{registry['deployment_status']}`",
                "",
                "## Caveat",
                DEMO_CAVEAT,
                "",
            ]
        ),
        encoding="utf-8",
    )


def _write_readme(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "# HappyCo ML Artifacts",
                "",
                "Generated local outputs for Ticket 3A.",
                "",
                "These files are intentionally local evidence artifacts. The repo `.gitignore` ignores `artifacts/`, so regenerate with:",
                "",
                "```powershell",
                "python scripts/happyco/train_property_ops_ml.py --fixture backend/app/fixtures/winston_demo/happyco_property_ops_seed.json --out artifacts/happyco/ml",
                "```",
                "",
                "Do not claim Databricks execution unless a CLI/job receipt is produced separately.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def train(*, fixture_path: Path, out_dir: Path) -> dict[str, Any]:
    rows = _load_feature_rows(fixture_path)
    if not rows:
        raise RuntimeError("No ML feature rows available from HappyCo fixture.")

    feature_names = _feature_names(rows)
    x = _matrix(rows, feature_names)
    y = np.array([int(row[TARGET]) for row in rows], dtype=int)
    if len(set(y.tolist())) < 2:
        raise RuntimeError("Feature table must contain both positive and negative labels.")

    if LogisticRegression is not None and train_test_split is not None:
        stratify = y if min(np.bincount(y)) >= 2 else None
        train_x, test_x, train_y, test_y = train_test_split(
            x,
            y,
            test_size=0.33,
            random_state=42,
            stratify=stratify,
        )
        model = LogisticRegression(max_iter=1000, random_state=42, class_weight="balanced")
        model.fit(train_x, train_y)
        all_scores = model.predict_proba(x)[:, 1]
        test_scores = model.predict_proba(test_x)[:, 1]
        coefficients = model.coef_[0]
        backend = "sklearn_logistic_regression"
        test_pred = (test_scores >= 0.5).astype(int)
        accuracy = round(float(accuracy_score(test_y, test_pred)), 4)  # type: ignore[misc]
        try:
            roc_auc: float | None = round(float(roc_auc_score(test_y, test_scores)), 4)  # type: ignore[misc]
        except ValueError:
            roc_auc = None
    else:
        train_x, test_x, train_y, test_y = _manual_train_test_split(x, y)
        model = _fit_numpy_logistic(train_x, train_y)
        all_scores = _predict_numpy_logistic(model, x)
        test_scores = _predict_numpy_logistic(model, test_x)
        coefficients = model["coefficients"]
        backend = "numpy_logistic_regression_fallback"
        test_pred = (test_scores >= 0.5).astype(int)
        accuracy = round(_manual_accuracy(test_y, test_pred), 4)
        auc_value = _manual_auc(test_y, test_scores)
        roc_auc = round(float(auc_value), 4) if auc_value is not None else None

    warning = (
        "Synthetic labels may be deterministic or partially separable; treat metrics as a demo-data validation signal, not expected production performance."
        if accuracy >= 0.9 or (roc_auc is not None and roc_auc >= 0.9)
        else "Metrics are from a tiny deterministic synthetic demo set and are not expected production performance."
    )
    trained_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    out_dir.mkdir(parents=True, exist_ok=True)
    feature_fields = list(rows[0].keys())
    _write_csv(out_dir / "feature_table.csv", rows, feature_fields)

    predictions: list[dict[str, Any]] = []
    for row, row_values, score in zip(rows, x, all_scores):
        predictions.append(
            {
                "feature_row_id": row["feature_row_id"],
                "property_id": row["property_id"],
                "building_id": row["building_id"],
                "category": row["category"],
                "risk_score": round(float(score), 4),
                "risk_band": _risk_band(float(score)),
                "top_drivers": json.dumps(_top_drivers(row_values, coefficients, feature_names)),
                "model_version": MODEL_VERSION,
                "trained_at": trained_at,
                "demo_mode": True,
                "data_source": "synthetic_demo",
                "caveat": DEMO_CAVEAT,
            }
        )
    _write_csv(
        out_dir / "predictions.csv",
        predictions,
        [
            "feature_row_id",
            "property_id",
            "building_id",
            "category",
            "risk_score",
            "risk_band",
            "top_drivers",
            "model_version",
            "trained_at",
            "demo_mode",
            "data_source",
            "caveat",
        ],
    )

    importance = sorted(
        [
            {
                "feature": feature,
                "coefficient": round(float(coef), 6),
                "importance": round(abs(float(coef)), 6),
            }
            for feature, coef in zip(feature_names, coefficients)
        ],
        key=lambda item: item["importance"],
        reverse=True,
    )
    _write_csv(out_dir / "feature_importance.csv", importance, ["feature", "coefficient", "importance"])

    metrics = {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "trained_at": trained_at,
        "total_rows": int(len(rows)),
        "positive_rows": int(y.sum()),
        "negative_rows": int(len(y) - y.sum()),
        "accuracy": accuracy,
        "roc_auc": roc_auc,
        "training_backend": backend,
        "metric_honesty_warning": warning,
        "demo_mode": True,
        "data_source": "synthetic_demo",
        "caveat": DEMO_CAVEAT,
    }
    (out_dir / "model_metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")

    registry = {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "trained_at": trained_at,
        "feature_table_version": "happyco-property-ops-v1",
        "metrics_path": str(out_dir / "model_metrics.json"),
        "prediction_path": str(out_dir / "predictions.csv"),
        "model_card_path": str(out_dir / "model_card.md"),
        "deployment_status": "local_demo_only",
        "caveat": DEMO_CAVEAT,
    }
    (out_dir / "model_registry_record.json").write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    _write_model_card(out_dir / "model_card.md", metrics, registry)
    _write_readme(out_dir / "README.md")

    return {
        "ok": True,
        "out_dir": str(out_dir),
        "metrics": metrics,
        "artifacts": [
            "feature_table.csv",
            "predictions.csv",
            "model_metrics.json",
            "feature_importance.csv",
            "model_card.md",
            "model_registry_record.json",
            "README.md",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Train the HappyCo synthetic property ops risk model.")
    parser.add_argument("--fixture", type=Path, required=True, help="Path to HappyCo property ops fixture seed.")
    parser.add_argument("--out", type=Path, required=True, help="Output directory for local ML artifacts.")
    args = parser.parse_args()

    result = train(fixture_path=args.fixture, out_dir=args.out)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
