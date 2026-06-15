"""Tests for the read-only connector lifecycle (ADE PR 2).

Run with: cd backend && python -m pytest tests/test_ade_connector_lifecycle.py -x -q

Covers the credential + state matrix:
  - declared-only (no validators run)
  - read_validated (a safe validator ran and returned OK)
  - credential_pending (validator reports missing credentials)
  - degraded (validator reports partial / errors out)
  - blocked (validator forbidden by policy)
  - unavailable provider (no validator -> declared floor + null_reason)
  - endpoint fails closed on unexpected error

No live DB or cloud is touched: the registry validator is in-process, and the
other outcomes are exercised by injecting validators.
"""
import os

import pytest

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.mcp.registry import registry  # noqa: E402
from app.services import ade_connector_lifecycle as lifecycle  # noqa: E402
from app.services import ade_connector_validators as validators  # noqa: E402
from app.services.ade_connector_validators import (  # noqa: E402
    ValidationOutcome,
    ValidationResult,
    Validator,
)

VALID_STATES = {
    "declared", "discovered", "credential_pending", "validating",
    "read_validated", "degraded", "blocked", "retired",
}


@pytest.fixture(autouse=True)
def _populated_registry():
    """Repopulate the registry: other test files clear the global registry."""
    from app.mcp.server import _register_all_tools

    registry.clear()
    _register_all_tools()
    yield


def _row(report, provider):
    return next(c for c in report.connectors if c.provider == provider)


# ── service-level state matrix ───────────────────────────────────────────────

def test_all_states_valid_and_every_connector_present():
    report = lifecycle.compute_lifecycle(run_validators=True)
    from app.services import ade_connectors

    assert len(report.connectors) == len(ade_connectors.CONNECTORS)
    for c in report.connectors:
        assert c.state.value in VALID_STATES


def test_declared_only_floor_no_validators():
    """With validators off, nothing reaches read_validated and floors carry null_reason."""
    report = lifecycle.compute_lifecycle(run_validators=False)
    for c in report.connectors:
        assert c.state.value != "read_validated"
        assert c.receipt is None
        # Every floor explains why it is not validated.
        assert c.null_reason is not None


def test_missing_declares_to_declared_state():
    report = lifecycle.compute_lifecycle(run_validators=False)
    gh = _row(report, "GitHub (PRs/issues)")  # declared status "missing"
    assert gh.declared_status == "missing"
    assert gh.state.value == "declared"
    assert gh.null_reason == "no_implementation"


def test_stub_declares_to_discovered_state():
    report = lifecycle.compute_lifecycle(run_validators=False)
    dbx = _row(report, "Databricks")  # declared status "stub"
    assert dbx.state.value == "discovered"
    assert dbx.null_reason == "implementation_is_stub"


def test_read_validated_only_with_real_validator():
    """Git has the in-process registry validator -> read_validated with a receipt."""
    report = lifecycle.compute_lifecycle(run_validators=True)
    git = _row(report, "Git (local repo)")
    assert git.state.value == "read_validated"
    assert git.null_reason is None
    assert git.receipt is not None
    assert git.receipt["outcome"] == "ok"
    assert "registered" in (git.receipt["detail"] or "")


def test_no_validator_keeps_floor_with_null_reason():
    """A live connector with no validator stays at discovered + null_reason."""
    report = lifecycle.compute_lifecycle(run_validators=True)
    # Confluent is "live" but has no safe runtime validator registered.
    conf = _row(report, "Confluent Cloud / Kafka")
    assert conf.state.value == "discovered"
    assert conf.null_reason == "no_validator_available"
    assert conf.receipt is None


def test_credential_missing_maps_to_credential_pending(monkeypatch):
    monkeypatch.setitem(
        validators._VALIDATORS,
        "Git (local repo)",
        Validator("fake", "fake", lambda: ValidationResult(
            ValidationOutcome.CREDENTIAL_MISSING, detail="no creds", checked="x")),
    )
    report = lifecycle.compute_lifecycle(run_validators=True)
    git = _row(report, "Git (local repo)")
    assert git.state.value == "credential_pending"
    assert git.null_reason == "credentials_not_configured"
    assert git.receipt["outcome"] == "credential_missing"


