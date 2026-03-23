"""PDS text-to-SQL query endpoint.

Routes natural language questions through domain classification,
PDS SQL agent, validation, and execution.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.db import get_cursor
from app.routes.domain_common import classify_domain_error, domain_error_response
from app.sql_agent.domain_router import classify_domain
from app.sql_agent.pds_agent import run_pds_agent
from app.sql_agent.validator import validate_sql

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pds/v2", tags=["pds-v2-query"])


class QueryRequest(BaseModel):
    question: str
    env_id: str
    business_id: str


class QueryResponse(BaseModel):
    domain: str
    intent: str
    sql: str
    results: list[dict[str, Any]]
    chart_suggestion: dict[str, Any] | None = None
    row_count: int = 0


@router.post("/query", response_model=QueryResponse)
async def pds_query(request: Request, req: QueryRequest):
    """Execute a natural language query against PDS analytics data."""
    try:
        domain = classify_domain(req.question)

        if domain == "repe":
            # For REPE questions, redirect to the existing agent
            return QueryResponse(
                domain="repe",
                intent="Redirected to REPE agent",
                sql="",
                results=[],
                chart_suggestion=None,
                row_count=0,
            )

        # Run PDS agent
        agent_result = await run_pds_agent(
            req.question,
            env_id=req.env_id,
            business_id=req.business_id,
        )

        if not agent_result.sql:
            return QueryResponse(
                domain="pds",
                intent=agent_result.intent,
                sql="",
                results=[],
                chart_suggestion=None,
                row_count=0,
            )

        # Validate SQL
        validation = validate_sql(agent_result.sql, req.business_id)
        if not validation.valid:
            logger.warning("PDS SQL validation failed: %s", validation.error)
            return QueryResponse(
                domain="pds",
                intent=f"SQL validation failed: {validation.error}",
                sql=agent_result.sql,
                results=[],
                chart_suggestion=None,
                row_count=0,
            )

        # Execute the validated SQL
        with get_cursor() as cur:
            cur.execute(
                validation.sql,
                {"env_id": req.env_id, "business_id": req.business_id},
            )
            rows = cur.fetchall()

        results = [
            {k: (v.isoformat() if isinstance(v, (date, datetime)) else float(v) if isinstance(v, Decimal) else v)
             for k, v in dict(r).items()}
            for r in rows
        ]

        return QueryResponse(
            domain="pds",
            intent=agent_result.intent,
            sql=validation.sql,
            results=results[:1000],
            chart_suggestion=agent_result.chart_suggestion,
            row_count=len(results),
        )

    except Exception as exc:
        logger.exception("PDS query failed")
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.v2.query.failed",
            context={"question": req.question[:200]},
        )
