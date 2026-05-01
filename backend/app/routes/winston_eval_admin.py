"""Admin inspection + trigger routes for the Winston autonomous eval loop.

Narrow surface for v1:
  GET  /api/admin/eval/runs                         — list recent runs
  GET  /api/admin/eval/runs/{run_id}                — run detail + results
  GET  /api/admin/eval/cases/{case_id}/history      — per-case trend
  GET  /api/admin/eval/baselines                    — current baselines
  POST /api/admin/eval/baselines/invalidate         — mark a baseline stale
  POST /api/admin/eval/run                          — trigger an eval run

All routes require authenticated admin (same pattern as other admin routes).
RLS isolates by business_id via app.current_business_id.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import get_cursor
from app.services.winston_eval_runner import (
    VALID_SUITES,
    VALID_TRIGGERS,
    trigger_eval_run,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/eval", tags=["admin-eval"])


# ── Pydantic schemas ────────────────────────────────────────────────


class EvalRunRow(BaseModel):
    run_id: str
    trigger: str
    suite: str
    status: str
    git_sha: Optional[str] = None
    started_at: Any
    completed_at: Any = None
    total_cases: int
    passed_count: int
    failed_count: int
    errored_count: int
    regressions_count: int


class EvalRunDetail(EvalRunRow):
    summary: dict[str, Any] = Field(default_factory=dict)
    results: list[dict[str, Any]] = Field(default_factory=list)


class EvalCaseHistoryRow(BaseModel):
    result_id: str
    run_id: str
    status: str
    failure_category: Optional[str] = None
    observed_lane: Optional[str] = None
    latency_ms: Optional[int] = None
    ttft_ms: Optional[int] = None
    is_regression: bool
    created_at: Any


class EvalBaselineRow(BaseModel):
    baseline_id: str
    case_id: str
    contract_version: int
    expected_lane: Optional[str] = None
    last_pass_run_id: Optional[str] = None
    last_pass_at: Any
    last_pass_latency_ms: Optional[int] = None
    invalidated_at: Any = None
    invalidated_reason: Optional[str] = None


class InvalidateBaselineRequest(BaseModel):
    case_id: str
    contract_version: int = 1
    expected_lane: Optional[str] = None
    reason: str


class TriggerRunRequest(BaseModel):
    suite: str = Field(..., description=f"one of {VALID_SUITES}")
    business_id: str
    env_id: Optional[str] = None
    environment: Optional[str] = Field(None, description="eval scenario environment slug, e.g. meridian or novendor")
    trigger: str = Field("manual", description=f"one of {VALID_TRIGGERS}")


# ── Routes ──────────────────────────────────────────────────────────


@router.get("/runs", response_model=list[EvalRunRow])
def list_runs(
    limit: int = Query(20, ge=1, le=200),
    suite: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
) -> list[EvalRunRow]:
    conditions: list[str] = []
    params: list[Any] = []
    if suite:
        conditions.append("suite = %s")
        params.append(suite)
    if status:
        conditions.append("status = %s")
        params.append(status)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT run_id, trigger, suite, status, git_sha,
                   started_at, completed_at,
                   total_cases, passed_count, failed_count,
                   errored_count, regressions_count
              FROM winston_eval_runs
              {where}
             ORDER BY started_at DESC
             LIMIT %s
            """,
            tuple(params),
        )
        rows = cur.fetchall()
    return [EvalRunRow(**dict(row)) for row in rows]


