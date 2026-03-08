"""REPE Finance MCP tools — composite tools wrapping deterministic engines.

These tools are available both to the fast-path (direct execution) and
to the LLM tool-calling loop (graceful fallback).
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import AuditPolicy, ToolDef, registry
from app.mcp.schemas.repe_finance_tools import (
    CompareScenariosInput,
    FundMetricsInput,
    LpSummaryInput,
    RunSaleScenarioInput,
    RunWaterfallInput,
    StressCapRateInput,
)
from app.observability.logger import emit_log


def _serialize(obj):
    """Convert non-serializable types to JSON-safe values."""
    from decimal import Decimal as _Decimal

    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, _Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        return str(obj)
    if hasattr(obj, "hex"):
        return str(obj)
    return obj


# ── Tool handlers ────────────────────────────────────────────────────────────


def _run_sale_scenario(ctx: McpContext, inp: RunSaleScenarioInput) -> dict:
    """Run a sale scenario and return base vs scenario metrics with deltas."""
    from app.services.re_sale_scenario import compute_scenario_metrics, create_sale_assumption
    from app.db import get_cursor
    from datetime import date
    from uuid import uuid4

    fund_id = inp.fund_id
    quarter = inp.quarter
    env_id = inp.env_id
    business_id = inp.business_id

    # If no scenario_id, create a temp scenario
    scenario_id = inp.scenario_id
    if not scenario_id:
        # Create temporary scenario in re_model_scenarios
        scenario_id = uuid4()
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO re_model_scenarios (scenario_id, model_id, name, description, is_base, status)
                VALUES (%s, NULL, %s, %s, false, 'temp')
                ON CONFLICT DO NOTHING
                """,
                (str(scenario_id), "Temp Sale Scenario", "Auto-created by Winston fast-path"),
            )

    # If sale_price is provided, create the sale assumption
    if inp.sale_price:
        deal_id = inp.deal_id or inp.asset_id  # fallback
        if deal_id:
            sale_date = date.fromisoformat(inp.sale_date) if inp.sale_date else _quarter_end(quarter)
            create_sale_assumption(
                fund_id=fund_id,
                scenario_id=scenario_id,
                deal_id=deal_id,
                asset_id=inp.asset_id,
                sale_price=Decimal(str(inp.sale_price)),
                sale_date=sale_date,
                memo="Auto-created by Winston fast-path",
            )

    result = compute_scenario_metrics(
        env_id=env_id,
        business_id=UUID(business_id),
        fund_id=fund_id,
        scenario_id=scenario_id,
        quarter=quarter,
    )

    emit_log(
        level="info", service="backend", action="finance.run_sale_scenario",
        message=f"Sale scenario computed for fund {fund_id}",
        context={"fund_id": str(fund_id), "quarter": quarter},
    )

    return _serialize(result)


def _run_waterfall(ctx: McpContext, inp: RunWaterfallInput) -> dict:
    """Run waterfall distribution for a fund quarter."""
    from app.services.re_waterfall_runtime import run_waterfall

    result = run_waterfall(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
    )

    emit_log(
        level="info", service="backend", action="finance.run_waterfall",
        message=f"Waterfall executed for fund {inp.fund_id}",
        context={"fund_id": str(inp.fund_id), "quarter": inp.quarter},
    )

    return _serialize(result)


