"""REPE Investor & Capital Activity MCP tools.

Read-only tools for listing investors, retrieving investor summaries,
listing capital activity, and computing NAV rollforward bridges.
"""
from __future__ import annotations

from decimal import Decimal

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_investor_tools import (
    GetInvestorSummaryInput,
    ListCapitalActivityInput,
    ListInvestorsInput,
    NavRollforwardInput,
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


def _d(value) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


# ── Handlers ───────────────────────────────────────────────────────────────────


def _list_investors(ctx: McpContext, inp: ListInvestorsInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        conditions = ["p.business_id = %s"]
        params: list = [inp.business_id]

        if inp.fund_id:
            conditions.append("pc.fund_id = %s")
            params.append(str(inp.fund_id))

        if inp.partner_type:
            conditions.append("p.partner_type = %s")
            params.append(inp.partner_type)

        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT
              p.partner_id::text,
              p.name,
              p.partner_type,
              COUNT(DISTINCT pc.fund_id)::int AS fund_count,
              COALESCE(SUM(pc.committed_amount), 0)::text AS total_committed
            FROM re_partner p
            LEFT JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
            WHERE {where}
            GROUP BY p.partner_id
            ORDER BY p.name
            """,
            params,
        )
        investors = cur.fetchall()

    emit_log(
        level="info",
        service="mcp",
        action="finance.list_investors",
        message=f"Listed {len(investors)} investors",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "investors": investors,
        "count": len(investors),
    })


def _get_investor_summary(ctx: McpContext, inp: GetInvestorSummaryInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        # Partner profile
        cur.execute(
            "SELECT partner_id::text, name, partner_type FROM re_partner WHERE partner_id = %s",
            (str(inp.partner_id),),
        )
        partner = cur.fetchone()
        if not partner:
            return {"error": "Investor not found", "partner_id": str(inp.partner_id)}

        # Commitments
        cur.execute(
            """
            SELECT
              pc.fund_id::text, f.name AS fund_name, f.vintage_year, f.strategy,
              pc.committed_amount::text
            FROM re_partner_commitment pc
            JOIN repe_fund f ON f.fund_id = pc.fund_id
            WHERE pc.partner_id = %s
            ORDER BY f.name
            """,
            (str(inp.partner_id),),
        )
        commitments = cur.fetchall()

        # Quarter metrics per fund
        cur.execute(
            """
            SELECT
              pqm.fund_id::text, f.name AS fund_name, pqm.quarter,
              pqm.contributed_to_date::text AS contributed,
              pqm.distributed_to_date::text AS distributed,
              pqm.nav::text AS nav_share,
              pqm.dpi::text, pqm.tvpi::text, pqm.irr::text
            FROM re_partner_quarter_metrics pqm
            JOIN repe_fund f ON f.fund_id = pqm.fund_id
            WHERE pqm.partner_id = %s AND pqm.quarter = %s AND pqm.scenario_id IS NULL
            ORDER BY f.name
            """,
            (str(inp.partner_id), inp.quarter),
        )
        metrics = cur.fetchall()

    total_committed = sum(_d(c.get("committed_amount")) for c in commitments)
    total_contributed = sum(_d(m.get("contributed")) for m in metrics)
    total_distributed = sum(_d(m.get("distributed")) for m in metrics)

    return _serialize({
        "partner": partner,
        "commitments": commitments,
        "metrics": metrics,
        "totals": {
            "total_committed": str(total_committed),
            "total_contributed": str(total_contributed),
            "total_distributed": str(total_distributed),
        },
    })


def _list_capital_activity(ctx: McpContext, inp: ListCapitalActivityInput) -> dict:
    from app.db import get_cursor

    limit = min(inp.limit, 500)

    with get_cursor() as cur:
        conditions = [
            """cle.fund_id IN (
                SELECT fund_id FROM repe_fund WHERE business_id = %s
            )"""
        ]
        params: list = [inp.business_id]

        if inp.fund_id:
            conditions.append("cle.fund_id = %s")
            params.append(str(inp.fund_id))

        if inp.partner_id:
            conditions.append("cle.partner_id = %s")
            params.append(str(inp.partner_id))

        if inp.entry_type:
            conditions.append("cle.entry_type = %s")
            params.append(inp.entry_type)

        if inp.quarter:
            conditions.append("cle.quarter = %s")
            params.append(inp.quarter)

        where = " AND ".join(conditions)
        params.append(limit)

        cur.execute(
            f"""
            SELECT
              cle.entry_id::text,
              cle.fund_id::text,
              f.name AS fund_name,
              cle.partner_id::text,
              p.name AS partner_name,
              cle.entry_type,
              cle.amount_base::text AS amount,
              cle.effective_date::text,
              cle.quarter,
              cle.memo
            FROM re_capital_ledger_entry cle
            JOIN repe_fund f ON f.fund_id = cle.fund_id
            LEFT JOIN re_partner p ON p.partner_id = cle.partner_id
            WHERE {where}
            ORDER BY cle.effective_date DESC
            LIMIT %s
            """,
            params,
        )
        entries = cur.fetchall()

    # Compute totals by type
    totals: dict[str, Decimal] = {}
    for e in entries:
        t = e.get("entry_type", "unknown")
        totals[t] = totals.get(t, Decimal("0")) + _d(e.get("amount"))

    emit_log(
        level="info",
        service="mcp",
        action="finance.list_capital_activity",
        message=f"Listed {len(entries)} capital entries",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "entries": entries,
        "count": len(entries),
        "totals": {k: str(v) for k, v in totals.items()},
    })


def _nav_rollforward(ctx: McpContext, inp: NavRollforwardInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        # Fund quarter state for both periods
        cur.execute(
            """
            SELECT quarter, portfolio_nav, total_called, total_distributed,
                   total_committed, dpi, tvpi
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter IN (%s, %s) AND scenario_id IS NULL
            ORDER BY quarter
            """,
            (str(inp.fund_id), inp.quarter_from, inp.quarter_to),
        )
        states = {row["quarter"]: row for row in cur.fetchall()}

        # Investment-level NAV for both quarters
        cur.execute(
            """
            SELECT iqs.quarter, d.name AS investment_name, iqs.nav
            FROM re_investment_quarter_state iqs
            JOIN repe_deal d ON d.deal_id = iqs.investment_id
            WHERE iqs.fund_id = %s AND iqs.quarter IN (%s, %s)
              AND iqs.scenario_id IS NULL
            ORDER BY d.name
            """,
            (str(inp.fund_id), inp.quarter_from, inp.quarter_to),
        )
        inv_rows = cur.fetchall()

        # Capital ledger entries in the target quarter
        cur.execute(
            """
            SELECT entry_type, SUM(amount_base) AS total_amount
            FROM re_capital_ledger_entry
            WHERE fund_id = %s AND quarter = %s
            GROUP BY entry_type
            """,
            (str(inp.fund_id), inp.quarter_to),
        )
        ledger_totals = {row["entry_type"]: row["total_amount"] for row in cur.fetchall()}

    prior = states.get(inp.quarter_from, {})
    current = states.get(inp.quarter_to, {})

    prior_nav = _d(prior.get("portfolio_nav"))
    current_nav = _d(current.get("portfolio_nav"))
    nav_change = current_nav - prior_nav

    contributions = _d(ledger_totals.get("contribution") or ledger_totals.get("capital_call"))
    distributions = _d(ledger_totals.get("distribution"))
    fees = _d(ledger_totals.get("fee") or ledger_totals.get("management_fee"))
    valuation_change = nav_change - contributions + distributions + fees

    # Investment-level changes
    inv_from = {r["investment_name"]: _d(r.get("nav")) for r in inv_rows if r["quarter"] == inp.quarter_from}
    inv_to = {r["investment_name"]: _d(r.get("nav")) for r in inv_rows if r["quarter"] == inp.quarter_to}
    all_inv = sorted(set(inv_from.keys()) | set(inv_to.keys()))
    investment_changes = []
    for name in all_inv:
        prior_val = inv_from.get(name, Decimal("0"))
        curr_val = inv_to.get(name, Decimal("0"))
        delta = curr_val - prior_val
        if delta != 0:
            investment_changes.append({
                "investment": name,
                "prior_nav": str(prior_val),
                "current_nav": str(curr_val),
                "change": str(delta),
            })

    fund_name = ""
    with get_cursor() as cur:
        cur.execute("SELECT name FROM repe_fund WHERE fund_id = %s", (str(inp.fund_id),))
        row = cur.fetchone()
        if row:
            fund_name = row["name"]

    return _serialize({
        "fund_id": str(inp.fund_id),
        "fund_name": fund_name,
        "quarter_from": inp.quarter_from,
        "quarter_to": inp.quarter_to,
        "prior_nav": str(prior_nav),
        "current_nav": str(current_nav),
        "nav_change": str(nav_change),
        "nav_change_pct": str((nav_change / prior_nav * 100).quantize(Decimal("0.01"))) if prior_nav else "0",
        "bridge": [
            {"driver": "Beginning NAV", "amount": str(prior_nav)},
            {"driver": "Contributions", "amount": str(contributions)},
            {"driver": "Distributions", "amount": str(-distributions)},
            {"driver": "Fees & Expenses", "amount": str(-fees)},
            {"driver": "Valuation Changes", "amount": str(valuation_change)},
            {"driver": "Ending NAV", "amount": str(current_nav)},
        ],
        "investment_changes": investment_changes,
    })


# ── Registration ───────────────────────────────────────────────────────────────


def register_repe_investor_tools():
    """Register investor and capital activity MCP tools."""

    registry.register(ToolDef(
        name="finance.list_investors",
        description="List investors / LPs with commitment totals and fund counts for a business",
        module="bm",
        permission="read",
        input_model=ListInvestorsInput,
        handler=_list_investors,
    ))

    registry.register(ToolDef(
        name="finance.get_investor_summary",
        description="Get investor profile with per-fund commitments, contributions, distributions, and returns",
        module="bm",
        permission="read",
        input_model=GetInvestorSummaryInput,
        handler=_get_investor_summary,
    ))

    registry.register(ToolDef(
        name="finance.list_capital_activity",
        description="List capital ledger entries (calls, contributions, distributions, fees) with optional filters",
        module="bm",
        permission="read",
        input_model=ListCapitalActivityInput,
        handler=_list_capital_activity,
    ))

    registry.register(ToolDef(
        name="finance.nav_rollforward",
        description="Compute NAV rollforward bridge between two quarters showing contributions, distributions, fees, and valuation changes",
        module="bm",
        permission="read",
        input_model=NavRollforwardInput,
        handler=_nav_rollforward,
    ))
