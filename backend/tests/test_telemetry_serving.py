"""Tests for the Telemetry Platform serving slice (Phase 3).

Uses the client + fake_cursor fixtures (no real DB). Queues result sets in the order the service
issues queries. Covers the GO/NO_GO/NOT_AVAILABLE verdicts, persistence receipt, and fail-closed
null_reasons.
"""
from uuid import uuid4

ENV = "telemetry-demo"
BIZ = str(uuid4())
RUN = str(uuid4())
TENANT = str(uuid4())
RECEIPT = str(uuid4())

CHAMP = {
    "model_name": "tel_anomaly_detector", "model_version": "1", "model_alias": "champion",
    "mlflow_run_id": "4a48cb6af8714609b9581d66e904544c", "metrics": {}, "gate": {},
}


def _score_body(values):
    return {"env_id": ENV, "business_id": BIZ, "run_key": "smap_msl:D-4:test",
            "channel_name": "value", "window": [{"t": i, "value": v} for i, v in enumerate(values)]}


def test_score_go_persists_receipt(client, fake_cursor):
    # query order: resolve_tenant_id, _champion, run lookup, INSERT receipt
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([CHAMP])
    fake_cursor.push_result([{"id": RUN}])
    fake_cursor.push_result([{"id": RECEIPT}])
    # calm window: residuals ~0 -> below threshold -> GO
    resp = client.post("/api/telemetry/score", json=_score_body([1.0, 1.0, 1.0, 1.0]))
    assert resp.status_code == 200
    d = resp.json()
    assert d["verdict"] == "GO"
    assert d["model_name"] == "tel_anomaly_detector"
    assert d["model_version"] == "1"
    assert d["mlflow_run_id"] == "4a48cb6af8714609b9581d66e904544c"
    assert d["receipt_id"] == RECEIPT
    # an INSERT into tel_predictions was issued
    assert any("INSERT INTO tel_predictions" in q[0] for q in fake_cursor.queries)


def test_score_no_go_on_spike(client, fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([CHAMP])
    fake_cursor.push_result([{"id": RUN}])
    fake_cursor.push_result([{"id": RECEIPT}])
    # a large jump produces a residual far above k * global_scale (0.0339) -> NO_GO
    resp = client.post("/api/telemetry/score", json=_score_body([1.0, 1.0, 1.0, 9.0]))
    assert resp.status_code == 200
    d = resp.json()
    assert d["verdict"] == "NO_GO"
    assert d["anomaly_score"] > 1.0          # past the redline
    assert d["receipt_id"] == RECEIPT


def test_score_model_not_promoted(client, fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([])              # no promoted anomaly model
    resp = client.post("/api/telemetry/score", json=_score_body([1.0, 2.0]))
    assert resp.status_code == 200
    d = resp.json()
    assert d["verdict"] == "NOT_AVAILABLE"
    assert d["null_reason"] == "model_not_promoted"
    assert d["receipt_id"] is None


def test_score_missing_run(client, fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([CHAMP])
    fake_cursor.push_result([])              # run_key not found
    resp = client.post("/api/telemetry/score", json=_score_body([1.0, 2.0]))
    assert resp.status_code == 200
    d = resp.json()
    assert d["verdict"] == "NOT_AVAILABLE"
    assert d["null_reason"] == "missing_run"


def test_verdict_for_bands_frozen():
    """Track A is surface-only: the live GO/REVIEW/NO_GO bands must never shift. Freeze them."""
    from app.services.telemetry_serving import _verdict_for
    assert _verdict_for(None) == "GO"
    assert _verdict_for(0.0) == "GO"
    assert _verdict_for(0.999) == "GO"
    assert _verdict_for(1.0) == "REVIEW"
    assert _verdict_for(2.0) == "REVIEW"
    assert _verdict_for(2.0001) == "NO_GO"
    assert _verdict_for(5.0) == "NO_GO"


def test_monitoring_surfaces_conformal_budget(client, fake_cursor):
    # query order in monitoring(): resolve_tenant_id, agg, champion (with metrics), psi
    champ = {**CHAMP, "metrics": {
        "conformal_alpha": 0.05, "conformal_measured_false_alarm_rate": 0.067307,
        "conformal_calib_coverage": 0.932693, "conformal_threshold_quantile": 6.663272,
        "conformal_frozen_k": 4.0}}
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([{"n": 10, "rate": 0.2, "last_at": None}])
    fake_cursor.push_result([champ])
    fake_cursor.push_result([{"metric_value": 0.05}])
    resp = client.get("/api/telemetry/monitoring", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    b = resp.json()["conformal_budget"]
    assert b is not None
    assert b["alpha"] == 0.05
    assert b["status"] == "approaching"          # 0.0673 > 0.05 (alpha) and <= 0.075 (1.5*alpha)
    assert b["frozen_k"] == 4.0


def test_monitoring_no_conformal_budget_when_absent(client, fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([{"n": 10, "rate": 0.2, "last_at": None}])
    fake_cursor.push_result([CHAMP])             # metrics={} -> no conformal fields
    fake_cursor.push_result([{"metric_value": 0.05}])
    resp = client.get("/api/telemetry/monitoring", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["conformal_budget"] is None


def test_runs_lists(client, fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([{
        "id": RUN, "run_key": "smap_msl:D-4:test", "dataset": "smap_msl",
        "unit_or_channel": "D-4", "spacecraft": "MSL", "row_count": 8473,
        "ingest_at": "2026-06-01T00:00:00Z", "status": "ingested",
        "created_at": "2026-06-01T00:00:00Z",
    }])
    resp = client.get("/api/telemetry/runs", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    rows = resp.json()
    assert rows[0]["run_key"] == "smap_msl:D-4:test"
    assert rows[0]["row_count"] == 8473


def test_monitoring_with_data(client, fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([{"n": 10, "rate": 0.4, "last_at": "2026-06-01T00:00:00Z"}])
    fake_cursor.push_result([{"model_name": "tel_anomaly_detector", "model_version": "1",
                              "model_alias": "champion"}])
    fake_cursor.push_result([{"metric_value": 0.12}])
    resp = client.get("/api/telemetry/monitoring", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    d = resp.json()
    assert d["prediction_count"] == 10
    assert d["rolling_anomaly_rate"] == 0.4
    assert d["psi"] == 0.12
    assert d["null_reason"] is None


def test_monitoring_no_predictions(client, fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([{"n": 0, "rate": None, "last_at": None}])
    fake_cursor.push_result([{"model_name": "tel_anomaly_detector", "model_version": "1",
                              "model_alias": "champion"}])
    fake_cursor.push_result([])
    resp = client.get("/api/telemetry/monitoring", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    d = resp.json()
    assert d["prediction_count"] == 0
    assert d["null_reason"] == "no_prediction_rows"
