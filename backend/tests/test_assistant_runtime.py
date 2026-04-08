"""Tests for the deterministic assistant runtime contracts."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

from pydantic import BaseModel

from app.assistant_runtime.context_resolver import resolve_runtime_context
from app.assistant_runtime.dispatch_engine import DispatchOutcome, dispatch_request
from app.assistant_runtime.degraded_responses import degraded_message
from app.assistant_runtime.execution_engine import prepare_tools
from app.assistant_runtime.prompt_registry import validate_prompt_registry
from app.assistant_runtime.result_memory import (
    build_bucketed_count_result_memory,
    build_memory_scope,
    build_query_signature,
)
from app.assistant_runtime.request_lifecycle import _deterministic_fast_response, run_request_lifecycle
from app.assistant_runtime.retrieval_orchestrator import execute_retrieval
from app.services.rag_indexer import RetrievedChunk
from app.assistant_runtime.skill_registry import validate_skill_registry
from app.assistant_runtime.skill_router import build_routed_skill, route_skill
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    ContextResolutionStatus,
    DispatchAmbiguity,
    DispatchDecision,
    DispatchProposal,
    DispatchSource,
    DispatchTrace,
    DegradedReason,
    Lane,
    PendingActionStatus,
    PermissionMode,
    RetrievalReceipt,
    RetrievalDebugReceipt,
    RetrievalStatus,
    StructuredPrecheckReceipt,
    StructuredPrecheckStatus,
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


class _FakeCompletionResponse:
    def __init__(self, payload: str, *, finish_reason: str = "stop"):
        self.choices = [SimpleNamespace(message=SimpleNamespace(content=payload), finish_reason=finish_reason)]


class _FakeAsyncCompletions:
    def __init__(self, payload: str | list[str] | list[tuple[str, str]]):
        if isinstance(payload, list):
            self.payloads = list(payload)
        else:
            self.payloads = [payload]
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.payloads) > 1:
            item = self.payloads.pop(0)
        else:
            item = self.payloads[0]
        if isinstance(item, tuple):
            payload, finish_reason = item
        else:
            payload, finish_reason = item, "stop"
        return _FakeCompletionResponse(payload, finish_reason=finish_reason)


class _FakeAsyncClient:
    def __init__(self, payload: str | list[str] | list[tuple[str, str]]):
        self.chat = SimpleNamespace(completions=_FakeAsyncCompletions(payload))


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


def _runtime_context(message: str = "show me this fund"):
    envelope = _runtime_envelope()
    return resolve_runtime_context(
        context_envelope=envelope,
        env_id="env_123",
        business_id="biz_123",
        conversation_id=None,
        actor="tester",
        message=message,
    )


def _ambiguous_envelope() -> AssistantContextEnvelope:
    return AssistantContextEnvelope.model_validate(
        {
            "session": {"roles": ["env_user"], "org_id": "biz_123", "session_env_id": "env_123"},
            "ui": {
                "route": "/lab/env/env_123/re/funds",
                "surface": "fund_list",
                "active_environment_id": "env_123",
                "active_environment_name": "Meridian",
                "active_business_id": "biz_123",
                "page_entity_type": "environment",
                "page_entity_id": "env_123",
                "page_entity_name": "Meridian",
                "selected_entities": [
                    {"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One", "source": "selection"},
                    {"entity_type": "fund", "entity_id": "fund_2", "name": "Fund Two", "source": "selection"},
                ],
                "visible_data": {"funds": [], "investments": [], "assets": [], "models": [], "pipeline_items": []},
            },
            "thread": {"assistant_mode": "environment_copilot", "scope_type": "environment", "scope_id": "env_123"},
        }
    )


def _ambiguous_runtime_context(message: str = "Show me this one"):
    envelope = _ambiguous_envelope()
    return resolve_runtime_context(
        context_envelope=envelope,
        env_id="env_123",
        business_id="biz_123",
        conversation_id=None,
        actor="tester",
        message=message,
    )


async def _collect_sse_events(generator):
    events: list[str] = []
    async for event in generator:
        events.append(event)
    return events


def _done_payload(events: list[str]) -> dict[str, object]:
    for event in reversed(events):
        if event.startswith("event: done\n"):
            return json.loads(event.split("data: ", 1)[1])
    raise AssertionError("Missing done event")


def test_skill_registry_and_prompts_validate():
    validate_skill_registry()
    validate_prompt_registry()


def test_permission_ordering_is_deterministic():
    assert permission_satisfies(PermissionMode.ANALYZE, PermissionMode.READ) is True
    assert permission_satisfies(PermissionMode.RETRIEVE, PermissionMode.ANALYZE) is False
    assert permission_satisfies(PermissionMode.WRITE_CONFIRMED, PermissionMode.ANALYZE) is True


def test_route_skill_is_safe_fallback():
    """route_skill is now a last-resort fallback that returns lookup_entity
    with low confidence. Model dispatch handles all real routing."""
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
        message="analyze portfolio correlation and benchmark",
        lane=Lane.C_ANALYSIS,
        route=route,
        context=context,
    )
    assert routed.selection.skill_id == "lookup_entity"
    assert routed.selection.confidence == 0.40
    assert routed.selection.triggers_matched == []


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
    msg = degraded_message(DegradedReason.MISSING_CONTEXT)
    assert "context" in msg.lower() or "specify" in msg.lower()
    assert "navigate" not in msg.lower()
    msg2 = degraded_message(DegradedReason.RETRIEVAL_EMPTY)
    assert "available" in msg2.lower() or "not" in msg2.lower()
    assert "navigate" not in msg2.lower()


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


def test_deterministic_fast_response_handles_structured_follow_up_prompt():
    fast = _deterministic_fast_response(
        message="Who should I follow up with today?",
        lane=Lane.B_LOOKUP,
        routed_skill=SimpleNamespace(selection=SimpleNamespace(skill_id="lookup_entity")),
        resolved_scope=SimpleNamespace(entity_type="environment", entity_name="Novendor", environment_id="env_123"),
        context_receipt=ContextReceipt(
            environment_id="env_123",
            entity_type="environment",
            entity_id="env_123",
            resolution_status=ContextResolutionStatus.RESOLVED,
        ),
        envelope=_runtime_envelope().model_copy(
            update={
                "ui": _runtime_envelope().ui.model_copy(
                    update={"active_environment_name": "Novendor", "page_entity_name": "Novendor"}
                )
            }
        ),
        retrieval_execution=SimpleNamespace(
            receipt=RetrievalReceipt(
                used=True,
                result_count=3,
                status=RetrievalStatus.OK,
                debug=RetrievalDebugReceipt(
                    query_text="Who should I follow up with today?",
                    scope_filters={"business_id": "biz_123", "env_id": "env_123"},
                    strategy="structured_precheck+semantic",
                    top_hits=[
                        {
                            "source": "structured:novendor.tasks.list_tasks_due_today",
                            "label": "Follow up with Cortland",
                            "priority": "urgent",
                            "due_date": "2026-04-04",
                        }
                    ],
                    structured_prechecks=[
                        StructuredPrecheckReceipt(
                            name="novendor_follow_up_today",
                            source="novendor.tasks.list_tasks_due_today",
                            status=StructuredPrecheckStatus.OK,
                            scoped=True,
                            result_count=3,
                            evidence={"today_count": 1, "overdue_count": 2},
                        )
                    ],
                ),
            )
        ),
    )
    assert fast is not None
    assert "Novendor follow up priorities" in fast.text
    assert "Follow up with Cortland" in fast.text


def test_deterministic_fast_response_handles_structured_noi_prompt():
    fast = _deterministic_fast_response(
        message="Why is NOI down vs underwriting?",
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
        retrieval_execution=SimpleNamespace(
            receipt=RetrievalReceipt(
                used=True,
                result_count=5,
                status=RetrievalStatus.OK,
                debug=RetrievalDebugReceipt(
                    query_text="Why is NOI down vs underwriting?",
                    scope_filters={"business_id": "biz_123", "env_id": "env_123", "entity_id": "fund_1"},
                    strategy="structured_precheck+hybrid+rerank",
                    top_hits=[
                        {
                            "source": "structured:finance.noi_variance",
                            "label": "Riverfront Apartments",
                            "line_code": "RENT",
                            "variance_amount": "2013521.37",
                            "variance_pct": "0.9115",
                        }
                    ],
                    structured_prechecks=[
                        StructuredPrecheckReceipt(
                            name="meridian_noi_variance",
                            source="finance.noi_variance",
                            status=StructuredPrecheckStatus.OK,
                            scoped=True,
                            result_count=372,
                            evidence={
                                "summary": {
                                    "total_actual": "68339372.36",
                                    "total_plan": "44249257.84",
                                    "total_variance": "24090114.52",
                                    "avg_variance_pct": "-0.04",
                                }
                            },
                        )
                    ],
                ),
            )
        ),
    )
    assert fast is not None
    assert "NOI is not down vs underwriting" in fast.text
    assert "Fund One" in fast.text


def test_deterministic_fast_response_handles_structured_asset_count_prompt():
    fast = _deterministic_fast_response(
        message="How many assets do we have in the portal?",
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
        retrieval_execution=SimpleNamespace(
            receipt=RetrievalReceipt(
                used=True,
                result_count=26,
                status=RetrievalStatus.OK,
                debug=RetrievalDebugReceipt(
                    query_text="How many assets do we have in the portal?",
                    scope_filters={"business_id": "biz_123", "env_id": "env_123", "entity_id": "fund_1"},
                    strategy="structured_precheck",
                    top_hits=[{"total": 26, "active": 22, "disposed": 0, "pipeline": 0, "other": 4}],
                    structured_prechecks=[
                        StructuredPrecheckReceipt(
                            name="asset_count",
                            source="repe.list_property_assets",
                            status=StructuredPrecheckStatus.OK,
                            scoped=True,
                            result_count=26,
                            evidence={
                                "summary": {
                                    "total": 26,
                                    "bucket_counts": {
                                        "active": 22,
                                        "disposed": 0,
                                        "pipeline": 0,
                                        "other": 4,
                                    },
                                    "active_definition": (
                                        "Active includes statuses active, held, lease_up, operating, or NULL."
                                    ),
                                }
                            },
                        )
                    ],
                ),
            )
        ),
    )

    assert fast is not None
    assert "26 total property assets" in fast.text
    assert "Other / non-canonical status: 4" in fast.text


def _router_json(*, environment="repe", entity_type="unknown", entity_name=None,
                  action="unknown", metric="none", timeframe_type="none",
                  timeframe_value=None, needs_clarification=False,
                  clarification_field="none", confidence=0.90):
    """Build a mock router model JSON response in the new closed-enum format."""
    return json.dumps({
        "environment": environment, "entity_type": entity_type,
        "entity_name": entity_name, "action": action, "metric": metric,
        "timeframe_type": timeframe_type, "timeframe_value": timeframe_value,
        "needs_clarification": needs_clarification,
        "clarification_field": clarification_field, "confidence": confidence,
    })


def test_dispatch_request_uses_structured_model_dispatch(monkeypatch):
    runtime_context = _runtime_context("Generate a thesis on our portfolio strategy")
    fake_client = _FakeAsyncClient(
        _router_json(entity_type="fund", action="explain", confidence=0.82)
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Generate a thesis on our portfolio strategy",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.skill_id == "run_analysis"
    assert outcome.trace.normalized.needs_retrieval is True
    assert outcome.route.lane == "C"
    assert outcome.routed_skill.selection.skill_id == "run_analysis"
    assert fake_client.chat.completions.calls
    assert fake_client.chat.completions.calls[0]["response_format"]["type"] == "json_schema"


def test_dispatch_request_falls_back_when_dispatch_output_is_invalid(monkeypatch):
    runtime_context = _runtime_context("Generate a thesis on our portfolio strategy")
    fake_client = _FakeAsyncClient("not json")
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Generate a thesis on our portfolio strategy",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.raw is None
    assert outcome.trace.normalized.source == DispatchSource.LEGACY_FALLBACK
    assert "invalid_json" in (outcome.trace.normalized.fallback_reason or "")
    assert outcome.routed_skill.selection.skill_id is not None
    assert outcome.route.lane in ("B", "C")


def test_dispatch_request_retries_after_truncated_dispatch(monkeypatch):
    runtime_context = _runtime_context("Generate LP summary")
    fake_client = _FakeAsyncClient(
        [
            ("", "length"),
            (
                _router_json(entity_type="fund", action="explain", confidence=0.82),
                "stop",
            ),
        ]
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Generate LP summary",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.fallback_used is False
    assert outcome.trace.normalized.needs_retrieval is True
    assert any("retry" in n for n in (outcome.trace.normalized.notes or []))
    assert len(fake_client.chat.completions.calls) == 2


def test_dispatch_request_suppresses_retrieval_for_simple_lookup(monkeypatch):
    runtime_context = _runtime_context("Show me this fund")
    fake_client = _FakeAsyncClient(
        _router_json(entity_type="fund", action="detail", confidence=0.7)
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Show me this fund",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.skill_id == "fund_summary"


def test_dispatch_request_uses_deterministic_guardrail_for_ambiguous_deictic_context(monkeypatch):
    runtime_context = _ambiguous_runtime_context("Open the other fund")
    monkeypatch.setattr(
        "app.assistant_runtime.dispatch_engine.get_instrumented_client",
        lambda: (_ for _ in ()).throw(AssertionError("dispatcher model should not be called")),
    )

    outcome = asyncio.run(
        dispatch_request(
            message="Open the other fund",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.DETERMINISTIC_GUARDRAIL
    assert outcome.trace.normalized.skill_id == "lookup_entity"
    assert outcome.trace.normalized.lane == Lane.B_LOOKUP
    assert outcome.trace.normalized.ambiguity_level == DispatchAmbiguity.HIGH


def test_dispatch_request_preserves_lookup_shape_for_ambiguous_context(monkeypatch):
    runtime_context = _ambiguous_runtime_context("Show me this one")
    monkeypatch.setattr(
        "app.assistant_runtime.dispatch_engine.get_instrumented_client",
        lambda: (_ for _ in ()).throw(AssertionError("dispatcher model should not be called")),
    )

    outcome = asyncio.run(
        dispatch_request(
            message="Show me this one",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.DETERMINISTIC_GUARDRAIL
    assert outcome.trace.normalized.skill_id == "lookup_entity"
    assert outcome.trace.normalized.lane == Lane.B_LOOKUP
    assert "deterministic_ambiguity_guardrail" in outcome.trace.normalized.notes


def test_dispatch_request_routes_variance_through_router(monkeypatch):
    """Variance queries now go through the router model (not regex guardrail)."""
    runtime_context = _runtime_context("Why is NOI down vs underwriting?")
    fake_client = _FakeAsyncClient(
        _router_json(entity_type="asset", action="variance", metric="noi", confidence=0.91)
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Why is NOI down vs underwriting?",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.skill_id == "explain_metric_variance"
    assert outcome.trace.normalized.needs_retrieval is True
    assert outcome.trace.normalized.lane == Lane.C_ANALYSIS


def test_dispatch_request_routes_fund_explain_through_router(monkeypatch):
    """Fund explanation goes through router, mapped to run_analysis with retrieval."""
    runtime_context = _runtime_context("Explain the basis for this fund performance")
    fake_client = _FakeAsyncClient(
        _router_json(entity_type="fund", action="explain", confidence=0.81)
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Explain the basis for this fund performance",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.needs_retrieval is True
    assert outcome.trace.normalized.lane == Lane.C_ANALYSIS


def test_dispatch_request_routes_source_audit_through_router(monkeypatch):
    """Source audit queries now go through router (not regex guardrail)."""
    runtime_context = _runtime_context("What data is this based on?")
    fake_client = _FakeAsyncClient(
        _router_json(entity_type="unknown", action="explain", confidence=0.85)
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="What data is this based on?",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.skill_id == "run_analysis"


def test_dispatch_request_suppresses_spurious_write_intent_for_lp_summary(monkeypatch):
    runtime_context = _runtime_context("Generate LP summary")
    fake_client = _FakeAsyncClient(
        _router_json(entity_type="fund", action="explain", confidence=0.78)
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Generate LP summary",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.skill_id == "run_analysis"
    assert outcome.trace.normalized.write_intent is False


def test_request_lifecycle_emits_dispatch_trace_in_turn_receipt(monkeypatch):
    async def _fake_dispatch_request(**_kwargs):
        route = RouteDecision(
            lane="A",
            skip_rag=True,
            skip_tools=True,
            max_tool_rounds=0,
            max_tokens=256,
            temperature=0.1,
            model="gpt-5-mini",
            rag_top_k=0,
            rag_max_tokens=0,
            history_max_tokens=800,
            matched_pattern="test_dispatch",
        )
        trace = DispatchTrace(
            raw=DispatchProposal(
                skill="lookup_entity",
                lane=Lane.A_FAST,
                needs_retrieval=False,
                write_intent=False,
                ambiguity_level=DispatchAmbiguity.LOW,
                confidence=0.88,
            ),
            normalized=DispatchDecision(
                source=DispatchSource.MODEL,
                skill_id="lookup_entity",
                lane=Lane.A_FAST,
                needs_retrieval=False,
                write_intent=False,
                ambiguity_level=DispatchAmbiguity.LOW,
                confidence=0.88,
                fallback_used=False,
                notes=[],
            ),
        )
        return DispatchOutcome(
            trace=trace,
            route=route,
            routed_skill=build_routed_skill(
                message="What am I looking at?",
                skill_id="lookup_entity",
                confidence=0.88,
            ),
        )

    async def _fake_execute_retrieval(**_kwargs):
        return SimpleNamespace(
            receipt=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
            chunks=[],
            context_text="",
        )

    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.dispatch_request", _fake_dispatch_request)
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.execute_retrieval", _fake_execute_retrieval)

    events = asyncio.run(
        _collect_sse_events(
            run_request_lifecycle(
                message="What am I looking at?",
                context_envelope=_runtime_envelope(),
                actor="tester",
            )
        )
    )
    payload = _done_payload(events)
    receipt = payload["turn_receipt"]

    assert receipt["dispatch"]["normalized"]["source"] == "model"
    assert receipt["dispatch"]["normalized"]["skill_id"] == "lookup_entity"


def test_request_lifecycle_skips_retrieval_for_ambiguous_context(monkeypatch):
    runtime_context = _ambiguous_runtime_context("Open the other fund")

    async def _fake_dispatch_request(**_kwargs):
        route = RouteDecision(
            lane="B",
            skip_rag=False,
            skip_tools=False,
            max_tool_rounds=0,
            max_tokens=256,
            temperature=0.1,
            model="gpt-5-mini",
            rag_top_k=3,
            rag_max_tokens=800,
            history_max_tokens=800,
            matched_pattern="test_dispatch",
        )
        trace = DispatchTrace(
            raw=DispatchProposal(
                skill=None,
                lane=Lane.A_FAST,
                needs_retrieval=False,
                write_intent=False,
                ambiguity_level=DispatchAmbiguity.HIGH,
                confidence=0.6,
            ),
            normalized=DispatchDecision(
                source=DispatchSource.MODEL,
                skill_id="lookup_entity",
                lane=Lane.B_LOOKUP,
                needs_retrieval=False,
                write_intent=False,
                ambiguity_level=DispatchAmbiguity.HIGH,
                confidence=0.6,
                fallback_used=False,
                fallback_reason=None,
                notes=["ambiguous_context_forced_fallback_skill"],
            ),
        )
        return DispatchOutcome(
            trace=trace,
            route=route,
            routed_skill=build_routed_skill(message="Open the other fund", skill_id="lookup_entity", confidence=0.6),
        )

    async def _unexpected_retrieval(**_kwargs):
        raise AssertionError("retrieval should not run for ambiguous context")

    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.resolve_runtime_context", lambda **_kwargs: runtime_context)
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.dispatch_request", _fake_dispatch_request)
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.execute_retrieval", _unexpected_retrieval)

    events = asyncio.run(
        _collect_sse_events(
            run_request_lifecycle(
                message="Open the other fund",
                context_envelope=_ambiguous_envelope(),
                actor="tester",
            )
        )
    )
    payload = _done_payload(events)
    receipt = payload["turn_receipt"]

    assert receipt["status"] == "degraded"
    assert receipt["degraded_reason"] == "ambiguous_context"
    assert receipt["retrieval"]["used"] is False


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

    captured: dict[str, object] = {}

    def _fake_search(**kwargs):
        captured.update(kwargs)
        return []

    monkeypatch.setattr("app.assistant_runtime.retrieval_orchestrator.semantic_search", _fake_search)
    monkeypatch.setattr(
        "app.assistant_runtime.retrieval_orchestrator._run_structured_prechecks",
        lambda **_kwargs: SimpleNamespace(
            context_text="",
            result_count=0,
            prechecks=[],
            top_hits=[],
            strategy_suffix=None,
            empty_reason=None,
        ),
    )

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

    assert captured["entity_type"] is None
    assert captured["entity_id"] is None
    assert execution.receipt.used is True
    assert execution.receipt.result_count == 0
    assert execution.receipt.status == RetrievalStatus.EMPTY
    assert execution.receipt.debug is not None
    assert execution.receipt.debug.empty_reason == "no_scoped_results"


def test_execute_retrieval_uses_env_scope_without_environment_entity_filter(monkeypatch):
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

    captured: dict[str, object] = {}

    def _fake_search(**kwargs):
        captured.update(kwargs)
        return [
            RetrievedChunk(
                chunk_id="chunk_1",
                document_id="doc_1",
                chunk_text="Paul led Databricks analytics work.",
                score=0.91,
                chunk_index=0,
                section_heading="Experience",
                section_path="Experience",
                parent_chunk_text="Paul led Databricks analytics work.",
                source_filename="resume.pdf",
                retrieval_method="fts",
                entity_type="resume",
                entity_id=None,
                env_id="7160a57b-59e7-4d72-bf43-5b9c179021af",
            )
        ]

    monkeypatch.setattr("app.assistant_runtime.retrieval_orchestrator.semantic_search", _fake_search)
    monkeypatch.setattr(
        "app.assistant_runtime.retrieval_orchestrator._run_structured_prechecks",
        lambda **_kwargs: SimpleNamespace(
            context_text="",
            result_count=0,
            prechecks=[],
            top_hits=[],
            strategy_suffix=None,
            empty_reason=None,
        ),
    )

    execution = asyncio.run(
        execute_retrieval(
            route=route,
            retrieval_policy="full",
            message="Analyze my experience with Databricks analytics",
            business_id="8d128d13-a0c0-4617-86c3-8c87f186ec7b",
            env_id="7160a57b-59e7-4d72-bf43-5b9c179021af",
            entity_type="environment",
            entity_id="7160a57b-59e7-4d72-bf43-5b9c179021af",
        )
    )

    assert captured["entity_type"] is None
    assert captured["entity_id"] is None
    assert execution.receipt.used is True
    assert execution.receipt.result_count == 1
    assert execution.receipt.status == RetrievalStatus.OK
    assert execution.receipt.debug is not None
    assert execution.receipt.debug.scope_filters["entity_id_filter_applied"] is False


def test_dispatch_request_routes_metric_anomaly_through_router(monkeypatch):
    """Metric anomaly queries now go through the router model."""
    runtime_context = _runtime_context("Why is occupancy blank?")
    fake_client = _FakeAsyncClient(
        _router_json(entity_type="asset", action="explain", metric="occupancy", confidence=0.88)
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Why is occupancy blank?",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.skill_id == "explain_metric"
    assert outcome.trace.normalized.needs_retrieval is True


def test_dispatch_request_routes_debt_risk_through_router(monkeypatch):
    """Debt risk queries now go through the router model."""
    runtime_context = _runtime_context("Show me debt risk")
    fake_client = _FakeAsyncClient(
        _router_json(entity_type="fund", action="explain", confidence=0.85)
    )
    monkeypatch.setattr("app.assistant_runtime.dispatch_engine.get_instrumented_client", lambda: fake_client)

    outcome = asyncio.run(
        dispatch_request(
            message="Show me debt risk",
            context_envelope=runtime_context.envelope,
            resolved_scope=runtime_context.resolved_scope,
            context=runtime_context.receipt,
            visible_context_shortcut=False,
        )
    )

    assert outcome.trace.normalized.source == DispatchSource.MODEL
    assert outcome.trace.normalized.needs_retrieval is True


def test_execute_retrieval_uses_structured_precheck_when_available(monkeypatch):
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

    monkeypatch.setattr("app.assistant_runtime.retrieval_orchestrator.semantic_search", lambda **_kwargs: [])
    monkeypatch.setattr(
        "app.assistant_runtime.retrieval_orchestrator._run_structured_prechecks",
        lambda **_kwargs: SimpleNamespace(
            context_text="STRUCTURED TASK CONTEXT:\n- Follow up with Cortland",
            result_count=2,
            prechecks=[
                StructuredPrecheckReceipt(
                    name="novendor_follow_up_today",
                    source="novendor.tasks.list_tasks_due_today",
                    status=StructuredPrecheckStatus.OK,
                    scoped=True,
                    result_count=2,
                    evidence={"env_id": "env_123", "business_id": "biz_123"},
                    notes=["Structured due-today task source evaluated."],
                )
            ],
            top_hits=[{"source": "structured:novendor.tasks.list_tasks_due_today", "label": "Follow up with Cortland"}],
            strategy_suffix="structured_precheck",
            empty_reason=None,
        ),
    )

    execution = asyncio.run(
        execute_retrieval(
            route=route,
            retrieval_policy="full",
            message="Who should I follow up with today?",
            business_id="a1b2c3d4-0001-0001-0001-000000000001",
            env_id="a1b2c3d4-0001-0001-0003-000000000001",
            entity_type="environment",
            entity_id="a1b2c3d4-0001-0001-0003-000000000001",
        )
    )

    assert execution.receipt.used is True
    assert execution.receipt.status == RetrievalStatus.OK
    assert execution.receipt.result_count == 2
    assert execution.receipt.debug is not None
    assert execution.receipt.debug.strategy.startswith("structured_precheck")
    assert execution.receipt.debug.structured_prechecks[0].status == StructuredPrecheckStatus.OK
    assert "STRUCTURED TASK CONTEXT" in execution.context_text


def test_request_lifecycle_emits_pending_action_receipt_for_write_confirmation(monkeypatch):
    async def _fake_dispatch_request(**_kwargs):
        route = RouteDecision(
            lane="C",
            skip_rag=True,
            skip_tools=True,
            max_tool_rounds=0,
            max_tokens=512,
            temperature=0.1,
            is_write=True,
            model="gpt-5-mini",
            rag_top_k=0,
            rag_max_tokens=0,
            history_max_tokens=800,
            matched_pattern="write",
        )
        trace = DispatchTrace(
            raw=DispatchProposal(
                skill="create_entity",
                lane=Lane.C_ANALYSIS,
                needs_retrieval=False,
                write_intent=True,
                ambiguity_level=DispatchAmbiguity.LOW,
                confidence=0.95,
            ),
            normalized=DispatchDecision(
                source=DispatchSource.DETERMINISTIC_GUARDRAIL,
                skill_id="create_entity",
                lane=Lane.C_ANALYSIS,
                needs_retrieval=False,
                write_intent=True,
                ambiguity_level=DispatchAmbiguity.LOW,
                confidence=0.95,
                fallback_used=False,
                notes=["deterministic_write_guardrail"],
            ),
        )
        return DispatchOutcome(
            trace=trace,
            route=route,
            routed_skill=build_routed_skill(
                message="Create a new deal called Meridian West",
                skill_id="create_entity",
                confidence=0.95,
            ),
        )

    async def _fake_execute_retrieval(**_kwargs):
        return SimpleNamespace(
            receipt=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
            chunks=[],
            context_text="",
        )

    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.dispatch_request", _fake_dispatch_request)
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.execute_retrieval", _fake_execute_retrieval)
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.check_pending_action", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.create_pending_action",
        lambda **_kwargs: {
            "pending_action_id": "pending_123",
            "action_type": "create_deal",
            "scope_label": "Fund One in Meridian",
        },
    )

    events = asyncio.run(
        _collect_sse_events(
            run_request_lifecycle(
                message="Create a new deal called Meridian West",
                context_envelope=_runtime_envelope(),
                conversation_id=uuid.uuid4(),
                actor="tester",
            )
        )
    )
    payload = _done_payload(events)
    receipt = payload["turn_receipt"]

    assert receipt["status"] == "success"
    assert receipt["pending_action"]["status"] == PendingActionStatus.AWAITING_CONFIRMATION
    assert receipt["pending_action"]["action_type"] == "create_deal"


def test_request_lifecycle_resolves_saved_referential_follow_up_before_dispatch(monkeypatch):
    result_memory = build_bucketed_count_result_memory(
        scope=build_memory_scope(
            business_id="biz_123",
            environment_id="env_123",
            entity_type="fund",
            entity_id="fund_1",
            entity_name="Fund One",
        ),
        query_signature=build_query_signature(
            result_type="bucketed_count",
            source_name="asset_count",
            scope={
                "business_id": "biz_123",
                "environment_id": "env_123",
                "entity_type": "fund",
                "entity_id": "fund_1",
                "entity_name": "Fund One",
            },
        ),
        summary={
            "total": 4,
            "item_label": "property asset(s)",
            "bucket_counts": {"active": 2, "disposed": 0, "pipeline": 0, "other": 2},
        },
        rows=[
            {"id": "asset_1", "name": "Alpha Tower", "entity_type": "asset", "status": "active", "bucket": "active"},
            {"id": "asset_2", "name": "Bravo Plaza", "entity_type": "asset", "status": "active", "bucket": "active"},
            {"id": "asset_3", "name": "Canal Shops", "entity_type": "asset", "status": "stabilized", "bucket": "other"},
            {"id": "asset_4", "name": "Delta Yard", "entity_type": "asset", "status": "paused", "bucket": "other"},
        ],
        bucket_members={
            "active": [
                {"id": "asset_1", "name": "Alpha Tower", "entity_type": "asset", "status": "active", "bucket": "active"},
                {"id": "asset_2", "name": "Bravo Plaza", "entity_type": "asset", "status": "active", "bucket": "active"},
            ],
            "disposed": [],
            "pipeline": [],
            "other": [
                {"id": "asset_3", "name": "Canal Shops", "entity_type": "asset", "status": "stabilized", "bucket": "other"},
                {"id": "asset_4", "name": "Delta Yard", "entity_type": "asset", "status": "paused", "bucket": "other"},
            ],
        },
    )
    logged_actions: list[str] = []

    async def _unexpected_dispatch(**_kwargs):
        raise AssertionError("dispatch should not run")

    async def _unexpected_retrieval(**_kwargs):
        raise AssertionError("retrieval should not run")

    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.check_pending_action", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.dispatch_request", _unexpected_dispatch)
    monkeypatch.setattr("app.assistant_runtime.request_lifecycle.execute_retrieval", _unexpected_retrieval)
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.emit_log",
        lambda **kwargs: logged_actions.append(kwargs["action"]),
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.get_thread_entity_state",
        lambda *_args, **_kwargs: {"result_memory": result_memory},
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.append_message",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.update_thread_entity_state",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.assistant_runtime.request_lifecycle.convo_svc.update_thread_result_memory",
        lambda *_args, **_kwargs: None,
    )

    events = asyncio.run(
        _collect_sse_events(
            run_request_lifecycle(
                message="what are the names of the other 2",
                context_envelope=_runtime_envelope(),
                conversation_id=uuid.uuid4(),
                actor="tester",
            )
        )
    )
    payload = _done_payload(events)
    token_events = [event for event in events if event.startswith("event: token\n")]

    assert payload["turn_receipt"]["dispatch"]["normalized"]["notes"] == ["deterministic_referential_followup"]
    assert any("assistant_runtime.referential_followup_resolved" == action for action in logged_actions)
    assert any("Canal Shops" in event for event in token_events)
    assert any("Delta Yard" in event for event in token_events)
