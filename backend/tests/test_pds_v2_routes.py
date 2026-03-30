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
        "operating_brief": {
            "headline": "Current Operating Posture",
            "summary": "South Florida is below plan with delivery and staffing pressure concentrated in one project and one client account.",
            "trend_direction": "worsening",
            "focus_label": "South Florida",
            "lines": [
                {"label": "Biggest Drag", "text": "South Florida is missing fee plan.", "severity": "critical"},
                {"label": "Primary Driver", "text": "Timecards and delivery recovery are blocking revenue conversion.", "severity": "warning"},
                {"label": "Execution Pressure", "text": "South Tower Redevelopment is red.", "severity": "critical"},
                {"label": "Pipeline Watch", "text": "Pipeline remains active but needs weekly discipline.", "severity": "watch"},
                {"label": "Highest-Leverage Action", "text": "Escalate schedule recovery review.", "severity": "critical"},
            ],
            "recommended_actions": ["Escalate schedule recovery review"],
        },
        "alert_filters": [
            {
                "key": "markets_below_plan",
                "label": "1 market below plan",
                "count": 1,
                "description": "Markets trailing fee revenue plan.",
                "severity": "critical",
                "tone": "danger",
                "reason_codes": ["forecast_risk"],
                "entity_ids": [market_id],
            }
        ],
        "map_summary": {
            "focus_market_id": market_id,
            "color_modes": ["revenue_variance", "staffing_pressure", "backlog", "closeout_risk"],
            "points": [
                {
                    "market_id": market_id,
                    "name": "South Florida",
                    "lat": 26.1,
                    "lng": -80.3,
                    "fee_actual": "1200000",
                    "fee_plan": "1250000",
                    "variance_pct": "-0.04",
                    "backlog": "4500000",
                    "forecast": "3800000",
                    "staffing_pressure_count": 1,
                    "delinquent_timecards": 1,
                    "red_projects": 2,
                    "closeout_risk_count": 1,
                    "client_risk_accounts": 1,
                    "risk_score": "84",
                    "health_status": "yellow",
                    "reason_codes": ["staffing", "forecast_risk"],
                    "top_accounts": ["Stone Healthcare Accounts"],
                    "owner_name": "Avery Cole",
                }
            ],
        },
        "intervention_queue": [
            {
                "intervention_id": f"market-{market_id}",
                "decision_code": "D19",
                "entity_type": "market",
                "entity_id": market_id,
                "entity_label": "South Florida",
                "severity": "critical",
                "tone": "danger",
                "issue_summary": "South Florida is -4% vs fee plan.",
                "cause_summary": "forecast risk, staffing pressure",
                "expected_impact": "Fee plan miss will continue if left unresolved.",
                "recommended_action": "Escalate schedule recovery review",
                "owner_label": "Avery Cole",
                "reason_codes": ["forecast_risk", "staffing"],
                "href": f"/lab/env/{env_id}/pds/markets",
                "queue_item_id": None,
                "queue_status": "open",
            }
        ],
        "insight_panel": {
            "title": "Why this matters",
            "focus_label": "South Florida",
            "status": "critical",
            "what": "South Florida is below plan.",
            "why": "Schedule recovery and timecards are dragging fee recognition.",
            "consequence": "Revenue and client confidence continue to slip.",
            "action": "Escalate schedule recovery review",
            "owner": "Avery Cole",
            "reason_codes": ["forecast_risk", "staffing"],
        },
        "pipeline_summary": {
            "active_deals": 3,
            "overdue_close_count": 1,
            "stalled_count": 1,
            "high_value_low_probability_count": 1,
            "total_pipeline_value": "8100000",
            "total_weighted_value": "4600000",
            "top_deal_name": "Petron Refinery Controls Upgrade",
            "top_issue": "Expected close is within 30 days.",
        },
    }


