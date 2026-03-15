"""REPE Capital Call & Distribution Workflow MCP tools.

Read-only tools for listing capital calls, retrieving call details,
listing distribution events, and retrieving distribution payouts.
"""
from __future__ import annotations

from decimal import Decimal

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_workflow_tools import (
    GetCapitalCallInput,
    GetDistributionInput,
    ListCapitalCallsInput,
    ListDistributionsInput,
)
from app.observability.logger import emit_log


def _serialize(obj):
    """Convert non-serializable types to JSON-safe values."""
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        return str(obj)
    if hasattr(obj, "hex"):
        return str(obj)
    return obj


# ── Handlers ───────────────────────────────────────────────────────────────────


def _list_capital_calls(ctx: McpContext, inp: ListCapitalCallsInput) -> dict:
    from app.db import get_cursor

    limit = min(inp.limit, 500)

    with get_cursor() as cur:
        conditions = [
            """cc.fund_id IN (
                SELECT fund_id FROM repe_fund WHERE business_id = %s
            )"""
        ]
        params: list = [inp.business_id]

        if inp.fund_id:
            conditions.append("cc.fund_id = %s")
            params.append(str(inp.fund_id))

        if inp.status:
            conditions.append("cc.status = %s")
            params.append(inp.status)

        where = " AND ".join(conditions)
        params.append(limit)

        cur.execute(
            f"""
            SELECT
              cc.call_id::text,
              cc.fund_id::text,
              f.name AS fund_name,
              cc.call_number,
              cc.call_date::text,
              cc.due_date::text,
              cc.amount_requested::text,
              cc.purpose,
              cc.status,
              cc.created_at::text,
              COUNT(c.contribution_id)::int AS contribution_count,
              COALESCE(SUM(c.amount_contributed), 0)::text AS total_contributed
            FROM fin_capital_call cc
            JOIN repe_fund f ON f.fund_id = cc.fund_id
            LEFT JOIN fin_contribution c ON c.call_id = cc.call_id
            WHERE {where}
            GROUP BY cc.call_id, f.name
            ORDER BY cc.call_date DESC
            LIMIT %s
            """,
            params,
        )
        calls = cur.fetchall()

    emit_log(
        level="info",
        service="mcp",
        action="finance.list_capital_calls",
        message=f"Listed {len(calls)} capital calls",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "capital_calls": calls,
        "count": len(calls),
    })


def _get_capital_call(ctx: McpContext, inp: GetCapitalCallInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        # Capital call detail
        cur.execute(
            """
            SELECT
              cc.call_id::text,
              cc.fund_id::text,
              f.name AS fund_name,
              cc.call_number,
              cc.call_date::text,
              cc.due_date::text,
              cc.amount_requested::text,
              cc.purpose,
              cc.status,
              cc.created_at::text
            FROM fin_capital_call cc
            JOIN repe_fund f ON f.fund_id = cc.fund_id
            WHERE cc.call_id = %s
            """,
            (inp.call_id,),
        )
        call = cur.fetchone()
        if not call:
            return {"error": "Capital call not found", "call_id": inp.call_id}

        # Contributions
        cur.execute(
            """
            SELECT
              c.contribution_id::text,
              c.partner_id::text,
              p.name AS partner_name,
              p.partner_type,
              c.contribution_date::text,
              c.amount_contributed::text,
              c.status,
              c.created_at::text
            FROM fin_contribution c
            JOIN re_partner p ON p.partner_id = c.partner_id
            WHERE c.call_id = %s
            ORDER BY p.name
            """,
            (inp.call_id,),
        )
        contributions = cur.fetchall()

    total_contributed = sum(
        Decimal(str(c.get("amount_contributed", "0"))) for c in contributions
    )
    amount_requested = Decimal(str(call.get("amount_requested", "0")))

    return _serialize({
        "call": call,
        "contributions": contributions,
        "totals": {
            "total_contributed": str(total_contributed),
            "outstanding": str(amount_requested - total_contributed),
            "contribution_count": len(contributions),
        },
    })


def _list_distributions(ctx: McpContext, inp: ListDistributionsInput) -> dict:
    from app.db import get_cursor

    limit = min(inp.limit, 500)

    with get_cursor() as cur:
        conditions = [
            """de.fund_id IN (
                SELECT fund_id FROM repe_fund WHERE business_id = %s
            )"""
        ]
        params: list = [inp.business_id]

        if inp.fund_id:
            conditions.append("de.fund_id = %s")
            params.append(str(inp.fund_id))

        if inp.status:
            conditions.append("de.status = %s")
            params.append(inp.status)

        if inp.event_type:
            conditions.append("de.event_type = %s")
            params.append(inp.event_type)

        where = " AND ".join(conditions)
        params.append(limit)

        cur.execute(
            f"""
            SELECT
              de.event_id::text,
              de.fund_id::text,
              f.name AS fund_name,
              de.event_type,
              de.total_amount::text,
              de.effective_date::text,
              de.status,
              de.created_at::text,
              COUNT(dp.payout_id)::int AS payout_count,
              COALESCE(SUM(dp.amount), 0)::text AS total_payouts
            FROM fin_distribution_event de
            JOIN repe_fund f ON f.fund_id = de.fund_id
            LEFT JOIN fin_distribution_payout dp ON dp.event_id = de.event_id
            WHERE {where}
            GROUP BY de.event_id, f.name
            ORDER BY de.effective_date DESC
            LIMIT %s
            """,
            params,
        )
        events = cur.fetchall()

    emit_log(
        level="info",
        service="mcp",
        action="finance.list_distributions",
        message=f"Listed {len(events)} distribution events",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "distributions": events,
        "count": len(events),
    })


