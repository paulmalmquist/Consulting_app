"""History Rhymes research → planning bridge API routes.

Endpoints (all under /api/hr/v1/research — distinct from the execution-layer
/api/hr/v1/* routes in hr.py and the hr_weekly_briefs table):

    POST /api/hr/v1/research/briefs
    GET  /api/hr/v1/research/briefs/latest
    GET  /api/hr/v1/research/enhancement-candidates?status=
    POST /api/hr/v1/research/enhancement-candidates/{id}/promote
    POST /api/hr/v1/research/enhancement-candidates/{id}/discard
    GET  /api/hr/v1/research/enhancement-candidates/{id}/planning-markdown

hr_* module is single-tenant analytics: no env_id, no business_id, no RLS
(ARCHITECTURE.md exemption). Deterministic extraction only; fail closed.

See also:
    - backend/app/services/hr_enhancement_extractor.py  (parser)
    - backend/app/services/hr_planning_markdown.py        (plan generator)
    - repo-b/db/schema/10002_history_rhymes_research_planning.sql
"""

from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import get_cursor
from app.services.hr_enhancement_extractor import extract_enhancements
from app.services.hr_planning_markdown import build_planning_markdown

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hr/v1/research", tags=["history-rhymes-research"])

VALID_STATUSES = {"new", "promoted", "discarded", "planned", "shipped"}


class BriefIn(BaseModel):
    brief_date: date
    week_type: str = Field(min_length=1)
    pillar_name: str = Field(min_length=1)
    markdown_content: str = Field(min_length=1)
    title: str | None = None
    source_filename: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("/briefs")
def create_brief(payload: BriefIn) -> dict[str, Any]:
    """Ingest a weekly research brief: persist raw + parsed, create candidates.

    Always persists the raw markdown. Degraded extraction still returns 200 with
    `degraded: true` + warnings (fail closed, no crash). Hard failures roll back
    the brief, mark the run failed, and return 422.
    """
    run_id = _insert_run("ingest_extract")

    try:
        result = extract_enhancements(payload.markdown_content)
        brief_ctx = {
            "brief_date": payload.brief_date.isoformat(),
            "week_type": payload.week_type,
            "pillar_name": payload.pillar_name,
            "title": payload.title,
            "source_filename": payload.source_filename,
            "regime_call": result.regime_call,
        }

        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO hr_research_briefs
                    (brief_date, week_type, pillar_name, title,
                     markdown_content, parsed_json, confidence,
                     freshness_score, source_filename)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING brief_id, created_at;
                """,
                (
                    payload.brief_date,
                    payload.week_type,
                    payload.pillar_name,
                    payload.title,
                    payload.markdown_content,
                    json.dumps(result.to_dict()),
                    result.confidence,
                    result.freshness_score,
                    payload.source_filename,
                ),
            )
            brief_row = cur.fetchone() or {}
            brief_id = _uuid_str(brief_row.get("brief_id"))

            candidates_out: list[dict[str, Any]] = []
            for cand in result.candidates:
                cand_dict = cand.to_dict()
                planning_md = build_planning_markdown(cand_dict, brief_ctx)
                cur.execute(
                    """
                    INSERT INTO hr_enhancement_candidates
                        (brief_id, title, category, what, why, effort_days,
                         expected_impact, dependencies, priority, confidence,
                         adversarial_verdict, planning_markdown)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING candidate_id, status, created_at;
                    """,
                    (
                        brief_row.get("brief_id"),
                        cand.title,
                        cand.category,
                        cand.what,
                        cand.why,
                        cand.effort_days,
                        cand.expected_impact,
                        json.dumps(cand.dependencies),
                        cand.priority,
                        cand.confidence,
                        cand.adversarial_verdict,
                        planning_md,
                    ),
                )
                crow = cur.fetchone() or {}
                candidates_out.append(
                    {
                        "candidate_id": _uuid_str(crow.get("candidate_id")),
                        "status": crow.get("status", "new"),
                        **cand_dict,
                    }
                )

            run_status = "degraded" if result.degraded else "succeeded"
            cur.execute(
                """
                UPDATE hr_research_runs
                   SET status = %s,
                       brief_id = %s,
                       finished_at = now(),
                       metrics = %s
                 WHERE run_id = %s;
                """,
                (
                    run_status,
                    brief_row.get("brief_id"),
                    json.dumps(result.metrics),
                    run_id,
                ),
            )

        return {
            "brief": {
                "brief_id": brief_id,
                "brief_date": payload.brief_date.isoformat(),
                "week_type": payload.week_type,
                "pillar_name": payload.pillar_name,
                "title": payload.title,
                "confidence": result.confidence,
                "freshness_score": result.freshness_score,
                "regime_call": result.regime_call,
                "found_sections": result.found_sections,
                "created_at": _iso(brief_row.get("created_at")),
            },
            "candidates": candidates_out,
            "warnings": result.warnings,
            "confidence": result.confidence,
            "degraded": result.degraded,
        }

    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — fail closed, record and surface
        logger.exception("hr_research brief ingestion failed (run=%s)", run_id)
        _fail_run(run_id, str(exc))
        raise HTTPException(
            status_code=422, detail=f"Brief ingestion failed: {exc}"
        ) from exc


@router.get("/briefs/latest")
def get_latest_brief() -> dict[str, Any]:
    """Return the most recent research brief summary + parsed JSON."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT brief_id, brief_date, week_type, pillar_name, title,
                   parsed_json, confidence, freshness_score, source_filename,
                   created_at
              FROM hr_research_briefs
             ORDER BY created_at DESC
             LIMIT 1;
            """
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="No research brief found")

        cur.execute(
            "SELECT COUNT(*) AS n FROM hr_enhancement_candidates WHERE brief_id = %s;",
            (row["brief_id"],),
        )
        count_row = cur.fetchone() or {}

    return {
        "brief_id": _uuid_str(row["brief_id"]),
        "brief_date": _iso(row["brief_date"]),
        "week_type": row["week_type"],
        "pillar_name": row["pillar_name"],
        "title": row["title"],
        "confidence": _decimal_float(row["confidence"]),
        "freshness_score": _decimal_float(row["freshness_score"]),
        "source_filename": row["source_filename"],
        "parsed_json": row["parsed_json"] or {},
        "candidate_count": int(count_row.get("n", 0) or 0),
        "created_at": _iso(row["created_at"]),
    }


@router.get("/enhancement-candidates")
def list_candidates(status: str | None = Query(default=None)) -> dict[str, Any]:
    """List enhancement candidates, optionally filtered by status."""
    if status is not None and status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Allowed: {sorted(VALID_STATUSES)}",
        )

    with get_cursor() as cur:
        if status is None:
            cur.execute(
                """
                SELECT candidate_id, brief_id, title, category, what, why,
                       effort_days, expected_impact, dependencies, priority,
                       confidence, adversarial_verdict, status, created_at
                  FROM hr_enhancement_candidates
                 ORDER BY created_at DESC;
                """
            )
        else:
            cur.execute(
                """
                SELECT candidate_id, brief_id, title, category, what, why,
                       effort_days, expected_impact, dependencies, priority,
                       confidence, adversarial_verdict, status, created_at
                  FROM hr_enhancement_candidates
                 WHERE status = %s
                 ORDER BY created_at DESC;
                """,
                (status,),
            )
        rows = cur.fetchall()

    return {
        "count": len(rows),
        "candidates": [
            {
                "candidate_id": _uuid_str(r["candidate_id"]),
                "brief_id": _uuid_str(r["brief_id"]),
                "title": r["title"],
                "category": r["category"],
                "what": r["what"],
                "why": r["why"],
                "effort_days": _decimal_float(r["effort_days"]),
                "expected_impact": r["expected_impact"],
                "dependencies": r["dependencies"] or [],
                "priority": r["priority"],
                "confidence": _decimal_float(r["confidence"]),
                "adversarial_verdict": r["adversarial_verdict"],
                "status": r["status"],
                "created_at": _iso(r["created_at"]),
            }
            for r in rows
        ],
    }


@router.post("/enhancement-candidates/{candidate_id}/promote")
def promote_candidate(candidate_id: str) -> dict[str, Any]:
    """Set a candidate's status to promoted."""
    return _set_status(candidate_id, "promoted")


