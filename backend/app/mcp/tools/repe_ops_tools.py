"""REPE Period Close & Fee Accrual MCP tools.

Read-only tools for querying period close status, fund quarter state,
fee schedules, and fee accruals.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_ops_tools import (
    ComputeFeesInput,
    FundQuarterStateInput,
    ListFeeScheduleInput,
    PeriodCloseStatusInput,
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


def _period_close_status(ctx: McpContext, inp: PeriodCloseStatusInput) -> dict:
    """Query re_run_provenance + re_fund_quarter_state for close status."""
    from app.db import get_cursor

    with get_cursor() as cur:
        # Close runs
        conditions = [
            """rp.fund_id IN (
                SELECT fund_id FROM repe_fund WHERE business_id = %s
            )""",
            "rp.run_type = 'QUARTER_CLOSE'",
        ]
        params: list = [inp.business_id]

        if inp.fund_id:
            conditions.append("rp.fund_id = %s")
            params.append(str(inp.fund_id))

        if inp.quarter:
            conditions.append("rp.metadata_json->>'quarter' = %s")
            params.append(inp.quarter)

        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT
              rp.id::text AS run_id,
              rp.fund_id::text,
              f.name AS fund_name,
              rp.metadata_json->>'quarter' AS quarter,
              rp.status,
              rp.triggered_by,
              rp.started_at::text,
              rp.completed_at::text,
              rp.error_message
            FROM re_run_provenance rp
            JOIN repe_fund f ON f.fund_id = rp.fund_id
            WHERE {where}
            ORDER BY rp.started_at DESC
            LIMIT 100
            """,
            params,
        )
        runs = cur.fetchall()

        # Latest fund quarter states
        cur.execute(
            """
            SELECT DISTINCT ON (fqs.fund_id)
              fqs.fund_id::text,
              f.name AS fund_name,
              fqs.quarter,
              fqs.portfolio_nav,
              fqs.tvpi,
              fqs.net_irr,
              fqs.created_at::text
            FROM re_fund_quarter_state fqs
            JOIN repe_fund f ON f.fund_id = fqs.fund_id
            WHERE f.business_id = %s AND fqs.scenario_id IS NULL
            ORDER BY fqs.fund_id, fqs.quarter DESC
            """,
            (inp.business_id,),
        )
        fund_states = cur.fetchall()

    emit_log(
        level="info",
        service="mcp",
        action="ops.period_close_status",
        message=f"Listed {len(runs)} close runs, {len(fund_states)} fund states",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "runs": runs,
        "fund_states": fund_states,
        "run_count": len(runs),
    })


def _fund_quarter_detail(ctx: McpContext, inp: FundQuarterStateInput) -> dict:
    """Detailed quarter state for a specific fund and quarter."""
    from app.db import get_cursor

    with get_cursor() as cur:
        # Fund info
        cur.execute(
            "SELECT fund_id::text, name, strategy, vintage_year FROM repe_fund WHERE fund_id = %s",
            (inp.fund_id,),
        )
        fund = cur.fetchone()
        if not fund:
            return {"error": "Fund not found", "fund_id": inp.fund_id}

        # Fund quarter state
        cur.execute(
            """
            SELECT
              quarter, portfolio_nav, total_committed, total_called,
              total_distributed, dpi, rvpi, tvpi, gross_irr, net_irr,
              weighted_ltv, weighted_dscr, created_at::text
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s AND scenario_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (inp.fund_id, inp.quarter),
        )
        quarter_state = cur.fetchone()

        # Asset-level states
        cur.execute(
            """
            SELECT
              aqs.asset_id::text,
              a.name AS asset_name,
              aqs.quarter,
              aqs.noi, aqs.revenue, aqs.opex, aqs.capex,
              aqs.debt_service, aqs.occupancy,
              aqs.debt_balance, aqs.cash_balance,
              aqs.asset_value, aqs.nav,
              aqs.valuation_method
            FROM re_asset_quarter_state aqs
            LEFT JOIN repe_asset a ON a.asset_id = aqs.asset_id
            WHERE aqs.quarter = %s
              AND aqs.scenario_id IS NULL
              AND aqs.run_id IN (
                SELECT id FROM re_run_provenance
                WHERE fund_id = %s AND run_type = 'QUARTER_CLOSE'
              )
            ORDER BY a.name
            """,
            (inp.quarter, inp.fund_id),
        )
        asset_states = cur.fetchall()

        # Close runs for this fund/quarter
        cur.execute(
            """
            SELECT
              id::text AS run_id, status, triggered_by,
              started_at::text, completed_at::text, error_message
            FROM re_run_provenance
            WHERE fund_id = %s AND run_type = 'QUARTER_CLOSE'
              AND metadata_json->>'quarter' = %s
            ORDER BY started_at DESC
            """,
            (inp.fund_id, inp.quarter),
        )
        close_runs = cur.fetchall()

    emit_log(
        level="info",
        service="mcp",
        action="ops.fund_quarter_detail",
        message=f"Fund quarter detail for {fund.get('name', inp.fund_id)} {inp.quarter}",
        context={"fund_id": inp.fund_id, "quarter": inp.quarter},
    )

    return _serialize({
        "fund": fund,
        "quarter": inp.quarter,
        "quarter_state": quarter_state,
        "asset_states": asset_states,
        "close_runs": close_runs,
        "asset_count": len(asset_states),
    })


def _list_fee_schedule(ctx: McpContext, inp: ListFeeScheduleInput) -> dict:
    """Query re_fee_policy + repe_fund for fee schedules."""
    from app.db import get_cursor

    with get_cursor() as cur:
        conditions = ["f.business_id = %s"]
        params: list = [inp.business_id]

        if inp.fund_id:
            conditions.append("fp.fund_id = %s")
            params.append(str(inp.fund_id))

        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT
              fp.id::text,
              fp.fund_id::text,
              f.name AS fund_name,
              fp.fee_basis,
              fp.annual_rate,
              fp.start_date::text,
              fp.stepdown_date::text,
              fp.stepdown_rate,
              fp.created_at::text
            FROM re_fee_policy fp
            JOIN repe_fund f ON f.fund_id = fp.fund_id
            WHERE {where}
            ORDER BY f.name, fp.fee_basis
            """,
            params,
        )
        policies = cur.fetchall()

        # Latest accrual per fund
        cur.execute(
            f"""
            SELECT
              faq.id::text,
              faq.fund_id::text,
              f.name AS fund_name,
              faq.quarter,
              faq.fee_basis,
              faq.base_amount,
              faq.annual_rate,
              faq.accrued_amount,
              faq.created_at::text
            FROM re_fee_accrual_qtr faq
            JOIN repe_fund f ON f.fund_id = faq.fund_id
            WHERE {where}
            ORDER BY faq.quarter DESC, f.name
            LIMIT 50
            """,
            params,
        )
        accruals = cur.fetchall()

    total_accrued = sum(
        Decimal(str(a.get("accrued_amount", 0) or 0)) for a in accruals
    )

    emit_log(
        level="info",
        service="mcp",
        action="ops.fee_schedule",
        message=f"Listed {len(policies)} fee policies, {len(accruals)} accruals",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "policies": policies,
        "accruals": accruals,
        "policy_count": len(policies),
        "total_accrued": str(total_accrued),
    })


