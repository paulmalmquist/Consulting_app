"""PR 8b — multi-set result memory tests.

Covers the failure class the single-slot result_memory (PR 8a) can't
serve:

    list assets → list funds → "for the funds, which are inactive"

plus the invariants: alias precedence, recency tie-break, TTL expiry,
the expired-specific-reference must-NOT-bind-to-wrong-set guard, scope
isolation, upsert supersedes (no duplicates), and the
"failed/tool turn does not erase result_sets" persistence contract.
"""
from __future__ import annotations

from app.assistant_runtime.result_sets import (
    build_result_set,
    make_result_set_id,
    prune_expired,
    resolve_result_set,
    result_memory_from_set,
    result_set_from_structured_outcome,
    upsert_result_set,
)


def _asset_set(turn: int = 1) -> dict:
    return build_result_set(
        entity_type="asset",
        label="assets without statuses",
        entity_names=["Tech Campus North", "Phoenix Gateway Medical Office"],
        entity_ids=["id-a1", "id-a2"],
        aliases=["ones without statuses", "the 4"],
        attributes_available=["property_type", "market"],
        created_turn_index=turn,
        environment_id="env-1",
        business_id="biz-1",
    ).to_dict()


def _fund_set(turn: int = 3) -> dict:
    return build_result_set(
        entity_type="fund",
        label="portfolio funds",
        entity_names=["IGF VII", "Meridian REF III"],
        entity_ids=["id-f1", "id-f2"],
        created_turn_index=turn,
        environment_id="env-1",
        business_id="biz-1",
    ).to_dict()


# ── id stability ───────────────────────────────────────────────────────


def test_result_set_id_is_stable_for_same_inputs() -> None:
    a = make_result_set_id(entity_type="asset", label="x y", scope_key="env-1")
    b = make_result_set_id(entity_type="asset", label="x y", scope_key="env-1")
    c = make_result_set_id(entity_type="fund", label="x y", scope_key="env-1")
    assert a == b
    assert a != c


# ── upsert: supersede, never duplicate, never clear ───────────────────


def test_upsert_supersedes_same_id_and_preserves_others() -> None:
    sets = upsert_result_set(None, build_result_set(
        entity_type="asset", label="assets without statuses",
        entity_names=["A"], created_turn_index=1,
        environment_id="env-1", business_id="biz-1"))
    sets = upsert_result_set(sets, build_result_set(
        entity_type="fund", label="portfolio funds",
        entity_names=["F"], created_turn_index=3,
        environment_id="env-1", business_id="biz-1"))
    assert len(sets) == 2
    # Re-emit the asset set (same id) with fresh rows — supersede, not dup.
    sets = upsert_result_set(sets, build_result_set(
        entity_type="asset", label="assets without statuses",
        entity_names=["A", "B"], created_turn_index=5,
        environment_id="env-1", business_id="biz-1"))
    assert len(sets) == 2
    asset = [s for s in sets if s["entity_type"] == "asset"][0]
    assert asset["entity_names"] == ["A", "B"]
    assert asset["created_turn_index"] == 5
    # The fund set is untouched.
    assert any(s["entity_type"] == "fund" for s in sets)


def test_upsert_evicts_oldest_beyond_capacity() -> None:
    sets: list = []
    for i in range(10):
        sets = upsert_result_set(sets, build_result_set(
            entity_type=f"type{i}", label=f"label {i}",
            entity_names=["X"], created_turn_index=i,
            environment_id="env-1", business_id="biz-1"))
    from app.assistant_runtime.result_sets import MAX_RESULT_SETS
    assert len(sets) == MAX_RESULT_SETS
    # Newest retained, oldest evicted.
    assert sets[-1]["created_turn_index"] == 9
    assert all(s["created_turn_index"] >= 10 - MAX_RESULT_SETS for s in sets)


# ── resolver precedence ────────────────────────────────────────────────


