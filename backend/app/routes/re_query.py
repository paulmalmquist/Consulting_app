"""POST /api/re/v2/query — natural language query agent.

Routes questions to SQL or Python execution engines.
Uses a single LLM call for routing + SQL generation to minimize latency.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.db import get_cursor
from app.observability.logger import emit_log
from app.sql_agent.combined_agent import run_agent
from app.sql_agent.interpreter import interpret
from app.sql_agent.python_dispatcher import dispatch as dispatch_python
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
        # 1. Single LLM call: route + generate SQL
        result = await run_agent(
            req.prompt,
            business_id=business_id,
            quarter=quarter,
        )
        logger.info(
            "Agent result: route=%s entity=%s intent=%s sql_len=%s",
            result.route, result.entity_type, result.intent,
            len(result.sql) if result.sql else 0,
        )

        # 2. Handle Python route — dispatch to finance engines
        if result.route == "python":
            if not result.python_fn:
                return QueryResponse(
                    route="python",
                    intent=result.intent,
                    entity_type=result.entity_type,
                    visualization="table",
                    columns=[],
                    data=[],
                    row_count=0,
                    truncated=False,
                    duration_ms=_elapsed(t0),
                    error="Agent routed to Python but did not specify a function.",
                )

            try:
                py_result = await dispatch_python(
                    result.python_fn,
                    business_id=business_id,
                    quarter=quarter,
                    params=result.params,
                )
            except ValueError as e:
                return QueryResponse(
                    route="python",
                    intent=result.intent,
                    entity_type=result.entity_type,
                    visualization="table",
                    columns=[],
                    data=[],
                    row_count=0,
                    truncated=False,
                    duration_ms=_elapsed(t0),
                    error=str(e),
                )
            except Exception as e:
                logger.exception("Python dispatch failed: %s", e)
                return QueryResponse(
                    route="python",
                    intent=result.intent,
                    entity_type=result.entity_type,
                    visualization="table",
                    columns=[],
                    data=[],
                    row_count=0,
                    truncated=False,
                    duration_ms=_elapsed(t0),
                    error=f"Computation failed: {type(e).__name__}: {e}",
                )

            columns = py_result.get("columns", [])
            data = py_result.get("data", [])
            computation = py_result.get("computation", {})
            viz = interpret(columns, data, route="python", python_fn=result.python_fn)

            emit_log(
                level="info",
                service="sql_agent",
                action="query.python_executed",
                message=f"Python {result.python_fn} returned {len(data)} rows as {viz}",
                context={
                    "prompt": req.prompt[:200],
                    "python_fn": result.python_fn,
                    "row_count": len(data),
                    "visualization": viz,
                    "duration_ms": _elapsed(t0),
                },
            )

            return QueryResponse(
                route="python",
                intent=result.intent,
                entity_type=result.entity_type,
                visualization=viz,
                columns=columns,
                data=data,
                row_count=len(data),
                truncated=False,
                computation=computation,
                duration_ms=_elapsed(t0),
            )

        # 3. SQL path — validate
        if not result.sql:
            return QueryResponse(
                route="sql",
                intent=result.intent,
                entity_type=result.entity_type,
                visualization="table",
                columns=[],
                data=[],
                row_count=0,
                truncated=False,
                duration_ms=_elapsed(t0),
                error="Agent did not generate SQL. Try rephrasing your question.",
            )

        validation = validate_sql(result.sql, business_id)
        if not validation.valid:
            emit_log(
                level="warn",
                service="sql_agent",
                action="query.validation_failed",
                message=validation.error or "Validation failed",
                context={"sql": result.sql[:500], "prompt": req.prompt[:200]},
            )
            return QueryResponse(
                route="sql",
                intent=result.intent,
                entity_type=result.entity_type,
                visualization="table",
                columns=[],
                data=[],
                row_count=0,
                truncated=False,
                sql=result.sql,
                duration_ms=_elapsed(t0),
                error=f"Generated query failed safety validation: {validation.error}",
            )

        # 4. Execute with timeout
        params: dict[str, Any] = {"business_id": business_id}
        if quarter:
            params["quarter"] = quarter
        for k, v in result.params.items():
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
                "route": result.route,
                "entity_type": result.entity_type,
                "row_count": len(rows),
                "visualization": viz,
                "duration_ms": _elapsed(t0),
            },
        )

        return QueryResponse(
            route="sql",
            intent=result.intent,
            entity_type=result.entity_type,
            visualization=viz,
            columns=columns,
            data=rows,
            row_count=len(rows),
            truncated=truncated,
            sql=result.sql,
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
            error=f"Query failed: {type(e).__name__}: {e}",
        )


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
        # Convert non-serializable types (Decimal, date, etc.)
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
