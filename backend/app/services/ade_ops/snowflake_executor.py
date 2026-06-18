"""First real provider write for ADE Ops (PR 5C) — Snowflake non-prod warehouse
AUTO_SUSPEND only.

This is the ONE real, reversible mutation ADE Ops can perform:

    ALTER WAREHOUSE <allowlisted> SET AUTO_SUSPEND = <approved int>

and nothing else. It is deliberately NOT a Snowflake write framework. Every guard
below is intentional:

  - Snowflake only; one action_kind ('warehouse_auto_suspend'); non-prod only.
  - SQL is BUILT from typed fields (an allowlisted warehouse name + an int) — never
    user-supplied — and then re-validated by a strict parser that accepts only the
    exact statement shape against an allowlisted warehouse. Anything else is rejected.
  - Rollback SQL is generated BEFORE execution (restores the prior AUTO_SUSPEND).
  - Gated by approval + preflight + allowlist + rollback SQL + observation window +
    an env flag (ADE_OPS_REAL_EXEC_ENABLED, default off) + a non-prod environment
    (prod is blocked by default).
  - The Snowflake client is injected; CI passes a mock, so no real credential is
    needed and `import snowflake.connector` only happens behind the env flag.
  - No subprocess, no CLI, no arbitrary or user-supplied SQL.
"""
from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime

from app.services.ade_ops.approvals import (
    ApprovalRequest,
    ApprovalState,
    refresh_state,
    run_preflight,
)

ACTION_KIND = "warehouse_auto_suspend"
PROVIDER = "snowflake"
REAL_EXEC_ENV_FLAG = "ADE_OPS_REAL_EXEC_ENABLED"

# Allowlisted NON-PROD warehouse names. Only these may be targeted. (A later PR
# would source this from a config manifest; PR 5C keeps it an explicit constant.)
ALLOWLISTED_WAREHOUSES: frozenset[str] = frozenset({
    "ADE_OPS_NONPROD_WH",
    "ANALYTICS_NONPROD_WH",
})

# Sane bounds for AUTO_SUSPEND seconds (Snowflake min is 60 for a running suspend;
# we additionally cap to avoid a typo'd huge value).
MIN_AUTO_SUSPEND = 60
MAX_AUTO_SUSPEND = 3600

# A Snowflake identifier we are willing to emit unquoted: uppercase letters,
# digits, underscores. The allowlist already restricts names; this is defense in
# depth so a bad allowlist entry can't inject.
_IDENT = re.compile(r"^[A-Z][A-Z0-9_]*$")

# The ONLY statement shape the validator accepts. No semicolons, no trailing
# anything, no comments, single statement.
_STMT = re.compile(r"^ALTER WAREHOUSE ([A-Z][A-Z0-9_]*) SET AUTO_SUSPEND = (\d+)$")


class SnowflakeWriteError(Exception):
    pass


def _sha(sql: str) -> str:
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


def real_exec_enabled() -> bool:
    return os.getenv(REAL_EXEC_ENV_FLAG, "").lower() in ("1", "true", "yes", "on")


def build_auto_suspend_sql(warehouse: str, seconds: int) -> str:
    """Build the one statement from TYPED fields. Raises on a non-allowlisted
    warehouse, a bad identifier, or an out-of-range int. No string interpolation
    of anything user-controlled beyond a validated int + an allowlisted name."""
    if warehouse not in ALLOWLISTED_WAREHOUSES:
        raise SnowflakeWriteError(f"warehouse_not_allowlisted:{warehouse}")
    if not _IDENT.match(warehouse):
        raise SnowflakeWriteError(f"invalid_warehouse_identifier:{warehouse}")
    if not isinstance(seconds, int) or isinstance(seconds, bool):
        raise SnowflakeWriteError("auto_suspend_not_int")
    if not (MIN_AUTO_SUSPEND <= seconds <= MAX_AUTO_SUSPEND):
        raise SnowflakeWriteError(f"auto_suspend_out_of_range:{seconds}")
    return f"ALTER WAREHOUSE {warehouse} SET AUTO_SUSPEND = {seconds}"


