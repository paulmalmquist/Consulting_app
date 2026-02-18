"""Reports module MCP tools."""

from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.report_tools import (
    ReportsCreateInput,
    ReportsExplainInput,
    ReportsGetInput,
    ReportsListInput,
    ReportsRunInput,
)
from app.services import reports as reports_svc


def _reports_create(ctx: McpContext, inp: ReportsCreateInput) -> dict:
    return reports_svc.create_report(
        business_id=inp.business_id,
        title=inp.title,
        description=inp.description,
        query=inp.query,
        is_draft=inp.is_draft,
    )


def _reports_list(ctx: McpContext, inp: ReportsListInput) -> dict:
    return {"reports": reports_svc.list_reports(business_id=inp.business_id)}


def _reports_get(ctx: McpContext, inp: ReportsGetInput) -> dict:
    row = reports_svc.get_report(business_id=inp.business_id, report_id=inp.report_id)
    if not row:
        raise LookupError("Report not found")
    return row


def _reports_run(ctx: McpContext, inp: ReportsRunInput) -> dict:
    return reports_svc.run_report(
        business_id=inp.business_id,
        report_id=inp.report_id,
        refresh=inp.refresh,
    )


def _reports_explain(ctx: McpContext, inp: ReportsExplainInput) -> dict:
    return reports_svc.explain_report_run(
        business_id=inp.business_id,
        report_id=inp.report_id,
        report_run_id=inp.report_run_id,
    )


def register_report_tools():
    registry.register(ToolDef(
        name="reports.create",
        description="Create and persist a report configuration",
        module="reports",
        permission="write",
        input_model=ReportsCreateInput,
        handler=_reports_create,
    ))
    registry.register(ToolDef(
        name="reports.list",
        description="List report definitions for a business",
        module="reports",
        permission="read",
        input_model=ReportsListInput,
        handler=_reports_list,
    ))
    registry.register(ToolDef(
        name="reports.get",
        description="Get a report with latest version config",
        module="reports",
        permission="read",
        input_model=ReportsGetInput,
        handler=_reports_get,
    ))
    registry.register(ToolDef(
        name="reports.run",
        description="Run a report and persist runtime/lineage metadata",
        module="reports",
        permission="write",
        input_model=ReportsRunInput,
        handler=_reports_run,
    ))
    registry.register(ToolDef(
        name="reports.explain",
        description="Explain report numbers down to source rows",
        module="reports",
        permission="read",
        input_model=ReportsExplainInput,
        handler=_reports_explain,
    ))
