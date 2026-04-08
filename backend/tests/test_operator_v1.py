from __future__ import annotations

from uuid import UUID

import app.routes.operator as operator_routes
from app.services.env_context import EnvBusinessContext


ENV_ID = "11111111-1111-4111-8111-111111111111"
BUSINESS_ID = "22222222-2222-4222-8222-222222222222"


def _ctx() -> EnvBusinessContext:
    return EnvBusinessContext(
        env_id=ENV_ID,
        business_id=BUSINESS_ID,
        created=False,
        source="test",
        diagnostics={"binding_found": True},
        environment={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "industry": "multi_entity_operator",
            "industry_type": "multi_entity_operator",
        },
    )


def _resolver(_request, _env_id, _business_id=None):
    return UUID(ENV_ID), UUID(BUSINESS_ID), _ctx()


def test_operator_context(client, monkeypatch):
    monkeypatch.setattr(operator_routes, "_resolve_context", _resolver)

    resp = client.get("/api/operator/v1/context", params={"env_id": ENV_ID})
    assert resp.status_code == 200
    body = resp.json()
    assert body["env_id"] == ENV_ID
    assert body["business_id"] == BUSINESS_ID
    assert body["workspace_template_key"] == "multi_entity_operator"


def test_operator_command_center_reconciles_seed(client, monkeypatch):
    monkeypatch.setattr(operator_routes, "_resolve_context", _resolver)

    resp = client.get("/api/operator/v1/command-center", params={"env_id": ENV_ID})
    assert resp.status_code == 200
    body = resp.json()

    revenue_metric = next(metric for metric in body["metrics_strip"] if metric["key"] == "revenue")
    margin_metric = next(metric for metric in body["metrics_strip"] if metric["key"] == "margin")

    assert revenue_metric["value"] == 12_500_000
    assert margin_metric["value"] == 12.0
    assert len(body["at_risk_projects"]) == 2
    assert {project["name"] for project in body["at_risk_projects"]} == {
        "Airport Expansion",
        "New Development Site A",
    }
    assert any("HB Logistics margin fell" in line for line in body["assistant_focus"]["summary_lines"])
    assert any("New Development Site A overrun: $400K." == line for line in body["assistant_focus"]["money_leakage"])


def test_operator_project_detail_contains_docs_tasks_and_vendors(client, monkeypatch):
    monkeypatch.setattr(operator_routes, "_resolve_context", _resolver)

    resp = client.get(
        "/api/operator/v1/projects/airport-expansion",
        params={"env_id": ENV_ID},
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["name"] == "Airport Expansion"
    assert body["variance"] == -400000
    assert len(body["documents"]) == 2
    assert len(body["tasks"]) == 1
    assert len(body["vendor_breakdown"]) == 3
    assert body["documents"][0]["risk_flags"]


def test_operator_vendors_flag_duplication_and_overspend(client, monkeypatch):
    monkeypatch.setattr(operator_routes, "_resolve_context", _resolver)

    resp = client.get("/api/operator/v1/vendors", params={"env_id": ENV_ID})
    assert resp.status_code == 200
    body = resp.json()

    assert body[0]["name"] == "Apex Electrical"
    assert body[0]["duplication_flag"] is True
    assert body[0]["overspend_amount"] == 150000
    assert any(vendor["name"] == "Prime Staffing" and vendor["duplication_flag"] for vendor in body)


def test_operator_close_sorts_blocked_and_late_first(client, monkeypatch):
    monkeypatch.setattr(operator_routes, "_resolve_context", _resolver)

    resp = client.get("/api/operator/v1/close", params={"env_id": ENV_ID})
    assert resp.status_code == 200
    body = resp.json()

    assert body[0]["status"] == "blocked"
    assert body[0]["entity_name"] == "HB Logistics"
    assert body[1]["status"] == "late"
    assert body[1]["entity_name"] == "HB Development"