@router.get("/runs/{run_id}", response_model=EvalRunDetail)
def get_run(run_id: str) -> EvalRunDetail:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT run_id, trigger, suite, status, git_sha,
                   started_at, completed_at,
                   total_cases, passed_count, failed_count,
                   errored_count, regressions_count,
                   summary
              FROM winston_eval_runs
             WHERE run_id = %s
            """,
            (run_id,),
        )
        run_row = cur.fetchone()
        if not run_row:
            raise HTTPException(status_code=404, detail=f"run {run_id} not found")

        cur.execute(
            """
            SELECT result_id, case_id, status, failure_category,
                   expected_lane, observed_lane,
                   latency_ms, ttft_ms, tool_count, token_count,
                   response_excerpt, assertion_failures, trace_summary,
                   ai_gateway_log_id, is_regression, baseline_delta,
                   created_at
              FROM winston_eval_results
             WHERE run_id = %s
             ORDER BY status, case_id
            """,
            (run_id,),
        )
        results = [dict(row) for row in cur.fetchall()]

    return EvalRunDetail(
        run_id=str(run_row["run_id"]),
        trigger=run_row["trigger"],
        suite=run_row["suite"],
        status=run_row["status"],
        git_sha=run_row.get("git_sha"),
        started_at=run_row["started_at"],
        completed_at=run_row.get("completed_at"),
        total_cases=run_row["total_cases"],
        passed_count=run_row["passed_count"],
        failed_count=run_row["failed_count"],
        errored_count=run_row["errored_count"],
        regressions_count=run_row["regressions_count"],
        summary=run_row.get("summary") or {},
        results=results,
    )


@router.get("/cases/{case_id}/history", response_model=list[EvalCaseHistoryRow])
def case_history(
    case_id: str,
    limit: int = Query(30, ge=1, le=200),
) -> list[EvalCaseHistoryRow]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT result_id, run_id, status, failure_category,
                   observed_lane, latency_ms, ttft_ms, is_regression,
                   created_at
              FROM winston_eval_results
             WHERE case_id = %s
             ORDER BY created_at DESC
             LIMIT %s
            """,
            (case_id, limit),
        )
        return [EvalCaseHistoryRow(**dict(row)) for row in cur.fetchall()]


@router.get("/baselines", response_model=list[EvalBaselineRow])
def list_baselines(
    case_id: Optional[str] = Query(None),
    include_invalidated: bool = Query(False),
) -> list[EvalBaselineRow]:
    conditions: list[str] = []
    params: list[Any] = []
    if case_id:
        conditions.append("case_id = %s")
        params.append(case_id)
    if not include_invalidated:
        conditions.append("invalidated_at IS NULL")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT baseline_id, case_id, contract_version, expected_lane,
                   last_pass_run_id, last_pass_at, last_pass_latency_ms,
                   invalidated_at, invalidated_reason
              FROM winston_eval_baselines
              {where}
             ORDER BY case_id, contract_version
            """,
            tuple(params),
        )
        return [EvalBaselineRow(**dict(row)) for row in cur.fetchall()]


@router.post("/baselines/invalidate")
def invalidate_baseline(req: InvalidateBaselineRequest) -> dict[str, Any]:
    if not req.reason or not req.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE winston_eval_baselines
               SET invalidated_at = now(),
                   invalidated_reason = %s,
                   updated_at = now()
             WHERE case_id = %s
               AND contract_version = %s
               AND (expected_lane IS NOT DISTINCT FROM %s)
               AND invalidated_at IS NULL
            """,
            (req.reason.strip(), req.case_id, req.contract_version, req.expected_lane),
        )
        affected = cur.rowcount or 0
    return {"invalidated": affected}


@router.post("/run")
def trigger_run(
    req: TriggerRunRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    if req.suite not in VALID_SUITES:
        raise HTTPException(status_code=400, detail=f"suite must be one of {VALID_SUITES}")
    if req.trigger not in VALID_TRIGGERS:
        raise HTTPException(status_code=400, detail=f"trigger must be one of {VALID_TRIGGERS}")
    if not req.business_id:
        raise HTTPException(status_code=400, detail="business_id required")

    background_tasks.add_task(
        trigger_eval_run,
        suite=req.suite,
        business_id=req.business_id,
        env_id=req.env_id,
        environment=req.environment,
        trigger=req.trigger,
    )
    return {
        "accepted": True,
        "suite": req.suite,
        "trigger": req.trigger,
        "business_id": req.business_id,
        "env_id": req.env_id,
        "environment": req.environment,
        "note": "Eval run dispatched in background. Poll GET /api/admin/eval/runs for completion.",
    }
