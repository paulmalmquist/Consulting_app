"""Tests for LOO IRR contribution and irr_contribution_by_investment.

Verifies:
1. irr_marginal_bps (LOO) is not the same as irr_weighted_bps (weighted approx).
2. sum(irr_marginal_bps) != fund_irr * 10000 (non-additivity).
3. build_canonical_metrics_bottom_up includes irr_contribution_by_investment[].
"""

from __future__ import annotations

from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

from app.services.bottom_up_cashflow import (
    CFPoint,
    IrrResult,
    quarter_end_date,
)
from app.services.bottom_up_rollup import (
    build_canonical_metrics_bottom_up,
    compute_fund_rollup,
    fund_rollup_payload,
)


# ---------------------------------------------------------------------------
# Test helpers (mirrors test_bottom_up_rollup.py pattern)
# ---------------------------------------------------------------------------


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


def _asset_series(cost: Decimal, terminal: Decimal) -> list[CFPoint]:
    """Simple 6-quarter series with positive IRR."""
    return [
        _point("2024-Q1", -cost),
        _point("2024-Q2", cost * Decimal("0.01")),
        _point("2024-Q3", cost * Decimal("0.01")),
        _point("2024-Q4", cost * Decimal("0.01")),
        _point("2025-Q1", cost * Decimal("0.01")),
        _point("2025-Q2", terminal, has_exit=True),
    ]


def _mock_patches(assets_by_id: dict[UUID, dict]):
    def fake_build(asset_id, as_of_quarter, *, env_default_cap_rate=None):
        return list(assets_by_id[UUID(str(asset_id))]["series"])

    def fake_compute(asset_id, as_of_quarter, *, env_default_cap_rate=None, series=None):
        return assets_by_id[UUID(str(asset_id))]["irr"]

    def fake_resolve(asset_id, as_of):
        return Decimal("1")

    return [
        patch("app.services.bottom_up_rollup.build_asset_cf_series", fake_build),
        patch("app.services.bottom_up_rollup.compute_asset_irr", fake_compute),
        patch("app.services.bottom_up_rollup.resolve_ownership_pct", fake_resolve),
    ]


@contextmanager
def _mock_db(fund_id: UUID, investments: list[dict], assets_by_inv: dict[UUID, list[dict]]):
    """Stub DB cursor for list_fund_investments + list_investment_assets."""

    class _Cur:
        def __init__(self):
            self._result: list = []

        def execute(self, sql, params=None):
            p = params[0] if params else None
            if "repe_deal" in sql:
                self._result = investments
            elif "repe_asset" in sql:
                inv_id = UUID(str(p)) if p else None
                self._result = assets_by_inv.get(inv_id, [])
            else:
                self._result = []

        def fetchall(self):
            return self._result

        def fetchone(self):
            return self._result[0] if self._result else None

    @contextmanager
    def _cursor():
        yield _Cur()

    with patch("app.services.bottom_up_rollup.get_cursor", _cursor):
        yield


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_irr_marginal_bps_differs_from_weighted():
    """LOO marginal != weighted approx for two assets with different cost bases.

    Asset A: cost 100, terminal 200 → high IRR, small NAV weight.
    Asset B: cost 800, terminal 880 → low IRR, large NAV weight.
    Weighted approx: asset_irr × value_share × 10000.
    LOO marginal: actual fund_IRR delta from removing each asset.
    These should differ because LOO is not linear over value_share.
    """
    fund_id = uuid4()
    inv_a = uuid4()
    inv_b = uuid4()
    asset_a = uuid4()
    asset_b = uuid4()

    assets_by_id = {
        asset_a: {
            "series": _asset_series(Decimal("100"), Decimal("210")),
            "irr": IrrResult(value=Decimal("0.45"), null_reason=None, warnings=[], cashflow_count=6, has_exit=True, has_terminal_value=False),
        },
        asset_b: {
            "series": _asset_series(Decimal("800"), Decimal("880")),
            "irr": IrrResult(value=Decimal("0.05"), null_reason=None, warnings=[], cashflow_count=6, has_exit=True, has_terminal_value=False),
        },
    }

    investments = [
        {"investment_id": str(inv_a), "name": "Inv A"},
        {"investment_id": str(inv_b), "name": "Inv B"},
    ]
    assets_by_inv = {
        inv_a: [{"asset_id": str(asset_a), "name": "Asset A", "acquisition_date": "2024-01-01"}],
        inv_b: [{"asset_id": str(asset_b), "name": "Asset B", "acquisition_date": "2024-01-01"}],
    }

    patches = _mock_patches(assets_by_id)
    with _mock_db(fund_id, investments, assets_by_inv):
        for p in patches:
            p.start()
        try:
            roll = compute_fund_rollup(fund_id, "2025-Q2")
        finally:
            for p in patches:
                p.stop()

    assert roll.irr is not None, "Fund IRR should be computable"

    for c in roll.asset_contributions:
        if c.irr_marginal_bps is not None and c.irr_weighted_bps is not None:
            # For the high-cost low-IRR asset they must diverge meaningfully.
            # Just assert they are not the same (within 0.5 bps tolerance).
            diff = abs(c.irr_marginal_bps - c.irr_weighted_bps)
            if abs(c.irr_weighted_bps) > 1:
                assert diff > 0.001, (
                    f"LOO marginal and weighted approx are suspiciously equal "
                    f"(diff={diff:.4f}) for asset {c.asset_id}"
                )


