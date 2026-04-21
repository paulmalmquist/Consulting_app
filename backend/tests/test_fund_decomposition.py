"""Math receipt tests for the Fund Decomposition overlay.

These tests prove the accounting identities hold, not just that the page
renders. Each test maps to a product rule in the plan
(/Users/paulmalmquist/.claude/plans/you-are-working-inside-greedy-crane.md)
and each is labeled with the invariant it witnesses.

We stub out `compute_fund_rollup`, `get_authoritative_state`, and the
three module-level DB loaders so we can control the substrate precisely
without a seeded Postgres.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any
from unittest.mock import patch
from uuid import UUID

import pytest

from app.services import fund_decomposition as fd
from app.services.fund_decomposition import (
    EmptySelection,
    UnknownInvestmentIds,
    _InvestmentState,
    compute_fund_decomposition,
)


# ---------------------------------------------------------------------------
# Fixtures — a small synthetic 3-investment fund
# ---------------------------------------------------------------------------

FUND_ID = UUID("11111111-1111-1111-1111-111111111111")
I1 = UUID("22222222-2222-2222-2222-222222222201")
I2 = UUID("22222222-2222-2222-2222-222222222202")
I3 = UUID("22222222-2222-2222-2222-222222222203")

QUARTER = "2026Q2"


@dataclass
class _FakeCFPoint:
    quarter: str
    quarter_end_date: date
    amount: Decimal
    warnings: list[str] = field(default_factory=list)


@dataclass
class _FakeRollup:
    """Minimal stand-in for bottom_up_rollup.FundRollup."""

    series: list[_FakeCFPoint]
    irr: Decimal | None
    null_reason: str | None
    investment_contributions: list[dict[str, Any]]
    asset_contributions: list[Any] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _series_from_cashflows(
    cashflows: list[tuple[str, Decimal]],
) -> list[_FakeCFPoint]:
    out: list[_FakeCFPoint] = []
    for q, amount in cashflows:
        y = int(q[:4])
        qn = int(q[-1])
        # approximate quarter-end
        month_end_day = {1: (3, 31), 2: (6, 30), 3: (9, 30), 4: (12, 31)}[qn]
        d = date(y, month_end_day[0], month_end_day[1])
        out.append(_FakeCFPoint(quarter=q, quarter_end_date=d, amount=amount))
    return out


def _investments_table() -> dict[UUID, dict[str, Any]]:
    """Per-investment paid-in / distributions / NAV / CF series for the fake fund."""
    return {
        I1: {
            "name": "Deal A",
            "paid_in": Decimal("100000000"),
            "distributions": Decimal("60000000"),
            "nav": Decimal("80000000"),
            "gross_irr": Decimal("0.18"),
            "cashflows": [
                ("2022Q1", Decimal("-100000000")),
                ("2024Q2", Decimal("30000000")),
                ("2025Q3", Decimal("30000000")),
                (QUARTER, Decimal("80000000")),
            ],
        },
        I2: {
            "name": "Deal B",
            "paid_in": Decimal("50000000"),
            "distributions": Decimal("20000000"),
            "nav": Decimal("45000000"),
            "gross_irr": Decimal("0.12"),
            "cashflows": [
                ("2022Q3", Decimal("-50000000")),
                ("2025Q1", Decimal("20000000")),
                (QUARTER, Decimal("45000000")),
            ],
        },
        I3: {
            "name": "Deal C",
            "paid_in": Decimal("40000000"),
            "distributions": Decimal("10000000"),
            "nav": Decimal("25000000"),
            "gross_irr": Decimal("0.04"),
            "cashflows": [
                ("2023Q1", Decimal("-40000000")),
                ("2024Q4", Decimal("5000000")),
                ("2025Q2", Decimal("5000000")),
                (QUARTER, Decimal("25000000")),
            ],
        },
    }


def _fake_list_fund_investments(fund_id):
    table = _investments_table()
    return [{"investment_id": iid, "name": v["name"]} for iid, v in table.items()]


def _fake_load_investment_states(investment_ids, as_of_quarter):
    table = _investments_table()
    out: dict[UUID, _InvestmentState] = {}
    for iid in investment_ids:
        if iid not in table:
            continue
        v = table[iid]
        out[iid] = _InvestmentState(
            investment_id=iid,
            name=v["name"],
            invested_capital=v["paid_in"],
            realized_distributions=v["distributions"],
            unrealized_value=v["nav"],
            gross_irr=v["gross_irr"],
        )
    return out


def _fake_load_investment_assets(investment_ids):
    return {}  # drill-down not exercised by math receipts


def _fake_compute_fund_rollup(
    fund_id,
    as_of_quarter,
    *,
    env_default_cap_rate=None,
    compute_contributions=True,
    included_investment_ids=None,
):
    table = _investments_table()
    selected = set(table.keys()) if included_investment_ids is None else included_investment_ids
    if not selected:
        return _FakeRollup(series=[], irr=None, null_reason="no_investments_in_selection", investment_contributions=[])

    # Build a merged CF series by quarter-end date.
    merged: dict[tuple[str, date], Decimal] = {}
    for iid in selected:
        if iid not in table:
            continue
        for p in _series_from_cashflows(table[iid]["cashflows"]):
            key = (p.quarter, p.quarter_end_date)
            merged[key] = merged.get(key, Decimal(0)) + p.amount

    series = [
        _FakeCFPoint(quarter=q, quarter_end_date=d, amount=amt)
        for (q, d), amt in sorted(merged.items(), key=lambda kv: kv[0][1])
    ]

    # Use the real xirr engine to compute IRR on the merged series.
    from app.finance.irr_engine import xirr as _xirr

    cf = [(p.quarter_end_date, p.amount) for p in series if p.amount != 0]
    has_pos = any(a > 0 for _, a in cf)
    has_neg = any(a < 0 for _, a in cf)
    irr = _xirr(cf) if (has_pos and has_neg and len(cf) >= 2) else None
    if irr is not None:
        irr = Decimal(str(irr)).quantize(Decimal("0.000001"))

    inv_contribs: list[dict[str, Any]] = []
    for iid in selected:
        if iid not in table:
            continue
        inv_contribs.append(
            {
                "investment_id": str(iid),
                "name": table[iid]["name"],
                "irr": float(table[iid]["gross_irr"]),
                "null_reason": None,
                "value_share": 0.5,
                "asset_count": 0,
                "null_asset_count": 0,
            }
        )

    return _FakeRollup(
        series=series,
        irr=irr,
        null_reason=None,
        investment_contributions=inv_contribs,
    )


def _fake_get_authoritative_state(*, entity_type, entity_id, quarter, **_):
    # Seed with baseline values that match the full-set computation within
    # tolerance. Pin every metric to the derived-from-same-substrate value
    # so the full_set_matches_baseline identity check passes cleanly.
    roll = _fake_compute_fund_rollup(entity_id, quarter)
    table = _investments_table()
    paid_in = sum((v["paid_in"] for v in table.values()), Decimal(0))
    dist = sum((v["distributions"] for v in table.values()), Decimal(0))
    nav = sum((v["nav"] for v in table.values()), Decimal(0))
    tvpi = (nav + dist) / paid_in
    dpi = dist / paid_in
    return {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "quarter": quarter,
        "requested_quarter": quarter,
        "period_exact": True,
        "state_origin": "authoritative",
        "snapshot_version": "test-snapshot-v1",
        "trust_status": "trusted",
        "promotion_state": "released",
        "null_reason": None,
        "state": {
            "canonical_metrics": {
                "gross_irr": str(roll.irr) if roll.irr is not None else None,
                "net_irr": "0.08",
                "tvpi": str(tvpi),
                "dpi": str(dpi),
                "total_called": str(paid_in),
                "total_distributed": str(dist),
                "ending_nav": str(nav),
            }
        },
    }


# ---------------------------------------------------------------------------
# Pytest wiring
# ---------------------------------------------------------------------------


@pytest.fixture
def overlay_stubs():
    """Patch all of fund_decomposition's substrate dependencies."""
    # Reset the module cache between tests so they don't alias each other.
    fd._cache_clear()
    with (
        patch.object(fd, "_list_fund_investments", side_effect=_fake_list_fund_investments),
        patch.object(fd, "_load_investment_states", side_effect=_fake_load_investment_states),
        patch.object(fd, "_load_investment_assets", side_effect=_fake_load_investment_assets),
        patch.object(fd, "compute_fund_rollup", side_effect=_fake_compute_fund_rollup),
        patch.object(fd, "get_authoritative_state", side_effect=_fake_get_authoritative_state),
    ):
        yield


