"""Quarterly LP Report Assembler.

Aggregates data from fund metrics, investor statements, NOI variance,
and asset highlights into a structured LP report object.
"""
from __future__ import annotations

import json
from uuid import UUID

from app.config import AI_GATEWAY_ENABLED, OPENAI_API_KEY, OPENAI_CHAT_MODEL_STANDARD
from app.db import get_cursor
from app.observability.logger import emit_log


def assemble_lp_report(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
) -> dict:
    """Assemble a complete quarterly LP report.

    Gathers data from multiple sources and returns a structured report object
    ready for rendering or PDF export.
    """
    with get_cursor() as cur:
        # Fund metadata
        cur.execute(
            "SELECT fund_code, name, strategy, vintage_date, pref_rate, carry_rate, waterfall_style FROM repe_fund WHERE fund_id = %s",
            (str(fund_id),),
        )
        fund = cur.fetchone()
        if not fund:
            raise LookupError(f"Fund {fund_id} not found")

        # Fund quarter state
        cur.execute(
            """
            SELECT * FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        fund_state = cur.fetchone()

        # Investor statements
        cur.execute(
            """
            SELECT pm.*, p.name AS partner_name, p.partner_type
            FROM re_partner_quarter_metrics pm
            JOIN re_partner p ON p.partner_id = pm.partner_id
            WHERE pm.fund_id = %s AND pm.quarter = %s AND pm.scenario_id IS NULL
            ORDER BY p.name
            """,
            (str(fund_id), quarter),
        )
        investor_metrics = cur.fetchall()

        # Asset highlights — quarter state for all assets in the fund
        cur.execute(
            """
            SELECT aqs.*, a.name AS asset_name, a.asset_type
            FROM re_asset_quarter_state aqs
            JOIN repe_asset a ON a.asset_id = aqs.asset_id
            WHERE aqs.fund_id = %s AND aqs.quarter = %s
            ORDER BY a.name
            """,
            (str(fund_id), quarter),
        )
        asset_states = cur.fetchall()

        # Capital activity for the quarter
        cur.execute(
            """
            SELECT entry_type, SUM(amount_base) AS total_amount, COUNT(*) AS event_count
            FROM re_capital_ledger_entry
            WHERE fund_id = %s AND quarter = %s
            GROUP BY entry_type
            ORDER BY entry_type
            """,
            (str(fund_id), quarter),
        )
        capital_summary = cur.fetchall()

        # NOI variance data
        cur.execute(
            """
            SELECT v.*, a.name AS asset_name
            FROM re_asset_variance_qtr v
            JOIN repe_asset a ON a.asset_id = v.asset_id
            WHERE v.fund_id = %s AND v.quarter = %s
            ORDER BY ABS(COALESCE(v.variance_pct, 0)) DESC
            LIMIT 10
            """,
            (str(fund_id), quarter),
        )
        variance_data = cur.fetchall()

    # Build fund summary
    fund_summary = _build_fund_summary(fund, fund_state)

    # Build investor statements
    investor_statements = [
        {
            "partner_name": im["partner_name"],
            "partner_type": im["partner_type"],
            "contributed": _dec(im.get("contributed_to_date")),
            "distributed": _dec(im.get("distributed_to_date")),
            "nav": _dec(im.get("nav")),
            "dpi": _dec(im.get("dpi")),
            "tvpi": _dec(im.get("tvpi")),
            "irr": _dec(im.get("irr")),
        }
        for im in investor_metrics
    ]

    # Build asset highlights
    asset_highlights = [
        {
            "asset_name": a["asset_name"],
            "asset_type": a.get("asset_type"),
            "noi": _dec(a.get("noi")),
            "occupancy": _dec(a.get("occupancy")),
            "asset_value": _dec(a.get("asset_value")),
            "revenue": _dec(a.get("revenue")),
            "opex": _dec(a.get("opex")),
        }
        for a in asset_states
    ]

    # Build capital activity summary
    capital_activity = [
        {
            "type": c["entry_type"],
            "total_amount": _dec(c["total_amount"]),
            "event_count": c["event_count"],
        }
        for c in capital_summary
    ]

    # Build variance highlights
    variance_highlights = [
        {
            "asset_name": v["asset_name"],
            "line_code": v.get("line_code"),
            "budget_amount": _dec(v.get("budget_amount")),
            "actual_amount": _dec(v.get("actual_amount")),
            "variance": _dec(v.get("variance")),
            "variance_pct": _dec(v.get("variance_pct")),
        }
        for v in variance_data
    ]

    # Persist report
    report_id = _persist_report(
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        quarter=quarter,
        report_data={
            "fund_name": fund["name"],
            "fund_summary": fund_summary,
            "investor_statements": investor_statements,
            "asset_highlights": asset_highlights,
            "capital_activity": capital_activity,
            "variance_highlights": variance_highlights,
        },
    )

    emit_log(
        level="info",
        service="backend",
        action="lp_report.assemble",
        message=f"LP report assembled: {fund['name']} {quarter}",
        context={"fund_id": str(fund_id), "quarter": quarter, "investors": len(investor_statements), "assets": len(asset_highlights)},
    )

    return {
        "report_id": report_id,
        "fund_id": str(fund_id),
        "fund_name": fund["name"],
        "quarter": quarter,
        "status": "draft",
        "fund_summary": fund_summary,
        "investor_statements": investor_statements,
        "asset_highlights": asset_highlights,
        "capital_activity": capital_activity,
        "variance_highlights": variance_highlights,
    }


def generate_gp_narrative(
    *,
    fund_id: UUID,
    quarter: str,
    report_data: dict,
) -> str:
    """Generate a GP narrative letter section using AI."""
    if not AI_GATEWAY_ENABLED:
        raise RuntimeError("AI Gateway disabled: set OPENAI_API_KEY")

    import openai

    fund_summary = report_data.get("fund_summary", {})
    variance_highlights = report_data.get("variance_highlights", [])
    capital_activity = report_data.get("capital_activity", [])

    context = json.dumps({
        "fund_summary": fund_summary,
        "top_variances": variance_highlights[:5],
        "capital_activity": capital_activity,
    }, default=str)

    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_CHAT_MODEL_STANDARD,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a GP writing the quarterly letter to LPs for a real estate private equity fund. "
                    "Be professional, concise, and data-driven. Reference specific metrics. "
                    "Structure: 1) Fund performance overview, 2) Notable asset events, "
                    "3) Key variance explanations, 4) Capital activity summary, 5) Forward outlook. "
                    "Keep under 500 words."
                ),
            },
            {
                "role": "user",
                "content": f"Draft the GP narrative for {quarter} based on this data:\n{context}",
            },
        ],
        temperature=0.3,
        max_tokens=1500,
    )
    narrative = response.choices[0].message.content or ""

    # Update the report record with narrative
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_lp_report SET narrative_text = %s
            WHERE fund_id = %s AND quarter = %s AND status = 'draft'
            ORDER BY created_at DESC LIMIT 1
            """,
            (narrative, str(fund_id), quarter),
        )

    return narrative