def test_contribution_nonadditive():
    """sum(irr_marginal_bps) should NOT equal fund_irr × 10000.

    LOO is a remove-one sensitivity. The sum of remove-one deltas generally
    over- or under-estimates the total by the non-linear interaction terms.
    We verify the non-additive contract holds for a 2-asset fund.
    """
    fund_id = uuid4()
    inv_a, inv_b = uuid4(), uuid4()
    asset_a, asset_b = uuid4(), uuid4()

    assets_by_id = {
        asset_a: {
            "series": _asset_series(Decimal("300"), Decimal("630")),
            "irr": IrrResult(value=Decimal("0.40"), null_reason=None, warnings=[], cashflow_count=6, has_exit=True, has_terminal_value=False),
        },
        asset_b: {
            "series": _asset_series(Decimal("700"), Decimal("770")),
            "irr": IrrResult(value=Decimal("0.05"), null_reason=None, warnings=[], cashflow_count=6, has_exit=True, has_terminal_value=False),
        },
    }
    investments = [
        {"investment_id": str(inv_a), "name": "Inv A"},
        {"investment_id": str(inv_b), "name": "Inv B"},
    ]
    assets_by_inv = {
        inv_a: [{"asset_id": str(asset_a), "name": "A", "acquisition_date": "2024-01-01"}],
        inv_b: [{"asset_id": str(asset_b), "name": "B", "acquisition_date": "2024-01-01"}],
    }

    patches = _mock_patches(assets_by_id)
    with _mock_db(fund_id, investments, assets_by_inv):
        for p in patches:
            p.start()
        try:
            roll = compute_fund_rollup(fund_id, "2025-Q2")
        finally:
            for p in patches:
                p.stop()

    assert roll.irr is not None
    fund_irr_bps = float(roll.irr) * 10000

    marginals = [c.irr_marginal_bps for c in roll.asset_contributions if c.irr_marginal_bps is not None]
    assert marginals, "Expected LOO marginal values to be computed"
    total_marginal = sum(marginals)

    # The non-additivity gap must be non-trivial (at least 1 bps different).
    gap = abs(total_marginal - fund_irr_bps)
    assert gap > 1, (
        f"Expected sum(irr_marginal_bps)={total_marginal:.2f} to differ from "
        f"fund_irr_bps={fund_irr_bps:.2f} by >1bp, gap={gap:.4f}"
    )

    # Payload and dataclass both carry the non-additive flag.
    payload = fund_rollup_payload(roll)
    assert payload["non_additive"] is True
    assert "irr_contribution_by_investment" in payload


def test_canonical_metrics_includes_investment_level_contribution():
    """build_canonical_metrics_bottom_up writes irr_contribution_by_investment[].

    Each entry must have investment_id, irr_marginal_bps, asset_count, source.
    """
    fund_id = uuid4()
    inv_a, inv_b = uuid4(), uuid4()
    asset_a, asset_b = uuid4(), uuid4()

    assets_by_id = {
        asset_a: {
            "series": _asset_series(Decimal("400"), Decimal("800")),
            "irr": IrrResult(value=Decimal("0.35"), null_reason=None, warnings=[], cashflow_count=6, has_exit=True, has_terminal_value=False),
        },
        asset_b: {
            "series": _asset_series(Decimal("600"), Decimal("660")),
            "irr": IrrResult(value=Decimal("0.04"), null_reason=None, warnings=[], cashflow_count=6, has_exit=True, has_terminal_value=False),
        },
    }
    investments = [
        {"investment_id": str(inv_a), "name": "Inv A"},
        {"investment_id": str(inv_b), "name": "Inv B"},
    ]
    assets_by_inv = {
        inv_a: [{"asset_id": str(asset_a), "name": "A", "acquisition_date": "2024-01-01"}],
        inv_b: [{"asset_id": str(asset_b), "name": "B", "acquisition_date": "2024-01-01"}],
    }

    patches = _mock_patches(assets_by_id)
    with _mock_db(fund_id, investments, assets_by_inv):
        for p in patches:
            p.start()
        try:
            roll = compute_fund_rollup(fund_id, "2025-Q2")
        finally:
            for p in patches:
                p.stop()

    cm = build_canonical_metrics_bottom_up(roll, cf_series_hash="testhash")

    assert "irr_contribution_by_investment" in cm
    inv_contribs = cm["irr_contribution_by_investment"]
    assert len(inv_contribs) == 2

    for entry in inv_contribs:
        assert "investment_id" in entry
        assert "irr_marginal_bps" in entry
        assert "asset_count" in entry
        assert entry["source"] == "sum_child_asset_loo"

    # irr_contribution (asset-level) must also carry investment_id.
    for entry in cm["irr_contribution"]:
        assert "investment_id" in entry

    # non_additive_contribution flag must be set.
    assert cm["non_additive_contribution"] is True
