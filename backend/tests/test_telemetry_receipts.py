"""Tests for the Model Workbench receipt loader (Part I.1) — receipt-driven, fail-closed.

Covers: the two committed honest seed receipts load with real local_fixture values and no Vertex
provenance; absent/malformed receipts fail closed with a null_reason (never a 500, never fabricated);
an unknown kind is a programmer error (raises); and the five /workbench/* routes return HTTP 200 with
the correct envelope in both the present and the not-yet-generated states.
"""
import pytest

from app.services import telemetry_receipts as rcpt


# ── service: committed seed receipts (real, local_fixture, no Vertex claim) ────

def test_seeded_feature_manifest_loads():
    out = rcpt.load_receipt("feature_manifest")
    assert out["null_reason"] is None
    assert out["fallback_used"] is False
    assert out["provider"] == "local_fixture"
    assert out["vertex_run_id"] is None              # a preview may NOT claim Vertex provenance
    ids = [fs["id"] for fs in out["payload"]["feature_sets"]]
    assert ids == ["baseline", "temporal", "diagnostic"]
    base = out["payload"]["feature_sets"][0]
    assert base["included"] is True                   # A is the real promoted champion's inputs
    assert all(fs["included"] is False for fs in out["payload"]["feature_sets"][1:])


def test_threshold_sweep_is_real_gcp_sweep():
    # S7 replaced the seed with the real GCP/BigQuery-backed sweep.
    out = rcpt.load_receipt("threshold_sweep")
    assert out["null_reason"] is None
    assert out["provider"] == "gcp"
    assert out["source_bigquery_table"] == "novendor-events-prod.telemetry.gold_smap_msl_windows"
    op = out["payload"]["operating_point"]
    assert op["mad_k"] == 4.0
    assert op["detector_threshold"] == pytest.approx(0.13546720472974538, rel=1e-6)
    assert out["payload"]["sweep_pending"] is False
    assert len(out["payload"]["sweep"]) >= 5         # a real multi-K sweep
    # operating point reproduces the deployed champion's honest f1
    op_row = next(s for s in out["payload"]["sweep"] if s["threshold"] == 4.0)
    assert op_row["f1_pointwise"] == pytest.approx(0.312953, abs=1e-4)


def test_parity_receipt_reproduces_champion():
    out = rcpt.load_receipt("parity")
    assert out["null_reason"] is None
    assert out["provider"] == "gcp"
    assert out["payload"]["match"] is True
    assert out["payload"]["deltas"]["f1_pointwise"] == pytest.approx(0.0, abs=1e-4)


def test_error_review_has_real_cases():
    # S9 generated real FP/FN/borderline cases from the BigQuery gold.
    out = rcpt.load_receipt("error_review")
    assert out["null_reason"] is None
    assert out["provider"] == "gcp"
    cases = out["payload"]["cases"]
    assert len(cases) >= 4
    kinds = {c["kind"] for c in cases}
    assert "false_positive" in kinds and "false_negative" in kinds
    assert out["payload"]["highlights"]            # worst-channel / longest-missed / earliest-warning


def test_s11_receipt_kinds_fail_closed_until_generated():
    # drift / embedding / SHAP receipts are not generated yet (S11) → fail closed, never 500.
    for kind in ("drift_features", "embedding_projection", "factory_local_shap"):
        out = rcpt.load_receipt(kind)
        assert out["payload"] is None
        assert out["null_reason"] == "gcp_receipt_not_generated_yet"
        assert out["fallback_used"] is True


def test_new_workbench_routes_served(client):
    for path in ("parity", "drift", "embedding-projection", "factory-local-shap"):
        r = client.get(f"/api/telemetry/workbench/{path}")
        assert r.status_code == 200          # served + fail-closed where absent, never 500


# ── service: fail-closed paths ────────────────────────────────────────────────

def test_absent_receipt_fails_closed(tmp_path):
    out = rcpt.load_receipt("experiment_runs", base_dir=tmp_path)
    assert out["payload"] is None
    assert out["fallback_used"] is True
    assert out["null_reason"] == "gcp_receipt_not_generated_yet"
    # the header is still fully present (normalized to None), never omitted
    assert "vertex_run_id" in out and out["vertex_run_id"] is None
    assert out["provider"] is None


def test_malformed_receipt_fails_closed(tmp_path):
    (tmp_path / "promotion_review.json").write_text("{not valid json", encoding="utf-8")
    out = rcpt.load_receipt("promotion_review", base_dir=tmp_path)
    assert out["null_reason"] == "receipt_unreadable"
    assert out["fallback_used"] is True
    assert out["payload"] is None


def test_non_object_receipt_fails_closed(tmp_path):
    (tmp_path / "experiment_runs.json").write_text("[1, 2, 3]", encoding="utf-8")
    out = rcpt.load_receipt("experiment_runs", base_dir=tmp_path)
    assert out["null_reason"] == "receipt_malformed"
    assert out["fallback_used"] is True


def test_unknown_kind_raises():
    with pytest.raises(ValueError):
        rcpt.load_receipt("not_a_receipt")


# ── route-level: HTTP 200 + null_reason (never 500), read-only ────────────────

def test_workbench_experiments_route_is_real_vertex_run(client):
    # S8 landed the real Vertex Custom Training Job receipt (provider=vertex, real run id).
    r = client.get("/api/telemetry/workbench/experiments")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "experiment_runs"
    assert body["provider"] == "vertex"
    assert body["null_reason"] is None
    assert body["vertex_experiment"] == "telemetry-predictive-maintenance"
    assert body["vertex_run_id"] == "anomaly-mad-baseline-001"
    assert body["gcs_artifact_uri"].startswith("gs://")
    assert len(body["payload"]["runs"]) >= 1
    assert body["payload"]["runs"][0]["metrics"]["f1_pointwise"] == pytest.approx(0.312953, abs=1e-4)


def test_workbench_feature_manifest_route_real(client):
    r = client.get("/api/telemetry/workbench/feature-manifest")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "local_fixture"
    assert body["null_reason"] is None
    assert body["payload"]["feature_sets"][0]["id"] == "baseline"
    assert body["vertex_run_id"] is None


def test_workbench_threshold_sweep_route_real(client):
    r = client.get("/api/telemetry/workbench/threshold-sweep")
    assert r.status_code == 200
    body = r.json()
    assert body["payload"]["operating_point"]["mad_k"] == 4.0


def test_workbench_routes_are_read_only(client):
    for path in ("experiments", "feature-manifest", "threshold-sweep",
                 "error-review", "promotion-review"):
        url = f"/api/telemetry/workbench/{path}"
        assert client.get(url).status_code == 200
        assert client.post(url, json={}).status_code in (404, 405)
        assert client.put(url, json={}).status_code in (404, 405)
        assert client.delete(url).status_code in (404, 405)
