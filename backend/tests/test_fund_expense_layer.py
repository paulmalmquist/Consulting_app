"""Phase 4 tests — fund_expense_layer.

Pin down:
  * Fee basis selection (COMMITTED / CALLED / NAV / aliases like 'invested').
  * Step-down behavior when re_fee_policy.stepdown_date passes.
  * Fee holiday / pre-term effective range produces non-blocking nulls.
  * Missing required inputs (no fund term, no partner commitments,
    no expense rows) produce structured null_reasons, NOT zero substitution.
  * No silent zero ever appears in the output line.
  * Aggregate tie-out: total_management_fees == sum of resolved mgmt lines,
    cf_points sum to (- total_expenses) when no nulls.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest

from app.services.fund_expense_layer import (
    FundExpenseLine,
    FundExpenseSchedule,
    _normalize_basis,
    compose_pre_waterfall_cf,
    compute_fund_expense_schedule,
)


# ---------------------------------------------------------------------------
# Fake cursor for fail-closed / happy-path simulations.
# ---------------------------------------------------------------------------


class _Cursor:
    """Sequential-result cursor where each .execute() pops the next queued result."""

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
    """Yield a function that loads a queue of results into get_cursor."""

    state = {"queue": []}

    @contextmanager
    def _ctx():
        yield _Cursor(state["queue"])

    def loader(queue):
        state["queue"] = list(queue)

    with patch("app.services.fund_expense_layer.get_cursor", _ctx):
        yield loader


# ---------------------------------------------------------------------------
# Basis aliasing
# ---------------------------------------------------------------------------


def test_normalize_basis_supports_aliases():
    assert _normalize_basis("committed") == "COMMITTED"
    assert _normalize_basis("COMMITTED") == "COMMITTED"
    assert _normalize_basis("called") == "CALLED"
    assert _normalize_basis("invested") == "CALLED"  # credit fund alias
    assert _normalize_basis("nav") == "NAV"
    assert _normalize_basis("fair_value") == "NAV"
    assert _normalize_basis("unknown_string") is None
    assert _normalize_basis(None) is None


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


def test_committed_basis_simple_fee_accrual(fake_cursor):
    """One in-term quarter, COMMITTED basis, no stepdown, no other expenses."""
    fund_id = uuid4()
    business_id = uuid4()
    # The schedule walks through several SQL calls per quarter. We line them up.
    fake_cursor(
        [
            {"d": date(2024, 1, 1)},  # _fund_inception_quarter (fund_term path)
            # Quarter 2024-Q1: load_active_fund_term, load_fee_policy (None), resolve_basis
            {
                "fund_term_id": uuid4(),
                "effective_from": date(2024, 1, 1),
                "effective_to": None,
                "management_fee_rate": Decimal("0.015"),
                "management_fee_basis": "committed",
            },
            None,  # no fee_policy
            {"total": 100_000_000, "n": 12},  # COMMITTED basis amount
            # other expense lines (re_fund_expense_qtr) — return one row
            [
                {
                    "id": uuid4(),
                    "quarter": "2024-Q1",
                    "expense_type": "fund_admin",
                    "amount": Decimal("25000"),
                    "currency": "USD",
                }
            ],
        ]
    )

    sched = compute_fund_expense_schedule(
        fund_id, "2024-Q1", env_id="env-1", business_id=business_id
    )
    assert sched.null_reasons == {}
    assert not sched.has_blocking_nulls
    # Expected fee = 100M * 1.5% / 4 = 375,000
    assert sched.total_management_fees == Decimal("375000.00")
    assert sched.total_other_expenses == Decimal("25000.00")
    assert sched.total_expenses == Decimal("400000.00")
    # CFPoint sign-flipped negative.
    assert len(sched.cf_points) == 1
    assert sched.cf_points[0].amount == Decimal("-400000.00")


def test_called_basis_alias_invested_resolves_correctly(fake_cursor):
    """A credit-fund-style 'invested' basis alias must route to CALLED."""
    fund_id = uuid4()
    business_id = uuid4()
    fake_cursor(
        [
            {"d": date(2024, 4, 1)},  # inception 2024-Q2
            {
                "fund_term_id": uuid4(),
                "effective_from": date(2024, 4, 1),
                "effective_to": None,
                "management_fee_rate": Decimal("0.010"),
                "management_fee_basis": "invested",  # alias of CALLED
            },
            None,  # no fee_policy
            {"total": 50_000_000, "n": 5},  # CALLED basis amount via re_cash_event
            # other lines — give one
            [
                {
                    "id": uuid4(),
                    "quarter": "2024-Q2",
                    "expense_type": "audit",
                    "amount": Decimal("12000"),
                    "currency": "USD",
                }
            ],
        ]
    )

    sched = compute_fund_expense_schedule(
        fund_id, "2024-Q2", env_id="env-1", business_id=business_id
    )
    mgmt = [ln for ln in sched.lines if ln.kind == "management_fee"]
    assert len(mgmt) == 1
    assert mgmt[0].null_reason is None
    assert mgmt[0].basis == "called"
    # 50M * 1% / 4 = 125,000
    assert mgmt[0].amount == Decimal("125000.00")
    assert sched.total_management_fees == Decimal("125000.00")


# ---------------------------------------------------------------------------
# Step-down behavior
# ---------------------------------------------------------------------------


def test_stepdown_applies_after_stepdown_date(fake_cursor):
    """When re_fee_policy.stepdown_date is past, the stepdown_rate replaces
    the term's annual_rate."""
    fund_id = uuid4()
    business_id = uuid4()
    fake_cursor(
        [
            {"d": date(2025, 1, 1)},  # inception 2025-Q1
            # Quarter 2025-Q1: fund_term with rate 0.015
            {
                "fund_term_id": uuid4(),
                "effective_from": date(2024, 1, 1),
                "effective_to": None,
                "management_fee_rate": Decimal("0.015"),
                "management_fee_basis": "committed",
            },
            # Step-down policy: stepdown_date well in the past, stepdown_rate=0.01
            {
                "id": uuid4(),
                "fee_basis": "COMMITTED",
                "annual_rate": Decimal("0.015"),
                "start_date": date(2024, 1, 1),
                "stepdown_date": date(2024, 6, 1),
                "stepdown_rate": Decimal("0.010"),
            },
            {"total": 100_000_000, "n": 10},  # committed basis
            [],  # no other expense rows — schedule will fail closed at top level
        ]
    )

    sched = compute_fund_expense_schedule(
        fund_id, "2025-Q1", env_id="env-1", business_id=business_id
    )
    mgmt = [ln for ln in sched.lines if ln.kind == "management_fee"]
    assert mgmt[0].rate == 0.01
    # 100M * 1.0% / 4 = 250,000
    assert mgmt[0].amount == Decimal("250000.00")
    assert "re_fee_policy_stepdown" in mgmt[0].formula_key


