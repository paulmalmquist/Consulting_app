from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import app.routes.opportunity_engine as opportunity_engine_routes


def _ctx(env_id: str, business_id: str):
    return uuid4(), uuid4(), SimpleNamespace(env_id=env_id, business_id=business_id, created=False, source="test", diagnostics={})


def test_get_opportunity_engine_context(client, monkeypatch):
    env_id = str(uuid4())
    business_id = str(uuid4())

    monkeypatch.setattr(
        opportunity_engine_routes,
        "_resolve_context",
        lambda *_args, **_kwargs: (
            uuid4(),
            uuid4(),
            SimpleNamespace(env_id=env_id, business_id=business_id, created=False, source="test", diagnostics={"ok": True}),
        ),
    )

    response = client.get(f"/api/opportunity-engine/v1/context?env_id={env_id}&business_id={business_id}")

    assert response.status_code == 200
    assert response.json()["source"] == "test"


def test_get_dashboard(client, monkeypatch):
    env_id = str(uuid4())
    business_id = str(uuid4())
    resolved_env_id = uuid4()
    resolved_business_id = uuid4()

    monkeypatch.setattr(
        opportunity_engine_routes,
        "_resolve_context",
        lambda *_args, **_kwargs: (
            resolved_env_id,
            resolved_business_id,
            SimpleNamespace(env_id=env_id, business_id=business_id, created=False, source="test", diagnostics={}),
        ),
    )
    monkeypatch.setattr(
        opportunity_engine_routes.svc,
        "get_dashboard",
        lambda **_: {
            "latest_run": None,
            "recommendation_counts": {"consulting": 2},
            "top_recommendations": [],
            "top_signals": [],
            "run_history": [],
        },
    )

    response = client.get(f"/api/opportunity-engine/v1/dashboard?env_id={env_id}&business_id={business_id}")

    assert response.status_code == 200
    assert response.json()["recommendation_counts"]["consulting"] == 2


def test_list_recommendations(client, monkeypatch):
    env_id = str(uuid4())
    business_id = str(uuid4())

    monkeypatch.setattr(
        opportunity_engine_routes,
        "_resolve_context",
        lambda *_args, **_kwargs: (
            uuid4(),
            uuid4(),
            SimpleNamespace(env_id=env_id, business_id=business_id, created=False, source="test", diagnostics={}),
        ),
    )
    recommendation_id = str(uuid4())
    run_id = str(uuid4())
    monkeypatch.setattr(
        opportunity_engine_routes.svc,
        "list_recommendations",
        lambda **_: [
            {
                "recommendation_id": recommendation_id,
                "run_id": run_id,
                "opportunity_score_id": None,
                "business_line": "consulting",
                "entity_type": "crm_opportunity",
                "entity_id": str(uuid4()),
                "entity_key": "opp-1",
                "recommendation_type": "pipeline_action",
                "title": "Advance Acme opportunity",
                "summary": "High-probability consulting motion.",
                "suggested_action": "Prepare sponsor brief.",
                "action_owner": "consulting_operator",
                "priority": "high",
                "sector": "construction",
                "geography": None,
                "confidence": 0.81,
                "why_json": {"linked_topics": ["rates_easing"]},
                "driver_summary": "Lead Score, Stage Probability",
                "created_at": "2026-03-09T00:00:00Z",
                "updated_at": "2026-03-09T00:00:00Z",
                "score": 88.1,
                "probability": 0.81,
                "expected_value": 96000,
                "rank_position": 1,
                "model_version": "opportunity_engine_v1",
                "fallback_mode": None,
            }
        ],
    )

    response = client.get(f"/api/opportunity-engine/v1/recommendations?env_id={env_id}&business_id={business_id}")

    assert response.status_code == 200
    assert response.json()[0]["title"] == "Advance Acme opportunity"


def test_get_recommendation_detail(client, monkeypatch):
    env_id = str(uuid4())
    business_id = str(uuid4())
    recommendation_id = str(uuid4())

    monkeypatch.setattr(
        opportunity_engine_routes,
        "_resolve_context",
        lambda *_args, **_kwargs: (
            uuid4(),
            uuid4(),
            SimpleNamespace(env_id=env_id, business_id=business_id, created=False, source="test", diagnostics={}),
        ),
    )
    monkeypatch.setattr(
        opportunity_engine_routes.svc,
        "get_recommendation_detail",
        lambda **_: {
            "recommendation_id": recommendation_id,
            "run_id": str(uuid4()),
            "opportunity_score_id": None,
            "business_line": "pds",
            "entity_type": "pds_project",
            "entity_id": str(uuid4()),
            "entity_key": "project-1",
            "recommendation_type": "project_intervention",
            "title": "Intervene on Hospital Expansion",
            "summary": "Recoverable schedule pressure.",
            "suggested_action": "Launch recovery review.",
            "action_owner": "pds_operator",
            "priority": "high",
            "sector": "healthcare",
            "geography": "Dallas",
            "confidence": 0.74,
            "why_json": {"linked_topics": ["construction_cost_pressure"]},
            "driver_summary": "Risk Score",
            "created_at": "2026-03-09T00:00:00Z",
            "updated_at": "2026-03-09T00:00:00Z",
            "score": 77.2,
            "probability": 0.74,
            "expected_value": 42000,
            "rank_position": 1,
            "model_version": "opportunity_engine_v1",
            "fallback_mode": "fallback_scorecard",
            "drivers": [
                {
                    "driver_key": "risk_score",
                    "driver_label": "Risk Score",
                    "driver_value": 0.82,
                    "contribution_score": 0.24,
                    "rank_position": 1,
                    "explanation_text": "Risk Score contributed to the score.",
                }
            ],
            "score_history": [{"as_of_date": "2026-03-09", "score": 77.2, "probability": 0.74}],
            "linked_signals": [],
            "linked_forecasts": [],
        },
    )

    response = client.get(
        f"/api/opportunity-engine/v1/recommendations/{recommendation_id}?env_id={env_id}&business_id={business_id}"
    )

    assert response.status_code == 200
    assert response.json()["drivers"][0]["driver_label"] == "Risk Score"