def _build_fund_summary(fund: dict, fund_state: dict | None) -> dict:
    """Build the fund summary metrics section."""
    if not fund_state:
        return {
            "fund_name": fund["name"],
            "strategy": fund["strategy"],
            "nav": 0, "total_committed": 0, "total_called": 0, "total_distributed": 0,
            "gross_irr": 0, "net_irr": 0, "tvpi": 0, "dpi": 0, "rvpi": 0,
        }
    return {
        "fund_name": fund["name"],
        "strategy": fund["strategy"],
        "vintage": str(fund.get("vintage_date", "")),
        "pref_rate": _dec(fund.get("pref_rate")),
        "carry_rate": _dec(fund.get("carry_rate")),
        "nav": _dec(fund_state.get("portfolio_nav")),
        "total_committed": _dec(fund_state.get("total_committed")),
        "total_called": _dec(fund_state.get("total_called")),
        "total_distributed": _dec(fund_state.get("total_distributed")),
        "gross_irr": _dec(fund_state.get("gross_irr")),
        "net_irr": _dec(fund_state.get("net_irr")),
        "tvpi": _dec(fund_state.get("tvpi")),
        "dpi": _dec(fund_state.get("dpi")),
        "rvpi": _dec(fund_state.get("rvpi")),
        "weighted_ltv": _dec(fund_state.get("weighted_ltv")),
        "weighted_dscr": _dec(fund_state.get("weighted_dscr")),
    }


def _persist_report(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    report_data: dict,
) -> str:
    """Save report to re_lp_report."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_lp_report (env_id, business_id, fund_id, quarter, status, report_json, generated_by)
            VALUES (%s, %s, %s, %s, 'draft', %s::jsonb, 'winston')
            ON CONFLICT (fund_id, quarter, status) DO UPDATE SET report_json = EXCLUDED.report_json, created_at = now()
            RETURNING id
            """,
            (env_id, str(business_id), str(fund_id), quarter, json.dumps(report_data, default=str)),
        )
        row = cur.fetchone()
        return str(row["id"])


def _dec(value) -> float:
    """Convert Decimal/None to float."""
    if value is None:
        return 0.0
    return float(value)
