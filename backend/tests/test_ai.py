"""Tests for /api/ai/* endpoints and retrieval safety."""

from pathlib import Path


def test_winston_chat_routes_are_removed(client):
    """Winston chat and operator routes must remain unavailable during the rebuild."""
    requests = [
        ("get", "/api/ai/health"),
        ("post", "/api/ai/ask"),
        ("post", "/api/ai/code_task"),
        ("get", "/api/ai/gateway/health"),
        ("post", "/api/ai/gateway/ask"),
        ("get", "/api/ai/operator/health"),
        ("post", "/api/ai/operator/ask"),
    ]

    for method, path in requests:
        response = getattr(client, method)(path)
        assert response.status_code == 404, path


# ── Retrieval safety tests ──────────────────────────────────────────

def test_retrieval_denies_env_files():
    """Retrieval should never read .env files."""
    from app.ai.retrieval import _is_denied

    assert _is_denied(Path(".env")) is True
    assert _is_denied(Path(".env.local")) is True
    assert _is_denied(Path("backend/.env")) is True
    assert _is_denied(Path("repo-b/.env.production")) is True


def test_retrieval_denies_git_and_node_modules():
    """Retrieval should skip .git and node_modules."""
    from app.ai.retrieval import _is_denied

    assert _is_denied(Path(".git/config")) is True
    assert _is_denied(Path("node_modules/express/index.js")) is True
    assert _is_denied(Path("repo-b/node_modules/next/package.json")) is True


def test_retrieval_denies_venv():
    """Retrieval should skip .venv directories."""
    from app.ai.retrieval import _is_denied

    assert _is_denied(Path(".venv/lib/python3.11/site.py")) is True
    assert _is_denied(Path("backend/.venv/bin/python")) is True


def test_retrieval_allows_normal_files():
    """Normal source files should not be denied."""
    from app.ai.retrieval import _is_denied

    assert _is_denied(Path("backend/app/main.py")) is False
    assert _is_denied(Path("repo-b/src/lib/api.ts")) is False
    assert _is_denied(Path("docs/execution-engine-v1/01-canonical-schema-v1.md")) is False


def test_retrieval_empty_query_returns_empty():
    """Empty query should return no snippets."""
    from app.ai.retrieval import retrieve_snippets

    result = retrieve_snippets(query="", allowed_roots=["backend"])
    assert result == []
