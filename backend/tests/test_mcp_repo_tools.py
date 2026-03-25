"""Tests for MCP repo helper tools — security and allowlist enforcement."""

import os
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

import pytest

from app.mcp.tools.repo_tools import _is_allowed_path, _read_file, _search_files
from app.mcp.auth import McpContext
from app.mcp.schemas.repo_tools import ReadFileInput, SearchFilesInput


@pytest.fixture
def ctx():
    return McpContext(actor="test_user", token_valid=True)


def test_deny_env_files():
    assert _is_allowed_path(".env") is False
    assert _is_allowed_path(".env.local") is False
    assert _is_allowed_path("backend/.env") is False
    assert _is_allowed_path("backend/.env.production") is False


def test_deny_git_directory():
    assert _is_allowed_path(".git/config") is False
    assert _is_allowed_path("backend/.git/HEAD") is False


def test_deny_node_modules():
    assert _is_allowed_path("repo-b/node_modules/foo/index.js") is False


def test_allow_valid_paths():
    assert _is_allowed_path("backend/app/main.py") is True
    assert _is_allowed_path("backend/requirements.txt") is True
    assert _is_allowed_path("repo-b/db/schema.sql") is True


def test_deny_outside_allowed_roots():
    assert _is_allowed_path("secrets/keys.txt") is False
    assert _is_allowed_path("../../etc/passwd") is False


def test_read_file_denies_env(ctx):
    inp = ReadFileInput(path=".env")
    with pytest.raises(PermissionError, match="not allowed"):
        _read_file(ctx, inp)


def test_read_file_denies_env_local(ctx):
    inp = ReadFileInput(path="backend/.env.local")
    with pytest.raises(PermissionError, match="not allowed"):
        _read_file(ctx, inp)


def test_search_rejects_invalid_root(ctx):
    inp = SearchFilesInput(query="password", roots=["secrets"])
    with pytest.raises(ValueError, match="not in allowed repo roots"):
        _search_files(ctx, inp)
