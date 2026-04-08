from __future__ import annotations

from contextlib import contextmanager
import json
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


class RecordingCursor(FakeCursor):
    def __init__(self):
        super().__init__()
        self.executions: list[tuple[str, tuple | None]] = []

    def execute(self, sql: str, params=None):
        self.executions.append((sql.strip(), params))
        super().execute(sql, params)


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


def test_update_thread_result_memory_preserves_existing_thread_state(monkeypatch):
    from app.services import ai_conversations as convo_svc

    fake = RecordingCursor()

    monkeypatch.setattr(convo_svc, "get_cursor", lambda: cursor_ctx(fake))
    monkeypatch.setattr(convo_svc, "_ensure_thread_entity_state_column", lambda: None)
    monkeypatch.setattr(convo_svc, "_conversation_table_columns", lambda: ("thread_entity_state",))
    monkeypatch.setattr(
        convo_svc,
        "get_thread_entity_state",
        lambda _conversation_id: {
            "resolved_entities": [{"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One"}],
            "active_context": {"entity": {"type": "fund", "id": "fund_1", "name": "Fund One"}},
        },
    )

    convo_svc.update_thread_result_memory(
        "conv_123",
        result_memory={
            "result_type": "bucketed_count",
            "scope": {
                "business_id": "biz_123",
                "environment_id": "env_123",
                "entity_type": "fund",
                "entity_id": "fund_1",
                "entity_name": "Fund One",
            },
            "query_signature": "bucketed_count:asset_count:biz_123:env_123:fund:fund_1",
            "summary": {"total": 4},
            "rows": [{"id": "asset_1", "name": "Alpha"}],
            "bucket_members": {"other": [{"id": "asset_1", "name": "Alpha"}]},
        },
    )

    update_sql, update_params = fake.executions[-1]
    saved_state = json.loads(update_params[0])

    assert "UPDATE ai_conversations" in update_sql
    assert saved_state["resolved_entities"][0]["entity_id"] == "fund_1"
    assert saved_state["active_context"]["entity"]["id"] == "fund_1"
    assert saved_state["result_memory"]["scope"]["entity_id"] == "fund_1"
    assert saved_state["result_memory"]["stored_at"]


def test_update_thread_structured_query_state_preserves_result_memory(monkeypatch):
    from app.services import ai_conversations as convo_svc

    fake = RecordingCursor()

    monkeypatch.setattr(convo_svc, "get_cursor", lambda: cursor_ctx(fake))
    monkeypatch.setattr(convo_svc, "_ensure_thread_entity_state_column", lambda: None)
    monkeypatch.setattr(convo_svc, "_conversation_table_columns", lambda: ("thread_entity_state",))
    monkeypatch.setattr(
        convo_svc,
        "get_thread_entity_state",
        lambda _conversation_id: {
            "resolved_entities": [{"entity_type": "fund", "entity_id": "fund_1", "name": "Fund One"}],
            "active_context": {"entity": {"type": "fund", "id": "fund_1", "name": "Fund One"}},
            "result_memory": {
                "result_type": "list",
                "scope": {"business_id": "biz_123", "environment_id": "env_123"},
                "rows": [{"id": "fund_1", "name": "Fund One"}],
            },
        },
    )

    convo_svc.update_thread_structured_query_state(
        "conv_123",
        structured_query_state={
            "last_contract": {"entity": "portfolio", "metric": "commitments", "transformation": "summary"},
            "last_execution": {"execution_path": "service", "degraded": False},
            "last_partition": {"primary_bucket": "active", "remainder_count": 4},
        },
    )

    update_sql, update_params = fake.executions[-1]
    saved_state = json.loads(update_params[0])

    assert "UPDATE ai_conversations" in update_sql
    assert saved_state["result_memory"]["rows"][0]["name"] == "Fund One"
    assert saved_state["structured_query_state"]["last_contract"]["metric"] == "commitments"
    assert saved_state["structured_query_state"]["stored_at"]
