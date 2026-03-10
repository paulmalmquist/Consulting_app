"""POST /api/re/v2/query — natural language query agent.

Routes questions to SQL or Python execution engines.
Phase 1: SQL path only (lookups, filters, aggregations).
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import get_cursor
from app.observability.logger import emit_log
from app.sql_agent.interpreter import interpret
from app.sql_agent.router import route_query
from app.sql_agent.sql_generator import generate_sql
from app.sql_agent.validator import validate_sql

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/re/v2", tags=["re-query"])

# ── Request / Response ─────────────────────────────────────────────


class QueryRequest(BaseModel):
    prompt: str
    business_id: UUID
    env_id: UUID | None = None
    quarter: str | None = None


class QueryResponse(BaseModel):
    route: str
    intent: str
    entity_type: str
    visualization: str
    columns: list[str]
    data: list[dict[str, Any]]
    row_count: int
    truncated: bool
    sql: str | None = None
    computation: dict[str, Any] | None = None
    duration_ms: int = 0
    error: str | None = None


# ── Max result size ────────────────────────────────────────────────
MAX_ROWS = 500
SQL_TIMEOUT_MS = 10_000


# ── Endpoint ───────────────────────────────────────────────────────


@router.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest) -> QueryResponse:
    """Execute a natural language query against REPE data."""
    t0 = time.monotonic()
    business_id = str(req.business_id)
    quarter = req.quarter

    try:
        # 1. Route the query
        plan = await route_query(req.prompt, quarter=quarter)
        logger.info(
            "Routed query: route=%s entity=%s intent=%s python_fn=%s",
            plan.route, plan.entity_type, plan.intent, plan.python_fn,
        )

        # 2. Execute based on route
        if plan.route == "python":
            # Phase 2 — for now, return a helpful error
            return QueryResponse(
                route="python",
                intent=plan.intent,
                entity_type=plan.entity_type,
                visualization="table",
                columns=[],
                data=[],
                row_count=0,
                truncated=False,
                computation={"type": plan.python_fn, "status": "not_yet_implemented"},
                duration_ms=_elapsed(t0),
                error=f"Python calculations ({plan.python_fn}) coming in Phase 2. "
                      f"Try rephrasing to read stored data instead.",
            )

        # SQL path
        sql = await generate_sql(
            plan, req.prompt,
            business_id=business_id,
            quarter=quarter,
        )

        # 3. Validate
        validation = validate_sql(sql, business_id)
        if not validation.valid:
            emit_log(
                level="warn",
                service="sql_agent",
                action="query.validation_failed",
                message=validation.error or "Validation failed",
                context={"sql": sql[:500], "prompt": req.prompt[:200]},
            )
            return QueryResponse(
                route="sql",
                intent=plan.intent,
                entity_type=plan.entity_type,
                visualization="table",
                columns=[],
                data=[],
                row_count=0,
                truncated=False,
                sql=sql,
                duration_ms=_elapsed(t0),
                error=f"Generated query failed safety validation: {validation.error}",
            )

        # 4. Execute with timeout
        params: dict[str, Any] = {"business_id": business_id}
        if quarter:
            params["quarter"] = quarter
        # Add any extracted params from the router
        for k, v in plan.params.items():
            if v is not None and k not in params:
                params[k] = v

        columns, rows = _execute_sql(validation.sql, params)

        # 5. Cap results
        truncated = len(rows) > MAX_ROWS
        if truncated:
            rows = rows[:MAX_ROWS]

        # 6. Interpret visualization type
        viz = interpret(columns, rows, route="sql")

        emit_log(
            level="info",
            service="sql_agent",
            action="query.executed",
            message=f"Query returned {len(rows)} rows as {viz}",
            context={
                "prompt": req.prompt[:200],
                "route": plan.route,
                "entity_type": plan.entity_type,
                "row_count": len(rows),
                "visualization": viz,
            },
        )

        return QueryResponse(
            route="sql",
            intent=plan.intent,
            entity_type=plan.entity_type,
            visualization=viz,
            columns=columns,
            data=rows,
            row_count=len(rows),
            truncated=truncated,
            sql=sql,
            duration_ms=_elapsed(t0),
        )

    except asyncio.TimeoutError:
        return QueryResponse(
            route="unknown",
            intent="",
            entity_type="",
            visualization="table",
            columns=[],
            data=[],
            row_count=0,
            truncated=False,
            duration_ms=_elapsed(t0),
            error="Query timed out. Try a simpler question.",
        )
    except ValueError as e:
        return QueryResponse(
            route="unknown",
            intent="",
            entity_type="",
            visualization="table",
            columns=[],
            data=[],
            row_count=0,
            truncated=False,
            duration_ms=_elapsed(t0),
            error=str(e),
        )
    except Exception as e:
        emit_log(
            level="error",
            service="sql_agent",
            action="query.error",
            message=str(e),
            context={"prompt": req.prompt[:200]},
            error=e,
        )
        raise HTTPException(status_code=500, detail="Query execution failed")


# ── Helpers ────────────────────────────────────────────────────────


def _execute_sql(sql: str, params: dict[str, Any]) -> tuple[list[str], list[dict]]:
    """Execute a validated SQL query with timeout."""
    with get_cursor() as cur:
        cur.execute(f"SET LOCAL statement_timeout = '{SQL_TIMEOUT_MS}'")
        cur.execute(sql, params)
        if cur.description is None:
            return [], []
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        # Convert any non-serializable types
        cleaned = []
        for row in rows:
            cleaned_row: dict[str, Any] = {}
            for k, v in row.items():
                if hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, type(None))):
                    cleaned_row[k] = str(v)
                else:
                    cleaned_row[k] = v
            cleaned.append(cleaned_row)
        return columns, cleaned


def _elapsed(t0: float) -> int:
    return int((time.monotonic() - t0) * 1000)
