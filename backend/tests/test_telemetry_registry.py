"""Tests for the Model Registry console serving read (RS Demo PR 2) — display-only by construction."""
from datetime import datetime, timezone
from uuid import uuid4

from app.services import telemetry_registry as reg

ENV = "telemetry-demo"
BIZ = uuid4()
TENANT = uuid4()
T0 = datetime(2026, 5, 21, tzinfo=timezone.utc)
T1 = datetime(2026, 6, 3, tzinfo=timezone.utc)

CHAMPION = {
    "model_name": "tel_anomaly_detector", "model_kind": "anomaly", "model_version": "1",
    "model_alias": "champion", "mlflow_run_id": "4a48cb6af8714609b9581d66e904544c",
    "experiment_id": "374", "promotion_state": "promoted", "created_at": T0,
    "metrics": {
        "f1": 0.6387, "precision": 0.5460, "recall": 0.7691,
        "f1_pointwise": 0.312953, "event_recall": 0.769231, "alarm_precision": 0.3279,
        "affiliation_f1": 0.474634, "vus_status": "pending: import failed",
        "conformal_alpha": 0.05, "conformal_measured_false_alarm_rate": 0.067307,
        "honest_gate": {
            "thresholds": {"f1_pointwise": 0.10, "event_recall": 0.50,
                           "alarm_precision": 0.20, "affiliation_f1": 0.25},
            "values": {"f1_pointwise": 0.312953, "event_recall": 0.769231,
                       "alarm_precision": 0.3279, "affiliation_f1": 0.474634},
            "checks": {"f1_pointwise": True, "event_recall": True,
                       "alarm_precision": True, "affiliation_f1": True},
            "passed": True,
        },
    },
    "gate": {"metric": "f1", "threshold": 0.30, "decision": "promoted",
             "selected_over": "pca_recon(f1=0.4196)"},
}
CHALLENGER = {
    "model_name": "tel_anomaly_pca", "model_kind": "anomaly", "model_version": "1",
    "model_alias": None, "mlflow_run_id": "8e99b41142c14948b37aadade59e5aad",
    "experiment_id": "374", "promotion_state": "evaluated", "created_at": T1,
    "metrics": {"f1": 0.4196, "precision": 0.8726, "recall": 0.2762},
    "gate": {"metric": "f1", "threshold": 0.30, "decision": "not_selected"},
}


def test_registry_payload_shape(fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([CHAMPION, CHALLENGER])
    fake_cursor.push_result([
        {"model_name": "D-4", "metric_value": 0.06, "window_label": "w1", "computed_at": T0},
        {"model_name": "D-4", "metric_value": 0.11, "window_label": "w2", "computed_at": T1},
        {"model_name": "T-1", "metric_value": 0.18, "window_label": "w2", "computed_at": T1},
    ])
    out = reg.registry_console(env_id=ENV, business_id=BIZ)
    assert out["null_reason"] is None
    assert len(out["models"]) == 2
    champ = next(m for m in out["models"] if m["model_alias"] == "champion")
    assert champ["metrics"]["honest_gate"]["passed"] is True       # Track A gate rides through intact
    assert list(out["drift"].keys()) == ["D-4", "T-1"]
    assert [d["psi"] for d in out["drift"]["D-4"]] == [0.06, 0.11]  # real history, ordered


def test_registry_lifecycle_derivation(fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([CHAMPION, CHALLENGER])
    fake_cursor.push_result([])
    out = reg.registry_console(env_id=ENV, business_id=BIZ)
    texts = [e["text"] for e in out["lifecycle"]]
    assert any("promoted to champion" in t and "selected over pca_recon" in t for t in texts)
    assert any("tel_anomaly_pca v1 registered · not_selected" in t for t in texts)
    # chronological order
    assert out["lifecycle"][0]["ts"] <= out["lifecycle"][-1]["ts"]


def test_registry_fail_closed_when_empty(fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([])
    fake_cursor.push_result([])
    out = reg.registry_console(env_id=ENV, business_id=BIZ)
    assert out["null_reason"] == "model_not_promoted" and out["models"] == []


def test_registry_has_no_mutation_routes(client):
    """Display-only is enforced by API absence: no POST/PUT/DELETE under /registry."""
    assert client.post("/api/telemetry/registry", json={}).status_code in (404, 405)
    assert client.post("/api/telemetry/registry/promote", json={}).status_code in (404, 405)
    assert client.put("/api/telemetry/registry", json={}).status_code in (404, 405)
    assert client.delete("/api/telemetry/registry").status_code in (404, 405)