def _near(a: float | None, b: float | None, tol: float = 1e-9) -> bool:
    if a is None or b is None:
        return a is b
    return abs(a - b) <= tol


# ---------------------------------------------------------------------------
# Tests — math receipts
# ---------------------------------------------------------------------------


def test_tvpi_identity_holds_for_full_set(overlay_stubs):
    out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=set())
    sd = out["selection_derived"]
    expected = (sd["nav"] + sd["distributions"]) / sd["paid_in"]
    assert _near(sd["tvpi"], expected)
    identity = next(c for c in out["identity_checks"] if c["name"] == "tvpi_identity")
    assert identity["passed"] is True


def test_dpi_identity_holds_for_full_set(overlay_stubs):
    out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=set())
    sd = out["selection_derived"]
    expected = sd["distributions"] / sd["paid_in"]
    assert _near(sd["dpi"], expected)
    identity = next(c for c in out["identity_checks"] if c["name"] == "dpi_identity")
    assert identity["passed"] is True


def test_tvpi_identity_holds_for_every_subset(overlay_stubs):
    # Enumerate every non-empty subset of 3 investments: 2^3 - 1 = 7 subsets.
    subsets = [
        set(),          # full set (nothing excluded)
        {I1},
        {I2},
        {I3},
        {I1, I2},
        {I1, I3},
        {I2, I3},
    ]
    for excluded in subsets:
        out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=excluded)
        sd = out["selection_derived"]
        if sd["paid_in"] == 0:
            continue
        expected_tvpi = (sd["nav"] + sd["distributions"]) / sd["paid_in"]
        expected_dpi = sd["distributions"] / sd["paid_in"]
        assert _near(sd["tvpi"], expected_tvpi), f"TVPI identity failed for excluded={excluded}"
        assert _near(sd["dpi"], expected_dpi), f"DPI identity failed for excluded={excluded}"


