"""Tests for Analytics Reels (plan PR 12) — deterministic story cards from findings.

Run: cd backend && python -m pytest tests/test_analytics_reels.py -x -q

Proves: reels roll up real finding/alert cards (monkeypatched) into story cards; the
composition is deterministic with sorted member ids (idempotent); no findings -> zero
reels + a recorded reason (never a fabricated story); grouping is by analyzer type with a
stable MAX cap; and the route is env-scoped + fails closed.
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

from app.services import analytics_reels as svc  # noqa: E402

ENV = "test-env"
BIZ = "00000000-0000-0000-0000-000000000001"


def _card(cid, analyzer="telemetry", anomaly=False, priority=0.6, title="A signal", ctype="finding"):
    return {"id": cid, "card_type": ctype, "title": title, "summary": title,
            "source_ref": {"type": "analyzer_finding", "analyzer_type": analyzer},
            "priority_score": priority, "anomaly_flag": anomaly}


def _patch_cards(monkeypatch, by_type):
    """by_type: {'finding': [...], 'alert': [...]}. Captures upsert calls."""
    from app.services import intelligence_cards
    monkeypatch.setattr(intelligence_cards, "list_cards",
                        lambda env, biz, *, card_type=None, **kw: list(by_type.get(card_type, [])))
    calls = []
    monkeypatch.setattr(intelligence_cards, "upsert_card",
                        lambda env, biz, **kw: calls.append(kw) or {"id": f"reel-{len(calls)}"})
    return calls


# ── pure composition ──────────────────────────────────────────────────────────
def test_compose_is_deterministic_and_sorts_member_ids():
    members = [_card("c2", anomaly=True, priority=0.9, title="PSI drift"),
               _card("c1", anomaly=False, priority=0.6, title="Anomaly rate")]
    reel = svc._compose_reel("telemetry", members)
    assert reel["card_type"] == "story"
    assert reel["anomaly_flag"] is True
    assert reel["priority_score"] == 0.9                       # strongest member
    assert reel["source_ref"]["type"] == "reel"
    assert reel["source_ref"]["member_card_ids"] == ["c1", "c2"]  # sorted -> idempotent
    assert reel["source_ref"]["analyzer_type"] == "telemetry"
    assert reel["created_by"] == "system:reels"
    # title/summary grounded in the members, no fabricated numbers
    assert "2 finding" in reel["title"] and "1 critical" in reel["title"]
    assert "PSI drift" in reel["summary"]


def test_no_anomaly_group_is_not_flagged():
    reel = svc._compose_reel("business", [_card("b1", analyzer="business", priority=0.3)])
    assert reel["anomaly_flag"] is False
    assert "open finding" in reel["title"]


# ── service: grouping + idempotency carrier ───────────────────────────────────
def test_one_reel_per_analyzer_group(monkeypatch):
    calls = _patch_cards(monkeypatch, {
        "finding": [_card("t1", "telemetry"), _card("b1", "business")],
        "alert": [_card("t2", "telemetry", anomaly=True, priority=1.0, ctype="alert")],
    })
    out = svc.generate_reels(ENV, BIZ)
    assert out["reels_upserted"] == 2          # telemetry + business
    assert out["groups"] == 2
    by_type = {c["source_ref"]["analyzer_type"] for c in calls}
    assert by_type == {"telemetry", "business"}
    tel = next(c for c in calls if c["source_ref"]["analyzer_type"] == "telemetry")
    assert tel["source_ref"]["member_card_ids"] == ["t1", "t2"]  # both telemetry cards, sorted
    assert tel["anomaly_flag"] is True


def test_rerun_uses_stable_source_ref(monkeypatch):
    cards = {"finding": [_card("t1", "telemetry"), _card("t0", "telemetry")], "alert": []}
    calls = _patch_cards(monkeypatch, cards)
    svc.generate_reels(ENV, BIZ)
    svc.generate_reels(ENV, BIZ)
    # both runs produce identical member id lists -> upsert idempotency key is stable
    assert calls[0]["source_ref"]["member_card_ids"] == calls[1]["source_ref"]["member_card_ids"] == ["t0", "t1"]


# ── fail closed ───────────────────────────────────────────────────────────────
def test_no_findings_yields_zero_reels_with_reason(monkeypatch):
    _patch_cards(monkeypatch, {"finding": [], "alert": []})
    out = svc.generate_reels(ENV, BIZ)
    assert out["reels_upserted"] == 0
    assert any(r["reason"] == "no_finding_cards_to_roll_up" for r in out["null_reasons"])


def test_list_cards_failure_is_recorded_not_raised(monkeypatch):
    from app.services import intelligence_cards
    def boom(env, biz, *, card_type=None, **kw):
        raise RuntimeError("db")
    monkeypatch.setattr(intelligence_cards, "list_cards", boom)
    out = svc.generate_reels(ENV, BIZ)
    assert out["reels_upserted"] == 0
    assert any("unavailable" in r["reason"] for r in out["null_reasons"])


def test_reel_upsert_failure_skips_not_raises(monkeypatch):
    from app.services import intelligence_cards
    monkeypatch.setattr(intelligence_cards, "list_cards",
                        lambda env, biz, *, card_type=None, **kw: [_card("t1", "telemetry")] if card_type == "finding" else [])
    def boom(env, biz, **kw):
        raise RuntimeError("write")
    monkeypatch.setattr(intelligence_cards, "upsert_card", boom)
    out = svc.generate_reels(ENV, BIZ)
    assert out["reels_upserted"] == 0
    assert any(r["reason"] == "reel_upsert_failed" for r in out["null_reasons"])


def test_max_reels_per_run_caps_groups(monkeypatch):
    # 10 analyzer types -> only MAX_REELS_PER_RUN reels written
    findings = [_card(f"c{i}", analyzer=f"type{i}") for i in range(10)]
    calls = _patch_cards(monkeypatch, {"finding": findings, "alert": []})
    out = svc.generate_reels(ENV, BIZ)
    assert out["reels_upserted"] == svc.MAX_REELS_PER_RUN
    assert len(calls) == svc.MAX_REELS_PER_RUN


# ── route ─────────────────────────────────────────────────────────────────────
def test_route_generate_fails_closed(client, monkeypatch):
    from app.routes import intelligence_cards as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    import app.services.analytics_reels as reels_svc
    monkeypatch.setattr(reels_svc, "generate_reels",
                        lambda env, biz: (_ for _ in ()).throw(RuntimeError("x")))
    resp = client.post("/api/ade/intel/reels/generate", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    assert resp.json()["null_reason"] == "reels_generate_unavailable"


def test_route_generate_success(client, monkeypatch):
    from app.routes import intelligence_cards as route
    monkeypatch.setattr(route, "require_environment_access", lambda req, **kw: None)
    import app.services.analytics_reels as reels_svc
    monkeypatch.setattr(reels_svc, "generate_reels",
                        lambda env, biz: {"env_id": env, "reels_upserted": 3, "groups": 3,
                                          "null_reasons": [], "latency_ms": 5})
    resp = client.post("/api/ade/intel/reels/generate", json={"env_id": ENV, "business_id": BIZ})
    assert resp.status_code == 200
    body = resp.json()
    assert body["reels_upserted"] == 3
    assert body["null_reason"] is None
