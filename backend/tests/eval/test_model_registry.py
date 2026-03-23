"""Tests for model_registry — capability lookup, request sanitizer, error mapper."""
from app.services.model_registry import (
    get_caps,
    map_openai_error,
    sanitize_params,
)


# ── get_caps ────────────────────────────────────────────────────────


class TestGetCaps:
    def test_exact_match_gpt5_mini(self):
        caps = get_caps("gpt-5-mini")
        assert caps.supports_temperature is False
        assert caps.uses_max_completion_tokens is True
        assert caps.supports_reasoning_effort is True

    def test_exact_match_gpt4o(self):
        caps = get_caps("gpt-4o")
        assert caps.supports_temperature is True
        assert caps.uses_max_completion_tokens is False
        assert caps.supports_reasoning_effort is False

    def test_prefix_match_dated_variant(self):
        caps = get_caps("gpt-5-mini-2026-03-01")
        assert caps.supports_temperature is False
        assert caps.uses_max_completion_tokens is True

    def test_prefix_match_gpt5_variant(self):
        caps = get_caps("gpt-5.4-turbo")
        assert caps.supports_temperature is False
        assert caps.uses_max_completion_tokens is True

    def test_o1_model(self):
        caps = get_caps("o1")
        assert caps.supports_temperature is False
        assert caps.supports_reasoning_effort is True

    def test_o3_mini(self):
        caps = get_caps("o3-mini")
        assert caps.supports_temperature is False
        assert caps.supports_reasoning_effort is True

    def test_unknown_model_conservative(self):
        caps = get_caps("claude-3.5-sonnet")
        assert caps.supports_temperature is False
        assert caps.uses_max_completion_tokens is True

    def test_case_insensitive(self):
        caps = get_caps("GPT-5-Mini")
        assert caps.supports_temperature is False


# ── sanitize_params ─────────────────────────────────────────────────


class TestSanitizeParams:
    def test_strips_temperature_for_gpt5_mini(self):
        params = sanitize_params(
            "gpt-5-mini",
            messages=[{"role": "user", "content": "hi"}],
            temperature=0.2,
            max_tokens=1024,
        )
        assert "temperature" not in params
        assert "max_completion_tokens" in params
        assert params["max_completion_tokens"] == 1024
        assert "max_tokens" not in params

    def test_keeps_temperature_for_gpt4o(self):
        params = sanitize_params(
            "gpt-4o",
            messages=[{"role": "user", "content": "hi"}],
            temperature=0.3,
            max_tokens=2048,
        )
        assert params["temperature"] == 0.3
        assert params["max_tokens"] == 2048
        assert "max_completion_tokens" not in params

    def test_strips_reasoning_effort_for_gpt4o(self):
        params = sanitize_params(
            "gpt-4o",
            messages=[{"role": "user", "content": "hi"}],
            reasoning_effort="high",
        )
        assert "reasoning_effort" not in params

    def test_keeps_reasoning_effort_for_gpt5(self):
        params = sanitize_params(
            "gpt-5",
            messages=[{"role": "user", "content": "hi"}],
            reasoning_effort="medium",
        )
        assert params["reasoning_effort"] == "medium"

    def test_includes_tools_when_provided(self):
        tools = [{"type": "function", "function": {"name": "test"}}]
        params = sanitize_params(
            "gpt-5-mini",
            messages=[{"role": "user", "content": "hi"}],
            tools=tools,
        )
        assert params["tools"] == tools
        assert params["tool_choice"] == "auto"

    def test_no_tools_when_none(self):
        params = sanitize_params(
            "gpt-5-mini",
            messages=[{"role": "user", "content": "hi"}],
            tools=None,
        )
        assert "tools" not in params
        assert "tool_choice" not in params

    def test_streaming_params(self):
        params = sanitize_params(
            "gpt-5-mini",
            messages=[{"role": "user", "content": "hi"}],
            stream=True,
        )
        assert params["stream"] is True
        assert params["stream_options"] == {"include_usage": True}

    def test_no_streaming_by_default(self):
        params = sanitize_params(
            "gpt-5-mini",
            messages=[{"role": "user", "content": "hi"}],
        )
        assert "stream" not in params

    def test_unknown_model_conservative(self):
        params = sanitize_params(
            "future-model-v9",
            messages=[{"role": "user", "content": "hi"}],
            temperature=0.5,
            max_tokens=512,
        )
        # Conservative: no temperature, use max_completion_tokens
        assert "temperature" not in params
        assert "max_completion_tokens" in params
        assert params["max_completion_tokens"] == 512

    def test_temperature_none_not_included(self):
        params = sanitize_params(
            "gpt-4o",
            messages=[{"role": "user", "content": "hi"}],
            temperature=None,
        )
        assert "temperature" not in params


# ── map_openai_error ────────────────────────────────────────────────


class TestMapOpenaiError:
    def _make_err(self, message: str, status: int = 0):
        err = Exception(message)
        err.status_code = status
        return err

    def test_temperature_400(self):
        err = self._make_err(
            "Error code: 400 - Unsupported value: 'temperature' does not support 0.2",
            status=400,
        )
        mapped = map_openai_error(err, "gpt-5-mini")
        assert mapped.is_retryable
        assert mapped.should_strip_param == "temperature"
        assert "raw" not in mapped.user_message.lower()

    def test_model_not_found_404(self):
        err = self._make_err("The model 'gpt-99' does not exist", status=404)
        mapped = map_openai_error(err, "gpt-99")
        assert mapped.is_retryable
        assert mapped.should_fallback

    def test_rate_limit_429(self):
        err = self._make_err("Rate limit exceeded", status=429)
        mapped = map_openai_error(err, "gpt-5")
        assert mapped.is_retryable
        assert "demand" in mapped.user_message.lower()

    def test_server_error_500(self):
        err = self._make_err("Internal server error", status=500)
        mapped = map_openai_error(err, "gpt-5")
        assert mapped.is_retryable
        assert "unavailable" in mapped.user_message.lower()

    def test_context_overflow(self):
        err = self._make_err(
            "This model's maximum context length is 128000 tokens",
            status=400,
        )
        mapped = map_openai_error(err, "gpt-5-mini")
        assert not mapped.is_retryable
        assert "long" in mapped.user_message.lower()

    def test_unknown_error(self):
        err = self._make_err("Something weird happened")
        mapped = map_openai_error(err, "gpt-5")
        assert "unexpected" in mapped.user_message.lower()
        assert mapped.debug_message  # has debug info
