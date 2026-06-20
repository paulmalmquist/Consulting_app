"""Tests for Agent Personalities (plan PR 13) — deterministic role lenses, NO LLM.

Run: cd backend && python -m pytest tests/test_agent_personalities.py -x -q

Proves: each agent filters existing cards by its role deterministically; agents read only
existing cards (never invent); produced cards are role-tagged (created_by 'agent:<type>')
and reference their source cards; re-running is idempotent (sorted member ids); empty
results are honest (reason, no card); and NO LLM/model-call path exists in the module.
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import agent_personalities as svc  # noqa: E402

ENV = "test-env"
BIZ = "00000000-0000-0000-0000-000000000001"


def _card(cid, *, ctype="finding", anomaly=False, priority=0.6, title="A signal",
          source=None, field=None, signal_type=None, analyzer="business", created_by="analyzer:business"):
    ref = {"analyzer_type": analyzer}
    if source:
        ref["source"] = source
    if field:
        ref["field"] = field
    if signal_type:
        ref["signal_type"] = signal_type
    return {"id": cid, "card_type": ctype, "title": title, "summary": title,
            "source_ref": ref, "priority_score": priority, "anomaly_flag": anomaly,
            "created_by": created_by, "is_dismissed": False}


# Real-shaped cards spanning the analyzer vocabularies.
_CASH = _card("cash", field="cash_balance", signal_type="leading_indicator", title="Cash balance $120k")
_OVERDUE = _card("od", field="overdue_count", signal_type="bottleneck", title="5 tasks overdue")
_DQ = _card("dq", source="dq_assertions", analyzer="data_platform", title="DQ assertion failed")
_PSI = _card("psi", ctype="alert", anomaly=True, priority=1.0, analyzer="telemetry",
             field="psi", signal_type="risk", title="PSI drift 0.34")


def _patch_pool(monkeypatch, by_type):
    from app.services import intelligence_cards
    monkeypatch.setattr(intelligence_cards, "list_cards",
                        lambda env, biz, *, card_type=None, **kw: list(by_type.get(card_type, [])))
    calls = []
    monkeypatch.setattr(intelligence_cards, "upsert_card",
                        lambda env, biz, **kw: calls.append(kw) or {"id": f"agent-card-{len(calls)}"})
    return calls


# ── deterministic role predicates ─────────────────────────────────────────────
def test_predicates_route_cards_to_the_right_agent():
    assert svc._is_cfo(_CASH) and not svc._is_cfo(_DQ)
    assert svc._is_ops(_OVERDUE) and svc._is_ops(_PSI)        # psi/telemetry is operational
    assert svc._is_dq(_DQ) and not svc._is_dq(_CASH)
    assert svc._is_risk(_PSI) and not svc._is_risk(_CASH)     # risk = anomaly/alert/risk signal


def test_registry_is_the_four_fixed_agents():
    assert [a["agent_type"] for a in svc.list_agents()] == ["cfo", "operations", "data_quality", "risk"]
    assert svc.list_agents()[0]["created_by"] == "agent:cfo"


# ── run_agent: tag + reference + idempotency ──────────────────────────────────
def test_run_agent_tags_card_and_references_sources(monkeypatch):
    calls = _patch_pool(monkeypatch, {"finding": [_CASH, _OVERDUE], "alert": [], "story": []})
    out = svc.run_agent("cfo", ENV, BIZ)
    assert out["matched"] == 1                                # only the cash card matches CFO
    assert len(calls) == 1
    kw = calls[0]
    assert kw["created_by"] == "agent:cfo"
    assert kw["source_ref"]["type"] == "agent_rollup"
    assert kw["source_ref"]["agent_type"] == "cfo"
    assert kw["source_ref"]["member_card_ids"] == ["cash"]


def test_run_agent_idempotent_sorted_member_ids(monkeypatch):
    pool = {"finding": [_OVERDUE, _card("od2", field="overdue_count", signal_type="bottleneck")],
            "alert": [], "story": []}
    calls = _patch_pool(monkeypatch, pool)
    svc.run_agent("operations", ENV, BIZ)
    svc.run_agent("operations", ENV, BIZ)
    assert calls[0]["source_ref"]["member_card_ids"] == calls[1]["source_ref"]["member_card_ids"] == ["od", "od2"]


def test_risk_agent_flags_anomaly_card_as_alert(monkeypatch):
    calls = _patch_pool(monkeypatch, {"finding": [], "alert": [_PSI], "story": []})
    out = svc.run_agent("risk", ENV, BIZ)
    assert out["matched"] == 1
    assert calls[0]["card_type"] == "alert"
    assert calls[0]["anomaly_flag"] is True


def test_agents_do_not_roll_up_other_agents(monkeypatch):
    # an agent-authored card in the pool must be excluded from the source set
    agent_card = _card("a1", field="cash_balance", created_by="agent:cfo")
    calls = _patch_pool(monkeypatch, {"finding": [agent_card], "alert": [], "story": []})
    out = svc.run_agent("cfo", ENV, BIZ)
    assert out["matched"] == 0
    assert out["null_reason"] == "no_source_cards"
    assert calls == []


# ── honest empty / fail closed ────────────────────────────────────────────────
def test_no_matching_cards_is_honest_empty(monkeypatch):
    calls = _patch_pool(monkeypatch, {"finding": [_DQ], "alert": [], "story": []})  # DQ-only pool
    out = svc.run_agent("cfo", ENV, BIZ)
    assert out["matched"] == 0 and out["card_id"] is None
    assert out["null_reason"] == "no_cards_match_role"
    assert calls == []


def test_unknown_agent_type_fails_closed(monkeypatch):
    _patch_pool(monkeypatch, {"finding": [_CASH], "alert": [], "story": []})
    out = svc.run_agent("ceo", ENV, BIZ)
    assert out["null_reason"] == "unknown_agent_type"


def test_upsert_failure_is_reported_not_raised(monkeypatch):
    from app.services import intelligence_cards
    monkeypatch.setattr(intelligence_cards, "list_cards",
                        lambda env, biz, *, card_type=None, **kw: [_CASH] if card_type == "finding" else [])
    monkeypatch.setattr(intelligence_cards, "upsert_card",
                        lambda env, biz, **kw: (_ for _ in ()).throw(RuntimeError("db")))
    out = svc.run_agent("cfo", ENV, BIZ)
    assert out["null_reason"] == "agent_card_upsert_failed"
    assert out["card_id"] is None


def test_run_all_runs_four_agents(monkeypatch):
    _patch_pool(monkeypatch, {"finding": [_CASH, _OVERDUE, _DQ], "alert": [_PSI], "story": []})
    out = svc.run_all(ENV, BIZ)
    assert len(out["results"]) == 4
    # cfo(cash), operations(overdue+psi), data_quality(dq), risk(psi) all match -> 4 cards
    assert out["cards_upserted"] == 4


# ── NO LLM path (the load-bearing invariant of this PR) ───────────────────────
def test_module_has_no_llm_import():
    # Inspect IMPORTS via AST, not raw text — the "NO LLM" docstring legitimately mentions
    # the word. The invariant is that the module pulls in no model/gateway SDK.
    import ast
    import inspect
    banned = ("openai", "anthropic", "ai_gateway", "ai_conversations", "litellm", "ai_copilot")
    tree = ast.parse(inspect.getsource(svc))
    imported: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported += [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            imported.append(node.module or "")
    for name in imported:
        assert not any(b in name for b in banned), f"agent_personalities must not import {name!r}"


def test_run_agent_calls_no_model(monkeypatch):
    # The only external write an agent makes is upsert_card; nothing else is invoked. We
    # prove it by making upsert_card the sole side effect and asserting it's the one call.
    from app.services import intelligence_cards
    monkeypatch.setattr(intelligence_cards, "list_cards",
                        lambda env, biz, *, card_type=None, **kw: [_CASH] if card_type == "finding" else [])
    seen = []
    monkeypatch.setattr(intelligence_cards, "upsert_card",
                        lambda env, biz, **kw: seen.append("upsert") or {"id": "x"})
    svc.run_agent("cfo", ENV, BIZ)
    assert seen == ["upsert"]  # exactly one write, no model call interleaved


# ── route ─────────────────────────────────────────────────────────────────────
def test_route_list_agents(client):
    resp = client.get("/api/ade/agents")
    assert resp.status_code == 200
    assert [a["agent_type"] for a in resp.json()["agents"]] == ["cfo", "operations", "data_quality", "risk"]


def test_route_run_fails_closed(client, monkeypatch):
    from app.routes import agent_personalities as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "run_all", lambda env, biz: (_ for _ in ()).throw(RuntimeError("x")))
    resp = client.post("/api/ade/agents/run", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "agents_run_unavailable"


def test_route_run_single_agent(client, monkeypatch):
    from app.routes import agent_personalities as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "run_agent",
                        lambda at, env, biz: {"agent_type": at, "matched": 2, "card_id": "c1",
                                              "null_reason": None, "latency_ms": 3})
    resp = client.post("/api/ade/agents/run", json={"env_id": ENV, "business_id": BIZ, "agent_type": "risk"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["cards_upserted"] == 1
    assert body["results"][0]["agent_type"] == "risk"
