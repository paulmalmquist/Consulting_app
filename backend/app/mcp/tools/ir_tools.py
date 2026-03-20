"""IR (Investor Relations) MCP tools — LP letter drafting, capital statements, and approval."""
from __future__ import annotations

from uuid import UUID

from app.mcp.audit import ConfirmRequired
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.ir_tools import (
    ApproveDraftInput,
    DraftLpLetterInput,
    GenerateCapitalStatementsInput,
    GetDraftInput,
    ListDraftsInput,
    RejectDraftInput,
)


def _draft_lp_letter(ctx: McpContext, inp: DraftLpLetterInput) -> dict:
    from app.services.lp_report_assembler import assemble_lp_report, generate_gp_narrative
    from app.services.ir_drafts import create_draft

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
    draft = create_draft(
        env_id=inp.env_id,
        business_id=inp.business_id,
        fund_id=str(inp.fund_id),
        quarter=inp.quarter,
        draft_type="lp_letter",
        content_json=report,
        narrative_text=narrative,
    )
    return draft


def _generate_capital_statements(ctx: McpContext, inp: GenerateCapitalStatementsInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        cur.execute(
            """SELECT pm.*, p.name AS partner_name, p.partner_type
               FROM re_partner_quarter_metrics pm
               JOIN re_partner p ON p.partner_id = pm.partner_id
               WHERE pm.fund_id = %s AND pm.quarter = %s AND pm.scenario_id IS NULL
               ORDER BY p.name""",
            (str(inp.fund_id), inp.quarter),
        )
        rows = cur.fetchall()

    statements = []
    for r in rows:
        statements.append({
            "partner_id": str(r.get("partner_id", "")),
            "partner_name": r.get("partner_name"),
            "partner_type": r.get("partner_type"),
            "committed_capital": _dec(r.get("committed")),
            "called_capital": _dec(r.get("contributed_to_date")),
            "distributions": _dec(r.get("distributed_to_date")),
            "nav": _dec(r.get("nav")),
            "dpi": _dec(r.get("dpi")),
            "rvpi": _dec(r.get("rvpi")),
            "tvpi": _dec(r.get("tvpi")),
            "irr": _dec(r.get("irr")),
        })

    return {
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "statements": statements,
        "lp_count": len([s for s in statements if s["partner_type"] == "lp"]),
    }


def _get_draft(ctx: McpContext, inp: GetDraftInput) -> dict:
    from app.services.ir_drafts import get_draft

    draft = get_draft(inp.draft_id)
    if not draft:
        return {"error": "Draft not found", "draft_id": inp.draft_id}
    return draft


def _list_drafts(ctx: McpContext, inp: ListDraftsInput) -> dict:
    from app.services.ir_drafts import list_drafts

    rows = list_drafts(
        inp.business_id,
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        status=inp.status,
        limit=inp.limit,
    )
    return {"drafts": rows, "count": len(rows)}


def _approve_draft(ctx: McpContext, inp: ApproveDraftInput) -> dict:
    if not inp.confirm:
        raise ConfirmRequired(
            f"Approve IR draft {inp.draft_id}? Set confirm=true to proceed.",
            dry_run_result={"draft_id": inp.draft_id, "action": "approve"},
        )
    from app.services.ir_drafts import approve_draft

    return approve_draft(inp.draft_id, actor=inp.actor, notes=inp.notes)


def _reject_draft(ctx: McpContext, inp: RejectDraftInput) -> dict:
    if not inp.confirm:
        raise ConfirmRequired(
            f"Reject IR draft {inp.draft_id}? Set confirm=true to proceed.",
            dry_run_result={"draft_id": inp.draft_id, "action": "reject"},
        )
    from app.services.ir_drafts import reject_draft

    return reject_draft(inp.draft_id, actor=inp.actor, reason=inp.reason)


def _dec(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def register_ir_tools():
    registry.register(ToolDef(
        name="ir.draft_lp_letter",
        description="Draft an AI-generated LP letter for a fund quarter — assembles fund data, generates GP narrative, and persists as a reviewable draft",
        module="bm",
        permission="write",
        input_model=DraftLpLetterInput,
        handler=_draft_lp_letter,
        tags=frozenset({"repe", "ir", "finance", "investor"}),
    ))
    registry.register(ToolDef(
        name="ir.generate_capital_statements",
        description="Generate per-LP capital account statements with committed, called, distributed, NAV, DPI, TVPI, and IRR for a fund quarter",
        module="bm",
        permission="read",
        input_model=GenerateCapitalStatementsInput,
        handler=_generate_capital_statements,
        tags=frozenset({"repe", "ir", "finance", "investor"}),
    ))
    registry.register(ToolDef(
        name="ir.get_draft",
        description="Fetch a single IR draft by ID including full content and narrative",
        module="bm",
        permission="read",
        input_model=GetDraftInput,
        handler=_get_draft,
        tags=frozenset({"repe", "ir", "finance"}),
    ))
    registry.register(ToolDef(
        name="ir.list_drafts",
        description="List IR drafts with optional filters by fund, quarter, and status",
        module="bm",
        permission="read",
        input_model=ListDraftsInput,
        handler=_list_drafts,
        tags=frozenset({"repe", "ir", "finance"}),
    ))
    registry.register(ToolDef(
        name="ir.approve_draft",
        description="Approve an IR draft letter — requires confirm=true to execute. Changes status to approved.",
        module="bm",
        permission="write",
        input_model=ApproveDraftInput,
        handler=_approve_draft,
        tags=frozenset({"repe", "ir", "finance", "governance"}),
    ))
    registry.register(ToolDef(
        name="ir.reject_draft",
        description="Reject an IR draft letter with a reason — requires confirm=true to execute. Changes status to rejected.",
        module="bm",
        permission="write",
        input_model=RejectDraftInput,
        handler=_reject_draft,
        tags=frozenset({"repe", "ir", "finance", "governance"}),
    ))
