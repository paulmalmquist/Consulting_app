"""Website OS tests for website/floyorker modules and environment health."""

from __future__ import annotations

from contextlib import contextmanager
from uuid import UUID, uuid4

import pytest


ENV_ID = str(uuid4())
BUSINESS_ID = str(uuid4())
ITEM_ID = str(uuid4())
LIST_ID = str(uuid4())
ENTITY_ID = str(uuid4())


class SimpleCursor:
    """Minimal fake cursor with queued fetch results."""

    def __init__(self):
        self._queue: list[list[dict]] = []
        self.queries: list[str] = []

    def push(self, rows: list[dict]):
        self._queue.append(rows)
        return self

    def execute(self, sql: str, params=None):
        self.queries.append(sql.strip())

    def fetchone(self):
        if self._queue:
            rows = self._queue.pop(0)
            return rows[0] if rows else None
        return None

    def fetchall(self):
        if self._queue:
            return self._queue.pop(0)
        return []


@contextmanager
def cursor_ctx(fake_cur):
    yield fake_cur


def _env_row(industry_type: str, repe_initialized: bool = False) -> dict:
    return {
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "industry_type": industry_type,
        "industry": industry_type,
        "repe_initialized": repe_initialized,
    }


def test_website_industry_maps_to_digital_media_template():
    from app.services.business import INDUSTRY_TYPE_TO_TEMPLATE_KEY

    assert INDUSTRY_TYPE_TO_TEMPLATE_KEY["website"] == "digital_media"


def test_floyorker_health_repe_not_applicable(monkeypatch):
    from app.services import lab as lab_svc

    fake_cur = SimpleCursor()
    fake_cur.push([_env_row("floyorker")])  # environment
    fake_cur.push([{"exists": 1}])          # business exists
    fake_cur.push([{"cnt": 4}])             # modules initialized
    monkeypatch.setattr(lab_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    health = lab_svc.get_environment_health(UUID(ENV_ID))

    assert health["repe_status"] == "not_applicable"


def test_website_env_no_repe_modules(monkeypatch):
    from app.services import lab as lab_svc

    fake_cur = SimpleCursor()
    fake_cur.push([_env_row("website")])    # environment
    fake_cur.push([{"exists": 1}])          # business exists
    fake_cur.push([{"cnt": 2}])             # modules initialized
    monkeypatch.setattr(lab_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    health = lab_svc.get_environment_health(UUID(ENV_ID))

    assert health["repe_status"] == "not_applicable"


def test_content_state_transitions_valid(monkeypatch):
    from app.services import website_content as content_svc

    fake_cur = SimpleCursor()
    fake_cur.push([{"id": ITEM_ID, "environment_id": ENV_ID, "state": "draft"}])
    monkeypatch.setattr(content_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    row = content_svc.update_content_state(
        item_id=ITEM_ID,
        env_id=ENV_ID,
        new_state="draft",
    )

    assert row["state"] == "draft"


def test_content_state_invalid_raises():
    from app.services import website_content as content_svc

    with pytest.raises(ValueError, match="Invalid state"):
        content_svc.update_content_state(
            item_id=ITEM_ID,
            env_id=ENV_ID,
            new_state="invalid_state",
        )


def test_set_ranking_entry_logs_change(monkeypatch):
    from app.services import website_rankings as ranking_svc

    fake_cur = SimpleCursor()
    fake_cur.push([{"id": LIST_ID}])                    # list belongs to env
    fake_cur.push([{"rank": 2}])                        # existing rank for entity
    fake_cur.push([{"id": str(uuid4()), "rank": 1}])    # upsert return
    monkeypatch.setattr(ranking_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    row = ranking_svc.set_ranking_entry(
        ranking_list_id=LIST_ID,
        entity_id=ENTITY_ID,
        rank=1,
        score=9.5,
        notes="Updated rank",
        env_id=ENV_ID,
    )

    assert row["rank"] == 1
    assert any("INSERT INTO website_ranking_changes" in q for q in fake_cur.queries)


def test_analytics_summary_uses_env_filter(monkeypatch):
    from app.services import website_analytics as analytics_svc

    fake_cur = SimpleCursor()
    fake_cur.push([{"sessions_7d": 100}])
    fake_cur.push([{"sessions_30d": 500}])
    fake_cur.push([{"top_page": "/best-bagels"}])
    fake_cur.push([{"cnt": 2}])
    fake_cur.push([{"revenue_mtd": 1234.56}])
    fake_cur.push([{"conv_7d": 14}])
    fake_cur.push([{"cnt": 9}])
    monkeypatch.setattr(analytics_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    summary = analytics_svc.get_analytics_summary(ENV_ID)

    assert summary["sessions_7d"] == 100
    assert all("environment_id = %s::uuid" in q for q in fake_cur.queries)


def test_health_includes_content_count(monkeypatch):
    from app.services import lab as lab_svc

    fake_cur = SimpleCursor()
    fake_cur.push([_env_row("website")])    # environment
    fake_cur.push([{"exists": 1}])          # business exists
    fake_cur.push([{"cnt": 3}])             # modules initialized
    fake_cur.push([{"cnt": 5}])             # content_count
    fake_cur.push([{"cnt": 4}])             # ranking_count
    fake_cur.push([{"cnt": 2}])             # analytics_count
    fake_cur.push([{"cnt": 8}])             # crm_count
    monkeypatch.setattr(lab_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    health = lab_svc.get_environment_health(UUID(ENV_ID))

    assert "content_count" in health
    assert health["content_count"] == 5
    assert health["ranking_count"] == 4
    assert health["analytics_count"] == 2
    assert health["crm_count"] == 8


def test_floyorker_seeder_creates_ranking_lists(monkeypatch):
    from app.services import website_seeder as seeder

    fake_cur = SimpleCursor()
    fake_cur.push([{"exists": 1}])  # table exists
    fake_cur.push([])               # not already seeded
    for _ in range(6):
        fake_cur.push([{"id": str(uuid4())}])  # entity ids
    fake_cur.push([{"id": str(uuid4())}])      # bagel list id
    fake_cur.push([{"id": str(uuid4())}])      # pizza list id

    monkeypatch.setattr(seeder, "get_cursor", lambda: cursor_ctx(fake_cur))
    monkeypatch.setattr(seeder, "emit_log", lambda **kwargs: None)

    seeder.seed_website_workspace(BUSINESS_ID, ENV_ID, "Floyorker")

    ranking_list_inserts = [q for q in fake_cur.queries if "INSERT INTO website_ranking_lists" in q]
    assert len(ranking_list_inserts) >= 2


def test_no_repe_modules_in_website_env(monkeypatch):
    from app.services import business as biz_svc

    fake_cur = SimpleCursor()
    fake_cur.push(
        [
            {"department_id": str(uuid4()), "key": "content"},
            {"department_id": str(uuid4()), "key": "rankings"},
            {"department_id": str(uuid4()), "key": "analytics"},
        ]
    )
    monkeypatch.setattr(biz_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    rows = biz_svc.list_departments(UUID(BUSINESS_ID), environment_id=UUID(ENV_ID))
    keys = {row["key"] for row in rows}

    assert "content" in keys
    assert "waterfall" not in keys
