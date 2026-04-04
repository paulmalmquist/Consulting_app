"""Tests for the deterministic assistant runtime contracts."""

from __future__ import annotations

import asyncio
import os
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

from pydantic import BaseModel

from app.assistant_runtime.degraded_responses import degraded_message
from app.assistant_runtime.execution_engine import prepare_tools
from app.assistant_runtime.prompt_registry import validate_prompt_registry
from app.assistant_runtime.request_lifecycle import _deterministic_fast_response
from app.assistant_runtime.retrieval_orchestrator import execute_retrieval
from app.assistant_runtime.skill_registry import validate_skill_registry
from app.assistant_runtime.skill_router import route_skill
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    ContextResolutionStatus,
    DegradedReason,
    Lane,
    PermissionMode,
    RetrievalStatus,
    permission_satisfies,
)
from app.schemas.ai_gateway import AssistantContextEnvelope
from app.mcp.registry import ToolDef, ToolRegistry
from app.services.request_router import RouteDecision


class _DummyInput(BaseModel):
    model_config = {"extra": "forbid"}

    x: int = 1


def _dummy_handler(ctx, inp):
    return {"ok": True, "x": inp.x}


def _runtime_envelope() -> AssistantContextEnvelope:
    return AssistantContextEnvelope.model_validate(
        {
            "session": {"roles": ["env_user"], "org_id": "biz_123", "session_env_id": "env_123"},
            "ui": {
                "route": "/lab/env/env_123/re/funds/fund_1",
                "surface": "fund_detail",
                "active_environment_id": "env_123",
                "active_environment_name": "Meridian",
                "active_business_id": "biz_123",
                "page_entity_type": "fund",
                "page_entity_id": "fund_1",
                "page_entity_name": "Fund One",
                "selected_entities": [
                    {"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One", "source": "page"}
                ],
                "visible_data": {"funds": [], "investments": [], "assets": [], "models": [], "pipeline_items": []},
            },
            "thread": {"assistant_mode": "environment_copilot", "scope_type": "environment", "scope_id": "env_123"},
        }
    )


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


def test_deterministic_fast_response_handles_identity_prompt():
    fast = _deterministic_fast_response(
        message="What am I looking at?",
        lane=Lane.A_FAST,
        routed_skill=SimpleNamespace(selection=SimpleNamespace(skill_id="lookup_entity")),
        resolved_scope=SimpleNamespace(entity_type="fund", entity_name="Fund One", environment_id="env_123"),
        context_receipt=ContextReceipt(
            environment_id="env_123",
            entity_type="fund",
            entity_id="fund_1",
            resolution_status=ContextResolutionStatus.RESOLVED,
        ),
        envelope=_runtime_envelope(),
        retrieval_execution=SimpleNamespace(receipt=SimpleNamespace(used=False, result_count=0)),
    )
    assert fast is not None
    assert "Fund One" in fast.text


def test_deterministic_fast_response_handles_source_audit_prompt():
    fast = _deterministic_fast_response(
        message="What data is this based on?",
        lane=Lane.C_ANALYSIS,
        routed_skill=SimpleNamespace(selection=SimpleNamespace(skill_id="run_analysis")),
        resolved_scope=SimpleNamespace(entity_type="fund", entity_name="Fund One", environment_id="env_123"),
        context_receipt=ContextReceipt(
            environment_id="env_123",
            entity_type="fund",
            entity_id="fund_1",
            resolution_status=ContextResolutionStatus.RESOLVED,
        ),
        envelope=_runtime_envelope(),
        retrieval_execution=SimpleNamespace(receipt=SimpleNamespace(used=False, result_count=0)),
    )
    assert fast is not None
    assert "No retrieval sources or tools were used" in fast.text


def test_deterministic_fast_response_handles_write_confirmation_prompt():
    fast = _deterministic_fast_response(
        message="Create a new deal called Meridian West",
        lane=Lane.C_ANALYSIS,
        routed_skill=SimpleNamespace(selection=SimpleNamespace(skill_id="create_entity")),
        resolved_scope=SimpleNamespace(entity_type="environment", entity_name="Meridian", environment_id="env_123"),
        context_receipt=ContextReceipt(
            environment_id="env_123",
            entity_type="environment",
            entity_id="env_123",
            resolution_status=ContextResolutionStatus.RESOLVED,
        ),
        envelope=_runtime_envelope(),
        retrieval_execution=SimpleNamespace(receipt=SimpleNamespace(used=False, result_count=0)),
    )
    assert fast is not None
    assert "Confirm to proceed" in fast.text
    assert any(block["type"] == "confirmation" for block in fast.response_blocks)


def test_execute_retrieval_degrades_cleanly_for_non_uuid_entity_scope(monkeypatch):
    route = RouteDecision(
        lane="C",
        skip_rag=False,
        skip_tools=False,
        max_tool_rounds=2,
        max_tokens=512,
        temperature=0.1,
        is_write=False,
        model="gpt-5-mini",
        rag_top_k=5,
        use_rerank=False,
        use_hybrid=False,
    )

    called = False

    def _fake_search(**_kwargs):
        nonlocal called
        called = True
        return []

    monkeypatch.setattr("app.assistant_runtime.retrieval_orchestrator.semantic_search", _fake_search)

    execution = asyncio.run(
        execute_retrieval(
            route=route,
            retrieval_policy="full",
            message="Summarize the latest debt watch changes for this fund",
            business_id="a1b2c3d4-0001-0001-0001-000000000001",
            env_id="a1b2c3d4-0001-0001-0003-000000000001",
            entity_type="fund",
            entity_id="fund_1",
        )
    )

    assert called is False
    assert execution.receipt.used is True
    assert execution.receipt.result_count == 0
    assert execution.receipt.status == RetrievalStatus.EMPTY
