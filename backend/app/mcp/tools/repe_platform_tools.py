"""REPE Platform MCP tools — approvals, saved analyses, documents.

Read/write tools for listing approval gates, saving/listing analyses,
and listing documents with entity links.
"""
from __future__ import annotations

import json
from decimal import Decimal

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_platform_tools import (
    ListApprovalsInput,
    ListDocumentsInput,
    ListSavedAnalysesInput,
    SaveAnalysisInput,
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


def _list_approvals(ctx: McpContext, inp: ListApprovalsInput) -> dict:
    from app.db import get_cursor

    limit = min(inp.limit, 500)

    with get_cursor() as cur:
        conditions = ["wo.business_id = %s"]
        params: list = [inp.business_id]

        if inp.status:
            conditions.append("cfi.status = %s")
            params.append(inp.status)

        where = " AND ".join(conditions)
        params.append(limit)

        cur.execute(
            f"""
            SELECT
              cfi.id::text,
              cfi.step_label,
              cfi.actor,
              cfi.status,
              cfi.notes,
              cfi.due_date::text,
              cfi.created_at::text,
              wo.workflow_name,
              wo.entity_type,
              wo.entity_id::text,
              wo.transition_label,
              wo.outcome
            FROM epi_case_feed_item cfi
            JOIN epi_workflow_observation wo ON wo.id = cfi.workflow_observation_id
            WHERE {where}
            ORDER BY cfi.created_at DESC
            LIMIT %s
            """,
            params,
        )
        approvals = cur.fetchall()

    emit_log(
        level="info",
        service="mcp",
        action="platform.list_approvals",
        message=f"Listed {len(approvals)} approvals",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "approvals": approvals,
        "count": len(approvals),
    })


def _save_analysis(ctx: McpContext, inp: SaveAnalysisInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        vis_spec = json.dumps(inp.visualization_spec) if inp.visualization_spec else None

        cur.execute(
            """
            INSERT INTO analytics_query
              (env_id, business_id, title, description, nl_prompt, visualization_spec)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            RETURNING id::text, title
            """,
            (
                inp.env_id,
                inp.business_id,
                inp.title,
                inp.description,
                inp.nl_prompt,
                vis_spec,
            ),
        )
        result = cur.fetchone()

    emit_log(
        level="info",
        service="mcp",
        action="platform.save_analysis",
        message=f"Saved analysis: {inp.title}",
        context={"business_id": inp.business_id, "env_id": inp.env_id},
    )

    return _serialize(result or {"error": "Insert returned no rows"})


def _list_saved_analyses(ctx: McpContext, inp: ListSavedAnalysesInput) -> dict:
    from app.db import get_cursor

    limit = min(inp.limit, 500)

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              aq.id::text,
              aq.title,
              aq.description,
              aq.nl_prompt,
              aq.created_by,
              aq.created_at::text,
              ac.name AS collection_name
            FROM analytics_query aq
            LEFT JOIN analytics_collection_membership acm ON acm.query_id = aq.id
            LEFT JOIN analytics_collection ac ON ac.id = acm.collection_id
            WHERE aq.business_id = %s
            ORDER BY aq.created_at DESC
            LIMIT %s
            """,
            (inp.business_id, limit),
        )
        analyses = cur.fetchall()

    emit_log(
        level="info",
        service="mcp",
        action="platform.list_saved_analyses",
        message=f"Listed {len(analyses)} saved analyses",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "analyses": analyses,
        "count": len(analyses),
    })


def _list_documents(ctx: McpContext, inp: ListDocumentsInput) -> dict:
    from app.db import get_cursor

    limit = min(inp.limit, 500)

    with get_cursor() as cur:
        conditions = ["d.business_id = %s"]
        params: list = [inp.business_id]

        if inp.classification:
            conditions.append("d.classification = %s")
            params.append(inp.classification)

        entity_join = ""
        if inp.entity_type:
            conditions.append("el.entity_type = %s")
            params.append(inp.entity_type)
            entity_join = "JOIN app.document_entity_links el ON el.document_id = d.id"

        if inp.entity_id:
            conditions.append("el.entity_id = %s")
            params.append(inp.entity_id)
            if not entity_join:
                entity_join = "JOIN app.document_entity_links el ON el.document_id = d.id"

        where = " AND ".join(conditions)
        params.append(limit)

        cur.execute(
            f"""
            SELECT
              d.id::text,
              d.title,
              d.description,
              d.classification,
              d.domain,
              d.status,
              d.virtual_path,
              d.created_at::text,
              d.updated_at::text,
              d.created_by,
              (SELECT COUNT(*)::int FROM app.document_versions dv WHERE dv.document_id = d.id) AS version_count,
              (SELECT dv2.size_bytes
               FROM app.document_versions dv2
               WHERE dv2.document_id = d.id
               ORDER BY dv2.version_number DESC
               LIMIT 1) AS size_bytes
            FROM app.documents d
            {entity_join}
            WHERE {where}
            ORDER BY d.updated_at DESC
            LIMIT %s
            """,
            params,
        )
        documents = cur.fetchall()

    emit_log(
        level="info",
        service="mcp",
        action="platform.list_documents",
        message=f"Listed {len(documents)} documents",
        context={"business_id": inp.business_id},
    )

    return _serialize({
        "documents": documents,
        "count": len(documents),
    })


# ── Registration ───────────────────────────────────────────────────────────────


def register_repe_platform_tools():
    """Register platform MCP tools for approvals, saved analyses, and documents."""

    registry.register(ToolDef(
        name="platform.list_approvals",
        description="List approval gate items with workflow context, optionally filtered by status",
        module="bm",
        permission="read",
        input_model=ListApprovalsInput,
        handler=_list_approvals,
    ))

    registry.register(ToolDef(
        name="platform.save_analysis",
        description="Save an analytics query with optional visualization spec for later retrieval",
        module="bm",
        permission="write",
        input_model=SaveAnalysisInput,
        handler=_save_analysis,
    ))

    registry.register(ToolDef(
        name="platform.list_saved_analyses",
        description="List saved analytics queries with collection names for a business",
        module="bm",
        permission="read",
        input_model=ListSavedAnalysesInput,
        handler=_list_saved_analyses,
    ))

    registry.register(ToolDef(
        name="platform.list_documents",
        description="List documents with version info, optionally filtered by classification or linked entity",
        module="bm",
        permission="read",
        input_model=ListDocumentsInput,
        handler=_list_documents,
    ))
