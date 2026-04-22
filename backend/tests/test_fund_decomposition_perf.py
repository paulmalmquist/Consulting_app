"""Performance smoke for the Fund Decomposition overlay.

Target per plan (/Users/paulmalmquist/.claude/plans/you-are-working-inside-greedy-crane.md):
  p50 ≤ 250 ms, p95 ≤ 600 ms on a 40-investment fund, with warm cache.

This uses the same stub pattern as `test_fund_decomposition.py` so the
measurement is of the pure Python overlay layer (xirr + leave-one-out +
identity checks), not the DB. The DB is not what would be slow on a
well-indexed `re_investment_cf_series_mat`; the worry is the N leave-one-out
XIRRs and the per-call response assembly.
"""

from __future__ import annotations

import random
import statistics
import time
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest

from app.services import fund_decomposition as fd
from app.services.fund_decomposition import _InvestmentState, compute_fund_decomposition

FUND_ID = UUID("44444444-4444-4444-4444-444444444444")
QUARTER = "2026Q2"
INVESTMENT_COUNT = 40


@dataclass
class _FakeCFPoint:
    quarter: str
    quarter_end_date: date
    amount: Decimal
    warnings: list[str] = field(default_factory=list)


@dataclass
class _FakeRollup:
    series: list[_FakeCFPoint]
    irr: Decimal | None
    null_reason: str | None
    investment_contributions: list[dict[str, Any]]
    asset_contributions: list[Any] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _make_investments(n: int) -> dict[UUID, dict[str, Any]]:
    random.seed(42)
    table: dict[UUID, dict[str, Any]] = {}
    for i in range(n):
        iid = uuid4()
        paid_in = Decimal(random.randint(20_000_000, 100_000_000))
        dist = paid_in * Decimal(str(round(random.uniform(0.1, 0.8), 3)))
        nav = paid_in * Decimal(str(round(random.uniform(0.4, 1.2), 3)))
        # A short synthetic CF series.
        y_start = random.randint(2020, 2023)
        cfs = [
            (f"{y_start}Q1", -paid_in),
            (f"{y_start + 2}Q2", dist * Decimal("0.5")),
            (f"{y_start + 3}Q1", dist * Decimal("0.5")),
            (QUARTER, nav),
        ]
        table[iid] = {
            "name": f"Deal {i}",
            "paid_in": paid_in,
            "distributions": dist,
            "nav": nav,
            "gross_irr": Decimal(str(round(random.uniform(0.05, 0.25), 4))),
            "cashflows": cfs,
        }
    return table


_TABLE = _make_investments(INVESTMENT_COUNT)


def _series_from_cashflows(cashflows):
    out = []
    for q, amount in cashflows:
        y = int(q[:4])
        qn = int(q[-1])
        month_end = {1: (3, 31), 2: (6, 30), 3: (9, 30), 4: (12, 31)}[qn]
        out.append(_FakeCFPoint(quarter=q, quarter_end_date=date(y, *month_end), amount=amount))
    return out


def _fake_list_fund_investments(fund_id):
    return [{"investment_id": iid, "name": v["name"]} for iid, v in _TABLE.items()]


def _fake_load_investment_states(investment_ids, as_of_quarter):
    out = {}
    for iid in investment_ids:
        if iid in _TABLE:
            v = _TABLE[iid]
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
    return {}


