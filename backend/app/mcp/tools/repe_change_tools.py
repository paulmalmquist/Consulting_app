"""MCP tools for REPE staged mutation lifecycle."""

from __future__ import annotations

from app.db import get_cursor
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_change_tools import (
    ApproveChangeInput,
    ChangeSetIdInput,
    CommitChangeInput,
    StageChangeInput,
)
from app.services.repe_change_committer import (
    approve_change,
    commit_change,
    prompt_contains_explicit_approval,
    rollback_change,
)
from app.services.repe_change_impact import compute_change_impact
from app.services.repe_change_validators import validate_change_set
from psycopg.types.json import Json


FORBIDDEN_CANONICAL_TABLES = {
    "re_authoritative_fund_state_qtr",
    "re_authoritative_investment_state_qtr",
    "re_authoritative_asset_state_qtr",
    "re_authoritative_snapshot_run",
}


def _stage_change(ctx: McpContext, inp: StageChangeInput) -> dict:
    if inp.target_table in FORBIDDEN_CANONICAL_TABLES:
        return {
            "ok": False,
            "failure_category": "forbidden_direct_write_canonical_table",
            "message": "Winston cannot stage direct writes to canonical released snapshot tables.",
            "target_table": inp.target_table,
        }

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_change_sets (
              env_id, business_id, entity_type, entity_id, period, target_table,
              source_prompt, capability_key, status, created_by
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'staged', %s)
            RETURNING change_set_id
            """,
            (
                inp.env_id,
                str(inp.business_id),
                inp.entity_type,
                str(inp.entity_id) if inp.entity_id else None,
                inp.period,
                inp.target_table,
                inp.source_prompt,
                inp.capability_key,
                str(inp.created_by) if inp.created_by else None,
            ),
        )
        change_set = cur.fetchone()
        change_set_id = change_set["change_set_id"]
        for change in inp.changes:
            cur.execute(
                """
                INSERT INTO re_change_items (
                  env_id, business_id, change_set_id, target_pk, target_column,
                  old_value, new_value, value_type
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    inp.env_id,
                    str(inp.business_id),
                    change_set_id,
                    Json(change.target_pk),
                    change.target_column,
                    Json(change.old_value),
                    Json(change.new_value),
                    change.value_type,
                ),
            )

    return {
        "ok": True,
        "capability_key": "repe.stage_change",
        "change_set_id": str(change_set_id),
        "status": "staged",
        "canonical_table_touched": False,
    }


def _validate_change(ctx: McpContext, inp: ChangeSetIdInput) -> dict:
    return validate_change_set(change_set_id=inp.change_set_id)


def _compute_change_impact(ctx: McpContext, inp: ChangeSetIdInput) -> dict:
    return compute_change_impact(change_set_id=inp.change_set_id)


def _approve_change(ctx: McpContext, inp: ApproveChangeInput) -> dict:
    return approve_change(
        change_set_id=inp.change_set_id,
        approver_user_id=inp.approver_user_id,
        decision=inp.decision,
        comment=inp.comment,
    )


def _commit_change(ctx: McpContext, inp: CommitChangeInput) -> dict:
    if inp.source_prompt and not prompt_contains_explicit_approval(inp.source_prompt):
        return {
            "ok": False,
            "failure_category": "approval_required",
            "message": "commit_change requires explicit approval language.",
        }
    return commit_change(change_set_id=inp.change_set_id, committed_by=inp.committed_by)


def _rollback_change(ctx: McpContext, inp: ChangeSetIdInput) -> dict:
    return rollback_change(change_set_id=inp.change_set_id)


def register_repe_change_tools() -> None:
    registry.register(
        ToolDef(
            name="repe.stage_change",
            description="Stage a REPE mutation as re_change_sets/re_change_items. Never touches canonical tables.",
            module="bm",
            permission="write",
            input_model=StageChangeInput,
            handler=_stage_change,
            tags=frozenset({"repe", "change", "stage"}),
            confirmation_required=False,
        )
    )
    registry.register(
        ToolDef(
            name="repe.validate_change",
            description="Run deterministic validators for a staged REPE change set.",
            module="bm",
            permission="write",
            input_model=ChangeSetIdInput,
            handler=_validate_change,
            tags=frozenset({"repe", "change", "validate"}),
            confirmation_required=False,
        )
    )
    registry.register(
        ToolDef(
            name="repe.compute_change_impact",
            description="Compute downstream impact preview for a staged REPE change set.",
            module="bm",
            permission="write",
            input_model=ChangeSetIdInput,
            handler=_compute_change_impact,
            tags=frozenset({"repe", "change", "impact"}),
            confirmation_required=False,
        )
    )
    registry.register(
        ToolDef(
            name="repe.approve_change",
            description="Record explicit approval for a REPE change set.",
            module="bm",
            permission="write",
            input_model=ApproveChangeInput,
            handler=_approve_change,
            tags=frozenset({"repe", "change", "approval"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.commit_change",
            description="Commit an approved REPE change set and write an audit receipt.",
            module="bm",
            permission="write",
            input_model=CommitChangeInput,
            handler=_commit_change,
            tags=frozenset({"repe", "change", "commit"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.rollback_change",
            description="Roll back a committed REPE change set using its audit receipt.",
            module="bm",
            permission="write",
            input_model=ChangeSetIdInput,
            handler=_rollback_change,
            tags=frozenset({"repe", "change", "rollback"}),
        )
    )