def test_full_set_matches_authoritative_baseline(overlay_stubs):
    out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=set())
    check = next(c for c in out["identity_checks"] if c["name"] == "full_set_matches_baseline")
    assert check["applied"] is True
    assert check["passed"] is True
    # The stubbed baseline gross_irr is pinned to the full-set rollup, so delta is zero.
    assert check["delta_gross_irr_bps"] == 0.0 or check["delta_gross_irr_bps"] < 1.0


def test_subset_selection_is_not_applied_for_full_set_check(overlay_stubs):
    """When selection is a strict subset, full_set_matches_baseline must be
    reported as applied=false (not silently skipped) with a clear reason."""
    out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids={I1})
    check = next(c for c in out["identity_checks"] if c["name"] == "full_set_matches_baseline")
    assert check["applied"] is False
    assert check["applied_reason"] == "selection_is_subset"


def test_irr_changes_when_investment_removed(overlay_stubs):
    full = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=set())
    subset = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids={I3})
    full_irr = full["selection_derived"]["gross_irr"]
    subset_irr = subset["selection_derived"]["gross_irr"]
    # I3 is the low-performing deal; excluding it should materially change
    # the gross IRR. We only require the values to differ measurably.
    assert full_irr is not None and subset_irr is not None
    assert abs(full_irr - subset_irr) > 1e-4, "IRR did not move when a deal was excluded"


def test_empty_selection_raises(overlay_stubs):
    with pytest.raises(EmptySelection):
        compute_fund_decomposition(
            FUND_ID, QUARTER, excluded_investment_ids={I1, I2, I3}
        )


def test_unknown_excluded_id_raises(overlay_stubs):
    ghost = UUID("99999999-9999-9999-9999-999999999999")
    with pytest.raises(UnknownInvestmentIds) as exc_info:
        compute_fund_decomposition(
            FUND_ID, QUARTER, excluded_investment_ids={ghost}
        )
    assert ghost in exc_info.value.ids


