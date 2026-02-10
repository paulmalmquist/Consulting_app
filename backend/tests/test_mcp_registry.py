"""Tests for MCP tool registry and tool schemas."""

import os
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

import pytest
from pydantic import BaseModel

from app.mcp.registry import ToolDef, ToolRegistry


class _DummyInput(BaseModel):
    model_config = {"extra": "forbid"}
    x: int


def _dummy_handler(ctx, inp):
    return {"ok": True}


def test_registry_uniqueness():
    reg = ToolRegistry()
    reg.register(ToolDef(
        name="test.tool1",
        description="Test 1",
        module="test",
        permission="read",
        input_model=_DummyInput,
        handler=_dummy_handler,
    ))
    with pytest.raises(ValueError, match="Duplicate tool name"):
        reg.register(ToolDef(
            name="test.tool1",
            description="Test 1 again",
            module="test",
            permission="read",
            input_model=_DummyInput,
            handler=_dummy_handler,
        ))


def test_registry_invalid_permission():
    reg = ToolRegistry()
    with pytest.raises(ValueError, match="Invalid permission"):
        reg.register(ToolDef(
            name="test.bad",
            description="Bad",
            module="test",
            permission="admin",
            input_model=_DummyInput,
            handler=_dummy_handler,
        ))


def test_schema_generation():
    tool = ToolDef(
        name="test.schema",
        description="Schema test",
        module="test",
        permission="read",
        input_model=_DummyInput,
        handler=_dummy_handler,
    )
    schema = tool.input_schema
    assert "properties" in schema
    assert "x" in schema["properties"]


def test_describe_all():
    reg = ToolRegistry()
    reg.register(ToolDef(
        name="test.a",
        description="A",
        module="test",
        permission="read",
        input_model=_DummyInput,
        handler=_dummy_handler,
    ))
    reg.register(ToolDef(
        name="test.b",
        description="B",
        module="test",
        permission="write",
        input_model=_DummyInput,
        handler=_dummy_handler,
    ))
    desc = reg.describe_all()
    assert len(desc) == 2
    names = {d["name"] for d in desc}
    assert names == {"test.a", "test.b"}


def test_global_registry_has_tools():
    """After importing all tool modules, global registry should have tools."""
    from app.mcp.tools.meta import register_meta_tools
    from app.mcp.tools.business_tools import register_business_tools
    from app.mcp.tools.repo_tools import register_repo_tools
    from app.mcp.registry import registry

    # Use a fresh registry for this test
    fresh = ToolRegistry()
    # Just verify the registration functions don't crash
    # (They register on the global registry, so we just check it's populated)
    register_meta_tools()
    register_business_tools()
    register_repo_tools()

    tools = registry.list_all()
    names = {t.name for t in tools}
    assert "bm.health_check" in names
    assert "bm.list_tools" in names
    assert "business.list_templates" in names
    assert "repo.search_files" in names
