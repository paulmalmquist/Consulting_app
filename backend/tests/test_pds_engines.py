from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.services import pds_engines


def _sample_inputs():
    return {
        "period": "2026-02",
        "project_row": {
            "approved_budget": Decimal("1000000"),
            "contingency_budget": Decimal("100000"),
        },
        "budget_versions": [{"version_no": 1, "approved_budget": Decimal("1000000")}],
        "revisions": [{"amount_delta": Decimal("25000"), "status": "approved"}],
        "commitments": [{"amount": Decimal("300000")}],
        "invoices": [{"amount": Decimal("125000")}],
        "payments": [{"amount": Decimal("80000")}],
        "forecasts": [{"version_no": 1, "forecast_to_complete": Decimal("640000"), "eac": Decimal("940000")}],
        "change_orders": [
            {"status": "approved", "amount_impact": Decimal("10000")},
            {"status": "pending", "amount_impact": Decimal("15000")},
        ],
    }


def test_budget_engine_replay_is_deterministic():
    inputs = _sample_inputs()

    first = pds_engines.compute_budget_state(**inputs)
    second = pds_engines.compute_budget_state(**inputs)

    assert first.snapshot_hash == second.snapshot_hash
    assert first.approved_budget == second.approved_budget
    assert first.eac == second.eac
    assert first.variance == second.variance


def test_schedule_engine_replay_is_deterministic():
    milestones = [
        {
            "milestone_name": "Permit",
            "baseline_date": date(2026, 2, 1),
            "current_date": date(2026, 2, 5),
            "actual_date": None,
            "is_critical": True,
        },
        {
            "milestone_name": "Dry In",
            "baseline_date": date(2026, 3, 1),
            "current_date": date(2026, 3, 2),
            "actual_date": None,
            "is_critical": False,
        },
    ]

    first = pds_engines.compute_schedule_state(period="2026-02", milestones=milestones)
    second = pds_engines.compute_schedule_state(period="2026-02", milestones=milestones)

    assert first.snapshot_hash == second.snapshot_hash
    assert first.total_slip_days == second.total_slip_days
    assert first.milestone_health == second.milestone_health


def test_risk_engine_replay_is_deterministic():
    risks = [
        {
            "status": "open",
            "probability": Decimal("0.35"),
            "impact_amount": Decimal("250000"),
            "impact_days": 28,
        },
        {
            "status": "open",
            "probability": Decimal("0.20"),
            "impact_amount": Decimal("150000"),
            "impact_days": 40,
        },
    ]

    first = pds_engines.compute_risk_state(period="2026-02", risks=risks)
    second = pds_engines.compute_risk_state(period="2026-02", risks=risks)

    assert first.snapshot_hash == second.snapshot_hash
    assert first.expected_exposure == second.expected_exposure
    assert first.top_risk_count == second.top_risk_count


def test_reporting_assembly_replay_is_deterministic():
    portfolio = {
        "eac": Decimal("940000"),
        "variance": Decimal("85000"),
        "snapshot_hash": "portfolio_hash",
    }
    schedule = {
        "milestone_health": "watch",
        "total_slip_days": 6,
        "critical_flags": 1,
        "snapshot_hash": "schedule_hash",
    }
    risk = {
        "expected_exposure": Decimal("87500"),
        "top_risk_count": 2,
        "snapshot_hash": "risk_hash",
    }
    prior = {
        "eac": Decimal("900000"),
        "variance": Decimal("120000"),
    }

    first = pds_engines.assemble_reporting_pack(
        period="2026-02",
        portfolio_snapshot=portfolio,
        schedule_snapshot=schedule,
        risk_snapshot=risk,
        prior_portfolio_snapshot=prior,
    )
    second = pds_engines.assemble_reporting_pack(
        period="2026-02",
        portfolio_snapshot=portfolio,
        schedule_snapshot=schedule,
        risk_snapshot=risk,
        prior_portfolio_snapshot=prior,
    )

    assert first.snapshot_hash == second.snapshot_hash
    assert first.deterministic_deltas == second.deterministic_deltas
    assert first.narrative == second.narrative
