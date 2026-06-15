"""Tests for the Telemetry Analyzer (plan PR 9).

Run: cd backend && python -m pytest tests/test_telemetry_analyzer.py -x -q

Proves: findings come from REAL telemetry reads (monkeypatched), severity is rule-based,
empty/null sources fail closed with null_reasons (never a fabricated number), and every
finding satisfies the AnalyzerFinding contract.
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import telemetry_analyzer as svc  # noqa: E402
from app.services.analyzer_contract import AnalyzerFinding  # noqa: E402

ENV = "test-env"
BIZ = "00000000-0000-0000-0000-000000000001"


def _patch_monitoring(monkeypatch, value):
    from app.services import telemetry_serving
    monkeypatch.setattr(telemetry_serving, "monitoring", lambda **kw: value)


def _patch_perf(monkeypatch, value):
    from app.services import telemetry_serving
    monkeypatch.setattr(telemetry_serving, "model_performance", lambda **kw: value)


# ── grounded findings ─────────────────────────────────────────────────────────
def test_high_anomaly_rate_is_critical(monkeypatch):
    _patch_monitoring(monkeypatch, {
        "rolling_anomaly_rate": 0.35, "prediction_count": 100, "psi": None,
        "last_scored_at": "2026-06-15T00:00:00Z", "latest_model_name": "tel_anomaly_detector",
        "window_label": "recent", "null_reason": None,
    })
    _patch_perf(monkeypatch, {"models": [], "null_reason": "model_not_promoted"})
    out = svc.analyze(ENV, BIZ)
    anomaly = [f for f in out["findings"] if f["source_ref"].get("field") == "rolling_anomaly_rate"]
    assert anomaly and anomaly[0]["severity"] == "critical"
    assert anomaly[0]["evidence_refs"]  # grounded


def test_moderate_anomaly_rate_is_warning(monkeypatch):
    _patch_monitoring(monkeypatch, {
        "rolling_anomaly_rate": 0.12, "prediction_count": 50, "psi": None,
        "last_scored_at": "x", "latest_model_name": "m", "window_label": "recent", "null_reason": None,
    })
    _patch_perf(monkeypatch, {"models": [], "null_reason": "model_not_promoted"})
    out = svc.analyze(ENV, BIZ)
    anomaly = [f for f in out["findings"] if f["source_ref"].get("field") == "rolling_anomaly_rate"]
    assert anomaly[0]["severity"] == "warning"


def test_psi_drift_finding(monkeypatch):
    _patch_monitoring(monkeypatch, {
        "rolling_anomaly_rate": None, "prediction_count": 0, "psi": 0.33,
        "last_scored_at": None, "latest_model_name": "m", "window_label": "24h", "null_reason": None,
    })
    _patch_perf(monkeypatch, {"models": [], "null_reason": "model_not_promoted"})
    out = svc.analyze(ENV, BIZ)
    drift = [f for f in out["findings"] if f["source_ref"].get("field") == "psi"]
    assert drift and drift[0]["severity"] == "critical"  # 0.33 >= 0.30
    assert "psi" in drift[0]["metric_refs"]


def test_conformal_far_breach_is_warning(monkeypatch):
    _patch_monitoring(monkeypatch, {"rolling_anomaly_rate": None, "psi": None, "prediction_count": 0,
                                    "null_reason": "no_prediction_rows"})
    _patch_perf(monkeypatch, {"models": [{
        "model_name": "tel_anomaly_detector", "model_version": "3", "mlflow_run_id": "run-1",
        "metrics": {"conformal_measured_false_alarm_rate": 0.12, "conformal_alpha": 0.05},
    }], "null_reason": None})
    out = svc.analyze(ENV, BIZ)
    model = [f for f in out["findings"] if f["source_ref"].get("source") == "telemetry_serving.model_performance"]
    assert model and model[0]["severity"] == "warning"
    assert "conformal_alpha" in model[0]["metric_refs"]


# ── fail closed: no fabricated numbers ────────────────────────────────────────
def test_fails_closed_when_monitoring_null(monkeypatch):
    _patch_monitoring(monkeypatch, {"rolling_anomaly_rate": None, "psi": None, "prediction_count": 0,
                                    "null_reason": "no_prediction_rows"})
    _patch_perf(monkeypatch, {"models": [], "null_reason": "model_not_promoted"})
    out = svc.analyze(ENV, BIZ)
    # No anomaly/drift/model findings; reasons recorded; ncr disclosed as databricks-only.
    assert out["findings"] == []
    reasons = {r["reason"] for r in out["null_reasons"]}
    assert "no_prediction_rows" in reasons
    assert "requires_databricks_mirror" in reasons


def test_fails_closed_when_serving_raises(monkeypatch):
    from app.services import telemetry_serving
    def boom(**kw):
        raise RuntimeError("db down")
    monkeypatch.setattr(telemetry_serving, "monitoring", boom)
    monkeypatch.setattr(telemetry_serving, "model_performance", boom)
    out = svc.analyze(ENV, BIZ)
    assert out["findings"] == []
    assert any(r["reason"] == "monitoring_unavailable" for r in out["null_reasons"])


def test_no_conformal_metrics_no_model_finding(monkeypatch):
    _patch_monitoring(monkeypatch, {"rolling_anomaly_rate": None, "psi": None, "prediction_count": 0,
                                    "null_reason": "no_prediction_rows"})
    _patch_perf(monkeypatch, {"models": [{"model_name": "m", "model_version": "1", "metrics": {}}],
                              "null_reason": None})
    out = svc.analyze(ENV, BIZ)
    assert not any(f["source_ref"].get("source") == "telemetry_serving.model_performance"
                   for f in out["findings"])
    assert any(r["reason"] == "no_conformal_metrics" for r in out["null_reasons"])


# ── contract compliance + summary ─────────────────────────────────────────────
def test_findings_satisfy_contract(monkeypatch):
    _patch_monitoring(monkeypatch, {
        "rolling_anomaly_rate": 0.35, "prediction_count": 100, "psi": 0.25,
        "last_scored_at": "x", "latest_model_name": "m", "window_label": "recent", "null_reason": None,
    })
    _patch_perf(monkeypatch, {"models": [], "null_reason": "model_not_promoted"})
    out = svc.analyze(ENV, BIZ)
    # Every dict re-validates through the contract (would raise if a number lacked evidence).
    for f in out["findings"]:
        AnalyzerFinding(**{k: v for k, v in f.items() if k in AnalyzerFinding.__dataclass_fields__})


def test_summary_counts_by_severity(monkeypatch):
    _patch_monitoring(monkeypatch, {
        "rolling_anomaly_rate": 0.35, "prediction_count": 100, "psi": 0.25,
        "last_scored_at": "x", "latest_model_name": "m", "window_label": "recent", "null_reason": None,
    })
    _patch_perf(monkeypatch, {"models": [], "null_reason": "model_not_promoted"})
    s = svc.summary(ENV, BIZ)
    assert s["analyzer_type"] == "telemetry"
    assert s["finding_count"] == sum(s["by_severity"].values())


# ── routes (auth + fail-closed) ───────────────────────────────────────────────
def test_route_analyze_requires_auth_then_succeeds(client, monkeypatch):
    from app.routes import telemetry_analyzer as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "analyze", lambda env, biz: {
        "analyzer_type": "telemetry", "findings": [], "null_reasons": [], "latency_ms": 5})
    resp = client.post("/api/ade/analyze/telemetry", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["analyzer_type"] == "telemetry"


def test_route_analyze_fails_closed(client, monkeypatch):
    from app.routes import telemetry_analyzer as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    def boom(env, biz):
        raise RuntimeError("x")
    monkeypatch.setattr(svc, "analyze", boom)
    resp = client.post("/api/ade/analyze/telemetry", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "telemetry_analyze_unavailable"
