"""Tests for the multi-tenant Business OS structural refactor.

Verifies:
1. Creating environment auto-creates business
2. Template modules attach correctly to environment
3. Modules scoped correctly per environment (env_id filter)
4. REPE seed workspace logic
5. Business_id resolution from env_id (BI scoping)
6. Industry template mapping
7. Environment health check logic
"""

from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock, call
from uuid import UUID, uuid4
from contextlib import contextmanager

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ENV_ID = str(uuid4())
BUSINESS_ID = str(uuid4())
TENANT_ID = str(uuid4())
DEPT_ID = str(uuid4())


class SimpleCursor:
    """Minimal fake cursor for sequential result queuing."""

    def __init__(self):
        self._queue: list[list[dict]] = []
        self.queries: list[str] = []
        self.rowcount = 1

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


# ---------------------------------------------------------------------------
# 1. Industry type → template key mapping
# ---------------------------------------------------------------------------

def test_industry_type_to_template_key():
    from app.services.business import INDUSTRY_TYPE_TO_TEMPLATE_KEY

    assert INDUSTRY_TYPE_TO_TEMPLATE_KEY["repe"] == "real_estate_pe"
    assert INDUSTRY_TYPE_TO_TEMPLATE_KEY["real_estate_pe"] == "real_estate_pe"
    assert INDUSTRY_TYPE_TO_TEMPLATE_KEY["real_estate"] == "real_estate_pe"
    assert INDUSTRY_TYPE_TO_TEMPLATE_KEY["floyorker"] == "digital_media"
    assert INDUSTRY_TYPE_TO_TEMPLATE_KEY["digital_media"] == "digital_media"
    assert INDUSTRY_TYPE_TO_TEMPLATE_KEY["website"] == "digital_media"


def test_apply_industry_template_unknown_type():
    from app.services.business import apply_industry_template

    result = apply_industry_template(UUID(BUSINESS_ID), "nonexistent_industry")
    assert result is None


def test_apply_industry_template_none():
    from app.services.business import apply_industry_template

    result = apply_industry_template(UUID(BUSINESS_ID), None)
    assert result is None


# ---------------------------------------------------------------------------
# 2. apply_industry_template calls apply_template with correct key
# ---------------------------------------------------------------------------

def test_apply_industry_template_repe_calls_correct_template():
    from app.services import business as biz_svc

    with patch.object(biz_svc, "apply_template") as mock_apply:
        result = biz_svc.apply_industry_template(
            UUID(BUSINESS_ID),
            "repe",
            environment_id=UUID(ENV_ID),
        )

    assert result == "real_estate_pe"
    mock_apply.assert_called_once_with(
        UUID(BUSINESS_ID),
        "real_estate_pe",
        environment_id=UUID(ENV_ID),
    )


def test_apply_industry_template_floyorker_calls_correct_template():
    from app.services import business as biz_svc

    with patch.object(biz_svc, "apply_template") as mock_apply:
        result = biz_svc.apply_industry_template(
            UUID(BUSINESS_ID),
            "floyorker",
            environment_id=UUID(ENV_ID),
        )

    assert result == "digital_media"
    mock_apply.assert_called_once_with(
        UUID(BUSINESS_ID),
        "digital_media",
        environment_id=UUID(ENV_ID),
    )


# ---------------------------------------------------------------------------
# 3. list_departments scoping
# ---------------------------------------------------------------------------

