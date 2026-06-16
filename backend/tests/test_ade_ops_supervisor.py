"""ADE Ops supervisor — tier gate, anti-fabrication, inputs, receipt handling."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.services.ade_ops import executors, supervisor  # noqa: E402
from app.services.ade_ops.models import (  # noqa: E402
    OpsCommandRequest,
    OpsNullReason,
    OpsStatus,
    ReceiptStatus,
)

BIZ = "00000000-0000-0000-0000-000000000001"


# ── Tier gate: tier >= 2 cannot execute; executor never invoked ───────────────

def test_tier2_plus_blocked_and_executor_never_called(monkeypatch):
    called = {"n": 0}
    # Spy across the whole executor table — if any runs, the gate failed.
    for name in list(executors.EXECUTORS):
        orig = executors.EXECUTORS[name]
        def spy(*a, _orig=orig, **k):
            called["n"] += 1
            return _orig(*a, **k)
        monkeypatch.setitem(executors.EXECUTORS, name, spy)

    for skill in ("ade.execution.apply_approved_sql", "ade.execution.rollback",
                  "ade.backfill.execute", "ade.compute.create_rightsize_patch"):
        r = supervisor.run_skill(OpsCommandRequest(skill=skill, business_id=BIZ))
        assert r.status == OpsStatus.BLOCKED
        assert r.null_reason == OpsNullReason.WRITE_CAPABILITY_NOT_ENABLED
    assert called["n"] == 0


def test_unknown_skill_blocked():
    r = supervisor.run_skill(OpsCommandRequest(skill="ade.nope.nope"))
    assert r.status == OpsStatus.BLOCKED
    assert r.null_reason == OpsNullReason.UNKNOWN_SKILL


# ── Anti-fabrication: OK/DEGRADED ⇒ every evidence has a source; else BLOCKED ──

def test_all_five_commands_evidence_or_blocked(monkeypatch):
    # Make the governance-backed commands return real stats deterministically.
    monkeypatch.setattr(
        "app.services.governance.compute_audit_stats",
        lambda biz, **k: {"total_decisions": 12, "successful": 11,
                          "avg_grounding_score": 0.82},
    )
    monkeypatch.setattr("app.services.governance.list_decisions", lambda biz, **k: [])
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid-1")

    cases = [
        ("ade.inventory.scan_pipelines", {}),
        ("ade.lineage.trust_number", {"metric_name": "NOI"}),
        ("ade.freshness.assess", {"table_name": "gold.x"}),
        ("ade.cost.show_hotspots", {}),
        ("ade.compute.recommend_rightsize", {}),
    ]
    for skill, inputs in cases:
        r = supervisor.run_skill(OpsCommandRequest(skill=skill, inputs=inputs, business_id=BIZ))
        if r.status in (OpsStatus.OK, OpsStatus.DEGRADED):
            assert r.evidence, f"{skill}: non-blocked result must carry evidence"
            assert all(e.source for e in r.evidence), f"{skill}: every evidence needs a source"
        else:
            assert r.status == OpsStatus.BLOCKED
            assert r.null_reason is not None


def test_cloud_commands_fail_closed():
    for skill in ("ade.freshness.assess", "ade.cost.show_hotspots", "ade.compute.recommend_rightsize"):
        r = supervisor.run_skill(OpsCommandRequest(skill=skill, business_id=BIZ))
        assert r.status == OpsStatus.BLOCKED
        assert r.null_reason == OpsNullReason.DATA_SOURCE_NOT_CONFIGURED
        assert r.recommendation is None
        assert r.evidence == []


def test_trust_number_requires_metric():
    r = supervisor.run_skill(OpsCommandRequest(skill="ade.lineage.trust_number",
                                               inputs={}, business_id=BIZ))
    assert r.status == OpsStatus.BLOCKED
    assert r.null_reason == OpsNullReason.INVALID_INPUTS


def test_scan_pipelines_reports_cloud_not_configured(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid-2")
    r = supervisor.run_skill(OpsCommandRequest(skill="ade.inventory.scan_pipelines"))
    # No business_id -> governance dimension skipped, but registries are real.
    assert r.status == OpsStatus.DEGRADED
    labels = {e.label for e in r.evidence}
    assert "ade_ops_skills" in labels
    assert "cloud_pipelines" in labels  # explicitly reported as not configured
    cloud = next(e for e in r.evidence if e.label == "cloud_pipelines")
    assert cloud.value == "data_source_not_configured"


# ── Receipts ──────────────────────────────────────────────────────────────────

def test_receipt_written_on_success(monkeypatch):
    seen = {}
    def fake_record(**kw):
        seen.update(kw)
        return "receipt-123"
    monkeypatch.setattr("app.services.governance.record_decision", fake_record)
    r = supervisor.run_skill(OpsCommandRequest(skill="ade.inventory.scan_pipelines",
                                               business_id=BIZ))
    assert seen["decision_type"] == "ade_op"
    assert r.receipt_id == "receipt-123"
    assert r.receipt_status == ReceiptStatus.WRITTEN


def test_receipt_write_failure_is_visible_not_silent(monkeypatch):
    # record_decision returns None when the insert fails (it swallows the error).
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: None)
    r = supervisor.run_skill(OpsCommandRequest(skill="ade.cost.show_hotspots",
                                               business_id=BIZ))
    assert r.receipt_id is None
    assert r.receipt_status == ReceiptStatus.FAILED


def test_receipt_skipped_without_business_context(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision",
                        lambda **k: (_ for _ in ()).throw(AssertionError("must not write")))
    r = supervisor.run_skill(OpsCommandRequest(skill="ade.inventory.scan_pipelines"))
    assert r.receipt_status == ReceiptStatus.SKIPPED
    assert r.receipt_id is None
