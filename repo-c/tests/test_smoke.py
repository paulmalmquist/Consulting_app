"""Smoke tests for Demo Lab API (no DB required)."""


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
