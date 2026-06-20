"""ADE Ops PR 5C — first real provider write (Snowflake non-prod AUTO_SUSPEND).

Strict: every gate must block; SQL is built from typed fields only and validated;
the validator rejects anything that is not the one allowed statement; CI uses a
mock client (no real credential); real execution is off unless the env flag is set.
"""
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

import pytest  # noqa: E402

from app.services.ade_ops import approvals  # noqa: E402
from app.services.ade_ops import snowflake_executor as sfx  # noqa: E402
from app.services.ade_ops.models import RiskTier  # noqa: E402
from app.services.ade_ops.snowflake_executor import SnowflakeWriteError  # noqa: E402

T0 = datetime(2026, 6, 18, 12, 0, 0, tzinfo=timezone.utc)
WH = "ADE_OPS_NONPROD_WH"


class MockClient:
    def __init__(self):
        self.executed: list[str] = []

    def execute(self, sql: str) -> None:
        self.executed.append(sql)


def _rec(**over):
    base = {
        "recommendation_id": "aderec-compute-x", "command_name": "ade.compute.recommend_rightsize",
        "category": "compute", "provider": "snowflake", "target_ref": WH,
        "target_type": "warehouse", "risk_tier": int(RiskTier.PROD_WRITE),
        "status": "degraded", "rollback_required": True, "observation_window": "14-day",
        "evidence": [{"label": "util", "value": 0.1, "source": "mock"}],
    }
    base.update(over)
    return base


def _approved(**over):
    r = approvals.create_approval_request(_rec(**over), now=T0, rollback_plan="restore prior auto_suspend",
                                          observation_window="14-day")
    approvals.approve(r, approver="paul", token=r.approval_token, now=T0)
    return r


@pytest.fixture(autouse=True)
def _flag_on(monkeypatch):
    # Default the env flag ON for most tests; specific tests turn it off.
    monkeypatch.setenv(sfx.REAL_EXEC_ENV_FLAG, "true")


def _exec(req, *, env="nonprod", wh=WH, secs=300, prior=600, client=None):
    return sfx.execute_auto_suspend(
        req, warehouse=wh, auto_suspend_seconds=secs, prior_auto_suspend_seconds=prior,
        environment=env, now=T0, client=client or MockClient())


# ── SQL is built from typed fields; validator rejects everything else ─────────

def test_build_sql_from_typed_fields():
    assert sfx.build_auto_suspend_sql(WH, 300) == f"ALTER WAREHOUSE {WH} SET AUTO_SUSPEND = 300"


def test_build_rejects_non_allowlisted_and_bad_range():
    with pytest.raises(SnowflakeWriteError):
        sfx.build_auto_suspend_sql("EVIL_WH", 300)
    with pytest.raises(SnowflakeWriteError):
        sfx.build_auto_suspend_sql(WH, 5)        # below min
    with pytest.raises(SnowflakeWriteError):
        sfx.build_auto_suspend_sql(WH, 99999)    # above max
    with pytest.raises(SnowflakeWriteError):
        sfx.build_auto_suspend_sql(WH, True)     # bool is not an int here


def test_validator_accepts_only_the_one_statement():
    assert sfx.validate_sql(f"ALTER WAREHOUSE {WH} SET AUTO_SUSPEND = 120") == 120
    bad = [
        f"ALTER WAREHOUSE {WH} SET AUTO_SUSPEND = 120;",            # trailing semicolon
        f"ALTER WAREHOUSE {WH} SET AUTO_SUSPEND = 120; DROP TABLE x",  # piggyback
        f"ALTER WAREHOUSE {WH} SET WAREHOUSE_SIZE = 'XLARGE'",      # resize — not allowed
        f"ALTER WAREHOUSE {WH} SET AUTO_SUSPEND = 120 -- comment",  # comment
        "ALTER WAREHOUSE EVIL_WH SET AUTO_SUSPEND = 120",          # non-allowlisted
        "DROP WAREHOUSE " + WH,
        f"alter warehouse {WH.lower()} set auto_suspend = 120",     # wrong case / lower ident
        f"ALTER WAREHOUSE {WH} SET AUTO_SUSPEND = abc",            # non-int
    ]
    for sql in bad:
        with pytest.raises(SnowflakeWriteError):
            sfx.validate_sql(sql)


# ── every gate blocks ─────────────────────────────────────────────────────────

def test_env_flag_off_blocks(monkeypatch):
    monkeypatch.setenv(sfx.REAL_EXEC_ENV_FLAG, "")
    out = _exec(_approved())
    assert out["executed"] is False and out["reason"] == "real_execution_not_enabled"