def _account_command_center_payload(env_id: str, business_id: str, account_id: str) -> dict:
    return {
        "env_id": env_id,
        "business_id": business_id,
        "workspace_template_key": "pds_enterprise",
        "lens": "account",
        "horizon": "YTD",
        "role_preset": "account_director",
        "generated_at": datetime(2026, 3, 23, 12, 0, 0),
        "metrics_strip": [
            {
                "key": "fee_revenue",
                "label": "Total Revenue (YTD)",
                "value": "265000",
                "comparison_label": "Plan",
                "comparison_value": "300000",
                "delta_value": "-35000",
                "tone": "danger",
                "unit": "usd",
            },
            {
                "key": "vs_plan",
                "label": "% vs Plan",
                "value": "-11.7",
                "comparison_label": "Target",
                "comparison_value": "0",
                "delta_value": "-11.7",
                "tone": "danger",
                "unit": "percent_raw",
            },
        ],
        "performance_table": {
            "lens": "account",
            "horizon": "YTD",
            "columns": [],
            "rows": [],
        },
        "delivery_risk": [],
        "resource_health": [],
        "timecard_health": [],
        "forecast_points": [],
        "satisfaction": [],
        "closeout": [],
        "account_dashboard": {
            "alerts": [
                {
                    "key": "at_risk",
                    "label": "Accounts At Risk",
                    "count": 1,
                    "description": "Health score below 55",
                    "tone": "danger",
                },
                {
                    "key": "missing_plan",
                    "label": "Missing Plan >10%",
                    "count": 1,
                    "description": "Fee actual more than 10% below plan",
                    "tone": "warn",
                },
                {
                    "key": "staffing_issues",
                    "label": "Staffing Issues",
                    "count": 1,
                    "description": "Staffing pressure or late timecards",
                    "tone": "warn",
                },
            ],
            "distribution": {
                "healthy": 0,
                "watch": 0,
                "at_risk": 1,
            },
            "accounts": [
                {
                    "account_id": account_id,
                    "account_name": "Stone At Risk Account",
                    "owner_name": "Dana Hart",
                    "health_score": 42,
                    "health_band": "at_risk",
                    "trend": "deteriorating",
                    "fee_plan": "100000",
                    "fee_actual": "72000",
                    "plan_variance_pct": "-28",
                    "ytd_revenue": "72000",
                    "staffing_score": 49,
                    "team_utilization_pct": None,
                    "overloaded_resources": 2,
                    "staffing_gap_resources": 1,
                    "timecard_compliance_pct": None,
                    "satisfaction_score": None,
                    "satisfaction_trend_delta": None,
                    "red_projects": 2,
                    "collections_lag": "22000",
                    "writeoff_leakage": "7000",
                    "reason_codes": ["FEE_VARIANCE", "STAFFING_PRESSURE"],
                    "primary_issue_code": "FEE_VARIANCE",
                    "impact_label": "$28k below plan",
                    "recommended_action": "Escalate recovery plan",
                    "recommended_owner": "Dana Hart",
                }
            ],
            "actions": [
                {
                    "account_id": account_id,
                    "account_name": "Stone At Risk Account",
                    "owner_name": "Dana Hart",
                    "health_score": 42,
                    "health_band": "at_risk",
                    "issue": "Fee Variance",
                    "impact_label": "$28k below plan",
                    "recommended_action": "Escalate recovery plan",
                    "recommended_owner": "Dana Hart",
                    "severity_rank": 97,
                }
            ],
        },
        "briefing": {
            "generated_at": datetime(2026, 3, 23, 12, 0, 0),
            "lens": "account",
            "horizon": "YTD",
            "role_preset": "account_director",
            "headline": "Account view shows one intervention item.",
            "summary_lines": ["Primary issue is fee variance.", "Staffing pressure is compounding the miss."],
            "recommended_actions": ["Escalate recovery plan"],
        },
        "operating_brief": {
            "headline": "Current Operating Posture",
            "summary": "One account is materially below plan and needs recovery.",
            "trend_direction": "worsening",
            "focus_label": "Stone At Risk Account",
            "lines": [
                {"label": "Biggest Drag", "text": "Stone At Risk Account is $28k below plan.", "severity": "critical"},
                {"label": "Primary Driver", "text": "Staffing pressure is compounding delivery risk.", "severity": "warning"},
                {"label": "Execution Pressure", "text": "Two red projects affect the account.", "severity": "warning"},
                {"label": "Pipeline Watch", "text": "Pipeline watch is stable.", "severity": "neutral"},
                {"label": "Highest-Leverage Action", "text": "Escalate recovery plan.", "severity": "critical"},
            ],
            "recommended_actions": ["Escalate recovery plan"],
        },
        "alert_filters": [],
        "map_summary": {"focus_market_id": None, "color_modes": ["revenue_variance"], "points": []},
        "intervention_queue": [],
        "insight_panel": {
            "title": "Why this matters",
            "focus_label": "Stone At Risk Account",
            "status": "critical",
            "what": "The account is missing plan.",
            "why": "Fee variance and staffing pressure are driving the miss.",
            "consequence": "Recovery plan is needed to avoid further deterioration.",
            "action": "Escalate recovery plan",
            "owner": "Dana Hart",
            "reason_codes": ["forecast_risk", "staffing"],
        },
        "pipeline_summary": {
            "active_deals": 0,
            "overdue_close_count": 0,
            "stalled_count": 0,
            "high_value_low_probability_count": 0,
            "total_pipeline_value": "0",
            "total_weighted_value": "0",
            "top_deal_name": None,
            "top_issue": None,
        },
    }


