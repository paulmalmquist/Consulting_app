"""LP Report MCP tools — quarterly report assembly and GP narrative generation."""
from __future__ import annotations

from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.lp_report_tools import (
    AssembleLpReportInput,
    GenerateGpNarrativeInput,
)


def _assemble_lp_report(ctx: McpContext, inp: AssembleLpReportInput) -> dict:
    from app.services.lp_report_assembler import assemble_lp_report

    return assemble_lp_report(
        env_id=inp.env_id,
        business_id=UUID(inp.business_id),
        fund_id=inp.fund_id,
        quarter=inp.quarter,
    )


def _generate_gp_narrative(ctx: McpContext, inp: GenerateGpNarrativeInput) -> dict:
    from app.services.lp_report_assembler import assemble_lp_report, generate_gp_narrative

    # First assemble the report data, then generate narrative
    report = assemble_lp_report(
        env_id=inp.env_id,
        business_id=UUID(inp.business_id),
        fund_id=inp.fund_id,
        quarter=inp.quarter,
    )
    narrative = generate_gp_narrative(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        report_data=report,
    )
    return {
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "narrative": narrative,
    }


def register_lp_report_tools():
    registry.register(ToolDef(
        name="finance.assemble_lp_report",
        description="Assemble a quarterly LP report: fund metrics, investor statements, asset highlights, capital activity, variance data — returns structured report ready for rendering",
        module="bm",
        permission="read",
        input_model=AssembleLpReportInput,
        handler=_assemble_lp_report,
        tags=frozenset({"repe", "finance", "report", "investor"}),
    ))
    registry.register(ToolDef(
        name="finance.generate_gp_narrative",
        description="Generate an AI-drafted GP narrative letter for a quarterly LP report using fund performance data and variance context",
        module="bm",
        permission="read",
        input_model=GenerateGpNarrativeInput,
        handler=_generate_gp_narrative,
        tags=frozenset({"repe", "finance", "report", "investor"}),
    ))
