"""Capital call / distribution notice MCP tools."""
from __future__ import annotations

from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.notice_tools import (
    GenerateCapitalCallNoticesInput,
    GenerateDistributionNoticesInput,
)


def _generate_capital_call_notices(ctx: McpContext, inp: GenerateCapitalCallNoticesInput) -> dict:
    from app.services.notice_generator import generate_capital_call_notices

    return generate_capital_call_notices(
        env_id=inp.env_id,
        business_id=UUID(inp.business_id),
        fund_id=inp.fund_id,
        call_entry_id=inp.call_entry_id,
    )


def _generate_distribution_notices(ctx: McpContext, inp: GenerateDistributionNoticesInput) -> dict:
    from app.services.notice_generator import generate_distribution_notices

    return generate_distribution_notices(
        env_id=inp.env_id,
        business_id=UUID(inp.business_id),
        fund_id=inp.fund_id,
        distribution_entry_id=inp.distribution_entry_id,
    )


def register_notice_tools():
    registry.register(ToolDef(
        name="finance.generate_capital_call_notices",
        description="Generate per-LP capital call notices with pro-rata amounts for a specific capital call event — creates notices in pending_review status for GP approval",
        module="bm",
        permission="write",
        input_model=GenerateCapitalCallNoticesInput,
        handler=_generate_capital_call_notices,
        tags=frozenset({"repe", "finance", "investor", "workflow", "write"}),
    ))
    registry.register(ToolDef(
        name="finance.generate_distribution_notices",
        description="Generate per-LP distribution notices with pro-rata amounts for a specific distribution event — creates notices in pending_review status for GP approval",
        module="bm",
        permission="write",
        input_model=GenerateDistributionNoticesInput,
        handler=_generate_distribution_notices,
        tags=frozenset({"repe", "finance", "investor", "workflow", "write"}),
    ))
