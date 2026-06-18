"""Registry: completeness, implemented/available invariants, Gemma boundaries."""
from __future__ import annotations

from app.services.ai_dispatch.models import ProviderName, TaskMode
from app.services.ai_dispatch.registry import provider_registry


def test_all_three_providers_registered():
    names = {p.name for p in provider_registry.list_all()}
    assert names == {ProviderName.OPENAI, ProviderName.ANTHROPIC, ProviderName.GEMMA_GCP}


def test_gemma_not_implemented_so_unavailable_even_with_env(monkeypatch):
    monkeypatch.setenv("GEMMA_VERTEX_PROJECT_ID", "proj")
    monkeypatch.setenv("GEMMA_VERTEX_ENDPOINT_ID", "endpoint")
    assert provider_registry.is_implemented(ProviderName.GEMMA_GCP) is False
    assert provider_registry.available(ProviderName.GEMMA_GCP) is False


def test_openai_availability_reflects_env(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert provider_registry.available(ProviderName.OPENAI) is False
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert provider_registry.available(ProviderName.OPENAI) is True


def test_describe_all_shape():
    described = provider_registry.describe_all()
    assert len(described) == 3
    for entry in described:
        for key in (
            "name",
            "display_name",
            "default_model",
            "allowed_modes",
            "max_risk",
            "max_privacy",
            "implemented",
            "available",
            "missing_env",
        ):
            assert key in entry


def test_gemma_modes_exclude_code_tools_and_sql():
    gemma = provider_registry.get(ProviderName.GEMMA_GCP)
    assert gemma is not None
    for forbidden in (TaskMode.CODE, TaskMode.TOOL_EXECUTION, TaskMode.SQL_DRAFT, TaskMode.EVAL_GRADING):
        assert forbidden not in gemma.allowed_modes
