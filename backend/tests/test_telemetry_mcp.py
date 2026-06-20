"""Tests for the telemetry MCP tools (Ticket 3).

Covers: telemetry tools are registered + READ-only; JSON-Schema input validation; an allowed read call
runs through the audited executor and writes an audit receipt; an out-of-scope call is denied with the
NAMED policy reason and a denied audit receipt; the /mcp/tools + /mcp/check endpoints.

The telemetry tools are registered at import time by app.main (_register_all_tools), which conftest
imports — so they are already in the global registry here; we never re-register (that would dup-raise).
"""
from unittest.mock import patch
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.mcp.auth import McpContext
from app.mcp.registry import registry
from app.mcp.schemas.telemetry_tools import GetTriggeringPredictionInput
from app.mcp.tools.telemetry_tools import (
    SCOPE_DENIED_REASON, TELEMETRY_TOOL_NAMES, telemetry_scoped_call,
)

BIZ = str(uuid4())


# ── Registration: telemetry tools exist and are read-only ──────────────────────
def test_telemetry_tools_registered_and_read_only():
    for name in TELEMETRY_TOOL_NAMES:
        tool = registry.get(name)
        assert tool is not None, f"{name} not registered"
        assert tool.module == "telemetry"
        assert tool.permission == "read", f"{name} must be read-only"
    # no telemetry write tool exists
    writes = [t.name for t in registry.list_by_module("telemetry") if t.permission == "write"]
    assert writes == [], f"unexpected telemetry write tools: {writes}"


# ── JSON-Schema validation ─────────────────────────────────────────────────────
def test_input_schema_rejects_bad_payload():
    # missing required fields
    with pytest.raises(ValidationError):
        GetTriggeringPredictionInput.model_validate({"env_id": "telemetry-demo"})
    # extra field forbidden (model_config extra=forbid)
    with pytest.raises(ValidationError):
        GetTriggeringPredictionInput.model_validate(
            {"env_id": "telemetry-demo", "business_id": BIZ, "run_key": "r", "fire_tick": 1, "x": 9})


def test_input_schema_accepts_valid_payload():
    inp = GetTriggeringPredictionInput.model_validate(
        {"env_id": "telemetry-demo", "business_id": BIZ, "run_key": "smap_msl:D-4:test", "fire_tick": 728})
    assert inp.fire_tick == 728


# ── Allowed read call: runs through execute_tool and writes an audit receipt ────
def test_allowed_read_call_executes_and_audits(fake_cursor):
    # get_triggering_prediction: resolve_tenant_id -> _run_id_for_key (empty -> missing_run, no DB shape needed)
    fake_cursor.push_result([{"tenant_id": str(uuid4())}])   # resolve_tenant_id
    fake_cursor.push_result([])                              # no run -> {"null_reason":"missing_run"}
    ctx = McpContext(actor="telemetry_demo", token_valid=True, resolved_scope={"business_id": BIZ})
    with patch("app.services.audit.record_event") as rec, \
         patch("app.services.governance.record_decision"):
        res = telemetry_scoped_call(
            "telemetry.get_triggering_prediction",
            {"env_id": "telemetry-demo", "business_id": BIZ, "run_key": "r", "fire_tick": 1}, ctx)
    assert res["allowed"] is True
    assert res["output"]["null_reason"] == "missing_run"   # fail-closed, but the call succeeded
    # an audit receipt was written for the allowed call
    rec.assert_called_once()
    assert rec.call_args.kwargs["action"] == "mcp.tool_call"
    assert rec.call_args.kwargs["tool_name"] == "telemetry.get_triggering_prediction"
    assert rec.call_args.kwargs["success"] is True


# ── Denied (out-of-scope) call: named policy reason + denied audit receipt ──────
def test_out_of_scope_call_denied_with_named_reason_and_audit():
    ctx = McpContext(actor="telemetry_demo", token_valid=True, resolved_scope={"business_id": BIZ})
    with patch("app.services.audit.record_event") as rec:
        res = telemetry_scoped_call("repe.get_fund_summary", {"x": 1}, ctx)
    assert res["allowed"] is False
    assert res["null_reason"] == SCOPE_DENIED_REASON == "tool_not_in_telemetry_scope"
    # denied calls are auditable too
    rec.assert_called_once()
    assert rec.call_args.kwargs["success"] is False
    assert rec.call_args.kwargs["tool_name"] == "repe.get_fund_summary"


# ── Endpoints ───────────────────────────────────────────────────────────────────
def test_mcp_tools_endpoint_lists_telemetry_tools(client):
    resp = client.get("/api/telemetry/mcp/tools")
    assert resp.status_code == 200
    d = resp.json()
    names = {t["name"] for t in d["tools"]}
    assert TELEMETRY_TOOL_NAMES <= names
    assert d["all_read_only"] is True
    assert d["scope_policy"]["denied_reason"] == "tool_not_in_telemetry_scope"
    # every listed tool exposes typed input fields incl. the tenant scope
    for t in d["tools"]:
        assert "business_id" in t["input_fields"] and "env_id" in t["input_fields"]


def test_mcp_check_endpoint_denies_out_of_scope(client):
    resp = client.post("/api/telemetry/mcp/check",
                       json={"business_id": BIZ, "tool_name": "repe.get_fund_summary"})
    assert resp.status_code == 200
    d = resp.json()
    assert d["allowed"] is False
    assert d["null_reason"] == "tool_not_in_telemetry_scope"
