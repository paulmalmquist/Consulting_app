"""Tests for the Factory & NCR Intelligence serving read (RS Demo PR 3).

Covers: payload shape over mirrored pipeline rows, the pure pareto/backlog derivations, the
fail-closed empty state (data_not_ingested — never a seeded-looking dashboard), mutation-route
absence, and corpus-generator determinism (imported by path from the Databricks notebook; pure
stdlib, no network)."""
import importlib.util
import json
from datetime import date
from pathlib import Path
from uuid import uuid4

from app.services import telemetry_factory as factory

ENV = "telemetry-demo"
BIZ = uuid4()
TENANT = uuid4()

POINT_ROWS = [
    {"ncr_key": "ncr_2026_00001", "cluster_id": 0, "umap_x": -4.2, "umap_y": 2.8, "severity": "major"},
    {"ncr_key": "ncr_2026_00002", "cluster_id": 0, "umap_x": -4.0, "umap_y": 2.6, "severity": "minor"},
    {"ncr_key": "ncr_2026_00003", "cluster_id": 1, "umap_x": 2.6, "umap_y": 3.4, "severity": "major"},
    {"ncr_key": "ncr_2026_00004", "cluster_id": -1, "umap_x": 0.1, "umap_y": 0.2, "severity": "minor"},
]
AGG_ROW = {"median_ttc_days": 11.0, "reopen_rate": 0.064,
           "batch_id": "ncr-pipeline-v1", "provenance": "databricks"}
CLUSTER_ROWS = [
    {"cluster_id": 0, "label": "seal · thermal cycle · witness mark",
     "keywords": ["seal", "thermal cycle"], "exemplars": [{"ncr_key": "ncr_2026_00001"}],
     "n_records": 2, "status": "rising", "trend": [1, 1, 2, 2, 2, 3, 3, 4],
     "median_ttc_days": 11.0, "reopen_rate": 0.08, "mlflow_run_id": "abc123",
     "provenance": "databricks"},
    {"cluster_id": 1, "label": "porosity · channel wall · ct",
     "keywords": ["porosity"], "exemplars": [], "n_records": 1, "status": "flat",
     "trend": [1, 0, 1, 0, 1, 0, 1, 0], "median_ttc_days": 16.0, "reopen_rate": 0.05,
     "mlflow_run_id": "abc123", "provenance": "databricks"},
]
BACKLOG_ROWS = [
    {"week_start": date(2026, 4, 13), "kind": "history", "opened": 8, "closed": 7,
     "backlog": 58, "fc": None, "lo": None, "hi": None},
    {"week_start": date(2026, 6, 1), "kind": "history", "opened": 9, "closed": 8,
     "backlog": 64, "fc": None, "lo": None, "hi": None},
    {"week_start": date(2026, 6, 8), "kind": "forecast", "opened": None, "closed": None,
     "backlog": None, "fc": 66.0, "lo": 62.0, "hi": 70.0},
]
MODEL_ROWS = [
    {"model_name": "tel_ncr_cluster", "model_kind": "ncr_cluster", "mlflow_run_id": "abc123",
     "experiment_id": "3740651530987773",
     "metrics": {"n_clusters": 2, "noise_count": 1, "provenance": "databricks"},
     "promotion_state": "promoted"},
    {"model_name": "tel_ncr_forecast", "model_kind": "ncr_forecast", "mlflow_run_id": "def456",
     "experiment_id": "3740651530987773",
     "metrics": {"mae": 1.9, "mae_naive": 2.4, "mape_pct": 3.1, "mape_naive_pct": 3.9,
                 "skill_vs_naive": 0.208, "backtest_folds": 8, "provenance": "databricks"},
     "promotion_state": "promoted"},
]


