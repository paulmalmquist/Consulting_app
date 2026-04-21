"""History Rhymes execution-loop API routes.

Endpoints:
    GET /api/hr/v1/state             — current time-aligned state + freshness verdict
    GET /api/hr/v1/decisions/latest  — most recent execution-layer decision
    GET /api/hr/v1/briefs/latest     — most recent weekly brief + parsed_json

v1 contract. Reads from `hr_current_state` (see migration 519) plus the base
tables for payload fields. No RLS, no env_id (hr_* module is single-tenant
analytics — exemption documented in ARCHITECTURE.md).

See also:
    - `skills/historyrhymes-execution-layer/SKILL.md` — decision contract
    - `backend/app/services/hr_decision_runner.py` — writer-side
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.db import get_cursor

router = APIRouter(prefix="/api/hr/v1", tags=["history-rhymes-execution"])


@router.get("/state")
def get_state() -> dict[str, Any]:
    """Return the current time-aligned HR state + freshness verdict."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM hr_current_state;")
        row = cur.fetchone()
    if row is None:
        return {
            "latest_brief_id": None,
            "latest_brief_at": None,
            "latest_snapshot_id": None,
            "latest_snapshot_at": None,
            "latest_decision_id": None,
            "latest_regime": None,
            "latest_confidence": None,
            "worst_input_age_hours": 9999.0,
            "freshness_verdict": "no_brief",
        }
    return {
        "latest_brief_id": _uuid_str(row.get("latest_brief_id")),
        "latest_brief_at": _iso(row.get("latest_brief_at")),
        "latest_snapshot_id": _uuid_str(row.get("latest_snapshot_id")),
        "latest_snapshot_at": _iso(row.get("latest_snapshot_at")),
        "latest_decision_id": _uuid_str(row.get("latest_decision_id")),
        "latest_decision_at": _iso(row.get("latest_decision_at")),
        "latest_regime": row.get("latest_regime"),
        "latest_confidence": _decimal_float(row.get("latest_confidence")),
        "worst_input_age_hours": _decimal_float(row.get("worst_input_age_hours")),
        "freshness_verdict": row.get("freshness_verdict"),
    }


@router.get("/decisions/latest")
def get_latest_decision() -> dict[str, Any]:
    """Return the most recent execution-layer decision (rows with regime populated)."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                id,
                prediction_date,
                regime,
                direction_confidence,
                positions,
                risk_json,
                alerts_json,
                execution_tasks,
                source_brief_id,
                source_snapshot_id,
                source,
                created_at
            FROM hr_predictions
            WHERE regime IS NOT NULL
            ORDER BY prediction_date DESC
            LIMIT 1;
            """
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="No execution-layer decision found")

    return {
        "decision_id": _uuid_str(row["id"]),
        "prediction_date": _iso(row["prediction_date"]),
        "regime": row["regime"],
        "confidence": _decimal_float(row["direction_confidence"]),
        "positions": row["positions"] or [],
        "risk": row["risk_json"] or {},
        "alerts": row["alerts_json"] or [],
        "execution_tasks": row["execution_tasks"] or [],
        "source_brief_id": _uuid_str(row["source_brief_id"]),
        "source_snapshot_id": _uuid_str(row["source_snapshot_id"]),
        "source": row["source"],
        "created_at": _iso(row["created_at"]),
    }


@router.get("/briefs/latest")
def get_latest_brief() -> dict[str, Any]:
    """Return the most recent weekly brief."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                brief_id,
                published_at,
                regime_call,
                confidence,
                freshness_score,
                markdown_uri,
                parsed_json,
                source,
                created_at
            FROM hr_weekly_briefs
            ORDER BY published_at DESC
            LIMIT 1;
            """
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="No weekly brief found")

    return {
        "brief_id": _uuid_str(row["brief_id"]),
        "published_at": _iso(row["published_at"]),
        "regime_call": row["regime_call"],
        "confidence": _decimal_float(row["confidence"]),
        "freshness_score": _decimal_float(row["freshness_score"]),
        "markdown_uri": row["markdown_uri"],
        "parsed_json": row["parsed_json"] or {},
        "source": row["source"],
        "created_at": _iso(row["created_at"]),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────


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
