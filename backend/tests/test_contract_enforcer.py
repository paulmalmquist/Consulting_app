"""
Tests for backend.app.assistant_runtime.contract_enforcer (shadow-mode wrapper).

Goal of these tests:

  - The wrapper never modifies the upstream stream.
  - The wrapper never raises — enforcer-internal errors must not kill traffic.
  - When the feature flag is off, the wrapper is a pure passthrough and
    does not parse, validate, or persist.
  - When on, the wrapper parses every SSE block into events and calls
    the persistence hook with the validator's verdict exactly once.
  - SSE parser handles well-formed blocks and is tolerant of malformed ones.

No DB, no network. Persistence is mocked; validator is real.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator
from unittest.mock import patch

import pytest

from app.assistant_runtime.contract_enforcer import (
    ENFORCE_MODE_ENV,
    SHADOW_MODE_ENV,
    CODE_INVALID_SEQUENCE,
    CODE_MISSING_TERMINAL,
    STABLE_FALLBACK_CODES,
    _parse_sse_line,
    enforce_mode_enabled,
    shadow_mode_enabled,
    wrap_lifecycle_stream,
)


def _sse(event: str, data: dict[str, Any]) -> str:
    """Mirror the runtime's _sse() helper format: `event: X\\ndata: {...}\\n\\n`."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _agen(items: list[str]) -> AsyncGenerator[str, None]:
    for item in items:
        yield item


async def _agen_raising(items: list[str], after: int) -> AsyncGenerator[str, None]:
    """Yields `after` items then raises — used to prove the wrapper still persists."""
    for i, item in enumerate(items):
        if i >= after:
            raise RuntimeError("upstream blew up")
        yield item


def _collect(agen: AsyncGenerator[str, None]) -> list[str]:
    async def runner() -> list[str]:
        return [item async for item in agen]
    return asyncio.run(runner())


# ═══════════════════════════════════════════════════════════════════
# SSE parser
# ═══════════════════════════════════════════════════════════════════


class TestSseParser:
    def test_parses_well_formed_block(self):
        block = _sse("token", {"text": "hi"})
        parsed = _parse_sse_line(block)
        assert parsed == {"event": "token", "data": {"text": "hi"}}

    def test_parses_event_without_data(self):
        block = "event: done\n\n"
        parsed = _parse_sse_line(block)
        assert parsed == {"event": "done", "data": {}}

    def test_handles_malformed_json_gracefully(self):
        block = "event: token\ndata: NOT JSON\n\n"
        parsed = _parse_sse_line(block)
        # Event name preserved; data defaulted to empty dict.
        assert parsed == {"event": "token", "data": {}}

    def test_returns_none_on_empty(self):
        assert _parse_sse_line("") is None

    def test_returns_none_when_no_event_field(self):
        assert _parse_sse_line("data: {\"x\": 1}\n\n") is None


# ═══════════════════════════════════════════════════════════════════
# Feature flag
# ═══════════════════════════════════════════════════════════════════


class TestFeatureFlag:
    def test_flag_off_by_default(self, monkeypatch):
        monkeypatch.delenv(SHADOW_MODE_ENV, raising=False)
        assert not shadow_mode_enabled()

    @pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on", "On"])
    def test_flag_on_values(self, monkeypatch, value):
        monkeypatch.setenv(SHADOW_MODE_ENV, value)
        assert shadow_mode_enabled()

    @pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "random"])
    def test_flag_off_values(self, monkeypatch, value):
        monkeypatch.setenv(SHADOW_MODE_ENV, value)
        assert not shadow_mode_enabled()


# ═══════════════════════════════════════════════════════════════════
# Passthrough-when-disabled
# ═══════════════════════════════════════════════════════════════════


