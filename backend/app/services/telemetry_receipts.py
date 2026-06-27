"""Model Workbench receipt loader (Part I.1) — read-only, fail-closed, serving-light.

The Workbench *replays* committed receipt artifacts; it NEVER triggers live compute. Each receipt is a
committed JSON file under ``app/data/telemetry/`` carrying a strict provenance header plus a payload
body. Real receipts are produced offline by the GCP MLOps pipeline (Part II) and committed verbatim.
Until a real receipt lands, the loader fails closed with ``null_reason='gcp_receipt_not_generated_yet'``
— it never fabricates values and never imports heavy ML deps (no pyspark / mlflow / sklearn / aiplatform).

Receipt file shape on disk:

    { <header fields...>, "null_reason": <str|null>, "payload": <object|array|null> }

The header fields are normalized (missing → ``None``) so every response carries the full contract.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_RECEIPT_DIR = Path(__file__).resolve().parent.parent / "data" / "telemetry"

# kind -> committed filename. These five are the Model Workbench receipt contract (Part I.1).
RECEIPT_FILES: dict[str, str] = {
    "experiment_runs": "experiment_runs.json",
    "feature_manifest": "feature_manifest.json",
    "threshold_sweep": "threshold_sweep.json",
    "error_review": "error_review.json",
    "promotion_review": "promotion_review.json",
    "parity": "parity_receipt.json",
}

# Strict provenance header every receipt carries. Missing keys normalize to None — never fabricated.
_HEADER_FIELDS = (
    "provider",               # databricks | vertex | local_fixture | None
    "source_bigquery_table",
    "vertex_experiment",
    "vertex_run_id",
    "vertex_model_id",
    "gcs_artifact_uri",
    "created_at",
    "code_version",
    "data_manifest_sha",
    "rows_evaluated",
)

_NOT_GENERATED = "gcp_receipt_not_generated_yet"


def _empty_header() -> dict[str, Any]:
    return {k: None for k in _HEADER_FIELDS}


def _fail_closed(kind: str, reason: str) -> dict[str, Any]:
    return {
        "kind": kind,
        **_empty_header(),
        "payload": None,
        "fallback_used": True,
        "null_reason": reason,
    }


def load_receipt(kind: str, *, base_dir: Path | None = None) -> dict[str, Any]:
    """Load one committed receipt, fail-closed.

    Raises ``ValueError`` on an unknown kind (programmer error). Otherwise NEVER raises: an absent or
    unreadable file returns a ``null_reason`` envelope so the route stays at HTTP 200 and the UI shows
    the honest "receipt not generated yet" state instead of a fabricated value or a 500.
    """
    if kind not in RECEIPT_FILES:
        raise ValueError(f"unknown receipt kind: {kind!r}")
    directory = base_dir or _RECEIPT_DIR
    path = directory / RECEIPT_FILES[kind]
    if not path.exists():
        return _fail_closed(kind, _NOT_GENERATED)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return _fail_closed(kind, "receipt_unreadable")
    if not isinstance(raw, dict):
        return _fail_closed(kind, "receipt_malformed")

    header = _empty_header()
    for k in _HEADER_FIELDS:
        if raw.get(k) is not None:
            header[k] = raw[k]
    return {
        "kind": kind,
        **header,
        "payload": raw.get("payload"),
        "fallback_used": False,
        "null_reason": raw.get("null_reason"),
    }
