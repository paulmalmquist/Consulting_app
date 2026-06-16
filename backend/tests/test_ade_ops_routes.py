"""ADE Ops routes — auth gate (fail closed), skills, runs, run blocking.

Migration intent is asserted statically (a real DB CHECK is verified in the
supabase apply step, not in unit tests).
"""
import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from app.auth.context import AuthContext  # noqa: E402
from app.routes import ade_ops  # noqa: E402


def _auth_ok():
    return AuthContext(actor="tester", authenticated=True)


def test_auth_gate_is_wired_and_fails_closed(client, monkeypatch):
    """When auth fails, every route 401s — fail-closed-empty is only for storage
    errors. We force the gate to reject (independent of ambient middleware auth
    state, which varies by environment) and assert the 401 propagates."""
    from fastapi import HTTPException

    def reject(_req):
        raise HTTPException(status_code=401, detail="Authentication required")

    monkeypatch.setattr(ade_ops, "require_authenticated_request", reject)
    assert client.get("/api/ade/ops/skills").status_code == 401
    assert client.get(f"/api/ade/ops/runs?business_id={'0'*8}").status_code == 401
    assert client.post("/api/ade/ops/run", json={"skill": "ade.inventory.scan_pipelines"}).status_code == 401


def test_skills_listed_when_authed(client, monkeypatch):
    monkeypatch.setattr(ade_ops, "require_authenticated_request", lambda r: _auth_ok())
    body = client.get("/api/ade/ops/skills").json()
    names = {s["name"] for s in body["skills"]}
    assert "ade.inventory.scan_pipelines" in names
    assert body["executable_max_tier"] == 1
    # tier >= 2 visible but flagged non-executable
    assert any(s["risk_tier"] >= 2 and s["executable"] is False for s in body["skills"])


def test_runs_empty_safe_on_read_failure(client, monkeypatch):
    monkeypatch.setattr(ade_ops, "require_authenticated_request", lambda r: _auth_ok())
    def boom(*a, **k):
        raise RuntimeError("no db")
    monkeypatch.setattr(ade_ops.governance, "list_decisions", boom)
    body = client.get(f"/api/ade/ops/runs?business_id={'0'*8}").json()
    assert body["runs"] == []
    assert body["null_reason"] == "runs_read_unavailable"


def test_run_tier2_returns_blocked_body(client, monkeypatch):
    monkeypatch.setattr(ade_ops, "require_authenticated_request", lambda r: _auth_ok())
    resp = client.post("/api/ade/ops/run", json={"skill": "ade.execution.apply_approved_sql"})
    assert resp.status_code == 200  # domain outcome, not HTTP error
    body = resp.json()
    assert body["status"] == "blocked"
    assert body["null_reason"] == "write_capability_not_enabled"


def test_migration_extends_check_and_preserves_prior_values():
    sql = Path(__file__).resolve().parents[1].parent / "repo-b" / "db" / "schema" / "484_ade_ops_decision_type.sql"
    text = sql.read_text(encoding="utf-8")
    for v in ("tool_call", "response", "classification", "fast_path", "ade_op"):
        assert f"'{v}'" in text, f"migration must keep/add {v}"
    assert "DROP CONSTRAINT" in text  # replaces the auto-named inline CHECK
