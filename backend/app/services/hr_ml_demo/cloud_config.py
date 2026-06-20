"""Cloud provider configuration for ML Algorithm Decision Lab detail links.

Self-contained, flat ``os.getenv`` (mirrors ``app/events/config.py``). All empty
by default → provider "none" → the UI shows "Local demo only" and disabled
links with copyable identifiers. GCP is the real, materializable provider;
Databricks links are config-ready (resolve only when a workspace is set).
"""

from __future__ import annotations

import os


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


# gcp | databricks | none
ML_DEMO_CLOUD_PROVIDER: str = (os.getenv("ML_DEMO_CLOUD_PROVIDER", "none") or "none").strip().lower()

# ── GCP ───────────────────────────────────────────────────────────────────────
ML_DEMO_GCP_PROJECT_ID: str = _clean(os.getenv("ML_DEMO_GCP_PROJECT_ID", "")) or _clean(os.getenv("BQ_PROJECT_ID", ""))
ML_DEMO_GCP_REGION: str = _clean(os.getenv("ML_DEMO_GCP_REGION", "")) or "US"
ML_DEMO_BIGQUERY_DATASET: str = _clean(os.getenv("ML_DEMO_BIGQUERY_DATASET", "")) or "winston_ml_demo"
ML_DEMO_GCS_BUCKET: str = _clean(os.getenv("ML_DEMO_GCS_BUCKET", ""))

# ── Databricks (config-ready; stub provider) ──────────────────────────────────
ML_DEMO_DATABRICKS_WORKSPACE_URL: str = _clean(os.getenv("ML_DEMO_DATABRICKS_WORKSPACE_URL", ""))
ML_DEMO_DATABRICKS_CATALOG: str = _clean(os.getenv("ML_DEMO_DATABRICKS_CATALOG", ""))
ML_DEMO_DATABRICKS_SCHEMA: str = _clean(os.getenv("ML_DEMO_DATABRICKS_SCHEMA", ""))
ML_DEMO_MLFLOW_TRACKING_URI: str = _clean(os.getenv("ML_DEMO_MLFLOW_TRACKING_URI", ""))


def provider_config() -> dict[str, str]:
    """Snapshot of the active config (read fresh so tests can monkeypatch env)."""
    return {
        "provider": (os.getenv("ML_DEMO_CLOUD_PROVIDER", "none") or "none").strip().lower(),
        "gcp_project_id": _clean(os.getenv("ML_DEMO_GCP_PROJECT_ID", "")) or _clean(os.getenv("BQ_PROJECT_ID", "")),
        "gcp_region": _clean(os.getenv("ML_DEMO_GCP_REGION", "")) or "US",
        "bigquery_dataset": _clean(os.getenv("ML_DEMO_BIGQUERY_DATASET", "")) or "winston_ml_demo",
        "gcs_bucket": _clean(os.getenv("ML_DEMO_GCS_BUCKET", "")),
        "databricks_workspace_url": _clean(os.getenv("ML_DEMO_DATABRICKS_WORKSPACE_URL", "")),
        "databricks_catalog": _clean(os.getenv("ML_DEMO_DATABRICKS_CATALOG", "")),
        "databricks_schema": _clean(os.getenv("ML_DEMO_DATABRICKS_SCHEMA", "")),
    }
