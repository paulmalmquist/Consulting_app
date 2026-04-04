"""IRR timeline, capital timeline, IRR contribution, and model preview services."""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def get_irr_timeline(*, fund_id: UUID, env_id: str, business_id: UUID) -> list[dict]:
    """Return quarterly gross/net IRR from re_fund_quarter_state, ordered chronologically."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT quarter, gross_irr, net_irr, portfolio_nav, dpi, tvpi
            FROM re_fund_quarter_state
            WHERE fund_id = %s
            ORDER BY quarter ASC
            """,
            (str(fund_id),),
        )
        rows = cur.fetchall()
    emit_log(level="info", service="backend", action="re.irr_timeline.fetched",
             message=f"IRR timeline: {len(rows)} quarters",
             context={"fund_id": str(fund_id), "env_id": env_id, "row_count": len(rows), "query": "re_fund_quarter_state"})
    if not rows:
        emit_log(level="warning", service="backend", action="re.irr_timeline.empty",
                 message="IRR timeline empty — no snapshot rows found for fund",
                 context={"fund_id": str(fund_id), "env_id": env_id, "query": "re_fund_quarter_state",
                          "failure_reason": "NO_SNAPSHOT"})
    return [
        {
            "quarter": r["quarter"],
            "gross_irr": str(r["gross_irr"]) if r["gross_irr"] is not None else None,
            "net_irr": str(r["net_irr"]) if r["net_irr"] is not None else None,
            "portfolio_nav": str(r["portfolio_nav"]) if r["portfolio_nav"] is not None else None,
            "dpi": str(r["dpi"]) if r["dpi"] is not None else None,
            "tvpi": str(r["tvpi"]) if r["tvpi"] is not None else None,
        }
        for r in rows
    ]


def get_capital_timeline(*, fund_id: UUID, env_id: str, business_id: UUID) -> list[dict]:
    """Return quarterly called/distributed aggregates from re_partner_quarter_metrics."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT quarter,
                   COALESCE(SUM(contributed), 0) AS total_called,
                   COALESCE(SUM(distributed), 0) AS total_distributed
            FROM re_partner_quarter_metrics
            WHERE fund_id = %s
            GROUP BY quarter
            ORDER BY quarter ASC
            """,
            (str(fund_id),),
        )
        rows = cur.fetchall()
    emit_log(level="info", service="backend", action="re.capital_timeline.fetched",
             message=f"Capital timeline: {len(rows)} quarters",
             context={"fund_id": str(fund_id), "env_id": env_id, "row_count": len(rows), "query": "re_partner_quarter_metrics"})
    if not rows:
        emit_log(level="warning", service="backend", action="re.capital_timeline.empty",
                 message="Capital timeline empty — no partner metrics rows found for fund",
                 context={"fund_id": str(fund_id), "env_id": env_id, "query": "re_partner_quarter_metrics",
                          "failure_reason": "NO_SNAPSHOT"})
    return [
        {
            "quarter": r["quarter"],
            "total_called": str(r["total_called"]),
            "total_distributed": str(r["total_distributed"]),
        }
        for r in rows
    ]


def get_irr_contribution(*, fund_id: UUID, env_id: str, business_id: UUID, quarter: str) -> list[dict]:
    """Return per-investment IRR contribution for a fund in a given quarter."""
    with get_cursor() as cur:
        # Try to get irr_contribution column; fall back to approximation via NAV contribution
        cur.execute(
            """
            SELECT iqm.investment_id,
                   i.name AS investment_name,
                   iqm.irr AS investment_irr,
                   iqm.tvpi AS investment_tvpi,
                   iqm.fund_nav_contribution,
                   iqm.irr_contribution
            FROM re_investment_quarter_metrics iqm
            JOIN re_investment i ON i.investment_id = iqm.investment_id
            WHERE iqm.fund_id = %s AND iqm.quarter = %s
            ORDER BY COALESCE(iqm.irr_contribution, iqm.fund_nav_contribution, 0) DESC
            """,
            (str(fund_id), quarter),
        )
        rows = cur.fetchall()
    emit_log(level="info", service="backend", action="re.irr_contribution.fetched",
             message=f"IRR contribution: {len(rows)} investments",
             context={"fund_id": str(fund_id), "env_id": env_id, "quarter": quarter,
                      "row_count": len(rows), "query": "re_investment_quarter_metrics"})
    if not rows:
        emit_log(level="warning", service="backend", action="re.irr_contribution.empty",
                 message="IRR contribution empty — no investment metrics rows found for fund/quarter",
                 context={"fund_id": str(fund_id), "env_id": env_id, "quarter": quarter,
                          "query": "re_investment_quarter_metrics", "failure_reason": "NO_SNAPSHOT"})
    return [
        {
            "investment_id": str(r["investment_id"]),
            "investment_name": r["investment_name"],
            "investment_irr": str(r["investment_irr"]) if r.get("investment_irr") is not None else None,
            "investment_tvpi": str(r["investment_tvpi"]) if r.get("investment_tvpi") is not None else None,
            "fund_nav_contribution": str(r["fund_nav_contribution"]) if r.get("fund_nav_contribution") is not None else None,
            "irr_contribution": str(r["irr_contribution"]) if r.get("irr_contribution") is not None else None,
        }
        for r in rows
    ]