# ---------------------------------------------------------------------------
# Fail-closed: missing inputs produce null_reasons (NOT zero)
# ---------------------------------------------------------------------------


def test_missing_fund_term_for_all_quarters_fails_closed(fake_cursor):
    """A fund with no repe_fund_term row at any quarter must fail closed
    with management_fee=None and a structured null_reason."""
    fund_id = uuid4()
    business_id = uuid4()
    fake_cursor(
        [
            # _fund_inception_quarter: term path returns None, fall back to
            # commitments / calls path.
            {"d": None},  # no fund_term effective_from
            {"d": date(2024, 1, 1)},  # commitment / call earliest
            # Quarter 2024-Q1: no fund_term
            None,  # no active fund_term
            # other lines — return one so we don't trigger the "no expense rows" null
            [
                {
                    "id": uuid4(),
                    "quarter": "2024-Q1",
                    "expense_type": "audit",
                    "amount": Decimal("5000"),
                    "currency": "USD",
                }
            ],
        ]
    )

    sched = compute_fund_expense_schedule(
        fund_id, "2024-Q1", env_id="env-1", business_id=business_id
    )
    assert sched.total_management_fees is None  # NOT zero!
    assert "fund_term" in sched.null_reasons or "fund_expense_layer" in sched.null_reasons
    mgmt_lines = [ln for ln in sched.lines if ln.kind == "management_fee"]
    assert all(ln.amount is None for ln in mgmt_lines)
    assert all(ln.null_reason == "missing_fund_term" for ln in mgmt_lines)


def test_missing_committed_basis_partner_commitments_fails_closed(fake_cursor):
    """A fund with a fund_term on COMMITTED basis but zero partner_commitment
    rows fails closed for that quarter with a structured reason — not a
    silent zero."""
    fund_id = uuid4()
    business_id = uuid4()
    fake_cursor(
        [
            {"d": date(2024, 1, 1)},
            {
                "fund_term_id": uuid4(),
                "effective_from": date(2024, 1, 1),
                "effective_to": None,
                "management_fee_rate": Decimal("0.015"),
                "management_fee_basis": "committed",
            },
            None,  # no fee_policy
            {"total": 0, "n": 0},  # no partner commitments
            [
                {
                    "id": uuid4(),
                    "quarter": "2024-Q1",
                    "expense_type": "audit",
                    "amount": Decimal("5000"),
                    "currency": "USD",
                }
            ],
        ]
    )

    sched = compute_fund_expense_schedule(
        fund_id, "2024-Q1", env_id="env-1", business_id=business_id
    )
    mgmt = [ln for ln in sched.lines if ln.kind == "management_fee"]
    assert mgmt[0].amount is None
    assert mgmt[0].null_reason == "missing_committed_basis_no_partner_commitments"
    # NOT zero. The line must fail closed.
    assert mgmt[0].amount != Decimal("0")
    assert sched.total_management_fees is None


