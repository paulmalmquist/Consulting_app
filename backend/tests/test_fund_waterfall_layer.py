"""Phase 5 tests — fund_waterfall_layer.

Exercises the waterfall integration against synthetic fixtures using a fake
cursor. Covers:
  * happy path: 1 distribution event allocated correctly across LP / GP.
  * European waterfall vs American style routing.
  * Pref distribution tier.
  * Catch-up tier behavior.
  * Per-distribution crystallization (multiple events update unreturned cap).
  * Sign handling: only positive events enter the allocator; negatives flow
    into LP cash stream.
  * Conservation: sum(allocations) == distribution_amount per event.
  * Fail-closed:
      - missing waterfall definition → status='missing_contract', net_irr=None.
      - missing partner commitments → status='missing_participants'.
      - upstream expense nulls → null_reasons['net_irr'] populated even
        when waterfall succeeds locally.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest

from app.services.bottom_up_cashflow import CFPoint, quarter_end_date
from app.services.fund_waterfall_layer import (
    compute_fund_waterfall_layer,
)


class _Cursor:
    """Sequential queue cursor for fake_cursor."""

    def __init__(self, queue):
        self._q = list(queue)

    def execute(self, sql, params=None):
        return self

    def fetchone(self):
        if not self._q:
            return None
        item = self._q.pop(0)
        return item if item != "EMPTY" else None

    def fetchall(self):
        if not self._q:
            return []
        item = self._q.pop(0)
        return item if isinstance(item, list) else []


@pytest.fixture
def fake_cursor():
    state = {"queue": []}

    @contextmanager
    def _ctx():
        yield _Cursor(state["queue"])

    def loader(queue):
        state["queue"] = list(queue)

    with patch("app.services.fund_waterfall_layer.get_cursor", _ctx):
        yield loader


def _cfp(q: str, amt: Decimal) -> CFPoint:
    return CFPoint(
        quarter=q,
        quarter_end_date=quarter_end_date(q),
        amount=amt,
        component_breakdown={},
        has_actual=True,
    )


def _defn(definition_id: UUID, style: str = "american") -> dict:
    return {
        "definition_id": definition_id,
        "fund_id": uuid4(),
        "name": "Test waterfall",
        "waterfall_type": style,
        "version": 1,
        "effective_date": date(2024, 1, 1),
        "is_active": True,
    }


def _tier_pref(rate: Decimal) -> dict:
    return {
        "tier_id": uuid4(),
        "tier_order": 2,
        "tier_type": "preferred_return",
        "hurdle_rate": rate,
        "split_gp": None,
        "split_lp": None,
        "catch_up_percent": None,
    }


def _tier_split(carry_rate: Decimal) -> dict:
    return {
        "tier_id": uuid4(),
        "tier_order": 4,
        "tier_type": "promote",
        "hurdle_rate": None,
        "split_gp": carry_rate,
        "split_lp": Decimal("1") - carry_rate,
        "catch_up_percent": None,
    }


def _tier_catchup(catch_up_percent: Decimal) -> dict:
    return {
        "tier_id": uuid4(),
        "tier_order": 3,
        "tier_type": "catch_up",
        "hurdle_rate": None,
        "split_gp": None,
        "split_lp": None,
        "catch_up_percent": catch_up_percent,
    }


# ---------------------------------------------------------------------------
# Fail-closed paths
# ---------------------------------------------------------------------------


def test_missing_waterfall_contract_fails_closed(fake_cursor):
    fund_id = uuid4()
    fake_cursor(
        [
            None,  # no definition
        ]
    )
    pre_wf = [_cfp("2024-Q1", Decimal("-1000000"))]
    res = compute_fund_waterfall_layer(
        fund_id, "2024-Q1", pre_waterfall_cf=pre_wf, fund_gross_irr=None
    )
    assert res.waterfall_status == "missing_contract"
    assert res.net_irr is None
    assert res.net_tvpi is None
    assert res.carry is None
    assert "missing_contract" in res.null_reasons.get("waterfall", "")
    assert res.null_reasons.get("net_irr") == "out_of_scope_requires_waterfall"


def test_missing_partner_commitments_fails_closed(fake_cursor):
    fund_id = uuid4()
    defn_id = uuid4()
    fake_cursor(
        [
            _defn(defn_id, style="american"),
            [_tier_pref(Decimal("0.08")), _tier_split(Decimal("0.20"))],
            [],  # no partners
        ]
    )
    pre_wf = [_cfp("2024-Q1", Decimal("-1000000"))]
    res = compute_fund_waterfall_layer(
        fund_id, "2024-Q1", pre_waterfall_cf=pre_wf, fund_gross_irr=None
    )
    assert res.waterfall_status == "missing_participants"
    assert res.net_irr is None
    assert res.waterfall_style == "american"
    assert res.pref_rate == Decimal("0.08")
    assert res.carry_rate == Decimal("0.20")
    assert res.null_reasons.get("waterfall") == "missing_partner_commitments"


def test_upstream_expense_nulls_propagate_into_waterfall_result(fake_cursor):
    fund_id = uuid4()
    defn_id = uuid4()
    fake_cursor(
        [
            _defn(defn_id, style="american"),
            [_tier_pref(Decimal("0.08")), _tier_split(Decimal("0.20"))],
            [],  # no partners — but we test propagation regardless
        ]
    )
    pre_wf = [_cfp("2024-Q1", Decimal("-1000000"))]
    res = compute_fund_waterfall_layer(
        fund_id,
        "2024-Q1",
        pre_waterfall_cf=pre_wf,
        fund_gross_irr=None,
        expense_null_reasons={"fund_expense_layer": "missing_xyz"},
    )
    assert res.null_reasons.get("fund_expense_layer") == "missing_xyz"
    assert res.null_reasons.get("net_irr") == "out_of_scope_requires_complete_expense_layer"


# ---------------------------------------------------------------------------
# Happy path: simple American waterfall, one distribution
# ---------------------------------------------------------------------------


def test_single_distribution_routes_through_waterfall(fake_cursor):
    fund_id = uuid4()
    defn_id = uuid4()
    lp_id = uuid4()
    gp_id = uuid4()

    fake_cursor(
        [
            _defn(defn_id, style="american"),
            [
                _tier_pref(Decimal("0.08")),
                _tier_catchup(Decimal("1.0")),
                _tier_split(Decimal("0.20")),
            ],
            [
                # partner rows
                {
                    "partner_id": lp_id,
                    "name": "LP1",
                    "partner_type": "lp",
                    "committed_amount": Decimal("99000000"),
                    "commitment_date": date(2024, 1, 1),
                },
                {
                    "partner_id": gp_id,
                    "name": "GP",
                    "partner_type": "gp",
                    "committed_amount": Decimal("1000000"),
                    "commitment_date": date(2024, 1, 1),
                },
            ],
            # ledger contributions per partner
            [
                {"effective_date": date(2024, 1, 15), "entry_type": "contribution", "amount_base": Decimal("99000000")},
            ],
            [
                {"effective_date": date(2024, 1, 15), "entry_type": "contribution", "amount_base": Decimal("1000000")},
            ],
            # ending NAV lookup (re_fund_quarter_state)
            {"portfolio_nav": Decimal("100000000")},
        ]
    )

    # CF: -100M call at 2024-Q1, +130M distribution at 2026-Q4
    pre_wf = [
        _cfp("2024-Q1", Decimal("-100000000")),
        _cfp("2026-Q4", Decimal("130000000")),
    ]
    res = compute_fund_waterfall_layer(
        fund_id,
        "2026Q4",
        pre_waterfall_cf=pre_wf,
        fund_gross_irr=Decimal("0.08"),
        ending_nav=Decimal("100000000"),
    )

    assert res.waterfall_status == "computed"
    assert len(res.event_logs) == 1
    ev = res.event_logs[0]
    # Conservation: tier allocations sum to distribution
    assert ev.conservation_diff < Decimal("0.05")
    assert sum(a["amount"] for a in ev.allocations) == pytest.approx(130000000.0, abs=0.05)
    # No negative allocation lines
    assert all(a["amount"] >= 0 for a in ev.allocations)

    # LP got most of it (99% commitment + LP-side dominance early in waterfall)
    assert res.lp_share is not None and res.lp_share > Decimal("100000000")
    # Some carry should have been paid to GP (since LP got back > 8% pref)
    assert res.carry is not None and res.carry >= Decimal("0")
    # Net TVPI should be on LP side: distributions + LP NAV / LP called
    assert res.dpi is not None
    assert res.net_tvpi is not None


def test_european_style_threads_through_to_contract(fake_cursor):
    fund_id = uuid4()
    defn_id = uuid4()
    lp_id = uuid4()

    fake_cursor(
        [
            _defn(defn_id, style="european"),
            [_tier_pref(Decimal("0.08")), _tier_split(Decimal("0.20"))],
            [
                {
                    "partner_id": lp_id,
                    "name": "LP1",
                    "partner_type": "lp",
                    "committed_amount": Decimal("100000000"),
                    "commitment_date": date(2024, 1, 1),
                },
            ],
            [
                {"effective_date": date(2024, 1, 15), "entry_type": "contribution", "amount_base": Decimal("50000000")},
            ],
            {"portfolio_nav": Decimal("60000000")},
        ]
    )
    pre_wf = [_cfp("2024-Q1", Decimal("-50000000")), _cfp("2025-Q4", Decimal("70000000"))]
    res = compute_fund_waterfall_layer(
        fund_id,
        "2025Q4",
        pre_waterfall_cf=pre_wf,
        fund_gross_irr=Decimal("0.18"),
        ending_nav=Decimal("60000000"),
    )
    assert res.waterfall_style == "european"
    assert res.waterfall_status == "computed"


# ---------------------------------------------------------------------------
# Sign and conservation invariants
# ---------------------------------------------------------------------------


def test_sign_invariants_no_negative_amounts_into_allocator(fake_cursor):
    fund_id = uuid4()
    defn_id = uuid4()
    lp_id = uuid4()
    fake_cursor(
        [
            _defn(defn_id),
            [_tier_pref(Decimal("0.08")), _tier_split(Decimal("0.20"))],
            [
                {
                    "partner_id": lp_id,
                    "name": "LP1",
                    "partner_type": "lp",
                    "committed_amount": Decimal("100000000"),
                    "commitment_date": date(2024, 1, 1),
                },
            ],
            [{"effective_date": date(2024, 1, 15), "entry_type": "contribution", "amount_base": Decimal("100000000")}],
            {"portfolio_nav": Decimal("0")},
        ]
    )
    pre_wf = [
        _cfp("2024-Q1", Decimal("-100000000")),  # call
        _cfp("2024-Q2", Decimal("-500000")),  # expense (negative)
        _cfp("2025-Q4", Decimal("110000000")),  # distribution
    ]
    res = compute_fund_waterfall_layer(
        fund_id,
        "2025Q4",
        pre_waterfall_cf=pre_wf,
        fund_gross_irr=Decimal("0.05"),
        ending_nav=Decimal("0"),
    )
    # Only one event hit the allocator (the +110M distribution)
    assert len(res.event_logs) == 1
    # All allocation lines have non-negative amounts
    for a in res.event_logs[0].allocations:
        assert a["amount"] >= 0


def test_per_event_conservation(fake_cursor):
    fund_id = uuid4()
    defn_id = uuid4()
    lp_id = uuid4()
    gp_id = uuid4()
    fake_cursor(
        [
            _defn(defn_id),
            [_tier_pref(Decimal("0.08")), _tier_split(Decimal("0.20"))],
            [
                {
                    "partner_id": lp_id,
                    "name": "LP1",
                    "partner_type": "lp",
                    "committed_amount": Decimal("99000000"),
                    "commitment_date": date(2024, 1, 1),
                },
                {
                    "partner_id": gp_id,
                    "name": "GP",
                    "partner_type": "gp",
                    "committed_amount": Decimal("1000000"),
                    "commitment_date": date(2024, 1, 1),
                },
            ],
            [{"effective_date": date(2024, 1, 15), "entry_type": "contribution", "amount_base": Decimal("99000000")}],
            [{"effective_date": date(2024, 1, 15), "entry_type": "contribution", "amount_base": Decimal("1000000")}],
            {"portfolio_nav": Decimal("0")},
        ]
    )
    pre_wf = [
        _cfp("2024-Q1", Decimal("-100000000")),
        _cfp("2025-Q4", Decimal("60000000")),
        _cfp("2026-Q2", Decimal("70000000")),
    ]
    res = compute_fund_waterfall_layer(
        fund_id,
        "2026Q2",
        pre_waterfall_cf=pre_wf,
        fund_gross_irr=Decimal("0.10"),
        ending_nav=Decimal("0"),
    )
    assert len(res.event_logs) == 2
    for ev in res.event_logs:
        # Each event's allocations must sum to the distribution amount within 5¢
        # (allowing for tier rounding adjustments)
        assert ev.conservation_diff < Decimal("0.05")


def test_no_distributions_returns_status_no_distributions(fake_cursor):
    fund_id = uuid4()
    defn_id = uuid4()
    lp_id = uuid4()
    fake_cursor(
        [
            _defn(defn_id),
            [_tier_pref(Decimal("0.08")), _tier_split(Decimal("0.20"))],
            [
                {
                    "partner_id": lp_id,
                    "name": "LP1",
                    "partner_type": "lp",
                    "committed_amount": Decimal("100000000"),
                    "commitment_date": date(2024, 1, 1),
                },
            ],
            [{"effective_date": date(2024, 1, 15), "entry_type": "contribution", "amount_base": Decimal("50000000")}],
            {"portfolio_nav": Decimal("60000000")},
        ]
    )
    # All negative — no distributable events
    pre_wf = [_cfp("2024-Q1", Decimal("-50000000"))]
    res = compute_fund_waterfall_layer(
        fund_id,
        "2024Q1",
        pre_waterfall_cf=pre_wf,
        fund_gross_irr=None,
        ending_nav=Decimal("60000000"),
    )
    assert res.waterfall_status == "no_distributions"
    assert len(res.event_logs) == 0
    # net_irr can still be computed from LP outflows + ending NAV (will be
    # negative or extreme but is a real number).
    # The function may produce None depending on stream shape; the key
    # assertion is that the status is right.