def test_cross_set_alias_resolves_correct_family() -> None:
    """The PR 8b headline case: asset set then fund set, then a
    fund-specific follow-up must hit the FUND set, not the most recent
    answer rule alone (here recent IS fund, but the alias is what makes
    it deterministic across orderings)."""
    sets = upsert_result_set(None, _asset_set(turn=1))
    sets = upsert_result_set(sets, _fund_set(turn=3))
    m = resolve_result_set(
        message="for the funds, which are inactive",
        result_sets=sets,
        current_turn_index=5,
        current_scope={"business_id": "biz-1", "environment_id": "env-1"},
    )
    assert m.matched is True
    assert m.match_reason == "alias"
    assert m.result_set["entity_type"] == "fund"


def test_alias_resolves_older_set_even_when_newer_exists() -> None:
    """Order-independence: fund set FIRST, asset set newer, an
    asset-specific alias still resolves the (older) asset set."""
    sets = upsert_result_set(None, _fund_set(turn=1))
    sets = upsert_result_set(sets, _asset_set(turn=3))
    # Now ask something that only the FUND set's aliases match.
    m = resolve_result_set(
        message="for the funds give me their names",
        result_sets=sets,
        current_turn_index=4,
        current_scope=None,
    )
    assert m.matched is True
    assert m.result_set["entity_type"] == "fund"


def test_generic_reference_uses_most_recent_live_set() -> None:
    sets = upsert_result_set(None, _asset_set(turn=1))
    sets = upsert_result_set(sets, _fund_set(turn=3))
    m = resolve_result_set(
        message="of those, what are their names",
        result_sets=sets,
        current_turn_index=4,
        current_scope=None,
    )
    assert m.matched is True
    assert m.match_reason == "generic_recent"
    assert m.result_set["entity_type"] == "fund"  # most recent


def test_expired_specific_reference_does_not_bind_to_wrong_set() -> None:
    """The load-bearing safety guard. asset set (turn 1, ttl 5) is
    expired at turn 8. 'of the ones without statuses' is a SPECIFIC
    (now-expired) reference — it must NOT silently rebind to the live
    fund set. No match → caller falls through to the LLM."""
    sets = upsert_result_set(None, _asset_set(turn=1))
    sets = upsert_result_set(sets, _fund_set(turn=3))
    m = resolve_result_set(
        message="of the ones without statuses, what sector are they in",
        result_sets=sets,
        current_turn_index=8,
        current_scope=None,
    )
    assert m.matched is False
    assert m.expired_candidates >= 1


def test_ttl_expiry_skips_old_set() -> None:
    sets = upsert_result_set(None, _asset_set(turn=1))
    # ttl default 5; turn 7 → distance 6 > 5 → expired.
    m = resolve_result_set(
        message="for the ones without statuses",
        result_sets=sets,
        current_turn_index=7,
        current_scope=None,
    )
    assert m.matched is False


def test_scope_isolation() -> None:
    sets = upsert_result_set(None, _asset_set(turn=1))
    m = resolve_result_set(
        message="of those",
        result_sets=sets,
        current_turn_index=2,
        current_scope={"business_id": "OTHER-BIZ"},
    )
    assert m.matched is False


# ── prune ──────────────────────────────────────────────────────────────


def test_prune_expired_drops_only_aged_sets() -> None:
    sets = upsert_result_set(None, _asset_set(turn=1))
    sets = upsert_result_set(sets, _fund_set(turn=6))
    pruned = prune_expired(sets, current_turn_index=8)
    # asset turn1 ttl5 → distance7 expired; fund turn6 → distance2 lives.
    assert len(pruned) == 1
    assert pruned[0]["entity_type"] == "fund"


# ── derivation from a structured outcome ──────────────────────────────


