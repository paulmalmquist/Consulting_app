"""Tests for P2.7 — internal accountability layer."""

from __future__ import annotations

from uuid import uuid4

from app.services.operator import _load_fixture, list_accountability


def _reset():
    _load_fixture.cache_clear()


def test_fixture_has_ownership_items():
    _reset()
    assert len(_load_fixture().get("ownership_items", [])) >= 5


def test_unassigned_items_surface_first():
    _reset()
    board = list_accountability(env_id=uuid4(), business_id=None)
    if board["items"] and board["items"][0]["stalled_no_owner"]:
        # Any unassigned items should come first
        for i, item in enumerate(board["items"]):
            if item["stalled_no_owner"]:
                continue
            # Once we hit an owned item, nothing after it should be unassigned
            for later in board["items"][i:]:
                assert not later["stalled_no_owner"]
            break


def test_overdue_apex_grounding_is_unassigned():
    _reset()
    board = list_accountability(env_id=uuid4(), business_id=None)
    apex = next((i for i in board["items"] if i["id"] == "own-003"), None)
    assert apex is not None
    assert apex["stalled_no_owner"] is True
    assert apex["escalation_level"] == 3


def test_stale_items_flagged_when_no_update_in_5_days():
    _reset()
    board = list_accountability(env_id=uuid4(), business_id=None)
    for item in board["items"]:
        if item["last_update_days"] >= 5:
            assert item["stale_update"] is True
        else:
            assert item["stale_update"] is False


def test_totals_match_item_list():
    _reset()
    board = list_accountability(env_id=uuid4(), business_id=None)
    totals = board["totals"]
    assert totals["total_items"] == len(board["items"])
    assert totals["unassigned_count"] == sum(1 for i in board["items"] if i["stalled_no_owner"])
    assert totals["overdue_count"] == sum(1 for i in board["items"] if i["status"] == "overdue")


def test_by_owner_rollup_sorted_by_overdue_desc():
    _reset()
    board = list_accountability(env_id=uuid4(), business_id=None)
    keys = [(r["overdue_count"], r["max_escalation_level"], r["open_count"]) for r in board["by_owner"]]
    assert keys == sorted(keys, reverse=True)


def test_hrefs_include_env_id():
    _reset()
    env_id = uuid4()
    board = list_accountability(env_id=env_id, business_id=None)
    for item in board["items"]:
        assert str(env_id) in (item.get("href") or "")


def test_every_item_references_real_project():
    _reset()
    project_ids = {p["id"] for p in _load_fixture()["projects"]}
    board = list_accountability(env_id=uuid4(), business_id=None)
    for item in board["items"]:
        assert item["project_id"] in project_ids
