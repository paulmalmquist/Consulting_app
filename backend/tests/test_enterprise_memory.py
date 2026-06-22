"""Tests for Enterprise Memory Index (plan PR 15) — scoped retrieval, NO LLM.

No DB required: a fake cursor captures executed SQL + serves canned rows, so we can prove
the env-boundary contract (global ∪ env, cross-env excluded), the provider-fail-closed path
(no zero-vector ever, _embed_texts never called without a key), async non-blocking, citation
shape, and the absence of any LLM/answer path. Route tests monkeypatch the service.

Run: cd backend && python -m pytest tests/test_enterprise_memory.py -x -q
"""
import os
from contextlib import contextmanager

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

import pytest  # noqa: E402

from app.services import enterprise_memory as svc  # noqa: E402

ENV_A = "env-A"
ENV_B = "env-B"
BIZ = "00000000-0000-0000-0000-000000000001"


class FakeCursor:
    """Records every (sql, params) and returns queued rows for fetchone/fetchall."""
    def __init__(self, rows_queue):
        self.executed = []
        self._rows_queue = list(rows_queue)  # list of row-lists, popped per SELECT
        self._last = None

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        s = sql.strip().lower()
        # A statement that reads back rows (a SELECT, or an INSERT/UPDATE ... RETURNING)
        # consumes the next queued row-set; set_config and plain writes return nothing.
        reads_rows = (s.startswith("select") and "set_config" not in s) or "returning" in s
        if reads_rows:
            self._last = self._rows_queue.pop(0) if self._rows_queue else []
        else:
            self._last = []

    def fetchone(self):
        return self._last[0] if self._last else None

    def fetchall(self):
        return self._last

    def all_sql(self):
        return " || ".join(sql for sql, _ in self.executed).lower()


def _patch_cursor(monkeypatch, rows_queue=()):
    cur = FakeCursor(rows_queue)

    @contextmanager
    def fake_get_cursor():
        yield cur

    monkeypatch.setattr(svc, "get_cursor", fake_get_cursor)
    return cur


def _set_key(monkeypatch, value):
    from app import config
    monkeypatch.setattr(config, "OPENAI_API_KEY", value, raising=False)


# ── async non-blocking index (no provider call on the request path) ───────────
def test_index_returns_pending_without_calling_provider(monkeypatch):
    cur = _patch_cursor(monkeypatch, rows_queue=[[{"id": "item-1"}]])
    called = []
    monkeypatch.setattr("app.services.rag_indexer._embed_texts", lambda t: called.append(t) or [[0.1] * 1536])
    out = svc.index_item(item_type="card", source_id="c1", title="T", content_text="body",
                         business_id=BIZ, env_id=ENV_A)
    assert out["embedding_status"] == "pending"
    assert out["item_id"] == "item-1"
    assert called == []                       # provider NOT called during index
    assert "insert into nv_enterprise_memory_items" in cur.all_sql()
    assert "'pending'" in cur.all_sql()


def test_index_rejects_bad_item_type(monkeypatch):
    _patch_cursor(monkeypatch)
    out = svc.index_item(item_type="bogus", source_id="x", title="T", content_text="b",
                         business_id=BIZ, env_id=ENV_A)
    assert out["null_reason"] == "invalid_item_type"


# ── provider fail-closed (the landmine: never a zero-vector) ───────────────────
def test_embed_no_provider_marks_no_provider_and_never_calls_embed(monkeypatch):
    _set_key(monkeypatch, "")  # no provider
    cur = _patch_cursor(monkeypatch)
    called = []
    monkeypatch.setattr("app.services.rag_indexer._embed_texts", lambda t: called.append(t) or [[0.0] * 1536])
    out = svc.embed_pending_item("item-1")
    assert out["embedding_status"] == "no_provider"
    assert called == []                       # _embed_texts NEVER called without a key
    # the UPDATE set status no_provider — and NO vector was written
    sql = cur.all_sql()
    assert "no_provider" in sql or "embedding_status = %s" in sql
    assert "::vector" not in sql              # no embedding write at all


def test_embed_with_provider_indexes_real_vector(monkeypatch):
    _set_key(monkeypatch, "sk-test")
    cur = _patch_cursor(monkeypatch, rows_queue=[[{"env_id": ENV_A, "content_text": "body"}]])
    monkeypatch.setattr("app.services.rag_indexer._embed_texts", lambda t: [[0.2] * 1536])
    out = svc.embed_pending_item("item-1")
    assert out["embedding_status"] == "indexed"
    assert "::vector" in cur.all_sql()        # a real vector was written
    assert "'indexed'" in cur.all_sql()


def test_embed_wrong_dim_fails_closed(monkeypatch):
    _set_key(monkeypatch, "sk-test")
    cur = _patch_cursor(monkeypatch, rows_queue=[[{"env_id": ENV_A, "content_text": "body"}]])
    monkeypatch.setattr("app.services.rag_indexer._embed_texts", lambda t: [[0.2] * 10])  # wrong dim
    out = svc.embed_pending_item("item-1")
    assert out["embedding_status"] == "error"
    assert "::vector" not in cur.all_sql()    # no fake/short vector stored


