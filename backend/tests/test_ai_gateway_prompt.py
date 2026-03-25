from app.services.ai_gateway import (
    _NOVENDOR_PREDICTION_MARKET_PROMPT,
    _build_system_prompt,
    _build_system_prompt_for_context,
)


def test_novendor_prompt_only_for_novendor_environment_name():
    prompt = _build_system_prompt_for_context(
        environment_name="Novendor",
        environment_id="env_123",
    )
    assert _NOVENDOR_PREDICTION_MARKET_PROMPT in prompt


def test_novendor_prompt_only_for_novendor_environment_id():
    prompt = _build_system_prompt_for_context(
        environment_name="Meridian",
        environment_id="env_novendor_123",
    )
    assert _NOVENDOR_PREDICTION_MARKET_PROMPT in prompt


def test_non_novendor_environment_uses_default_prompt_only():
    prompt = _build_system_prompt_for_context(
        environment_name="Meridian Capital",
        environment_id="env_meridian_123",
    )
    assert prompt == _build_system_prompt()
    assert _NOVENDOR_PREDICTION_MARKET_PROMPT not in prompt
