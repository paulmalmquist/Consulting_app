from __future__ import annotations

from datetime import date
from uuid import uuid4


def test_score_consulting_rows_falls_back_below_threshold():
    from app.services.opportunity_engine import score_consulting_rows

    open_rows = [
        {
            "entity_id": str(uuid4()),
            "title": "Acme AI rollout",
            "sector": "construction",
            "geography": None,
            "lead_score": 84,
            "amount": 125000,
            "stage_probability": 0.55,
            "estimated_budget": 250000,
            "proposal_margin_pct": 0.24,
            "stage_changes": 3,
            "outreach_count_30d": 11,
            "cycle_days": 45,
            "ai_maturity": "piloting",
            "company_size": "200_1000",
            "pain_category": "growth",
            "account_name": "Acme",
        }
    ]
    closed_rows = [
        {
            **open_rows[0],
            "entity_id": str(uuid4()),
            "status": "won" if index % 2 == 0 else "lost",
        }
        for index in range(10)
    ]

    result = score_consulting_rows(
        open_rows=open_rows,
        closed_rows=closed_rows,
        market_map={"macro_tailwind": 0.62, "construction_cost_pressure": 0.41},
        as_of_date=date(2026, 3, 9),
    )

    assert result["metrics"]["mode"] == "fallback_scorecard"
    assert result["scores"][0]["fallback_mode"] == "fallback_scorecard"
    assert result["scores"][0]["drivers"]


def test_create_run_persists_scores_recommendations_and_explanations(fake_cursor, monkeypatch):
    from app.services import opportunity_engine

    monkeypatch.setattr(
        opportunity_engine,
        "_persist_market_signals",
        lambda **_: (
            [
                {
                    "market_signal_id": str(uuid4()),
                    "canonical_topic": "rates_easing",
                    "signal_key": "kalshi_markets:KAL-RATES:rates_easing",
                    "signal_source": "kalshi_markets",
                    "signal_strength": 0.25,
                    "probability": 0.63,
                }
            ],
            [{"source_key": "kalshi_markets", "rows_read": 1, "rows_written": 1, "duration_ms": 1}],
            [],
        ),
    )
    monkeypatch.setattr(
        opportunity_engine,
        "score_consulting_rows",
        lambda **_: {
            "scores": [
                {
                    "business_line": "consulting",
                    "entity_type": "crm_opportunity",
                    "entity_id": str(uuid4()),
                    "entity_key": "opp-1",
                    "title": "Advance Acme",
                    "sector": "construction",
                    "geography": None,
                    "as_of_date": date(2026, 3, 9),
                    "score": 88.4,
                    "probability": 0.82,
                    "expected_value": 112000.0,
                    "rank_position": 1,
                    "fallback_mode": "fallback_scorecard",
                    "features_json": {"feature_names": ["lead_score"], "feature_values": [0.84]},
                    "drivers": [
                        {
                            "driver_key": "lead_score",
                            "driver_label": "Lead Score",
                            "driver_value": 0.84,
                            "contribution_score": 0.22,
                        }
                    ],
                    "linked_topics": ["rates_easing"],
                    "recommendation": {
                        "recommendation_type": "pipeline_action",
                        "title": "Advance Acme",
                        "summary": "Acme should be advanced.",
                        "suggested_action": "Prepare sponsor brief.",
                        "action_owner": "consulting_operator",
                        "priority": "high",
                        "confidence": 0.82,
                    },
                }
            ],
            "recommendations": [
                {
                    "entity_key": "opp-1",
                    "recommendation_type": "pipeline_action",
                    "title": "Advance Acme",
                    "summary": "Acme should be advanced.",
                    "suggested_action": "Prepare sponsor brief.",
                    "action_owner": "consulting_operator",
                    "priority": "high",
                    "confidence": 0.82,
                }
            ],
            "metrics": {"sample_size": 10, "mode": "fallback_scorecard"},
        },
    )
    monkeypatch.setattr(opportunity_engine, "score_pds_rows", lambda **_: {"scores": [], "recommendations": [], "metrics": {"mode": "empty"}})
    monkeypatch.setattr(opportunity_engine, "score_re_rows", lambda **_: {"scores": [], "recommendations": [], "metrics": {"mode": "empty"}})
    monkeypatch.setattr(opportunity_engine, "build_market_signal_recommendations", lambda **_: {"scores": [], "recommendations": [], "metrics": {"mode": "empty"}})
    monkeypatch.setattr(opportunity_engine, "_fetch_consulting_rows", lambda **_: [])
    monkeypatch.setattr(opportunity_engine, "_fetch_pds_current_rows", lambda **_: [])
    monkeypatch.setattr(opportunity_engine, "_fetch_pds_training_rows", lambda **_: [])
    monkeypatch.setattr(opportunity_engine, "_fetch_re_rows", lambda **_: [])

    env_id = uuid4()
    business_id = uuid4()
    run = opportunity_engine.create_run(
        env_id=env_id,
        business_id=business_id,
        business_lines=["consulting"],
        mode="fixture",
        run_type="manual",
        triggered_by="tester",
        as_of_date=date(2026, 3, 9),
    )

    sql = "\n".join(query for query, _ in fake_cursor.queries)
    assert run["status"] == "success"
    assert "INSERT INTO model_runs" in sql
    assert "INSERT INTO opportunity_scores" in sql
    assert "INSERT INTO project_recommendations" in sql
    assert "INSERT INTO signal_explanations" in sql
    assert "UPDATE model_runs" in sql
