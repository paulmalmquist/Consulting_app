"""Tests for the deterministic Executive Autopilot morning brief (plan PR 16a). NO LLM.

Proves: every brief field traces to a real card (no fabrication), citations-only, idempotent
one-card-per-(env,date), cross-env safe, memory optional + fail-closed, the dedup_ref change
to upsert_card is backward compatible, and there is NO LLM path. No DB: the source/sink
services are monkeypatched.

Run: cd backend && python -m pytest tests/test_morning_brief.py -x -q
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import morning_brief as svc  # noqa: E402

ENV = "env-A"
BIZ = "00000000-0000-0000-0000-000000000001"


def _card(cid, *, ctype="finding", anomaly=False, priority=0.6, title="A signal",
          summary="why it matters", source_ref=None):
    return {"id": cid, "card_type": ctype, "title": title, "summary": summary,
            "source_ref": source_ref or {}, "priority_score": priority, "anomaly_flag": anomaly,
            "created_by": "analyzer:telemetry", "is_dismissed": False}


def _patch(monkeypatch, pool_by_type, *, memory=None):
    """Monkeypatch list_cards (per type) + upsert_card; capture upsert kwargs. memory: a
    dict the enterprise_memory.search stub returns, or an Exception to raise."""
    from app.services import intelligence_cards
    monkeypatch.setattr(intelligence_cards, "list_cards",
                        lambda env, biz, *, card_type=None, **kw: list(pool_by_type.get(card_type, [])))
    calls = []
    monkeypatch.setattr(intelligence_cards, "upsert_card",
                        lambda env, biz, **kw: calls.append(kw) or {"id": f"brief-{len(calls)}"})

    from app.services import enterprise_memory
    def _search(env, biz, q, **kw):
        if isinstance(memory, Exception):
            raise memory
        return memory if memory is not None else {"items": [], "null_reason": "no_matching_records"}
    monkeypatch.setattr(enterprise_memory, "search", _search)
    return calls


_ALERT = _card("al", ctype="alert", anomaly=True, priority=1.0, title="PSI drift", summary="drift erodes serving")
_WATCH = _card("wf", ctype="finding", anomaly=False, priority=0.7, title="overdue tasks", summary="tasks slipping")
_LOW = _card("lo", ctype="finding", anomaly=False, priority=0.3, title="minor", summary=None)


# ── deterministic assembly, cited-only, no fabrication ────────────────────────
def test_what_changed_is_anomaly_and_alert_only(monkeypatch):
    _patch(monkeypatch, {"alert": [_ALERT], "finding": [_WATCH, _LOW]})
    out = svc.generate(ENV, BIZ, brief_date="2026-06-16")
    b = out["brief"]
    assert [w["card_id"] for w in b["what_changed"]] == ["al"]
    assert b["why_it_matters"][0]["reason"] == "drift erodes serving"   # stored summary verbatim
    assert b["confidence"] == "high"


def test_what_to_watch_is_high_priority_non_anomaly(monkeypatch):
    _patch(monkeypatch, {"alert": [], "finding": [_WATCH, _LOW]})
    b = svc.generate(ENV, BIZ, brief_date="2026-06-16")["brief"]
    assert [w["card_id"] for w in b["what_to_watch"]] == ["wf"]          # 0.7 in, 0.3 out
    assert b["confidence"] == "medium"                                   # no anomaly, has watch


def test_recommended_actions_empty_without_carrier_then_surfaces(monkeypatch):
    # no card carries actions
    _patch(monkeypatch, {"finding": [_WATCH]})
    b = svc.generate(ENV, BIZ, brief_date="2026-06-16")["brief"]
    assert b["recommended_actions"] == []
    assert any(r["reason"] == "no_card_carries_actions" for r in b["null_reasons"])
    # a card that DOES carry actions in source_ref surfaces them (forward-compat)
    carrier = _card("cx", source_ref={"recommendations": ["do x"]})
    _patch(monkeypatch, {"finding": [carrier]})
    b2 = svc.generate(ENV, BIZ, brief_date="2026-06-16")["brief"]
    assert b2["recommended_actions"] == ["do x"]
    assert "cx" in b2["cited_card_ids"]


def test_cited_ids_are_only_used_cards(monkeypatch):
    _patch(monkeypatch, {"alert": [_ALERT], "finding": [_WATCH, _LOW]})
    b = svc.generate(ENV, BIZ, brief_date="2026-06-16")["brief"]
    assert b["cited_card_ids"] == ["al", "wf"]                           # _LOW never cited
    assert all(cid in {"al", "wf", "lo"} for cid in b["cited_card_ids"])


def test_empty_feed_is_honest(monkeypatch):
    calls = _patch(monkeypatch, {})
    out = svc.generate(ENV, BIZ, brief_date="2026-06-16")
    b = out["brief"]
    assert b["what_changed"] == [] and b["what_to_watch"] == []
    assert b["confidence"] == "none"
    assert any(r["reason"] == "no_cards_in_feed" for r in b["null_reasons"])
    assert len(calls) == 1                                               # an honest empty card is still written


def test_brief_excludes_prior_brief_cards(monkeypatch):
    prior = _card("old", ctype="story", source_ref={"type": "morning_brief", "brief_date": "2026-06-15"})
    _patch(monkeypatch, {"story": [prior], "alert": [_ALERT]})
    b = svc.generate(ENV, BIZ, brief_date="2026-06-16")["brief"]
    assert "old" not in b["cited_card_ids"]                              # never cites itself


# ── idempotency: one card per (env, date) ─────────────────────────────────────
def test_idempotent_same_date_stable_dedup_ref(monkeypatch):
    calls = _patch(monkeypatch, {"alert": [_ALERT]})
    svc.generate(ENV, BIZ, brief_date="2026-06-16")
    # change the pool on the second run; dedup_ref identity must stay constant
    _patch(monkeypatch, {"alert": [_ALERT, _card("al2", ctype="alert", anomaly=True)]})
    # re-bind capture to the same list via a fresh patch returning into calls2
    calls2 = _patch(monkeypatch, {"alert": [_ALERT, _card("al2", ctype="alert", anomaly=True)]})
    svc.generate(ENV, BIZ, brief_date="2026-06-16")
    d1 = calls[0]["dedup_ref"]
    d2 = calls2[0]["dedup_ref"]
    assert d1 == d2 == {"type": "morning_brief", "env_id": ENV, "brief_date": "2026-06-16"}


def test_different_date_distinct_dedup_ref(monkeypatch):
    calls = _patch(monkeypatch, {"alert": [_ALERT]})
    svc.generate(ENV, BIZ, brief_date="2026-06-16")
    svc.generate(ENV, BIZ, brief_date="2026-06-17")
    assert calls[0]["dedup_ref"]["brief_date"] == "2026-06-16"
    assert calls[1]["dedup_ref"]["brief_date"] == "2026-06-17"
    assert calls[0]["dedup_ref"] != calls[1]["dedup_ref"]


def test_card_is_autopilot_story(monkeypatch):
    calls = _patch(monkeypatch, {"alert": [_ALERT]})
    svc.generate(ENV, BIZ, brief_date="2026-06-16")
    kw = calls[0]
    assert kw["card_type"] == "story"
    assert kw["created_by"] == "autopilot"
    assert kw["source_ref"]["type"] == "morning_brief"


# ── cross-env safety ──────────────────────────────────────────────────────────
def test_cross_env_threads_env_into_reads(monkeypatch):
    seen_envs = []
    from app.services import intelligence_cards, enterprise_memory
    monkeypatch.setattr(intelligence_cards, "list_cards",
                        lambda env, biz, *, card_type=None, **kw: seen_envs.append(env) or [])
    monkeypatch.setattr(intelligence_cards, "upsert_card", lambda env, biz, **kw: {"id": "x"})
    monkeypatch.setattr(enterprise_memory, "search", lambda *a, **k: {"items": [], "null_reason": None})
    svc.generate("env-A", BIZ, brief_date="2026-06-16")
    assert set(seen_envs) == {"env-A"}                                   # only env-A read, never env-B


# ── memory optional + fail-closed, citations not answers ──────────────────────
def test_memory_citations_included_but_separate(monkeypatch):
    mem = {"items": [{"item_type": "adr", "source_id": "adr-1", "title": "Prior ADR",
                      "indexed_at": "2026-01-01", "scope": "global", "score": 0.8}], "null_reason": None}
    _patch(monkeypatch, {"alert": [_ALERT]}, memory=mem)
    b = svc.generate(ENV, BIZ, brief_date="2026-06-16")["brief"]
    assert b["memory"]["items"][0]["source_id"] == "adr-1"
    # memory items are NOT folded into card citations or why_it_matters
    assert "adr-1" not in b["cited_card_ids"]
    assert all(w["card_id"] != "adr-1" for w in b["why_it_matters"])


def test_memory_unavailable_does_not_block(monkeypatch):
    _patch(monkeypatch, {"alert": [_ALERT]}, memory={"items": [], "null_reason": "embedding_provider_unavailable"})
    b = svc.generate(ENV, BIZ, brief_date="2026-06-16")["brief"]
    assert b["memory"]["null_reason"] == "embedding_provider_unavailable"
    assert b["what_changed"]                                              # brief still produced from cards


def test_memory_exception_does_not_block(monkeypatch):
    _patch(monkeypatch, {"alert": [_ALERT]}, memory=RuntimeError("boom"))
    b = svc.generate(ENV, BIZ, brief_date="2026-06-16")["brief"]
    assert b["memory"]["null_reason"] == "memory_unavailable"
    assert b["what_changed"]


# ── fail closed on upsert ─────────────────────────────────────────────────────
def test_upsert_failure_fails_closed(monkeypatch):
    from app.services import intelligence_cards, enterprise_memory
    monkeypatch.setattr(intelligence_cards, "list_cards", lambda env, biz, *, card_type=None, **kw: [_ALERT])
    monkeypatch.setattr(intelligence_cards, "upsert_card",
                        lambda env, biz, **kw: (_ for _ in ()).throw(RuntimeError("db")))
    monkeypatch.setattr(enterprise_memory, "search", lambda *a, **k: {"items": [], "null_reason": None})
    out = svc.generate(ENV, BIZ, brief_date="2026-06-16")
    assert out["card_id"] is None
    assert out["null_reason"] == "morning_brief_unavailable"


# ── get_brief ─────────────────────────────────────────────────────────────────
def test_get_returns_today_or_honest_null(monkeypatch):
    from app.services import intelligence_cards
    brief_card = _card("b1", ctype="story", source_ref={"type": "morning_brief", "brief_date": "2026-06-16"})
    monkeypatch.setattr(intelligence_cards, "list_cards", lambda env, biz, *, card_type=None, **kw: [brief_card])
    got = svc.get_brief(ENV, BIZ, brief_date="2026-06-16")
    assert got["card_id"] == "b1"
    miss = svc.get_brief(ENV, BIZ, brief_date="2026-06-20")
    assert miss["brief"] is None and miss["null_reason"] == "no_brief_for_date"


# ── NO LLM path (load-bearing) ────────────────────────────────────────────────
def test_module_imports_no_llm():
    import ast
    import inspect
    banned = ("openai", "anthropic", "ai_gateway", "ai_conversations", "litellm", "ai_copilot", "chat")
    tree = ast.parse(inspect.getsource(svc))
    imported = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            imported += [a.name for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            imported.append(n.module or "")
    for name in imported:
        assert not any(b in name for b in banned), f"unexpected import {name!r}"


# ── dedup_ref backward compatibility on upsert_card (the merged-file change) ──
def test_upsert_card_dedup_ref_is_backward_compatible(monkeypatch):
    from app.services import intelligence_cards as ic
    # Without dedup_ref, the key hashes the full source_ref exactly as before.
    sr = {"type": "reel", "member_card_ids": ["a", "b"]}
    assert ic._source_ref_key(sr) == ic._source_ref_key(sr)              # stable
    # dedup_ref hashes a DIFFERENT identity -> different key, leaving the no-arg path intact.
    assert ic._source_ref_key({"type": "morning_brief", "x": 1}) != ic._source_ref_key(sr)


# ── routes ────────────────────────────────────────────────────────────────────
def test_route_generate_fails_closed(client, monkeypatch):
    from app.routes import morning_brief as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "generate", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    resp = client.post("/api/ade/intel/morning-brief/generate", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "morning_brief_unavailable"


def test_route_generate_success(client, monkeypatch):
    from app.routes import morning_brief as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "generate",
                        lambda env, biz, **kw: {"brief": {"type": "morning_brief"}, "card_id": "c1", "null_reason": None})
    resp = client.post("/api/ade/intel/morning-brief/generate", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["card_id"] == "c1"


def test_route_get_honest_null(client, monkeypatch):
    from app.routes import morning_brief as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "get_brief",
                        lambda env, biz, **kw: {"brief": None, "card_id": None, "null_reason": "no_brief_for_date"})
    resp = client.get("/api/ade/intel/morning-brief", params={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "no_brief_for_date"
