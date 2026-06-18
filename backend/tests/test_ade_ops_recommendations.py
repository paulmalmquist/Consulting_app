"""ADE Ops PR 4 — recommendation artifacts: candidate, never action."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.services.ade_ops import recommendations as rec  # noqa: E402
from app.services.ade_ops.models import OpsConfidence, OpsNullReason, OpsStatus, RiskTier  # noqa: E402
from app.services.ade_ops.models import OpsCommandRequest  # noqa: E402
from app.services.ade_ops.supervisor import run_skill  # noqa: E402

BIZ = "00000000-0000-0000-0000-000000000001"


# ── Freshness rules ───────────────────────────────────────────────────────────

def test_freshness_no_as_of_blocked():
    r = rec.freshness_recommendation(product_label="p", status="fresh", age_seconds=None,
                                     target_seconds=300, evidence=[], reason=None)
    assert r.status is OpsStatus.BLOCKED and r.null_reason == "durable_source_unavailable"
    assert r.dry_run_artifact is None and r.risk_tier is RiskTier.RECOMMENDATION


def test_freshness_failed_is_incident_followup():
    r = rec.freshness_recommendation(product_label="p", status="failed", age_seconds=10,
                                     target_seconds=300, evidence=[], reason="dq fail")
    assert r.status is OpsStatus.DEGRADED and r.confidence is OpsConfidence.HIGH
    assert "incident" in r.recommendation.lower()


def test_freshness_stale_is_cadence_candidate():
    r = rec.freshness_recommendation(product_label="p", status="stale", age_seconds=4000,
                                     target_seconds=300, evidence=[], reason=None)
    assert r.status is OpsStatus.DEGRADED
    assert "candidate" in r.recommendation.lower()
    assert r.risk_tier is RiskTier.RECOMMENDATION  # no dry-run -> Tier 1


# ── Cost rules: no savings without billing ────────────────────────────────────

def test_cost_missing_billing_blocked_no_savings():
    r = rec.cost_recommendation(provider="snowflake", cost_observation_available=False,
                                null_reason="snowflake_account_not_set", evidence=[])
    assert r.status is OpsStatus.BLOCKED
    assert r.expected_impact is None  # no savings asserted
    assert any("no savings" in a.lower() for a in r.assumptions)


def test_cost_available_ranks_only_no_dollar_figure():
    r = rec.cost_recommendation(provider="aws", cost_observation_available=True,
                                null_reason=None, evidence=[{"label": "x", "value": 1, "source": "s"}])
    assert r.status is OpsStatus.DEGRADED
    assert "rank" in r.recommendation.lower()
    assert r.expected_impact is None  # PR 4 asserts no dollar savings


# ── Rightsize: candidate only, text-only dry-run, Tier 2 ──────────────────────

def test_rightsize_missing_evidence_blocked():
    r = rec.rightsize_recommendation(provider="databricks", target_ref="cl-1",
                                     runtime=True, cost=True, utilization=False, evidence=[])
    assert r.status is OpsStatus.BLOCKED
    assert "utilization" in r.finding.lower()
    assert r.dry_run_artifact is None


def test_rightsize_all_evidence_is_candidate_with_text_dry_run():
    r = rec.rightsize_recommendation(provider="databricks", target_ref="cl-1",
                                     runtime=True, cost=True, utilization=True, evidence=[])
    assert r.status is OpsStatus.DEGRADED
    assert "candidate" in r.recommendation.lower()
    # dry-run is TEXT only, clearly labelled not-executed, and implies Tier 2 + approval + rollback
    assert r.dry_run_artifact and "NOT EXECUTED" in r.dry_run_artifact
    assert r.risk_tier is RiskTier.DRY_RUN
    assert r.approval_required is True and r.rollback_required is True
    # candidate, never an executable command
    low = r.dry_run_artifact.lower()
    for tok in ("alter ", "resize", "modify-instance", "run-now", "terminate", "drop "):
        assert tok not in low


def test_dry_run_text_is_descriptive_not_command():
    t = rec.dry_run_text("x", ["review for downsize"])
    assert "NOT EXECUTED" in t and "does not execute" in t


# ── ADO payload is import-ready, NOT pushed ───────────────────────────────────

def test_ado_payload_is_import_ready_not_pushed():
    r = rec.rightsize_recommendation(provider="aws", target_ref="emr-1",
                                     runtime=True, cost=True, utilization=True, evidence=[])
    payload = rec.ado_ticket_payload(r)
    assert payload["_meta"]["import_ready"] is True
    assert payload["_meta"]["pushed"] is False
    assert "ade_ops" in payload["tags"]


# ── Executor wiring through the supervisor ────────────────────────────────────

def _run(skill, **inputs):
    return run_skill(OpsCommandRequest(skill=skill, inputs=inputs, business_id=BIZ, env_id="env-1"))


def test_cost_executor_emits_blocked_recommendations_by_default(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = _run("ade.cost.show_hotspots")
    assert r.status == OpsStatus.BLOCKED  # no billing wired
    assert r.null_reason == OpsNullReason.DATA_SOURCE_NOT_CONFIGURED
    assert len(r.recommendations) == 4  # one per provider
    assert all(c["category"] == "cost" for c in r.recommendations)
    assert all(c["expected_impact"] is None for c in r.recommendations)  # no savings


def test_rightsize_executor_blocked_candidate_never_applies(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = _run("ade.compute.recommend_rightsize", resource_id="cl-1")
    assert r.status == OpsStatus.BLOCKED  # utilization never wired in PR 4
    assert r.recommendation is None
    assert len(r.recommendations) == 4
    assert all(c["status"] == "blocked" and c["dry_run_artifact"] is None for c in r.recommendations)


def test_freshness_executor_attaches_recommendation(monkeypatch):
    from datetime import datetime, timedelta, timezone

    from app.services.ade_ops import freshness
    reading = freshness.FreshnessReading(
        product_id="telemetry.stream_ingest", status="stale",
        as_of=datetime.now(timezone.utc) - timedelta(seconds=4000), age_seconds=4000,
        detail=None, source="tel_pipeline_status")
    monkeypatch.setattr(freshness, "read_product", lambda p, e, b: reading)
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = _run("ade.freshness.assess", data_product_id="telemetry.stream_ingest")
    assert r.status == OpsStatus.DEGRADED
    assert len(r.recommendations) == 1
    art = r.recommendations[0]
    assert art["category"] == "freshness" and "candidate" in art["recommendation"].lower()
    assert art["risk_tier"] == int(RiskTier.RECOMMENDATION)


def test_recommendations_serialize_in_result_dict(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = _run("ade.cost.show_hotspots")
    d = r.to_dict()
    assert "recommendations" in d and isinstance(d["recommendations"], list)
    assert d["recommendations"][0]["recommendation_id"].startswith("aderec-cost-")


def test_no_provider_execution_token_in_recommendations_module():
    import inspect
    src = inspect.getsource(rec).lower()
    for tok in ("subprocess", "os.system", "alter table", "run-now", "start-job-run",
                "modify-instance", "terminate-", "gcloud ", "aws ", "snowsql"):
        assert tok not in src, f"recommendations must never execute; found {tok!r}"
