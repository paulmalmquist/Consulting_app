from __future__ import annotations

import json
from datetime import date
from uuid import UUID

from app.db import get_cursor
from app.services import pds_enterprise
from app.services.pds_executive import narrative


def _current_period() -> str:
    today = date.today()
    return f"{today.year}-{today.month:02d}"


def _build_sections(*, briefing_type: str, metrics: dict) -> list[dict]:
    queue_count = int(metrics.get("open_queue") or 0)
    high_signals = int(metrics.get("high_signals") or 0)
    pipeline_value = metrics.get("pipeline_value_open") or "0"
    briefing = metrics.get("enterprise_briefing") or {}
    metrics_strip = metrics.get("enterprise_metrics") or []
    delivery_risk = int(metrics.get("delivery_risk_projects") or 0)
    client_risk = int(metrics.get("client_risk_accounts") or 0)
    top_metric = next((item for item in metrics_strip if item.get("key") == "fee_vs_plan"), None)
    fee_delta = top_metric.get("delta_value") if isinstance(top_metric, dict) else None

    return [
        {
            "key": "portfolio_performance",
            "title": "Portfolio Performance",
            "body": (
                "Executive management is anchored on the enterprise command center. "
                f"Fee revenue is tracking {fee_delta or 'in line'} versus plan while {queue_count} active executive decisions remain in workflow."
            ),
        },
        {
            "key": "risk_commentary",
            "title": "Risk Commentary",
            "body": (
                f"{delivery_risk} projects require intervention, {client_risk} accounts are in client-risk status, and "
                f"{high_signals} automation signals remain open for executive review."
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
                "Automation is now generating management-ready commentary from the same market, account, project, and resource snapshots "
                "that drive the operating system."
            ),
        },
        {
            "key": "stakeholder_note",
            "title": "Stakeholder Positioning",
            "body": (
                f"{(briefing.get('headline') or 'Leadership has direct visibility into portfolio movement.')} "
                f"This supports {briefing_type} confidence in execution discipline."
            ),
        },
    ]


def _collect_metrics(*, env_id: UUID, business_id: UUID) -> dict:
    enterprise_payload: dict | None = None
    try:
        enterprise_payload = pds_enterprise.get_command_center(
            env_id=env_id,
            business_id=business_id,
            lens="market",
            horizon="YTD",
            role_preset="executive",
        )
    except Exception:  # noqa: BLE001
        enterprise_payload = None

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
        "enterprise_metrics": (enterprise_payload or {}).get("metrics_strip") or [],
        "enterprise_briefing": (enterprise_payload or {}).get("briefing") or {},
        "delivery_risk_projects": len((enterprise_payload or {}).get("delivery_risk") or []),
        "client_risk_accounts": len(
            [item for item in ((enterprise_payload or {}).get("satisfaction") or []) if item.get("risk_state") == "red"]
        ),
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
        enterprise_briefing = metrics.get("enterprise_briefing") or {}
        summary = enterprise_briefing.get("headline") or (
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
