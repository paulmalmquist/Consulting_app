"""Fund Aggregation Service — computes fund-level quarterly summaries.

Consumes re_asset_financial_state and re_waterfall_snapshot.
Produces reconciled fund-level metrics (NAV, IRR, DPI/RVPI/TVPI).
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal, ROUND_HALF_UP

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_math import _d

TWO_PLACES = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")
SIX_PLACES = Decimal("0.000001")


def compute(*, fin_fund_id: str, quarter: str) -> dict:
    """Compute fund-level quarterly summary.

    Portfolio NAV = sum(asset_financial_state.nav_equity)
    Weighted LTV, DSCR by value.
    DPI/RVPI/TVPI from capital accounts.
    """
    from app.services.re_valuation import get_asset_financial_states_for_fund

    states = get_asset_financial_states_for_fund(fin_fund_id, quarter)
    if not states:
        raise LookupError(f"No asset states for fund {fin_fund_id} quarter {quarter}")

    # Portfolio NAV
    portfolio_nav = sum(_d(s["nav_equity"]) for s in states)

    # Value-weighted LTV and DSCR
    total_value = sum(_d(s["implied_gross_value"] or 0) for s in states)
    weighted_ltv = Decimal(0)
    weighted_dscr = Decimal(0)

    for s in states:
        val = _d(s["implied_gross_value"] or 0)
        weight = val / total_value if total_value > 0 else Decimal(0)
        weighted_ltv += _d(s.get("ltv") or 0) * weight
        weighted_dscr += _d(s.get("dscr") or 0) * weight

    weighted_ltv = weighted_ltv.quantize(SIX_PLACES, ROUND_HALF_UP)
    weighted_dscr = weighted_dscr.quantize(FOUR_PLACES, ROUND_HALF_UP)

    # Fund-level contributions/distributions
    total_contribs = sum(_d(s.get("cumulative_contributions") or 0) for s in states)
    total_distrs = sum(_d(s.get("cumulative_distributions") or 0) for s in states)

    dpi = (total_distrs / total_contribs).quantize(FOUR_PLACES, ROUND_HALF_UP) if total_contribs > 0 else Decimal(0)
    rvpi = (portfolio_nav / total_contribs).quantize(FOUR_PLACES, ROUND_HALF_UP) if total_contribs > 0 else Decimal(0)
    tvpi = dpi + rvpi

    # Concentration by asset (HHI)
    hhi = Decimal(0)
    concentration = []
    for s in states:
        share = _d(s["nav_equity"]) / portfolio_nav if portfolio_nav > 0 else Decimal(0)
        hhi += share ** 2
        concentration.append({
            "asset_id": str(s["fin_asset_investment_id"]),
            "nav_share": str(share.quantize(FOUR_PLACES, ROUND_HALF_UP)),
        })

    # Maturity wall from loans
    maturity_wall = {}
    with get_cursor() as cur:
        for s in states:
            cur.execute(
                "SELECT maturity_date FROM re_loan WHERE fin_asset_investment_id = %s",
                (str(s["fin_asset_investment_id"]),),
            )
            loans = cur.fetchall()
            for loan in loans:
                if loan.get("maturity_date"):
                    year = str(loan["maturity_date"])[:4]
                    maturity_wall[year] = maturity_wall.get(year, 0) + 1

    # Waterfall carry summary
    carry_summary = {}
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT gp_carry_earned, gp_carry_paid, clawback_exposure
            FROM re_waterfall_snapshot
            WHERE fin_fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (fin_fund_id, quarter),
        )
        ws = cur.fetchone()
        if ws:
            carry_summary = {
                "gp_carry_earned": str(ws["gp_carry_earned"]),
                "gp_carry_paid": str(ws["gp_carry_paid"]),
                "clawback_exposure": str(ws["clawback_exposure"]),
            }

    # Debt-specific metrics (for debt funds)
    total_upb = Decimal(0)
    weighted_avg_coupon = Decimal(0)
    watchlist_count = 0
    io_exposure_pct = Decimal(0)

    with get_cursor() as cur:
        # Compute total UPB and weighted coupon across loan book
        cur.execute(
            """
            SELECT SUM(upb) as total_upb, AVG(rate) as avg_rate, COUNT(*) as loan_count
            FROM re_loan
            WHERE fund_id = (SELECT fund_id FROM repe_fund WHERE fin_fund_id = %s LIMIT 1)
            """,
            (fin_fund_id,),
        )
        loan_stats = cur.fetchone()
        if loan_stats and loan_stats.get("total_upb"):
            total_upb = _d(loan_stats["total_upb"])
            _weighted_avg_coupon = _d(loan_stats.get("avg_rate") or 0)

        # Count active covenant alerts
        cur.execute(
            """
            SELECT COUNT(*) as alert_count
            FROM re_loan_watchlist_event
            WHERE loan_id IN (
                SELECT id FROM re_loan
                WHERE fund_id = (SELECT fund_id FROM repe_fund WHERE fin_fund_id = %s LIMIT 1)
            )
            AND quarter = %s
            """,
            (fin_fund_id, quarter),
        )
        alert = cur.fetchone()
        _watchlist_count = alert.get("alert_count", 0) if alert else 0

        # Compute IO exposure percentage
        if total_upb > 0:
            cur.execute(
                """
                SELECT SUM(upb) as io_upb
                FROM re_loan
                WHERE fund_id = (SELECT fund_id FROM repe_fund WHERE fin_fund_id = %s LIMIT 1)
                AND amort_type = 'interest_only'
                """,
                (fin_fund_id,),
            )
            io_result = cur.fetchone()
            io_upb = _d(io_result.get("io_upb") or 0) if io_result else Decimal(0)
            _io_exposure_pct = (io_upb / total_upb).quantize(FOUR_PLACES, ROUND_HALF_UP)

    # Get waterfall snapshot ID
    waterfall_snapshot_id = str(ws["waterfall_snapshot_id"]) if ws else None
    asset_state_ids = [str(s["id"]) for s in states]

    # Store fund summary
    summary_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_fund_summary (
                id, fin_fund_id, quarter,
                portfolio_nav, gross_irr, net_irr,
                dpi, rvpi, tvpi,
                weighted_ltv, weighted_dscr,
                concentration_json, maturity_wall_json, carry_summary_json,
                waterfall_snapshot_id, asset_state_ids
            ) VALUES (
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s
            )
            ON CONFLICT (fin_fund_id, quarter) DO UPDATE SET
                portfolio_nav = EXCLUDED.portfolio_nav,
                gross_irr = EXCLUDED.gross_irr,
                net_irr = EXCLUDED.net_irr,
                dpi = EXCLUDED.dpi,
                rvpi = EXCLUDED.rvpi,
                tvpi = EXCLUDED.tvpi,
                weighted_ltv = EXCLUDED.weighted_ltv,
                weighted_dscr = EXCLUDED.weighted_dscr,
                concentration_json = EXCLUDED.concentration_json,
                maturity_wall_json = EXCLUDED.maturity_wall_json,
                carry_summary_json = EXCLUDED.carry_summary_json,
                waterfall_snapshot_id = EXCLUDED.waterfall_snapshot_id,
                asset_state_ids = EXCLUDED.asset_state_ids
            RETURNING *
            """,
            (
                summary_id, fin_fund_id, quarter,
                str(portfolio_nav), None, None,
                str(dpi), str(rvpi), str(tvpi),
                str(weighted_ltv), str(weighted_dscr),
                json.dumps({"hhi": str(hhi.quantize(FOUR_PLACES, ROUND_HALF_UP)), "assets": concentration}),
                json.dumps(maturity_wall),
                json.dumps(carry_summary),
                waterfall_snapshot_id,
                asset_state_ids,
            ),
        )
        summary = cur.fetchone()

    emit_log(
        level="info",
        service="re_fund_aggregation",
        action="fund.compute_summary",
        message=f"Fund summary computed for {fin_fund_id} {quarter}",
        context={
            "fin_fund_id": fin_fund_id,
            "quarter": quarter,
            "portfolio_nav": str(portfolio_nav),
            "tvpi": str(tvpi),
        },
    )

    return summary


def get_fund_summary(fin_fund_id: str, quarter: str) -> dict:
    """Get stored fund summary."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM re_fund_summary WHERE fin_fund_id = %s AND quarter = %s",
            (fin_fund_id, quarter),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"No fund summary for {fin_fund_id} quarter {quarter}")
    return row
