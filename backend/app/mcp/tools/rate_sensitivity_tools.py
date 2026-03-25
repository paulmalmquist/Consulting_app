"""Rate sensitivity MCP tools — deal pipeline interest rate scenario analysis."""
from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.rate_sensitivity_tools import RunDealRateScenarioInput


def _run_deal_rate_scenario(ctx: McpContext, inp: RunDealRateScenarioInput) -> dict:
    from app.services.re_rate_sensitivity import run_deal_rate_scenario

    return run_deal_rate_scenario(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        rate_shock_bps=inp.rate_shock_bps,
        metric=inp.metric,
    )


def register_rate_sensitivity_tools():
    registry.register(ToolDef(
        name="repe.run_deal_rate_scenario",
        description="Apply interest rate shock scenarios to the deal pipeline. Returns IRR impact, adjusted NAV, debt service delta, and risk ratings for each deal — ready for IC review.",
        module="bm",
        permission="read",
        input_model=RunDealRateScenarioInput,
        handler=_run_deal_rate_scenario,
        tags=frozenset({"repe", "deals", "scenario", "pipeline"}),
    ))
