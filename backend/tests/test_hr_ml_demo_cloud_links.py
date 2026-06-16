"""Tests for the cloud link builder + lineage (provider abstraction).

Verifies GCP, Databricks, none, and incomplete-config behavior. The rule under
test: never fabricate a URL; always return a copyable identifier; never raise.
"""

from __future__ import annotations

import pytest

from app.services.hr_ml_demo.cloud_links import (
    ResourceRef,
    build_external_links,
    build_lineage,
    model_links,
    public_cloud_config,
)


def _set_gcp(monkeypatch, project="winston-prod", bucket="winston-ml"):
    monkeypatch.setenv("ML_DEMO_CLOUD_PROVIDER", "gcp")
    monkeypatch.setenv("ML_DEMO_GCP_PROJECT_ID", project)
    monkeypatch.setenv("ML_DEMO_BIGQUERY_DATASET", "winston_ml_demo")
    if bucket:
        monkeypatch.setenv("ML_DEMO_GCS_BUCKET", bucket)
    else:
        monkeypatch.delenv("ML_DEMO_GCS_BUCKET", raising=False)


def _set_databricks(monkeypatch, ws="https://dbc-x.cloud.databricks.com"):
    monkeypatch.setenv("ML_DEMO_CLOUD_PROVIDER", "databricks")
    if ws:
        monkeypatch.setenv("ML_DEMO_DATABRICKS_WORKSPACE_URL", ws)
    else:
        monkeypatch.delenv("ML_DEMO_DATABRICKS_WORKSPACE_URL", raising=False)
    monkeypatch.setenv("ML_DEMO_DATABRICKS_CATALOG", "main")
    monkeypatch.setenv("ML_DEMO_DATABRICKS_SCHEMA", "ml_demo")


def _set_none(monkeypatch):
    monkeypatch.setenv("ML_DEMO_CLOUD_PROVIDER", "none")


def test_gcp_table_link_resolves(monkeypatch):
    _set_gcp(monkeypatch)
    ref = ResourceRef(resource_type="table", name="obs", table="ml_algorithm_demo_observations")
    links = build_external_links(ref)
    link = links[0]
    assert link["provider"] == "gcp"
    assert link["href"] and "console.cloud.google.com/bigquery" in link["href"]
    assert link["copyValue"].startswith("winston-prod.winston_ml_demo.")


def test_gcp_storage_requires_bucket(monkeypatch):
    _set_gcp(monkeypatch, bucket=None)
    ref = ResourceRef(resource_type="storage_object", name="card", storage_path="ml-demo/x.json")
    link = build_external_links(ref)[0]
    assert link["href"] is None
    assert "bucket" in link["unavailableReason"].lower()
    assert "copyValue" in link  # identifier still present


def test_databricks_table_link_resolves(monkeypatch):
    _set_databricks(monkeypatch)
    ref = ResourceRef(resource_type="table", name="obs", table="observations")
    link = build_external_links(ref)[0]
    assert link["provider"] == "databricks"
    assert link["href"] and "databricks.com" in link["href"]
    assert link["copyValue"] == "main.ml_demo.observations"


def test_databricks_incomplete_config(monkeypatch):
    _set_databricks(monkeypatch, ws=None)
    ref = ResourceRef(resource_type="table", name="obs", table="observations")
    link = build_external_links(ref)[0]
    assert link["href"] is None
    assert link["unavailableReason"]
    assert link["copyValue"]  # copyable id even when disabled


def test_none_provider(monkeypatch):
    _set_none(monkeypatch)
    ref = ResourceRef(resource_type="table", name="obs", table="observations")
    link = build_external_links(ref)[0]
    assert link["provider"] == "none"
    assert link["href"] is None
    assert "Local demo only" in link["unavailableReason"]
    assert link["copyValue"] == "observations"


def test_model_links_and_lineage_shape(monkeypatch):
    _set_gcp(monkeypatch)
    links = model_links("random_forest")
    assert len(links) >= 2
    lineage = build_lineage("random_forest")
    assert lineage["source_tables"] and lineage["model_artifacts"]
    assert lineage["model_artifacts"][0]["version"] == "ml-demo-v1"
    assert lineage["model_artifacts"][0]["external_links"]


def test_public_cloud_config_modes(monkeypatch):
    _set_gcp(monkeypatch)
    cfg = public_cloud_config()
    assert cfg["provider"] == "gcp"
    assert cfg["configured"] is True
    assert "table" in cfg["available_link_types"]

    _set_none(monkeypatch)
    cfg = public_cloud_config()
    assert cfg["provider"] == "none"
    assert cfg["available_link_types"] == []
    assert "Local demo only" in cfg["label"]


def test_never_raises_on_garbage(monkeypatch):
    _set_gcp(monkeypatch)
    ref = ResourceRef(resource_type="totally_unknown", name="x")
    links = build_external_links(ref)
    assert links and links[0]["href"] is None
