"""ADE Ops PR 5A — approval escrow + preflight. The spine, with NO execution."""
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.services.ade_ops import approvals  # noqa: E402
from app.services.ade_ops.approvals import ApprovalState  # noqa: E402
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


def _full(now=T0):
    """A request with every preflight dimension present + approved."""
    r = approvals.create_approval_request(_rec(), now=now, rollback_plan="snapshot+restore",
                                          observation_window="14-day")
    approvals.approve(r, approver="paul", token=r.approval_token, now=now)
    return r


# ── recommendation -> approval request ────────────────────────────────────────

def test_recommendation_becomes_pending_request():
    r = approvals.create_approval_request(_rec(), now=T0)
    assert r.state is ApprovalState.PENDING
    assert r.approval_token and r.recommendation_id == "aderec-compute-x"
    assert r.executed is False


def test_blocked_recommendation_escrows_blocked():
    r = approvals.create_approval_request(_rec(status="blocked"), now=T0)
    assert r.state is ApprovalState.BLOCKED
    # cannot be approved out of blocked
    approvals.approve(r, approver="paul", token=r.approval_token, now=T0)
    assert r.state is ApprovalState.BLOCKED and r.null_reason == "recommendation_blocked"


# ── human approval + TTL ──────────────────────────────────────────────────────

def test_human_can_approve():
    r = approvals.create_approval_request(_rec(), now=T0)
    approvals.approve(r, approver="paul", token=r.approval_token, now=T0)
    assert r.state is ApprovalState.APPROVED and r.approver == "paul" and r.approved_at


def test_wrong_token_fails_closed():
    r = approvals.create_approval_request(_rec(), now=T0)
    approvals.approve(r, approver="mallory", token="not-the-token", now=T0)
    assert r.state is ApprovalState.PENDING and r.null_reason == "invalid_approval_token"


def test_approval_expires_after_ttl():
    r = approvals.create_approval_request(_rec(), now=T0, ttl_seconds=60)
    later = T0 + timedelta(seconds=61)
    approvals.approve(r, approver="paul", token=r.approval_token, now=later)
    assert r.state is ApprovalState.EXPIRED and r.null_reason == "approval_expired"


def test_refresh_state_marks_expired():
    r = approvals.create_approval_request(_rec(), now=T0, ttl_seconds=60)
    approvals.refresh_state(r, T0 + timedelta(seconds=120))
    assert r.state is ApprovalState.EXPIRED


# ── preflight gate (requires all six) ─────────────────────────────────────────

def test_preflight_requires_all_six():
    r = approvals.create_approval_request(_rec(), now=T0)  # no rollback_plan supplied
    # rollback_required=True maps to rollback_plan="required" in create; remove it to test missing
    r.rollback_plan = None
    r.observation_window = None
    pf = approvals.run_preflight(r)
    assert pf.passed is False
    assert "rollback_plan" in pf.missing and "observation_window" in pf.missing
    assert set(pf.checked) == set(approvals.PREFLIGHT_REQUIRED)


def test_preflight_passes_when_complete():
    r = _full()
    pf = approvals.run_preflight(r)
    assert pf.passed is True and pf.missing == []


# ── THE invariant: even approved + preflight-passed does NOT execute ──────────

def test_execution_capability_is_off():
    assert approvals.EXECUTION_ENABLED is False


def test_approved_preflight_passed_still_cannot_execute():
    r = _full()
    approvals.run_preflight(r)
    allowed, reason = approvals.can_execute(r, T0)
    assert allowed is False and reason == "execution_not_enabled"


def test_attempt_execution_never_executes():
    r = _full()
    approvals.run_preflight(r)
    out = approvals.attempt_execution(r, T0)
    assert out["executed"] is False
    assert out["execution_enabled"] is False
    assert r.executed is False


def test_not_approved_cannot_execute():
    r = approvals.create_approval_request(_rec(), now=T0)
    allowed, reason = approvals.can_execute(r, T0)
    assert allowed is False and reason.startswith("not_approved")


def test_preflight_failed_cannot_execute():
    r = _full()
    r.rollback_plan = None  # break preflight
    r.preflight = None
    allowed, reason = approvals.can_execute(r, T0)
    assert allowed is False and reason.startswith("preflight_failed")


# ── allowlist registry is shape only; tier 3/4 non-mutating; no exec path ─────

def test_allowlist_is_shape_only_and_disabled():
    for entry in approvals.EXECUTION_ALLOWLIST:
        assert entry.enabled is False                  # nothing execution-enabled in PR 5A
        assert entry.requires_rollback is True
        # action_kind is a category, not a command
        assert " " not in entry.action_kind and "--" not in entry.action_kind


def test_no_provider_execution_token_in_module():
    """Scan executable code only — strip docstrings/comments so a prose promise
    like 'no subprocess here' isn't a false positive (the PR-1 no-shell lesson)."""
    import ast
    import inspect
    tree = ast.parse(inspect.getsource(approvals))
    # Drop docstrings.
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            body = node.body
            if body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], "value", None), ast.Constant) \
                    and isinstance(body[0].value.value, str):
                body[0].value.value = ""
    code = ast.unparse(tree).lower()  # comments are already gone (ast drops them)
    for tok in ("subprocess", "os.system", "popen", "alter table", "alter warehouse",
                "run-now", "start-job-run", "modify-instance", "gcloud ", "aws ", "snowsql",
                "databricks jobs"):
        assert tok not in code, f"PR 5A must not execute; found {tok!r}"
