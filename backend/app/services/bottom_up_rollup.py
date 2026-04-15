"""Investment and fund aggregation for the bottom-up CF engine.

Asset-level CFs live in `bottom_up_cashflow.py`. This module sums them
(ownership-weighted per quarter) into investment series, then into fund series,
and computes IRR + IRR-contribution at each level.

Two-track rule (locked):
  * Fund Asset-Level Gross IRR — IRR of sum(asset_cf × ownership) over property CFs.
    Written to canonical_metrics.gross_irr_bottom_up.
  * Fund Investor IRR — IRR of capital calls + distributions. Separate, not touched here.

Marginal IRR contribution is **non-additive**: sum(irr_marginal_bps) ≠ fund_irr.
The response carries a `non_additive: true` flag and tests enforce it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.finance.irr_engine import xirr
from app.services.bottom_up_cashflow import (
    CFPoint,
    build_asset_cf_series,
    compute_asset_irr,
    quarter_end_date,
    resolve_ownership_pct,
)


@dataclass
class AssetContribution:
    asset_id: UUID
    name: str
    ownership_pct_as_of: float
    asset_irr: Decimal | None
    asset_null_reason: str | None
    value_share: float | None  # abs(sum_pos_asset) / abs(sum_pos_fund)
    irr_marginal_bps: float | None  # leave-one-out delta in bps
    irr_weighted_bps: float | None  # weighted approximation in bps


@dataclass
class InvestmentRollup:
    investment_id: UUID
    as_of_quarter: str
    series: list[CFPoint]
    irr: Decimal | None
    null_reason: str | None
    warnings: list[str] = field(default_factory=list)
    asset_contributions: list[AssetContribution] = field(default_factory=list)


@dataclass
class FundRollup:
    fund_id: UUID
    as_of_quarter: str
    series: list[CFPoint]
    irr: Decimal | None
    null_reason: str | None
    warnings: list[str] = field(default_factory=list)
    investment_contributions: list[dict[str, Any]] = field(default_factory=list)
    asset_contributions: list[AssetContribution] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Investment rollup
# ---------------------------------------------------------------------------


def _list_investment_assets(cur, investment_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT asset_id, name, acquisition_date
        FROM repe_asset
        WHERE deal_id = %s
        ORDER BY created_at
        """,
        [str(investment_id)],
    )
    return cur.fetchall() or []


