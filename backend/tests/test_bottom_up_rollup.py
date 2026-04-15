"""Tests for the investment + fund rollup layer.

Rollup service is exercised by replacing `build_asset_cf_series` and
`compute_asset_irr` with stubs so the tests don't depend on the full DB
fixture chain. That keeps them fast and lets us focus on the aggregation
math (ownership weighting, partial-null handling, leave-one-out contribution,
non-additivity).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

from app.services.bottom_up_cashflow import (
    CFPoint,
    IrrResult,
    quarter_end_date,
)
from app.services.bottom_up_rollup import (
    compute_fund_rollup,
    compute_investment_rollup,
    fund_rollup_payload,
)


def _point(q: str, amount: Decimal, **flags) -> CFPoint:
    return CFPoint(
        quarter=q,
        quarter_end_date=quarter_end_date(q),
        amount=amount,
        component_breakdown=flags.pop("breakdown", {}),
        has_actual=flags.get("has_actual", False),
        has_projection=flags.get("has_projection", False),
        has_exit=flags.get("has_exit", False),
        has_terminal_value=flags.get("has_terminal_value", False),
        warnings=flags.get("warnings", []),
    )


def _mk_asset_series(cost: Decimal, terminal: Decimal, *, exit_q: str = "2025-Q4") -> list[CFPoint]:
    """Synthetic 2-year, 8-quarter asset series with a clean positive IRR."""
    return [
        _point("2024-Q1", -cost, breakdown={"acquisition": -float(cost)}),
        _point("2024-Q2", cost * Decimal("0.01"), has_actual=True),
        _point("2024-Q3", cost * Decimal("0.01"), has_actual=True),
        _point("2024-Q4", cost * Decimal("0.01"), has_actual=True),
        _point("2025-Q1", cost * Decimal("0.01"), has_actual=True),
        _point("2025-Q2", cost * Decimal("0.01"), has_actual=True),
        _point("2025-Q3", cost * Decimal("0.01"), has_actual=True),
        _point(exit_q, terminal, has_exit=True, breakdown={"exit": {"amount": float(terminal)}}),
    ]


def _mock_asset_lookups(assets_by_id: dict[UUID, dict]):
    """Patch the service-level helpers so tests are DB-free.

    Each asset row carries:
      - series: list[CFPoint]
      - irr: IrrResult
      - ownership: Decimal (constant) OR callable(date) -> Decimal
    """

    def fake_build(asset_id, as_of_quarter, *, env_default_cap_rate=None):
        return list(assets_by_id[UUID(str(asset_id))]["series"])

    def fake_compute(asset_id, as_of_quarter, *, env_default_cap_rate=None, series=None):
        return assets_by_id[UUID(str(asset_id))]["irr"]

    def fake_resolve(asset_id, as_of):
        entry = assets_by_id[UUID(str(asset_id))]["ownership"]
        return entry(as_of) if callable(entry) else Decimal(str(entry))

    return [
        patch("app.services.bottom_up_rollup.build_asset_cf_series", fake_build),
        patch("app.services.bottom_up_rollup.compute_asset_irr", fake_compute),
        patch("app.services.bottom_up_rollup.resolve_ownership_pct", fake_resolve),
    ]


def _list_investments_for_fund(fund_id_to_invs):
    from contextlib import contextmanager

    class _Cur:
        def __init__(self, q: list):
            self._q = q

        def execute(self, sql, params=None):
            return None

        def fetchall(self):
            return self._q

        def fetchone(self):
            return self._q[0] if self._q else None

    @contextmanager
    def _ctx():
        # Single-shot: this mock is only used for _list_fund_investments.
        yield _Cur([])

    return _ctx


# ---------------------------------------------------------------------------
# Investment rollup
# ---------------------------------------------------------------------------


def test_investment_rollup_sums_ownership_weighted_assets(fake_cursor):
    a1 = uuid4()
    a2 = uuid4()
    inv_id = uuid4()

    # Cursor: _list_investment_assets returns both.
    fake_cursor.push_result(
        [
            {"asset_id": str(a1), "name": "Asset A", "acquisition_date": date(2024, 1, 15)},
            {"asset_id": str(a2), "name": "Asset B", "acquisition_date": date(2024, 1, 15)},
        ]
    )

    assets = {
        a1: {
            "series": _mk_asset_series(Decimal("10000000"), Decimal("12000000")),
            "irr": IrrResult(
                value=Decimal("0.150000"), null_reason=None, cashflow_count=8,
                has_exit=True, has_terminal_value=False,
            ),
            "ownership": Decimal("1.0"),
        },
        a2: {
            "series": _mk_asset_series(Decimal("5000000"), Decimal("6500000")),
            "irr": IrrResult(
                value=Decimal("0.180000"), null_reason=None, cashflow_count=8,
                has_exit=True, has_terminal_value=False,
            ),
            "ownership": Decimal("0.5"),
        },
    }

    with _mock_asset_lookups(assets)[0], _mock_asset_lookups(assets)[1], _mock_asset_lookups(assets)[2]:
        roll = compute_investment_rollup(inv_id, "2025-Q4")

    assert roll.irr is not None
    assert roll.null_reason is None
    assert len(roll.asset_contributions) == 2
    # 50% ownership on A2: its Q1 outflow (-5M) scaled to -2.5M;
    # combined with A1 outflow -10M → expect ~-12.5M at 2024-Q1.
    points_by_q = {p.quarter: p for p in roll.series}
    assert points_by_q["2024-Q1"].amount == Decimal("-12500000")
    # IRR should sit between the two standalone IRRs.
    assert Decimal("0.13") <= roll.irr <= Decimal("0.18")


def test_investment_rollup_fails_closed_when_all_children_null(fake_cursor):
    a1 = uuid4()
    inv_id = uuid4()

    fake_cursor.push_result(
        [{"asset_id": str(a1), "name": "Sparse", "acquisition_date": None}]
    )

    assets = {
        a1: {
            "series": [],
            "irr": IrrResult(
                value=None, null_reason="missing_acquisition", cashflow_count=0,
                has_exit=False, has_terminal_value=False,
            ),
            "ownership": Decimal("1.0"),
        }
    }
    with _mock_asset_lookups(assets)[0], _mock_asset_lookups(assets)[1], _mock_asset_lookups(assets)[2]:
        roll = compute_investment_rollup(inv_id, "2025-Q4")
    assert roll.irr is None
    assert roll.null_reason == "all_children_null"


def test_investment_rollup_partial_null_does_not_poison_parent(fake_cursor):
    """One null child alongside a healthy one — parent IRR still computes."""
    a1 = uuid4()  # healthy
    a2 = uuid4()  # sparse
    inv_id = uuid4()

    fake_cursor.push_result(
        [
            {"asset_id": str(a1), "name": "Healthy", "acquisition_date": date(2024, 1, 15)},
            {"asset_id": str(a2), "name": "Sparse", "acquisition_date": None},
        ]
    )
    assets = {
        a1: {
            "series": _mk_asset_series(Decimal("10000000"), Decimal("13000000")),
            "irr": IrrResult(value=Decimal("0.18"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
        a2: {
            "series": [],
            "irr": IrrResult(value=None, null_reason="missing_acquisition", cashflow_count=0,
                             has_exit=False, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
    }
    with _mock_asset_lookups(assets)[0], _mock_asset_lookups(assets)[1], _mock_asset_lookups(assets)[2]:
        roll = compute_investment_rollup(inv_id, "2025-Q4")

    assert roll.irr is not None
    contribs_by_id = {c.asset_id: c for c in roll.asset_contributions}
    assert contribs_by_id[a1].asset_null_reason is None
    assert contribs_by_id[a2].asset_null_reason == "missing_acquisition"


def test_ownership_effective_date_mid_hold_changes_irr(fake_cursor):
    """Ownership stepping from 100% to 50% at 2024-Q4 end must change the
    investment IRR vs. a naive single-percent rollup."""
    a1 = uuid4()
    inv_id = uuid4()

    fake_cursor.push_result(
        [{"asset_id": str(a1), "name": "Stepper", "acquisition_date": date(2024, 1, 15)}]
    )

    step_date = date(2024, 12, 31)

    def stepped(asof: date) -> Decimal:
        return Decimal("1.0") if asof <= step_date else Decimal("0.5")

    assets_stepped = {
        a1: {
            "series": _mk_asset_series(Decimal("10000000"), Decimal("13000000")),
            "irr": IrrResult(value=Decimal("0.18"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": stepped,
        }
    }
    with _mock_asset_lookups(assets_stepped)[0], _mock_asset_lookups(assets_stepped)[1], _mock_asset_lookups(assets_stepped)[2]:
        roll_stepped = compute_investment_rollup(inv_id, "2025-Q4")

    # Re-run fresh with constant 100% ownership for the comparison.
    fake_cursor.push_result(
        [{"asset_id": str(a1), "name": "Stepper", "acquisition_date": date(2024, 1, 15)}]
    )
    assets_const = {
        a1: {**assets_stepped[a1], "ownership": Decimal("1.0")},
    }
    with _mock_asset_lookups(assets_const)[0], _mock_asset_lookups(assets_const)[1], _mock_asset_lookups(assets_const)[2]:
        roll_const = compute_investment_rollup(inv_id, "2025-Q4")

    assert roll_stepped.irr is not None
    assert roll_const.irr is not None
    # With a 50% cut-in mid-hold, the weighted exit amount falls → IRR differs.
    assert roll_stepped.irr != roll_const.irr


# ---------------------------------------------------------------------------
# Fund rollup + non-additive contribution
# ---------------------------------------------------------------------------


def test_fund_rollup_contribution_is_non_additive(fake_cursor):
    """sum(irr_marginal_bps) must NOT equal fund_irr * 10000."""
    a1 = uuid4()
    a2 = uuid4()
    a3 = uuid4()
    inv_id = uuid4()
    fund_id = uuid4()

    # list_fund_investments → one investment.
    fake_cursor.push_result([{"investment_id": str(inv_id), "name": "Deal 1"}])
    # list_investment_assets → three assets.
    fake_cursor.push_result(
        [
            {"asset_id": str(a1), "name": "A1", "acquisition_date": date(2024, 1, 15)},
            {"asset_id": str(a2), "name": "A2", "acquisition_date": date(2024, 1, 15)},
            {"asset_id": str(a3), "name": "A3", "acquisition_date": date(2024, 1, 15)},
        ]
    )

    assets = {
        a1: {
            "series": _mk_asset_series(Decimal("10000000"), Decimal("13500000")),
            "irr": IrrResult(value=Decimal("0.20"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
        a2: {
            "series": _mk_asset_series(Decimal("6000000"), Decimal("7500000")),
            "irr": IrrResult(value=Decimal("0.15"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
        a3: {
            "series": _mk_asset_series(Decimal("4000000"), Decimal("4800000")),
            "irr": IrrResult(value=Decimal("0.12"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
    }
    with _mock_asset_lookups(assets)[0], _mock_asset_lookups(assets)[1], _mock_asset_lookups(assets)[2]:
        roll = compute_fund_rollup(fund_id, "2025-Q4")

    assert roll.irr is not None
    marginals = [
        c.irr_marginal_bps for c in roll.asset_contributions if c.irr_marginal_bps is not None
    ]
    assert len(marginals) == 3
    total_marginal_bps = sum(marginals)
    fund_bps = float(roll.irr) * 10000
    # Non-additive: the sum MUST NOT equal the total. Guardrail against future
    # "helpful" normalization.
    assert abs(total_marginal_bps - fund_bps) > 50, (
        f"Marginal contributions summed to {total_marginal_bps} bps vs fund {fund_bps} bps — "
        "within 50bps looks suspiciously additive."
    )


def test_fund_rollup_fails_closed_when_no_investments(fake_cursor):
    fake_cursor.push_result([])  # no investments
    roll = compute_fund_rollup(uuid4(), "2025-Q4")
    assert roll.irr is None
    assert roll.null_reason == "no_investments"


def test_payload_shape_exposes_ui_contract(fake_cursor):
    """Payload keys the UI reads must stay stable."""
    a1 = uuid4()
    inv_id = uuid4()
    fund_id = uuid4()

    fake_cursor.push_result([{"investment_id": str(inv_id), "name": "Deal 1"}])
    fake_cursor.push_result(
        [{"asset_id": str(a1), "name": "A1", "acquisition_date": date(2024, 1, 15)}]
    )
    assets = {
        a1: {
            "series": _mk_asset_series(Decimal("10000000"), Decimal("13000000")),
            "irr": IrrResult(value=Decimal("0.18"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        }
    }
    with _mock_asset_lookups(assets)[0], _mock_asset_lookups(assets)[1], _mock_asset_lookups(assets)[2]:
        roll = compute_fund_rollup(fund_id, "2025-Q4")
    payload = fund_rollup_payload(roll)

    for k in (
        "fund_id", "as_of_quarter", "series", "gross_irr_bottom_up", "null_reason",
        "investment_contributions", "irr_contribution", "non_additive",
    ):
        assert k in payload, f"missing key {k}"
    assert payload["non_additive"] is True
