"""CI guardrail tests for the McpContext constructor contract.

Two enforcement layers:
  1. Runtime — constructing McpContext with forbidden kwargs raises TypeError.
  2. Static — verification/lint/mcp_context_contract.py walks the backend AST
     and flags any McpContext(...) call passing a kwarg not in the dataclass.

When this test fails, do NOT work around it by adding a field to McpContext or
an exception to the lint. Re-route the call so env_id / business_id / user go
into resolved_scope (a dict), not into constructor kwargs.

See MEMORY.md for the original incident: passing forbidden kwargs raises
TypeError before the outer SSE try/except, silently terminating the stream.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def test_mcp_context_rejects_forbidden_kwargs_at_construction():
    from app.mcp.auth import McpContext

    with pytest.raises(TypeError):
        McpContext(user="api", token_valid=True)  # type: ignore[call-arg]

    with pytest.raises(TypeError):
        McpContext(actor="api", token_valid=True, env_id="env")  # type: ignore[call-arg]

    with pytest.raises(TypeError):
        McpContext(actor="api", token_valid=True, business_id="biz")  # type: ignore[call-arg]


def test_mcp_context_accepts_contract_kwargs():
    from app.mcp.auth import McpContext

    ctx = McpContext(actor="api", token_valid=True)
    assert ctx.actor == "api"
    assert ctx.token_valid is True
    assert ctx.resolved_scope is None
    assert ctx.context_envelope is None

    ctx_full = McpContext(
        actor="api",
        token_valid=True,
        resolved_scope={"env_id": "e", "business_id": "b"},
        context_envelope={"page": "dashboard"},
    )
    assert ctx_full.resolved_scope == {"env_id": "e", "business_id": "b"}
    assert ctx_full.context_envelope == {"page": "dashboard"}


def test_no_forbidden_kwargs_in_backend_source():
    from verification.lint.mcp_context_contract import run_lint

    report = run_lint()
    if report.violations:
        formatted = "\n".join(
            f"  [{v.forbidden_kwarg}] {v.file}:{v.line}\n      {v.snippet}"
            for v in report.violations
        )
        raise AssertionError(
            "McpContext contract violation(s) detected. "
            "See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md and MEMORY.md.\n"
            f"Allowed kwargs: actor, token_valid, resolved_scope, context_envelope.\n"
            f"{len(report.violations)} violation(s):\n{formatted}"
        )
