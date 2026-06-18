"""ADE Ops PR 2 — assess_freshness reads real durable as-of or fails closed."""
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.services.ade_ops import freshness  # noqa: E402
from app.services.ade_ops.models import (  # noqa: E402
    OpsCommandRequest,
    OpsNullReason,
    OpsStatus,
)
from app.services.ade_ops.supervisor import run_skill  # noqa: E402

BIZ = "00000000-0000-0000-0000-000000000001"
SKILL = "ade.freshness.assess"


def _fresh(status: str, age_s: float):
    as_of = datetime.now(timezone.utc) - timedelta(seconds=age_s)
    return freshness.FreshnessReading(
        product_id="telemetry.stream_ingest", status=status, as_of=as_of,
        age_seconds=age_s, detail=None, source="tel_pipeline_status",
    )


def _req(**inputs):
    return OpsCommandRequest(skill=SKILL, inputs=inputs, business_id=BIZ, env_id="env-1")


def _run(monkeypatch, reading):
    monkeypatch.setattr(freshness, "read_product", lambda p, e, b: reading)
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    return run_skill(_req(data_product_id="telemetry.stream_ingest"))


# ── Real evidence ─────────────────────────────────────────────────────────────

def test_fresh_product_returns_ok_with_real_evidence(monkeypatch):
    r = _run(monkeypatch, _fresh("fresh", 120))
    assert r.status == OpsStatus.OK
    labels = {e.label for e in r.evidence}
    assert {"product", "status", "as_of", "age_seconds", "target_cadence_seconds"} <= labels
    assert all(e.source for e in r.evidence)             # no sourceless evidence
    as_of = next(e for e in r.evidence if e.label == "as_of")
    assert as_of.value is not None                       # real timestamp, not fabricated
    assert r.recommendation and "within" in r.recommendation.lower()


def test_stale_product_is_degraded_with_recommendation(monkeypatch):
    r = _run(monkeypatch, _fresh("stale", 4000))
    assert r.status == OpsStatus.DEGRADED
    assert r.recommendation and "recommend" in r.recommendation.lower()
    assert any(e.label == "age_seconds" and e.value == 4000 for e in r.evidence)


def test_failed_pipeline_is_degraded_and_flags_failure(monkeypatch):
    reading = freshness.FreshnessReading(
        product_id="telemetry.stream_ingest", status="failed",
        as_of=datetime.now(timezone.utc), age_seconds=10,
        detail="dq assertion failed", source="tel_pipeline_status")
    r = _run(monkeypatch, reading)
    assert r.status == OpsStatus.DEGRADED
    assert "failed" in r.recommendation.lower()


# ── Fail closed (no fabrication) ──────────────────────────────────────────────

def test_cloud_platform_fails_closed(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    for platform in ("snowflake", "databricks", "gcp", "aws", "bigquery"):
        r = run_skill(OpsCommandRequest(skill=SKILL, inputs={"data_product_id": "x", "platform": platform}, business_id=BIZ))
        assert r.status == OpsStatus.BLOCKED
        assert r.null_reason == OpsNullReason.DATA_SOURCE_NOT_CONFIGURED
        assert r.recommendation is None and r.evidence == []


def test_unknown_product_fails_closed(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = run_skill(_req(data_product_id="not.a.real.product"))
    assert r.status == OpsStatus.BLOCKED
    assert r.null_reason == OpsNullReason.DATA_SOURCE_NOT_CONFIGURED


def test_missing_product_id_invalid_inputs(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = run_skill(OpsCommandRequest(skill=SKILL, inputs={}, business_id=BIZ))
    assert r.status == OpsStatus.BLOCKED
    assert r.null_reason == OpsNullReason.INVALID_INPUTS


def test_registered_product_with_no_row_fails_closed_no_guess(monkeypatch):
    # Product is known but its freshness contract has no row here -> no fabricated as_of.
    monkeypatch.setattr(freshness, "read_product", lambda p, e, b: None)
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = run_skill(_req(data_product_id="telemetry.stream_ingest"))
    assert r.status == OpsStatus.BLOCKED
    assert r.null_reason == OpsNullReason.DURABLE_SOURCE_UNAVAILABLE
    assert r.evidence == []


# ── Module-level reader unit (no DB) ──────────────────────────────────────────

def test_age_seconds_and_resolve():
    assert freshness.resolve_product("telemetry.stream_ingest") is not None
    assert freshness.resolve_product("nope") is None
    assert freshness._age_seconds(None) is None
    aged = freshness._age_seconds(datetime.now(timezone.utc) - timedelta(seconds=50))
    assert 45 <= aged <= 70