def _list_fund_investments(cur, fund_id: UUID) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT deal_id AS investment_id, name
        FROM repe_deal
        WHERE fund_id = %s
        ORDER BY created_at
        """,
        [str(fund_id)],
    )
    return cur.fetchall() or []


def _merge_series(
    dest: dict[str, CFPoint], src: list[CFPoint], *, weight: Decimal
) -> None:
    """Merge weight-scaled `src` points into `dest` keyed by quarter."""
    for p in src:
        scaled = p.amount * weight
        if p.quarter in dest:
            dest[p.quarter].amount += scaled
            # Preserve has-* flags as the OR of contributors.
            dest[p.quarter].has_actual = dest[p.quarter].has_actual or p.has_actual
            dest[p.quarter].has_projection = (
                dest[p.quarter].has_projection or p.has_projection
            )
            dest[p.quarter].has_exit = dest[p.quarter].has_exit or p.has_exit
            dest[p.quarter].has_terminal_value = (
                dest[p.quarter].has_terminal_value or p.has_terminal_value
            )
            for w in p.warnings:
                if w not in dest[p.quarter].warnings:
                    dest[p.quarter].warnings.append(w)
        else:
            dest[p.quarter] = CFPoint(
                quarter=p.quarter,
                quarter_end_date=p.quarter_end_date,
                amount=scaled,
                component_breakdown={},
                has_actual=p.has_actual,
                has_projection=p.has_projection,
                has_exit=p.has_exit,
                has_terminal_value=p.has_terminal_value,
                warnings=list(p.warnings),
            )


def _xirr_from_series(series: list[CFPoint]) -> Decimal | None:
    cashflows = [(p.quarter_end_date, p.amount) for p in series if p.amount != 0]
    if len(cashflows) < 2:
        return None
    has_pos = any(a > 0 for _, a in cashflows)
    has_neg = any(a < 0 for _, a in cashflows)
    if not (has_pos and has_neg):
        return None
    result = xirr(cashflows)
    return (
        Decimal(str(result)).quantize(Decimal("0.000001")) if result is not None else None
    )


def compute_investment_rollup(
    investment_id: UUID,
    as_of_quarter: str,
    *,
    env_default_cap_rate: Decimal | None = None,
) -> InvestmentRollup:
    """Sum ownership-weighted child-asset CFs and compute investment IRR.

    Nulls on child assets do not automatically null the investment. They
    contribute zero CF and are logged in `asset_contributions` with their
    own `asset_null_reason`. Only if **every** child is null (or the summed
    series lacks both positive and negative CFs) does the investment IRR null.
    """
    with get_cursor() as cur:
        assets = _list_investment_assets(cur, investment_id)

    if not assets:
        return InvestmentRollup(
            investment_id=investment_id,
            as_of_quarter=as_of_quarter,
            series=[],
            irr=None,
            null_reason="no_child_assets",
        )

    merged: dict[str, CFPoint] = {}
    contribs: list[AssetContribution] = []
    null_child_count = 0

    for a in assets:
        asset_id = a["asset_id"]
        if isinstance(asset_id, str):
            asset_id = UUID(asset_id)
        # Ownership % as of the as-of quarter end. For mid-hold changes, we
        # re-resolve per-quarter inside the weight loop below.
        as_of_end = quarter_end_date(as_of_quarter)
        pct_as_of = resolve_ownership_pct(asset_id, as_of_end)

        asset_series = build_asset_cf_series(
            asset_id, as_of_quarter, env_default_cap_rate=env_default_cap_rate
        )
        asset_irr = compute_asset_irr(
            asset_id, as_of_quarter, series=asset_series,
            env_default_cap_rate=env_default_cap_rate,
        )
        if asset_irr.null_reason and asset_irr.value is None:
            null_child_count += 1

        # Scale per-quarter by ownership_pct effective at that quarter end.
        weighted: list[CFPoint] = []
        for p in asset_series:
            pct = resolve_ownership_pct(asset_id, p.quarter_end_date)
            weighted.append(
                CFPoint(
                    quarter=p.quarter,
                    quarter_end_date=p.quarter_end_date,
                    amount=p.amount * pct,
                    component_breakdown=p.component_breakdown,
                    has_actual=p.has_actual,
                    has_projection=p.has_projection,
                    has_exit=p.has_exit,
                    has_terminal_value=p.has_terminal_value,
                    warnings=list(p.warnings),
                )
            )
        _merge_series(merged, weighted, weight=Decimal("1"))

        contribs.append(
            AssetContribution(
                asset_id=asset_id,
                name=a.get("name") or "(unnamed)",
                ownership_pct_as_of=float(pct_as_of),
                asset_irr=asset_irr.value,
                asset_null_reason=asset_irr.null_reason,
                value_share=None,  # filled by contribution pass
                irr_marginal_bps=None,
                irr_weighted_bps=None,
            )
        )

    series = sorted(merged.values(), key=lambda p: p.quarter_end_date)
    irr = _xirr_from_series(series)
    warnings: list[str] = []
    for p in series:
        for w in p.warnings:
            if w not in warnings:
                warnings.append(w)

    null_reason: str | None = None
    if irr is None:
        if null_child_count == len(assets):
            null_reason = "all_children_null"
        else:
            null_reason = "insufficient_sign_changes"

    return InvestmentRollup(
        investment_id=investment_id,
        as_of_quarter=as_of_quarter,
        series=series,
        irr=irr,
        null_reason=null_reason,
        warnings=warnings,
        asset_contributions=contribs,
    )


# ---------------------------------------------------------------------------
# Fund rollup
# ---------------------------------------------------------------------------


def compute_fund_rollup(
    fund_id: UUID,
    as_of_quarter: str,
    *,
    env_default_cap_rate: Decimal | None = None,
    compute_contributions: bool = True,
) -> FundRollup:
    """Sum investment series into fund series. Compute gross bottom-up IRR.

    Fund gross bottom-up IRR uses asset CFs only — capital calls and
    distributions are intentionally excluded (that's the separate investor IRR
    path). Net IRR / carry / gp_share remain out-of-scope and return null with
    null_reason `out_of_scope_requires_waterfall` in the snapshot writer.
    """
    with get_cursor() as cur:
        investments = _list_fund_investments(cur, fund_id)

    if not investments:
        return FundRollup(
            fund_id=fund_id,
            as_of_quarter=as_of_quarter,
            series=[],
            irr=None,
            null_reason="no_investments",
        )

    merged: dict[str, CFPoint] = {}
    inv_contribs: list[dict[str, Any]] = []
    all_asset_contribs: list[AssetContribution] = []
    null_inv_count = 0

    inv_rollups: list[tuple[UUID, str, InvestmentRollup]] = []
    for inv in investments:
        iid = inv["investment_id"]
        if isinstance(iid, str):
            iid = UUID(iid)
        roll = compute_investment_rollup(
            iid, as_of_quarter, env_default_cap_rate=env_default_cap_rate
        )
        inv_rollups.append((iid, inv.get("name") or "(unnamed)", roll))
        if roll.irr is None and roll.null_reason:
            null_inv_count += 1
        _merge_series(merged, roll.series, weight=Decimal("1"))
        for c in roll.asset_contributions:
            all_asset_contribs.append(c)

    series = sorted(merged.values(), key=lambda p: p.quarter_end_date)
    irr = _xirr_from_series(series)

    warnings: list[str] = []
    for p in series:
        for w in p.warnings:
            if w not in warnings:
                warnings.append(w)

    null_reason: str | None = None
    if irr is None:
        null_reason = (
            "all_investments_null"
            if null_inv_count == len(investments)
            else "insufficient_sign_changes"
        )

    # IRR contribution — value_share + marginal + weighted.
    if compute_contributions and irr is not None:
        fund_pos_total = sum(
            (p.amount for p in series if p.amount > 0), Decimal(0)
        )
        # Per-asset: compute leave-one-out by removing that asset's weighted
        # series from the fund series, then re-XIRRing.
        # Build a (asset_id -> weighted series) map for O(N) leave-one-out.
        asset_weighted: dict[UUID, list[CFPoint]] = {}
        for iid, _iname, roll in inv_rollups:
            for c in roll.asset_contributions:
                # Re-derive the asset's ownership-weighted contribution the
                # cheap way: its per-quarter CF scaled already landed in the
                # investment rollup. We approximate leave-one-out by rebuilding
                # its weighted series.
                series_points = build_asset_cf_series(
                    c.asset_id,
                    as_of_quarter,
                    env_default_cap_rate=env_default_cap_rate,
                )
                weighted = []
                for p in series_points:
                    pct = resolve_ownership_pct(c.asset_id, p.quarter_end_date)
                    weighted.append(
                        CFPoint(
                            quarter=p.quarter,
                            quarter_end_date=p.quarter_end_date,
                            amount=p.amount * pct,
                            component_breakdown=p.component_breakdown,
                        )
                    )
                asset_weighted[c.asset_id] = weighted

        for c in all_asset_contribs:
            w_series = asset_weighted.get(c.asset_id, [])
            asset_pos = sum(
                (p.amount for p in w_series if p.amount > 0), Decimal(0)
            )
            c.value_share = (
                float(asset_pos / fund_pos_total)
                if fund_pos_total > 0 and asset_pos > 0
                else 0.0
            )
            # Leave-one-out IRR delta.
            loo_points: dict[str, Decimal] = {}
            for p in series:
                loo_points[p.quarter] = p.amount
            for wp in w_series:
                if wp.quarter in loo_points:
                    loo_points[wp.quarter] -= wp.amount
            loo_series_cfs = [
                (quarter_end_date(q), amt)
                for q, amt in sorted(
                    loo_points.items(), key=lambda kv: quarter_end_date(kv[0])
                )
                if amt != 0
            ]
            loo_irr: Decimal | None = None
            if len(loo_series_cfs) >= 2:
                has_pos = any(a > 0 for _, a in loo_series_cfs)
                has_neg = any(a < 0 for _, a in loo_series_cfs)
                if has_pos and has_neg:
                    r = xirr(loo_series_cfs)
                    loo_irr = (
                        Decimal(str(r)).quantize(Decimal("0.000001"))
                        if r is not None
                        else None
                    )
            if loo_irr is not None:
                c.irr_marginal_bps = float((irr - loo_irr) * 10000)
            # Weighted approximation — asset standalone IRR * value_share.
            if c.asset_irr is not None and c.value_share is not None:
                c.irr_weighted_bps = float(c.asset_irr * Decimal(c.value_share) * 10000)

    # Per-investment contribution rollup for the fund page table.
    for iid, iname, roll in inv_rollups:
        inv_pos = sum((p.amount for p in roll.series if p.amount > 0), Decimal(0))
        fund_pos = sum((p.amount for p in series if p.amount > 0), Decimal(0))
        inv_contribs.append(
            {
                "investment_id": str(iid),
                "name": iname,
                "irr": float(roll.irr) if roll.irr is not None else None,
                "null_reason": roll.null_reason,
                "value_share": float(inv_pos / fund_pos)
                if fund_pos > 0 and inv_pos > 0
                else 0.0,
                "asset_count": len(roll.asset_contributions),
                "null_asset_count": sum(
                    1 for c in roll.asset_contributions if c.asset_null_reason
                ),
            }
        )

    return FundRollup(
        fund_id=fund_id,
        as_of_quarter=as_of_quarter,
        series=series,
        irr=irr,
        null_reason=null_reason,
        warnings=warnings,
        investment_contributions=inv_contribs,
        asset_contributions=all_asset_contribs,
    )


# ---------------------------------------------------------------------------
# Payload helpers for the API layer
# ---------------------------------------------------------------------------


def investment_rollup_payload(roll: InvestmentRollup) -> dict[str, Any]:
    return {
        "investment_id": str(roll.investment_id),
        "as_of_quarter": roll.as_of_quarter,
        "series": [
            {
                "quarter": p.quarter,
                "quarter_end_date": p.quarter_end_date.isoformat(),
                "amount": float(p.amount),
                "has_actual": p.has_actual,
                "has_projection": p.has_projection,
                "has_exit": p.has_exit,
                "has_terminal_value": p.has_terminal_value,
                "warnings": p.warnings,
            }
            for p in roll.series
        ],
        "irr": float(roll.irr) if roll.irr is not None else None,
        "null_reason": roll.null_reason,
        "warnings": roll.warnings,
        "asset_contributions": [
            {
                "asset_id": str(c.asset_id),
                "name": c.name,
                "ownership_pct_as_of": c.ownership_pct_as_of,
                "asset_irr": float(c.asset_irr) if c.asset_irr is not None else None,
                "asset_null_reason": c.asset_null_reason,
            }
            for c in roll.asset_contributions
        ],
    }


def fund_rollup_payload(roll: FundRollup) -> dict[str, Any]:
    return {
        "fund_id": str(roll.fund_id),
        "as_of_quarter": roll.as_of_quarter,
        "series": [
            {
                "quarter": p.quarter,
                "quarter_end_date": p.quarter_end_date.isoformat(),
                "amount": float(p.amount),
                "has_actual": p.has_actual,
                "has_projection": p.has_projection,
                "has_exit": p.has_exit,
                "has_terminal_value": p.has_terminal_value,
                "warnings": p.warnings,
            }
            for p in roll.series
        ],
        "gross_irr_bottom_up": float(roll.irr) if roll.irr is not None else None,
        "null_reason": roll.null_reason,
        "warnings": roll.warnings,
        "investment_contributions": roll.investment_contributions,
        "irr_contribution": [
            {
                "asset_id": str(c.asset_id),
                "name": c.name,
                "value_share": c.value_share,
                "irr_marginal_bps": c.irr_marginal_bps,
                "irr_weighted_bps": c.irr_weighted_bps,
                "asset_irr": float(c.asset_irr) if c.asset_irr is not None else None,
                "asset_null_reason": c.asset_null_reason,
                "ownership_pct_as_of": c.ownership_pct_as_of,
            }
            for c in roll.asset_contributions
        ],
        # Non-additivity is a contract, not an implementation detail.
        "non_additive": True,
        "non_additive_note": "irr_marginal_bps values are leave-one-out deltas; they do NOT sum to gross_irr_bottom_up.",
    }


# ---------------------------------------------------------------------------
# Authoritative snapshot write helper
# ---------------------------------------------------------------------------


def build_canonical_metrics_bottom_up(
    roll: FundRollup,
    *,
    cf_series_hash: str,
) -> dict[str, Any]:
    """Assemble the canonical_metrics patch for fund-level authoritative
    snapshots. Writers merge this into the existing canonical_metrics payload.

    Net / carry / gp_share stay NULL with null_reason=out_of_scope_requires_waterfall.
    """
    return {
        "gross_irr_bottom_up": float(roll.irr) if roll.irr is not None else None,
        "gross_irr_bottom_up_null_reason": roll.null_reason,
        "cf_series_hash": cf_series_hash,
        "has_complete_cf": roll.irr is not None
        and all(c["null_reason"] is None for c in roll.investment_contributions),
        "irr_contribution": [
            {
                "asset_id": str(c.asset_id),
                "name": c.name,
                "value_share": c.value_share,
                "irr_marginal_bps": c.irr_marginal_bps,
                "irr_weighted_bps": c.irr_weighted_bps,
            }
            for c in roll.asset_contributions
        ],
        "non_additive_contribution": True,
    }
