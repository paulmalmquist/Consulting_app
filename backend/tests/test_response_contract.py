"""
Unit tests for backend.app.assistant_runtime.response_contract.

Tests are deterministic, network-free, DB-free. They exercise:

  1. Per-event payload validators.
  2. FSM transitions (legal + illegal).
  3. Whole-turn validator on golden sequences.
  4. Shape-hash stability + sensitivity.
  5. Runtime identity mapping.
  6. Drift detection (warn-only in Phase 1).

Golden sequences live in tests/fixtures/contract/*.json and describe
both clean canonical traces and known-bad shapes.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.assistant_runtime.response_contract import (
    CANONICAL_LANES,
    CONTRACT_VERSION,
    REQUEST_LIFECYCLE_VERSION,
    EventType,
    LifecyclePhase,
    advance_phase,
    build_runtime_identity,
    detect_contract_drift,
    response_shape_hash,
    validate_event_payload,
    validate_turn,
)

FIXTURES = Path(__file__).parent / "fixtures" / "contract"


def _load_fixture(name: str) -> list[dict]:
    return json.loads((FIXTURES / name).read_text())


# ═══════════════════════════════════════════════════════════════════
# Per-event payload validators
# ═══════════════════════════════════════════════════════════════════


class TestPayloadValidators:
    def test_token_requires_text_string(self):
        assert validate_event_payload(EventType.TOKEN, {"text": "hi"}) == []
        violations = validate_event_payload(EventType.TOKEN, {})
        assert any(v["category"] == "invalid_event_payload" for v in violations)

    def test_token_text_must_be_string(self):
        violations = validate_event_payload(EventType.TOKEN, {"text": 42})
        assert any(
            v["detail"].get("key") == "text" and v["detail"].get("actual_type") == "int"
            for v in violations
        )

    def test_done_requires_receipt_and_trace(self):
        good = {"turn_receipt": {}, "trace": {}, "response_blocks": []}
        assert validate_event_payload(EventType.DONE, good) == []
        violations = validate_event_payload(EventType.DONE, {})
        missing_keys = {v["detail"].get("missing_key") for v in violations}
        assert "turn_receipt" in missing_keys
        assert "trace" in missing_keys

    def test_structured_result_needs_card_or_data(self):
        assert validate_event_payload(
            EventType.STRUCTURED_RESULT, {"result_type": "x", "card": {}}
        ) == []
        assert validate_event_payload(
            EventType.STRUCTURED_RESULT, {"result_type": "x", "data": []}
        ) == []
        violations = validate_event_payload(
            EventType.STRUCTURED_RESULT, {"result_type": "x"}
        )
        assert any(
            v["detail"].get("missing_key") == "card_or_data" for v in violations
        )

    def test_response_block_requires_block_dict(self):
        assert validate_event_payload(
            EventType.RESPONSE_BLOCK, {"block": {"type": "markdown"}}
        ) == []
        violations = validate_event_payload(EventType.RESPONSE_BLOCK, {"block": "nope"})
        assert any(v["detail"].get("actual_type") == "str" for v in violations)

    def test_status_is_loose(self):
        # Permissive: no required keys.
        assert validate_event_payload(EventType.STATUS, {}) == []
        assert validate_event_payload(EventType.STATUS, {"message": "ok", "stage": "x"}) == []

    def test_status_message_type_caught(self):
        violations = validate_event_payload(EventType.STATUS, {"message": 42})
        assert violations  # wrong type for known key

    def test_tool_call_requires_tool_name(self):
        assert validate_event_payload(EventType.TOOL_CALL, {"tool_name": "foo"}) == []
        assert validate_event_payload(EventType.TOOL_CALL, {}) != []


# ═══════════════════════════════════════════════════════════════════
# FSM transitions
# ═══════════════════════════════════════════════════════════════════


class TestFSM:
    def test_init_to_streaming_via_token(self):
        nxt, legal = advance_phase(LifecyclePhase.INIT, EventType.TOKEN)
        assert legal
        assert nxt == LifecyclePhase.STREAMING

    def test_init_to_tool_via_tool_call(self):
        nxt, legal = advance_phase(LifecyclePhase.INIT, EventType.TOOL_CALL)
        assert legal
        assert nxt == LifecyclePhase.TOOL

    def test_streaming_to_terminal_via_done(self):
        nxt, legal = advance_phase(LifecyclePhase.STREAMING, EventType.DONE)
        assert legal
        assert nxt == LifecyclePhase.TERMINAL

    def test_tool_can_return_to_streaming(self):
        nxt, legal = advance_phase(LifecyclePhase.TOOL, EventType.TOKEN)
        assert legal
        assert nxt == LifecyclePhase.STREAMING

    def test_token_after_structured_result_legal(self):
        # Reproduces the meridian path: structured_result then more tokens.
        phase = LifecyclePhase.INIT
        for ev in (EventType.STATUS, EventType.STRUCTURED_RESULT, EventType.TOKEN, EventType.DONE):
            phase, legal = advance_phase(phase, ev)
            assert legal, f"transition via {ev.value} was illegal"
        assert phase == LifecyclePhase.TERMINAL

    def test_terminal_is_sticky(self):
        nxt, legal = advance_phase(LifecyclePhase.TERMINAL, EventType.TOKEN)
        assert not legal
        assert nxt == LifecyclePhase.TERMINAL

    def test_double_terminal_illegal(self):
        nxt, legal = advance_phase(LifecyclePhase.TERMINAL, EventType.DONE)
        assert not legal
        assert nxt == LifecyclePhase.TERMINAL

    def test_clarification_moves_to_finalizing(self):
        nxt, legal = advance_phase(LifecyclePhase.STREAMING, EventType.CLARIFICATION_REQUIRED)
        assert legal
        assert nxt == LifecyclePhase.FINALIZING

    def test_finalizing_only_to_terminal(self):
        # A token in FINALIZING should stay in FINALIZING (not regress).
        nxt, legal = advance_phase(LifecyclePhase.FINALIZING, EventType.TOKEN)
        assert legal
        assert nxt == LifecyclePhase.FINALIZING


# ═══════════════════════════════════════════════════════════════════
# Golden sequences
# ═══════════════════════════════════════════════════════════════════


class TestGoldenSequences:
    def test_canonical_a_fast_passes(self):
        events = _load_fixture("canonical_a_fast.json")
        result = validate_turn(events, scenario_expectations={"lane": "A_FAST"})
        assert result["valid"], result["violations"]
        assert result["terminal_event"] == EventType.DONE
        assert result["final_state"] == LifecyclePhase.TERMINAL
        assert result["runtime_identity"]
        assert result["runtime_identity"]["path"] == "canonical"

    def test_canonical_b_lookup_with_tools_passes(self):
        events = _load_fixture("canonical_b_lookup.json")
        result = validate_turn(events, scenario_expectations={"lane": "B_LOOKUP"})
        assert result["valid"], result["violations"]
        assert result["terminal_event"] == EventType.DONE

    def test_meridian_tokens_after_structured_result_passes(self):
        events = _load_fixture("meridian_tokens_after_structured.json")
        result = validate_turn(events)
        # The case where tokens follow structured_result must NOT be flagged.
        cats = {v["category"] for v in result["violations"]}
        assert "tokens_after_terminal" not in cats
        assert "invalid_event_payload" not in cats
        assert result["valid"], result["violations"]

    def test_error_path_is_terminal(self):
        events = _load_fixture("error_path.json")
        result = validate_turn(events)
        # `error` alone is terminal — not a violation by itself.
        assert result["terminal_event"] == EventType.ERROR
        # But "no done" is not fired; error IS the terminal.
        cats = {v["category"] for v in result["violations"]}
        assert "no_terminal_state" not in cats

    def test_clarification_with_done_passes(self):
        events = _load_fixture("clarification_then_done.json")
        result = validate_turn(events)
        cats = {v["category"] for v in result["violations"]}
        assert "clarification_without_done" not in cats

    def test_missing_terminal_flagged(self):
        events = _load_fixture("missing_terminal.json")
        result = validate_turn(events)
        cats = {v["category"] for v in result["violations"]}
        assert "no_terminal_state" in cats
        assert not result["valid"]

    def test_double_done_flagged(self):
        events = _load_fixture("double_done.json")
        result = validate_turn(events)
        cats = {v["category"] for v in result["violations"]}
        assert "multiple_terminal_states" in cats
        assert not result["valid"]

    def test_token_after_done_flagged(self):
        events = _load_fixture("token_after_done.json")
        result = validate_turn(events)
        cats = {v["category"] for v in result["violations"]}
        assert "tokens_after_terminal" in cats
        assert not result["valid"]

    def test_fallback_to_lane_f_flagged(self):
        events = _load_fixture("lane_f_fallback.json")
        result = validate_turn(events, scenario_expectations={"lane": "A_FAST"})
        cats = {v["category"] for v in result["violations"]}
        assert "fallback_to_lane_f" in cats

    def test_empty_dashboard_shell_flagged(self):
        events = _load_fixture("empty_dashboard_shell.json")
        result = validate_turn(events)
        cats = {v["category"] for v in result["violations"]}
        assert "empty_dashboard_shell" in cats

    def test_narration_only_flagged_when_structured_expected(self):
        events = _load_fixture("narration_only.json")
        result = validate_turn(
            events, scenario_expectations={"must_emit_structured": True}
        )
        cats = {v["category"] for v in result["violations"]}
        assert "narration_only" in cats

    def test_narration_only_not_flagged_when_not_expected(self):
        # Same sequence, no expectation of structured — should NOT fire.
        events = _load_fixture("narration_only.json")
        result = validate_turn(events)
        cats = {v["category"] for v in result["violations"]}
        assert "narration_only" not in cats

    def test_unavailable_masquerade_flagged(self):
        events = _load_fixture("unavailable_masquerade.json")
        result = validate_turn(events)
        cats = {v["category"] for v in result["violations"]}
        assert "unavailable_masquerade" in cats

    def test_raw_id_leakage_flagged(self):
        events = _load_fixture("raw_id_leak.json")
        result = validate_turn(events)
        cats = {v["category"] for v in result["violations"]}
        assert "raw_id_leakage" in cats

    def test_missing_runtime_identity_flagged_when_required(self):
        events = [
            {"event": "token", "data": {"text": "ok"}},
            {
                "event": "done",
                "data": {
                    "turn_receipt": {"response_text": "ok"},
                    "trace": {"lane": "A", "execution_path": "chat"},
                },
            },
        ]
        result = validate_turn(
            events,
            scenario_expectations={
                "runtime_identity_required": True,
                "runtime_path": "canonical",
            },
        )
        cats = {v["category"] for v in result["violations"]}
        assert "missing_runtime_identity" in cats
        assert not result["valid"]

    def test_runtime_path_mismatch_flagged(self):
        events = _load_fixture("lane_f_fallback.json")
        result = validate_turn(
            events,
            scenario_expectations={
                "runtime_identity_required": True,
                "runtime_path": "canonical",
            },
        )
        cats = {v["category"] for v in result["violations"]}
        assert "runtime_path_mismatch" in cats

    def test_latency_regression_flagged(self):
        events = _load_fixture("canonical_a_fast.json")
        baseline = {"last_pass_latency_ms": 300}
        result = validate_turn(
            events,
            scenario_expectations={"lane": "A_FAST"},
            baseline=baseline,
            latency_regression_multiplier=2.0,
        )
        cats = {v["category"] for v in result["violations"]}
        assert "latency_regression" in cats


# ═══════════════════════════════════════════════════════════════════
# Shape hash
# ═══════════════════════════════════════════════════════════════════


class TestShapeHash:
    def test_identical_sequences_identical_hash(self):
        a = [{"event": "token", "data": {"text": "x"}}, {"event": "done", "data": {"turn_receipt": {}, "trace": {}}}]
        b = [{"event": "token", "data": {"text": "y"}}, {"event": "done", "data": {"turn_receipt": {}, "trace": {}}}]
        # Same event types + block types → same hash (text content doesn't matter).
        assert response_shape_hash(a) == response_shape_hash(b)

    def test_shape_change_changes_hash(self):
        a = [{"event": "token", "data": {"text": "x"}}, {"event": "done", "data": {}}]
        b = [
            {"event": "token", "data": {"text": "x"}},
            {"event": "structured_result", "data": {"result_type": "kpi", "card": {}}},
            {"event": "done", "data": {}},
        ]
        assert response_shape_hash(a) != response_shape_hash(b)

    def test_block_type_affects_hash(self):
        events = [{"event": "done", "data": {}}]
        h1 = response_shape_hash(events, [{"type": "markdown"}])
        h2 = response_shape_hash(events, [{"type": "citations"}])
        assert h1 != h2


# ═══════════════════════════════════════════════════════════════════
# Runtime identity mapping
# ═══════════════════════════════════════════════════════════════════


class TestRuntimeIdentity:
    @pytest.mark.parametrize(
        "lane,execution_path,expected_path,expected_lane",
        [
            ("A_FAST", "meridian_structured_query", "fast", "A_FAST"),
            ("A", "chat", "canonical", "A_FAST"),
            ("B_LOOKUP", "tool", "canonical", "B_LOOKUP"),
            ("F", "fallback", "fallback", "F"),
            ("F", "chat", "fallback", "F"),
            (None, None, "canonical", "unknown"),
            ("", "fast_answer", "fast", "unknown"),
        ],
    )
    def test_mapping(self, lane, execution_path, expected_path, expected_lane):
        ident = build_runtime_identity(lane=lane, execution_path=execution_path)
        assert ident["path"] == expected_path, (lane, execution_path, ident)
        assert ident["lane"] == expected_lane
        assert ident["contract_version"] == CONTRACT_VERSION
        assert ident["request_lifecycle_version"] == REQUEST_LIFECYCLE_VERSION


# ═══════════════════════════════════════════════════════════════════
# Drift detection
# ═══════════════════════════════════════════════════════════════════


class TestDrift:
    def test_no_baseline_no_drift(self):
        assert detect_contract_drift(
            current_shape_hash="abc", current_contract_version="v1", baseline=None
        ) is None

    def test_same_hash_no_drift(self):
        baseline = {"last_pass_response_shape_hash": "abc", "contract_version": "v1"}
        assert detect_contract_drift(
            current_shape_hash="abc", current_contract_version="v1", baseline=baseline
        ) is None

    def test_shape_change_unversioned_fires(self):
        baseline = {"last_pass_response_shape_hash": "abc", "contract_version": "v1"}
        drift = detect_contract_drift(
            current_shape_hash="def", current_contract_version="v1", baseline=baseline
        )
        assert drift is not None
        assert drift["category"] == "contract_drift_unversioned"
        assert drift["severity"] == "warning"

    def test_shape_change_with_version_bump_ignored(self):
        baseline = {"last_pass_response_shape_hash": "abc", "contract_version": "v1"}
        drift = detect_contract_drift(
            current_shape_hash="def", current_contract_version="v2", baseline=baseline
        )
        assert drift is None


# ═══════════════════════════════════════════════════════════════════
# Constants sanity
# ═══════════════════════════════════════════════════════════════════


class TestConstants:
    def test_canonical_lanes_includes_expected(self):
        assert "A_FAST" in CANONICAL_LANES
        assert "B_LOOKUP" in CANONICAL_LANES
        assert "C_ANALYSIS" in CANONICAL_LANES
        assert "F" not in CANONICAL_LANES

    def test_event_types_cover_audit_findings(self):
        # Every event type observed in the audit MUST be in the enum.
        observed = {
            "status", "token", "tool_call", "tool_result", "citation",
            "response_block", "structured_result", "clarification_required",
            "progress", "context", "session", "safety", "error", "done",
        }
        declared = {e.value for e in EventType}
        missing = observed - declared
        assert not missing, f"audit-observed event types missing from enum: {missing}"