class TestDisabled:
    def test_wrapper_is_pure_passthrough_when_disabled(self, monkeypatch):
        monkeypatch.delenv(SHADOW_MODE_ENV, raising=False)
        upstream_items = [
            _sse("status", {"message": "hi"}),
            _sse("token", {"text": "hello"}),
            _sse("done", {"turn_receipt": {}, "trace": {"lane": "A"}}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            wrapped = wrap_lifecycle_stream(_agen(upstream_items))
            collected = _collect(wrapped)
        # Every upstream block forwarded unchanged.
        assert collected == upstream_items
        # Persistence never called when disabled.
        assert not persist.called


# ═══════════════════════════════════════════════════════════════════
# Enabled mode — observation-only
# ═══════════════════════════════════════════════════════════════════


class TestShadowMode:
    def test_wrapper_yields_upstream_unchanged(self, monkeypatch):
        monkeypatch.setenv(SHADOW_MODE_ENV, "1")
        upstream_items = [
            _sse("status", {"message": "hi"}),
            _sse("token", {"text": "hello"}),
            _sse("done", {"turn_receipt": {}, "trace": {"lane": "A"}}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            wrapped = wrap_lifecycle_stream(_agen(upstream_items))
            collected = _collect(wrapped)
        assert collected == upstream_items

    def test_wrapper_calls_persist_exactly_once_with_verdict(self, monkeypatch):
        monkeypatch.setenv(SHADOW_MODE_ENV, "1")
        upstream_items = [
            _sse("status", {"message": "hi"}),
            _sse("token", {"text": "Meridian Fund One"}),
            _sse("done", {
                "turn_receipt": {},
                "trace": {"lane": "A", "execution_path": "chat", "elapsed_ms": 300},
            }),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            wrapped = wrap_lifecycle_stream(
                _agen(upstream_items),
                business_id="b-1",
                env_id="e-1",
                request_id="req-1",
                conversation_id="conv-1",
                session_id="sess-1",
            )
            _collect(wrapped)
        assert persist.call_count == 1
        kwargs = persist.call_args.kwargs
        assert kwargs["business_id"] == "b-1"
        assert kwargs["conversation_id"] == "conv-1"
        assert kwargs["mode"] == "shadow"
        verdict = kwargs["verdict"]
        assert verdict["valid"] is True
        assert verdict["terminal_event"] is not None
        # Three events collected.
        assert len(kwargs["events"]) == 3

    def test_wrapper_records_verdict_for_invalid_stream(self, monkeypatch):
        monkeypatch.setenv(SHADOW_MODE_ENV, "1")
        # Missing terminal — should flag no_terminal_state.
        upstream_items = [
            _sse("status", {"message": "hi"}),
            _sse("token", {"text": "hello"}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            wrapped = wrap_lifecycle_stream(_agen(upstream_items))
            _collect(wrapped)
        assert persist.call_count == 1
        verdict = persist.call_args.kwargs["verdict"]
        cats = {v["category"] for v in verdict["violations"]}
        assert "no_terminal_state" in cats
        assert verdict["valid"] is False

    def test_wrapper_swallows_persist_exception(self, monkeypatch):
        monkeypatch.setenv(SHADOW_MODE_ENV, "1")
        upstream_items = [
            _sse("token", {"text": "ok"}),
            _sse("done", {"turn_receipt": {}, "trace": {"lane": "A"}}),
        ]
        # Persist raises — wrapper must still yield all upstream items.
        with patch(
            "app.assistant_runtime.contract_enforcer._persist_observation",
            side_effect=RuntimeError("db is sad"),
        ):
            wrapped = wrap_lifecycle_stream(_agen(upstream_items))
            collected = _collect(wrapped)
        assert collected == upstream_items  # upstream fully yielded

    def test_wrapper_persists_even_when_upstream_raises(self, monkeypatch):
        monkeypatch.setenv(SHADOW_MODE_ENV, "1")
        upstream_items = [
            _sse("status", {"message": "hi"}),
            _sse("token", {"text": "partial"}),
            _sse("done", {"turn_receipt": {}, "trace": {"lane": "A"}}),
        ]
        # Upstream raises after 2 items; wrapper still observes what it saw.
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            wrapped = wrap_lifecycle_stream(_agen_raising(upstream_items, after=2))
            with pytest.raises(RuntimeError, match="upstream blew up"):
                _collect(wrapped)
        assert persist.call_count == 1
        verdict = persist.call_args.kwargs["verdict"]
        # The two events before the raise were observed; validator saw no terminal.
        assert len(persist.call_args.kwargs["events"]) == 2
        cats = {v["category"] for v in verdict["violations"]}
        assert "no_terminal_state" in cats

    def test_wrapper_tolerates_malformed_upstream_blocks(self, monkeypatch):
        monkeypatch.setenv(SHADOW_MODE_ENV, "1")
        # Mix well-formed blocks with garbage; parser returns None for the garbage,
        # wrapper still forwards everything unchanged.
        upstream_items = [
            _sse("status", {"message": "hi"}),
            "this is not sse at all",
            _sse("done", {"turn_receipt": {}, "trace": {"lane": "A"}}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            wrapped = wrap_lifecycle_stream(_agen(upstream_items))
            collected = _collect(wrapped)
        assert collected == upstream_items
        assert persist.call_count == 1
        # Validator saw only the two parseable events.
        assert len(persist.call_args.kwargs["events"]) == 2

    def test_explicit_mode_overrides_env(self, monkeypatch):
        """Passing `mode='shadow'` enables even when env var is off."""
        monkeypatch.delenv(SHADOW_MODE_ENV, raising=False)
        upstream_items = [
            _sse("token", {"text": "x"}),
            _sse("done", {"turn_receipt": {}, "trace": {"lane": "A"}}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            wrapped = wrap_lifecycle_stream(_agen(upstream_items), mode="shadow")
            _collect(wrapped)
        assert persist.call_count == 1


# ═══════════════════════════════════════════════════════════════════
# Enforce mode
# ═══════════════════════════════════════════════════════════════════

_VALID_DONE = {"turn_receipt": {}, "trace": {"lane": "A"}}


class TestEnforceFlag:
    def test_flag_off_by_default(self, monkeypatch):
        monkeypatch.delenv(ENFORCE_MODE_ENV, raising=False)
        assert not enforce_mode_enabled()

    @pytest.mark.parametrize("value", ["1", "true", "yes", "on"])
    def test_flag_on_values(self, monkeypatch, value):
        monkeypatch.setenv(ENFORCE_MODE_ENV, value)
        assert enforce_mode_enabled()

    def test_enforce_takes_precedence_over_shadow(self, monkeypatch):
        """When both flags are set, resolved_mode should be 'enforce'."""
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        monkeypatch.setenv(SHADOW_MODE_ENV, "1")
        upstream = [_sse("token", {"text": "x"}), _sse("done", _VALID_DONE)]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            collected = _collect(wrap_lifecycle_stream(_agen(upstream)))
        # Persist is called with mode='enforce' (not 'shadow').
        assert persist.call_count == 1
        assert persist.call_args.kwargs["mode"] == "enforce"
        # Valid stream: all upstream bytes forwarded, no fallback added.
        assert collected == upstream


class TestEnforceMode:
    """Enforce mode: validate-before-yield, suppress + optional fallback on violation."""

    def test_valid_stream_passthrough_unchanged(self, monkeypatch):
        """A valid stream must come through byte-for-byte with no additions."""
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [
            _sse("status", {"message": "ok"}),
            _sse("token", {"text": "hello"}),
            _sse("done", _VALID_DONE),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            collected = _collect(wrap_lifecycle_stream(_agen(upstream)))
        assert collected == upstream

    def test_missing_terminal_emits_fallback(self, monkeypatch):
        """Stream with no done/error → wrapper appends canonical error+done fallback."""
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [
            _sse("status", {"message": "ok"}),
            _sse("token", {"text": "partial"}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            collected = _collect(wrap_lifecycle_stream(_agen(upstream)))

        # First two are original upstream bytes.
        assert collected[:2] == upstream
        # Two more bytes: fallback error + fallback done.
        assert len(collected) == 4
        err_parsed = json.loads(collected[2].split("data: ", 1)[1])
        done_parsed = json.loads(collected[3].split("data: ", 1)[1])
        assert err_parsed["type"] == "contract_enforced_error"
        assert err_parsed["retryable"] is True
        assert err_parsed["code"] in STABLE_FALLBACK_CODES
        assert done_parsed["status"] == "error"
        assert done_parsed["final_state"] == "contract_enforced_error"

    def test_fallback_error_event_name_is_error(self, monkeypatch):
        """Fallback must use SSE event name 'error', not 'done' or anything else."""
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [_sse("token", {"text": "x"})]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            collected = _collect(wrap_lifecycle_stream(_agen(upstream)))
        fallback_error = collected[1]
        assert fallback_error.startswith("event: error\n")
        fallback_done = collected[2]
        assert fallback_done.startswith("event: done\n")

    def test_fallback_code_is_missing_terminal(self, monkeypatch):
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [_sse("token", {"text": "x"})]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            collected = _collect(wrap_lifecycle_stream(_agen(upstream)))
        err_data = json.loads(collected[1].split("data: ", 1)[1])
        assert err_data["code"] == CODE_MISSING_TERMINAL

    def test_tokens_after_terminal_suppressed_no_fallback(self, monkeypatch):
        """token after done: invalid token is NOT yielded; no second fallback terminal
        because a valid terminal was already delivered."""
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [
            _sse("token", {"text": "ok"}),
            _sse("done", _VALID_DONE),
            _sse("token", {"text": "BAD: after terminal"}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            collected = _collect(wrap_lifecycle_stream(_agen(upstream)))

        # Only the first two events should appear (token + done). The bad token is dropped.
        assert len(collected) == 2
        assert collected[0] == upstream[0]
        assert collected[1] == upstream[1]
        # The invalid token must NOT appear in output.
        assert upstream[2] not in collected

    def test_second_terminal_suppressed_no_fallback(self, monkeypatch):
        """Second done is suppressed; client already has a valid terminal, no fallback emitted."""
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [
            _sse("token", {"text": "hi"}),
            _sse("done", _VALID_DONE),
            _sse("done", {"turn_receipt": {}, "trace": {"lane": "B"}}),  # second terminal — different payload to distinguish
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            collected = _collect(wrap_lifecycle_stream(_agen(upstream)))

        # Only token + first done. Second done suppressed, no fallback added.
        assert len(collected) == 2
        assert collected[0] == upstream[0]  # token
        assert collected[1] == upstream[1]  # first done (lane A)
        assert upstream[2] not in collected  # second done (lane B) suppressed

    def test_tokens_after_terminal_fallback_code_is_invalid_sequence(self, monkeypatch):
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [
            _sse("token", {"text": "ok"}),
            _sse("done", _VALID_DONE),
            _sse("token", {"text": "bad"}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            _collect(wrap_lifecycle_stream(_agen(upstream)))
        assert persist.call_count == 1
        kwargs = persist.call_args.kwargs
        assert kwargs["enforced"] is True
        assert kwargs["enforcement_reason"] == "tokens_after_terminal"
        assert kwargs["fallback_code"] == CODE_INVALID_SEQUENCE
        # No fallback emitted because valid terminal was already sent.
        assert kwargs["emitted_fallback"] is False

    def test_enforce_persists_enforced_true_on_violation(self, monkeypatch):
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [_sse("status", {"message": "hi"})]  # no terminal
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            _collect(wrap_lifecycle_stream(_agen(upstream)))
        assert persist.call_count == 1
        kwargs = persist.call_args.kwargs
        assert kwargs["enforced"] is True
        assert kwargs["emitted_fallback"] is True
        assert kwargs["enforcement_reason"] == "no_terminal_state"
        assert kwargs["mode"] == "enforce"

    def test_enforce_persists_enforced_false_for_valid_turn(self, monkeypatch):
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [
            _sse("token", {"text": "ok"}),
            _sse("done", _VALID_DONE),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            _collect(wrap_lifecycle_stream(_agen(upstream)))
        assert persist.call_count == 1
        kwargs = persist.call_args.kwargs
        assert kwargs["enforced"] is False
        assert kwargs["emitted_fallback"] is False

    def test_shadow_mode_does_not_enforce(self, monkeypatch):
        """Shadow mode observes but does not suppress events or emit fallback."""
        monkeypatch.setenv(SHADOW_MODE_ENV, "1")
        monkeypatch.delenv(ENFORCE_MODE_ENV, raising=False)
        upstream = [
            _sse("token", {"text": "ok"}),
            _sse("done", _VALID_DONE),
            _sse("token", {"text": "bad: after done"}),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            collected = _collect(wrap_lifecycle_stream(_agen(upstream)))
        # Shadow: all three bytes forwarded unchanged, no fallback appended.
        assert collected == upstream

    def test_enforce_swallows_validator_exception_still_emits_fallback(self, monkeypatch):
        """If validate_turn raises during enforcement, wrapper still emits fallback cleanly."""
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [_sse("token", {"text": "x"})]  # no terminal → will try to emit fallback
        with patch("app.assistant_runtime.contract_enforcer._persist_observation"):
            with patch(
                "app.assistant_runtime.contract_enforcer.validate_turn",
                side_effect=RuntimeError("validator exploded"),
            ):
                collected = _collect(wrap_lifecycle_stream(_agen(upstream)))

        # Should still have the original upstream token + fallback error + fallback done.
        assert len(collected) == 3
        assert collected[0] == upstream[0]
        assert "contract_enforced_error" in collected[1]

    def test_upstream_raise_persists_observation(self, monkeypatch):
        """If upstream raises mid-stream, enforce mode still persists and re-raises."""
        monkeypatch.setenv(ENFORCE_MODE_ENV, "1")
        upstream = [
            _sse("status", {"message": "hi"}),
            _sse("token", {"text": "partial"}),
            _sse("done", _VALID_DONE),
        ]
        with patch("app.assistant_runtime.contract_enforcer._persist_observation") as persist:
            with pytest.raises(RuntimeError, match="upstream blew up"):
                _collect(wrap_lifecycle_stream(_agen_raising(upstream, after=2)))
        assert persist.call_count == 1
