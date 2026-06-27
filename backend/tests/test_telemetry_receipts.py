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


def test_seeded_threshold_sweep_operating_point_is_real():
    out = rcpt.load_receipt("threshold_sweep")
    assert out["null_reason"] is None
    assert out["provider"] == "local_fixture"
    op = out["payload"]["operating_point"]
    assert op["mad_k"] == 4.0
    assert op["detector_threshold"] == pytest.approx(0.13546720472974538)
    assert out["payload"]["sweep"] == []             # full sweep pending the GCP run (Part II.4)
    assert out["payload"]["sweep_pending"] is True


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

def test_workbench_experiments_route_fails_closed(client):
    # experiment_runs.json is intentionally absent in the repo until the GCP run (Part II).
    r = client.get("/api/telemetry/workbench/experiments")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "experiment_runs"
    assert body["payload"] is None
    assert body["null_reason"] == "gcp_receipt_not_generated_yet"
    assert body["fallback_used"] is True


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
