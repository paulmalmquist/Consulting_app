from __future__ import annotations

from datetime import date
from pathlib import Path
from uuid import uuid4

from app.services import research_state_service as svc
from app.services import trades as trades_svc


def test_parse_brief_markdown_complete(tmp_path: Path):
    brief = tmp_path / "regime-2026-04-12.md"
    brief.write_text(
        """
# Regime Classification
Regime Classification: Transitional slowdown
Regime Confidence: medium

## Scenario Distribution
- Bull 25%
- Base 50%
- Bear 25%

## Model Instructions
- downweight_housing
- reduce_conviction

## Divergences
- Labor still strong
- No wage-price spiral
        """.strip(),
        encoding="utf-8",
    )

    parsed = svc.parse_brief_markdown(brief)
    assert parsed["parse_status"] == "complete"
    assert parsed["regime_label"] == "Transitional slowdown"
    assert parsed["scenario_distribution_json"]["base"] == 0.5
    assert "downweight_housing" in parsed["model_actions"]


def test_parse_brief_markdown_ambiguous_conflict(tmp_path: Path):
    brief = tmp_path / "regime-2026-04-12.md"
    brief.write_text(
        """
# Regime Classification
Regime Classification: Risk on
Regime Classification: Stress

## Warnings
- low confidence housing
        """.strip(),
        encoding="utf-8",
    )
    parsed = svc.parse_brief_markdown(brief)
    assert parsed["parse_status"] == "ambiguous"
    assert "conflicting regime labels detected" in parsed["parse_warnings_json"]


def test_compute_deterministic_decision_abstains_on_low_quality():
    result = svc.compute_deterministic_decision(
        {
            "id": str(uuid4()),
            "scope_type": "market",
            "scope_key": "global",
            "state_date": date(2026, 3, 20),
            "parse_status": "partial",
            "signal_freshness_score": 0.2,
            "signal_coherence_index": 0.3,
            "shock_type": "exogenous",
            "analog_significance_json": {"is_significant": False},
            "adversarial_risk": 0.82,
        },
        {
            "forecast_confidence": 0.4,
            "scenario_dispersion_score": 0.8,
            "adversarial_risk": 0.82,
            "agent_agreement_score": 0.3,
        },
    )
    assert result["action_posture"] == "abstain"
    assert any("coherence below 0.40" in reason for reason in result["action_posture_reasons"])
    assert result["size_multiplier"] == 0.0


def test_latest_research_state_route_returns_payload(client, monkeypatch):
    payload = {
        "id": str(uuid4()),
        "scope_type": "market",
        "scope_key": "global",
        "state_date": date(2026, 4, 12),
        "regime_label": "transitional",
        "field_provenance": [],
        "parse_quality": {"parse_status": "complete", "parse_confidence": 0.9, "parse_warnings": [], "missing_fields": []},
        "confidence_delta": {"current": 62, "delta_points": -8, "reasons": ["coherence fell"]},
        "deterministic_decision": {"action_posture": "paper_only", "action_posture_reasons": ["parse status partial"]},
        "latest_forecast": None,
    }
    monkeypatch.setattr(svc, "get_latest_state", lambda **_: payload)
    response = client.get("/api/v1/market/research-state/latest")
    assert response.status_code == 200
    data = response.json()
    assert data["regime_label"] == "transitional"
    assert data["confidence_delta"]["current"] == 62


def test_portfolio_decision_summary_uses_deterministic_research_context(monkeypatch):
    monkeypatch.setattr(
        trades_svc,
        "_load_latest_research_context",
        lambda: {
            "regime_label": "stress",
            "divergences": ["Labor still strong"],
            "top_analogs": [{"episode": "1998 LTCM", "score": 0.74}],
            "scenario_distribution_json": {"bull": 0.2, "base": 0.3, "bear": 0.5},
            "confidence_delta": {"current": 41},
            "deterministic_decision": {
                "action_posture": "paper_only",
                "action_posture_reasons": ["exogenous shock active"],
                "size_multiplier": 0.25,
                "state_staleness_status": "aging",
                "effective_scope_chain": [{"scope_type": "market", "scope_key": "global"}],
            },
            "latest_forecast": {
                "forecast_confidence": 0.41,
                "scenario_dispersion_score": 0.72,
                "adversarial_risk": 0.66,
                "invalidation_triggers_json": ["credit stress broadens"],
            },
        },
    )
    monkeypatch.setattr(trades_svc, "_load_regime_snapshot", lambda: {"regime_label": "stress", "confidence": 40})

    result = trades_svc.get_portfolio_decision_summary(uuid4())
    assert result["recommended_action"] == "paper_trade_only"
    assert result["action_posture"] == "paper_only"
    assert result["size_multiplier"] == 0.25
    assert result["invalidation_trigger"] == "credit stress broadens"
