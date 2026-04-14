"""Paper-test the Granite Peak bottom-up seed: the exact cash flows in
repo-b/db/schema/508_granite_peak_bottom_up_seed.sql fed through compute_asset_irr
must produce believable asset IRRs (high teens / low 20s), not flashy hero numbers.

These tests are deliberately decoupled from the DB so they catch seed drift
without requiring a live Postgres. If someone edits the seed, they must also
update this fixture to match or the test fails — by design.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services.bottom_up_cashflow import (
    CFPoint,
    compute_asset_irr,
    quarter_end_date,
)


def _operating_cf(
    q: str, *, revenue: int, other: int, opex: int, capex: int, debt: int
) -> CFPoint:
    amt = Decimal(revenue + other - opex - capex - debt)
    return CFPoint(
        quarter=q,
        quarter_end_date=quarter_end_date(q),
        amount=amt,
        component_breakdown={
            "operating_actual": [
                {"noi": float(revenue + other - opex), "capex": float(capex), "debt_service": float(debt)}
            ]
        },
        has_actual=True,
    )


def test_granite_peak_asset1_realized_exit_is_high_teens_low_twenties():
    """Granite Peak Crossing Apartments — acquired 2022-02-15, sold 2024-Q1.

    Expected IRR: ~17-22%. If the seed is tuned to produce something outside
    this band, either the seed drifted or the engine changed — investigate.
    """
    acq = CFPoint(
        quarter="2022-Q1",
        quarter_end_date=date(2022, 3, 31),
        amount=Decimal("-25000000"),
        component_breakdown={"acquisition": -25000000},
    )
    # 8 quarters from 2022-Q2 through 2024-Q1. Last one bundles exit.
    ops = [
        _operating_cf("2022-Q2", revenue=1350000, other=25000, opex=450000, capex=40000, debt=480000),
        _operating_cf("2022-Q3", revenue=1370000, other=27000, opex=460000, capex=35000, debt=480000),
        _operating_cf("2022-Q4", revenue=1400000, other=28000, opex=470000, capex=30000, debt=480000),
        _operating_cf("2023-Q1", revenue=1430000, other=30000, opex=480000, capex=45000, debt=480000),
        _operating_cf("2023-Q2", revenue=1460000, other=32000, opex=490000, capex=25000, debt=480000),
        _operating_cf("2023-Q3", revenue=1490000, other=34000, opex=500000, capex=20000, debt=480000),
        _operating_cf("2023-Q4", revenue=1510000, other=35000, opex=505000, capex=30000, debt=480000),
    ]
    # 2024-Q1: operating + exit.
    op_q1 = _operating_cf("2024-Q1", revenue=1530000, other=36000, opex=510000, capex=25000, debt=480000)
    exit_amt = Decimal("30500000")
    op_q1.amount += exit_amt
    op_q1.has_exit = True
    op_q1.component_breakdown["exit"] = {"status": "realized", "amount": float(exit_amt)}

    series = [acq] + ops + [op_q1]
    result = compute_asset_irr(uuid4(), "2024-Q1", series=series)

    assert result.value is not None
    assert result.null_reason is None
    assert result.has_exit is True
    # The believable-IRR guardrail. Tighten only if seed is deliberately retuned.
    assert Decimal("0.17") <= result.value <= Decimal("0.22"), (
        f"Granite Peak Crossing IRR {result.value} outside believable band "
        f"[0.17, 0.22] — seed or engine drift?"
    )


def test_granite_peak_asset2_pre_exit_nav_irr_is_mid_teens():
    """Cedar Bluff Industrial — acquired 2023-05-10, pre-exit at 2026-Q1
    with authoritative NAV terminal value of $22.5M."""
    acq = CFPoint(
        quarter="2023-Q2",
        quarter_end_date=date(2023, 6, 30),
        amount=Decimal("-18000000"),
        component_breakdown={"acquisition": -18000000},
    )
    ops = [
        _operating_cf("2023-Q3", revenue=780000, other=8000, opex=195000, capex=25000, debt=275000),
        _operating_cf("2023-Q4", revenue=790000, other=8000, opex=198000, capex=20000, debt=275000),
        _operating_cf("2024-Q1", revenue=800000, other=8000, opex=200000, capex=30000, debt=275000),
        _operating_cf("2024-Q2", revenue=810000, other=8500, opex=202000, capex=20000, debt=275000),
        _operating_cf("2024-Q3", revenue=820000, other=9000, opex=205000, capex=25000, debt=275000),
        _operating_cf("2024-Q4", revenue=835000, other=9000, opex=208000, capex=30000, debt=275000),
        _operating_cf("2025-Q1", revenue=845000, other=9500, opex=210000, capex=25000, debt=275000),
        _operating_cf("2025-Q2", revenue=860000, other=10000, opex=213000, capex=20000, debt=275000),
        _operating_cf("2025-Q3", revenue=870000, other=10000, opex=215000, capex=25000, debt=275000),
        _operating_cf("2025-Q4", revenue=880000, other=10500, opex=217000, capex=30000, debt=275000),
    ]
    op_q1 = _operating_cf("2026-Q1", revenue=890000, other=11000, opex=220000, capex=25000, debt=275000)
    nav_amt = Decimal("22500000")
    op_q1.amount += nav_amt
    op_q1.has_terminal_value = True
    op_q1.component_breakdown["terminal_value"] = {
        "kind": "terminal_value",
        "source": "authoritative_nav",
        "amount": float(nav_amt),
    }

    series = [acq] + ops + [op_q1]
    result = compute_asset_irr(uuid4(), "2026-Q1", series=series)

    assert result.value is not None
    assert result.has_terminal_value is True
    assert result.has_exit is False
    # Industrial hold, mid-teens target.
    assert Decimal("0.11") <= result.value <= Decimal("0.17"), (
        f"Cedar Bluff Industrial IRR {result.value} outside believable band [0.11, 0.17]"
    )


def test_granite_peak_asset3_noi_cap_terminal_is_mid_to_high_teens():
    """Sunbelt Logistics Park — acquired 2023-11-05 at 6.5% entry cap,
    pre-exit at 2026-Q1 via NOI/cap-rate terminal value (projected cap rate
    6.75%, TTM NOI ≈ $2.87M → terminal ≈ $42.5M). Believable for a
    Class-A industrial park with modest NOI growth."""
    acq = CFPoint(
        quarter="2023-Q4",
        quarter_end_date=date(2023, 12, 31),
        amount=Decimal("-32000000"),
        component_breakdown={"acquisition": -32000000},
    )
    ops = [
        _operating_cf("2024-Q1", revenue=1080000, other=15000, opex=340000, capex=60000, debt=540000),
        _operating_cf("2024-Q2", revenue=1090000, other=15000, opex=343000, capex=40000, debt=540000),
        _operating_cf("2024-Q3", revenue=1100000, other=16000, opex=345000, capex=40000, debt=540000),
        _operating_cf("2024-Q4", revenue=1110000, other=16000, opex=348000, capex=50000, debt=540000),
        _operating_cf("2025-Q1", revenue=1120000, other=17000, opex=350000, capex=40000, debt=540000),
        _operating_cf("2025-Q2", revenue=1130000, other=17000, opex=353000, capex=35000, debt=540000),
        _operating_cf("2025-Q3", revenue=1140000, other=18000, opex=355000, capex=40000, debt=540000),
        _operating_cf("2025-Q4", revenue=1150000, other=18000, opex=358000, capex=45000, debt=540000),
    ]
    op_q1 = _operating_cf("2026-Q1", revenue=1160000, other=19000, opex=360000, capex=40000, debt=540000)
    # TTM NOI = revenue + other - opex for 2025-Q2..2026-Q1 inclusive.
    ttm_noi = (
        Decimal("1130000") + Decimal("17000") - Decimal("353000")  # 2025-Q2
        + Decimal("1140000") + Decimal("18000") - Decimal("355000")  # 2025-Q3
        + Decimal("1150000") + Decimal("18000") - Decimal("358000")  # 2025-Q4
        + Decimal("1160000") + Decimal("19000") - Decimal("360000")  # 2026-Q1
    )
    terminal = ttm_noi / Decimal("0.0675")
    op_q1.amount += terminal
    op_q1.has_terminal_value = True
    op_q1.component_breakdown["terminal_value"] = {
        "kind": "terminal_value",
        "source": "noi_cap_rate",
        "amount": float(terminal),
        "cap_rate": 0.0675,
    }

    series = [acq] + ops + [op_q1]
    result = compute_asset_irr(uuid4(), "2026-Q1", series=series)

    assert result.value is not None
    assert result.has_terminal_value is True
    # Sunbelt logistics, 6.5% entry → 6.75% exit cap: high-teens / low-twenties.
    assert Decimal("0.15") <= result.value <= Decimal("0.22"), (
        f"Sunbelt Logistics IRR {result.value} outside believable band [0.15, 0.22] "
        "— if above 0.22, seed is too aggressive; if below 0.15, something broke."
    )


def test_granite_peak_fund_gross_irr_is_believable_mid_teens():
    """Granite Peak Fund IV — asset-level gross bottom-up IRR from summing
    the three seeded assets' series (100% ownership each). Must land in the
    mid-teens to low-twenties band; if it drifts to 30%+ the seed is too hot,
    below 10% something broke."""
    from app.finance.irr_engine import xirr

    # Mirror the three asset series from the individual tests, unweighted
    # (100% ownership at the deal level for the demo fund).
    def _asset1():
        cfs: list[tuple[date, Decimal]] = [(date(2022, 3, 31), Decimal("-25000000"))]
        ops = [
            (2022, 2, 1350000, 25000, 450000, 40000, 480000),
            (2022, 3, 1370000, 27000, 460000, 35000, 480000),
            (2022, 4, 1400000, 28000, 470000, 30000, 480000),
            (2023, 1, 1430000, 30000, 480000, 45000, 480000),
            (2023, 2, 1460000, 32000, 490000, 25000, 480000),
            (2023, 3, 1490000, 34000, 500000, 20000, 480000),
            (2023, 4, 1510000, 35000, 505000, 30000, 480000),
        ]
        for y, q, rev, oth, op, cx, dbt in ops:
            cfs.append(
                (quarter_end_date(f"{y}-Q{q}"), Decimal(rev + oth - op - cx - dbt))
            )
        # Q1 2024: final operating + exit.
        final_op = 1530000 + 36000 - 510000 - 25000 - 480000
        cfs.append((date(2024, 3, 31), Decimal(final_op + 30500000)))
        return cfs

    def _asset2():
        cfs: list[tuple[date, Decimal]] = [(date(2023, 6, 30), Decimal("-18000000"))]
        ops = [
            (2023, 3, 780000, 8000, 195000, 25000, 275000),
            (2023, 4, 790000, 8000, 198000, 20000, 275000),
            (2024, 1, 800000, 8000, 200000, 30000, 275000),
            (2024, 2, 810000, 8500, 202000, 20000, 275000),
            (2024, 3, 820000, 9000, 205000, 25000, 275000),
            (2024, 4, 835000, 9000, 208000, 30000, 275000),
            (2025, 1, 845000, 9500, 210000, 25000, 275000),
            (2025, 2, 860000, 10000, 213000, 20000, 275000),
            (2025, 3, 870000, 10000, 215000, 25000, 275000),
            (2025, 4, 880000, 10500, 217000, 30000, 275000),
        ]
        for y, q, rev, oth, op, cx, dbt in ops:
            cfs.append(
                (quarter_end_date(f"{y}-Q{q}"), Decimal(rev + oth - op - cx - dbt))
            )
        final_op = 890000 + 11000 - 220000 - 25000 - 275000
        cfs.append((date(2026, 3, 31), Decimal(final_op + 22500000)))
        return cfs

    def _asset3():
        cfs: list[tuple[date, Decimal]] = [(date(2023, 12, 31), Decimal("-32000000"))]
        ops = [
            (2024, 1, 1080000, 15000, 340000, 60000, 540000),
            (2024, 2, 1090000, 15000, 343000, 40000, 540000),
            (2024, 3, 1100000, 16000, 345000, 40000, 540000),
            (2024, 4, 1110000, 16000, 348000, 50000, 540000),
            (2025, 1, 1120000, 17000, 350000, 40000, 540000),
            (2025, 2, 1130000, 17000, 353000, 35000, 540000),
            (2025, 3, 1140000, 18000, 355000, 40000, 540000),
            (2025, 4, 1150000, 18000, 358000, 45000, 540000),
        ]
        for y, q, rev, oth, op, cx, dbt in ops:
            cfs.append(
                (quarter_end_date(f"{y}-Q{q}"), Decimal(rev + oth - op - cx - dbt))
            )
        # Terminal at 2026-Q1 = TTM_NOI / 0.0675.
        ttm_noi = Decimal(
            (1130000 + 17000 - 353000)
            + (1140000 + 18000 - 355000)
            + (1150000 + 18000 - 358000)
            + (1160000 + 19000 - 360000)
        )
        terminal = ttm_noi / Decimal("0.0675")
        final_op = 1160000 + 19000 - 360000 - 40000 - 540000
        cfs.append((date(2026, 3, 31), Decimal(final_op) + terminal))
        return cfs

    merged: dict[date, Decimal] = {}
    for cfs in (_asset1(), _asset2(), _asset3()):
        for d, amt in cfs:
            merged[d] = merged.get(d, Decimal(0)) + amt

    fund_cfs = sorted(merged.items())
    irr = xirr(fund_cfs)
    assert irr is not None
    irr_dec = Decimal(str(irr))
    # Granite Peak fund-level gross IRR: expect mid-teens given the asset mix.
    assert Decimal("0.10") <= irr_dec <= Decimal("0.22"), (
        f"Granite Peak fund gross IRR {irr_dec} outside believable band "
        f"[0.10, 0.22] — seed or engine drift?"
    )
