"""ADE Ops PR 5B — simulated non-prod execution only. Real providers impossible."""
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.services.ade_ops import approvals, simulation  # noqa: E402
from app.services.ade_ops.models import RiskTier  # noqa: E402

T0 = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)


def _rec(**over):
    base = {
        "recommendation_id": "aderec-compute-x", "command_name": "ade.compute.recommend_rightsize",
        "category": "compute", "provider": "databricks", "target_ref": "cl-1",
        "target_type": "compute_resource", "risk_tier": int(RiskTier.DRY_RUN),
        "status": "degraded", "rollback_required": True, "observation_window": "14-day",
        "evidence": [{"label": "util", "value": 0.1, "source": "mock"}],
    }
    base.update(over)
    return base


def _approved(now=T0):
    r = approvals.create_approval_request(_rec(), now=now, rollback_plan="snapshot+restore",
                                          observation_window="14-day")
    approvals.approve(r, approver="paul", token=r.approval_token, now=now)
    return r


# ── gates: blocked unless approved + preflight + simulation mode ──────────────

def test_without_approval_blocked():
    r = approvals.create_approval_request(_rec(), now=T0)
    out = simulation.simulate_execution(r, mode="simulation", now=T0)
    assert out["executed"] is False and out["reason"].startswith("not_approved")


def test_expired_approval_blocked():
    r = approvals.create_approval_request(_rec(), now=T0, ttl_seconds=60)
    approvals.approve(r, approver="paul", token=r.approval_token, now=T0)
    out = simulation.simulate_execution(r, mode="simulation", now=T0 + timedelta(seconds=120))
    assert out["executed"] is False and out["reason"].startswith("not_approved:expired")


def test_missing_evidence_blocked():
    r = _approved()
    r.rollback_plan = None  # break preflight
    r.preflight = None
    out = simulation.simulate_execution(r, mode="simulation", now=T0)
    assert out["executed"] is False and out["reason"].startswith("preflight_failed")


# ── the happy path: simulation succeeds, opens observation window ─────────────

def test_valid_simulation_succeeds():
    r = _approved()
    out = simulation.simulate_execution(r, mode="simulation", now=T0)
    assert out["executed"] is True
    assert out["execution_mode"] == "simulation"
    assert out["observation_window_opened_at"] == T0.isoformat()
    assert r.executed is True
    assert any("no provider command issued" in line.lower() for line in out["simulated_plan"])


# ── real provider modes remain blocked (no real executor exists) ──────────────

def test_real_modes_blocked():
    r = _approved()
    for mode in ("nonprod", "prod"):
        out = simulation.simulate_execution(r, mode=mode, now=T0)
        assert out["executed"] is False
        assert out["reason"] == "real_execution_not_enabled"
        assert out["execution_mode"] is None


def test_unknown_mode_blocked():
    r = _approved()
    out = simulation.simulate_execution(r, mode="yolo", now=T0)
    assert out["executed"] is False and out["reason"].startswith("unknown_execution_mode")


# ── simulated rollback touches no provider ────────────────────────────────────

def test_simulated_rollback_records_but_no_provider():
    r = _approved()
    simulation.simulate_execution(r, mode="simulation", now=T0)
    out = simulation.simulate_rollback(r, now=T0 + timedelta(minutes=5))
    assert out["rolled_back"] is True
    assert out["execution_mode"] == "simulation"
    assert any("no provider command issued" in line.lower() for line in out["simulated_plan"])


def test_rollback_requires_plan_and_prior_execution():
    r = _approved()
    r.rollback_plan = None
    assert simulation.simulate_rollback(r, now=T0)["reason"] == "no_rollback_plan"
    r2 = _approved()  # has plan but never executed
    assert simulation.simulate_rollback(r2, now=T0)["reason"] == "nothing_to_roll_back"


# ── real execution stays impossible: PR 5A invariant intact + no exec tokens ──

def test_real_execution_still_off_in_approvals():
    assert approvals.EXECUTION_ENABLED is False
    r = _approved()
    # the PR 5A real-execution gate is unchanged and still blocked
    assert approvals.attempt_execution(r, T0)["executed"] is False


def test_no_provider_execution_token_in_simulation_module():
    import ast
    import inspect
    tree = ast.parse(inspect.getsource(simulation))
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            b = node.body
            if b and isinstance(b[0], ast.Expr) and isinstance(getattr(b[0], "value", None), ast.Constant) \
                    and isinstance(b[0].value.value, str):
                b[0].value.value = ""
    code = ast.unparse(tree).lower()
    for tok in ("subprocess", "os.system", "popen", "requests.", "httpx", "boto3",
                "snowflake.connector", "databricks", "alter table", "alter warehouse",
                "run-now", "start-job-run", "gcloud", "aws "):
        assert tok not in code, f"PR 5B simulation must reach no provider; found {tok!r}"
