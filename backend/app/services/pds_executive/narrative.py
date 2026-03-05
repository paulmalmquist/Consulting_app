from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

from app.db import get_cursor

DRAFT_TYPES = {
    "earnings_call": "Earnings Call Statement",
    "press_release": "Press Release Statement",
    "internal_memo": "Internal Memo",
    "conference_talking_points": "Conference Talking Points",
    "board_briefing": "Board Briefing Statement",
    "investor_briefing": "Investor Briefing Statement",
}

BLACKLIST_TERMS = [
    "llm",
    "vector database",
    "embedding",
    "transformer",
    "model parameter",
    "fine-tuning",
    "rag",
]


def _render_fallback(*, draft_type: str, metrics: dict) -> str:
    risks = int(metrics.get("risk_events") or 0)
    queue = int(metrics.get("open_queue") or 0)
    saved_hours = int(metrics.get("hours_saved") or 0)

    if draft_type == "earnings_call":
        return (
            "We continue to invest in AI and data capabilities across our project delivery platform. "
            f"This quarter, these capabilities helped teams surface {risks} risk signals early, "
            "improve decision speed, and maintain better execution discipline across our portfolio."
        )
    if draft_type == "press_release":
        return (
            "AI-driven analytics are now embedded in our project management workflow, helping teams detect "
            f"risk signals earlier and keep complex programs moving with greater transparency. {queue} "
            "priority executive decisions were surfaced through our command workflow."
        )
    if draft_type == "conference_talking_points":
        return (
            f"AI helps us detect risk earlier\n"
            "AI improves decision-making speed\n"
            f"AI supports project managers by reducing reporting load ({saved_hours} hours saved)\n"
            "AI increases transparency for clients"
        )
    if draft_type == "board_briefing":
        return (
            "Our executive automation layer is now providing consistent portfolio visibility, with improved "
            "risk detection, faster escalation paths, and clearer accountability for action owners."
        )
    if draft_type == "investor_briefing":
        return (
            "Digital execution capabilities are improving delivery reliability and pipeline clarity, helping us "
            "manage portfolio risk while maintaining disciplined growth."
        )
    return (
        "Our continued investment in AI tools allows project leaders to spend less time on reporting and "
        "more time solving client delivery challenges."
    )


def _build_prompt(*, draft_type: str, metrics: dict) -> str:
    return (
        "Write an executive communication draft using non-technical language. "
        "Focus only on outcomes, efficiency, innovation, and client value. "
        "Do not mention implementation details, models, or tooling internals.\n\n"
        f"Draft type: {draft_type}\n"
        f"Metrics: {json.dumps(metrics)}\n"
    )


def _guardrail_flags(text: str) -> list[str]:
    lowered = text.lower()
    flags: list[str] = []
    for term in BLACKLIST_TERMS:
        if term in lowered:
            flags.append(term)
    return flags


def _get_metrics(*, env_id: UUID, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS open_queue
            FROM pds_exec_queue_item
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status IN ('open', 'in_review', 'deferred')
            """,
            (str(env_id), str(business_id)),
        )
        queue_row = cur.fetchone() or {}

        cur.execute(
            """
            SELECT COUNT(*) AS risk_events
            FROM pds_exec_signal_event
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status IN ('open', 'acknowledged')
              AND severity IN ('high', 'critical')
            """,
            (str(env_id), str(business_id)),
        )
        risk_row = cur.fetchone() or {}

        cur.execute(
            """
            SELECT admin_workload_delta
            FROM pds_exec_kpi_daily
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
            ORDER BY kpi_date DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id)),
        )
        kpi_row = cur.fetchone() or {}

    return {
        "open_queue": int(queue_row.get("open_queue") or 0),
        "risk_events": int(risk_row.get("risk_events") or 0),
        "hours_saved": int(float(kpi_row.get("admin_workload_delta") or 0) * 10),
        "generated_at": datetime.utcnow().isoformat(),
    }