def _fund_metrics(ctx: McpContext, inp: FundMetricsInput) -> dict:
    """Retrieve fund-level metrics for a specific quarter."""
    from app.db import get_cursor

    with get_cursor() as cur:
        # Get latest metrics for the fund+quarter
        cur.execute(
            """
            SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi, cash_on_cash
            FROM re_fund_metrics_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (inp.env_id, inp.business_id, str(inp.fund_id), inp.quarter),
        )
        metrics_row = cur.fetchone()

        # Get fund state (NAV, called, distributed)
        cur.execute(
            """
            SELECT portfolio_nav, total_called, total_distributed
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(inp.fund_id), inp.quarter),
        )
        state_row = cur.fetchone()

        # Get gross-net bridge
        cur.execute(
            """
            SELECT gross_return, mgmt_fees, fund_expenses, carry_shadow, net_return
            FROM re_gross_net_bridge_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (inp.env_id, inp.business_id, str(inp.fund_id), inp.quarter),
        )
        bridge_row = cur.fetchone()

    result = {
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "metrics": _serialize(dict(metrics_row)) if metrics_row else {},
        "state": _serialize(dict(state_row)) if state_row else {},
        "gross_net_bridge": _serialize(dict(bridge_row)) if bridge_row else {},
    }

    return result


def _stress_cap_rate(ctx: McpContext, inp: StressCapRateInput) -> dict:
    """Stress test cap rate across a fund's assets."""
    from app.db import get_cursor

    delta_bps = inp.cap_rate_delta_bps
    delta_decimal = Decimal(str(delta_bps)) / Decimal("10000")

    with get_cursor() as cur:
        # Get current fund metrics (base case)
        cur.execute(
            """
            SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi
            FROM re_fund_metrics_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (inp.env_id, inp.business_id, str(inp.fund_id), inp.quarter),
        )
        base_metrics = cur.fetchone()

        # Get asset valuations with cap rates
        cur.execute(
            """
            SELECT vs.asset_id, vs.valuation_amount, vs.cap_rate,
                   a.name AS asset_name
            FROM re_valuation_snapshot vs
            JOIN repe_asset a ON a.asset_id = vs.asset_id
            WHERE vs.fund_id = %s AND vs.quarter = %s
            ORDER BY vs.valuation_amount DESC
            """,
            (str(inp.fund_id), inp.quarter),
        )
        assets = cur.fetchall()

    # Calculate stressed valuations
    stressed_assets = []
    total_base_nav = Decimal("0")
    total_stressed_nav = Decimal("0")

    for asset in assets:
        base_val = Decimal(str(asset["valuation_amount"])) if asset.get("valuation_amount") else Decimal("0")
        base_cap = Decimal(str(asset["cap_rate"])) if asset.get("cap_rate") else None

        total_base_nav += base_val

        if base_cap and base_cap > 0 and base_val > 0:
            # NOI = value * cap_rate, stressed_value = NOI / (cap_rate + delta)
            noi = base_val * base_cap
            stressed_cap = base_cap + delta_decimal
            stressed_val = (noi / stressed_cap).quantize(Decimal("0.01")) if stressed_cap > 0 else base_val
            nav_impact = stressed_val - base_val
        else:
            stressed_val = base_val
            nav_impact = Decimal("0")

        total_stressed_nav += stressed_val
        stressed_assets.append({
            "asset_id": str(asset["asset_id"]),
            "asset_name": asset.get("asset_name", "Unknown"),
            "base_valuation": float(base_val),
            "stressed_valuation": float(stressed_val),
            "nav_impact": float(nav_impact),
            "base_cap_rate": float(base_cap) if base_cap else None,
            "stressed_cap_rate": float(base_cap + delta_decimal) if base_cap else None,
        })

    nav_delta = total_stressed_nav - total_base_nav
    nav_delta_pct = float((nav_delta / total_base_nav * Decimal("100")).quantize(Decimal("0.01"))) if total_base_nav > 0 else 0

    return {
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "cap_rate_delta_bps": delta_bps,
        "base_nav": float(total_base_nav),
        "stressed_nav": float(total_stressed_nav),
        "nav_delta": float(nav_delta),
        "nav_delta_pct": nav_delta_pct,
        "base_metrics": _serialize(dict(base_metrics)) if base_metrics else {},
        "assets": stressed_assets,
    }


def _compare_scenarios(ctx: McpContext, inp: CompareScenariosInput) -> dict:
    """Compare multiple scenarios side-by-side."""
    from app.db import get_cursor

    results = []
    with get_cursor() as cur:
        for sid in inp.scenario_ids:
            cur.execute(
                """
                SELECT scenario_id, quarter, gross_irr, net_irr,
                       gross_tvpi, net_tvpi, dpi, rvpi,
                       total_distributed, portfolio_nav, carry_estimate
                FROM re_scenario_metrics_snapshot
                WHERE fund_id = %s AND scenario_id = %s AND quarter = %s
                ORDER BY computed_at DESC LIMIT 1
                """,
                (str(inp.fund_id), sid, inp.quarter),
            )
            row = cur.fetchone()
            if row:
                results.append(_serialize(dict(row)))

    return {
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "scenarios": results,
        "scenario_count": len(results),
    }


def _lp_summary(ctx: McpContext, inp: LpSummaryInput) -> dict:
    """Build consolidated LP summary with capital accounts and waterfall."""
    from app.services.re_sale_scenario import get_lp_summary

    result = get_lp_summary(
        env_id=inp.env_id,
        business_id=UUID(inp.business_id),
        fund_id=inp.fund_id,
        quarter=inp.quarter,
    )

    return _serialize(result)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _quarter_end(quarter: str):
    """Convert YYYYQN to end-of-quarter date."""
    from datetime import date
    year = int(quarter[:4])
    q = int(quarter[-1])
    month = q * 3
    if month == 3:
        return date(year, 3, 31)
    elif month == 6:
        return date(year, 6, 30)
    elif month == 9:
        return date(year, 9, 30)
    else:
        return date(year, 12, 31)


# ── Registration ─────────────────────────────────────────────────────────────

def register_repe_finance_tools():
    """Register all REPE finance composite tools."""

    registry.register(ToolDef(
        name="finance.run_sale_scenario",
        description="Run a hypothetical sale scenario for an asset/deal and compute IRR/TVPI impact vs base case",
        module="bm",
        permission="read",
        input_model=RunSaleScenarioInput,
        handler=_run_sale_scenario,
    ))

    registry.register(ToolDef(
        name="finance.run_waterfall",
        description="Run waterfall distribution (return of capital, preferred return, catch-up, carry split) for a fund quarter",
        module="bm",
        permission="read",
        input_model=RunWaterfallInput,
        handler=_run_waterfall,
    ))

    registry.register(ToolDef(
        name="finance.fund_metrics",
        description="Get fund-level performance metrics (IRR, TVPI, DPI, RVPI, NAV) for a specific quarter",
        module="bm",
        permission="read",
        input_model=FundMetricsInput,
        handler=_fund_metrics,
    ))

    registry.register(ToolDef(
        name="finance.stress_cap_rate",
        description="Stress test cap rate expansion across all assets in a fund and show NAV impact",
        module="bm",
        permission="read",
        input_model=StressCapRateInput,
        handler=_stress_cap_rate,
    ))

    registry.register(ToolDef(
        name="finance.compare_scenarios",
        description="Compare multiple scenario snapshots side-by-side with deltas",
        module="bm",
        permission="read",
        input_model=CompareScenariosInput,
        handler=_compare_scenarios,
    ))

    registry.register(ToolDef(
        name="finance.lp_summary",
        description="Build consolidated LP summary with capital accounts, partner returns, and waterfall allocations",
        module="bm",
        permission="read",
        input_model=LpSummaryInput,
        handler=_lp_summary,
    ))