def test_result_set_from_outcome_projects_thread_subject_and_rows() -> None:
    thread_subject = {
        "entity_type": "asset",
        "entity_label_plural": "assets",
        "result_set_hint": "portfolio_assets",
        "supported_followups": ["missing_status", "noncanonical_status"],
        "source": "structured_executor",
        "confidence": 0.9,
    }
    result_memory = {
        "result_type": "bucketed_count",
        "bucket_members": {
            "other": [
                {"id": "x1", "name": "Tech Campus North"},
                {"id": "x2", "name": "Phoenix Gateway"},
            ],
            "active": [],
        },
    }
    rs = result_set_from_structured_outcome(
        thread_subject=thread_subject,
        result_memory=result_memory,
        source_query="how many assets dont have a status",
        source_turn_id="req-1",
        created_turn_index=2,
        environment_id="env-1",
        business_id="biz-1",
    )
    assert rs is not None
    assert rs.entity_type == "asset"
    assert rs.entity_names == ["Tech Campus North", "Phoenix Gateway"]
    assert rs.entity_ids == ["x1", "x2"]
    assert "ones without statuses" in rs.aliases
    assert rs.created_turn_index == 2


def test_result_set_from_outcome_returns_none_without_entity_or_rows() -> None:
    assert result_set_from_structured_outcome(
        thread_subject=None, result_memory=None, source_query=None,
        source_turn_id=None, created_turn_index=1,
        environment_id=None, business_id=None,
    ) is None
    assert result_set_from_structured_outcome(
        thread_subject={"entity_type": "asset"},
        result_memory={"rows": []},
        source_query=None, source_turn_id=None, created_turn_index=1,
        environment_id=None, business_id=None,
    ) is None


# ── adapter back into the single-slot shape ───────────────────────────


def test_result_memory_from_set_round_trips_for_pr8a_machinery() -> None:
    s = _asset_set(turn=2)
    rm = result_memory_from_set(s)
    assert rm["result_type"] == "list"
    assert len(rm["rows"]) == 2
    assert rm["rows"][0]["name"] == "Tech Campus North"
    assert rm["rows"][0]["id"] == "id-a1"
    assert rm["rows"][0]["entity_type"] == "asset"
    assert rm["scope"]["business_id"] == "biz-1"


# ── persistence contract: failed/tool turn does NOT erase result_sets ─


def test_all_update_thread_helpers_preserve_result_sets(monkeypatch) -> None:
    """The core durability invariant. update_thread_entity_state,
    update_thread_result_memory, update_thread_structured_query_state
    each rebuild thread_entity_state from a fixed key set; all three (and
    the dedicated update_thread_result_sets) must carry result_sets
    forward. A simulated failed/tool turn calls update_thread_entity_state
    and the prior result_sets must survive."""
    from app.services import ai_conversations as svc

    store: dict[str, dict] = {
        "state": {
            "resolved_entities": [],
            "active_context": {},
            "result_memory": None,
            "structured_query_state": None,
            "result_sets": [_asset_set(turn=1)],
        }
    }

    monkeypatch.setattr(svc, "_ensure_thread_entity_state_column", lambda: None)
    monkeypatch.setattr(svc, "_conversation_table_columns", lambda: {"thread_entity_state"})
    monkeypatch.setattr(svc, "get_thread_entity_state", lambda cid: store["state"])

    class _Cur:
        def execute(self, _sql, params):
            import json
            store["state"] = json.loads(params[0])

        def fetchone(self):
            return None

    class _Ctx:
        def __enter__(self):
            return _Cur()

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(svc, "get_cursor", lambda: _Ctx())

    # Simulate a failed/tool turn that only writes entity state.
    svc.update_thread_entity_state(
        "conv-1", entity_type="asset", entity_id="zzz",
        name="Tech Campus North", source="resolved_scope",
    )
    assert store["state"]["result_sets"], (
        "result_sets erased by update_thread_entity_state — the "
        "failed/tool-turn preservation invariant is broken"
    )
    assert store["state"]["result_sets"][0]["entity_type"] == "asset"

    # And a structured_query_state-only update also preserves it.
    svc.update_thread_structured_query_state(
        "conv-1", structured_query_state={"last_contract": {"entity": "fund"}},
    )
    assert store["state"]["result_sets"], (
        "result_sets erased by update_thread_structured_query_state"
    )

    # And the single-slot result_memory update preserves it too.
    svc.update_thread_result_memory(
        "conv-1", result_memory={"result_type": "list", "scope": {}, "rows": []},
    )
    assert store["state"]["result_sets"], (
        "result_sets erased by update_thread_result_memory"
    )
