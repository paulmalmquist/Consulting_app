"""Tests for the read-only ADE API (/api/ade/*).

Run with: cd backend && python -m pytest tests/test_ade_routes.py -x -q

No DB required: connector and skill-registry endpoints are in-process, and the
runs endpoint is exercised in its fail-closed degraded shape by breaking the
audit read.
"""
import os

import pytest

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.mcp.registry import registry  # noqa: E402

ALLOWED_STATUSES = {"live", "stub", "script", "missing"}
BUSINESS_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _populated_registry():
    """Repopulate the registry: other test files (test_mcp_smoke) clear it."""
    from app.mcp.server import _register_all_tools

    registry.clear()
    _register_all_tools()
    yield


def test_skill_registry_lists_tools(client):
    resp = client.get("/api/ade/skill-registry")
    assert resp.status_code == 200
    body = resp.json()
    assert body["null_reason"] is None
    assert len(body["tools"]) > 0
    tool = body["tools"][0]
    for field in ("name", "module", "description", "permission", "side_effect_class",
                  "permission_required", "confirmation_required", "lane_tags",
                  "skill_tags", "input_fields"):
        assert field in tool
    assert len(body["modules"]) > 0
    assert {"module", "tool_count"} <= set(body["modules"][0])


def test_skill_registry_list_strips_schema_bodies(client):
    body = client.get("/api/ade/skill-registry").json()
    for tool in body["tools"]:
        assert "input_schema" not in tool
        assert "output_schema" not in tool
        assert isinstance(tool["input_fields"], list)
        for f in tool["input_fields"]:
            assert isinstance(f, str)


def test_skill_detail_returns_full_schema(client):
    name = client.get("/api/ade/skill-registry").json()["tools"][0]["name"]
    resp = client.get(f"/api/ade/skill-registry/{name}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == name
    assert isinstance(body["input_schema"], dict)
    assert "properties" in body["input_schema"] or body["input_schema"].get("type")


def test_skill_detail_unknown_404(client):
    assert client.get("/api/ade/skill-registry/no.such.tool").status_code == 404


def test_connectors_declared_statuses_only(client):
    resp = client.get("/api/ade/connectors")
    assert resp.status_code == 200
    body = resp.json()
    assert body["null_reason"] is None
    assert len(body["connectors"]) > 0
    for c in body["connectors"]:
        assert c["status"] in ALLOWED_STATUSES
        if c["status"] == "live":
            assert c["evidence_path"], f"live connector {c['provider']} lacks evidence_path"
        assert "tool_count" in c


def test_connectors_git_tool_count_derived(client):
    body = client.get("/api/ade/connectors").json()
    git = next(c for c in body["connectors"] if c["mode"] == "mcp_tools")
    assert git["tool_count"] > 0


def test_runs_fails_closed_without_db(client, monkeypatch):
    from app.services import audit as audit_svc

    def boom(**kwargs):
        raise RuntimeError("no database in tests")

    monkeypatch.setattr(audit_svc, "list_events", boom)
    resp = client.get(f"/api/ade/runs?env_id=test-env&business_id={BUSINESS_ID}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["runs"] == []
    assert body["null_reason"] == "audit_read_unavailable"


def test_runs_maps_audit_events(client, monkeypatch):
    from datetime import datetime, timezone

    from app.services import audit as audit_svc

    events = [
        {"action": "mcp.tool_call", "tool_name": "git.diff", "success": True,
         "latency_ms": 41, "actor": "winston",
         "created_at": datetime(2026, 6, 12, 14, 1, 2, tzinfo=timezone.utc)},
        {"action": "something.else", "tool_name": "x", "success": True,
         "latency_ms": 1, "actor": "winston", "created_at": None},
    ]
    monkeypatch.setattr(audit_svc, "list_events", lambda **kw: events)
    body = client.get(f"/api/ade/runs?env_id=test-env&business_id={BUSINESS_ID}").json()
    assert body["null_reason"] is None
    assert len(body["runs"]) == 1
    run = body["runs"][0]
    assert run["tool_name"] == "git.diff"
    assert run["status"] == "success"
    assert run["permission_mode"] != "unknown"
    assert run["created_at"] == "2026-06-12T14:01:02+00:00"
