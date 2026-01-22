import os

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_list_environments_requires_db():
    if not os.getenv("SUPABASE_DB_URL"):
        return
    response = client.get("/v1/environments")
    assert response.status_code == 200