def _get_distribution(ctx: McpContext, inp: GetDistributionInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        # Distribution event detail
        cur.execute(
            """
            SELECT
              de.event_id::text,
              de.fund_id::text,
              f.name AS fund_name,
              de.event_type,
              de.total_amount::text,
              de.effective_date::text,
              de.status,
              de.created_at::text
            FROM fin_distribution_event de
            JOIN repe_fund f ON f.fund_id = de.fund_id
            WHERE de.event_id = %s
            """,
            (inp.event_id,),
        )
        event = cur.fetchone()
        if not event:
            return {"error": "Distribution event not found", "event_id": inp.event_id}

        # Payouts
        cur.execute(
            """
            SELECT
              dp.payout_id::text,
              dp.partner_id::text,
              p.name AS partner_name,
              p.partner_type,
              dp.payout_type,
              dp.amount::text,
              dp.status,
              dp.created_at::text
            FROM fin_distribution_payout dp
            JOIN re_partner p ON p.partner_id = dp.partner_id
            WHERE dp.event_id = %s
            ORDER BY p.name, dp.payout_type
            """,
            (inp.event_id,),
        )
        payouts = cur.fetchall()

    # Aggregate by payout type
    by_type: dict[str, Decimal] = {}
    total_payouts = Decimal("0")
    for payout in payouts:
        amt = Decimal(str(payout.get("amount", "0")))
        pt = payout.get("payout_type", "unknown")
        by_type[pt] = by_type.get(pt, Decimal("0")) + amt
        total_payouts += amt

    return _serialize({
        "event": event,
        "payouts": payouts,
        "totals": {
            "total_payouts": str(total_payouts),
            "payout_count": len(payouts),
            "by_type": {k: str(v) for k, v in by_type.items()},
        },
    })


# ── Registration ───────────────────────────────────────────────────────────────


def register_repe_workflow_tools():
    """Register capital call and distribution workflow MCP tools."""

    registry.register(ToolDef(
        name="finance.list_capital_calls",
        description="List capital calls with contribution status for a business/fund",
        module="bm",
        permission="read",
        input_model=ListCapitalCallsInput,
        handler=_list_capital_calls,
    ))

    registry.register(ToolDef(
        name="finance.get_capital_call",
        description="Get capital call detail with per-partner contributions and outstanding balance",
        module="bm",
        permission="read",
        input_model=GetCapitalCallInput,
        handler=_get_capital_call,
    ))

    registry.register(ToolDef(
        name="finance.list_distributions",
        description="List distribution events with payout totals for a business/fund",
        module="bm",
        permission="read",
        input_model=ListDistributionsInput,
        handler=_list_distributions,
    ))

    registry.register(ToolDef(
        name="finance.get_distribution",
        description="Get distribution event detail with per-partner payouts and type breakdown",
        module="bm",
        permission="read",
        input_model=GetDistributionInput,
        handler=_get_distribution,
    ))
