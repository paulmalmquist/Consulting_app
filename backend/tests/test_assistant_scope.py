from types import SimpleNamespace

from app.schemas.ai_gateway import AssistantContextEnvelope
from app.services import assistant_scope as assistant_scope_svc


def _resolved_env_context(**_kwargs):
    return SimpleNamespace(
        env_id="env_123",
        business_id="biz_123",
        environment={
            "schema_name": "env_meridian_capital",
            "industry": "repe",
            "industry_type": "repe",
        },
    )


def _envelope(**overrides):
    payload = {
        "session": {
            "roles": ["env_user"],
            "org_id": "biz_123",
            "session_env_id": "env_123",
        },
        "ui": {
            "route": "/lab/env/env_123/re/funds",
            "surface": "fund_portfolio",
            "active_environment_id": "env_123",
            "active_environment_name": "Meridian Capital Management",
            "active_business_id": "biz_123",
            "schema_name": "env_meridian_capital",
            "industry": "repe",
            "page_entity_type": "environment",
            "page_entity_id": "env_123",
            "selected_entities": [],
            "visible_data": {
                "funds": [
                    {
                        "entity_type": "fund",
                        "entity_id": "fund_1",
                        "name": "IGF VII",
                    }
                ],
                "investments": [],
                "assets": [],
                "models": [],
                "pipeline_items": [],
            },
        },
        "thread": {
            "assistant_mode": "environment_copilot",
            "scope_type": "environment",
            "scope_id": "env_123",
            "launch_source": "winston_modal",
        },
    }
    payload.update(overrides)
    return AssistantContextEnvelope.model_validate(payload)


def test_resolve_scope_uses_explicit_entity_from_ui_context(monkeypatch):
    monkeypatch.setattr(assistant_scope_svc, "resolve_env_business_context", _resolved_env_context)

    resolved = assistant_scope_svc.resolve_assistant_scope(
        user="user:env_123",
        context_envelope=_envelope(),
        user_message="What is the strategy for IGF VII?",
    )

    assert resolved.resolved_scope_type == "fund"
    assert resolved.entity_type == "fund"
    assert resolved.entity_id == "fund_1"
    assert resolved.business_id == "biz_123"
    assert resolved.schema_name == "env_meridian_capital"
    assert resolved.source == "message:ui_context"


def test_resolve_scope_uses_selected_entity_for_deictic_prompt(monkeypatch):
    monkeypatch.setattr(assistant_scope_svc, "resolve_env_business_context", _resolved_env_context)

    envelope = _envelope(
        ui={
            "route": "/lab/env/env_123/re/funds/fund_1",
            "surface": "fund_detail",
            "active_environment_id": "env_123",
            "active_business_id": "biz_123",
            "schema_name": "env_meridian_capital",
            "industry": "repe",
            "page_entity_type": "fund",
            "page_entity_id": "fund_1",
            "page_entity_name": "IGF VII",
            "selected_entities": [
                {
                    "entity_type": "fund",
                    "entity_id": "fund_1",
                    "name": "IGF VII",
                    "source": "page",
                }
            ],
            "visible_data": {
                "funds": [
                    {
                        "entity_type": "fund",
                        "entity_id": "fund_1",
                        "name": "IGF VII",
                    }
                ],
                "investments": [],
                "assets": [],
                "models": [],
                "pipeline_items": [],
            },
        }
    )

    resolved = assistant_scope_svc.resolve_assistant_scope(
        user="user:env_123",
        context_envelope=envelope,
        user_message="Show assets in this fund",
    )

    assert resolved.resolved_scope_type == "fund"
    assert resolved.entity_id == "fund_1"
    assert resolved.source == "selected_ui_entity"


def test_resolve_scope_defaults_to_active_environment_for_generic_prompt(monkeypatch):
    monkeypatch.setattr(assistant_scope_svc, "resolve_env_business_context", _resolved_env_context)

    envelope = _envelope(
        ui={
            "route": "/lab/env/env_123/re/funds/fund_1",
            "surface": "fund_detail",
            "active_environment_id": "env_123",
            "active_environment_name": "Meridian Capital Management",
            "active_business_id": "biz_123",
            "schema_name": "env_meridian_capital",
            "industry": "repe",
            "page_entity_type": "fund",
            "page_entity_id": "fund_1",
            "page_entity_name": "IGF VII",
            "selected_entities": [
                {
                    "entity_type": "fund",
                    "entity_id": "fund_1",
                    "name": "IGF VII",
                    "source": "page",
                }
            ],
            "visible_data": {
                "funds": [
                    {
                        "entity_type": "fund",
                        "entity_id": "fund_1",
                        "name": "IGF VII",
                    }
                ],
                "investments": [],
                "assets": [],
                "models": [],
                "pipeline_items": [],
            },
        }
    )

    resolved = assistant_scope_svc.resolve_assistant_scope(
        user="user:env_123",
        context_envelope=envelope,
        user_message="Which funds do we have?",
    )

    assert resolved.resolved_scope_type == "environment"
    assert resolved.entity_type == "environment"
    assert resolved.entity_id == "env_123"
    assert resolved.source == "ui_context"


def test_visible_context_policy_disables_tools_for_visible_fund_list():
    policy = assistant_scope_svc.resolve_visible_context_policy(
        context_envelope=_envelope(),
        user_message="Which funds do we have?",
    )

    assert policy["disable_tools"] is True
    assert "visible fund list" in policy["instructions"][0].lower()


def test_visible_context_policy_disables_tools_for_visible_strategy_lookup():
    envelope = _envelope(
        ui={
            "route": "/lab/env/env_123/re/funds",
            "surface": "fund_portfolio",
            "active_environment_id": "env_123",
            "active_environment_name": "Meridian Capital Management",
            "active_business_id": "biz_123",
            "schema_name": "env_meridian_capital",
            "industry": "repe",
            "page_entity_type": "environment",
            "page_entity_id": "env_123",
            "selected_entities": [],
            "visible_data": {
                "funds": [
                    {
                        "entity_type": "fund",
                        "entity_id": "fund_1",
                        "name": "IGF VII",
                        "metadata": {"strategy": "value_add"},
                    }
                ],
                "investments": [],
                "assets": [],
                "models": [],
                "pipeline_items": [],
            },
        }
    )

    policy = assistant_scope_svc.resolve_visible_context_policy(
        context_envelope=envelope,
        user_message="What is the strategy for IGF VII?",
    )

    assert policy["disable_tools"] is True
