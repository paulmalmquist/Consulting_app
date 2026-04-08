"""Report Generation Service — IC Memos and LP Reports.

Generates structured report data from stored states.
No hidden math — all values come from persisted snapshots.
"""

from __future__ import annotations

from app.db import get_cursor
from app.observability.logger import emit_log


def generate_ic_memo(
    *, target_type: str, target_id: str, quarter: str
) -> dict:
    """Generate IC memo data for a fund or asset.

    Returns structured data for rendering — no computation.
    """
    if target_type == "fund":
        return _generate_fund_ic_memo(target_id, quarter)
    else:
        return _generate_asset_ic_memo(target_id, quarter)


def _generate_fund_ic_memo(fund_id: str, quarter: str) -> dict:
    """Generate fund-level IC memo."""
    from app.services.re_fund_aggregation import get_fund_summary

    summary = get_fund_summary(fund_id, quarter)

    # Get waterfall snapshot
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_waterfall_snapshot
            WHERE fin_fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (fund_id, quarter),
        )
        waterfall = cur.fetchone()

    # Get surveillance flags across assets (canonical: re_asset_quarter_state)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ss.fin_asset_investment_id, ss.risk_classification, ss.reason_codes
            FROM re_surveillance_snapshot ss
            WHERE ss.fin_asset_investment_id IN (
                SELECT DISTINCT a.asset_id
                FROM re_asset_quarter_state aqs
                JOIN repe_asset a ON a.asset_id = aqs.asset_id
                JOIN repe_deal d ON d.deal_id = a.deal_id
                WHERE d.fund_id = %s AND aqs.quarter = %s AND aqs.scenario_id IS NULL
            ) AND ss.quarter = %s
            ORDER BY ss.created_at DESC
            """,
            (fund_id, quarter, quarter),
        )
        surveillance = cur.fetchall()

    memo = {
        "type": "fund_ic_memo",
        "fund_id": fund_id,
        "quarter": quarter,
        "sections": {
            "executive_summary": {
                "portfolio_nav": str(summary["portfolio_nav"]),
                "tvpi": str(summary.get("tvpi")),
                "dpi": str(summary.get("dpi")),
                "weighted_ltv": str(summary.get("weighted_ltv")),
                "weighted_dscr": str(summary.get("weighted_dscr")),
            },
            "nav_drivers": summary.get("concentration_json"),
            "carry_status": summary.get("carry_summary_json"),
            "maturity_wall": summary.get("maturity_wall_json"),
            "surveillance_flags": [
                {
                    "asset_id": str(s["fin_asset_investment_id"]),
                    "classification": s["risk_classification"],
                    "flags": s.get("reason_codes", []),
                }
                for s in surveillance
            ],
            "waterfall_summary": {
                "gp_carry_earned": str(waterfall["gp_carry_earned"]) if waterfall else None,
                "clawback_exposure": str(waterfall["clawback_exposure"]) if waterfall else None,
            } if waterfall else None,
        },
    }

    emit_log(
        level="info",
        service="re_reports",
        action="ic_memo.generated",
        message=f"IC memo generated for fund {fund_id} {quarter}",
    )

    return memo


def _generate_asset_ic_memo(asset_id: str, quarter: str) -> dict:
    """Generate asset-level IC memo."""
    from app.services.re_valuation import get_asset_financial_state

    state = get_asset_financial_state(asset_id, quarter)

    return {
        "type": "asset_ic_memo",
        "asset_id": asset_id,
        "quarter": quarter,
        "sections": {
            "valuation": {
                "implied_gross_value": str(state["implied_gross_value"]),
                "nav_equity": str(state["nav_equity"]),
                "method": state.get("method_used"),
                "dscr": str(state.get("dscr")),
                "ltv": str(state.get("ltv")),
            },
            "operating": {
                "noi": str(state["net_operating_income"]),
                "occupancy": None,
            },
        },
    }


def generate_lp_report(
    *, investor_id: str, fund_id: str, quarter: str
) -> dict:
    """Generate LP report for an investor.

    All values from stored states — no hidden math.
    """
    from app.services.re_capital_accounts import get_investor_statement

    statement = get_investor_statement(investor_id, fund_id, quarter)

    report = {
        "type": "lp_report",
        "investor_id": investor_id,
        "fund_id": fund_id,
        "quarter": quarter,
        "capital_account": statement,
        "performance": {
            "dpi": statement["dpi"],
            "rvpi": statement["rvpi"],
            "tvpi": statement["tvpi"],
        },
    }

    emit_log(
        level="info",
        service="re_reports",
        action="lp_report.generated",
        message=f"LP report generated for investor {investor_id}",
    )

    return report
