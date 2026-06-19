"""A2 route tests for the Feature Foundry endpoints + the ML-lab dataset swap.

All endpoints fail-closed (HTTP 200). Route-safety: static segments are not
parsed as a feature id. Dataset-swap: the lab trains on the feature-store frame
and badges provenance; a loud fallback is exposed when the store is unavailable.
"""

from __future__ import annotations



# ── Feature routes ────────────────────────────────────────────────────────────

def test_features_overview(client):
    r = client.get("/api/hr/v1/ml-demo/features")
    assert r.status_code == 200
    body = r.json()
    assert body["feature_count"] == len(body["features"]) == 20
    assert body["family_count"] == 20


def test_features_quality_board_is_static_not_id(client):
    r = client.get("/api/hr/v1/ml-demo/features/quality-board")
    assert r.status_code == 200
    body = r.json()
    # Must be the board, NOT a feature detail parsed from "quality-board".
    assert "grid" in body and "features" in body
    assert "null_reason" not in body
    assert len(body["features"]) == 20


def test_features_pipeline_map(client):
    r = client.get("/api/hr/v1/ml-demo/features/pipeline-map")
    assert r.status_code == 200
    assert [n["layer"] for n in r.json()["nodes"]] == ["bronze", "silver", "gold", "vector", "algorithm"]


def test_features_importance(client):
    r = client.get("/api/hr/v1/ml-demo/features/importance")
    assert r.status_code == 200
    assert "importance" in r.json()


def test_feature_detail_by_id(client):
    r = client.get("/api/hr/v1/ml-demo/features/by-id/credit_complacency_gap")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["feature_id"] == "credit_complacency_gap"
    assert body["family"] == "cross_signal_divergence"


def test_feature_detail_unknown_id_visible(client):
    r = client.get("/api/hr/v1/ml-demo/features/by-id/totally_made_up")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "not_available"
    assert body["null_reason"] == "unknown_feature_id"


# ── ML-lab dataset swap + loud fallback ───────────────────────────────────────

def test_lab_trains_on_feature_store_frame():
    from app.services.hr_ml_demo import run_algorithm
    from app.services.hr_ml_demo.runner import reset_dataset_cache

    reset_dataset_cache()
    res = run_algorithm("linear_regression")
    ev = res["evidence"]
    assert ev["source_quality"] == "synthetic"
    assert ev["dataset_provenance"] == "hr_feature_store"
    assert "fallback_reason" not in ev


def test_loud_fallback_when_feature_store_unavailable(monkeypatch):
    import app.services.hr_feature_store as fs
    from app.services.hr_ml_demo import run_all_algorithms
    from app.services.hr_ml_demo.runner import reset_dataset_cache

    def _boom(*a, **k):
        raise RuntimeError("synthetic outage")

    try:
        monkeypatch.setattr(fs, "lab_model_dataset", _boom)
        reset_dataset_cache()
        out = run_all_algorithms()
        ev = out["algorithms"][0]["evidence"]
        assert ev["source_quality"] == "synthetic_fallback"
        assert ev["fallback_reason"] == "hr_feature_store_unavailable"
        # A degraded dataset must not break the lab — all algorithms still run.
        assert all(a["status"] == "ok" for a in out["algorithms"])
    finally:
        reset_dataset_cache()  # restore clean state for other tests