@router.post("/enhancement-candidates/{candidate_id}/discard")
def discard_candidate(candidate_id: str) -> dict[str, Any]:
    """Set a candidate's status to discarded."""
    return _set_status(candidate_id, "discarded")


@router.get("/enhancement-candidates/{candidate_id}/planning-markdown")
def get_planning_markdown(candidate_id: str) -> dict[str, Any]:
    """Return the generated planning-agent markdown for a candidate.

    Regenerates from stored fields if planning_markdown is null (resilience).
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT candidate_id, title, category, what, why, effort_days,
                   expected_impact, dependencies, priority, confidence,
                   adversarial_verdict, planning_markdown
              FROM hr_enhancement_candidates
             WHERE candidate_id = %s;
            """,
            (candidate_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Candidate not found")

    planning_md = row.get("planning_markdown")
    if not planning_md:
        planning_md = build_planning_markdown(
            {
                "title": row["title"],
                "category": row["category"],
                "what": row["what"],
                "why": row["why"],
                "effort_days": _decimal_float(row["effort_days"]),
                "expected_impact": row["expected_impact"],
                "dependencies": row["dependencies"] or [],
                "priority": row["priority"],
                "confidence": _decimal_float(row["confidence"]),
                "adversarial_verdict": row["adversarial_verdict"],
            },
            {},
        )

    return {
        "candidate_id": _uuid_str(row["candidate_id"]),
        "planning_markdown": planning_md,
    }


# ── Run tracking (minimal — guardrail 1: 3 writes max) ────────────────────────


def _insert_run(run_type: str) -> str | None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO hr_research_runs (run_type, status)
            VALUES (%s, 'started')
            RETURNING run_id;
            """,
            (run_type,),
        )
        row = cur.fetchone() or {}
    return _uuid_str(row.get("run_id"))


def _fail_run(run_id: str | None, message: str) -> None:
    if run_id is None:
        return
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE hr_research_runs
                   SET status = 'failed',
                       finished_at = now(),
                       error_message = %s
                 WHERE run_id = %s;
                """,
                (message[:2000], run_id),
            )
    except Exception:  # noqa: BLE001 — never mask the original error
        logger.exception("Failed to record failed run %s", run_id)


def _set_status(candidate_id: str, status: str) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE hr_enhancement_candidates
               SET status = %s
             WHERE candidate_id = %s
            RETURNING candidate_id, title, status;
            """,
            (status, candidate_id),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return {
        "candidate_id": _uuid_str(row["candidate_id"]),
        "title": row["title"],
        "status": row["status"],
    }


# ── Helpers (mirror backend/app/routes/hr.py) ─────────────────────────────────


def _uuid_str(value: Any) -> str | None:
    return str(value) if value is not None else None


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _decimal_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
