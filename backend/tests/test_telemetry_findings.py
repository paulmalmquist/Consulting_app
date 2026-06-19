"""Tests for GET /api/telemetry/findings — the Spike Inspector's real-data route.

The route is a thin pass-through to the telemetry analyzer (the single source of truth). These tests
monkeypatch the analyzer + monitoring service, so they assert the route's OWN behavior: the provenance
block, the severity rollup, and fail-closed null_reason — and that it never fabricates numbers.
"""
from uuid import uuid4

from app.routes import telemetry as route
from app.services import telemetry_serving as svc

ENV = "telemetry-demo"
BIZ = str(uuid4())


def test_findings_returns_real_analyzer_output_with_provenance(client, monkeypatch):
    findings = [
        {"finding_id": "tel-1", "severity": "critical", "what_changed": "Rolling anomaly rate is 25%",
         "source_ref": {"source": "telemetry_serving.monitoring", "field": "rolling_anomaly_rate"},
         "evidence_refs": ["prediction_count=364"], "recommendations": ["Review recent NO_GO runs."]},
        {"finding_id": "tel-2", "severity": "warning", "what_changed": "PSI is 0.22",
         "source_ref": {"source": "telemetry_serving.monitoring", "field": "psi"},
         "evidence_refs": ["psi=0.22"], "recommendations": []},
    ]
    monkeypatch.setattr(
        route.telemetry_analyzer, "analyze",
        lambda env_id, business_id: {
            "analyzer_type": "telemetry", "findings": findings,
            "null_reasons": [{"source": "ncr_intelligence", "reason": "requires_databricks_mirror"}],
        },
    )
    monkeypatch.setattr(svc, "monitoring", lambda env_id, business_id: {"prediction_count": 364})

    resp = client.get("/api/telemetry/findings", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    d = resp.json()
    assert d["null_reason"] is None
    assert d["finding_count"] == 2
    assert d["by_severity"] == {"info": 0, "warning": 1, "critical": 1}
    assert d["null_reasons"][0]["reason"] == "requires_databricks_mirror"
    prov = d["provenance"]
    assert prov["mode"] == "real_backend"
    assert prov["surface"] == "spike_inspector"
    assert prov["tenant"] == ENV
    assert prov["rows_evaluated"] == 364
    assert prov["fallback_used"] is False


def test_findings_fails_closed_on_analyzer_error(client, monkeypatch):
    def _boom(env_id, business_id):
        raise RuntimeError("analyzer down")

    monkeypatch.setattr(route.telemetry_analyzer, "analyze", _boom)

    resp = client.get("/api/telemetry/findings", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200  # fail closed, never a 500 with fabricated data
    d = resp.json()
    assert d["null_reason"] == "telemetry_findings_unavailable"
    assert d["findings"] == []
    assert d["finding_count"] == 0
    assert d["provenance"]["fallback_used"] is False


def test_findings_rows_evaluated_null_when_monitoring_unavailable(client, monkeypatch):
    monkeypatch.setattr(
        route.telemetry_analyzer, "analyze",
        lambda env_id, business_id: {"analyzer_type": "telemetry", "findings": [], "null_reasons": []},
    )

    def _boom(env_id, business_id):
        raise RuntimeError("no monitoring")

    monkeypatch.setattr(svc, "monitoring", _boom)

    resp = client.get("/api/telemetry/findings", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    d = resp.json()
    assert d["provenance"]["rows_evaluated"] is None  # null, never faked
    assert d["finding_count"] == 0
    assert d["null_reason"] is None
