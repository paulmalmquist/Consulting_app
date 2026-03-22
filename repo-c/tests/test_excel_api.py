"""Tests for /v1/excel endpoints with mocked DB connections."""

from contextlib import contextmanager
from uuid import uuid4

from app import excel_api


class FakeResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class FakeCursor:
    def __init__(self, rows=None):
        self._rows = rows or []
        self.rowcount = len(self._rows)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, _query, _params=None):
        return self

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class FakeConn:
    def __init__(self, execute_rows=None, cursor_rows=None):
        self.execute_rows = execute_rows or []
        self.cursor_rows = cursor_rows or []

    def execute(self, _query, _params=None):
        return FakeResult(self.execute_rows)

    def cursor(self, row_factory=None):  # noqa: ARG002
        return FakeCursor(self.cursor_rows)

    def commit(self):
        return None


def _install_db_mocks(monkeypatch, fake_conn):
    @contextmanager
    def fake_get_conn():
        yield fake_conn

    monkeypatch.setattr(excel_api, "get_conn", fake_get_conn)
    monkeypatch.setattr(excel_api, "ensure_extensions", lambda _conn: None)
    monkeypatch.setattr(excel_api, "ensure_platform_tables", lambda _conn: None)


def test_excel_session_init(client):
    response = client.post("/v1/excel/session/init")
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "api_key"
    assert "requires_api_key" in payload


def test_excel_schema_lists_pipeline_items_alias(client, monkeypatch):
    fake_conn = FakeConn(execute_rows=[("platform", "pipeline_cards"), ("platform", "environments")])
    _install_db_mocks(monkeypatch, fake_conn)

    monkeypatch.setattr(
        excel_api,
        "_get_columns",
        lambda _conn, _schema, table: [
            {"name": "card_id" if table == "pipeline_cards" else "env_id", "data_type": "uuid", "is_nullable": False, "udt_name": "uuid", "column_default": None},
            {"name": "title" if table == "pipeline_cards" else "client_name", "data_type": "text", "is_nullable": False, "udt_name": "text", "column_default": None},
        ],
    )
    monkeypatch.setattr(
        excel_api,
        "_get_primary_keys",
        lambda _conn, _schema, table: ["card_id"] if table == "pipeline_cards" else ["env_id"],
    )

    response = client.get("/v1/excel/schema")
    assert response.status_code == 200
    entities = {item["entity"] for item in response.json()["entities"]}
    assert "pipeline_items" in entities
    assert "environments" in entities


def test_excel_query_returns_rows(client, monkeypatch):
    fake_conn = FakeConn(cursor_rows=[{"title": "Seed ticket"}])
    _install_db_mocks(monkeypatch, fake_conn)

    monkeypatch.setattr(
        excel_api,
        "_resolve_entity_ref",
        lambda _conn, entity, env_id: excel_api.EntityRef(  # noqa: ARG005
            entity=entity,
            schema_name="env_demo",
            table="tickets",
            scope="environment",
            env_uuid=uuid4(),
        ),
    )
    monkeypatch.setattr(
        excel_api,
        "_get_columns",
        lambda _conn, _schema, _table: [
            {"name": "title", "data_type": "text", "is_nullable": False, "udt_name": "text", "column_default": None},
            {"name": "env_id", "data_type": "uuid", "is_nullable": False, "udt_name": "uuid", "column_default": None},
        ],
    )

    response = client.post(
        "/v1/excel/query",
        json={
            "env_id": str(uuid4()),
            "entity": "tickets",
            "filters": {},
            "select": ["title"],
            "limit": 10,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["rows"][0]["title"] == "Seed ticket"


def test_excel_upsert_reports_row_errors(client, monkeypatch):
    fake_conn = FakeConn()
    _install_db_mocks(monkeypatch, fake_conn)

    monkeypatch.setattr(
        excel_api,
        "_resolve_entity_ref",
        lambda _conn, entity, env_id: excel_api.EntityRef(  # noqa: ARG005
            entity=entity,
            schema_name="env_demo",
            table="tickets",
            scope="environment",
            env_uuid=None,
        ),
    )
    monkeypatch.setattr(
        excel_api,
        "_get_columns",
        lambda _conn, _schema, _table: [
            {"name": "ticket_id", "data_type": "uuid", "is_nullable": False, "udt_name": "uuid", "column_default": None},
            {"name": "title", "data_type": "text", "is_nullable": False, "udt_name": "text", "column_default": None},
        ],
    )
    monkeypatch.setattr(excel_api, "_get_primary_keys", lambda _conn, _schema, _table: ["ticket_id"])

    response = client.post(
        "/v1/excel/upsert",
        json={
            "entity": "tickets",
            "rows": [{"title": "Missing key field row"}],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["inserted_count"] == 0
    assert payload["updated_count"] == 0
    assert len(payload["row_errors"]) == 1
    assert payload["row_errors"][0]["code"] == "VALIDATION"
