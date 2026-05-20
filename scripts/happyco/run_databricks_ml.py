from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.services import operator_property_ops as property_ops_svc  # noqa: E402


DEMO_CAVEAT = "Synthetic demo data. Not HappyCo production data."
CLAIM_ALLOWED = "Databricks ML training run executed on synthetic property operations data."
CLAIM_NOT_ALLOWED = "Production HappyCo model trained/deployed."


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _run(args: list[str], *, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _databricks_cmd(explicit: str | None) -> str | None:
    if explicit:
        return explicit
    found = shutil.which("databricks")
    if found:
        return found
    winget_root = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    if winget_root.exists():
        matches = sorted(winget_root.glob("Databricks.DatabricksCLI_*/*databricks.exe"))
        if matches:
            return str(matches[-1])
    return None


def _db_args(databricks_cmd: str, profile: str | None, *args: str) -> list[str]:
    command = [databricks_cmd, *args]
    if profile:
        command.extend(["--profile", profile])
    return command


def _redact(text: str) -> str:
    # Keep command diagnostics useful without preserving bearer-style tokens.
    words = []
    for word in text.split():
        if len(word) >= 24 and any(ch.isdigit() for ch in word) and any(ch.isalpha() for ch in word):
            words.append("[REDACTED]")
        else:
            words.append(word)
    return " ".join(words)


def _base_receipt(*, run_label: str) -> dict[str, Any]:
    return {
        "demo_mode": True,
        "data_source": "synthetic_demo",
        "run_label": run_label,
        "model_name": "happyco_property_maintenance_escalation_risk",
        "model_version": run_label,
        "caveat": DEMO_CAVEAT,
        "claim_allowed": CLAIM_ALLOWED,
        "claim_not_allowed": CLAIM_NOT_ALLOWED,
    }


def _mask_user(raw_user: dict[str, Any]) -> str | None:
    value = raw_user.get("userName") or raw_user.get("displayName")
    if not value or not isinstance(value, str):
        return None
    if "@" not in value:
        return value[:2] + "***" if len(value) > 2 else "***"
    local, domain = value.split("@", 1)
    return f"{local[:2]}***@{domain}"


def _write_attempt(out_dir: Path, receipt: dict[str, Any], *, error_category: str) -> int:
    _write_json(out_dir / "databricks_run_attempt_receipt.json", receipt)
    print(
        json.dumps(
            {
                "ok": False,
                "receipt": str(out_dir / "databricks_run_attempt_receipt.json"),
                "error_category": error_category,
            },
            indent=2,
        )
    )
    return 1


def _notebook_source(*, feature_rows: list[dict[str, Any]], run_label: str) -> str:
    embedded_rows = json.dumps(feature_rows, separators=(",", ":"))
    return f'''# Databricks notebook source
import csv
import json
import math
import os
from datetime import datetime, timezone

import numpy as np

try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, roc_auc_score
    from sklearn.model_selection import train_test_split
except ModuleNotFoundError:
    LogisticRegression = None
    accuracy_score = None
    roc_auc_score = None
    train_test_split = None

MODEL_NAME = "happyco_property_maintenance_escalation_risk"
MODEL_VERSION = "{run_label}"
DEMO_CAVEAT = "{DEMO_CAVEAT}"
CLAIM_ALLOWED = "{CLAIM_ALLOWED}"
CLAIM_NOT_ALLOWED = "{CLAIM_NOT_ALLOWED}"
TARGET = "maintenance_escalation_risk_30d"
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

started_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
rows = json.loads("""{embedded_rows}""")

categories = sorted({{str(row["category"]) for row in rows}})
peer_groups = sorted({{str(row["peer_group"]) for row in rows}})
feature_names = (
    NUMERIC_FEATURES
    + [f"category__{{category}}" for category in categories]
    + [f"peer_group__{{peer_group}}" for peer_group in peer_groups]
)

def matrix(feature_rows, names):
    category_values = [name.removeprefix("category__") for name in names if name.startswith("category__")]
    peer_group_values = [name.removeprefix("peer_group__") for name in names if name.startswith("peer_group__")]
    values = []
    for row in feature_rows:
        out = []
        for feature in NUMERIC_FEATURES:
            raw = row.get(feature)
            out.append(0.0 if raw is None else float(raw))
        out.extend(1.0 if row["category"] == category else 0.0 for category in category_values)
        out.extend(1.0 if row["peer_group"] == peer_group else 0.0 for peer_group in peer_group_values)
        values.append(out)
    return np.array(values, dtype=float)

def risk_band(score):
    if score >= 0.7:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"

def top_drivers(row_values, coefficients):
    ranked = []
    for feature, coef, value in zip(feature_names, coefficients, row_values):
        contribution = float(coef) * float(value)
        ranked.append({{
            "feature": feature,
            "coefficient": round(float(coef), 6),
            "feature_value": round(float(value), 6),
            "contribution": round(contribution, 6),
        }})
    ranked.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    return ranked[:3]

def write_csv(path, csv_rows, fieldnames):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in csv_rows:
            writer.writerow({{key: row.get(key) for key in fieldnames}})

def sigmoid(values):
    clipped = np.clip(values, -30, 30)
    return 1.0 / (1.0 + np.exp(-clipped))

def manual_train_test_split(x, y):
    rng = np.random.default_rng(42)
    train_indices = []
    test_indices = []
    for klass in sorted(set(y.tolist())):
        indices = np.where(y == klass)[0]
        rng.shuffle(indices)
        test_count = max(1, int(round(len(indices) * 0.33)))
        test_indices.extend(indices[:test_count].tolist())
        train_indices.extend(indices[test_count:].tolist())
    return x[train_indices], x[test_indices], y[train_indices], y[test_indices]

def manual_accuracy(y_true, y_pred):
    return float(np.mean(y_true == y_pred))

def manual_auc(y_true, scores):
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

def fit_numpy_logistic(train_x, train_y):
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
        pred = sigmoid(design @ weights)
        gradient = (design.T @ ((pred - train_y) * class_weight)) / len(train_y)
        gradient[1:] += l2 * weights[1:]
        weights -= learning_rate * gradient
    return {{"mean": mean, "std": std, "scaled_weights": weights, "coefficients": weights[1:] / std}}

def predict_numpy_logistic(model, x):
    scaled = (x - model["mean"]) / model["std"]
    design = np.column_stack([np.ones(len(scaled)), scaled])
    return sigmoid(design @ model["scaled_weights"])

x = matrix(rows, feature_names)
y = np.array([int(row[TARGET]) for row in rows], dtype=int)
if LogisticRegression is not None and train_test_split is not None:
    train_x, test_x, train_y, test_y = train_test_split(
        x,
        y,
        test_size=0.33,
        random_state=42,
        stratify=y if min(np.bincount(y)) >= 2 else None,
    )
    model = LogisticRegression(max_iter=1000, random_state=42, class_weight="balanced")
    model.fit(train_x, train_y)
    all_scores = model.predict_proba(x)[:, 1]
    test_scores = model.predict_proba(test_x)[:, 1]
    test_pred = (test_scores >= 0.5).astype(int)
    accuracy = round(float(accuracy_score(test_y, test_pred)), 4)
    try:
        roc_auc = round(float(roc_auc_score(test_y, test_scores)), 4)
    except ValueError:
        roc_auc = None
    coefficients = model.coef_[0]
    training_backend = "databricks_sklearn_logistic_regression"
else:
    train_x, test_x, train_y, test_y = manual_train_test_split(x, y)
    model = fit_numpy_logistic(train_x, train_y)
    all_scores = predict_numpy_logistic(model, x)
    test_scores = predict_numpy_logistic(model, test_x)
    test_pred = (test_scores >= 0.5).astype(int)
    accuracy = round(manual_accuracy(test_y, test_pred), 4)
    auc_value = manual_auc(test_y, test_scores)
    roc_auc = round(float(auc_value), 4) if auc_value is not None else None
    coefficients = model["coefficients"]
    training_backend = "databricks_numpy_logistic_regression_fallback"
trained_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
metric_honesty_warning = (
    "Synthetic labels may be deterministic or partially separable; treat metrics as a demo-data validation signal, not expected production performance."
    if accuracy >= 0.9 or (roc_auc is not None and roc_auc >= 0.9)
    else "Metrics are from a tiny deterministic synthetic demo set and are not expected production performance."
)

output_root = f"/tmp/happyco_property_ops_ml/{run_label}"
os.makedirs(output_root, exist_ok=True)
write_csv(os.path.join(output_root, "feature_table.csv"), rows, list(rows[0].keys()))

predictions = []
for row, row_values, score in zip(rows, x, all_scores):
    predictions.append({{
        "feature_row_id": row["feature_row_id"],
        "property_id": row["property_id"],
        "building_id": row["building_id"],
        "category": row["category"],
        "risk_score": round(float(score), 4),
        "risk_band": risk_band(float(score)),
        "top_drivers": json.dumps(top_drivers(row_values, coefficients)),
        "model_version": MODEL_VERSION,
        "trained_at": trained_at,
        "demo_mode": True,
        "data_source": "synthetic_demo",
        "caveat": DEMO_CAVEAT,
    }})
write_csv(
    os.path.join(output_root, "predictions.csv"),
    predictions,
    ["feature_row_id", "property_id", "building_id", "category", "risk_score", "risk_band", "top_drivers", "model_version", "trained_at", "demo_mode", "data_source", "caveat"],
)

importance = sorted(
    [
        {{"feature": feature, "coefficient": round(float(coef), 6), "importance": round(abs(float(coef)), 6)}}
        for feature, coef in zip(feature_names, coefficients)
    ],
    key=lambda item: item["importance"],
    reverse=True,
)
write_csv(os.path.join(output_root, "feature_importance.csv"), importance, ["feature", "coefficient", "importance"])

metrics = {{
    "model_name": MODEL_NAME,
    "model_version": MODEL_VERSION,
    "trained_at": trained_at,
    "total_rows": int(len(rows)),
    "positive_rows": int(y.sum()),
    "negative_rows": int(len(y) - y.sum()),
    "accuracy": accuracy,
    "roc_auc": roc_auc,
    "training_backend": training_backend,
    "metric_honesty_warning": metric_honesty_warning,
    "demo_mode": True,
    "data_source": "synthetic_demo",
    "caveat": DEMO_CAVEAT,
}}
with open(os.path.join(output_root, "model_metrics.json"), "w", encoding="utf-8") as handle:
    json.dump(metrics, handle, indent=2)

registry = {{
    "model_name": MODEL_NAME,
    "model_version": MODEL_VERSION,
    "trained_at": trained_at,
    "feature_table_version": "happyco-property-ops-v1",
    "metrics_path": f"driver:/tmp/happyco_property_ops_ml/{run_label}/model_metrics.json",
    "prediction_path": f"driver:/tmp/happyco_property_ops_ml/{run_label}/predictions.csv",
    "model_card_path": f"driver:/tmp/happyco_property_ops_ml/{run_label}/model_card.md",
    "deployment_status": "databricks_run_only",
    "caveat": DEMO_CAVEAT,
}}
with open(os.path.join(output_root, "model_registry_record.json"), "w", encoding="utf-8") as handle:
    json.dump(registry, handle, indent=2)
with open(os.path.join(output_root, "model_card.md"), "w", encoding="utf-8") as handle:
    handle.write("\\n".join([
        "# HappyCo Property Ops Predictive Maintenance Risk Model",
        "",
        "Synthetic demo model executed in Databricks. Not HappyCo production data.",
        "",
        f"- Accuracy: {{accuracy}}",
        f"- ROC AUC: {{roc_auc}}",
        f"- Honesty note: {{metric_honesty_warning}}",
        "",
        f"Allowed claim: {{CLAIM_ALLOWED}}",
        f"Not allowed: {{CLAIM_NOT_ALLOWED}}",
    ]))

finished_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
receipt = {{
    "demo_mode": True,
    "data_source": "synthetic_demo",
    "databricks_executed": True,
    "started_at": started_at,
    "finished_at": finished_at,
    "status": "completed",
    "output_paths": {{
        "feature_table": f"driver:/tmp/happyco_property_ops_ml/{run_label}/feature_table.csv",
        "predictions": f"driver:/tmp/happyco_property_ops_ml/{run_label}/predictions.csv",
        "model_metrics": f"driver:/tmp/happyco_property_ops_ml/{run_label}/model_metrics.json",
        "feature_importance": f"driver:/tmp/happyco_property_ops_ml/{run_label}/feature_importance.csv",
        "model_card": f"driver:/tmp/happyco_property_ops_ml/{run_label}/model_card.md",
        "model_registry_record": f"driver:/tmp/happyco_property_ops_ml/{run_label}/model_registry_record.json",
    }},
    "model_name": MODEL_NAME,
    "model_version": MODEL_VERSION,
    "metrics": metrics,
    "top_feature_importance": importance[:8],
    "caveat": DEMO_CAVEAT,
    "claim_allowed": CLAIM_ALLOWED,
    "claim_not_allowed": CLAIM_NOT_ALLOWED,
}}
dbutils.notebook.exit(json.dumps(receipt))
'''


def _extract_run_id(payload: dict[str, Any]) -> int | None:
    raw = payload.get("run_id") or payload.get("run", {}).get("run_id")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def _run_lifecycle_state(payload: dict[str, Any]) -> str | None:
    return payload.get("state", {}).get("life_cycle_state")


def _run_result_state(payload: dict[str, Any]) -> str | None:
    return payload.get("state", {}).get("result_state")


def _read_json_process(result: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    if result.stdout.strip():
        return json.loads(result.stdout)
    return {}


def check_databricks(
    *,
    out_dir: Path,
    run_label: str,
    profile: str | None,
    databricks_cli: str | None,
    execute: bool,
    node_type_id: str,
    spark_version: str,
    compute_mode: str,
    timeout_seconds: int,
) -> int:
    receipt = _base_receipt(run_label=run_label)
    receipt["started_at"] = _utc_now()

    cli_path = _databricks_cmd(databricks_cli)
    if not cli_path:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "not_configured",
                "status": "failed",
                "finished_at": _utc_now(),
                "command_attempted": "databricks --version",
                "error_category": "cli_not_found",
                "next_setup_step": (
                    "Install Databricks CLI, configure auth, then verify with "
                    "`databricks auth profiles` and `databricks current-user me`."
                ),
            }
        )
        return _write_attempt(out_dir, receipt, error_category="cli_not_found")

    version = _run([cli_path, "--version"])
    profiles = _run(_db_args(cli_path, profile, "auth", "profiles"))
    current_user = _run(_db_args(cli_path, profile, "current-user", "me", "--output", "json"))
    if version.returncode != 0 or profiles.returncode != 0 or current_user.returncode != 0:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "not_configured",
                "status": "failed",
                "finished_at": _utc_now(),
                "command_attempted": "databricks auth profiles; databricks current-user me",
                "databricks_version_stdout": _redact(version.stdout),
                "auth_profiles_stdout": _redact(profiles.stdout),
                "auth_profiles_stderr": _redact(profiles.stderr),
                "current_user_stdout": _redact(current_user.stdout),
                "current_user_stderr": _redact(current_user.stderr),
                "error_category": "auth_failed",
                "next_setup_step": (
                    "Set DATABRICKS_HOST and configure an auth method, then rerun "
                    "`databricks current-user me` before attempting the HappyCo ML run."
                ),
            }
        )
        return _write_attempt(out_dir, receipt, error_category="auth_failed")

    user_payload = _read_json_process(current_user)
    workspace_user = _mask_user(user_payload)
    if not execute:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "not_run",
                "status": "ready_for_job_submission",
                "finished_at": _utc_now(),
                "databricks_version_stdout": _redact(version.stdout),
                "workspace_user": workspace_user,
                "notebook_path": "generated from synthetic feature rows by scripts/happyco/run_databricks_ml.py",
                "next_setup_step": (
                    "Rerun with --execute to import a self-contained notebook, submit a one-time Databricks job, "
                    "and write databricks_run_receipt.json only after success."
                ),
            }
        )
        _write_json(out_dir / "databricks_run_attempt_receipt.json", receipt)
        print(json.dumps({"ok": True, "receipt": str(out_dir / "databricks_run_attempt_receipt.json"), "status": "ready_for_job_submission"}, indent=2))
        return 0

    feature_rows = property_ops_svc.ml_feature_rows()
    if not feature_rows:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "attempted_failed",
                "status": "failed",
                "finished_at": _utc_now(),
                "error_category": "missing_feature_rows",
                "next_setup_step": "Regenerate the deterministic HappyCo fixture and local ML feature table.",
            }
        )
        return _write_attempt(out_dir, receipt, error_category="missing_feature_rows")

    safe_label = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in run_label)
    notebook_path = f"/Users/{user_payload.get('userName')}/happyco_property_ops_ml_{safe_label}"
    work_dir = out_dir / "_work"
    work_dir.mkdir(parents=True, exist_ok=True)
    notebook_file = work_dir / "happyco_property_ops_ml_databricks.py"
    job_file = work_dir / "happyco_property_ops_ml_job.json"
    notebook_file.write_text(_notebook_source(feature_rows=feature_rows, run_label=run_label), encoding="utf-8")

    imported = _run(
        _db_args(
            cli_path,
            profile,
            "workspace",
            "import",
            notebook_path,
            "--file",
            str(notebook_file),
            "--format",
            "SOURCE",
            "--language",
            "PYTHON",
            "--overwrite",
        ),
        timeout=120,
    )
    if imported.returncode != 0:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "attempted_failed",
                "status": "failed",
                "finished_at": _utc_now(),
                "workspace_user": workspace_user,
                "notebook_path": notebook_path,
                "command_attempted": "databricks workspace import",
                "stderr": _redact(imported.stderr),
                "stdout": _redact(imported.stdout),
                "error_category": "workspace_import_failed",
                "next_setup_step": "Check workspace permissions for /Users/<current-user>/ notebook import.",
            }
        )
        return _write_attempt(out_dir, receipt, error_category="workspace_import_failed")

    task: dict[str, Any] = {
        "task_key": "train_happyco_property_ops_risk",
        "description": "Train synthetic HappyCo property ops maintenance risk model and return receipt.",
        "notebook_task": {"notebook_path": notebook_path},
        "timeout_seconds": timeout_seconds,
    }
    if compute_mode == "classic":
        task["new_cluster"] = {
            "spark_version": spark_version,
            "node_type_id": node_type_id,
            "num_workers": 0,
            "spark_conf": {
                "spark.databricks.cluster.profile": "singleNode",
                "spark.master": "local[*]",
            },
            "custom_tags": {
                "ResourceClass": "SingleNode",
                "purpose": "happyco-synthetic-ml-demo",
            },
        }

    job_payload = {
        "run_name": run_label,
        "tasks": [task],
        "timeout_seconds": timeout_seconds,
    }
    job_file.write_text(json.dumps(job_payload, indent=2), encoding="utf-8")
    submitted = _run(
        _db_args(cli_path, profile, "jobs", "submit", "--json", f"@{job_file}", "--no-wait", "--output", "json"),
        timeout=120,
    )
    if submitted.returncode != 0:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "attempted_failed",
                "status": "failed",
                "finished_at": _utc_now(),
                "workspace_user": workspace_user,
                "notebook_path": notebook_path,
                "command_attempted": "databricks jobs submit",
                "stderr": _redact(submitted.stderr),
                "stdout": _redact(submitted.stdout),
                "error_category": "job_submit_failed",
                "next_setup_step": "Check workspace job permissions, cluster policy, node type, and runtime availability.",
            }
        )
        return _write_attempt(out_dir, receipt, error_category="job_submit_failed")

    submit_payload = _read_json_process(submitted)
    run_id = _extract_run_id(submit_payload)
    if run_id is None:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "attempted_failed",
                "status": "failed",
                "finished_at": _utc_now(),
                "workspace_user": workspace_user,
                "notebook_path": notebook_path,
                "command_attempted": "databricks jobs submit",
                "stdout": _redact(submitted.stdout),
                "error_category": "run_id_missing",
                "next_setup_step": "Inspect the jobs submit response; the run ID was not present.",
            }
        )
        return _write_attempt(out_dir, receipt, error_category="run_id_missing")

    deadline = time.monotonic() + timeout_seconds + 900
    run_payload: dict[str, Any] = {}
    while time.monotonic() < deadline:
        run_result = _run(_db_args(cli_path, profile, "jobs", "get-run", str(run_id), "--output", "json"), timeout=60)
        if run_result.returncode != 0:
            receipt.update(
                {
                    "databricks_executed": False,
                    "databricks_status": "attempted_failed",
                    "status": "failed",
                    "finished_at": _utc_now(),
                    "workspace_user": workspace_user,
                    "run_id": run_id,
                    "notebook_path": notebook_path,
                    "command_attempted": "databricks jobs get-run",
                    "stderr": _redact(run_result.stderr),
                    "stdout": _redact(run_result.stdout),
                    "error_category": "run_poll_failed",
                    "next_setup_step": "Inspect the Databricks run manually and rerun the receipt collection.",
                }
            )
            return _write_attempt(out_dir, receipt, error_category="run_poll_failed")
        run_payload = _read_json_process(run_result)
        lifecycle = _run_lifecycle_state(run_payload)
        if lifecycle in {"TERMINATED", "SKIPPED", "INTERNAL_ERROR"}:
            break
        print(json.dumps({"run_id": run_id, "life_cycle_state": lifecycle}, indent=2))
        time.sleep(30)

    result_state = _run_result_state(run_payload)
    task_run_id = run_id
    tasks = run_payload.get("tasks") or []
    if tasks and isinstance(tasks, list):
        task_run_id = int(tasks[0].get("run_id") or run_id)
    if result_state != "SUCCESS":
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "attempted_failed",
                "status": "failed",
                "finished_at": _utc_now(),
                "workspace_user": workspace_user,
                "run_id": run_id,
                "run_page_url": run_payload.get("run_page_url"),
                "notebook_path": notebook_path,
                "lifecycle_state": _run_lifecycle_state(run_payload),
                "result_state": result_state,
                "state_message": run_payload.get("state", {}).get("state_message"),
                "error_category": "job_run_failed",
                "next_setup_step": "Open the run page and inspect cluster/job logs.",
            }
        )
        return _write_attempt(out_dir, receipt, error_category="job_run_failed")

    output_result = _run(_db_args(cli_path, profile, "jobs", "get-run-output", str(task_run_id), "--output", "json"), timeout=120)
    if output_result.returncode != 0:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "attempted_failed",
                "status": "failed",
                "finished_at": _utc_now(),
                "workspace_user": workspace_user,
                "run_id": run_id,
                "run_page_url": run_payload.get("run_page_url"),
                "notebook_path": notebook_path,
                "command_attempted": "databricks jobs get-run-output",
                "stderr": _redact(output_result.stderr),
                "stdout": _redact(output_result.stdout),
                "error_category": "run_output_failed",
                "next_setup_step": "Inspect the run output manually and verify notebook_output.result is available.",
            }
        )
        return _write_attempt(out_dir, receipt, error_category="run_output_failed")

    output_payload = _read_json_process(output_result)
    notebook_output = output_payload.get("notebook_output", {})
    result_text = notebook_output.get("result")
    if not result_text:
        receipt.update(
            {
                "databricks_executed": False,
                "databricks_status": "attempted_failed",
                "status": "failed",
                "finished_at": _utc_now(),
                "workspace_user": workspace_user,
                "run_id": run_id,
                "run_page_url": run_payload.get("run_page_url"),
                "notebook_path": notebook_path,
                "error_category": "notebook_result_missing",
                "next_setup_step": "Check that the notebook exits with dbutils.notebook.exit(json.dumps(receipt)).",
            }
        )
        return _write_attempt(out_dir, receipt, error_category="notebook_result_missing")

    completed = json.loads(result_text)
    completed.update(
        {
            "databricks_executed": True,
            "databricks_status": "completed",
            "status": "completed",
            "workspace_user": workspace_user,
            "job_id": run_payload.get("job_id"),
            "run_id": run_id,
            "task_run_id": task_run_id,
            "run_page_url": run_payload.get("run_page_url"),
            "notebook_path": notebook_path,
            "spark_version": spark_version,
            "node_type_id": node_type_id,
            "compute_mode": compute_mode,
        }
    )
    _write_json(out_dir / "databricks_run_receipt.json", completed)
    attempt = out_dir / "databricks_run_attempt_receipt.json"
    if attempt.exists():
        attempt.unlink()
    print(json.dumps({"ok": True, "receipt": str(out_dir / "databricks_run_receipt.json"), "run_id": run_id, "status": "completed"}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Check or execute the HappyCo synthetic ML run in Databricks.")
    parser.add_argument("--out", type=Path, default=Path("artifacts/happyco/databricks"))
    parser.add_argument("--run-label", default="happyco-property-ops-risk-databricks-v1")
    parser.add_argument("--profile", default=None, help="Databricks CLI profile, for example PaulMain.")
    parser.add_argument("--databricks-cli", default=None, help="Explicit path to databricks executable.")
    parser.add_argument("--execute", action="store_true", help="Import the notebook and submit a one-time Databricks job.")
    parser.add_argument("--node-type-id", default="m5.large")
    parser.add_argument("--spark-version", default="16.4.x-cpu-ml-scala2.12")
    parser.add_argument("--compute-mode", choices=["serverless", "classic"], default="serverless")
    parser.add_argument("--timeout-seconds", type=int, default=2400)
    args = parser.parse_args()
    return check_databricks(
        out_dir=args.out,
        run_label=args.run_label,
        profile=args.profile,
        databricks_cli=args.databricks_cli,
        execute=args.execute,
        node_type_id=args.node_type_id,
        spark_version=args.spark_version,
        compute_mode=args.compute_mode,
        timeout_seconds=args.timeout_seconds,
    )


if __name__ == "__main__":
    raise SystemExit(main())
