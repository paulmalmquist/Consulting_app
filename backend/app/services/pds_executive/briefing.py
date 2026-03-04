from __future__ import annotations

import json
from datetime import date
from uuid import UUID

from app.db import get_cursor
from app.services.pds_executive import narrative


def _current_period() -> str:
    today = date.today()
    return f"{today.year}-{today.month:02d}"


def _build_sections(*, briefing_type: str, metrics: dict) -> list[dict]:
    queue_count = int(metrics.get("open_queue") or 0)
    high_signals = int(metrics.get("high_signals") or 0)
    pipeline_value = metrics.get("pipeline_value_open") or "0"

    return [
        {
            "key": "portfolio_performance",
            "title": "Portfolio Performance",
            "body": (
                "Delivery reliability remained stable while the executive queue prioritized the highest-impact items. "
                f"There are currently {queue_count} active executive decisions in workflow."
            ),
        },
        {
            "key": "risk_commentary",
            "title": "Risk Commentary",
            "body": (
                f"{high_signals} high-severity risk signals were surfaced through the automation layer, "
                "enabling earlier intervention and tighter governance of escalation paths."
            ),
        },
        {
            "key": "pipeline_outlook",
            "title": "Pipeline Outlook",
            "body": (
                f"Open pipeline remains active with approximately ${pipeline_value} in tracked opportunities. "
                "Leadership is adjusting pursuit posture toward higher-certainty opportunities."
            ),
        },
        {
            "key": "ai_impact",
            "title": "AI Impact",
            "body": (
                "Automation is reducing reporting overhead and surfacing decision-ready recommendations, "
                "allowing leaders to spend more time on strategic and client-facing work."
            ),
        },
        {
            "key": "stakeholder_note",
            "title": "Stakeholder Positioning",
            "body": (
                "The executive layer is strengthening consistency in risk governance and communication quality, "
                f"which supports {briefing_type} confidence in execution discipline."
            ),
        },
    ]


def _collect_metrics(*, env_id: UUID, business_id: UUID) -> dict:
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
            SELECT COUNT(*) AS high_signals
            FROM pds_exec_signal_event
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status IN ('open', 'acknowledged')
              AND severity IN ('high', 'critical')
            """,
            (str(env_id), str(business_id)),
        )
        signal_row = cur.fetchone() or {}

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS pipeline_value_open
            FROM crm_opportunity
            WHERE business_id = %s::uuid
              AND status = 'open'
            """,
            (str(business_id),),
        )
        pipeline_row = cur.fetchone() or {}

    return {
        "open_queue": int(queue_row.get("open_queue") or 0),
        "high_signals": int(signal_row.get("high_signals") or 0),
        "pipeline_value_open": str(pipeline_row.get("pipeline_value_open") or "0"),
    }


def generate_briefing_pack(
    *,
    env_id: UUID,
    business_id: UUID,
    briefing_type: str,
    period: str | None = None,
    actor: str | None = None,
    source_run_id: str | None = None,
) -> dict:
    bt = briefing_type.strip().lower()
    if bt not in {"board", "investor"}:
        raise ValueError("briefing_type must be 'board' or 'investor'")

    selected_period = period or _current_period()
    metrics = _collect_metrics(env_id=env_id, business_id=business_id)
    sections = _build_sections(briefing_type=bt, metrics=metrics)

    # Try to enrich summary with narrative engine first, then fallback to deterministic text.
    summary = None
    try:
        drafts = narrative.generate_drafts(
            env_id=env_id,
            business_id=business_id,
            draft_types=["board_briefing" if bt == "board" else "investor_briefing"],
            actor=actor,
            source_run_id=source_run_id,
        )
        summary = drafts[0].get("body_text") if drafts else None
    except Exception:  # noqa: BLE001
        summary = None

    if not summary:
        summary = (
            "Executive automation is improving visibility, accelerating escalation, and tightening decision accountability "
            f"across the portfolio for this {bt} cycle."
        )

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_exec_briefing_pack
            (env_id, business_id, briefing_type, period, title, sections_json, summary_text,
             status, generated_from_run_id, metadata_json, created_by, updated_by)
            VALUES
            (%s::uuid, %s::uuid, %s, %s, %s, %s::jsonb, %s,
             'draft', %s, %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                bt,
                selected_period,
                f"{bt.title()} Briefing - {selected_period}",
                json.dumps(sections),
                summary,
                source_run_id,
                json.dumps({"metrics": metrics}),
                actor,
                actor,
            ),
        )
        row = cur.fetchone()

    return row


def get_briefing_pack(*, env_id: UUID, business_id: UUID, briefing_pack_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_exec_briefing_pack
            WHERE briefing_pack_id = %s::uuid
              AND env_id = %s::uuid
              AND business_id = %s::uuid
            """,
            (str(briefing_pack_id), str(env_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Briefing pack not found")
        return row
