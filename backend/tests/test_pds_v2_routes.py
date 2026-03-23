from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid4

import app.routes.pds_v2 as pds_v2_routes
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


def _command_center_payload(env_id: str, business_id: str) -> dict:
    market_id = str(uuid4())
    project_id = str(uuid4())
    account_id = str(uuid4())
    resource_id = str(uuid4())
    return {
        "env_id": env_id,
        "business_id": business_id,
        "workspace_template_key": "pds_enterprise",
        "lens": "market",
        "horizon": "YTD",
        "role_preset": "executive",
        "generated_at": datetime(2026, 3, 8, 12, 0, 0),
        "metrics_strip": [
            {
                "key": "fee_vs_plan",
                "label": "Fee Revenue vs Plan",
                "value": "1200000",
                "comparison_label": "Plan",
                "comparison_value": "1250000",
                "delta_value": "-50000",
                "tone": "danger",
                "unit": "usd",
            }
        ],
        "performance_table": {
            "lens": "market",
            "horizon": "YTD",
            "columns": ["Market", "Fee", "GAAP", "CI", "Backlog", "Forecast", "Risk"],
            "rows": [
                {
                    "entity_id": market_id,
                    "entity_label": "South Florida",
                    "owner_label": "Avery Cole",
                    "health_status": "yellow",
                    "fee_plan": "1250000",
                    "fee_actual": "1200000",
                    "fee_variance": "-50000",
                    "gaap_plan": "1175000",
                    "gaap_actual": "1120000",
                    "gaap_variance": "-55000",
                    "ci_plan": "225000",
                    "ci_actual": "195000",
                    "ci_variance": "-30000",
                    "backlog": "4500000",
                    "forecast": "3800000",
                    "red_projects": 2,
                    "client_risk_accounts": 1,
                    "satisfaction_score": "4.2",
                    "utilization_pct": "0.91",
                    "timecard_compliance_pct": "0.88",
                    "reason_codes": ["FEE_PLAN_MISS"],
                    "href": f"/lab/env/{env_id}/pds/markets",
                }
            ],
        },
        "delivery_risk": [
            {
                "project_id": project_id,
                "project_name": "South Tower Redevelopment",
                "account_name": "Stone Healthcare Accounts",
                "market_name": "South Florida",
                "issue_summary": "Schedule slip, fee variance",
                "severity": "red",
                "risk_score": "85",
                "reason_codes": ["SCHEDULE_SLIP", "FEE_VARIANCE"],
                "recommended_action": "Escalate schedule recovery review",
                "recommended_owner": "Project Executive",
                "href": f"/lab/env/{env_id}/pds/projects/{project_id}",
            }
        ],
        "resource_health": [
            {
                "resource_id": resource_id,
                "resource_name": "A. Thompson",
                "title": "Project Executive",
                "market_name": "South Florida",
                "utilization_pct": "1.08",
                "billable_mix_pct": "0.84",
                "delinquent_timecards": 1,
                "overload_flag": True,
                "staffing_gap_flag": False,
                "reason_codes": ["OVERALLOCATED"],
            }
        ],
        "timecard_health": [
            {
                "resource_id": resource_id,
                "resource_name": "A. Thompson",
                "submitted_pct": "0.75",
                "delinquent_count": 1,
                "overdue_hours": "8",
                "reason_codes": ["TIMECARD_DELINQUENCY"],
            }
        ],
        "forecast_points": [
            {
                "forecast_month": date(2026, 4, 1),
                "entity_type": "market",
                "entity_id": market_id,
                "entity_label": "South Florida",
                "current_value": "1300000",
                "prior_value": "1260000",
                "delta_value": "40000",
                "override_value": None,
                "override_reason": None,
                "confidence_score": "0.86",
            }
        ],
        "satisfaction": [
            {
                "account_id": account_id,
                "account_name": "Stone Healthcare Accounts",
                "client_name": "Stone Strategic Clients",
                "average_score": "3.4",
                "trend_delta": "-0.6",
                "response_count": 3,
                "repeat_award_score": "3.0",
                "risk_state": "red",
                "reason_codes": ["LOW_SCORE", "DECLINING_TREND"],
            }
        ],
        "closeout": [
            {
                "project_id": project_id,
                "project_name": "South Tower Redevelopment",
                "closeout_target_date": date(2026, 4, 30),
                "substantial_completion_date": date(2026, 4, 10),
                "actual_closeout_date": None,
                "closeout_aging_days": 12,
                "blocker_count": 2,
                "final_billing_status": "pending",
                "survey_status": "pending",
                "lessons_learned_status": "pending",
                "risk_state": "red",
                "reason_codes": ["CLOSEOUT_AGING"],
                "href": f"/lab/env/{env_id}/pds/projects/{project_id}",
            }
        ],
        "briefing": {
            "generated_at": datetime(2026, 3, 8, 12, 0, 0),
            "lens": "market",
            "horizon": "YTD",
            "role_preset": "executive",
            "headline": "Market view shows 1 intervention item and 1 client-risk account.",
            "summary_lines": [
                "Primary management lens: Market with YTD horizon.",
                "Immediate delivery watchlist: South Tower Redevelopment.",
            ],
            "recommended_actions": [
                "Escalate schedule recovery review",
                "Enforce timecard cleanup on delinquent teams before weekly forecast lock.",
            ],
        },
    }