def _maybe_generate_with_gateway(prompt: str) -> tuple[str | None, str | None]:
    """Try to generate text via OpenAI API. Falls back gracefully."""
    from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL

    if not OPENAI_API_KEY:
        return None, "OPENAI_API_KEY not configured"

    try:
        import openai

        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=OPENAI_CHAT_MODEL,
            messages=[
                {"role": "system", "content": "Write executive communications in non-technical language."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=500,
        )
        text = response.choices[0].message.content or ""
        return text.strip() or None, None
    except Exception as exc:
        return None, str(exc)


def generate_drafts(
    *,
    env_id: UUID,
    business_id: UUID,
    draft_types: list[str] | None = None,
    actor: str | None = None,
    source_run_id: str | None = None,
) -> list[dict]:
    types = draft_types or ["earnings_call", "press_release", "internal_memo", "conference_talking_points"]
    for draft_type in types:
        if draft_type not in DRAFT_TYPES:
            raise ValueError(f"Unsupported draft type: {draft_type}")

    metrics = _get_metrics(env_id=env_id, business_id=business_id)
    rows: list[dict] = []

    with get_cursor() as cur:
        for draft_type in types:
            prompt = _build_prompt(draft_type=draft_type, metrics=metrics)
            llm_text, llm_error = _maybe_generate_with_gateway(prompt)
            fallback_used = False
            body = (llm_text or "").strip()
            if not body:
                fallback_used = True
                body = _render_fallback(draft_type=draft_type, metrics=metrics)

            flags = _guardrail_flags(body)
            metadata_json = {
                "metrics": metrics,
                "llm_error": llm_error,
                "generated_with": "gateway" if llm_text else "fallback",
            }

            cur.execute(
                """
                INSERT INTO pds_exec_narrative_draft
                (env_id, business_id, draft_type, title, body_text, guardrail_flags_json,
                 status, source_run_id, model_used, fallback_used, metadata_json,
                 created_by, updated_by)
                VALUES
                (%s::uuid, %s::uuid, %s, %s, %s, %s::jsonb,
                 'draft', %s, %s, %s, %s::jsonb,
                 %s, %s)
                RETURNING *
                """,
                (
                    str(env_id),
                    str(business_id),
                    draft_type,
                    DRAFT_TYPES[draft_type],
                    body,
                    json.dumps(flags),
                    source_run_id,
                    "openai_gateway" if llm_text else "deterministic_template",
                    fallback_used,
                    json.dumps(metadata_json),
                    actor,
                    actor,
                ),
            )
            rows.append(cur.fetchone())

    return rows


def list_drafts(
    *,
    env_id: UUID,
    business_id: UUID,
    draft_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict]:
    where = ["env_id = %s::uuid", "business_id = %s::uuid"]
    params: list = [str(env_id), str(business_id)]
    if draft_type:
        where.append("draft_type = %s")
        params.append(draft_type)
    if status:
        where.append("status = %s")
        params.append(status)
    params.append(max(1, min(limit, 250)))

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM pds_exec_narrative_draft
            WHERE {' AND '.join(where)}
            ORDER BY created_at DESC
            LIMIT %s
            """,
            tuple(params),
        )
        return cur.fetchall()


def approve_draft(
    *,
    env_id: UUID,
    business_id: UUID,
    draft_id: UUID,
    actor: str | None,
    edited_body_text: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE pds_exec_narrative_draft
            SET status = 'approved',
                body_text = COALESCE(%s, body_text),
                approved_by = %s,
                approved_at = now(),
                updated_by = %s,
                updated_at = now()
            WHERE draft_id = %s::uuid
              AND env_id = %s::uuid
              AND business_id = %s::uuid
            RETURNING *
            """,
            (
                edited_body_text,
                actor,
                actor,
                str(draft_id),
                str(env_id),
                str(business_id),
            ),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Narrative draft not found")
        return row
