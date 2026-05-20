from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def check_databricks(*, out_dir: Path, run_label: str) -> int:
    receipt = _base_receipt(run_label=run_label)
    receipt["started_at"] = _utc_now()

    cli_path = shutil.which("databricks")
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
        _write_json(out_dir / "databricks_run_attempt_receipt.json", receipt)
        print(json.dumps({"ok": False, "receipt": str(out_dir / "databricks_run_attempt_receipt.json"), "error_category": "cli_not_found"}, indent=2))
        return 2

    version = _run(["databricks", "--version"])
    profiles = _run(["databricks", "auth", "profiles"])
    current_user = _run(["databricks", "current-user", "me"])
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
        _write_json(out_dir / "databricks_run_attempt_receipt.json", receipt)
        print(json.dumps({"ok": False, "receipt": str(out_dir / "databricks_run_attempt_receipt.json"), "error_category": "auth_failed"}, indent=2))
        return 3

    receipt.update(
        {
            "databricks_executed": False,
            "databricks_status": "not_run",
            "status": "ready_for_manual_job_run",
            "finished_at": _utc_now(),
            "databricks_version_stdout": _redact(version.stdout),
            "workspace_user": _redact(current_user.stdout),
            "notebook_path": "notebooks/happyco_property_ops_ml.py",
            "output_paths": {
                "local_expected": [
                    "artifacts/happyco/ml/feature_table.csv",
                    "artifacts/happyco/ml/predictions.csv",
                    "artifacts/happyco/ml/model_metrics.json",
                    "artifacts/happyco/ml/feature_importance.csv",
                    "artifacts/happyco/ml/model_card.md",
                    "artifacts/happyco/ml/model_registry_record.json",
                ]
            },
            "next_setup_step": (
                "Create/run a Databricks notebook or job from notebooks/happyco_property_ops_ml.py, "
                "export outputs, then replace this attempt receipt with databricks_run_receipt.json."
            ),
        }
    )
    _write_json(out_dir / "databricks_run_attempt_receipt.json", receipt)
    print(json.dumps({"ok": True, "receipt": str(out_dir / "databricks_run_attempt_receipt.json"), "status": "ready_for_manual_job_run"}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Databricks readiness and write a HappyCo ML run receipt.")
    parser.add_argument("--out", type=Path, default=Path("artifacts/happyco/databricks"))
    parser.add_argument("--run-label", default="happyco-property-ops-risk-databricks-v1")
    args = parser.parse_args()
    return check_databricks(out_dir=args.out, run_label=args.run_label)


if __name__ == "__main__":
    raise SystemExit(main())
