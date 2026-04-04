"""Tests for the deterministic assistant runtime contracts."""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

from pydantic import BaseModel

from app.assistant_runtime.degraded_responses import degraded_message
from app.assistant_runtime.execution_engine import prepare_tools
from app.assistant_runtime.prompt_registry import validate_prompt_registry
from app.assistant_runtime.skill_registry import validate_skill_registry
from app.assistant_runtime.skill_router import route_skill
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    ContextResolutionStatus,
    DegradedReason,
    Lane,
    PermissionMode,
    permission_satisfies,
)
from app.mcp.registry import ToolDef, ToolRegistry
from app.services.request_router import RouteDecision


class _DummyInput(BaseModel):
    model_config = {"extra": "forbid"}

    x: int = 1


def _dummy_handler(ctx, inp):
    return {"ok": True, "x": inp.x}


def test_skill_registry_and_prompts_validate():
    validate_skill_registry()
    validate_prompt_registry()


def test_permission_ordering_is_deterministic():
    assert permission_satisfies(PermissionMode.ANALYZE, PermissionMode.READ) is True
    assert permission_satisfies(PermissionMode.RETRIEVE, PermissionMode.ANALYZE) is False
    assert permission_satisfies(PermissionMode.WRITE_CONFIRMED, PermissionMode.ANALYZE) is True


def test_route_skill_is_deterministic_for_analysis():
    route = RouteDecision(
        lane="C",
        skip_rag=False,
        skip_tools=False,
        max_tool_rounds=2,
        max_tokens=512,
        temperature=0.2,
        is_write=False,
        model="gpt-5-mini",
    )
    context = ContextReceipt(
        environment_id="env_123",
        entity_type="fund",
        entity_id="fund_123",
        resolution_status=ContextResolutionStatus.RESOLVED,
    )
    routed = route_skill(
        message="compare irr trends across our funds",
        lane=Lane.C_ANALYSIS,
        route=route,
        context=context,
    )
    assert routed.selection.skill_id == "run_analysis"
    assert routed.selection.confidence > 0
    assert "compare" in routed.selection.triggers_matched


def test_prepare_tools_filters_by_lane_and_permission():
    reg = ToolRegistry()
    reg.register(
        ToolDef(
            name="test.lookup",
            description="Lookup",
            module="test",
            permission="read",
            input_model=_DummyInput,
            handler=_dummy_handler,
            skill_tags=("core", "lookup"),
            lane_tags=("B", "C"),
        )
    )
    reg.register(
        ToolDef(
            name="test.write",
            description="Write",
            module="test",
            permission="write",
            input_model=_DummyInput,
            handler=_dummy_handler,
            skill_tags=("write", "core"),
            lane_tags=("C", "D"),
        )
    )

    original = prepare_tools.__globals__["registry"]
    prepare_tools.__globals__["registry"] = reg
    try:
        lookup = prepare_tools(
            lane=Lane.B_LOOKUP,
            skill=type("SkillSelectionLike", (), {"skill_id": "lookup_entity"})(),
        )
        assert lookup.active_permission_mode == PermissionMode.RETRIEVE
        assert [tool["function"]["name"] for tool in lookup.openai_tools] == ["test__lookup"]

        writer = prepare_tools(
            lane=Lane.C_ANALYSIS,
            skill=type("SkillSelectionLike", (), {"skill_id": "create_entity"})(),
        )
        assert writer.active_permission_mode == PermissionMode.WRITE_CONFIRMED
        tool_names = {tool["function"]["name"] for tool in writer.openai_tools}
        assert "test__write" in tool_names
    finally:
        prepare_tools.__globals__["registry"] = original


def test_degraded_messages_are_explicit():
    assert degraded_message(DegradedReason.MISSING_CONTEXT) == "Context not available."
    assert degraded_message(DegradedReason.RETRIEVAL_EMPTY) == "Not available in the current context."