def _account_preview_payload(account_id: str) -> dict:
    project_id = str(uuid4())
    return {
        "account_id": account_id,
        "account_name": "Stone At Risk Account",
        "owner_name": "Dana Hart",
        "health_score": 42,
        "health_band": "at_risk",
        "trend": "deteriorating",
        "fee_plan": "100000",
        "fee_actual": "72000",
        "plan_variance_pct": "-28",
        "ytd_revenue": "72000",
        "score_breakdown": {
            "revenue_score": 72,
            "staffing_score": 49,
            "timecard_score": 50,
            "client_score": 50,
        },
        "team_utilization_pct": None,
        "staffing_score": 49,
        "overloaded_resources": 2,
        "staffing_gap_resources": 1,
        "timecard_compliance_pct": None,
        "satisfaction_score": None,
        "satisfaction_trend_delta": None,
        "red_projects": 2,
        "collections_lag": "22000",
        "writeoff_leakage": "7000",
        "primary_issue_code": "FEE_VARIANCE",
        "impact_label": "$28k below plan",
        "recommended_action": "Escalate recovery plan",
        "recommended_owner": "Dana Hart",
        "reason_codes": ["FEE_VARIANCE", "STAFFING_PRESSURE"],
        "top_project_risks": [
            {
                "project_id": project_id,
                "project_name": "North Campus Upgrade",
                "severity": "red",
                "risk_score": "84",
                "issue_summary": "Schedule slip, fee variance",
                "recommended_action": "Recover schedule baseline",
                "href": f"/lab/env/env-1/pds/projects/{project_id}",
            }
        ],
    }