def compute_model_preview(
    *,
    fund_id: UUID,
    env_id: str,
    business_id: UUID,
    quarter: str,
    assumptions: list[dict],
) -> dict:
    """Given hypothetical assumptions per investment, return projected metrics.

    Each assumption dict: { investment_id, cap_rate, rent_growth, hold_years, exit_value }
    This is a lightweight projection that estimates NAV/IRR/DPI/TVPI/carry changes.
    """
    with get_cursor() as cur:
        # Get current fund state as baseline
        cur.execute(
            """
            SELECT portfolio_nav, total_committed, total_called, total_distributed,
                   gross_irr, net_irr, dpi, tvpi
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        baseline = cur.fetchone()
        if not baseline:
            raise LookupError(f"No fund state for fund {fund_id} quarter {quarter}")

        # Get fund terms for carry calculation
        cur.execute(
            "SELECT carry_rate, preferred_return_rate FROM re_fund_terms WHERE fund_id = %s ORDER BY created_at DESC LIMIT 1",
            (str(fund_id),),
        )
        terms = cur.fetchone()
        carry_rate = Decimal(str(terms["carry_rate"])) if terms and terms.get("carry_rate") else Decimal("0.20")
        pref_rate = Decimal(str(terms["preferred_return_rate"])) if terms and terms.get("preferred_return_rate") else Decimal("0.08")

    base_nav = Decimal(str(baseline["portfolio_nav"] or 0))
    total_committed = Decimal(str(baseline["total_committed"] or 0))
    total_called = Decimal(str(baseline["total_called"] or 0))
    total_distributed = Decimal(str(baseline["total_distributed"] or 0))

    # Sum exit values from assumptions to estimate new NAV
    total_exit = sum(Decimal(str(a.get("exit_value", 0))) for a in assumptions)
    projected_nav = base_nav + total_exit - base_nav if total_exit > 0 else base_nav

    # Rough projected metrics
    projected_distributed = total_distributed + total_exit
    projected_dpi = projected_distributed / total_called if total_called > 0 else Decimal("0")
    projected_tvpi = (projected_distributed + projected_nav) / total_called if total_called > 0 else Decimal("0")

    # Estimate carry: (total value - committed - pref) * carry_rate
    total_value = projected_distributed + projected_nav
    hurdle = total_committed * (1 + pref_rate)
    carry_base = max(total_value - hurdle, Decimal("0"))
    carry_estimate = carry_base * carry_rate

    # Rough IRR approximation stays same as baseline since we can't do full time-value calc
    gross_irr = baseline.get("gross_irr")
    net_irr = baseline.get("net_irr")

    result = {
        "fund_id": str(fund_id),
        "quarter": quarter,
        "baseline_nav": str(base_nav),
        "projected_nav": str(projected_nav),
        "projected_dpi": str(projected_dpi),
        "projected_tvpi": str(projected_tvpi),
        "projected_gross_irr": str(gross_irr) if gross_irr else None,
        "projected_net_irr": str(net_irr) if net_irr else None,
        "carry_estimate": str(carry_estimate),
        "assumption_count": len(assumptions),
    }
    emit_log(level="info", service="backend", action="re.model_preview.computed",
             message="Model preview computed", context={"fund_id": str(fund_id)})
    return result
