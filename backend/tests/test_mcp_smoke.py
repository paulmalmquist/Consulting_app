"""Smoke tests for new MCP tools.

Run with: pytest backend/tests/test_mcp_smoke.py -v

These tests verify that all new MCP tools are registered and callable
in dry-run mode without causing errors.
"""

import json
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Set dry-run mode
os.environ["BM_MCP_DRY_RUN"] = "1"
os.environ["_BM_SKIP_DB_CHECK"] = "1"
os.environ["MCP_API_TOKEN"] = "test-token"
os.environ["ENABLE_MCP_WRITES"] = "false"  # Start with writes disabled


def test_env_tools_registered():
    """Test that env tools are registered."""
    from app.mcp.registry import registry
    from app.mcp.tools.env_tools import register_env_tools

    register_env_tools()

    # Check env.get
    tool = registry.get("env.get")
    assert tool is not None
    assert tool.name == "env.get"
    assert tool.module == "env"
    assert tool.permission == "read"

    # Check env.set
    tool = registry.get("env.set")
    assert tool is not None
    assert tool.name == "env.set"
    assert tool.module == "env"
    assert tool.permission == "write"


def test_git_tools_registered():
    """Test that git tools are registered."""
    from app.mcp.registry import registry
    from app.mcp.tools.git_tools import register_git_tools

    register_git_tools()

    # Check git.diff
    tool = registry.get("git.diff")
    assert tool is not None
    assert tool.name == "git.diff"
    assert tool.module == "git"
    assert tool.permission == "read"

    # Check git.commit
    tool = registry.get("git.commit")
    assert tool is not None
    assert tool.name == "git.commit"
    assert tool.module == "git"
    assert tool.permission == "write"


def test_fe_tools_registered():
    """Test that frontend tools are registered."""
    from app.mcp.registry import registry
    from app.mcp.tools.fe_tools import register_fe_tools

    register_fe_tools()

    # Check fe.edit
    tool = registry.get("fe.edit")
    assert tool is not None
    assert tool.name == "fe.edit"
    assert tool.module == "fe"
    assert tool.permission == "write"

    # Check fe.run
    tool = registry.get("fe.run")
    assert tool is not None
    assert tool.name == "fe.run"
    assert tool.module == "fe"
    assert tool.permission == "read"


def test_api_tools_registered():
    """Test that API tools are registered."""
    from app.mcp.registry import registry
    from app.mcp.tools.api_tools import register_api_tools

    register_api_tools()

    # Check api.call
    tool = registry.get("api.call")
    assert tool is not None
    assert tool.name == "api.call"
    assert tool.module == "api"
    assert tool.permission == "read"


def test_codex_tools_registered():
    """Test that Codex tools are registered."""
    from app.mcp.registry import registry
    from app.mcp.tools.codex_tools import register_codex_tools

    register_codex_tools()

    # Check codex.task
    tool = registry.get("codex.task")
    assert tool is not None
    assert tool.name == "codex.task"
    assert tool.module == "codex"
    assert tool.permission == "write"


def test_db_tools_registered():
    """Test that DB tools are registered."""
    from app.mcp.registry import registry
    from app.mcp.tools.db_tools import register_db_tools

    register_db_tools()

    # Check db.upsert
    tool = registry.get("db.upsert")
    assert tool is not None
    assert tool.name == "db.upsert"
    assert tool.module == "db"
    assert tool.permission == "write"


def test_env_get_read_only():
    """Test env.get with dry-run."""
    from app.mcp.registry import registry
    from app.mcp.auth import McpContext
    from app.mcp.schemas.env_tools import EnvGetInput

    tool = registry.get("env.get")
    ctx = McpContext(actor="test_user", token_valid=True)

    # Test reading process env
    inp = EnvGetInput(key="PATH", scope="process", reveal=False)
    result = tool.handler(ctx, inp)

    assert result["key"] == "PATH"
    assert result["scope"] == "process"
    assert result["status"] in ["set", "not set"]


def test_git_diff_read_only():
    """Test git.diff."""
    from app.mcp.registry import registry
    from app.mcp.auth import McpContext
    from app.mcp.schemas.git_tools import GitDiffInput

    tool = registry.get("git.diff")
    ctx = McpContext(actor="test_user", token_valid=True)

    # Test git diff
    inp = GitDiffInput(target="HEAD", paths=[], staged=False)
    result = tool.handler(ctx, inp)

    assert "success" in result
    if result["success"]:
        assert "diff" in result
        assert "changed_files" in result


def test_fe_run_typecheck():
    """Test fe.run with typecheck preset."""
    from app.mcp.registry import registry
    from app.mcp.auth import McpContext
    from app.mcp.schemas.fe_tools import FeRunInput

    tool = registry.get("fe.run")
    ctx = McpContext(actor="test_user", token_valid=True)

    # Test typecheck (fast, read-only)
    inp = FeRunInput(command_preset="typecheck", timeout_sec=30)
    result = tool.handler(ctx, inp)

    assert "success" in result
    assert "command" in result
    # May succeed or fail depending on repo state, but should return structure


def test_all_tools_list():
    """Test that all new tools show up in tool listing."""
    from app.mcp.registry import registry

    tool_names = [t.name for t in registry.list_all()]

    # Check new tools are present
    assert "env.get" in tool_names
    assert "env.set" in tool_names
    assert "git.diff" in tool_names
    assert "git.commit" in tool_names
    assert "fe.edit" in tool_names
    assert "fe.run" in tool_names
    assert "api.call" in tool_names
    assert "codex.task" in tool_names
    assert "db.upsert" in tool_names


if __name__ == "__main__":
    # Run basic smoke test
    print("Running MCP smoke tests...")

    # Register all tools once at the start
    from app.mcp.server import _register_all_tools
    _register_all_tools()
    print("✓ all tools registered")

    test_env_get_read_only()
    print("✓ env.get works")

    test_git_diff_read_only()
    print("✓ git.diff works")

    test_fe_run_typecheck()
    print("✓ fe.run works")

    test_all_tools_list()
    print("✓ all tools listed")

    print("\n✅ All smoke tests passed!")
