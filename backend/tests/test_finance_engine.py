from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.finance.waterfall_engine import (
    build_run_hash,
    run_waterfall_engine,
    xirr,
)


def _partners():
    return [
        {
            "id": "lp-blue-oak",
            "name": "Blue Oak Capital",
            "role": "LP",
            "has_promote": False,
            "commitment_amount": Decimal("9000000"),
            "ownership_pct": Decimal("0.90"),
        },
        {
            "id": "gp-winston",
            "name": "Winston Sponsor",
            "role": "GP",
            "has_promote": True,
            "commitment_amount": Decimal("1000000"),
            "ownership_pct": Decimal("0.10"),
        },
    ]


def _tiers():
    return [
        {
            "id": "tier-1",
            "tier_order": 1,
            "tier_type": "return_of_capital",
            "split_lp": Decimal("0.90"),
            "split_gp": Decimal("0.10"),
            "hurdle_irr": None,
            "hurdle_multiple": None,
            "pref_rate": None,
            "catch_up_pct": None,
            "notes": "ROC",
        },
        {
            "id": "tier-2",
            "tier_order": 2,
            "tier_type": "preferred_return",
            "split_lp": Decimal("1.0"),
            "split_gp": Decimal("0.0"),
            "hurdle_irr": None,
            "hurdle_multiple": None,
            "pref_rate": Decimal("0.08"),
            "catch_up_pct": None,
            "notes": "8% pref",
        },
        {
            "id": "tier-3",
            "tier_order": 3,
            "tier_type": "catch_up",
            "split_lp": Decimal("0.5"),
            "split_gp": Decimal("0.5"),
            "hurdle_irr": None,
            "hurdle_multiple": None,
            "pref_rate": None,
            "catch_up_pct": Decimal("0.5"),
            "notes": "GP catch-up",
        },
        {
            "id": "tier-4",
            "tier_order": 4,
            "tier_type": "split",
            "split_lp": Decimal("0.8"),
            "split_gp": Decimal("0.2"),
            "hurdle_irr": Decimal("0.14"),
            "hurdle_multiple": None,
            "pref_rate": None,
            "catch_up_pct": None,
            "notes": "80/20 to LP 14% IRR",
        },
        {
            "id": "tier-5",
            "tier_order": 5,
            "tier_type": "split",
            "split_lp": Decimal("0.7"),
            "split_gp": Decimal("0.3"),
            "hurdle_irr": None,
            "hurdle_multiple": None,
            "pref_rate": None,
            "catch_up_pct": None,
            "notes": "70/30 residual",
        },
    ]


def test_xirr_basic():
    result = xirr(
        [
            (date(2020, 1, 1), Decimal("-1000")),
            (date(2021, 1, 1), Decimal("1100")),
        ]
    )
    assert result.value is not None
    assert abs(result.value - Decimal("0.10")) < Decimal("0.001")


def test_waterfall_tiers_simple():
    result = run_waterfall_engine(
        partners=_partners(),
        tiers=_tiers(),
        events=[
            {
                "date": date(2024, 1, 15),
                "event_type": "capital_call",
                "amount": Decimal("1000000"),
                "metadata": {},
            },
            {
                "date": date(2025, 1, 31),
                "event_type": "sale_proceeds",
                "amount": Decimal("1300000"),
                "metadata": {},
            },
        ],
        assumptions={},
        distribution_frequency="monthly",
        promote_structure_type="american",
    )

    lp_total = sum(
        d["distribution_amount"]
        for d in result.distributions
        if d["partner_id"] == "lp-blue-oak"
    )
    gp_total = sum(
        d["distribution_amount"]
        for d in result.distributions
        if d["partner_id"] == "gp-winston"
    )

    assert lp_total > gp_total
    assert any(d["distribution_type"] == "roc" for d in result.distributions)
    assert any(d["distribution_type"] in {"pref", "split", "catchup"} for d in result.distributions)


def test_run_hash_idempotent():
    assumptions = {
        "sale_price": Decimal("18000000"),
        "exit_date": "2028-12-31",
    }
    events = [
        {
            "date": date(2024, 1, 15),
            "event_type": "capital_call",
            "amount": Decimal("10000000"),
            "metadata": {"seed": True},
        },
        {
            "date": date(2028, 12, 31),
            "event_type": "sale_proceeds",
            "amount": Decimal("18000000"),
            "metadata": {"seed": True},
        },
    ]

    # use canonical input model expected by hash function
    from app.finance.waterfall_engine import CashflowEventInput, TierInput

    event_inputs = [
        CashflowEventInput(
            date=e["date"],
            event_type=e["event_type"],
            amount=e["amount"],
            metadata=e["metadata"],
        )
        for e in events
    ]
    tier_inputs = [TierInput(**t) for t in _tiers()]

    h1 = build_run_hash(assumptions=assumptions, events=event_inputs, tiers=tier_inputs)
    h2 = build_run_hash(assumptions=assumptions, events=event_inputs, tiers=tier_inputs)
    assert h1 == h2


def test_sale_assumption_generation():
    result = run_waterfall_engine(
        partners=_partners(),
        tiers=_tiers(),
        events=[
            {
                "date": date(2024, 1, 15),
                "event_type": "capital_call",
                "amount": Decimal("1000000"),
                "metadata": {},
            },
            {
                "date": date(2024, 2, 1),
                "event_type": "operating_cf",
                "amount": Decimal("90000"),
                "metadata": {},
            },
        ],
        assumptions={
            "sale_price": Decimal("2000000"),
            "exit_date": "2025-12-31",
            "disposition_fee": Decimal("0"),
        },
        distribution_frequency="monthly",
        promote_structure_type="american",
    )

    notes = result.summary_meta.get("generated_event_notes", [])
    assert "generated_sale_proceeds" in notes


def test_distribution_sums_match_distributable_cash():
    result = run_waterfall_engine(
        partners=_partners(),
        tiers=_tiers(),
        events=[
            {
                "date": date(2024, 1, 15),
                "event_type": "capital_call",
                "amount": Decimal("1000000"),
                "metadata": {},
            },
            {
                "date": date(2024, 6, 30),
                "event_type": "operating_cf",
                "amount": Decimal("120000"),
                "metadata": {},
            },
            {
                "date": date(2024, 9, 30),
                "event_type": "fee",
                "amount": Decimal("-20000"),
                "metadata": {},
            },
            {
                "date": date(2025, 1, 31),
                "event_type": "sale_proceeds",
                "amount": Decimal("1300000"),
                "metadata": {},
            },
        ],
        assumptions={},
        distribution_frequency="monthly",
        promote_structure_type="american",
    )

    distributed = sum((d["distribution_amount"] for d in result.distributions), Decimal("0"))
    distributable = Decimal(str(result.summary_meta["total_distributable_cash"]))

    # Fully allocated model: all distributable cash is assigned by tiers.
    assert abs(distributed - distributable) <= Decimal("0.00001")
