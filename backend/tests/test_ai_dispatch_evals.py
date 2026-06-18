"""Routing eval suite: in-process, deterministic, prod-safe (no model calls, no DB)."""
from __future__ import annotations

from app.services.ai_dispatch.evals import ROUTING_EVAL_CASES, run_routing_evals


def test_routing_evals_all_pass():
    result = run_routing_evals()
    assert result["suite"] == "routing_policy"
    assert result["total"] == len(ROUTING_EVAL_CASES)
    assert result["failed"] == 0
    assert result["passed"] == result["total"]
    for case in result["cases"]:
        assert case["passed"] is True


def test_routing_evals_cases_are_deterministic_regardless_of_env(monkeypatch):
    # Even with OpenAI + Anthropic configured, the policy-denial / fail-closed
    # cases still hold (no provider availability changes their outcome).
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "ak-test")
    assert run_routing_evals()["failed"] == 0


def test_evals_route_returns_suite(client):
    resp = client.get("/api/ai/dispatch/evals")
    assert resp.status_code == 200
    data = resp.json()
    assert data["suite"] == "routing_policy"
    assert data["failed"] == 0
    assert data["passed"] == data["total"] >= 4