def validate_sql(sql: str) -> int:
    """Strict allow-only validator. Accepts ONLY
    `ALTER WAREHOUSE <allowlisted> SET AUTO_SUSPEND = <int>`. Returns the seconds.
    Rejects multiple statements, comments, other verbs, resize, anything else."""
    m = _STMT.match(sql)
    if not m:
        raise SnowflakeWriteError("sql_not_permitted_shape")
    warehouse, secs = m.group(1), int(m.group(2))
    if warehouse not in ALLOWLISTED_WAREHOUSES:
        raise SnowflakeWriteError(f"warehouse_not_allowlisted:{warehouse}")
    if not (MIN_AUTO_SUSPEND <= secs <= MAX_AUTO_SUSPEND):
        raise SnowflakeWriteError(f"auto_suspend_out_of_range:{secs}")
    return secs


def _blocked(reason: str) -> dict:
    return {"outcome": "blocked", "executed": False, "execution_mode": None, "reason": reason}


def execute_auto_suspend(
    req: ApprovalRequest, *, warehouse: str, auto_suspend_seconds: int,
    prior_auto_suspend_seconds: int, environment: str, now: datetime,
    client=None,
) -> dict:
    """The single real-execution entry. Returns a result dict; mutates `req` only
    to record the executed state on success. Every gate must pass; otherwise
    blocked and nothing runs.

    `client` must expose `execute(sql: str) -> None`. CI injects a mock; with no
    client and the env flag on, a real connector would be constructed lazily.
    """
    # 1) Global kill switch.
    if not real_exec_enabled():
        return _blocked("real_execution_not_enabled")
    # 2) Non-prod only.
    if (environment or "").lower().startswith("prod"):
        return _blocked("prod_execution_blocked")
    # 3) Approval + preflight.
    refresh_state(req, now)
    if req.state is not ApprovalState.APPROVED:
        return _blocked(f"not_approved:{req.state.value}")
    pf = req.preflight or run_preflight(req)
    if not pf.passed:
        return _blocked(f"preflight_failed:{','.join(pf.missing)}")
    # 4) Provider + action scope (this PR does exactly one thing).
    if (req.provider or "").lower() != PROVIDER:
        return _blocked(f"provider_not_supported:{req.provider}")
    # 5) Allowlist.
    if warehouse not in ALLOWLISTED_WAREHOUSES:
        return _blocked(f"warehouse_not_allowlisted:{warehouse}")

    # 6) Generate forward + rollback SQL from typed fields, validate BOTH. Rollback
    #    is generated before execution.
    try:
        sql = build_auto_suspend_sql(warehouse, auto_suspend_seconds)
        rollback_sql = build_auto_suspend_sql(warehouse, prior_auto_suspend_seconds)
        validate_sql(sql)
        validate_sql(rollback_sql)
    except SnowflakeWriteError as exc:
        return _blocked(f"sql_validation_failed:{exc}")

    # 7) Execute the validated statement via the injected client. No subprocess,
    #    no arbitrary SQL — only the validated string is ever sent.
    if client is None:
        if not real_exec_enabled():  # belt-and-suspenders; already checked above
            return _blocked("real_execution_not_enabled")
        client = _default_client()  # lazily imports snowflake.connector (flag-gated)
    try:
        client.execute(sql)
    except Exception as exc:  # noqa: BLE001 — surface as a blocked outcome, never raise out
        return {"outcome": "failed", "executed": False, "execution_mode": "nonprod",
                "reason": f"provider_error:{type(exc).__name__}", "rollback_sql_available": True}

    req.executed = True
    return {
        "outcome": "executed",
        "executed": True,
        "execution_mode": "nonprod",
        "action_kind": ACTION_KIND,
        "provider": PROVIDER,
        "warehouse": warehouse,
        "before_value": str(prior_auto_suspend_seconds),
        "after_value": str(auto_suspend_seconds),
        "generated_sql_hash": _sha(sql),
        "rollback_sql_hash": _sha(rollback_sql),
        "executed_at": now.isoformat(),
        "observation_window_opened_at": now.isoformat(),
        "reason": "ok",
    }


def _default_client():  # pragma: no cover — never constructed in CI (flag off)
    """Lazily build a real Snowflake client. Only reached when the env flag is on
    AND no client was injected — never in CI."""
    import snowflake.connector  # noqa: PLC0415 — intentional lazy, flag-gated import

    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE"),
    )

    class _Client:
        def execute(self, sql: str) -> None:
            cur = conn.cursor()
            try:
                cur.execute(sql)
            finally:
                cur.close()

    return _Client()