def _pipeline_payload(deal_id: str) -> dict:
    return {
        "has_deals": True,
        "empty_state_title": "No pipeline yet",
        "empty_state_body": "Create the first deal.",
        "required_fields": ["Deal", "Account", "Stage", "Value", "Probability", "Expected Close", "Owner"],
        "example_deal": {
            "deal_name": "Northwest Medical Campus Refresh",
            "account_name": "Stone Strategic Accounts",
            "stage": "prospect",
            "deal_value": "1200000",
            "probability_pct": "25",
            "expected_close_date": date(2026, 5, 15),
            "owner_name": "Dana Park",
        },
        "metrics": [
            {
                "key": "total_pipeline",
                "label": "Total Pipeline",
                "value": "8100000",
                "delta_value": "250000",
                "delta_label": "vs prior snapshot",
                "tone": "neutral",
                "context": "Open value across prospect to won.",
                "empty_hint": None,
            }
        ],
        "attention_items": [
            {
                "deal_id": deal_id,
                "deal_name": "Petron Refinery Controls Upgrade",
                "account_name": "Stone Strategic Accounts",
                "stage": "negotiation",
                "deal_value": "4500000",
                "probability_pct": "55",
                "expected_close_date": date(2026, 4, 18),
                "issue_type": "closing_soon",
                "issue": "Expected close is within 30 days.",
                "action": "Confirm the close plan and owner commitments.",
                "tone": "warn",
            }
        ],
        "stages": [
            {
                "stage": "prospect",
                "label": "Prospect",
                "count": 1,
                "weighted_value": "300000",
                "unweighted_value": "1200000",
                "avg_days_in_stage": "12",
                "conversion_to_next_pct": None,
                "dropoff_pct": None,
                "tone": "neutral",
            },
            {
                "stage": "negotiation",
                "label": "Negotiation",
                "count": 1,
                "weighted_value": "2475000",
                "unweighted_value": "4500000",
                "avg_days_in_stage": "9",
                "conversion_to_next_pct": "50",
                "dropoff_pct": None,
                "tone": "warn",
            },
        ],
        "timeline": [
            {
                "forecast_month": date(2026, 4, 1),
                "unweighted_value": "4500000",
                "weighted_value": "2475000",
                "deal_count": 1,
            }
        ],
        "deals": [
            {
                "deal_id": deal_id,
                "deal_name": "Petron Refinery Controls Upgrade",
                "account_id": str(uuid4()),
                "account_name": "Stone Strategic Accounts",
                "stage": "negotiation",
                "deal_value": "4500000",
                "probability_pct": "55",
                "expected_close_date": date(2026, 4, 18),
                "owner_name": "Riley Brooks",
                "notes": "Awaiting final commercial sign-off.",
                "lost_reason": None,
                "stage_entered_at": datetime(2026, 3, 10, 12, 0, 0),
                "last_activity_at": datetime(2026, 3, 20, 12, 0, 0),
                "days_in_stage": 13,
                "days_to_close": 26,
                "health_state": "warn",
                "attention_reasons": ["closing_soon"],
                "is_closed": False,
            }
        ],
        "total_pipeline_value": "8100000",
        "total_weighted_value": "4300000",
    }


