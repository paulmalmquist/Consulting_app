"""Tests for the telemetry Data Engineering receipt action (Phase 2D).

POST /api/telemetry/data-engineering/profile-metadata performs a READ-ONLY profile of the metadata
graph and writes ONE real audit event; GET /api/telemetry/data-engineering/receipts reads them back.
These tests assert the route's own behavior — it writes a real receipt (no fabrication), fails closed
when the graph read errors (still recording the failed attempt), and only surfaces ade.de.* events —
without needing a live database (audit + metadata services are monkeypatched).
"""
from datetime import datetime, timezone
from uuid import uuid4

from app.routes import telemetry as route

ENV = "telemetry-demo"
BIZ = str(uuid4())

GRAPH = {
    "status": "ok",
    "generated_at": "2026-06-25T00:00:00Z",
    "nodes": [
        {"id": "a", "status": "fresh", "metadata": {"grain": "printer telemetry event"}},
        {"id": "b", "status": "unknown", "metadata": {}},
    ],
    "edges": [{"id": "e1", "source": "a", "target": "b"}],
}


def test_profile_metadata_writes_a_real_receipt(client, monkeypatch):
    captured = {}

    def fake_record_event(**kwargs):
        captured.update(kwargs)
        return uuid4()

    monkeypatch.setattr(route, "_resolve_actor", lambda request: "reviewer@example.com")
    # Patch the lazily-imported services on their modules.
    from app.services import audit as audit_svc
    from app.services import telemetry_metadata as metadata_svc
    monkeypatch.setattr(metadata_svc, "get_metadata_graph", lambda *, env_id, business_id: GRAPH)
    monkeypatch.setattr(audit_svc, "record_event", fake_record_event)

    resp = client.post("/api/telemetry/data-engineering/profile-metadata", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    body = resp.json()
    # Real receipt: a genuine read-only action, recorded — not faked.
    assert body["status"] == "success"
    assert body["action"] == "ade.de.profile_metadata"
    assert body["permission_mode"] == "read"
    assert body["actor"] == "reviewer@example.com"
    assert body["result_summary"]["nodes"] == 2
    assert body["result_summary"]["edges"] == 1
    assert body["result_summary"]["with_grain"] == 1
    # The audit event was actually written with the right action.
    assert captured["action"] == "ade.de.profile_metadata"
    assert captured["success"] is True
    assert captured["input_data"] == {"env_id": ENV}


def test_profile_metadata_fails_closed_but_still_records_the_attempt(client, monkeypatch):
    captured = {}

    def fake_record_event(**kwargs):
        captured.update(kwargs)
        return uuid4()

    def boom(*, env_id, business_id):
        raise RuntimeError("metadata_graph_unreachable")

    from app.services import audit as audit_svc
    from app.services import telemetry_metadata as metadata_svc
    monkeypatch.setattr(metadata_svc, "get_metadata_graph", boom)
    monkeypatch.setattr(audit_svc, "record_event", fake_record_event)

    resp = client.post("/api/telemetry/data-engineering/profile-metadata", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "failed"
    assert body["null_reason"] == "metadata_graph_unreachable"
    assert body["result_summary"] == {}
    # The failed attempt is still recorded honestly (success=False), not hidden.
    assert captured["success"] is False
    assert captured["error_message"] == "metadata_graph_unreachable"


def test_receipts_only_surface_de_actions_and_shape_rows(client, monkeypatch):
    rows = [
        {"action": "ade.de.profile_metadata", "tool_name": "ade.profile_metadata_graph", "actor": "rev",
         "success": True, "latency_ms": 12, "created_at": datetime(2026, 6, 25, tzinfo=timezone.utc),
         "input_redacted": {"env_id": ENV}, "output_redacted": {"nodes": 2}, "error_message": None},
        {"action": "mcp.tool_call", "tool_name": "bm.health_check", "actor": "x", "success": True,
         "latency_ms": 1, "created_at": datetime(2026, 6, 25, tzinfo=timezone.utc),
         "input_redacted": {}, "output_redacted": {}, "error_message": None},
    ]
    from app.services import audit as audit_svc
    monkeypatch.setattr(audit_svc, "list_events", lambda **kwargs: rows)

    resp = client.get("/api/telemetry/data-engineering/receipts", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    body = resp.json()
    # Only the ade.de.* event is surfaced — the mcp.tool_call belongs to ADE /runs, not here.
    assert len(body["runs"]) == 1
    r = body["runs"][0]
    assert r["action"] == "ade.de.profile_metadata"
    assert r["permission_mode"] == "read"
    assert r["status"] == "success"
    assert r["result_summary"] == {"nodes": 2}


def test_receipts_fail_closed_when_audit_read_errors(client, monkeypatch):
    def boom(**kwargs):
        raise RuntimeError("db down")

    from app.services import audit as audit_svc
    monkeypatch.setattr(audit_svc, "list_events", boom)

    resp = client.get("/api/telemetry/data-engineering/receipts", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    body = resp.json()
    assert body["runs"] == []
    assert body["null_reason"] == "audit_read_unavailable"