def _fake_compute_fund_rollup(
    fund_id, as_of_quarter, *,
    env_default_cap_rate=None, compute_contributions=True, included_investment_ids=None,
):
    selected = set(_TABLE.keys()) if included_investment_ids is None else included_investment_ids
    if not selected:
        return _FakeRollup(series=[], irr=None, null_reason="no_investments_in_selection", investment_contributions=[])

    merged: dict[tuple[str, date], Decimal] = {}
    for iid in selected:
        if iid not in _TABLE:
            continue
        for p in _series_from_cashflows(_TABLE[iid]["cashflows"]):
            key = (p.quarter, p.quarter_end_date)
            merged[key] = merged.get(key, Decimal(0)) + p.amount
    series = [
        _FakeCFPoint(quarter=q, quarter_end_date=d, amount=amt)
        for (q, d), amt in sorted(merged.items(), key=lambda kv: kv[0][1])
    ]
    from app.finance.irr_engine import xirr as _xirr

    cf = [(p.quarter_end_date, p.amount) for p in series if p.amount != 0]
    has_pos = any(a > 0 for _, a in cf)
    has_neg = any(a < 0 for _, a in cf)
    irr = _xirr(cf) if (has_pos and has_neg and len(cf) >= 2) else None
    if irr is not None:
        irr = Decimal(str(irr)).quantize(Decimal("0.000001"))

    inv_contribs = [
        {
            "investment_id": str(iid),
            "name": _TABLE[iid]["name"],
            "irr": float(_TABLE[iid]["gross_irr"]),
            "null_reason": None,
            "value_share": 1.0 / len(selected),
            "asset_count": 0,
            "null_asset_count": 0,
        }
        for iid in selected if iid in _TABLE
    ]
    return _FakeRollup(series=series, irr=irr, null_reason=None, investment_contributions=inv_contribs)


def _fake_baseline(**_):
    roll = _fake_compute_fund_rollup(FUND_ID, QUARTER)
    return {
        "entity_type": "fund", "entity_id": str(FUND_ID), "quarter": QUARTER,
        "requested_quarter": QUARTER, "period_exact": True, "state_origin": "authoritative",
        "snapshot_version": "test-v1", "trust_status": "trusted", "promotion_state": "released",
        "null_reason": None,
        "state": {"canonical_metrics": {"gross_irr": str(roll.irr), "tvpi": "1.5", "dpi": "0.5", "net_irr": "0.08"}},
    }


def _fake_capability_capable(*, fund_id=None):
    return {
        "capable": True,
        "error_code": None,
        "reasons": [],
        "missing_migrations": [],
        "missing_tables": [],
        "fund_count": 1,
        "fund": (
            {"fund_id": str(fund_id), "exists": True, "investment_count": INVESTMENT_COUNT}
            if fund_id is not None
            else None
        ),
    }


@pytest.fixture
def perf_stubs():
    fd._cache_clear()
    with (
        patch.object(fd, "probe_decomposition_capabilities", side_effect=_fake_capability_capable),
        patch.object(fd, "_list_fund_investments", side_effect=_fake_list_fund_investments),
        patch.object(fd, "_load_investment_states", side_effect=_fake_load_investment_states),
        patch.object(fd, "_load_investment_assets", side_effect=_fake_load_investment_assets),
        patch.object(fd, "compute_fund_rollup", side_effect=_fake_compute_fund_rollup),
        patch.object(fd, "get_authoritative_state", side_effect=_fake_baseline),
    ):
        yield


def test_p50_p95_under_target_on_40_investments(perf_stubs):
    """100 random toggle patterns; p50 ≤ 250ms, p95 ≤ 600ms.

    The first call warms no-cache. We measure only toggled subsets. Each
    pattern excludes between 1 and 10 random investments.
    """
    ids = list(_TABLE.keys())
    random.seed(7)
    timings_ms: list[float] = []

    # Warm the cache on the common full-set and one immediate subset so
    # rollup helpers are JIT-warm for the main loop. This matches the
    # page's precompute-on-load flow.
    compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=set())
    compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids={ids[0]})

    for _ in range(100):
        k = random.randint(1, 10)
        excluded = set(random.sample(ids, k))
        t0 = time.perf_counter()
        compute_fund_decomposition(FUND_ID, QUARTER, excluded_investment_ids=excluded)
        timings_ms.append((time.perf_counter() - t0) * 1000)

    p50 = statistics.median(timings_ms)
    p95 = statistics.quantiles(timings_ms, n=20)[18]  # 95th percentile
    print(f"\n[fund-decomposition-perf] p50={p50:.1f}ms p95={p95:.1f}ms n={len(timings_ms)}")

    # Budget per plan. The targets are deliberately generous for CI —
    # dev-machine runs in the low-tens of ms; CI hardware varies.
    assert p50 <= 250.0, f"p50 {p50:.1f}ms exceeds 250ms target"
    assert p95 <= 600.0, f"p95 {p95:.1f}ms exceeds 600ms target"
