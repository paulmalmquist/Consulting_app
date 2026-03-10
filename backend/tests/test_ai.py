"""Tests for /api/ai/* endpoints and retrieval safety."""

import os
from pathlib import Path
from unittest.mock import patch


def test_ai_health_disabled(client):
    """AI health should return enabled=false when AI_MODE != local."""
    with patch.dict(os.environ, {"AI_MODE": "off"}):
        resp = client.get("/api/ai/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["sidecar_ok"] is False


def test_ai_ask_disabled(client):
    """AI ask should return 301 (legacy route redirects to gateway)."""
    resp = client.post("/api/ai/ask", json={"prompt": "hello"})
    assert resp.status_code == 301
    assert "gateway" in resp.json()["detail"].lower()


def test_ai_ask_prompt_too_large(client):
    """Legacy ask route returns 301 regardless of payload."""
    resp = client.post("/api/ai/ask", json={
        "prompt": "x" * 100,
    })
    assert resp.status_code == 301


def test_ai_code_task_requires_dry_run(client):
    """Legacy code_task route returns 301 redirect to gateway."""
    resp = client.post("/api/ai/code_task", json={
        "task": "hello",
        "dry_run": False,
    })
    assert resp.status_code == 301
    assert "gateway" in resp.json()["detail"].lower()


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
