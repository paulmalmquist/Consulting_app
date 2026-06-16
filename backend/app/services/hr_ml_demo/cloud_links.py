"""Provider abstraction for external (cloud) detail links + lineage.

Builds deep links to GCP (BigQuery / GCS / Vertex / Cloud Logging) or Databricks
(Unity Catalog / notebook / job / MLflow) from a `ResourceRef`, based on the
active provider config. NEVER fabricates a URL: when config is incomplete or the
provider is "none", `href` is null with an `unavailableReason`, but a copyable
identifier is always returned. Never raises.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .cloud_config import provider_config
from .schema import MODEL_VERSION

# Link types each provider can produce, for the UI's capability hints.
_GCP_LINK_TYPES = ["table", "view", "query", "job", "model", "model_run", "storage_object", "lineage"]
_DATABRICKS_LINK_TYPES = ["table", "view", "notebook", "job", "model", "model_run", "lineage"]


@dataclass
class ResourceRef:
    resource_type: str  # table|view|query|job|model|model_run|storage_object|notebook|lineage
    name: str
    project: str | None = None
    dataset: str | None = None
    catalog: str | None = None
    schema: str | None = None
    table: str | None = None
    job_id: str | None = None
    run_id: str | None = None
    notebook_path: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    storage_path: str | None = None


def _link(provider: str, label: str, resource_type: str, href: str | None,
          copy_value: str | None, reason: str | None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "provider": provider,
        "label": label,
        "resourceType": resource_type,
        "href": href,
    }
    if copy_value:
        out["copyValue"] = copy_value
    if href is None and reason:
        out["unavailableReason"] = reason
    return out


def _gcp_links(ref: ResourceRef, cfg: dict[str, str]) -> list[dict[str, Any]]:
    project = ref.project or cfg.get("gcp_project_id")
    dataset = ref.dataset or cfg.get("bigquery_dataset")
    region = cfg.get("gcp_region") or "US"
    incomplete = "GCP project not configured (set ML_DEMO_GCP_PROJECT_ID)."

    rt = ref.resource_type
    if rt in ("table", "view"):
        copy = ".".join([p for p in (project, dataset, ref.table or ref.name) if p])
        if not project:
            return [_link("gcp", "Open feature table in BigQuery", rt, None, copy, incomplete)]
        href = (
            f"https://console.cloud.google.com/bigquery?project={project}"
            f"&ws=!1m5!1m4!4m3!1s{project}!2s{dataset}!3s{ref.table or ref.name}"
        )
        return [_link("gcp", "Open feature table in BigQuery", rt, href, copy, None)]
    if rt == "query":
        copy = ref.name
        if not (project and ref.job_id):
            return [_link("gcp", "Open query in BigQuery", rt, None, copy,
                          "BigQuery job id not available.")]
        href = f"https://console.cloud.google.com/bigquery?project={project}&j=bq:{region}:{ref.job_id}&page=queryresults"
        return [_link("gcp", "Open query in BigQuery", rt, href, copy, None)]
    if rt in ("model", "model_run"):
        copy = ref.model_name or ref.name
        if not project:
            return [_link("gcp", "Open model in Vertex AI", rt, None, copy, incomplete)]
        href = f"https://console.cloud.google.com/vertex-ai/models?project={project}"
        return [_link("gcp", "Open model in Vertex AI", rt, href, copy, None)]
    if rt == "storage_object":
        path = ref.storage_path or ref.name
        bucket = cfg.get("gcs_bucket")
        copy = f"gs://{bucket}/{path}" if bucket else path
        if not bucket:
            return [_link("gcp", "Open artifact in Cloud Storage", rt, None, copy,
                          "GCS bucket not configured (set ML_DEMO_GCS_BUCKET).")]
        href = f"https://console.cloud.google.com/storage/browser/_details/{bucket}/{path}"
        return [_link("gcp", "Open artifact in Cloud Storage", rt, href, copy, None)]
    if rt == "lineage":
        copy = ref.name
        if not project:
            return [_link("gcp", "Open run logs in Cloud Logging", rt, None, copy, incomplete)]
        href = f"https://console.cloud.google.com/logs/query?project={project}"
        return [_link("gcp", "Open run logs in Cloud Logging", rt, href, copy, None)]
    return [_link("gcp", f"Open {rt} in GCP", rt, None, ref.name, "Unsupported resource type.")]


def _databricks_links(ref: ResourceRef, cfg: dict[str, str]) -> list[dict[str, Any]]:
    ws = (cfg.get("databricks_workspace_url") or "").rstrip("/")
    catalog = ref.catalog or cfg.get("databricks_catalog")
    schema = ref.schema or cfg.get("databricks_schema")
    incomplete = "Databricks workspace not configured (set ML_DEMO_DATABRICKS_WORKSPACE_URL)."

    rt = ref.resource_type
    if rt in ("table", "view"):
        copy = ".".join([p for p in (catalog, schema, ref.table or ref.name) if p])
        if not (ws and catalog and schema):
            return [_link("databricks", "Open feature table in Databricks", rt, None, copy, incomplete)]
        href = f"{ws}/explore/data/{catalog}/{schema}/{ref.table or ref.name}"
        return [_link("databricks", "Open feature table in Databricks", rt, href, copy, None)]
    if rt == "notebook":
        copy = ref.notebook_path or ref.name
        if not (ws and ref.notebook_path):
            return [_link("databricks", "Open training notebook", rt, None, copy, incomplete)]
        href = f"{ws}/#workspace{ref.notebook_path}"
        return [_link("databricks", "Open training notebook", rt, href, copy, None)]
    if rt == "job":
        copy = ref.job_id or ref.name
        if not (ws and ref.job_id):
            return [_link("databricks", "Open training job", rt, None, copy, incomplete)]
        href = f"{ws}/#job/{ref.job_id}"
        return [_link("databricks", "Open training job", rt, href, copy, None)]
    if rt in ("model", "model_run"):
        copy = ref.run_id or ref.model_name or ref.name
        if not ws:
            return [_link("databricks", "Open MLflow run", rt, None, copy, incomplete)]
        href = (f"{ws}/#mlflow/runs/{ref.run_id}" if ref.run_id
                else f"{ws}/#mlflow/models/{ref.model_name or ref.name}")
        return [_link("databricks", "Open MLflow run", rt, href, copy, None)]
    if rt == "lineage":
        copy = ref.name
        if not ws:
            return [_link("databricks", "Open lineage", rt, None, copy, incomplete)]
        return [_link("databricks", "Open lineage", rt, f"{ws}/explore/data", copy, None)]
    return [_link("databricks", f"Open {rt} in Databricks", rt, None, ref.name, "Unsupported resource type.")]


def _none_links(ref: ResourceRef) -> list[dict[str, Any]]:
    copy = ref.table or ref.model_name or ref.storage_path or ref.name
    return [_link("none", "External detail link not configured", ref.resource_type, None, copy,
                  "Local demo only — no cloud provider configured.")]


def build_external_links(ref: ResourceRef, cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """Return provider-specific links for a resource. Never raises; never fabricates."""
    cfg = cfg or provider_config()
    provider = cfg.get("provider", "none")
    try:
        if provider == "gcp":
            return _gcp_links(ref, cfg)
        if provider == "databricks":
            return _databricks_links(ref, cfg)
        return _none_links(ref)
    except Exception:  # noqa: BLE001 — links are evidence, never break the page
        return _none_links(ref)


def model_links(algorithm_id: str, cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
    cfg = cfg or provider_config()
    refs = [
        ResourceRef(
            resource_type="table",
            name="ml_algorithm_demo_observations",
            dataset=cfg.get("bigquery_dataset"),
            table="ml_algorithm_demo_observations",
        ),
        ResourceRef(
            resource_type="model_run",
            name=algorithm_id,
            model_name=algorithm_id,
            model_version=MODEL_VERSION,
            run_id=f"{algorithm_id}-{MODEL_VERSION}",
        ),
        ResourceRef(
            resource_type="storage_object",
            name=f"model_cards/{algorithm_id}.json",
            storage_path=f"ml-demo/model_cards/{algorithm_id}.json",
        ),
    ]
    out: list[dict[str, Any]] = []
    for r in refs:
        out.extend(build_external_links(r, cfg))
    return out


def build_lineage(algorithm_id: str, cfg: dict[str, str] | None = None) -> dict[str, Any]:
    cfg = cfg or provider_config()
    dataset = cfg.get("bigquery_dataset")
    source_table = ResourceRef(
        resource_type="table",
        name=f"{dataset}.ml_algorithm_demo_observations",
        dataset=dataset,
        table="ml_algorithm_demo_observations",
    )
    eval_table = ResourceRef(
        resource_type="table",
        name=f"{dataset}.ml_algorithm_demo_eval",
        dataset=dataset,
        table="ml_algorithm_demo_eval",
    )
    model_ref = ResourceRef(
        resource_type="model_run", name=algorithm_id, model_name=algorithm_id,
        model_version=MODEL_VERSION, run_id=f"{algorithm_id}-{MODEL_VERSION}",
    )
    return {
        "source_tables": [
            {
                "name": source_table.name,
                "grain": "one row per synthetic observation/date",
                "freshness": "deterministic (seed=42)",
                "external_links": build_external_links(source_table, cfg),
            },
            {
                "name": eval_table.name,
                "grain": "one row per algorithm metric",
                "freshness": "regenerated on materialize",
                "external_links": build_external_links(eval_table, cfg),
            },
        ],
        "transform_steps": [
            {"name": "feature_normalization", "type": "python_service",
             "description": "StandardScaler on training-window statistics."},
            {"name": "train_test_split", "type": "model_eval",
             "description": "Deterministic split (random_state=42); split mode set by Reality Mode."},
        ],
        "model_artifacts": [
            {
                "name": algorithm_id,
                "version": MODEL_VERSION,
                "external_links": build_external_links(model_ref, cfg),
            }
        ],
    }


def public_cloud_config() -> dict[str, Any]:
    """Non-secret view of the active provider for the page header."""
    cfg = provider_config()
    provider = cfg["provider"]
    link_types = (
        _GCP_LINK_TYPES if provider == "gcp"
        else _DATABRICKS_LINK_TYPES if provider == "databricks"
        else []
    )
    return {
        "provider": provider,
        "label": {
            "gcp": "Cloud detail mode: GCP",
            "databricks": "Cloud detail mode: Databricks",
        }.get(provider, "Cloud detail mode: Local demo only"),
        "available_link_types": link_types,
        "bigquery_dataset": cfg.get("bigquery_dataset") if provider == "gcp" else None,
        "gcp_project_id": cfg.get("gcp_project_id") if provider == "gcp" else None,
        "databricks_workspace_url": cfg.get("databricks_workspace_url") if provider == "databricks" else None,
        "configured": (
            bool(cfg.get("gcp_project_id")) if provider == "gcp"
            else bool(cfg.get("databricks_workspace_url")) if provider == "databricks"
            else False
        ),
    }
