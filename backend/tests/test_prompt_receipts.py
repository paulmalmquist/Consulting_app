"""Tests for the receipt builder + persistence + diagnostics (Layer 4 + 5).

End-to-end receipt flow through the live unified runtime is covered by
separate integration tests; these cover the pure builder/shape/diagnostics
paths that don't require the FastAPI app to be running.
"""
from __future__ import annotations

from typing import Any


from app.services.context_compiler import compile_context
from app.services.lane_policy import LANE_POLICY
from app.services.prompt_receipts import (
    ReceiptRow,
    build_receipt_from_compiled,
    build_receipt_minimal,
    count_tokens,
    get_encoding,
    is_enabled,
    persist_receipt,
    update_upstream_usage,
)
from app.services.prompt_diagnostics import evaluate_row
from app.services.prompt_strategy import (
    COMPOSITION_PROFILES,
    CompositionPlan,
    STRATEGY_VERSION,
    StructuredScope,
)


def _plan(**overrides: Any) -> CompositionPlan:
    scope = StructuredScope(
        environment_text="[environment]\nenv_name: Meridian",
        page_text="[page]\ntitle: Fund Detail",
        entity_text="[active entity]\ntype: fund\nname: Meridian Value Fund I",
        filters_text="[filters]\nquarter: 2025Q4",
        visible_records_text="",
        entity_label="Meridian Value Fund I",
        entity_type="fund",
        entity_id="fund-1",
        page_title="Fund Detail",
        quarter="2025Q4",
        short_label="Meridian / Meridian Value Fund I",
    )
    plan = CompositionPlan(
        profile=COMPOSITION_PROFILES["entity_question"],
        lane="B",
        skill_id=None,
        skill_source="none",
        intent_hint="explain_metric.irr",
        original_user_text="what is the IRR of this fund",
        resolved_user_text='what is the IRR of "Meridian Value Fund I"',
        deictic_rewrites=[
            {"from": "this fund", "to": '"Meridian Value Fund I"', "kind": "entity_label"}
        ],
        scope=scope,
        thread_goal="The user is working on: validate fund returns",
        summary_strategy="none",
        summary_text=None,
        summary_version=None,
        is_minimal=False,
        strategy_version=STRATEGY_VERSION,
        diagnostics={"effective_lane": "B"},
        policy=LANE_POLICY["B"],
    )
    for k, v in overrides.items():
        setattr(plan, k, v)
    return plan


# ── Encoding fallback ─────────────────────────────────────────────────────


def test_get_encoding_returns_some_encoding_for_known_model():
    enc = get_encoding("gpt-4o-mini")
    # tiktoken may or may not be available in the test env. When available,
    # .encode must work. When not, count_tokens falls back gracefully.
    if enc is not None:
        assert count_tokens("hello world", enc) > 0


def test_count_tokens_handles_none_encoding():
    assert count_tokens("hello", None) > 0
    assert count_tokens("", None) == 0


# ── Builder from compiled context ─────────────────────────────────────────


def test_build_receipt_from_compiled_populates_core_fields():
    plan = _plan()
    compiled = compile_context(
        plan=plan,
        model="gpt-4o-mini",
        history_messages=[],
        raw_rag_chunks=[],
        workflow_augmentation="",
    )
    row = build_receipt_from_compiled(
        compiled=compiled,
        system_base="You are a helpful assistant.",
        request_id="req_test_001",
        round_index=0,
        capture_point="initial",
        conversation_id="conv-1",
        session_id="sess-1",
        env_id="env-1",
        business_id="biz-1",
        actor="test@example.com",
        model="gpt-4o-mini",
        fallback_used=False,
        active_scope_type="fund",
        active_scope_id="fund-1",
        active_scope_label="Meridian / Meridian Value Fund I",
        resolved_entity_state={"inherited_entity_id": None},
        continuity_notes={"prior_messages_found": 0, "prior_messages_included": 0},
    )
    assert row.request_id == "req_test_001"
    assert row.round_index == 0
    assert row.capture_point == "initial"
    assert row.conversation_id == "conv-1"
    assert row.composition_profile == "entity_question"
    assert row.lane == "B"
    assert row.strategy_version == STRATEGY_VERSION
    assert row.original_user_text == "what is the IRR of this fund"
    assert '"Meridian Value Fund I"' in (row.resolved_user_text or "")
    assert row.deictic_rewrites_json  # at least one rewrite
    assert row.scope_entity_text and "Meridian Value Fund I" in row.scope_entity_text
    assert row.thread_goal_text and "validate" in row.thread_goal_text
    assert row.system_text == "You are a helpful assistant."
    assert row.total_prompt_tokens >= row.current_user_tokens
    assert isinstance(row.notes_json, dict)
    assert "flags" in row.notes_json