def test_ncr_payload_shape(fake_cursor):
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result(POINT_ROWS)
    fake_cursor.push_result([AGG_ROW])
    fake_cursor.push_result(CLUSTER_ROWS)
    fake_cursor.push_result(BACKLOG_ROWS)
    fake_cursor.push_result(MODEL_ROWS)
    out = factory.ncr_intelligence(env_id=ENV, business_id=BIZ)
    assert out["null_reason"] is None
    assert out["kpis"]["open_now"] == 64                      # from the latest history row
    assert out["kpis"]["clusters_rising"] == 1
    assert out["kpis"]["rising_labels"] == ["seal · thermal cycle · witness mark"]
    assert len(out["points"]) == 4
    assert out["points"][0]["x"] == -4.2                      # real model coordinates ride through
    assert out["backlog"]["backtest"]["mae"] == 1.9           # MAE beside MAPE
    assert out["backlog"]["backtest"]["mae_naive"] == 2.4
    assert out["backlog"]["forecast"][0]["lo"] == 62.0
    assert out["provenance"]["provenance"] == "databricks"
    assert out["provenance"]["cluster_mlflow_run_id"] == "abc123"


def test_pareto_from_clusters_is_model_derived():
    pareto = factory.pareto_from_clusters(CLUSTER_ROWS, noise_count=1)
    assert [p["family"] for p in pareto] == [
        "seal · thermal cycle · witness mark", "porosity · channel wall · ct",
        "noise / unclustered"]
    assert [p["n"] for p in pareto] == [2, 1, 1]
    assert pareto[-1]["cum_pct"] == 100.0
    assert pareto[0]["cum_pct"] == 50.0


def test_backlog_delta():
    history = [{"backlog": 50 + i} for i in range(10)]
    now, past = factory.backlog_delta(history, weeks_back=8)
    assert (now, past) == (59, 51)
    assert factory.backlog_delta([], weeks_back=8) == (None, None)
    # shorter history than the lookback -> honest None, not a wrap-around index
    assert factory.backlog_delta([{"backlog": 5}], weeks_back=8) == (5, None)


def test_ncr_fail_closed_when_not_ingested(fake_cursor):
    """No mirrored rows -> explicit data_not_ingested, empty collections, no fabricated KPIs."""
    fake_cursor.push_result([{"tenant_id": TENANT}])
    fake_cursor.push_result([])
    out = factory.ncr_intelligence(env_id=ENV, business_id=BIZ)
    assert out["null_reason"] == "data_not_ingested"
    assert out["kpis"] is None and out["points"] == [] and out["clusters"] == []
    assert out["backlog"] == {"history": [], "forecast": [], "backtest": None}


def test_ncr_has_no_mutation_routes(client):
    """Display-only is enforced by API absence: no POST/PUT/DELETE under /ncr."""
    assert client.post("/api/telemetry/ncr", json={}).status_code in (404, 405)
    assert client.put("/api/telemetry/ncr", json={}).status_code in (404, 405)
    assert client.delete("/api/telemetry/ncr").status_code in (404, 405)


def test_corpus_generator_deterministic():
    """The synthetic corpus regenerates byte-identically (SEED=20260609) — pure stdlib, no network.
    The notebook's spark write section is guarded, so importing it locally is safe."""
    nb = (Path(__file__).resolve().parents[2] / "telemetry-platform" / "databricks"
          / "notebooks" / "ncr_corpus.py")
    spec = importlib.util.spec_from_file_location("ncr_corpus_nb", nb)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    a, b = mod.generate_corpus(), mod.generate_corpus()
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert len(a) > 100
    keys = [r["ncr_key"] for r in a]
    assert keys == sorted(keys) and len(set(keys)) == len(keys)
    families = {r["defect_family"] for r in a if not r["defect_family"].startswith("noise_")}
    assert families == {"seal_thermal", "am_porosity", "fastener_torque",
                        "surface_finish", "weld_undercut", "harness_chafing"}
    # every record is schema-complete for the mirror
    for r in a[:5]:
        assert r["summary"] and r["opened_at"] and r["severity"] in ("minor", "major", "critical")
