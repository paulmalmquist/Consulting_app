"""
routes/ai_usage.py
FastAPI routes for AI usage attribution + recommendations service.

All routes require env_id. Tenant isolation is enforced via SET LOCAL app.env_id.
No silent fallbacks — missing data returns explicit empty lists.

Prefix: /api/ai-usage/v1

Surfaces:
  POST /events                       — ingest a single AI usage event
  POST /events/batch                 — ingest many events at once
  GET  /summary?env_id=...           — top-line spend summary
  GET  /timeline?env_id=...          — per-day spend by model
  GET  /by-skill?env_id=...          — per-skill spend breakdown
  GET  /recommendations?env_id=...   — open recommendations sorted by est savings
  POST /recommendations/{id}/apply   — mark a recommendation applied
  POST /recommendations/{id}/dismiss — mark a recommendation dismissed
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import get_cursor

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai-usage/v1", tags=["ai-usage"])

# Pricing per 1M tokens (rough; keep in sync with skills/triaged-execution/cost_ledger.py).
PRICES = {
    "haiku":  {"in": 100,    "out": 500},   # cents per 1M tokens
    "sonnet": {"in": 300,    "out": 1500},
    "opus":   {"in": 1500,   "out": 7500},
    "other":  {"in": 0,      "out": 0},
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class UsageEventIn(BaseModel):
    env_id: str
    business_id: str
    user_email: Optional[str] = None
    business_unit: Optional[str] = None
    source: str = Field(..., pattern="^(cowork|cli|api|app|batch|unknown)$")
    session_id: Optional[str] = None
    skill: Optional[str] = None
    workflow: Optional[str] = None
    plan_slug: Optional[str] = None
    plan_step: Optional[int] = None
    decision_ref: Optional[str] = None
    model: str = Field(..., pattern="^(haiku|sonnet|opus|other)$")
    model_version: Optional[str] = None
    cached: bool = False
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    cached_input_tokens: int = 0
    duration_ms: Optional[int] = None


class IngestOut(BaseModel):
    inserted: int
    total_cost_cents: int


class SummaryOut(BaseModel):
    env_id: str
    days: int
    total_calls: int
    total_cost_cents: int
    by_model: dict
    by_source: dict
    by_business_unit: dict


class TimelinePoint(BaseModel):
    day: str
    model: str
    business_unit: Optional[str]
    calls: int
    cost_cents: int


class TimelineOut(BaseModel):
    env_id: str
    points: list[TimelinePoint]


class SkillRow(BaseModel):
    skill: str
    calls: int
    billed_input_tokens: int
    output_tokens: int
    cost_cents: int
    avg_duration_ms: Optional[int]


class BySkillOut(BaseModel):
    env_id: str
    rows: list[SkillRow]


class RecommendationRow(BaseModel):
    id: str
    rule_code: str
    severity: str
    title: str
    body_md: str
    target_skill: Optional[str]
    target_workflow: Optional[str]
    target_user_email: Optional[str]
    est_monthly_savings_cents: int
    confidence_pct: int
    state: str
    first_detected_at: str
    last_detected_at: str


class RecommendationsOut(BaseModel):
    env_id: str
    rows: list[RecommendationRow]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_cost_cents(model: str, in_tok: int, out_tok: int, think_tok: int) -> int:
    """Anthropic bills thinking tokens as input tokens."""
    p = PRICES.get(model, PRICES["other"])
    billed_in = in_tok + think_tok
    return int(round((billed_in / 1_000_000) * p["in"] + (out_tok / 1_000_000) * p["out"]))


def _set_env(cur, env_id: str) -> None:
    cur.execute("SET LOCAL app.env_id = %s", (env_id,))


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

@router.post("/events", response_model=IngestOut)
def ingest_event(event: UsageEventIn) -> IngestOut:
    cost_cents = compute_cost_cents(
        event.model, event.input_tokens, event.output_tokens, event.thinking_tokens
    )
    try:
        with get_cursor() as cur:
            _set_env(cur, event.env_id)
            cur.execute(
                """
                INSERT INTO nv_ai_usage_event (
                    env_id, business_id, user_email, business_unit, source, session_id,
                    skill, workflow, plan_slug, plan_step, decision_ref,
                    model, model_version, cached,
                    input_tokens, output_tokens, thinking_tokens, cached_input_tokens, duration_ms,
                    cost_cents
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s
                )
                """,
                (
                    event.env_id, event.business_id, event.user_email, event.business_unit,
                    event.source, event.session_id,
                    event.skill, event.workflow, event.plan_slug, event.plan_step, event.decision_ref,
                    event.model, event.model_version, event.cached,
                    event.input_tokens, event.output_tokens, event.thinking_tokens,
                    event.cached_input_tokens, event.duration_ms,
                    cost_cents,
                ),
            )
        return IngestOut(inserted=1, total_cost_cents=cost_cents)
    except Exception as exc:
        log.exception("ai_usage.ingest_event failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/events/batch", response_model=IngestOut)
def ingest_batch(events: list[UsageEventIn]) -> IngestOut:
    if not events:
        return IngestOut(inserted=0, total_cost_cents=0)
    env_id = events[0].env_id
    if any(e.env_id != env_id for e in events):
        raise HTTPException(status_code=400, detail="All events in a batch must share the same env_id")

    rows = []
    total_cost = 0
    for e in events:
        cost = compute_cost_cents(e.model, e.input_tokens, e.output_tokens, e.thinking_tokens)
        total_cost += cost
        rows.append((
            e.env_id, e.business_id, e.user_email, e.business_unit, e.source, e.session_id,
            e.skill, e.workflow, e.plan_slug, e.plan_step, e.decision_ref,
            e.model, e.model_version, e.cached,
            e.input_tokens, e.output_tokens, e.thinking_tokens, e.cached_input_tokens, e.duration_ms,
            cost,
        ))

    try:
        with get_cursor() as cur:
            _set_env(cur, env_id)
            cur.executemany(
                """
                INSERT INTO nv_ai_usage_event (
                    env_id, business_id, user_email, business_unit, source, session_id,
                    skill, workflow, plan_slug, plan_step, decision_ref,
                    model, model_version, cached,
                    input_tokens, output_tokens, thinking_tokens, cached_input_tokens, duration_ms,
                    cost_cents
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s
                )
                """,
                rows,
            )
        return IngestOut(inserted=len(rows), total_cost_cents=total_cost)
    except Exception as exc:
        log.exception("ai_usage.ingest_batch failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=SummaryOut)
def get_summary(env_id: str = Query(...), days: int = Query(30, ge=1, le=365)) -> SummaryOut:
    try:
        with get_cursor() as cur:
            _set_env(cur, env_id)
            cur.execute(
                """
                SELECT count(*) AS total_calls,
                       COALESCE(sum(cost_cents), 0) AS total_cost
                FROM nv_ai_usage_event
                WHERE env_id = %s
                  AND occurred_at >= now() - (%s || ' days')::interval
                """,
                (env_id, days),
            )
            top = cur.fetchone() or {"total_calls": 0, "total_cost": 0}

            cur.execute(
                """
                SELECT model, count(*) AS calls, COALESCE(sum(cost_cents), 0) AS cost
                FROM nv_ai_usage_event
                WHERE env_id = %s
                  AND occurred_at >= now() - (%s || ' days')::interval
                GROUP BY model
                """,
                (env_id, days),
            )
            by_model = {r["model"]: {"calls": r["calls"], "cost_cents": r["cost"]} for r in cur.fetchall()}

            cur.execute(
                """
                SELECT source, count(*) AS calls, COALESCE(sum(cost_cents), 0) AS cost
                FROM nv_ai_usage_event
                WHERE env_id = %s
                  AND occurred_at >= now() - (%s || ' days')::interval
                GROUP BY source
                """,
                (env_id, days),
            )
            by_source = {r["source"]: {"calls": r["calls"], "cost_cents": r["cost"]} for r in cur.fetchall()}

            cur.execute(
                """
                SELECT COALESCE(business_unit, 'unattributed') AS bu,
                       count(*) AS calls,
                       COALESCE(sum(cost_cents), 0) AS cost
                FROM nv_ai_usage_event
                WHERE env_id = %s
                  AND occurred_at >= now() - (%s || ' days')::interval
                GROUP BY bu
                """,
                (env_id, days),
            )
            by_bu = {r["bu"]: {"calls": r["calls"], "cost_cents": r["cost"]} for r in cur.fetchall()}

            return SummaryOut(
                env_id=env_id,
                days=days,
                total_calls=top["total_calls"],
                total_cost_cents=top["total_cost"],
                by_model=by_model,
                by_source=by_source,
                by_business_unit=by_bu,
            )
    except Exception as exc:
        log.exception("ai_usage.get_summary failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/timeline", response_model=TimelineOut)
def get_timeline(env_id: str = Query(...), days: int = Query(30, ge=1, le=365)) -> TimelineOut:
    try:
        with get_cursor() as cur:
            _set_env(cur, env_id)
            cur.execute(
                """
                SELECT day::text AS day, model, business_unit, calls, cost_cents
                FROM nv_ai_usage_daily
                WHERE env_id = %s
                  AND day >= (current_date - (%s || ' days')::interval)::date
                ORDER BY day ASC, model
                """,
                (env_id, days),
            )
            points = [
                TimelinePoint(
                    day=r["day"],
                    model=r["model"],
                    business_unit=r["business_unit"],
                    calls=r["calls"],
                    cost_cents=r["cost_cents"],
                )
                for r in cur.fetchall()
            ]
            return TimelineOut(env_id=env_id, points=points)
    except Exception as exc:
        log.exception("ai_usage.get_timeline failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/by-skill", response_model=BySkillOut)
def get_by_skill(env_id: str = Query(...)) -> BySkillOut:
    try:
        with get_cursor() as cur:
            _set_env(cur, env_id)
            cur.execute(
                """
                SELECT skill, calls, billed_input_tokens, output_tokens, cost_cents, avg_duration_ms
                FROM nv_ai_usage_by_skill
                WHERE env_id = %s
                ORDER BY cost_cents DESC
                LIMIT 50
                """,
                (env_id,),
            )
            rows = [
                SkillRow(
                    skill=r["skill"],
                    calls=r["calls"],
                    billed_input_tokens=r["billed_input_tokens"],
                    output_tokens=r["output_tokens"],
                    cost_cents=r["cost_cents"],
                    avg_duration_ms=r["avg_duration_ms"],
                )
                for r in cur.fetchall()
            ]
            return BySkillOut(env_id=env_id, rows=rows)
    except Exception as exc:
        log.exception("ai_usage.get_by_skill failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/recommendations", response_model=RecommendationsOut)
def get_recommendations(env_id: str = Query(...)) -> RecommendationsOut:
    try:
        with get_cursor() as cur:
            _set_env(cur, env_id)
            cur.execute(
                """
                SELECT id::text, rule_code, severity, title, body_md,
                       target_skill, target_workflow, target_user_email,
                       est_monthly_savings_cents, confidence_pct, state,
                       first_detected_at::text, last_detected_at::text
                FROM nv_ai_recommendation
                WHERE env_id = %s AND state = 'open'
                ORDER BY est_monthly_savings_cents DESC, severity DESC
                """,
                (env_id,),
            )
            rows = [
                RecommendationRow(
                    id=r["id"],
                    rule_code=r["rule_code"],
                    severity=r["severity"],
                    title=r["title"],
                    body_md=r["body_md"],
                    target_skill=r["target_skill"],
                    target_workflow=r["target_workflow"],
                    target_user_email=r["target_user_email"],
                    est_monthly_savings_cents=r["est_monthly_savings_cents"],
                    confidence_pct=r["confidence_pct"],
                    state=r["state"],
                    first_detected_at=r["first_detected_at"],
                    last_detected_at=r["last_detected_at"],
                )
                for r in cur.fetchall()
            ]
            return RecommendationsOut(env_id=env_id, rows=rows)
    except Exception as exc:
        log.exception("ai_usage.get_recommendations failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Recommendation lifecycle
# ---------------------------------------------------------------------------

class StateChangeIn(BaseModel):
    reason: Optional[str] = None
    actor_email: Optional[str] = None


@router.post("/recommendations/{rec_id}/apply")
def apply_recommendation(rec_id: str, body: StateChangeIn, env_id: str = Query(...)) -> dict:
    try:
        with get_cursor() as cur:
            _set_env(cur, env_id)
            cur.execute(
                """
                UPDATE nv_ai_recommendation
                SET state = 'applied',
                    applied_at = now(),
                    applied_by = %s,
                    updated_at = now()
                WHERE id = %s AND env_id = %s AND state = 'open'
                RETURNING id
                """,
                (body.actor_email, rec_id, env_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="recommendation not found or not open")
            return {"id": rec_id, "state": "applied"}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("ai_usage.apply_recommendation failed rec_id=%s", rec_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/recommendations/{rec_id}/dismiss")
def dismiss_recommendation(rec_id: str, body: StateChangeIn, env_id: str = Query(...)) -> dict:
    try:
        with get_cursor() as cur:
            _set_env(cur, env_id)
            cur.execute(
                """
                UPDATE nv_ai_recommendation
                SET state = 'dismissed',
                    dismissed_reason = %s,
                    updated_at = now()
                WHERE id = %s AND env_id = %s AND state = 'open'
                RETURNING id
                """,
                (body.reason, rec_id, env_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="recommendation not found or not open")
            return {"id": rec_id, "state": "dismissed"}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("ai_usage.dismiss_recommendation failed rec_id=%s", rec_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
