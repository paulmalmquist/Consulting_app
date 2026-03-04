from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import app.routes.credit as credit_routes
import app.routes.legal_ops as legal_routes
import app.routes.medoffice as med_routes
import app.routes.pds as pds_routes
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


def _assert_req_headers(resp, repe_log_context):
    assert resp.headers["X-Request-Id"] == repe_log_context["request_id"]
    assert resp.headers["X-Run-Id"] == repe_log_context["run_id"]


def test_pds_namespace_contract(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    project_id = str(uuid4())

    monkeypatch.setattr(pds_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        pds_routes.pds_svc,
        "list_projects",
        lambda **_: [
            {
                "project_id": project_id,
                "env_id": env_id,
                "business_id": business_id,
                "program_id": None,
                "name": "Downtown Tower Renovation",
                "stage": "construction",
                "project_manager": "A. Thompson",
                "approved_budget": "24500000",
                "committed_amount": "11250000",
                "spent_amount": "8250000",
                "forecast_at_completion": "25150000",
                "contingency_budget": "1250000",
                "contingency_remaining": "890000",
                "pending_change_order_amount": "275000",
                "next_milestone_date": "2026-03-15",
                "risk_score": "87000",
                "currency_code": "USD",
                "status": "active",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
        ],
    )

    resp = client.get(
        f"/api/pds/v1/projects?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )
    _assert_req_headers(resp, repe_log_context)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["project_id"] == project_id


def test_pds_portfolio_health_contract(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    project_id = str(uuid4())
    milestone_id = str(uuid4())

    monkeypatch.setattr(pds_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        pds_routes.pds_svc,
        "get_portfolio_health",
        lambda **_: {
            "generated_at": datetime.utcnow().isoformat(),
            "period": "2026-03",
            "summary": {
                "active_projects": {"value": 4, "state": "green"},
                "projects_at_risk": {"value": 2, "state": "yellow"},
                "behind_schedule": {"value": 1, "state": "yellow"},
                "over_budget": {"value": 1, "state": "red"},
                "pending_change_orders": {"value": 3, "state": "yellow"},
                "upcoming_milestones_7d": {"value": 5, "state": "yellow"},
            },
            "projects_requiring_attention": [
                {
                    "project_id": project_id,
                    "project_name": "Downtown Tower Renovation",
                    "project_code": "DT-01",
                    "issue_type": "Budget Overrun",
                    "severity": "red",
                    "impact_label": "+$625,000",
                    "reason_codes": ["BUDGET_OVERRUN", "CHANGE_ORDER_EXPOSURE"],
                    "recommended_action": {
                        "label": "Review Budget",
                        "href": f"/lab/env/{env_id}/pds/projects/{project_id}?section=financials",
                    },
                    "project_manager": "A. Thompson",
                    "next_milestone_date": "2026-03-18",
                    "last_updated_at": datetime.utcnow().isoformat(),
                }
            ],
            "upcoming_milestones": [
                {
                    "project_id": project_id,
                    "project_name": "Downtown Tower Renovation",
                    "milestone_id": milestone_id,
                    "milestone_name": "Permit Approval",
                    "date": "2026-03-10",
                    "owner": "Permitting Lead",
                    "status": "due_soon",
                    "href": f"/lab/env/{env_id}/pds/projects/{project_id}?section=schedule",
                }
            ],
            "financial_health": {
                "approved_budget": "24500000",
                "committed": "11250000",
                "spent": "8250000",
                "eac_forecast": "25150000",
                "variance": "-650000",
                "upcoming_spend_30d": "1800000",
                "pending_change_order_value": "375000",
            },
            "user_action_queue": [
                {
                    "queue_item_type": "review_contractor_claim",
                    "priority": "high",
                    "title": "Review 1 contractor claim",
                    "project_id": project_id,
                    "project_name": "Downtown Tower Renovation",
                    "due_date": "2026-03-08",
                    "why_it_matters": "$325,000 of claim exposure",
                    "href": f"/lab/env/{env_id}/pds/projects/{project_id}",
                }
            ],
        },
    )

    resp = client.get(
        f"/api/pds/v1/portfolio/health?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )

    _assert_req_headers(resp, repe_log_context)
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"]["projects_at_risk"]["value"] == 2
    assert body["projects_requiring_attention"][0]["project_id"] == project_id
    assert body["financial_health"]["pending_change_order_value"] == "375000"


def test_credit_namespace_contract(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    case_id = str(uuid4())

    monkeypatch.setattr(credit_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        credit_routes.credit_svc,
        "create_case",
        lambda **_: {
            "case_id": case_id,
            "env_id": env_id,
            "business_id": business_id,
            "case_number": "CR-1001",
            "borrower_name": "Northline Logistics LLC",
            "facility_type": "term_loan",
            "stage": "underwriting",
            "requested_amount": "12500000",
            "approved_amount": "0",
            "risk_grade": "BB+",
            "status": "active",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    resp = client.post(
        "/api/credit/v1/cases",
        headers=repe_log_context["headers"],
        json={
            "env_id": env_id,
            "business_id": business_id,
            "case_number": "CR-1001",
            "borrower_name": "Northline Logistics LLC",
            "facility_type": "term_loan",
            "stage": "underwriting",
            "requested_amount": "12500000",
            "risk_grade": "BB+",
        },
    )
    _assert_req_headers(resp, repe_log_context)
    assert resp.status_code == 200
    assert resp.json()["case_id"] == case_id


def test_legal_namespace_contract(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    matter_id = str(uuid4())

    monkeypatch.setattr(legal_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        legal_routes.legal_ops_svc,
        "list_matters",
        lambda **_: [
            {
                "matter_id": matter_id,
                "env_id": env_id,
                "business_id": business_id,
                "matter_number": "LEG-2001",
                "title": "Main Street Acquisition PSA",
                "matter_type": "Acquisition",
                "related_entity_type": None,
                "related_entity_id": None,
                "counterparty": "Cedar Holdings",
                "outside_counsel": "Foster & Bell LLP",
                "internal_owner": "General Counsel",
                "risk_level": "high",
                "budget_amount": "240000",
                "actual_spend": "82000",
                "status": "open",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
        ],
    )

    resp = client.get(
        f"/api/legalops/v1/matters?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )
    _assert_req_headers(resp, repe_log_context)
    assert resp.status_code == 200
    assert resp.json()[0]["matter_id"] == matter_id


def test_medoffice_namespace_contract(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    property_id = str(uuid4())

    monkeypatch.setattr(med_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        med_routes.medoffice_svc,
        "create_property",
        lambda **_: {
            "property_id": property_id,
            "env_id": env_id,
            "business_id": business_id,
            "property_name": "Metro Medical Pavilion",
            "market": "Dallas, TX",
            "status": "active",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    resp = client.post(
        "/api/medoffice/v1/properties",
        headers=repe_log_context["headers"],
        json={
            "env_id": env_id,
            "business_id": business_id,
            "property_name": "Metro Medical Pavilion",
            "market": "Dallas, TX",
        },
    )
    _assert_req_headers(resp, repe_log_context)
    assert resp.status_code == 200
    assert resp.json()["property_id"] == property_id


def test_domain_error_envelope_contains_request_id(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())

    def _fail_resolve(_request, _env_id, _business_id=None):
        raise ValueError("Missing env binding")

    monkeypatch.setattr(pds_routes, "_resolve_context", _fail_resolve)

    resp = client.get(
        f"/api/pds/v1/projects?env_id={env_id}",
        headers=repe_log_context["headers"],
    )

    _assert_req_headers(resp, repe_log_context)
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "validation_error"
    assert body["detail"] == "Missing env binding"
    assert body["request_id"] == repe_log_context["request_id"]
