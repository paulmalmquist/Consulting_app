"""Tests for the Intelligence Card System API and service (/api/ade/intel/*).

Run with: cd backend && python -m pytest tests/test_intelligence_cards.py -x -q

No DB required: route tests monkeypatch the service layer; service tests exercise the
pure helpers and validation. The migration is checked as text for the mandatory RLS /
tenant-policy / comment / business_id / card_type CHECK guardrails.
"""
import os
from pathlib import Path

import pytest

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import intelligence_cards as svc  # noqa: E402

BUSINESS_ID = "00000000-0000-0000-0000-000000000001"
ENV = "test-env"


def _card(**over):
    base = {
        "id": "c1", "card_type": "finding", "title": "Yield drop", "summary": "s",
        "source_ref": {"type": "metric", "id": "fpy"}, "priority_score": 0.5,
        "anomaly_flag": False, "created_by": "system", "is_dismissed": False,
        "last_updated_at": "2026-06-14T00:00:00+00:00", "created_at": "2026-06-14T00:00:00+00:00",
    }
    base.update(over)
    return base


# ── service-level: pure helpers & validation (no DB) ─────────────────────────

def test_source_ref_key_is_order_stable():
    assert svc._source_ref_key({"a": 1, "b": 2}) == svc._source_ref_key({"b": 2, "a": 1})
    assert svc._source_ref_key({"a": 1}) != svc._source_ref_key({"a": 2})
    assert svc._source_ref_key(None) == svc._source_ref_key({})


def test_upsert_rejects_bad_card_type():
    with pytest.raises(ValueError, match="Unknown card_type"):
        svc.upsert_card(ENV, BUSINESS_ID, card_type="banner", title="x")


def test_upsert_rejects_empty_title():
    with pytest.raises(ValueError, match="title is required"):
        svc.upsert_card(ENV, BUSINESS_ID, card_type="finding", title="  ")


def test_card_types_complete():
    assert svc.CARD_TYPES == {
        "dashboard", "report", "story", "investigation", "forecast", "finding", "alert"
    }


# ── route-level: monkeypatch the service so no DB is touched ──────────────────

def test_list_returns_cards(client, monkeypatch):
    monkeypatch.setattr(svc, "list_cards", lambda env, biz, **kw: [_card()])
    body = client.get(f"/api/ade/intel/cards?env_id={ENV}&business_id={BUSINESS_ID}").json()
    assert body["null_reason"] is None
    assert body["cards"][0]["card_type"] == "finding"


def test_list_passes_filters(client, monkeypatch):
    seen = {}
    def fake(env, biz, **kw):
        seen.update(kw)
        return []
    monkeypatch.setattr(svc, "list_cards", fake)
    client.get(f"/api/ade/intel/cards?env_id={ENV}&business_id={BUSINESS_ID}"
               f"&include_dismissed=true&card_type=alert&limit=10")
    assert seen.get("include_dismissed") is True
    assert seen.get("card_type") == "alert"
    assert seen.get("limit") == 10


def test_list_fails_closed(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("no db")
    monkeypatch.setattr(svc, "list_cards", boom)
    resp = client.get(f"/api/ade/intel/cards?env_id={ENV}&business_id={BUSINESS_ID}")
    assert resp.status_code == 200  # never 500
    body = resp.json()
    assert body["cards"] == []
    assert body["null_reason"] == "intel_cards_unavailable"


def test_upsert_creates(client, monkeypatch):
    monkeypatch.setattr(svc, "upsert_card", lambda env, biz, **kw: _card(card_type=kw["card_type"], title=kw["title"]))
    resp = client.post("/api/ade/intel/cards", json={
        "env_id": ENV, "business_id": BUSINESS_ID,
        "card_type": "alert", "title": "Feed stale",
    })
    assert resp.status_code == 200
    assert resp.json()["card_type"] == "alert"


def test_upsert_bad_type_is_400(client, monkeypatch):
    def bad(*a, **k):
        raise ValueError("Unknown card_type: x")
    monkeypatch.setattr(svc, "upsert_card", bad)
    resp = client.post("/api/ade/intel/cards", json={
        "env_id": ENV, "business_id": BUSINESS_ID, "card_type": "x", "title": "t",
    })
    assert resp.status_code == 400


def test_patch_dismiss(client, monkeypatch):
    monkeypatch.setattr(svc, "dismiss_card", lambda env, biz, cid: _card(is_dismissed=True))
    resp = client.patch("/api/ade/intel/cards/00000000-0000-0000-0000-0000000000ab",
                        json={"env_id": ENV, "business_id": BUSINESS_ID, "dismiss": True})
    assert resp.status_code == 200
    assert resp.json()["is_dismissed"] is True


def test_patch_bump_priority(client, monkeypatch):
    monkeypatch.setattr(svc, "bump_priority", lambda env, biz, cid, delta: _card(priority_score=0.9))
    resp = client.patch("/api/ade/intel/cards/00000000-0000-0000-0000-0000000000ab",
                        json={"env_id": ENV, "business_id": BUSINESS_ID, "priority_delta": 0.4})
    assert resp.status_code == 200
    assert resp.json()["priority_score"] == 0.9


def test_patch_requires_an_action(client):
    resp = client.patch("/api/ade/intel/cards/00000000-0000-0000-0000-0000000000ab",
                        json={"env_id": ENV, "business_id": BUSINESS_ID})
    assert resp.status_code == 400


def test_patch_unknown_card_404(client, monkeypatch):
    monkeypatch.setattr(svc, "dismiss_card", lambda env, biz, cid: None)
    resp = client.patch("/api/ade/intel/cards/00000000-0000-0000-0000-0000000000ff",
                        json={"env_id": ENV, "business_id": BUSINESS_ID, "dismiss": True})
    assert resp.status_code == 404


# ── migration guardrails ─────────────────────────────────────────────────────

def test_migration_has_required_guardrails():
    sql_path = (Path(__file__).resolve().parents[2]
                / "repo-b" / "db" / "schema" / "10019_intelligence_cards.sql")
    sql = sql_path.read_text(encoding="utf-8")
    assert "nv_intel_cards" in sql
    assert "env_id          text NOT NULL" in sql or "env_id text NOT NULL" in sql
    assert "business_id     uuid NOT NULL" in sql or "business_id uuid NOT NULL" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "current_setting('app.env_id', true)" in sql
    assert "COMMENT ON TABLE nv_intel_cards" in sql
    assert "UNIQUE (env_id, source_ref_key)" in sql
    # 7-type CHECK present
    for t in ("dashboard", "report", "story", "investigation", "forecast", "finding", "alert"):
        assert f"'{t}'" in sql
