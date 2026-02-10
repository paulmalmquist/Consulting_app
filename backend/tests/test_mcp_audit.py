"""Tests for MCP audit redaction and permission gating."""

import os
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

import pytest
from unittest.mock import patch

from app.services.audit import redact_dict


def test_redact_sensitive_keys():
    data = {
        "api_token": "secret123",
        "password": "hunter2",
        "apikey": "key-abc",
        "authorization": "Bearer xyz",
        "service_role_key": "svc-key",
        "normal_field": "visible",
    }
    result = redact_dict(data)
    assert result["api_token"] == "***REDACTED***"
    assert result["password"] == "***REDACTED***"
    assert result["apikey"] == "***REDACTED***"
    assert result["authorization"] == "***REDACTED***"
    assert result["service_role_key"] == "***REDACTED***"
    assert result["normal_field"] == "visible"


def test_redact_signed_url():
    data = {
        "signed_upload_url": "https://storage.example.com/upload?token=abc123&expires=999",
    }
    result = redact_dict(data)
    assert result["signed_upload_url"] == "***REDACTED***"


def test_redact_url_values_strip_query():
    data = {
        "callback_url": "https://example.com/callback?session=abc&user=foo",
    }
    result = redact_dict(data)
    assert result["callback_url"] == "https://example.com/callback?***"


def test_redact_truncate_long_strings():
    data = {"long_field": "x" * 1000}
    result = redact_dict(data)
    assert len(result["long_field"]) < 600
    assert "truncated" in result["long_field"]


def test_redact_truncate_arrays():
    data = {"items": list(range(50))}
    result = redact_dict(data)
    assert len(result["items"]) == 10


def test_redact_nested_dict():
    data = {
        "outer": {
            "token": "secret",
            "name": "visible",
        }
    }
    result = redact_dict(data)
    assert result["outer"]["token"] == "***REDACTED***"
    assert result["outer"]["name"] == "visible"


def test_redact_non_dict_returns_empty():
    assert redact_dict("not a dict") == {}
    assert redact_dict(None) == {}


def test_write_blocked_without_flag():
    """Write tools should be blocked when ENABLE_MCP_WRITES != true."""
    from app.mcp.audit import execute_tool, WriteNotEnabled
    from app.mcp.auth import McpContext
    from app.mcp.registry import ToolDef
    from pydantic import BaseModel

    class _WriteInput(BaseModel):
        model_config = {"extra": "forbid"}
        confirm: bool = False

    tool = ToolDef(
        name="test.write_tool",
        description="test write",
        module="test",
        permission="write",
        input_model=_WriteInput,
        handler=lambda ctx, inp: {"ok": True},
    )
    ctx = McpContext(actor="test", token_valid=True)

    with patch("app.mcp.audit.ENABLE_MCP_WRITES", False):
        with pytest.raises(WriteNotEnabled):
            execute_tool(tool, ctx, {"confirm": True})


def test_write_blocked_without_confirm():
    """Write tools should be blocked when confirm != true."""
    from app.mcp.audit import execute_tool, ConfirmRequired
    from app.mcp.auth import McpContext
    from app.mcp.registry import ToolDef
    from pydantic import BaseModel

    class _WriteInput(BaseModel):
        model_config = {"extra": "forbid"}
        confirm: bool = False

    tool = ToolDef(
        name="test.write_noconfirm",
        description="test write",
        module="test",
        permission="write",
        input_model=_WriteInput,
        handler=lambda ctx, inp: {"ok": True},
    )
    ctx = McpContext(actor="test", token_valid=True)

    with patch("app.mcp.audit.ENABLE_MCP_WRITES", True):
        with pytest.raises(ConfirmRequired):
            execute_tool(tool, ctx, {"confirm": False})
