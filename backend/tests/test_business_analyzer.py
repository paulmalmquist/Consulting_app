"""Tests for the Business Analyzer (plan PR 11).

Run: cd backend && python -m pytest tests/test_business_analyzer.py -x -q

Proves: env-type dispatch, findings from REAL reads (monkeypatched), rule-based severity,
empty/null/unavailable sources fail closed with null_reasons (never a fabricated number),
and every finding satisfies the AnalyzerFinding contract.
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import business_analyzer as svc  # noqa: E402
from app.services.analyzer_contract import AnalyzerFinding  # noqa: E402

ENV = "test-env"
BIZ = "00000000-0000-0000-0000-000000000001"

_NO_AUDIT = {"total_decisions": 0, "null_reason": "no_audit_activity"}


def _patch_audit(monkeypatch, value=None):
    from app.services import audit_dashboard
    monkeypatch.setattr(audit_dashboard, "summary", lambda biz, **kw: value or _NO_AUDIT)


# ── env-type dispatch ─────────────────────────────────────────────────────────
def test_resolve_consulting_env(monkeypatch):
    from app.services import lab
    monkeypatch.setattr(lab, "get_environment", lambda e: {"industry_type": "consulting",
                                                           "workspace_template_key": "consulting_revenue_os"})
    assert svc._resolve_env_type(ENV) == "consulting"


def test_resolve_generic_on_failure(monkeypatch):
    from app.services import lab
    monkeypatch.setattr(lab, "get_environment", lambda e: (_ for _ in ()).throw(RuntimeError("x")))
    assert svc._resolve_env_type(ENV) == "generic"


# ── consulting findings (board_summary) ───────────────────────────────────────
def test_overdue_tasks_warning(monkeypatch):
    from app.services import execution_tasks
    monkeypatch.setattr(execution_tasks, "board_summary", lambda **kw: {
        "overdue_count": 2, "today_count": 4, "this_week_count": 6})
    _patch_audit(monkeypatch)
    out = svc.analyze(ENV, BIZ, env_type="consulting")
    od = [f for f in out["findings"] if f["source_ref"].get("field") == "overdue_count"]
    assert od and od[0]["severity"] == "warning"
    assert od[0]["evidence_refs"]


def test_many_overdue_is_critical(monkeypatch):
    from app.services import execution_tasks
    monkeypatch.setattr(execution_tasks, "board_summary", lambda **kw: {
        "overdue_count": 7, "today_count": 3, "this_week_count": 2})
    _patch_audit(monkeypatch)
    out = svc.analyze(ENV, BIZ, env_type="consulting")
    od = [f for f in out["findings"] if f["source_ref"].get("field") == "overdue_count"]
    assert od[0]["severity"] == "critical"


def test_today_cap_exceeded_finding(monkeypatch):
    from app.services import execution_tasks
    monkeypatch.setattr(execution_tasks, "board_summary", lambda **kw: {
        "overdue_count": 0, "today_count": 12, "this_week_count": 1})
    _patch_audit(monkeypatch)
    out = svc.analyze(ENV, BIZ, env_type="consulting")
    cap = [f for f in out["findings"] if f["source_ref"].get("field") == "today_count"]
    assert cap and cap[0]["severity"] == "warning"


def test_healthy_board_no_findings(monkeypatch):
    from app.services import execution_tasks
    monkeypatch.setattr(execution_tasks, "board_summary", lambda **kw: {
        "overdue_count": 0, "today_count": 5, "this_week_count": 8})
    _patch_audit(monkeypatch)
    out = svc.analyze(ENV, BIZ, env_type="consulting")
    assert not any(f["source_ref"].get("source") == "execution_tasks.board_summary"
                   for f in out["findings"])


# ── accounting findings (compute_kpis) ────────────────────────────────────────
def test_accounting_cash_balance_finding(monkeypatch):
    from app.services import nv_accounting_kpis
    monkeypatch.setattr(nv_accounting_kpis, "compute_kpis", lambda **kw: {
        "kpis": [{"key": "cash-balance", "value": "$120k", "status": "available"}]})
    _patch_audit(monkeypatch)
    out = svc.analyze(ENV, BIZ, env_type="accounting")
    cash = [f for f in out["findings"] if f["source_ref"].get("field") == "cash_balance"]
    assert cash and cash[0]["severity"] == "info"


def test_accounting_unavailable_fails_closed(monkeypatch):
    from app.services import nv_accounting_kpis
    monkeypatch.setattr(nv_accounting_kpis, "compute_kpis", lambda **kw: {
        "kpis": [{"key": "cash-balance", "value": None, "status": "unavailable"}]})
    _patch_audit(monkeypatch)
    out = svc.analyze(ENV, BIZ, env_type="accounting")
    assert not any(f["source_ref"].get("field") == "cash_balance" for f in out["findings"])
    assert any(r["reason"] == "cash_balance_unavailable" for r in out["null_reasons"])


# ── universal audit floor ─────────────────────────────────────────────────────
def test_audit_floor_applies_to_generic(monkeypatch):
    from app.services import lab
    monkeypatch.setattr(lab, "get_environment", lambda e: {"industry_type": "general"})
    _patch_audit(monkeypatch, {"total_decisions": 100, "success_rate": 0.6, "failed": 40,
                               "window_days": 30, "null_reason": None})
    out = svc.analyze(ENV, BIZ)
    er = [f for f in out["findings"] if f["source_ref"].get("field") == "success_rate"]
    assert er and er[0]["severity"] == "critical"
    assert out["env_type"] == "generic"


def test_audit_no_decisions_fails_closed(monkeypatch):
    from app.services import lab
    monkeypatch.setattr(lab, "get_environment", lambda e: {"industry_type": "general"})
    _patch_audit(monkeypatch, {"total_decisions": 0, "null_reason": "no_audit_activity"})
    out = svc.analyze(ENV, BIZ)
    assert out["findings"] == []
    assert any(r["reason"] in ("no_audit_activity", "no_decisions") for r in out["null_reasons"])


# ── fail closed on raises ─────────────────────────────────────────────────────
def test_consulting_source_raises_fails_closed(monkeypatch):
    from app.services import execution_tasks
    monkeypatch.setattr(execution_tasks, "board_summary",
                        lambda **kw: (_ for _ in ()).throw(RuntimeError("db")))
    _patch_audit(monkeypatch)
    out = svc.analyze(ENV, BIZ, env_type="consulting")
    assert any(r["reason"] == "board_summary_unavailable" for r in out["null_reasons"])


# ── contract compliance + summary + route ─────────────────────────────────────
def test_findings_satisfy_contract(monkeypatch):
    from app.services import execution_tasks
    monkeypatch.setattr(execution_tasks, "board_summary", lambda **kw: {
        "overdue_count": 7, "today_count": 12, "this_week_count": 1})
    _patch_audit(monkeypatch, {"total_decisions": 100, "success_rate": 0.6, "failed": 40,
                               "window_days": 30, "null_reason": None})
    out = svc.analyze(ENV, BIZ, env_type="consulting")
    assert len(out["findings"]) >= 3
    for f in out["findings"]:
        AnalyzerFinding(**{k: v for k, v in f.items() if k in AnalyzerFinding.__dataclass_fields__})


def test_summary_counts_by_severity(monkeypatch):
    _patch_audit(monkeypatch, {"total_decisions": 100, "success_rate": 0.6, "failed": 40,
                               "window_days": 30, "null_reason": None})
    from app.services import lab
    monkeypatch.setattr(lab, "get_environment", lambda e: {"industry_type": "general"})
    s = svc.summary(ENV, BIZ)
    assert s["analyzer_type"] == "business"
    assert s["finding_count"] == sum(s["by_severity"].values())


def test_route_analyze_fails_closed(client, monkeypatch):
    from app.routes import business_analyzer as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    def boom(env, biz, **kw):
        raise RuntimeError("x")
    monkeypatch.setattr(svc, "analyze", boom)
    resp = client.post("/api/ade/analyze/business", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "business_analyze_unavailable"