def test_prod_environment_blocked():
    out = _exec(_approved(), env="prod")
    assert out["executed"] is False and out["reason"] == "prod_execution_blocked"


def test_without_approval_blocked():
    r = approvals.create_approval_request(_rec(), now=T0, rollback_plan="x", observation_window="14-day")
    out = _exec(r)
    assert out["executed"] is False and out["reason"].startswith("not_approved")


def test_expired_approval_blocked():
    r = approvals.create_approval_request(_rec(), now=T0, ttl_seconds=60, rollback_plan="x",
                                          observation_window="14-day")
    approvals.approve(r, approver="paul", token=r.approval_token, now=T0)
    out = sfx.execute_auto_suspend(r, warehouse=WH, auto_suspend_seconds=300,
                                   prior_auto_suspend_seconds=600, environment="nonprod",
                                   now=T0 + timedelta(seconds=120), client=MockClient())
    assert out["executed"] is False and out["reason"].startswith("not_approved:expired")


def test_missing_observation_blocked():
    r = approvals.create_approval_request(_rec(), now=T0, rollback_plan="x")  # no observation_window
    r.observation_window = None
    approvals.approve(r, approver="paul", token=r.approval_token, now=T0)
    out = _exec(r)
    assert out["executed"] is False and out["reason"].startswith("preflight_failed")


def test_missing_rollback_blocked():
    r = approvals.create_approval_request(_rec(), now=T0, observation_window="14-day")
    r.rollback_plan = None
    approvals.approve(r, approver="paul", token=r.approval_token, now=T0)
    out = _exec(r)
    assert out["executed"] is False and out["reason"].startswith("preflight_failed")


def test_non_allowlisted_warehouse_blocked():
    out = _exec(_approved(), wh="EVIL_WH")
    assert out["executed"] is False and out["reason"].startswith("warehouse_not_allowlisted")


def test_non_snowflake_provider_blocked():
    out = _exec(_approved(provider="databricks"))
    assert out["executed"] is False and out["reason"].startswith("provider_not_supported")


# ── happy path: the one real write, with the full receipt payload ─────────────

def test_valid_real_execution_runs_exactly_one_statement():
    client = MockClient()
    out = _exec(_approved(), client=client)
    assert out["executed"] is True and out["outcome"] == "executed"
    assert out["execution_mode"] == "nonprod" and out["action_kind"] == "warehouse_auto_suspend"
    # exactly one validated statement was sent
    assert client.executed == [f"ALTER WAREHOUSE {WH} SET AUTO_SUSPEND = 300"]
    assert out["before_value"] == "600" and out["after_value"] == "300"
    assert out["generated_sql_hash"] and out["rollback_sql_hash"]
    assert out["generated_sql_hash"] != out["rollback_sql_hash"]  # rollback differs


def test_rollback_sql_generated_before_execution_and_valid():
    # If the rollback value would be invalid, we block BEFORE running anything.
    client = MockClient()
    out = _exec(_approved(), prior=5, client=client)  # prior below min -> rollback invalid
    assert out["executed"] is False and out["reason"].startswith("sql_validation_failed")
    assert client.executed == []  # nothing ran


def test_provider_error_reports_failed_not_executed():
    class Boom:
        def execute(self, sql):
            raise RuntimeError("snowflake said no")
    out = _exec(_approved(), client=Boom())
    assert out["executed"] is False and out["outcome"] == "failed"
    assert out["reason"].startswith("provider_error")


# ── no arbitrary / user-supplied SQL; no subprocess ──────────────────────────

def test_no_user_supplied_sql_path():
    """The executor signature accepts typed ints + an allowlisted name only — there
    is no parameter through which a caller could pass SQL."""
    import inspect
    sig = inspect.signature(sfx.execute_auto_suspend)
    assert "sql" not in sig.parameters
    params = set(sig.parameters)
    assert params == {"req", "warehouse", "auto_suspend_seconds", "prior_auto_suspend_seconds",
                      "environment", "now", "client"}


def test_no_subprocess_token_in_module():
    import ast
    import inspect
    tree = ast.parse(inspect.getsource(sfx))
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            b = node.body
            if b and isinstance(b[0], ast.Expr) and isinstance(getattr(b[0], "value", None), ast.Constant) \
                    and isinstance(b[0].value.value, str):
                b[0].value.value = ""
    code = ast.unparse(tree).lower()
    for tok in ("subprocess", "os.system", "popen", "shell=true"):
        assert tok not in code, f"no shell path allowed; found {tok!r}"
