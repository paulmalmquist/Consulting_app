from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4


class FakeCursor:
    def __init__(self):
        self.queries: list[str] = []
        self._fetchone_queue: list[dict | None] = []
        self._fetchall_queue: list[list[dict]] = []

    def push_fetchone(self, row: dict | None):
        self._fetchone_queue.append(row)
        return self

    def push_fetchall(self, rows: list[dict]):
        self._fetchall_queue.append(rows)
        return self

    def execute(self, sql: str, params=None):
        self.queries.append(sql.strip())

    def fetchone(self):
        if self._fetchone_queue:
            return self._fetchone_queue.pop(0)
        return None

    def fetchall(self):
        if self._fetchall_queue:
            return self._fetchall_queue.pop(0)
        return []


@contextmanager
def cursor_ctx(cursor: FakeCursor):
    yield cursor


def test_create_conversation_falls_back_when_metadata_columns_are_missing(monkeypatch):
    from app.services import ai_conversations as convo_svc

    fake = FakeCursor()
    fake.push_fetchall(
        [
            {"column_name": "conversation_id"},
            {"column_name": "business_id"},
            {"column_name": "env_id"},
            {"column_name": "title"},
            {"column_name": "created_at"},
            {"column_name": "updated_at"},
            {"column_name": "archived"},
            {"column_name": "actor"},
        ]
    )
    fake.push_fetchone(
        {
            "conversation_id": uuid4(),
            "business_id": uuid4(),
            "env_id": None,
            "title": None,
            "created_at": None,
            "updated_at": None,
            "archived": False,
            "actor": "user:test",
        }
    )

    monkeypatch.setattr(convo_svc, "get_cursor", lambda: cursor_ctx(fake))
    convo_svc._conversation_table_columns.cache_clear()

    row = convo_svc.create_conversation(
        business_id=uuid4(),
        env_id=None,
        thread_kind="contextual",
        scope_type="environment",
        scope_id="env_123",
        scope_label="Paul Malmquist",
        context_summary="Visual Resume",
        actor="user:test",
    )

    insert_sql = fake.queries[1]
    assert "thread_kind" not in insert_sql
    assert row["thread_kind"] == "general"
    assert row["scope_type"] is None
    assert row["context_summary"] is None


def test_list_conversations_normalizes_missing_metadata_columns(monkeypatch):
    from app.services import ai_conversations as convo_svc

    fake = FakeCursor()
    fake.push_fetchall(
        [
            {"column_name": "conversation_id"},
            {"column_name": "business_id"},
            {"column_name": "env_id"},
            {"column_name": "title"},
            {"column_name": "created_at"},
            {"column_name": "updated_at"},
            {"column_name": "archived"},
            {"column_name": "actor"},
        ]
    )
    fake.push_fetchall(
        [
            {
                "conversation_id": uuid4(),
                "business_id": uuid4(),
                "env_id": None,
                "title": "Legacy conversation",
                "created_at": None,
                "updated_at": None,
                "archived": False,
                "message_count": 1,
            }
        ]
    )

    monkeypatch.setattr(convo_svc, "get_cursor", lambda: cursor_ctx(fake))
    convo_svc._conversation_table_columns.cache_clear()

    rows = convo_svc.list_conversations(business_id=uuid4())

    select_sql = fake.queries[1]
    assert "thread_kind" not in select_sql
    assert rows[0]["thread_kind"] == "general"
    assert rows[0]["scope_label"] is None