def test_order_independence(overlay_stubs):
    """excluded_investment_ids is a set in the API; two different insertion
    orders must produce byte-identical responses once sorted."""
    a = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids={I1, I2})
    fd._cache_clear()
    b = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids={I2, I1})
    # Contribution lists come sorted by investment_id already.
    assert a["selection_definition"]["included_investment_ids"] == b["selection_definition"]["included_investment_ids"]
    assert a["selection_definition"]["excluded_investment_ids"] == b["selection_definition"]["excluded_investment_ids"]
    assert a["selection_derived"]["gross_irr"] == b["selection_derived"]["gross_irr"]
    assert a["selection_derived"]["tvpi"] == b["selection_derived"]["tvpi"]
    assert a["selection_derived"]["dpi"] == b["selection_derived"]["dpi"]
    assert a["provenance"]["cache_key_hash"] == b["provenance"]["cache_key_hash"]


def test_no_future_cf(overlay_stubs):
    out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=set())
    check = next(c for c in out["identity_checks"] if c["name"] == "no_future_cf")
    assert check["passed"] is True
    assert check["as_of_quarter_end"] == "2026-06-30"


def test_net_irr_and_carry_are_null_under_selection(overlay_stubs):
    out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids={I3})
    sd = out["selection_derived"]
    assert sd["net_irr"] is None
    assert sd["net_irr_null_reason"] == "net_irr_not_dimensional_to_investment_subset"
    assert sd["carry"] is None
    assert sd["carry_null_reason"] == "out_of_scope_requires_waterfall"
    assert sd["promote"] is None
    assert sd["gp_share"] is None


def test_state_origin_fixed_to_overlay(overlay_stubs):
    """The endpoint never shape-shifts between authoritative and derived."""
    for excluded in [set(), {I1}, {I2, I3}]:
        out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=excluded)
        assert out["state_origin"] == "decomposition_overlay"


def test_baseline_block_present_with_trust_metadata(overlay_stubs):
    out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=set())
    base = out["baseline_authoritative"]
    assert base["source"] == "re_authoritative_snapshots"
    assert base["trust_status"] == "trusted"
    assert base["promotion_state"] == "released"
    assert base["snapshot_version"] == "test-snapshot-v1"
    # Baseline values pass through from canonical_metrics.
    assert base["net_irr"] == 0.08
    # TVPI is pinned to the derived value for full-set match; spot-check it.
    assert base["tvpi"] is not None
    assert abs(base["tvpi"] - 1.2632) < 0.001


def test_unreleased_baseline_full_set_check_not_applied(overlay_stubs):
    """On an unreleased quarter the full_set check must surface as
    applied=false with baseline_not_released, not silently passing."""

    def _unreleased_baseline(**_):
        return {
            "entity_type": "fund",
            "entity_id": str(FUND_ID),
            "quarter": QUARTER,
            "requested_quarter": QUARTER,
            "period_exact": True,
            "state_origin": "authoritative",
            "snapshot_version": None,
            "trust_status": "missing_source",
            "promotion_state": None,
            "null_reason": "authoritative_state_not_released",
            "state": None,
        }

    fd._cache_clear()
    with patch.object(fd, "get_authoritative_state", side_effect=_unreleased_baseline):
        with (
            patch.object(fd, "_list_fund_investments", side_effect=_fake_list_fund_investments),
            patch.object(fd, "_load_investment_states", side_effect=_fake_load_investment_states),
            patch.object(fd, "_load_investment_assets", side_effect=_fake_load_investment_assets),
            patch.object(fd, "compute_fund_rollup", side_effect=_fake_compute_fund_rollup),
        ):
            out = compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=set())

    check = next(c for c in out["identity_checks"] if c["name"] == "full_set_matches_baseline")
    assert check["applied"] is False
    assert check["applied_reason"] == "baseline_not_released"
    assert out["baseline_authoritative"]["trust_status"] == "missing_source"
    assert out["baseline_authoritative"]["null_reason"] == "authoritative_state_not_released"
