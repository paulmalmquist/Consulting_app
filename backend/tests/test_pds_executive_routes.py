from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import app.routes.pds_executive as exec_routes
from app.services.env_context import EnvBusinessContext


def _ctx(env_id: str, business_id: str) -> EnvBusinessContext:
    return EnvBusinessContext(
        env_id=env_id,
        business_id=business_id,
        created=False,
        source="test",
        diagnostics={"binding_found": True},
        environment={"env_id": env_id, "business_id": business_id},
    )


def _resolver(env_id: str, business_id: str):
    resolved_env = UUID(env_id)
    resolved_business = UUID(business_id)

    def _resolve(_request, _env_id, _business_id=None):
        return resolved_env, resolved_business, _ctx(env_id, business_id)

    return _resolve


def _assert_headers(resp, repe_log_context):
    assert resp.headers["X-Request-Id"] == repe_log_context["request_id"]
    assert resp.headers["X-Run-Id"] == repe_log_context["run_id"]


def test_overview_route_contract(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())

    monkeypatch.setattr(exec_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        exec_routes.orchestrator_svc,
        "get_overview",
        lambda **_: {
            "env_id": env_id,
            "business_id": business_id,
            "decisions_total": 20,
            "open_queue": 6,
            "critical_queue": 2,
            "high_queue": 3,
            "open_signals": 11,
            "high_signals": 4,
            "latest_kpi": {"kpi_date": "2026-03-04", "queue_sla_compliance": "0.81"},
        },
    )

    resp = client.get(
        f"/api/pds/v1/executive/overview?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )
    _assert_headers(resp, repe_log_context)
    assert resp.status_code == 200
    body = resp.json()
    assert body["decisions_total"] == 20
    assert body["critical_queue"] == 2


def test_queue_route_and_action(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    queue_item_id = str(uuid4())

    monkeypatch.setattr(exec_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        exec_routes.queue_svc,
        "list_queue_items",
        lambda **_: [
            {
                "queue_item_id": queue_item_id,
                "env_id": env_id,
                "business_id": business_id,
                "decision_code": "D07",
                "title": "Project escalation required",
                "summary": "2 projects breached threshold",
                "priority": "high",
                "status": "open",
                "project_id": None,
                "signal_event_id": None,
                "recommended_action": "Escalate",
                "recommended_owner": "Exec",
                "due_at": datetime.utcnow().isoformat(),
                "risk_score": "7.5",
                "context_json": {},
                "ai_analysis_json": {},
                "input_snapshot_json": {},
                "outcome_json": {},
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
        ],
    )
    monkeypatch.setattr(
        exec_routes.queue_svc,
        "record_queue_action",
        lambda **_: {
            "queue_item": {"queue_item_id": queue_item_id, "status": "approved"},
            "action": {"action_type": "approve", "actor": "tester"},
        },
    )

    list_resp = client.get(
        f"/api/pds/v1/executive/queue?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )
    _assert_headers(list_resp, repe_log_context)
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["decision_code"] == "D07"

    action_resp = client.post(
        f"/api/pds/v1/executive/queue/{queue_item_id}/actions?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
        json={"action_type": "approve", "actor": "tester", "rationale": "Ship it"},
    )
    _assert_headers(action_resp, repe_log_context)
    assert action_resp.status_code == 200
    assert action_resp.json()["action"]["action_type"] == "approve"


def test_run_and_messaging_routes(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())

    monkeypatch.setattr(exec_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        exec_routes.orchestrator_svc,
        "run_full_cycle",
        lambda **_: {"ok": True, "connectors": {"runs": []}, "decision_engine": {"evaluated": 20}},
    )
    monkeypatch.setattr(
        exec_routes.narrative_svc,
        "generate_drafts",
        lambda **_: [{"draft_id": str(uuid4()), "draft_type": "internal_memo", "status": "draft"}],
    )

    run_resp = client.post(
        "/api/pds/v1/executive/runs/full",
        headers=repe_log_context["headers"],
        json={"env_id": env_id, "business_id": business_id},
    )
    _assert_headers(run_resp, repe_log_context)
    assert run_resp.status_code == 200
    assert run_resp.json()["decision_engine"]["evaluated"] == 20

    msg_resp = client.post(
        "/api/pds/v1/executive/messaging/generate",
        headers=repe_log_context["headers"],
        json={"env_id": env_id, "business_id": business_id, "draft_types": ["internal_memo"]},
    )
    _assert_headers(msg_resp, repe_log_context)
    assert msg_resp.status_code == 200
    assert msg_resp.json()[0]["draft_type"] == "internal_memo"