def _compute_fees(ctx: McpContext, inp: ComputeFeesInput) -> dict:
    """Query re_fee_policy + re_fee_accrual_qtr for a fund/quarter."""
    from app.db import get_cursor

    with get_cursor() as cur:
        # Fund info
        cur.execute(
            "SELECT fund_id::text, name, strategy FROM repe_fund WHERE fund_id = %s",
            (inp.fund_id,),
        )
        fund = cur.fetchone()
        if not fund:
            return {"error": "Fund not found", "fund_id": inp.fund_id}

        # Fee policies
        cur.execute(
            """
            SELECT
              id::text, fee_basis, annual_rate,
              start_date::text, stepdown_date::text, stepdown_rate
            FROM re_fee_policy
            WHERE fund_id = %s
            ORDER BY fee_basis
            """,
            (inp.fund_id,),
        )
        policies = cur.fetchall()

        # Accruals for this quarter
        cur.execute(
            """
            SELECT
              id::text, fee_basis, base_amount, annual_rate, accrued_amount,
              created_at::text
            FROM re_fee_accrual_qtr
            WHERE fund_id = %s AND quarter = %s
            ORDER BY fee_basis
            """,
            (inp.fund_id, inp.quarter),
        )
        accruals = cur.fetchall()

        # Fund quarter state for context
        cur.execute(
            """
            SELECT portfolio_nav, total_committed, total_called
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s AND scenario_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (inp.fund_id, inp.quarter),
        )
        fund_state = cur.fetchone()

    total_accrued = sum(
        Decimal(str(a.get("accrued_amount", 0) or 0)) for a in accruals
    )

    emit_log(
        level="info",
        service="mcp",
        action="ops.compute_fees",
        message=f"Fee computation for {fund.get('name', inp.fund_id)} {inp.quarter}",
        context={"fund_id": inp.fund_id, "quarter": inp.quarter},
    )

    return _serialize({
        "fund": fund,
        "quarter": inp.quarter,
        "policies": policies,
        "accruals": accruals,
        "total_accrued": str(total_accrued),
        "fund_state": fund_state,
    })


# ── Registration ───────────────────────────────────────────────────────────────


def register_repe_ops_tools():
    """Register period close and fee accrual MCP tools."""

    registry.register(ToolDef(
        name="ops.period_close_status",
        description="List period close runs and latest fund quarter states for a business",
        module="bm",
        permission="read",
        input_model=PeriodCloseStatusInput,
        handler=_period_close_status,
    ))

    registry.register(ToolDef(
        name="ops.fund_quarter_detail",
        description="Get detailed quarter state for a specific fund including asset-level metrics and close history",
        module="bm",
        permission="read",
        input_model=FundQuarterStateInput,
        handler=_fund_quarter_detail,
    ))

    registry.register(ToolDef(
        name="ops.fee_schedule",
        description="List fee policies and recent accruals for funds in a business",
        module="bm",
        permission="read",
        input_model=ListFeeScheduleInput,
        handler=_list_fee_schedule,
    ))

    registry.register(ToolDef(
        name="ops.compute_fees",
        description="Get fee policies, accruals, and fund state for a specific fund and quarter",
        module="bm",
        permission="read",
        input_model=ComputeFeesInput,
        handler=_compute_fees,
    ))
