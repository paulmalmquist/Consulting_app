"""Model Workbench receipt loader (Part I.1) — read-only, fail-closed, serving-light.

WHAT THIS FILE DOES (in plain language)
    Reads pre-computed "receipts" off disk and hands them to the UI. A "receipt" here = a
    committed, provenance-stamped JSON record of what an OFFLINE machine-learning run already
    produced (a training run, a threshold sweep, a data-quality study, etc.). The app does NOT
    re-run any ML to show these numbers — it just replays the saved record. If the receipt for a
    given panel hasn't been generated yet, this loader returns an honest "not generated yet" state
    instead of inventing a number.

WHERE YOU SEE THIS
    * Model Workbench page panels (experiment runs, threshold sweep, parity, promotion review,
      drift, embeddings, SHAP).
    * Relativity MES Build Analytics page — the Multi-Seed Stability and Chaos/Data-Quality
      panels (the mes_* receipts below).
    A missing receipt here is exactly why one of those panels shows "receipt not generated yet".

INPUTS -> OUTPUT
    INPUT:  a receipt "kind" (one of RECEIPT_FILES below) -> names which committed file to read.
    OUTPUT: a dict with the full provenance header + the payload, OR a fail-closed envelope whose
            null_reason explains why there's no data (file absent / unreadable / malformed).

HOW TO READ IT
    * receipt = a committed, signed-by-provenance snapshot of a past offline run's results, so the
      UI can show real history without recomputing anything live.
    * provenance header = the strict "where did this come from" block on every receipt (which
      provider produced it, the Vertex run id, when, the data fingerprint, etc. — see
      _HEADER_FIELDS). It's what makes the displayed numbers auditable/trustworthy.
    * fail-closed = on any problem, return null_reason (HTTP stays 200) rather than a fake value
      or a 500. The loader also imports zero heavy ML libraries, so it's cheap and safe to call.

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

# The catalog of valid receipts: each "kind" the UI can ask for maps to the committed file that
# holds it. Asking for any kind not in this map is treated as a programmer error (see load_receipt).
# The first block feeds Model Workbench panels; the mes_* block feeds MES Build Analytics panels.
# kind -> committed filename. These five are the Model Workbench receipt contract (Part I.1).
RECEIPT_FILES: dict[str, str] = {
    "experiment_runs": "experiment_runs.json",
    "feature_manifest": "feature_manifest.json",
    "threshold_sweep": "threshold_sweep.json",
    "error_review": "error_review.json",
    "promotion_review": "promotion_review.json",
    "parity": "parity_receipt.json",
    "drift_features": "drift_feature_stats.json",
    "embedding_projection": "embedding_projection.json",
    "factory_local_shap": "factory_local_shap.json",
    # Relativity MES Build Analytics (Phase 10 hardening) — offline pure-Python study receipts. Same
    # fail-closed contract; provider=local_fixture (no Databricks/BigQuery/Vertex in this path).
    "mes_scenario_manifest": "mes_scenario_manifest.json",
    "mes_seed_stability": "mes_seed_stability.json",
    "mes_data_quality": "mes_data_quality.json",
}

# The "where did this come from" block stamped on every receipt — this is what makes a displayed
# number auditable. Each field answers one trust question (who produced it, which run, when, against
# what data fingerprint). If a field is absent it's set to None, never guessed.
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


# A blank provenance header (all fields None) — the starting point we fill in from a real receipt.
def _empty_header() -> dict[str, Any]:
    return {k: None for k in _HEADER_FIELDS}


# Build the honest "no data" envelope. fallback_used=True + a null_reason tell the UI to show the
# explained empty state. -> this is the shape a panel receives when its receipt isn't generated yet.
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
    # An unknown kind means the caller asked for something not in our catalog — that's a bug, so
    # raise loudly. (Everything below this point fails SOFT, never raising.)
    if kind not in RECEIPT_FILES:
        raise ValueError(f"unknown receipt kind: {kind!r}")
    directory = base_dir or _RECEIPT_DIR
    path = directory / RECEIPT_FILES[kind]
    # No file on disk = the offline run hasn't produced this receipt yet -> panel shows
    # "not generated yet" rather than a number.
    if not path.exists():
        return _fail_closed(kind, _NOT_GENERATED)
    # File exists but won't parse as JSON / can't be read -> honest "unreadable" empty state.
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return _fail_closed(kind, "receipt_unreadable")
    # File parsed but isn't the expected object shape -> honest "malformed" empty state.
    if not isinstance(raw, dict):
        return _fail_closed(kind, "receipt_malformed")

    # Good receipt: copy through only the provenance fields that are actually present (absent ones
    # stay None) so the response always carries the complete, auditable header contract.
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
