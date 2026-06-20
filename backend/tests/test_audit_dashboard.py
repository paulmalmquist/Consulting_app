"""Tests for the Audit Dashboard API (/api/ade/audit/*) and the BigQuery export scaffold.

Run with: cd backend && python -m pytest tests/test_audit_dashboard.py -x -q

No DB required: route tests monkeypatch the service layer; the export-script tests
exercise the fail-closed credential gate without touching BigQuery or Postgres.
"""
import os

import pytest

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

BUSINESS_ID = "00000000-0000-0000-0000-000000000001"


# ── summary ──────────────────────────────────────────────────────────────────

def test_summary_maps_service(client, monkeypatch):
    from app.services import audit_dashboard as svc

    fake = {
        "window_days": 30, "total_decisions": 12, "successful": 11, "failed": 1,
        "success_rate": 0.917, "avg_latency_ms": 88, "avg_grounding_score": 0.81,
        "high_grounding": 8, "mixed_grounding": 3, "low_grounding": 1,
        "top_tools": [{"tool_name": "repe.kpis", "call_count": 4, "avg_latency": 70}],
        "calls_per_day": [{"day": "2026-06-12", "calls": 5, "failed": 0}],
        "estimated_cost_usd": 0.12, "cost_is_estimate": True,
    }
    monkeypatch.setattr(svc, "summary", lambda biz, **kw: fake)
    body = client.get(f"/api/ade/audit/summary?business_id={BUSINESS_ID}").json()
    assert body["null_reason"] is None
    assert body["total_decisions"] == 12
    assert body["calls_per_day"][0]["calls"] == 5
    assert body["cost_is_estimate"] is True


def test_summary_fails_closed(client, monkeypatch):
    from app.services import audit_dashboard as svc

    def boom(*a, **k):
        raise RuntimeError("no db")
    monkeypatch.setattr(svc, "summary", boom)
    resp = client.get(f"/api/ade/audit/summary?business_id={BUSINESS_ID}")
    assert resp.status_code == 200  # never 500
    body = resp.json()
    assert body["null_reason"] == "audit_summary_unavailable"
    assert body["total_decisions"] == 0
    assert body["calls_per_day"] == []


# ── decisions ────────────────────────────────────────────────────────────────

def test_decisions_returns_rows(client, monkeypatch):
    from app.services import audit_dashboard as svc

    rows = [{"id": "d1", "actor": "winston", "decision_type": "tool_call", "tool_name": "git.diff",
             "model_used": "gpt-4.1", "latency_ms": 40, "grounding_score": 0.92,
             "grounding_low": False, "success": True, "error_message": None,
             "created_at": "2026-06-12T10:00:00+00:00"}]
    monkeypatch.setattr(svc, "decisions", lambda biz, **kw: rows)
    body = client.get(f"/api/ade/audit/decisions?business_id={BUSINESS_ID}").json()
    assert body["null_reason"] is None
    assert body["decisions"][0]["tool_name"] == "git.diff"


def test_decisions_passes_tool_filter(client, monkeypatch):
    from app.services import audit_dashboard as svc

    seen = {}
    def fake(biz, **kw):
        seen.update(kw)
        return []
    monkeypatch.setattr(svc, "decisions", fake)
    client.get(f"/api/ade/audit/decisions?business_id={BUSINESS_ID}&tool_name=git.diff")
    assert seen.get("tool_name") == "git.diff"


def test_decisions_fails_closed(client, monkeypatch):
    from app.services import audit_dashboard as svc

    def boom(*a, **k):
        raise RuntimeError("no db")
    monkeypatch.setattr(svc, "decisions", boom)
    body = client.get(f"/api/ade/audit/decisions?business_id={BUSINESS_ID}").json()
    assert body["decisions"] == []
    assert body["null_reason"] == "audit_decisions_unavailable"


def test_decision_detail_unknown_404(client, monkeypatch):
    from app.services import governance as governance_svc
    monkeypatch.setattr(governance_svc, "get_decision", lambda did: None)
    resp = client.get("/api/ade/audit/decisions/00000000-0000-0000-0000-0000000000ff")
    assert resp.status_code == 404


# ── lineage ──────────────────────────────────────────────────────────────────

def test_lineage_filters_by_tool(client, monkeypatch):
    from app.services import audit_dashboard as svc

    monkeypatch.setattr(svc, "lineage", lambda biz, tool, **kw: [{"tool_name": tool}])
    body = client.get(f"/api/ade/audit/lineage/repe.kpis?business_id={BUSINESS_ID}").json()
    assert body["tool_name"] == "repe.kpis"
    assert body["null_reason"] is None


def test_lineage_fails_closed(client, monkeypatch):
    from app.services import audit_dashboard as svc

    def boom(*a, **k):
        raise RuntimeError("no db")
    monkeypatch.setattr(svc, "lineage", boom)
    body = client.get(f"/api/ade/audit/lineage/x?business_id={BUSINESS_ID}").json()
    assert body["decisions"] == []
    assert body["null_reason"] == "audit_lineage_unavailable"


# ── BigQuery export scaffold: fail-closed credential gate ────────────────────

def _import_exporter():
    # Import via sys.path so the module is registered in sys.modules — dataclasses
    # defined in the module need that (module_from_spec leaves __module__ dangling
    # on Python 3.14 and @dataclass fails).
    import sys
    from pathlib import Path
    scripts_dir = Path(__file__).resolve().parents[2] / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    import export_audit_to_bq  # noqa: PLC0415
    return export_audit_to_bq


def test_export_fails_closed_without_creds(monkeypatch):
    exporter = _import_exporter()
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("BQ_PROJECT_ID", raising=False)
    with pytest.raises(exporter.ExportNotConfigured, match="not configured"):
        exporter.export_audit_events()


def test_export_main_returns_nonzero_without_creds(monkeypatch):
    exporter = _import_exporter()
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("BQ_PROJECT_ID", raising=False)
    # main() must exit non-zero and never report success.
    assert exporter.main(["--since", "2026-06-01"]) == 2


def test_warehouse_seam_delegates_and_fails_closed(monkeypatch):
    from app.services import ade_warehouse_export as seam
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("BQ_PROJECT_ID", raising=False)
    assert seam.warehouse_export_configured() is False
    with pytest.raises(Exception) as exc:  # ExportNotConfigured from the delegated script
        seam.export_audit_events_to_warehouse()
    assert "not configured" in str(exc.value)
