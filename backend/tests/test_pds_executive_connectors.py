from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from uuid import UUID, uuid4

from app.connectors.pds.base import ConnectorContext, ConnectorResult
from app.connectors.pds.pds_internal_portfolio import PdsInternalPortfolioConnector
from app.connectors.pds.pds_m365_mail import PdsM365MailConnector
from app.services.pds_executive import connectors as connectors_svc


class _CursorQueue:
    def __init__(self, fetchone_rows=None, fetchall_rows=None):
        self.fetchone_rows = list(fetchone_rows or [])
        self.fetchall_rows = list(fetchall_rows or [])
        self.executed: list[tuple[str, tuple | None]] = []

    def execute(self, sql: str, params=None):
        self.executed.append((sql, params))
        return self

    def fetchone(self):
        if self.fetchone_rows:
            return self.fetchone_rows.pop(0)
        return None

    def fetchall(self):
        if self.fetchall_rows:
            return self.fetchall_rows.pop(0)
        return []


@contextmanager
def _ctx(cursor):
    yield cursor


def test_portfolio_connector_reads_snapshot_and_projects(monkeypatch):
    cursor = _CursorQueue(
        fetchone_rows=[
            {
                "period": "2026-03",
                "approved_budget": "12000000",
                "eac": "12300000",
                "variance": "-300000",
                "top_risk_count": 2,
                "open_change_order_count": 4,
                "pending_approval_count": 3,
                "snapshot_hash": "abc",
            }
        ],
        fetchall_rows=[
            [
                {
                    "project_id": uuid4(),
                    "name": "Alpha Tower",
                    "stage": "construction",
                    "status": "active",
                    "project_manager": "PM-A",
                    "approved_budget": "1000000",
                    "forecast_at_completion": "1100000",
                    "contingency_remaining": "50000",
                    "pending_change_order_amount": "10000",
                    "next_milestone_date": "2026-03-20",
                    "risk_score": "70000",
                }
            ]
        ],
    )
    monkeypatch.setattr("app.connectors.pds.pds_internal_portfolio.get_cursor", lambda: _ctx(cursor))

    connector = PdsInternalPortfolioConnector()
    result = connector.run(
        ConnectorContext(env_id=uuid4(), business_id=uuid4(), run_id="run-1"),
    )

    assert result.connector_key == "pds_internal_portfolio"
    assert result.rows_read == 2
    assert any(item.get("record_type") == "portfolio_snapshot" for item in result.records)
    assert any(item.get("record_type") == "project" for item in result.records)


def test_m365_mail_connector_reads_mock_messages(monkeypatch):
    cursor = _CursorQueue(
        fetchone_rows=[
            {
                "config_json": {
                    "mock_messages": [
                        {
                            "external_id": "mail-1",
                            "subject": "Urgent change order review",
                            "classification": "decision_request",
                            "decision_code": "D08",
                            "sender": "gc@example.com",
                            "recipients": ["exec@example.com"],
                        }
                    ]
                }
            }
        ]
    )
    monkeypatch.setattr("app.connectors.pds.pds_m365_mail.get_cursor", lambda: _ctx(cursor))

    connector = PdsM365MailConnector()
    result = connector.run(
        ConnectorContext(env_id=uuid4(), business_id=uuid4(), run_id="run-2"),
    )

    assert result.connector_key == "pds_m365_mail"
    assert len(result.comm_items) == 1
    assert result.comm_items[0]["classification"] == "decision_request"
    assert result.comm_items[0]["decision_code"] == "D08"


class _DummyConnector:
    connector_key = "dummy_connector"

    def run(self, context: ConnectorContext) -> ConnectorResult:
        return ConnectorResult(
            connector_key=self.connector_key,
            rows_read=1,
            rows_written=0,
            records=[{"record_type": "dummy"}],
            comm_items=[
                {
                    "provider": "m365",
                    "external_id": "ext-1",
                    "thread_id": "th-1",
                    "comm_type": "email",
                    "direction": "inbound",
                    "subject": "Dummy",
                    "sender": "dummy@example.com",
                    "recipients_json": ["exec@example.com"],
                    "occurred_at": datetime.utcnow(),
                    "body_text": "Body",
                    "summary_text": "Summary",
                    "classification": "status_update",
                    "decision_code": None,
                    "project_id": None,
                    "metadata_json": {},
                }
            ],
            metadata={"ok": True},
        )


class _ServiceCursor:
    def __init__(self):
        self.mode = ""
        self.run_id = uuid4()

    def execute(self, sql: str, params=None):
        if "INSERT INTO pds_exec_connector_run" in sql:
            self.mode = "start"
        elif "UPDATE pds_exec_connector_run" in sql:
            self.mode = "finish"
        elif "INSERT INTO pds_exec_comm_item" in sql:
            self.mode = "comm"
        return self

    def fetchone(self):
        if self.mode == "start":
            return {"connector_run_id": self.run_id}
        return None


@contextmanager
def _service_ctx(cursor):
    yield cursor


def test_connectors_service_runs_and_persists(monkeypatch):
    cursor = _ServiceCursor()
    monkeypatch.setattr(connectors_svc, "get_cursor", lambda: _service_ctx(cursor))
    monkeypatch.setattr(connectors_svc, "get_connector", lambda key: _DummyConnector())
    monkeypatch.setattr(connectors_svc, "list_connector_keys", lambda: ["dummy_connector"])

    result = connectors_svc.run_connectors(
        env_id=uuid4(),
        business_id=uuid4(),
        connector_keys=["dummy_connector"],
        actor="tester",
    )

    assert result["connector_keys"] == ["dummy_connector"]
    assert result["runs"][0]["status"] == "success"
    assert result["runs"][0]["comm_items_written"] == 1
