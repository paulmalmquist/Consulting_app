"""Tests for the Workflow Registry API and service (/api/ade/workflows).

Run with: cd backend && python -m pytest tests/test_workflow_registry.py -x -q

No DB required: route tests monkeypatch the service layer; service tests exercise
the pure helpers and validation paths. The migration is checked as text for the
mandatory RLS / tenant-policy / comment / unique-constraint guardrails.
"""
import os
from pathlib import Path

import pytest

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import workflow_registry as svc  # noqa: E402

BUSINESS_ID = "00000000-0000-0000-0000-000000000001"
ENV = "test-env"


# ── service-level: pure helpers & validation (no DB) ─────────────────────────

def test_slugify_normalizes():
    assert svc._slugify("My New Workflow!!") == "my-new-workflow"
    assert svc._slugify("   ") == "workflow"
    assert svc._slugify("Already-Clean") == "already-clean"


def test_seed_workflows_are_well_formed():
    slugs = [w["slug"] for w in svc.SEED_WORKFLOWS]
    assert slugs == ["ticket-to-pr", "data-engineering", "telemetry-investigation"]
    for w in svc.SEED_WORKFLOWS:
        assert w["domain"] in svc._VALID_DOMAINS
        assert w["steps"] and all("step_name" in s for s in w["steps"])


def test_create_rejects_bad_domain(monkeypatch):
    # Guard fires before any DB access, so no cursor needed.
    with pytest.raises(ValueError, match="Unknown domain"):
        svc.create_workflow(ENV, BUSINESS_ID, name="X", domain="not_a_domain")


def test_create_rejects_empty_name():
    with pytest.raises(ValueError, match="name is required"):
        svc.create_workflow(ENV, BUSINESS_ID, name="   ")


# ── route-level: monkeypatch the service so no DB is touched ──────────────────

def test_list_returns_workflows(client, monkeypatch):
    rows = [
        {"id": "1", "slug": "ticket-to-pr", "name": "Ticket → PR", "description": "d",
         "domain": "devops", "steps": [], "input_schema": {}, "output_schema": {},
         "owner": "system", "last_run_at": None, "run_count": 0, "created_at": None},
    ]
    monkeypatch.setattr(svc, "list_workflows", lambda env, biz, **kw: rows)
    body = client.get(f"/api/ade/workflows?env_id={ENV}&business_id={BUSINESS_ID}").json()
    assert body["null_reason"] is None
    assert len(body["workflows"]) == 1
    assert body["workflows"][0]["slug"] == "ticket-to-pr"


def test_list_passes_domain_filter(client, monkeypatch):
    seen = {}
    def fake_list(env, biz, **kw):
        seen.update(kw)
        return []
    monkeypatch.setattr(svc, "list_workflows", fake_list)
    client.get(f"/api/ade/workflows?env_id={ENV}&business_id={BUSINESS_ID}&domain=telemetry")
    assert seen.get("domain") == "telemetry"


def test_list_fails_closed(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("no database in tests")
    monkeypatch.setattr(svc, "list_workflows", boom)
    resp = client.get(f"/api/ade/workflows?env_id={ENV}&business_id={BUSINESS_ID}")
    assert resp.status_code == 200  # never 500
    body = resp.json()
    assert body["workflows"] == []
    assert body["null_reason"] == "workflow_read_unavailable"


def test_create_persists(client, monkeypatch):
    created = {"id": "abc", "slug": "supplier-risk-sweep", "name": "Supplier Risk Sweep",
              "description": None, "domain": "data_engineering", "steps": [],
              "input_schema": {}, "output_schema": {}, "owner": None,
              "last_run_at": None, "run_count": 0, "created_at": None}
    monkeypatch.setattr(svc, "create_workflow", lambda env, biz, **kw: created)
    resp = client.post("/api/ade/workflows", json={
        "env_id": ENV, "business_id": BUSINESS_ID, "name": "Supplier Risk Sweep",
        "domain": "data_engineering",
    })
    assert resp.status_code == 200
    assert resp.json()["slug"] == "supplier-risk-sweep"


def test_create_duplicate_slug_is_400(client, monkeypatch):
    def dup(*a, **k):
        raise ValueError("Workflow slug already exists: x")
    monkeypatch.setattr(svc, "create_workflow", dup)
    resp = client.post("/api/ade/workflows", json={
        "env_id": ENV, "business_id": BUSINESS_ID, "name": "X", "domain": "devops",
    })
    assert resp.status_code == 400


def test_get_unknown_is_404(client, monkeypatch):
    monkeypatch.setattr(svc, "get_workflow", lambda env, biz, wid: None)
    resp = client.get(f"/api/ade/workflows/00000000-0000-0000-0000-0000000000ff"
                      f"?env_id={ENV}&business_id={BUSINESS_ID}")
    assert resp.status_code == 404


def test_run_increments(client, monkeypatch):
    updated = {"id": "abc", "slug": "ticket-to-pr", "name": "Ticket → PR", "description": None,
               "domain": "devops", "steps": [], "input_schema": {}, "output_schema": {},
               "owner": "system", "last_run_at": "2026-06-13T00:00:00+00:00", "run_count": 1,
               "created_at": None}
    monkeypatch.setattr(svc, "record_run", lambda env, biz, wid: updated)
    resp = client.post("/api/ade/workflows/00000000-0000-0000-0000-0000000000ab/run",
                       json={"env_id": ENV, "business_id": BUSINESS_ID})
    assert resp.status_code == 200
    assert resp.json()["run_count"] == 1
    assert resp.json()["last_run_at"] is not None


def test_run_unknown_is_404(client, monkeypatch):
    monkeypatch.setattr(svc, "record_run", lambda env, biz, wid: None)
    resp = client.post("/api/ade/workflows/00000000-0000-0000-0000-0000000000ff/run",
                       json={"env_id": ENV, "business_id": BUSINESS_ID})
    assert resp.status_code == 404


# ── migration guardrails: RLS, tenant policy, comment, unique constraint ─────

def test_migration_has_required_guardrails():
    sql_path = (Path(__file__).resolve().parents[2]
                / "repo-b" / "db" / "schema" / "10018_workflow_registry.sql")
    sql = sql_path.read_text(encoding="utf-8")
    assert "nv_workflow_definitions" in sql
    assert "env_id        text NOT NULL" in sql or "env_id text NOT NULL" in sql
    assert "business_id   uuid NOT NULL" in sql or "business_id uuid NOT NULL" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "current_setting('app.env_id', true)" in sql
    assert "COMMENT ON TABLE nv_workflow_definitions" in sql
    assert "UNIQUE (env_id, slug)" in sql
