"""Materialize the deterministic ML demo dataset + results to GCP.

Writes three BigQuery tables (observations, predictions, eval) and exports model
cards to GCS, so the GCP detail links resolve to real resources. Idempotent:
re-running with the same seed/model_version replaces the rows. Requires the GCP
provider to be configured with credentials; otherwise returns a structured
"skipped" result (never raises for missing config).

This is an offline/admin job (see scripts/ml_demo_materialize.py), not part of
the request path — the runtime lab uses the in-memory dataset.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .cloud_config import provider_config
from .dataset import generate_dataset
from .registry import ALGORITHM_DEMOS
from .runner import run_algorithm
from .schema import MODEL_VERSION, SEED

logger = logging.getLogger(__name__)

_OBS_TABLE = "ml_algorithm_demo_observations"
_PRED_TABLE = "ml_algorithm_demo_predictions"
_EVAL_TABLE = "ml_algorithm_demo_eval"


def _skipped(reason: str) -> dict[str, Any]:
    return {"status": "skipped", "reason": reason, "tables": [], "objects": []}


def materialize(dry_run: bool = False) -> dict[str, Any]:
    """Export dataset + per-algorithm eval to BigQuery/GCS. Fail-soft."""
    cfg = provider_config()
    if cfg["provider"] != "gcp":
        return _skipped(f"provider is '{cfg['provider']}', expected 'gcp'")
    project = cfg.get("gcp_project_id")
    dataset = cfg.get("bigquery_dataset")
    if not project:
        return _skipped("ML_DEMO_GCP_PROJECT_ID not set")

    df = generate_dataset(SEED)
    obs_rows = json.loads(df.drop(columns=[c for c in ("has_anchor", "is_crisis_anchor") if c in df.columns]).to_json(orient="records"))

    eval_rows: list[dict[str, Any]] = []
    pred_rows: list[dict[str, Any]] = []
    for demo in ALGORITHM_DEMOS:
        res = run_algorithm(demo["id"])
        eval_rows.append(
            {
                "algorithm_id": res["algorithm_id"],
                "task_type": res.get("task_type"),
                "status": res.get("status"),
                "model_version": MODEL_VERSION,
                "seed": SEED,
                "metrics_json": json.dumps(res.get("metrics", {})),
            }
        )
        for point in res.get("charts", {}).get("actual_vs_predicted", []) or []:
            pred_rows.append({"algorithm_id": res["algorithm_id"], **point})

    plan = {
        "status": "planned" if dry_run else "materialized",
        "project": project,
        "dataset": dataset,
        "tables": [
            {"name": f"{project}.{dataset}.{_OBS_TABLE}", "rows": len(obs_rows)},
            {"name": f"{project}.{dataset}.{_PRED_TABLE}", "rows": len(pred_rows)},
            {"name": f"{project}.{dataset}.{_EVAL_TABLE}", "rows": len(eval_rows)},
        ],
        "objects": [f"gs://{cfg.get('gcs_bucket')}/ml-demo/model_cards/{d['id']}.json" for d in ALGORITHM_DEMOS],
    }
    if dry_run:
        return plan

    try:
        from google.cloud import bigquery  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        return _skipped(f"google-cloud-bigquery unavailable: {exc}")

    try:
        client = bigquery.Client(project=project)
        client.create_dataset(bigquery.Dataset(f"{project}.{dataset}"), exists_ok=True)
        _replace_table(client, project, dataset, _OBS_TABLE, obs_rows)
        _replace_table(client, project, dataset, _EVAL_TABLE, eval_rows)
        _replace_table(client, project, dataset, _PRED_TABLE, pred_rows)
        _export_model_cards(cfg)
    except Exception as exc:  # noqa: BLE001 — never raise for cloud failures
        logger.exception("ml-demo materialize failed")
        return _skipped(f"bigquery write failed: {exc}")

    return plan


def _replace_table(client: Any, project: str, dataset: str, table: str, rows: list[dict[str, Any]]) -> None:
    from google.cloud import bigquery  # noqa: PLC0415

    table_id = f"{project}.{dataset}.{table}"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
    )
    job = client.load_table_from_json(rows or [{}], table_id, job_config=job_config)
    job.result()


def _export_model_cards(cfg: dict[str, str]) -> None:
    bucket = cfg.get("gcs_bucket")
    if not bucket:
        return
    try:
        from google.cloud import storage  # noqa: PLC0415
    except Exception:
        return
    client = storage.Client(project=cfg.get("gcp_project_id"))
    b = client.bucket(bucket)
    for demo in ALGORITHM_DEMOS:
        blob = b.blob(f"ml-demo/model_cards/{demo['id']}.json")
        blob.upload_from_string(
            json.dumps({"id": demo["id"], "model_card": demo["model_card"]}, indent=2),
            content_type="application/json",
        )