def test_build_receipt_minimal_path_populates_minimal_shape():
    plan = _plan(is_minimal=True, lane="A")
    plan.profile = COMPOSITION_PROFILES["simple_lookup"]
    plan.policy = LANE_POLICY["A"]
    row = build_receipt_minimal(
        request_id="req_min_001",
        conversation_id=None,
        session_id=None,
        env_id="env-1",
        business_id="biz-1",
        actor="test@example.com",
        model="gpt-4o-mini",
        plan=plan,
        system_base="You are concise.",
        resolved_entity_state={},
        continuity_notes={"prior_messages_found": 0},
    )
    assert row.capture_point == "minimal"
    assert row.composition_profile == "simple_lookup"
    assert row.lane == "A"
    assert row.enforcement_trace_json == []
    assert row.total_prompt_tokens > 0
    assert row.notes_json.get("bypass_reason") == "lane_A_minimal"


# ── Diagnostics inline flags ─────────────────────────────────────────────


def test_evaluate_row_flags_rag_overuse():
    row = {
        "rag_tokens": 700,
        "total_prompt_tokens": 1000,
        "history_tokens": 100,
        "history_truncated": False,
        "notes_json": {},
        "enforcement_trace_json": [],
        "redundancy_filter_json": [],
    }
    flags = [f["rule"] for f in evaluate_row(row)]
    assert "rag_overuse" in flags


def test_evaluate_row_flags_rag_crowded_out_history():
    row = {
        "rag_tokens": 500,
        "total_prompt_tokens": 1000,
        "history_tokens": 150,
        "history_truncated": True,
        "notes_json": {"prior_messages_found": 6},
        "enforcement_trace_json": [{"key": "history", "action": "trim"}],
        "redundancy_filter_json": [],
    }
    flags = [f["rule"] for f in evaluate_row(row)]
    assert "rag_crowded_out_history" in flags
    assert "history_starvation" in flags


def test_evaluate_row_flags_hard_overflow():
    row = {
        "rag_tokens": 10,
        "total_prompt_tokens": 100,
        "history_tokens": 10,
        "history_truncated": False,
        "notes_json": {},
        "enforcement_trace_json": [{"key": "_hard_overflow", "action": "log_error"}],
        "redundancy_filter_json": [],
    }
    flags = [f["rule"] for f in evaluate_row(row)]
    assert "hard_overflow" in flags


def test_evaluate_row_buggy_rule_never_raises():
    # Pass a row that will cause a division by zero inside some rules — the
    # function must still return (possibly empty) without raising.
    result = evaluate_row({"total_prompt_tokens": 0, "rag_tokens": 0, "history_tokens": 0})
    assert isinstance(result, list)


# ── Persistence enabled-flag ─────────────────────────────────────────────


def test_persist_receipt_no_op_when_disabled(monkeypatch):
    monkeypatch.setenv("WINSTON_PROMPT_RECEIPT_ENABLED", "false")
    row = ReceiptRow(request_id="req_disabled")
    # Returns None without touching the DB.
    assert persist_receipt(row) is None
    monkeypatch.delenv("WINSTON_PROMPT_RECEIPT_ENABLED", raising=False)
    assert is_enabled() is True


def test_update_upstream_usage_no_op_when_value_none():
    # Must not raise, must not query the DB.
    update_upstream_usage("req_nope", 0, None)


# ── Admin endpoint auth gate ─────────────────────────────────────────────


def test_admin_receipts_endpoint_requires_admin_header(client):
    # Anonymous request → 401 (authentication) or 403 (admin gate).
    response = client.get("/api/admin/ai/prompt-receipts")
    assert response.status_code in (401, 403)