def test_list_signals_and_runs(client, monkeypatch):
    env_id = str(uuid4())
    business_id = str(uuid4())

    monkeypatch.setattr(
        opportunity_engine_routes,
        "_resolve_context",
        lambda *_args, **_kwargs: (
            uuid4(),
            uuid4(),
            SimpleNamespace(env_id=env_id, business_id=business_id, created=False, source="test", diagnostics={}),
        ),
    )
    monkeypatch.setattr(
        opportunity_engine_routes.svc,
        "list_signals",
        lambda **_: [
            {
                "market_signal_id": str(uuid4()),
                "run_id": str(uuid4()),
                "signal_source": "kalshi_markets",
                "source_market_id": "KAL-RATES",
                "signal_key": "kalshi_markets:KAL-RATES:rates_easing",
                "signal_name": "Will the Fed cut rates by September 2026?",
                "canonical_topic": "rates_easing",
                "business_line": "market_intel",
                "sector": "macro",
                "geography": "United States",
                "signal_direction": "bullish",
                "probability": 0.63,
                "signal_strength": 0.26,
                "confidence": 0.68,
                "observed_at": "2026-03-09T00:00:00Z",
                "expires_at": None,
                "metadata_json": {},
                "explanation_json": {},
                "created_at": "2026-03-09T00:00:00Z",
            }
        ],
    )
    monkeypatch.setattr(
        opportunity_engine_routes.svc,
        "list_runs",
        lambda **_: [
            {
                "run_id": str(uuid4()),
                "env_id": env_id,
                "business_id": business_id,
                "run_type": "manual",
                "mode": "fixture",
                "model_version": "opportunity_engine_v1",
                "status": "success",
                "business_lines": ["consulting", "market_intel"],
                "triggered_by": "tester",
                "input_hash": "abc",
                "parameters_json": {},
                "metrics_json": {},
                "error_summary": None,
                "started_at": "2026-03-09T00:00:00Z",
                "finished_at": "2026-03-09T00:00:01Z",
                "created_at": "2026-03-09T00:00:00Z",
                "updated_at": "2026-03-09T00:00:01Z",
            }
        ],
    )

    signals_response = client.get(f"/api/opportunity-engine/v1/signals?env_id={env_id}&business_id={business_id}")
    runs_response = client.get(f"/api/opportunity-engine/v1/runs?env_id={env_id}&business_id={business_id}")

    assert signals_response.status_code == 200
    assert runs_response.status_code == 200
    assert signals_response.json()[0]["canonical_topic"] == "rates_easing"
    assert runs_response.json()[0]["status"] == "success"


def test_create_run(client, monkeypatch):
    env_id = str(uuid4())
    business_id = str(uuid4())
    resolved_env_id = uuid4()
    resolved_business_id = uuid4()
    run_id = str(uuid4())

    monkeypatch.setattr(
        opportunity_engine_routes,
        "_resolve_context",
        lambda *_args, **_kwargs: (
            resolved_env_id,
            resolved_business_id,
            SimpleNamespace(env_id=env_id, business_id=business_id, created=False, source="test", diagnostics={}),
        ),
    )
    monkeypatch.setattr(
        opportunity_engine_routes.svc,
        "create_run",
        lambda **_: {
            "run_id": run_id,
            "env_id": str(resolved_env_id),
            "business_id": str(resolved_business_id),
            "run_type": "manual",
            "mode": "fixture",
            "model_version": "opportunity_engine_v1",
            "status": "success",
            "business_lines": ["consulting", "pds"],
            "triggered_by": "tester",
            "input_hash": "hash",
            "parameters_json": {"mode": "fixture"},
            "metrics_json": {"totals": {"scores": 3, "recommendations": 2, "signals": 4}},
            "error_summary": None,
            "started_at": "2026-03-09T00:00:00Z",
            "finished_at": "2026-03-09T00:00:05Z",
            "created_at": "2026-03-09T00:00:00Z",
            "updated_at": "2026-03-09T00:00:05Z",
        },
    )

    response = client.post(
        "/api/opportunity-engine/v1/runs",
        json={
            "env_id": env_id,
            "business_id": business_id,
            "mode": "fixture",
            "run_type": "manual",
            "business_lines": ["consulting", "pds"],
            "triggered_by": "tester",
        },
    )

    assert response.status_code == 201
    assert response.json()["metrics_json"]["totals"]["signals"] == 4