def test_context_and_command_center_routes(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    payload = _command_center_payload(env_id, business_id)

    monkeypatch.setattr(pds_v2_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        pds_v2_routes.enterprise_svc,
        "_fetch_environment",
        lambda _env_id: {
            "env_id": env_id,
            "industry": "pds_command",
            "industry_type": "pds_command",
            "workspace_template_key": "pds_enterprise",
        },
    )
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "resolve_pds_workspace_template", lambda _env: "pds_enterprise")
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "get_command_center", lambda **_: payload)
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "get_executive_briefing", lambda **_: payload["briefing"])

    context_resp = client.get(
        f"/api/pds/v2/context?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )
    _assert_headers(context_resp, repe_log_context)
    assert context_resp.status_code == 200
    assert context_resp.json()["workspace_template_key"] == "pds_enterprise"

    command_center_resp = client.get(
        f"/api/pds/v2/command-center?env_id={env_id}&business_id={business_id}&lens=market&horizon=YTD&role_preset=executive",
        headers=repe_log_context["headers"],
    )
    _assert_headers(command_center_resp, repe_log_context)
    assert command_center_resp.status_code == 200
    body = command_center_resp.json()
    assert body["workspace_template_key"] == "pds_enterprise"
    assert body["performance_table"]["rows"][0]["entity_label"] == "South Florida"
    assert body["delivery_risk"][0]["severity"] == "red"


def test_report_packet_route(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())

    monkeypatch.setattr(pds_v2_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(
        pds_v2_routes.enterprise_svc,
        "build_report_packet",
        lambda **_: {
            "packet_type": "forecast_pack",
            "generated_at": datetime(2026, 3, 8, 12, 0, 0),
            "title": "Forecast Pack - Market / Forecast",
            "sections": [{"key": "headline_metrics", "title": "Headline Metrics"}],
            "narrative": "Forecast drift is concentrated in South Florida.",
        },
    )

    resp = client.post(
        "/api/pds/v2/reports/packet",
        headers=repe_log_context["headers"],
        json={
            "env_id": env_id,
            "business_id": business_id,
            "packet_type": "forecast_pack",
            "lens": "market",
            "horizon": "Forecast",
            "role_preset": "executive",
        },
    )
    _assert_headers(resp, repe_log_context)
    assert resp.status_code == 200
    assert resp.json()["packet_type"] == "forecast_pack"
    assert resp.json()["sections"][0]["key"] == "headline_metrics"
