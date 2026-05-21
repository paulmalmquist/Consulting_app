"""History Rhymes Morning Book v1 API route.

Endpoint:
    GET /api/hr/v1/research/morning-book

Computes the deterministic regime-transition delta between the two most recent
research briefs. The route owns the DB reads; all delta logic lives in the pure
service `app.services.hr_morning_book`. No LLM, no inference. Fails closed:
degraded / insufficient-data states return HTTP 200 with warnings, never 5xx.

See also:
    - backend/app/services/hr_morning_book.py   (pure delta computation)
    - backend/app/routes/hr_research.py          (sibling research-bridge routes)
"""

from __future__ import annotations

import logging
from datetime import date, timezone, datetime
from typing import Any

from fastapi import APIRouter

from app.db import get_cursor
from app.services.hr_morning_book import (
    INSUFFICIENT_DATA_RESULT,
    RESEARCH_ONLY,
    compute_morning_book,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hr/v1/research", tags=["history-rhymes-morning-book"])

_SAFE_ERROR_RESULT: dict[str, Any] = {
    **INSUFFICIENT_DATA_RESULT,
    "what_changed": ["Morning Book could not be computed."],
    "warnings": [
        "Internal computation error; falling back to Research Only.",
    ],
    "triage": RESEARCH_ONLY,
}


@router.get("/morning-book")
def get_morning_book() -> dict[str, Any]:
    """Return the latest-vs-previous research-brief delta. Always HTTP 200."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT brief_id, brief_date, parsed_json, confidence,
                       freshness_score, created_at
                  FROM hr_research_briefs
                 ORDER BY created_at DESC
                 LIMIT 2;
                """
            )
            briefs = cur.fetchall() or []

            brief_ids = [b["brief_id"] for b in briefs]
            candidates: list[dict[str, Any]] = []
            if brief_ids:
                cur.execute(
                    """
                    SELECT candidate_id, brief_id, title, priority, status,
                           adversarial_verdict, confidence, created_at
                      FROM hr_enhancement_candidates
                     WHERE brief_id = ANY(%s)
                     ORDER BY created_at DESC;
                    """,
                    (brief_ids,),
                )
                candidates = cur.fetchall() or []

        latest_brief = briefs[0] if len(briefs) >= 1 else None
        previous_brief = briefs[1] if len(briefs) >= 2 else None

        latest_id = latest_brief["brief_id"] if latest_brief else None
        previous_id = previous_brief["brief_id"] if previous_brief else None
        latest_candidates = [c for c in candidates if c["brief_id"] == latest_id]
        previous_candidates = [c for c in candidates if c["brief_id"] == previous_id]

        result = compute_morning_book(
            latest_brief=latest_brief,
            previous_brief=previous_brief,
            latest_candidates=latest_candidates,
            previous_candidates=previous_candidates,
            today=datetime.now(timezone.utc).date(),
        )
        return result.to_dict()

    except Exception:  # noqa: BLE001 — fail closed, never 5xx the Morning Book
        logger.exception("Morning Book computation failed")
        return dict(_SAFE_ERROR_RESULT)
