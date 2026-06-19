"""API contract tests for the ML Algorithm Decision Lab routes.

Uses the conftest `client` TestClient fixture. These routes touch no DB, so no
FakeCursor is needed. Every endpoint must return HTTP 200 (fail-closed).
"""

from __future__ import annotations

ENVELOPE_KEYS = {
    "algorithm_id",
    "name",
    "status",
    "null_reason",
    "task_type",
    "business_question",
    "dataset",
    "metrics",
    "charts",
    "model_card",
    "evidence",
    "external_links",
    "lineage",
}


def test_overview(client):
    r = client.get("/api/hr/v1/ml-demo/overview")
    assert r.status_code == 200
    body = r.json()
    assert len(body["algorithms"]) == 10
    assert body["evidence"]["seed"] == 42


def test_dataset(client):
    r = client.get("/api/hr/v1/ml-demo/dataset")
    assert r.status_code == 200
    body = r.json()
    assert body["n_rows"] == 240
    assert body["seed"] == 42


def test_algorithms_list(client):
    r = client.get("/api/hr/v1/ml-demo/algorithms")
    assert r.status_code == 200
    assert len(r.json()["algorithms"]) == 10


def test_algorithm_detail(client):
    r = client.get("/api/hr/v1/ml-demo/algorithms/linear_regression")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == ENVELOPE_KEYS
    assert body["status"] == "ok"
    assert body["task_type"] == "regression"


def test_unknown_algorithm_returns_200_not_404(client):
    r = client.get("/api/hr/v1/ml-demo/algorithms/bogus")
    assert r.status_code == 200
    assert r.json()["status"] == "not_available"


def test_compare(client):
    r = client.get("/api/hr/v1/ml-demo/compare")
    assert r.status_code == 200
    assert len(r.json()["rows"]) == 10


def test_curveballs_endpoint(client):
    r = client.get("/api/hr/v1/ml-demo/curveballs")
    assert r.status_code == 200
    assert "curveballs" in r.json()


def test_cloud_config_endpoint(client):
    r = client.get("/api/hr/v1/ml-demo/cloud-config")
    assert r.status_code == 200
    assert "provider" in r.json()


def test_run_post(client):
    r = client.post("/api/hr/v1/ml-demo/run", json={"algorithm_id": "kmeans"})
    assert r.status_code == 200
    assert r.json()["algorithm_id"] == "kmeans"


def test_run_post_missing_id_fails_closed(client):
    r = client.post("/api/hr/v1/ml-demo/run", json={})
    assert r.status_code == 200
    assert r.json()["status"] == "not_available"
