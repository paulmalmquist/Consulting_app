"""Tests for the bulk asset CF refresh helper.

``refresh_all_asset_cf_series`` is the entry point used by the runner before
fund rollup. It iterates per-asset, calls
``refresh_asset_cf_series_materialized`` for each, and aggregates the
results into an ``AssetRefreshSummary`` with null counts and capital-weighted
null share. Tests stub the per-asset refresh so we can drive the path without
DB fixtures and assert the aggregation rules cleanly.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

from app.services.bottom_up_cashflow import CFPoint
from app.services.bottom_up_refresh import (
    AssetRefreshOutcome,
    AssetRefreshSummary,
    MaterializedSeries,
    refresh_all_asset_cf_series,
)


def _series(
    *,
    has_acquisition: bool = True,
    has_inflow: bool = True,
    points: int = 8,
    source_hash: str = "deadbeef",
) -> MaterializedSeries:
    pts: list[CFPoint] = []
    if has_acquisition:
        pts.append(
            CFPoint(
                quarter="2024Q1",
                quarter_end_date=date(2024, 3, 31),
                amount=Decimal("-10000000"),
                component_breakdown={"acquisition": -10_000_000.0},
                has_actual=False,
                has_projection=False,
                has_exit=False,
                has_terminal_value=False,
                warnings=[],
            )
        )
    if has_inflow:
        for i in range(points - 1):
            q = f"2024Q{i + 2}" if i < 3 else f"2025Q{i - 2}"
            pts.append(
                CFPoint(
                    quarter=q,
                    quarter_end_date=date(2024, 6, 30),
                    amount=Decimal("100000"),
                    component_breakdown={"operating_actual": 100_000.0},
                    has_actual=True,
                    has_projection=False,
                    has_exit=False,
                    has_terminal_value=False,
                    warnings=[],
                )
            )
    return MaterializedSeries(
        asset_id=uuid4(),
        as_of_quarter="2026Q2",
        points=pts,
        source_hash=source_hash,
        computed_at=datetime.now(timezone.utc),
        is_stale=False,
        staleness_seconds=0,
        exceeded_hard_ttl=False,
    )


def test_all_assets_refresh_cleanly_zero_null_share():
    asset_ids = [uuid4() for _ in range(4)]
    cost_basis = {aid: Decimal("10000000") for aid in asset_ids}

    def fake_refresh(asset_id, *_args, **_kwargs):
        s = _series()
        return MaterializedSeries(
            asset_id=asset_id,
            as_of_quarter=s.as_of_quarter,
            points=s.points,
            source_hash=s.source_hash,
            computed_at=s.computed_at,
            is_stale=False,
            staleness_seconds=0,
            exceeded_hard_ttl=False,
        )

    def fake_lookup(asset_id):
        return cost_basis[asset_id]

    with patch(
        "app.services.bottom_up_refresh.refresh_asset_cf_series_materialized",
        fake_refresh,
    ), patch(
        "app.services.bottom_up_refresh._lookup_acquisition_value",
        fake_lookup,
    ):
        summary = refresh_all_asset_cf_series(asset_ids, "2026Q2")

    assert isinstance(summary, AssetRefreshSummary)
    assert summary.total_assets == 4
    assert len(summary.refreshed) == 4
    assert summary.failed == []
    assert summary.null_count == 0
    assert summary.null_value_share == Decimal("0")


def test_one_failed_asset_drives_null_share_by_capital():
    """null_value_share must weight by acquisition value, not asset count."""
    big = uuid4()
    small1 = uuid4()
    small2 = uuid4()
    small3 = uuid4()
    cost_basis = {
        big: Decimal("90000000"),
        small1: Decimal("10000000"),
        small2: Decimal("10000000"),
        small3: Decimal("10000000"),
    }

    def fake_refresh(asset_id, *_args, **_kwargs):
        if asset_id == big:
            raise ValueError("missing acquisition for asset_id=...")
        return _series()

    def fake_lookup(asset_id):
        return cost_basis[asset_id]

    with patch(
        "app.services.bottom_up_refresh.refresh_asset_cf_series_materialized",
        fake_refresh,
    ), patch(
        "app.services.bottom_up_refresh._lookup_acquisition_value",
        fake_lookup,
    ):
        summary = refresh_all_asset_cf_series(
            [big, small1, small2, small3], "2026Q2"
        )

    assert summary.null_count == 1
    # 90M / 120M = 0.75
    assert summary.null_value_share == Decimal("0.750000")
    assert len(summary.refreshed) == 3
    assert len(summary.failed) == 1
    assert summary.failed[0].null_reason == "missing_acquisition"


def test_value_error_message_classifies_null_reason():
    """The helper translates ValueError messages into structured reasons."""
    cases = [
        ("asset xyz not found", "asset_not_found"),
        ("missing acquisition row for foo", "missing_acquisition"),
        ("invalid cap_rate config", "invalid_cap_rate"),
        ("something else broke", "refresh_failed"),
    ]

    aid = uuid4()
    for msg, expected_reason in cases:
        def fake_refresh(asset_id, *_args, _msg=msg, **_kwargs):
            raise ValueError(_msg)

        with patch(
            "app.services.bottom_up_refresh.refresh_asset_cf_series_materialized",
            fake_refresh,
        ), patch(
            "app.services.bottom_up_refresh._lookup_acquisition_value",
            lambda _aid: Decimal("1000000"),
        ):
            summary = refresh_all_asset_cf_series([aid], "2026Q2")

        assert summary.null_count == 1
        assert summary.failed[0].null_reason == expected_reason, (
            f"msg={msg!r} expected={expected_reason} got={summary.failed[0].null_reason}"
        )


def test_asset_with_no_inflow_is_flagged_null_but_kept_in_refreshed():
    aid = uuid4()

    def fake_refresh(asset_id, *_args, **_kwargs):
        return _series(has_inflow=False, points=1)

    with patch(
        "app.services.bottom_up_refresh.refresh_asset_cf_series_materialized",
        fake_refresh,
    ), patch(
        "app.services.bottom_up_refresh._lookup_acquisition_value",
        lambda _aid: Decimal("5000000"),
    ):
        summary = refresh_all_asset_cf_series([aid], "2026Q2")

    # The series exists but has no inflow → null_reason is set but outcome
    # still lands in `failed` (null_count counts it). Caller can distinguish
    # this from a hard refresh exception via outcome.cf_point_count.
    assert summary.null_count == 1
    assert summary.failed[0].null_reason == "no_inflow"
    assert summary.failed[0].cf_point_count == 1


def test_empty_asset_set_returns_empty_summary():
    summary = refresh_all_asset_cf_series([], "2026Q2")

    assert summary.total_assets == 0
    assert summary.null_count == 0
    assert summary.null_value_share == Decimal("0")
