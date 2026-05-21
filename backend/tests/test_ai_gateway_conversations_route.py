from __future__ import annotations

from uuid import uuid4


def test_list_conversations_fails_closed_on_service_error(monkeypatch):
    """A DB/service failure must return an empty list, never an unhandled 500."""
    from app.routes import ai_gateway

    monkeypatch.setattr(ai_gateway, "require_authenticated_request", lambda request: None)

    def _boom(**_kwargs):
        raise RuntimeError("simulated conversation store outage")

    monkeypatch.setattr(ai_gateway.convo_svc, "list_conversations", _boom)

    result = ai_gateway.list_conversations(request=None, business_id=str(uuid4()))
    assert result == {"conversations": []}


def test_list_conversations_fails_closed_on_malformed_business_id(monkeypatch):
    """A malformed business_id must fail closed, not raise."""
    from app.routes import ai_gateway

    monkeypatch.setattr(ai_gateway, "require_authenticated_request", lambda request: None)

    result = ai_gateway.list_conversations(request=None, business_id="not-a-uuid")
    assert result == {"conversations": []}


def test_list_conversations_returns_rows_on_success(monkeypatch):
    """The happy path still normalizes and returns conversation rows."""
    from datetime import datetime

    from app.routes import ai_gateway

    monkeypatch.setattr(ai_gateway, "require_authenticated_request", lambda request: None)

    cid = uuid4()
    eid = uuid4()
    rows = [
        {
            "conversation_id": cid,
            "title": "Test thread",
            "env_id": eid,
            "thread_kind": "general",
            "message_count": 3,
            "updated_at": datetime(2026, 5, 21, 12, 0, 0),
            "archived": False,
        }
    ]
    monkeypatch.setattr(ai_gateway.convo_svc, "list_conversations", lambda **_kwargs: rows)

    result = ai_gateway.list_conversations(request=None, business_id=str(uuid4()))
    assert len(result["conversations"]) == 1
    convo = result["conversations"][0]
    assert convo["conversation_id"] == str(cid)
    assert convo["env_id"] == str(eid)
    assert convo["message_count"] == 3
    assert convo["updated_at"] == "2026-05-21T12:00:00"
