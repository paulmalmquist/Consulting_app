"""Tests for the Data Platform Analyzer (plan PR 10).

Run: cd backend && python -m pytest tests/test_data_platform_analyzer.py -x -q

Proves: findings come from REAL DQ/pipeline/audit reads (monkeypatched), severity is
rule-based, empty/null sources fail closed with null_reasons (never a fabricated number),
and every finding satisfies the AnalyzerFinding contract.
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import data_platform_analyzer as svc  # noqa: E402
from app.services.analyzer_contract import AnalyzerFinding  # noqa: E402

ENV = "test-env"
BIZ = "00000000-0000-0000-0000-000000000001"


def _patch(monkeypatch, *, live=None, health=None, summary=None):
    from app.services import telemetry_stream_etl, audit_dashboard
    monkeypatch.setattr(telemetry_stream_etl, "stream_live",
                        lambda **kw: live if live is not None else {"pipeline": {"surfaces": {}}})
    monkeypatch.setattr(telemetry_stream_etl, "stream_health",
                        lambda **kw: health if health is not None else {"assertions": []})
    monkeypatch.setattr(audit_dashboard, "summary",
                        lambda biz, **kw: summary if summary is not None else {
                            "total_decisions": 0, "null_reason": "no_audit_activity"})


# ── pipeline findings ─────────────────────────────────────────────────────────
def test_failed_pipeline_surface_is_critical(monkeypatch):
    _patch(monkeypatch, live={"pipeline": {"surfaces": {
        "silver": {"status": "failed", "as_of_ts": "2026-06-15T00:00:00Z", "reason": "watermark_stalled"}}}})
    out = svc.analyze(ENV, BIZ)
    pf = [f for f in out["findings"] if f["source_ref"].get("finding_type") == "pipeline_failed"]
    assert pf and pf[0]["severity"] == "critical"
    assert pf[0]["evidence_refs"]


def test_stale_surface_is_warning(monkeypatch):
    _patch(monkeypatch, live={"pipeline": {"surfaces": {
        "gold": {"status": "stale", "as_of_ts": "x", "reason": "no_new_rows"}}}})
    out = svc.analyze(ENV, BIZ)
    fs = [f for f in out["findings"] if f["source_ref"].get("finding_type") == "feed_stale"]
    assert fs and fs[0]["severity"] == "warning"


def test_fresh_surface_produces_no_finding(monkeypatch):
    _patch(monkeypatch, live={"pipeline": {"surfaces": {"silver": {"status": "fresh", "as_of_ts": "x"}}}})
    out = svc.analyze(ENV, BIZ)
    assert not any(f["source_ref"].get("source") == "telemetry_stream_etl.stream_live"
                   for f in out["findings"])


# ── DQ assertion findings ─────────────────────────────────────────────────────
def test_failed_dq_assertion_finding(monkeypatch):
    _patch(monkeypatch, health={"assertions": [
        {"assertion_name": "freshness", "table_name": "tel_stream_readings", "passed": False,
         "observed": "600s", "threshold": "120s", "run_ts": "x"},
        {"assertion_name": "row_count", "table_name": "t", "passed": True, "run_ts": "x"},
    ]})
    out = svc.analyze(ENV, BIZ)
    dq = [f for f in out["findings"] if f["source_ref"].get("finding_type") == "dq_assertion_fail"]
    assert len(dq) == 1  # only the failed one
    assert dq[0]["severity"] == "warning"
    assert "freshness" in dq[0]["metric_refs"]


def test_no_dq_assertions_records_null_reason(monkeypatch):
    _patch(monkeypatch, health={"assertions": []})
    out = svc.analyze(ENV, BIZ)
    assert any(r["reason"] == "no_dq_assertions" for r in out["null_reasons"])


# ── audit error rate + cost spike ─────────────────────────────────────────────
def test_high_tool_error_rate_is_critical(monkeypatch):
    _patch(monkeypatch, summary={
        "total_decisions": 100, "success_rate": 0.6, "failed": 40, "window_days": 30,
        "calls_per_day": [], "null_reason": None})
    out = svc.analyze(ENV, BIZ)
    er = [f for f in out["findings"] if f["source_ref"].get("finding_type") == "tool_error_rate"]
    assert er and er[0]["severity"] == "critical"  # 40% > 25%


def test_cost_spike_detected(monkeypatch):
    # A clear outlier day among low-volume days.
    days = [{"calls": v} for v in [10, 12, 11, 9, 13, 200]]
    _patch(monkeypatch, summary={
        "total_decisions": 255, "success_rate": 1.0, "failed": 0, "window_days": 30,
        "calls_per_day": days, "null_reason": None})
    out = svc.analyze(ENV, BIZ)
    spike = [f for f in out["findings"] if f["source_ref"].get("finding_type") == "cost_spike"]
    assert spike and spike[0]["severity"] == "warning"


def test_no_cost_spike_for_flat_series(monkeypatch):
    days = [{"calls": v} for v in [10, 11, 10, 12, 11]]
    _patch(monkeypatch, summary={
        "total_decisions": 54, "success_rate": 1.0, "failed": 0, "window_days": 30,
        "calls_per_day": days, "null_reason": None})
    out = svc.analyze(ENV, BIZ)
    assert not any(f["source_ref"].get("finding_type") == "cost_spike" for f in out["findings"])


def test_detect_spike_pure():
    assert svc._detect_spike([10, 11, 10, 12, 11]) is None  # flat
    assert svc._detect_spike([1, 2]) is None  # too few points
    assert svc._detect_spike([5, 5, 5, 5]) is None  # zero stddev
    out = svc._detect_spike([10, 12, 11, 9, 13, 200])
    assert out is not None and out["value"] == 200


# ── fail closed ───────────────────────────────────────────────────────────────
def test_audit_null_reason_fails_closed(monkeypatch):
    _patch(monkeypatch, summary={"total_decisions": 0, "null_reason": "no_audit_activity"})
    out = svc.analyze(ENV, BIZ)
    assert not any(f["source_ref"].get("source") == "audit_dashboard.summary" for f in out["findings"])
    assert any(r["reason"] == "no_audit_activity" for r in out["null_reasons"])


def test_sources_raising_fails_closed(monkeypatch):
    from app.services import telemetry_stream_etl, audit_dashboard
    def boom(**kw):
        raise RuntimeError("db down")
    monkeypatch.setattr(telemetry_stream_etl, "stream_live", boom)
    monkeypatch.setattr(telemetry_stream_etl, "stream_health", boom)
    monkeypatch.setattr(audit_dashboard, "summary", lambda biz, **kw: (_ for _ in ()).throw(RuntimeError("x")))
    out = svc.analyze(ENV, BIZ)
    assert out["findings"] == []
    reasons = {r["reason"] for r in out["null_reasons"]}
    assert "pipeline_status_unavailable" in reasons
    assert "stream_health_unavailable" in reasons


# ── contract compliance + summary ─────────────────────────────────────────────
def test_findings_satisfy_contract(monkeypatch):
    _patch(monkeypatch,
           live={"pipeline": {"surfaces": {"silver": {"status": "failed", "as_of_ts": "x", "reason": "r"}}}},
           health={"assertions": [{"assertion_name": "freshness", "table_name": "t", "passed": False,
                                   "observed": "x", "threshold": "y", "run_ts": "z"}]},
           summary={"total_decisions": 100, "success_rate": 0.6, "failed": 40, "window_days": 30,
                    "calls_per_day": [], "null_reason": None})
    out = svc.analyze(ENV, BIZ)
    assert len(out["findings"]) >= 3
    for f in out["findings"]:
        AnalyzerFinding(**{k: v for k, v in f.items() if k in AnalyzerFinding.__dataclass_fields__})


def test_summary_counts_by_severity(monkeypatch):
    _patch(monkeypatch, live={"pipeline": {"surfaces": {"silver": {"status": "failed", "as_of_ts": "x"}}}})
    s = svc.summary(ENV, BIZ)
    assert s["analyzer_type"] == "data_platform"
    assert s["finding_count"] == sum(s["by_severity"].values())


# ── route ─────────────────────────────────────────────────────────────────────
def test_route_analyze_fails_closed(client, monkeypatch):
    from app.routes import data_platform_analyzer as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    def boom(env, biz):
        raise RuntimeError("x")
    monkeypatch.setattr(svc, "analyze", boom)
    resp = client.post("/api/ade/analyze/data-platform", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "data_platform_analyze_unavailable"


# ── persist seam (connective PR) ──────────────────────────────────────────────
_ONE_FINDING = {"analyzer_type": "data_platform", "findings": [{"finding_id": "x"}],
                "null_reasons": [], "latency_ms": 5}


def test_route_persist_true_upserts_cards(client, monkeypatch):
    from app.routes import data_platform_analyzer as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "analyze", lambda env, biz: dict(_ONE_FINDING))
    calls = []
    monkeypatch.setattr(route, "persist_findings_as_cards",
                        lambda env, biz, findings: calls.append(findings) or len(findings))
    resp = client.post("/api/ade/analyze/data-platform",
                       json={"env_id": ENV, "business_id": BIZ, "persist": True})
    assert resp.status_code == 200
    assert resp.json()["cards_upserted"] == 1
    assert len(calls) == 1


def test_route_persist_default_off(client, monkeypatch):
    from app.routes import data_platform_analyzer as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "analyze", lambda env, biz: dict(_ONE_FINDING))
    called = []
    monkeypatch.setattr(route, "persist_findings_as_cards",
                        lambda env, biz, findings: called.append(1) or 0)
    resp = client.post("/api/ade/analyze/data-platform", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["cards_upserted"] == 0
    assert called == []