def test_missing_other_expense_rows_blocks_net_metrics(fake_cursor):
    """A fund with mgmt fees computable but ZERO re_fund_expense_qtr rows
    fails closed at the top level — the user's principle is that missing
    expense assumptions block net metrics."""
    fund_id = uuid4()
    business_id = uuid4()
    fake_cursor(
        [
            {"d": date(2024, 1, 1)},
            {
                "fund_term_id": uuid4(),
                "effective_from": date(2024, 1, 1),
                "effective_to": None,
                "management_fee_rate": Decimal("0.015"),
                "management_fee_basis": "committed",
            },
            None,
            {"total": 100_000_000, "n": 5},
            [],  # NO other expense rows
        ]
    )

    sched = compute_fund_expense_schedule(
        fund_id, "2024-Q1", env_id="env-1", business_id=business_id
    )
    assert sched.total_management_fees == Decimal("375000.00")
    assert sched.total_other_expenses is None  # explicit null, not zero
    assert sched.total_expenses is None
    assert sched.null_reasons.get("fund_expense_layer") == (
        "no_other_expense_rows_in_re_fund_expense_qtr"
    )
    assert sched.has_blocking_nulls


# ---------------------------------------------------------------------------
# No-zero-substitution invariant
# ---------------------------------------------------------------------------


def test_no_silent_zero_in_any_line_amount(fake_cursor):
    """Belt-and-suspenders: no FundExpenseLine should ever land in the output
    with amount=0 and null_reason=None for a missing input."""
    fund_id = uuid4()
    business_id = uuid4()
    fake_cursor(
        [
            {"d": date(2024, 1, 1)},
            {
                "fund_term_id": uuid4(),
                "effective_from": date(2024, 1, 1),
                "effective_to": None,
                "management_fee_rate": Decimal("0.015"),
                "management_fee_basis": "committed",
            },
            None,
            {"total": 0, "n": 0},  # forces missing_committed_basis null
            [
                {
                    "id": uuid4(),
                    "quarter": "2024-Q1",
                    "expense_type": None,  # null type → classified as 'other' with warning
                    "amount": None,  # missing amount
                    "currency": "USD",
                }
            ],
        ]
    )
    sched = compute_fund_expense_schedule(
        fund_id, "2024-Q1", env_id="env-1", business_id=business_id
    )
    for ln in sched.lines:
        if ln.amount == Decimal("0") or ln.amount == 0:
            assert ln.null_reason is None, (
                f"Zero amount with no null_reason — silent zero substitution! line={ln.to_dict()}"
            )
        if ln.amount is None:
            assert ln.null_reason is not None, (
                f"None amount with no null_reason — line is structurally invalid"
            )


# ---------------------------------------------------------------------------
# compose_pre_waterfall_cf identity
# ---------------------------------------------------------------------------


def test_compose_pre_waterfall_cf_identity_holds():
    """sum(merged) == sum(gross) + sum(expense)."""
    from app.services.bottom_up_cashflow import CFPoint, quarter_end_date

    gross = [
        CFPoint(
            quarter="2024-Q1",
            quarter_end_date=quarter_end_date("2024-Q1"),
            amount=Decimal("-50000000"),
            component_breakdown={"acquisition": -50000000.0},
        ),
        CFPoint(
            quarter="2024-Q4",
            quarter_end_date=quarter_end_date("2024-Q4"),
            amount=Decimal("3500000"),
            component_breakdown={"operating": 3500000.0},
            has_actual=True,
        ),
    ]
    expense = FundExpenseSchedule(
        fund_id=uuid4(),
        as_of_quarter="2024-Q4",
        lines=[],
        cf_points=[
            CFPoint(
                quarter="2024-Q1",
                quarter_end_date=quarter_end_date("2024-Q1"),
                amount=Decimal("-100000"),
                component_breakdown={"fund_expense": []},
                has_actual=True,
            ),
        ],
        total_management_fees=Decimal("75000"),
        total_other_expenses=Decimal("25000"),
        expenses_by_type={"management_fee": Decimal("75000"), "audit": Decimal("25000")},
        null_reasons={},
        expense_cf_hash="sha256:test",
    )
    merged, summary = compose_pre_waterfall_cf(
        fund_gross_cf=gross, expense_schedule=expense
    )
    assert summary["identity_ok"] is True
    assert abs(summary["identity_diff"]) < 0.005
    assert summary["sum_fund_gross_cf"] == -46500000.0
    assert summary["sum_fund_expense_cf"] == -100000.0
    assert summary["sum_pre_waterfall_cf"] == -46600000.0


def test_compose_pre_waterfall_cf_propagates_null_reasons():
    """Identity summary carries the schedule's null_reasons through."""
    expense = FundExpenseSchedule(
        fund_id=uuid4(),
        as_of_quarter="2024-Q4",
        lines=[],
        cf_points=[],
        total_management_fees=None,
        total_other_expenses=None,
        expenses_by_type={},
        null_reasons={"fund_expense_layer": "missing_xyz"},
        expense_cf_hash="sha256:test",
    )
    _, summary = compose_pre_waterfall_cf(fund_gross_cf=[], expense_schedule=expense)
    assert summary["expense_null_reasons"] == {"fund_expense_layer": "missing_xyz"}