def test_degraded_outcome_maps_to_degraded(monkeypatch):
    monkeypatch.setitem(
        validators._VALIDATORS,
        "Git (local repo)",
        Validator("fake", "fake", lambda: ValidationResult(
            ValidationOutcome.DEGRADED, detail="partial", checked="x")),
    )
    git = _row(lifecycle.compute_lifecycle(run_validators=True), "Git (local repo)")
    assert git.state.value == "degraded"
    assert git.null_reason == "partial"


def test_blocked_outcome_maps_to_blocked(monkeypatch):
    monkeypatch.setitem(
        validators._VALIDATORS,
        "Git (local repo)",
        Validator("fake", "fake", lambda: ValidationResult(
            ValidationOutcome.BLOCKED, detail="write_path_not_exercised", checked="x")),
    )
    git = _row(lifecycle.compute_lifecycle(run_validators=True), "Git (local repo)")
    assert git.state.value == "blocked"
    assert git.null_reason == "write_path_not_exercised"


def test_validator_exception_degrades_not_raises(monkeypatch):
    def boom():
        raise RuntimeError("network down")

    monkeypatch.setitem(
        validators._VALIDATORS,
        "Git (local repo)",
        Validator("fake", "checks nothing", boom),
    )
    git = _row(lifecycle.compute_lifecycle(run_validators=True), "Git (local repo)")
    assert git.state.value == "degraded"
    assert git.null_reason == "validator_error"
    assert git.receipt["outcome"] == "error"


def test_risk_tier_present_and_known():
    report = lifecycle.compute_lifecycle(run_validators=False)
    for c in report.connectors:
        assert c.risk_tier in {"low", "medium", "high"}


def test_no_secrets_in_receipts():
    """Receipts must never carry secret-looking values."""
    report = lifecycle.compute_lifecycle(run_validators=True)
    for c in report.connectors:
        if c.receipt:
            blob = str(c.receipt).lower()
            for needle in ("password", "secret", "token", "api_key", "apikey"):
                assert needle not in blob


# ── endpoint-level ───────────────────────────────────────────────────────────

def test_endpoint_healthy_shape(client):
    resp = client.get("/api/ade/connector-lifecycle")
    assert resp.status_code == 200
    body = resp.json()
    assert body["null_reason"] is None
    assert len(body["connectors"]) > 0
    git = next(c for c in body["connectors"] if c["provider"] == "Git (local repo)")
    assert git["state"] == "read_validated"
    assert git["receipt"]["outcome"] == "ok"
    for c in body["connectors"]:
        assert c["state"] in VALID_STATES
        assert "risk_tier" in c
        assert "declared_status" in c


def test_endpoint_validate_false_floor(client):
    body = client.get("/api/ade/connector-lifecycle?validate=false").json()
    assert body["null_reason"] is None
    for c in body["connectors"]:
        assert c["state"] != "read_validated"
        assert c["receipt"] is None


def test_endpoint_fails_closed(client, monkeypatch):
    def boom(**kwargs):
        raise RuntimeError("service exploded")

    monkeypatch.setattr(lifecycle, "compute_lifecycle", boom)
    resp = client.get("/api/ade/connector-lifecycle")
    assert resp.status_code == 200  # never 500
    body = resp.json()
    assert body["connectors"] == []
    assert body["null_reason"] == "connector_lifecycle_unavailable"


def test_pr1_connectors_endpoint_unchanged(client):
    """Regression guard: the PR 1 declared inventory endpoint still works."""
    body = client.get("/api/ade/connectors").json()
    assert body["null_reason"] is None
    assert len(body["connectors"]) > 0
    for c in body["connectors"]:
        assert c["status"] in {"live", "stub", "script", "missing"}


def test_optional_postgres_validator_degrades_without_db():
    """The opt-in Postgres validator returns DEGRADED (not raise) with no DB."""
    v = validators.OPTIONAL_VALIDATORS["Supabase/Postgres"]
    result = v()
    assert result.outcome in {ValidationOutcome.OK, ValidationOutcome.DEGRADED}
    # In CI there is no DB, so it degrades rather than raising.
    assert result.checked == "read-only Postgres ping"
