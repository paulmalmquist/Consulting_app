"""MCP tool wrapping the natural language query agent.

Exposes POST /api/re/v2/query as a single MCP tool so the AI gateway
can answer REPE questions with SQL lookups or Python calculations.
"""
from __future__ import annotations

import logging

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.db import get_cursor
from app.mcp.schemas.query_tools import NlQueryInput, ReadonlySqlWithContractInput
from app.services.repe_eval_capabilities import validate_readonly_sql_contract
from app.observability.logger import emit_log

logger = logging.getLogger(__name__)


def _nl_query(ctx: McpContext, inp: NlQueryInput) -> dict:
    """Execute a natural language query against REPE data."""
    import httpx

    payload = {
        "prompt": inp.prompt,
        "business_id": str(inp.business_id),
    }
    if inp.env_id:
        payload["env_id"] = str(inp.env_id)
    if inp.quarter:
        payload["quarter"] = inp.quarter

    # Call the local FastAPI endpoint (same process, via loopback)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            "http://localhost:8000/api/re/v2/query",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()

    emit_log(
        level="info",
        service="mcp",
        action="tool.nl_query",
        message=f"NL query: route={result.get('route')} viz={result.get('visualization')} rows={result.get('row_count')}",
        context={
            "prompt": inp.prompt[:200],
            "route": result.get("route"),
            "duration_ms": result.get("duration_ms"),
        },
    )

    return result


def _run_readonly_sql_with_contract(ctx: McpContext, inp: ReadonlySqlWithContractInput) -> dict:
    """Execute readonly SQL after enforcing the capability source contract."""

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT capability_key, forbidden_source_tables, required_source_tables
            FROM repe_capabilities
            WHERE capability_key = %s AND active = true
            """,
            (inp.capability_key,),
        )
        capability = cur.fetchone()
        if not capability:
            return {
                "ok": False,
                "failure_category": "missing_capability",
                "message": f"Unknown or inactive capability: {inp.capability_key}",
            }

        violation = validate_readonly_sql_contract(
            sql_text=inp.sql_text,
            capability=capability,
            env_id=inp.env_id,
        )
        if violation:
            return violation.as_dict()

        cur.execute("SET LOCAL statement_timeout = %s", (inp.timeout_ms,))
        cur.execute(inp.sql_text)
        rows = list(cur.fetchall())

    return {
        "ok": True,
        "capability_key": inp.capability_key,
        "declared_purpose": inp.declared_purpose,
        "row_count": len(rows),
        "rows": rows,
        "violations": [],
    }


def register_query_tools():
    """Register the natural language query tool."""

    registry.register(ToolDef(
        name="repe.nl_query",
        description=(
            "Ask a natural language question about REPE portfolio data. "
            "Routes to SQL (lookups, filters, aggregations) or Python "
            "(IRR, waterfall, DCF, Monte Carlo, what-if scenarios). "
            "Examples: 'Show NOI by asset', 'What is fund IRR?', "
            "'Run the waterfall', 'What if cap rate is 6%?'"
        ),
        module="bm",
        permission="read",
        input_model=NlQueryInput,
        handler=_nl_query,
        tags=frozenset({"infra"}),
    ))

    registry.register(ToolDef(
        name="repe.run_readonly_sql_with_contract",
        description=(
            "Run readonly REPE SQL with a declared purpose and capability_key. "
            "Blocks writes, cross-env queries without env_id scope, and legacy REPE source tables."
        ),
        module="bm",
        permission="read",
        input_model=ReadonlySqlWithContractInput,
        handler=_run_readonly_sql_with_contract,
        tags=frozenset({"infra", "repe", "eval"}),
    ))