# ── env boundary: global ∪ env, cross-env excluded (SQL contract) ─────────────
def test_search_query_scopes_to_env_and_global_only(monkeypatch):
    _set_key(monkeypatch, "sk-test")
    cur = _patch_cursor(monkeypatch, rows_queue=[[
        {"item_type": "card", "source_id": "c1", "title": "Env A card", "summary": None,
         "env_id": ENV_A, "indexed_at": _Now(), "score": 0.9},
        {"item_type": "adr", "source_id": "adr-1", "title": "Global ADR", "summary": None,
         "env_id": None, "indexed_at": _Now(), "score": 0.8},
    ]])
    monkeypatch.setattr("app.services.rag_indexer._embed_texts", lambda t: [[0.2] * 1536])
    out = svc.search(ENV_A, BIZ, "anything")
    sql = cur.all_sql()
    # The boundary contract is visible in the query (defense-in-depth beside RLS):
    assert "env_id is null or env_id = %s" in sql
    # set_config scopes the connection to env-A (RLS layer):
    assert any("set_config" in s.lower() and (p == (ENV_A,) if p else False)
               for s, p in cur.executed)
    # results carry scope labels + citations
    scopes = {i["scope"] for i in out["items"]}
    assert scopes == {"env", "global"}
    for i in out["items"]:
        assert i["item_type"] and i["source_id"] and i["title"] and i["indexed_at"]


def test_search_empty_is_honest(monkeypatch):
    _set_key(monkeypatch, "sk-test")
    _patch_cursor(monkeypatch, rows_queue=[[]])
    monkeypatch.setattr("app.services.rag_indexer._embed_texts", lambda t: [[0.2] * 1536])
    out = svc.search(ENV_A, BIZ, "nothing matches")
    assert out["items"] == []
    assert out["null_reason"] == "no_matching_records"


def test_search_no_provider_fails_closed(monkeypatch):
    _set_key(monkeypatch, "")  # no provider -> cannot embed the query
    _patch_cursor(monkeypatch)
    out = svc.search(ENV_A, BIZ, "query")
    assert out["items"] == []
    assert out["null_reason"] == "embedding_provider_unavailable"


def test_search_empty_query_is_honest(monkeypatch):
    _patch_cursor(monkeypatch)
    assert svc.search(ENV_A, BIZ, "   ")["null_reason"] == "empty_query"


# ── similar: no re-embed; seed-not-indexed fails closed ───────────────────────
def test_similar_seed_not_indexed_fails_closed(monkeypatch):
    cur = _patch_cursor(monkeypatch, rows_queue=[[{"id": "seed-1", "has_emb": False}]])
    out = svc.similar_items("card", "c1", ENV_A, BIZ)
    assert out["null_reason"] == "seed_not_indexed"
    # we never embedded anything on read
    assert "set_config" in cur.all_sql()


def test_similar_seed_missing_fails_closed(monkeypatch):
    _patch_cursor(monkeypatch, rows_queue=[[]])
    out = svc.similar_items("card", "nope", ENV_A, BIZ)
    assert out["null_reason"] == "seed_not_found"


# ── NO LLM path (load-bearing invariant) ──────────────────────────────────────
def test_module_imports_no_llm():
    import ast
    import inspect
    banned = ("ai_gateway", "ai_conversations", "openai", "anthropic", "chat")
    tree = ast.parse(inspect.getsource(svc))
    imported = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            imported += [a.name for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            imported.append(n.module or "")
    # rag_indexer is allowed (embeddings only) and is imported lazily inside functions; the
    # top-level imports must contain no LLM/chat/gateway module.
    for name in imported:
        assert not any(b in name for b in banned), f"unexpected import {name!r}"


def test_results_carry_citations_not_answers(monkeypatch):
    _set_key(monkeypatch, "sk-test")
    _patch_cursor(monkeypatch, rows_queue=[[
        {"item_type": "investigation", "source_id": "s1", "title": "X", "summary": "sum",
         "env_id": ENV_A, "indexed_at": _Now(), "score": 0.7},
    ]])
    monkeypatch.setattr("app.services.rag_indexer._embed_texts", lambda t: [[0.2] * 1536])
    out = svc.search(ENV_A, BIZ, "q")
    item = out["items"][0]
    assert set(item.keys()) == {"item_type", "source_id", "title", "summary", "indexed_at", "env_id", "scope", "score"}
    assert "answer" not in item and "response" not in item and "completion" not in item


# ── routes ────────────────────────────────────────────────────────────────────
def test_route_search_fails_closed(client, monkeypatch):
    from app.routes import enterprise_memory as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "search", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    resp = client.get("/api/ade/memory/search", params={"env_id": ENV_A, "business_id": BIZ, "q": "hi"})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "search_unavailable"


def test_route_index_schedules_embedding(client, monkeypatch):
    from app.routes import enterprise_memory as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    monkeypatch.setattr(svc, "index_item",
                        lambda **kw: {"item_id": "i1", "embedding_status": "pending", "null_reason": None})
    embedded = []
    monkeypatch.setattr(svc, "embed_pending_item", lambda iid: embedded.append(iid))
    resp = client.post("/api/ade/memory/index", json={
        "item_type": "card", "source_id": "c1", "title": "T", "content_text": "b",
        "business_id": BIZ, "env_id": ENV_A})
    assert resp.status_code == 200
    assert resp.json()["embedding_status"] == "pending"
    assert embedded == ["i1"]                 # background embedding scheduled + ran (TestClient runs bg tasks)


def test_route_global_write_requires_admin(client, monkeypatch):
    from app.routes import enterprise_memory as route

    class _NonAdmin:
        app_role = "viewer"
    monkeypatch.setattr(route, "require_authenticated_request", lambda req: _NonAdmin())
    resp = client.post("/api/ade/memory/index", json={
        "item_type": "adr", "source_id": "adr-1", "title": "Global", "content_text": "b",
        "business_id": BIZ, "env_id": None})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "global_write_requires_admin"


class _Now:
    """Minimal stand-in for a timestamptz row value with .isoformat()."""
    def isoformat(self):
        return "2026-06-16T00:00:00+00:00"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-x", "-q"]))