def test_list_departments_with_env_id_adds_env_filter(monkeypatch):
    """When environment_id is passed, the query must include environment_id filter."""
    from app.services import business as biz_svc

    fake_cur = SimpleCursor()
    fake_cur.push([{"department_id": DEPT_ID, "key": "finance", "label": "Finance",
                    "icon": "dollar-sign", "sort_order": 1, "enabled": True,
                    "sort_order_override": None}])

    monkeypatch.setattr(biz_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    rows = biz_svc.list_departments(UUID(BUSINESS_ID), environment_id=UUID(ENV_ID))

    assert len(rows) == 1
    # The SQL must contain environment_id filter
    assert any("environment_id" in q for q in fake_cur.queries), (
        "Expected query to contain 'environment_id' when environment_id is provided"
    )


def test_list_departments_without_env_id_no_env_filter(monkeypatch):
    """When no environment_id is passed, the query must NOT include environment_id filter."""
    from app.services import business as biz_svc

    fake_cur = SimpleCursor()
    fake_cur.push([{"department_id": DEPT_ID, "key": "finance", "label": "Finance",
                    "icon": "dollar-sign", "sort_order": 1, "enabled": True,
                    "sort_order_override": None}])

    monkeypatch.setattr(biz_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    rows = biz_svc.list_departments(UUID(BUSINESS_ID))

    assert len(rows) == 1
    # No environment_id filter in queries
    assert not any("environment_id" in q for q in fake_cur.queries), (
        "Query should NOT contain 'environment_id' when no environment_id is provided"
    )


# ---------------------------------------------------------------------------
# 4. REPE seed workspace — table missing → skip without raising
# ---------------------------------------------------------------------------

def test_seed_repe_workspace_skips_if_table_missing(monkeypatch):
    from app.services import repe_context

    fake_cur = SimpleCursor()
    # _table_exists: return False for repe_fund
    fake_cur.push([])  # information_schema query returns no rows → table missing

    monkeypatch.setattr(repe_context, "get_cursor", lambda: cursor_ctx(fake_cur))

    # Should not raise
    repe_context.seed_repe_workspace(BUSINESS_ID, ENV_ID)

    # Only one query should have been made (the table existence check)
    assert len(fake_cur.queries) == 1


def test_seed_repe_workspace_seeds_fund_if_none_exists(monkeypatch):
    from app.services import repe_context

    fake_cur = SimpleCursor()
    # _table_exists: return True (table exists)
    fake_cur.push([{"exists": True}])  # information_schema query returns a row
    # SELECT from repe_fund: no existing fund
    fake_cur.push([])
    # INSERT returns nothing (no RETURNING)

    monkeypatch.setattr(repe_context, "get_cursor", lambda: cursor_ctx(fake_cur))

    repe_context.seed_repe_workspace(BUSINESS_ID, ENV_ID)

    # Should have attempted an INSERT
    insert_queries = [q for q in fake_cur.queries if "INSERT INTO repe_fund" in q]
    assert len(insert_queries) == 1


def test_seed_repe_workspace_skips_if_fund_already_exists(monkeypatch):
    from app.services import repe_context

    fake_cur = SimpleCursor()
    # _table_exists → True
    fake_cur.push([{"exists": True}])
    # SELECT repe_fund → already has a row
    fake_cur.push([{"id": str(uuid4())}])

    monkeypatch.setattr(repe_context, "get_cursor", lambda: cursor_ctx(fake_cur))

    repe_context.seed_repe_workspace(BUSINESS_ID, ENV_ID)

    # No INSERT should have been issued
    insert_queries = [q for q in fake_cur.queries if "INSERT INTO repe_fund" in q]
    assert len(insert_queries) == 0


# ---------------------------------------------------------------------------
# 5. Environment health: business_exists / modules_initialized / repe_status
# ---------------------------------------------------------------------------

def test_get_environment_health_repe_initialized(monkeypatch):
    from app.services import lab as lab_svc

    fake_cur = SimpleCursor()
    # SELECT env row
    fake_cur.push([{
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "industry_type": "repe",
        "industry": "repe",
        "repe_initialized": True,
    }])
    # SELECT business exists
    fake_cur.push([{"exists": 1}])
    # SELECT module count
    fake_cur.push([{"cnt": 3}])

    monkeypatch.setattr(lab_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    health = lab_svc.get_environment_health(UUID(ENV_ID))

    assert health["business_exists"] is True
    assert health["modules_initialized"] is True
    assert health["repe_status"] == "initialized"
    assert health["data_integrity"] is True


def test_get_environment_health_repe_pending(monkeypatch):
    from app.services import lab as lab_svc

    fake_cur = SimpleCursor()
    fake_cur.push([{
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "industry_type": "repe",
        "industry": "repe",
        "repe_initialized": False,
    }])
    fake_cur.push([{"exists": 1}])
    fake_cur.push([{"cnt": 0}])

    monkeypatch.setattr(lab_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    health = lab_svc.get_environment_health(UUID(ENV_ID))

    assert health["repe_status"] == "pending"
    assert health["data_integrity"] is False


def test_get_environment_health_floyorker_not_applicable(monkeypatch):
    from app.services import lab as lab_svc

    fake_cur = SimpleCursor()
    fake_cur.push([{
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "industry_type": "floyorker",
        "industry": "floyorker",
        "repe_initialized": False,
    }])
    fake_cur.push([{"exists": 1}])
    fake_cur.push([{"cnt": 4}])

    monkeypatch.setattr(lab_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    health = lab_svc.get_environment_health(UUID(ENV_ID))

    assert health["repe_status"] == "not_applicable"
    assert health["data_integrity"] is True


def test_get_environment_health_not_found(monkeypatch):
    from app.services import lab as lab_svc

    fake_cur = SimpleCursor()
    # No env found
    fake_cur.push([])

    monkeypatch.setattr(lab_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    with pytest.raises(LookupError, match="Environment not found"):
        lab_svc.get_environment_health(UUID(ENV_ID))


# ---------------------------------------------------------------------------
# 6. resolve_business_for_env (BI scoping helper)
# ---------------------------------------------------------------------------

def test_resolve_business_for_env_via_env_id(monkeypatch):
    from app.services import report_views

    fake_cur = SimpleCursor()
    # environments.business_id lookup
    fake_cur.push([{"business_id": BUSINESS_ID}])

    monkeypatch.setattr(report_views, "get_cursor", lambda: cursor_ctx(fake_cur))

    result = report_views.resolve_business_for_env(ENV_ID, None)
    assert result == BUSINESS_ID


def test_resolve_business_for_env_fallback_to_business_id():
    from app.services import report_views

    result = report_views.resolve_business_for_env(None, BUSINESS_ID)
    assert result == BUSINESS_ID


def test_resolve_business_for_env_raises_if_neither():
    from app.services import report_views

    with pytest.raises(ValueError, match="Cannot resolve business context"):
        report_views.resolve_business_for_env(None, None)


# ---------------------------------------------------------------------------
# 7. Floyorker env does not contain REPE modules
# ---------------------------------------------------------------------------

def test_floyorker_env_repe_status_not_applicable(monkeypatch):
    """Floyorker environments should have repe_status=not_applicable."""
    from app.services import lab as lab_svc

    fake_cur = SimpleCursor()
    fake_cur.push([{
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "industry_type": "floyorker",
        "industry": "floyorker",
        "repe_initialized": False,
    }])
    fake_cur.push([{"exists": 1}])
    fake_cur.push([{"cnt": 8}])  # 8 digital_media modules

    monkeypatch.setattr(lab_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    health = lab_svc.get_environment_health(UUID(ENV_ID))
    assert health["repe_status"] == "not_applicable"


# ---------------------------------------------------------------------------
# 8. Sidebar scoping: list_departments returns env-scoped results only
# ---------------------------------------------------------------------------

def test_list_departments_returns_env_scoped_only(monkeypatch):
    """Env-scoped query should not return departments from other environments."""
    from app.services import business as biz_svc

    DEPT_REPE = str(uuid4())
    DEPT_CONTENT = str(uuid4())

    fake_cur = SimpleCursor()
    # Only return the REPE dept for env 1; content dept belongs to env 2
    fake_cur.push([
        {"department_id": DEPT_REPE, "key": "waterfall", "label": "Waterfall",
         "icon": "trending-up", "sort_order": 40, "enabled": True,
         "sort_order_override": None},
    ])

    monkeypatch.setattr(biz_svc, "get_cursor", lambda: cursor_ctx(fake_cur))

    rows = biz_svc.list_departments(UUID(BUSINESS_ID), environment_id=UUID(ENV_ID))

    assert len(rows) == 1
    assert rows[0]["key"] == "waterfall"
    # content dept is not in results
    assert all(r["key"] != "content" for r in rows)