def _pipeline_detail_payload(deal_id: str) -> dict:
    payload = _pipeline_payload(deal_id)
    return {
        "deal": payload["deals"][0],
        "history": [
            {
                "stage_history_id": str(uuid4()),
                "from_stage": "pursuit",
                "to_stage": "negotiation",
                "changed_at": datetime(2026, 3, 10, 12, 0, 0),
                "note": "Commercial terms advanced.",
            }
        ],
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


def test_account_lens_command_center_and_preview_routes(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    account_id = str(uuid4())
    payload = _account_command_center_payload(env_id, business_id, account_id)
    preview_payload = _account_preview_payload(account_id)

    monkeypatch.setattr(pds_v2_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "get_command_center", lambda **_: payload)
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "get_account_preview", lambda **_: preview_payload)

    command_center_resp = client.get(
        f"/api/pds/v2/command-center?env_id={env_id}&business_id={business_id}&lens=account&horizon=YTD&role_preset=account_director",
        headers=repe_log_context["headers"],
    )
    _assert_headers(command_center_resp, repe_log_context)
    assert command_center_resp.status_code == 200

    command_center_body = command_center_resp.json()
    assert command_center_body["lens"] == "account"
    assert command_center_body["metrics_strip"][1]["unit"] == "percent_raw"
    assert command_center_body["account_dashboard"]["alerts"][0]["count"] == 1
    assert command_center_body["account_dashboard"]["accounts"][0]["health_band"] == "at_risk"
    assert command_center_body["account_dashboard"]["accounts"][0]["trend"] == "deteriorating"
    assert command_center_body["account_dashboard"]["actions"][0]["issue"] == "Fee Variance"
    assert command_center_body["account_dashboard"]["accounts"][0]["satisfaction_score"] is None
    assert command_center_body["account_dashboard"]["accounts"][0]["timecard_compliance_pct"] is None

    preview_resp = client.get(
        f"/api/pds/v2/accounts/{account_id}/preview?env_id={env_id}&business_id={business_id}&horizon=YTD",
        headers=repe_log_context["headers"],
    )
    _assert_headers(preview_resp, repe_log_context)
    assert preview_resp.status_code == 200

    preview_body = preview_resp.json()
    assert preview_body["account_id"] == account_id
    assert preview_body["health_band"] == "at_risk"
    assert preview_body["score_breakdown"]["staffing_score"] == 49
    assert preview_body["satisfaction_score"] is None
    assert preview_body["timecard_compliance_pct"] is None
    assert preview_body["top_project_risks"][0]["project_name"] == "North Campus Upgrade"


def test_pipeline_workspace_and_deal_routes(client, monkeypatch, repe_log_context):
    env_id = str(uuid4())
    business_id = str(uuid4())
    deal_id = str(uuid4())
    payload = _pipeline_payload(deal_id)
    detail_payload = _pipeline_detail_payload(deal_id)

    monkeypatch.setattr(pds_v2_routes, "_resolve_context", _resolver(env_id, business_id))
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "get_pipeline_summary", lambda **_: payload)
    monkeypatch.setattr(
        pds_v2_routes.enterprise_svc,
        "get_pipeline_lookups",
        lambda **_: {
            "accounts": [{"value": str(uuid4()), "label": "Stone Strategic Accounts", "meta": "Dana Park"}],
            "owners": [{"value": str(uuid4()), "label": "Riley Brooks", "meta": "Market Director"}],
            "stages": [{"value": "negotiation", "label": "Negotiation", "meta": "Active"}],
        },
    )
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "get_pipeline_deal_detail", lambda **_: detail_payload)
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "create_pipeline_deal", lambda **_: detail_payload)
    monkeypatch.setattr(pds_v2_routes.enterprise_svc, "update_pipeline_deal", lambda **_: detail_payload)

    summary_resp = client.get(
        f"/api/pds/v2/pipeline?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )
    _assert_headers(summary_resp, repe_log_context)
    assert summary_resp.status_code == 200
    summary_body = summary_resp.json()
    assert summary_body["has_deals"] is True
    assert summary_body["attention_items"][0]["issue_type"] == "closing_soon"
    assert summary_body["deals"][0]["health_state"] == "warn"

    lookups_resp = client.get(
        f"/api/pds/v2/pipeline/lookups?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )
    _assert_headers(lookups_resp, repe_log_context)
    assert lookups_resp.status_code == 200
    assert lookups_resp.json()["stages"][0]["label"] == "Negotiation"

    detail_resp = client.get(
        f"/api/pds/v2/pipeline/deals/{deal_id}?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
    )
    _assert_headers(detail_resp, repe_log_context)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["history"][0]["to_stage"] == "negotiation"

    create_resp = client.post(
        "/api/pds/v2/pipeline/deals",
        headers=repe_log_context["headers"],
        json={
            "env_id": env_id,
            "business_id": business_id,
            "deal_name": "Petron Refinery Controls Upgrade",
            "stage": "negotiation",
            "deal_value": 4500000,
            "probability_pct": 55,
            "expected_close_date": "2026-04-18",
            "owner_name": "Riley Brooks",
        },
    )
    _assert_headers(create_resp, repe_log_context)
    assert create_resp.status_code == 200
    assert create_resp.json()["deal"]["deal_name"] == "Petron Refinery Controls Upgrade"

    update_resp = client.patch(
        f"/api/pds/v2/pipeline/deals/{deal_id}?env_id={env_id}&business_id={business_id}",
        headers=repe_log_context["headers"],
        json={
            "stage": "won",
            "transition_note": "Commercial sign-off received.",
        },
    )
    _assert_headers(update_resp, repe_log_context)
    assert update_resp.status_code == 200
    assert update_resp.json()["deal"]["stage"] == "negotiation"
