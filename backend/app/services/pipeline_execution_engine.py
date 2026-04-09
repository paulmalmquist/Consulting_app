"""Operator layer for the consulting pipeline execution board."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.services import cro_pipeline, pipeline_execution_content
from app.services.reporting_common import resolve_tenant_id

EXECUTION_COLUMNS = [
    ("target_identified", "Target Identified"),
    ("outreach_drafted", "Outreach Drafted"),
    ("outreach_sent", "Outreach Sent"),
    ("engaged", "Engaged"),
    ("discovery_scheduled", "Discovery Scheduled"),
    ("demo_completed", "Demo Completed"),
    ("proposal_sent", "Proposal Sent"),
    ("negotiation", "Negotiation"),
    ("closed_won", "Closed Won"),
    ("closed_lost", "Closed Lost"),
]

COMMAND_PATTERNS = [
    ("move", re.compile(r"^move\s+(?P<deal>.+?)\s+to\s+(?P<column>.+)$", re.I)),
    ("draft_for_deal", re.compile(r"^draft outreach for\s+(?P<deal>.+)$", re.I)),
    ("draft_top_leads", re.compile(r"^draft outreach for top\s+(?P<count>\d+)\s+leads$", re.I)),
    ("follow_up", re.compile(r"^generate follow-?up for\s+(?P<deal>.+)$", re.I)),
    ("today", re.compile(r"^what should i do today$", re.I)),
    ("stuck", re.compile(r"^which deals are stuck$", re.I)),
    ("prep", re.compile(r"^prep me for\s+(?P<company>.+)$", re.I)),
    ("simulate", re.compile(r"^simulate\s+(?P<action>.+?)\s+for\s+(?P<deal>.+)$", re.I)),
]

COMMAND_HELP = [
    "move [deal] to [column]",
    "draft outreach for [deal]",
    "draft outreach for top [n] leads",
    "generate follow-up for [deal]",
    "what should I do today",
    "which deals are stuck",
    "prep me for [company]",
    "simulate [action] for [deal]",
]


def _safe_json_list(value) -> list:
    if isinstance(value, list):
        return value
    return []


def _safe_json_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    return {}


def _execution_column(row: dict) -> tuple[str, str]:
    stage_key = row.get("stage_key")
    state = _safe_json_dict(row.get("execution_state"))
    if stage_key == "closed_won":
        return ("closed_won", "Closed Won")
    if stage_key == "closed_lost":
        return ("closed_lost", "Closed Lost")
    if stage_key == "proposal":
        if state.get("negotiation_started_at"):
            return ("negotiation", "Negotiation")
        return ("proposal_sent", "Proposal Sent")
    if stage_key == "qualified":
        return ("demo_completed", "Demo Completed")
    if stage_key == "meeting":
        return ("discovery_scheduled", "Discovery Scheduled")
    if stage_key == "engaged":
        return ("engaged", "Engaged")
    if stage_key == "contacted":
        return ("outreach_sent", "Outreach Sent")
    if state.get("draft_approved_at") and not state.get("latest_outreach_sent_at"):
        return ("outreach_drafted", "Outreach Drafted")
    return ("target_identified", "Target Identified")


def _days_since(value) -> int | None:
    if not value:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return max(0, int((datetime.now(timezone.utc) - value).total_seconds() // 86400))


def _compute_pressure(row: dict) -> tuple[str, str, str, list[str]]:
    score = int(row.get("priority_score") or 50)
    amount = float(row.get("amount") or 0)
    last_days = _days_since(row.get("last_activity_at"))
    no_action = not row.get("next_action_description")
    no_reply_count = int(row.get("no_reply_count") or 0)
    risk_flags: list[str] = []
    pressure_points = 0

    if score >= 80:
        pressure_points += 2
    elif score >= 60:
        pressure_points += 1
    if amount >= 100000:
        pressure_points += 2
    elif amount >= 50000:
        pressure_points += 1
    if last_days is not None and last_days >= 7:
        pressure_points += 3
        risk_flags.append("stalled_7d")
    elif last_days is not None and last_days >= 3:
        pressure_points += 1
        risk_flags.append("inactive_3d")
    if no_action:
        pressure_points += 2
        risk_flags.append("no_next_action")
    if no_reply_count >= 2:
        pressure_points += 2
        risk_flags.append("repeated_no_response")

    if pressure_points >= 6:
        pressure = "critical"
    elif pressure_points >= 4:
        pressure = "high"
    elif pressure_points >= 2:
        pressure = "medium"
    else:
        pressure = "low"

    if last_days is not None and last_days >= 7 or no_reply_count >= 2:
        drift = "at_risk"
    elif last_days is not None and last_days >= 3 or no_action:
        drift = "drifting"
    else:
        drift = "stable"

    if row.get("recent_reply_at") or score >= 75:
        momentum = "increasing"
    elif last_days is not None and last_days >= 5:
        momentum = "declining"
    else:
        momentum = "flat"

    return pressure, drift, momentum, risk_flags


def _build_ranked_actions(row: dict) -> list[dict]:
    actions = []
    if not row.get("next_action_description"):
        actions.append({
            "action_key": "define_next_step",
            "label": "Define next step",
            "description": "Create a concrete next action so this deal can move.",
            "impact": "high",
            "urgency": "high",
            "reasoning": "This deal cannot advance safely without a next step.",
        })
    if int(row.get("no_reply_count") or 0) >= 1:
        actions.append({
            "action_key": "reframe_follow_up",
            "label": "Reframe pitch",
            "description": "Send a follow-up with a rotated angle.",
            "impact": "high",
            "urgency": "high",
            "reasoning": "The last outreach did not earn a reply, so repeating the same angle is low leverage.",
        })
    if row.get("execution_column_key") in {"engaged", "discovery_scheduled"}:
        actions.append({
            "action_key": "schedule_demo",
            "label": "Schedule demo",
            "description": "Push toward a concrete demo or diagnostic session.",
            "impact": "high",
            "urgency": "medium",
            "reasoning": "This deal is warm enough to convert attention into a live workflow review.",
        })
    actions.append({
        "action_key": "follow_up",
        "label": "Send follow-up",
        "description": row.get("next_action_description") or "Follow up with a concrete ask.",
        "impact": "medium",
        "urgency": "medium",
        "reasoning": "A visible next step keeps the deal from drifting.",
    })
    return actions[:3]


def _build_stage_suggestions(row: dict) -> list[dict]:
    suggestions = []
    if row.get("recent_reply_at") and row.get("stage_key") in {"contacted", "identified", "research"}:
        suggestions.append({
            "suggested_execution_column": "engaged",
            "underlying_stage_key": "engaged",
            "reasoning": "A reply was detected after outreach, which is the threshold for engagement.",
            "confidence": 0.84,
            "trigger_source": "reply_detected",
        })
    if row.get("meeting_booked"):
        suggestions.append({
            "suggested_execution_column": "discovery_scheduled",
            "underlying_stage_key": "meeting",
            "reasoning": "Meeting booked signal is present.",
            "confidence": 0.91,
            "trigger_source": "meeting_booked",
        })
    if _safe_json_dict(row.get("execution_state")).get("demo_completed_at"):
        suggestions.append({
            "suggested_execution_column": "proposal_sent",
            "underlying_stage_key": "proposal",
            "reasoning": "Demo completion is recorded, so the next operator move is proposal packaging.",
            "confidence": 0.78,
            "trigger_source": "demo_completed",
        })
    return suggestions


def _load_rows(*, env_id: str, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            SELECT
              o.crm_opportunity_id,
              o.crm_account_id,
              o.name,
              COALESCE(o.amount, 0) AS amount,
              o.status,
              o.expected_close_date,
              o.created_at,
              a.name AS account_name,
              a.industry,
              s.key AS stage_key,
              s.label AS stage_label,
              s.stage_order,
              s.win_probability,
              c.full_name AS contact_name,
              ep.personas,
              ep.pain_hypothesis,
              ep.value_prop,
              ep.demo_angle,
              ep.priority_score,
              ep.engagement_summary,
              ep.execution_pressure,
              ep.momentum_status,
              ep.risk_flags,
              ep.deal_drift_status,
              ep.deal_playbook,
              ep.auto_draft_stack,
              ep.execution_state,
              ep.narrative_memory,
              ep.snoozed_until,
              ep.snooze_reason,
              ep.last_ai_generated_at,
              la.last_activity_at,
              na.description AS next_action_description,
              na.due_date AS next_action_due,
              na.action_type AS next_action_type,
              nr.no_reply_count,
              ro.recent_reply_at,
              ro.meeting_booked
            FROM crm_opportunity o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            LEFT JOIN crm_contact c ON c.crm_contact_id = o.primary_contact_id
            LEFT JOIN cro_execution_profile ep ON ep.crm_opportunity_id = o.crm_opportunity_id
            LEFT JOIN LATERAL (
              SELECT MAX(activity_at) AS last_activity_at
              FROM crm_activity
              WHERE crm_opportunity_id = o.crm_opportunity_id
            ) la ON true
            LEFT JOIN LATERAL (
              SELECT description, due_date, action_type
              FROM cro_next_action
              WHERE entity_type = 'opportunity'
                AND entity_id = o.crm_opportunity_id
                AND env_id = %s
                AND status IN ('pending', 'in_progress')
              ORDER BY due_date ASC
              LIMIT 1
            ) na ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*)::int AS no_reply_count
              FROM cro_outreach_log
              WHERE crm_account_id = o.crm_account_id
                AND business_id = %s
                AND direction = 'outbound'
                AND replied_at IS NULL
            ) nr ON true
            LEFT JOIN LATERAL (
              SELECT replied_at AS recent_reply_at, meeting_booked
              FROM cro_outreach_log
              WHERE crm_account_id = o.crm_account_id
                AND business_id = %s
                AND replied_at IS NOT NULL
              ORDER BY replied_at DESC
              LIMIT 1
            ) ro ON true
            WHERE o.business_id = %s
            ORDER BY s.stage_order NULLS LAST, o.created_at DESC
            """,
            (env_id, str(business_id), str(business_id), str(business_id)),
        )
        return cur.fetchall()


def _row_to_card(row: dict) -> dict:
    column_key, column_label = _execution_column(row)
    pressure, drift, momentum, computed_flags = _compute_pressure(row)
    risk_flags = list(dict.fromkeys(_safe_json_list(row.get("risk_flags")) + computed_flags))
    profile = {
        "personas": _safe_json_list(row.get("personas")),
        "pain_hypothesis": row.get("pain_hypothesis"),
        "value_prop": row.get("value_prop"),
        "demo_angle": row.get("demo_angle"),
        "priority_score": int(row.get("priority_score") or 50),
        "engagement_summary": row.get("engagement_summary"),
        "execution_pressure": pressure,
        "momentum_status": momentum,
        "risk_flags": risk_flags,
        "deal_drift_status": drift,
        "deal_playbook": _safe_json_dict(row.get("deal_playbook")),
        "auto_draft_stack": _safe_json_dict(row.get("auto_draft_stack")),
        "execution_state": _safe_json_dict(row.get("execution_state")),
        "narrative_memory": _safe_json_dict(row.get("narrative_memory")),
        "last_ai_generated_at": row.get("last_ai_generated_at"),
    }
    card = {
        **row,
        **profile,
        "execution_column_key": column_key,
        "execution_column_label": column_label,
        "ranked_next_actions": _build_ranked_actions({
            **row,
            "execution_column_key": column_key,
            "next_action_description": row.get("next_action_description"),
        }),
        "stage_suggestions": _build_stage_suggestions({**row, "execution_column_key": column_key}),
        "latest_angle_used": profile["narrative_memory"].get("last_outbound_angle"),
        "latest_objection": profile["narrative_memory"].get("latest_objection_surfaced"),
    }
    return card


def _audit_event(
    *,
    env_id: str,
    business_id: UUID,
    event_type: str,
    crm_opportunity_id: UUID | None = None,
    crm_account_id: UUID | None = None,
    actor: str | None = None,
    command_text: str | None = None,
    requires_confirmation: bool = False,
    status: str = "completed",
    payload_json: dict | None = None,
) -> str | None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_execution_audit
              (env_id, business_id, crm_opportunity_id, crm_account_id, event_type, actor,
               command_text, requires_confirmation, status, payload_json, confirmed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb,
                    CASE WHEN %s = 'completed' AND %s THEN now() ELSE NULL END)
            RETURNING id
            """,
            (
                env_id,
                str(business_id),
                str(crm_opportunity_id) if crm_opportunity_id else None,
                str(crm_account_id) if crm_account_id else None,
                event_type,
                actor,
                command_text,
                requires_confirmation,
                status,
                payload_json or {},
                status,
                requires_confirmation,
            ),
        )
        row = cur.fetchone()
        return str(row["id"]) if row else None


def _upsert_profile(
    *,
    env_id: str,
    business_id: UUID,
    opportunity_id: UUID,
    patch: dict,
) -> None:
    fields = {
        "personas": patch.get("personas", []),
        "pain_hypothesis": patch.get("pain_hypothesis"),
        "value_prop": patch.get("value_prop"),
        "demo_angle": patch.get("demo_angle"),
        "priority_score": patch.get("priority_score", 50),
        "engagement_summary": patch.get("engagement_summary"),
        "execution_pressure": patch.get("execution_pressure", "medium"),
        "momentum_status": patch.get("momentum_status", "flat"),
        "risk_flags": patch.get("risk_flags", []),
        "deal_drift_status": patch.get("deal_drift_status", "stable"),
        "deal_playbook": patch.get("deal_playbook", {}),
        "auto_draft_stack": patch.get("auto_draft_stack", {}),
        "execution_state": patch.get("execution_state", {}),
        "narrative_memory": patch.get("narrative_memory", {}),
    }
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_execution_profile
              (env_id, business_id, crm_opportunity_id, personas, pain_hypothesis, value_prop,
               demo_angle, priority_score, engagement_summary, execution_pressure, momentum_status,
               risk_flags, deal_drift_status, deal_playbook, auto_draft_stack, execution_state,
               narrative_memory, last_ai_generated_at, updated_at)
            VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, now(), now())
            ON CONFLICT (crm_opportunity_id) DO UPDATE SET
              personas = EXCLUDED.personas,
              pain_hypothesis = COALESCE(EXCLUDED.pain_hypothesis, cro_execution_profile.pain_hypothesis),
              value_prop = COALESCE(EXCLUDED.value_prop, cro_execution_profile.value_prop),
              demo_angle = COALESCE(EXCLUDED.demo_angle, cro_execution_profile.demo_angle),
              priority_score = EXCLUDED.priority_score,
              engagement_summary = COALESCE(EXCLUDED.engagement_summary, cro_execution_profile.engagement_summary),
              execution_pressure = EXCLUDED.execution_pressure,
              momentum_status = EXCLUDED.momentum_status,
              risk_flags = EXCLUDED.risk_flags,
              deal_drift_status = EXCLUDED.deal_drift_status,
              deal_playbook = EXCLUDED.deal_playbook,
              auto_draft_stack = EXCLUDED.auto_draft_stack,
              execution_state = EXCLUDED.execution_state,
              narrative_memory = EXCLUDED.narrative_memory,
              last_ai_generated_at = now(),
              updated_at = now()
            """,
            (
                env_id,
                str(business_id),
                str(opportunity_id),
                fields["personas"],
                fields["pain_hypothesis"],
                fields["value_prop"],
                fields["demo_angle"],
                fields["priority_score"],
                fields["engagement_summary"],
                fields["execution_pressure"],
                fields["momentum_status"],
                fields["risk_flags"],
                fields["deal_drift_status"],
                fields["deal_playbook"],
                fields["auto_draft_stack"],
                fields["execution_state"],
                fields["narrative_memory"],
            ),
        )


def get_execution_board(*, env_id: str, business_id: UUID) -> dict:
    rows = [_row_to_card(row) for row in _load_rows(env_id=env_id, business_id=business_id)]
    columns = []
    total_pipeline = Decimal("0")
    weighted_pipeline = Decimal("0")
    for key, label in EXECUTION_COLUMNS:
        cards = [row for row in rows if row["execution_column_key"] == key]
        total_value = sum(Decimal(str(row.get("amount") or 0)) for row in cards)
        weighted_value = sum(
            Decimal(str(row.get("amount") or 0)) * Decimal(str(row.get("win_probability") or 0))
            for row in cards
        )
        if key not in {"closed_won", "closed_lost"}:
            total_pipeline += total_value
            weighted_pipeline += weighted_value
        columns.append({
            "execution_column_key": key,
            "execution_column_label": label,
            "cards": cards,
            "total_value": float(total_value),
            "weighted_value": float(weighted_value),
        })
    today_queue = [
        row for row in rows
        if row["execution_pressure"] in {"high", "critical"}
        or "stalled_7d" in row["risk_flags"]
        or "no_next_action" in row["risk_flags"]
    ]
    today_queue.sort(key=lambda item: (item["execution_pressure"] != "critical", -(item.get("priority_score") or 0), -(item.get("amount") or 0)))
    critical_deals = [row for row in rows if row["execution_pressure"] == "critical"]
    return {
        "columns": columns,
        "total_pipeline": float(total_pipeline),
        "weighted_pipeline": float(weighted_pipeline),
        "today_queue": today_queue[:5],
        "critical_deals": critical_deals,
        "alerts": [
            {
                "level": "critical" if deal["execution_pressure"] == "critical" else "warning",
                "deal_id": str(deal["crm_opportunity_id"]),
                "message": f"{deal['account_name'] or deal['name']} is under {deal['execution_pressure']} execution pressure.",
            }
            for deal in today_queue[:5]
        ],
    }


def get_execution_detail(*, env_id: str, business_id: UUID, opportunity_id: UUID) -> dict:
    rows = _load_rows(env_id=env_id, business_id=business_id)
    match = next((row for row in rows if str(row["crm_opportunity_id"]) == str(opportunity_id)), None)
    if not match:
        raise LookupError(f"Opportunity {opportunity_id} not found")
    card = _row_to_card(match)
    if not card["auto_draft_stack"]:
        card["auto_draft_stack"] = pipeline_execution_content.build_auto_draft_stack(
            deal=card,
            profile=card,
            execution_column=card["execution_column_key"],
        )
    return {
        "card": card,
        "ranked_next_actions": card["ranked_next_actions"],
        "stage_suggestions": card["stage_suggestions"],
        "auto_draft_stack": card["auto_draft_stack"],
    }


def get_daily_execution_brief(*, env_id: str, business_id: UUID) -> dict:
    board = get_execution_board(env_id=env_id, business_id=business_id)
    top_deals = board["today_queue"][:3]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "top_deals": top_deals,
        "actions": [
            {
                "deal_id": item["crm_opportunity_id"],
                "company_name": item.get("account_name"),
                "execution_pressure": item.get("execution_pressure"),
                "next_actions": item.get("ranked_next_actions", [])[:2],
                "drafts": item.get("auto_draft_stack") or pipeline_execution_content.build_auto_draft_stack(
                    deal=item,
                    profile=item,
                    execution_column=item["execution_column_key"],
                ),
            }
            for item in top_deals
        ],
        "critical_count": len(board["critical_deals"]),
    }


def list_stuck_deals(*, env_id: str, business_id: UUID) -> list[dict]:
    board = get_execution_board(env_id=env_id, business_id=business_id)
    return [item for item in board["today_queue"] if item["deal_drift_status"] in {"drifting", "at_risk"}]


def list_stage_suggestions(*, env_id: str, business_id: UUID) -> list[dict]:
    rows = [_row_to_card(row) for row in _load_rows(env_id=env_id, business_id=business_id)]
    suggestions = []
    for row in rows:
        for suggestion in row["stage_suggestions"]:
            suggestions.append({
                **suggestion,
                "crm_opportunity_id": row["crm_opportunity_id"],
                "account_name": row.get("account_name"),
            })
    return suggestions


def draft_outreach(*, env_id: str, business_id: UUID, opportunity_id: UUID) -> dict:
    detail = get_execution_detail(env_id=env_id, business_id=business_id, opportunity_id=opportunity_id)
    draft_stack = pipeline_execution_content.build_auto_draft_stack(
        deal=detail["card"],
        profile=detail["card"],
        execution_column=detail["card"]["execution_column_key"],
    )
    state = detail["card"]["execution_state"]
    state["draft_approved_at"] = datetime.now(timezone.utc).isoformat()
    narrative = detail["card"]["narrative_memory"]
    narrative["last_recommended_next_move"] = "draft_outreach"
    _upsert_profile(
        env_id=env_id,
        business_id=business_id,
        opportunity_id=opportunity_id,
        patch={
            **detail["card"],
            "auto_draft_stack": draft_stack,
            "execution_state": state,
            "narrative_memory": narrative,
        },
    )
    audit_id = _audit_event(
        env_id=env_id,
        business_id=business_id,
        event_type="draft_outreach_generated",
        crm_opportunity_id=opportunity_id,
        crm_account_id=UUID(str(detail["card"]["crm_account_id"])) if detail["card"].get("crm_account_id") else None,
        payload_json={"draft_stack": draft_stack},
    )
    return {"audit_id": audit_id, "draft_stack": draft_stack}


def generate_followups(*, env_id: str, business_id: UUID, opportunity_id: UUID) -> dict:
    detail = get_execution_detail(env_id=env_id, business_id=business_id, opportunity_id=opportunity_id)
    followups = pipeline_execution_content.build_followups(deal=detail["card"], profile=detail["card"], count=3)
    stack = _safe_json_dict(detail["card"].get("auto_draft_stack"))
    stack["followups"] = followups
    narrative = detail["card"]["narrative_memory"]
    if followups:
        narrative["continuity_notes"] = f"Last follow-up was rotated to the {followups[0]['angle_key']} angle."
    _upsert_profile(
        env_id=env_id,
        business_id=business_id,
        opportunity_id=opportunity_id,
        patch={**detail["card"], "auto_draft_stack": stack, "narrative_memory": narrative},
    )
    audit_id = _audit_event(
        env_id=env_id,
        business_id=business_id,
        event_type="followups_generated",
        crm_opportunity_id=opportunity_id,
        payload_json={"followups": followups},
    )
    return {"audit_id": audit_id, "followups": followups}


def meeting_prep(*, env_id: str, business_id: UUID, opportunity_id: UUID) -> dict:
    detail = get_execution_detail(env_id=env_id, business_id=business_id, opportunity_id=opportunity_id)
    prep = pipeline_execution_content.build_meeting_prep(deal=detail["card"], profile=detail["card"])
    stack = _safe_json_dict(detail["card"].get("auto_draft_stack"))
    stack["meeting_prep"] = prep
    _upsert_profile(env_id=env_id, business_id=business_id, opportunity_id=opportunity_id, patch={**detail["card"], "auto_draft_stack": stack})
    audit_id = _audit_event(
        env_id=env_id,
        business_id=business_id,
        event_type="meeting_prep_generated",
        crm_opportunity_id=opportunity_id,
        payload_json=prep,
    )
    return {"audit_id": audit_id, "meeting_prep": prep}


def simulate_action(*, env_id: str, business_id: UUID, opportunity_id: UUID, action: str) -> dict:
    detail = get_execution_detail(env_id=env_id, business_id=business_id, opportunity_id=opportunity_id)
    normalized = action.lower().strip()
    expected = "moderate"
    reasoning = "This action keeps the deal moving."
    if "follow-up" in normalized or "follow up" in normalized:
        expected = "high"
        reasoning = "A rotated follow-up is the fastest way to break silence without waiting for the deal to age further."
    elif "move" in normalized or "engaged" in normalized:
        expected = "medium"
        reasoning = "Stage movement helps the board reflect reality, but only if the underlying engagement signal is real."
    elif "demo" in normalized:
        expected = "high"
        reasoning = "A demo or diagnostic call creates real momentum and exposes objections faster."
    audit_id = _audit_event(
        env_id=env_id,
        business_id=business_id,
        event_type="deal_simulation_generated",
        crm_opportunity_id=opportunity_id,
        payload_json={"action": action, "expected_outcome": expected, "reasoning": reasoning},
    )
    return {
        "audit_id": audit_id,
        "action": action,
        "expected_outcome": expected,
        "reasoning": reasoning,
        "deal_name": detail["card"]["name"],
    }


def _resolve_deal(*, env_id: str, business_id: UUID, text: str) -> dict:
    rows = [_row_to_card(row) for row in _load_rows(env_id=env_id, business_id=business_id)]
    needle = text.lower().strip()
    matches = [row for row in rows if needle in (row.get("account_name") or "").lower() or needle in (row.get("name") or "").lower()]
    if not matches:
        raise LookupError(f"No deal matched '{text}'")
    if len(matches) > 1:
        raise ValueError(f"Multiple deals matched '{text}'")
    return matches[0]


def _map_column_to_stage(column: str) -> str:
    normalized = column.strip().lower().replace(" ", "_")
    mapping = {
        "target_identified": "identified",
        "outreach_drafted": "identified",
        "outreach_sent": "contacted",
        "engaged": "engaged",
        "discovery_scheduled": "meeting",
        "demo_completed": "qualified",
        "proposal_sent": "proposal",
        "negotiation": "proposal",
        "closed_won": "closed_won",
        "closed_lost": "closed_lost",
    }
    if normalized not in mapping:
        raise ValueError(f"Unsupported column '{column}'")
    return mapping[normalized]


def run_command(*, env_id: str, business_id: UUID, command: str, confirm: bool = False) -> dict:
    for action_key, pattern in COMMAND_PATTERNS:
        match = pattern.match(command.strip())
        if not match:
            continue
        data = match.groupdict()
        if action_key == "today":
            result = get_daily_execution_brief(env_id=env_id, business_id=business_id)
            audit_id = _audit_event(env_id=env_id, business_id=business_id, event_type="command_today", command_text=command, payload_json=result)
            return {"intent": "today", "requires_confirmation": False, "audit_id": audit_id, "result": result}
        if action_key == "stuck":
            result = list_stuck_deals(env_id=env_id, business_id=business_id)
            audit_id = _audit_event(env_id=env_id, business_id=business_id, event_type="command_stuck", command_text=command, payload_json={"count": len(result)})
            return {"intent": "stuck", "requires_confirmation": False, "audit_id": audit_id, "result": result}
        if action_key == "draft_top_leads":
            board = get_execution_board(env_id=env_id, business_id=business_id)
            count = int(data["count"])
            deals = board["today_queue"][:count]
            payload = [{"crm_opportunity_id": deal["crm_opportunity_id"], "account_name": deal["account_name"]} for deal in deals]
            audit_id = _audit_event(env_id=env_id, business_id=business_id, event_type="command_draft_top_leads", command_text=command, payload_json={"targets": payload})
            return {"intent": "draft_top_leads", "requires_confirmation": False, "audit_id": audit_id, "result": payload}
        if action_key == "move":
            deal = _resolve_deal(env_id=env_id, business_id=business_id, text=data["deal"])
            target_stage = _map_column_to_stage(data["column"])
            if not confirm:
                audit_id = _audit_event(
                    env_id=env_id,
                    business_id=business_id,
                    crm_opportunity_id=UUID(str(deal["crm_opportunity_id"])),
                    crm_account_id=UUID(str(deal["crm_account_id"])) if deal.get("crm_account_id") else None,
                    event_type="command_move_pending",
                    command_text=command,
                    requires_confirmation=True,
                    status="pending_confirmation",
                    payload_json={"target_stage": target_stage, "target_column": data["column"]},
                )
                return {
                    "intent": "move",
                    "requires_confirmation": True,
                    "audit_id": audit_id,
                    "result": {
                        "deal": deal["account_name"] or deal["name"],
                        "target_stage": target_stage,
                        "target_column": data["column"],
                    },
                }
            result = cro_pipeline.advance_opportunity_stage(
                business_id=business_id,
                opportunity_id=UUID(str(deal["crm_opportunity_id"])),
                to_stage_key=target_stage,
                note=f"Operator command: {command}",
            )
            audit_id = _audit_event(
                env_id=env_id,
                business_id=business_id,
                crm_opportunity_id=UUID(str(deal["crm_opportunity_id"])),
                crm_account_id=UUID(str(deal["crm_account_id"])) if deal.get("crm_account_id") else None,
                event_type="command_move_applied",
                command_text=command,
                requires_confirmation=True,
                status="completed",
                payload_json={"target_stage": target_stage},
            )
            return {"intent": "move", "requires_confirmation": False, "audit_id": audit_id, "result": result}
        if action_key == "draft_for_deal":
            deal = _resolve_deal(env_id=env_id, business_id=business_id, text=data["deal"])
            result = draft_outreach(env_id=env_id, business_id=business_id, opportunity_id=UUID(str(deal["crm_opportunity_id"])))
            return {"intent": "draft_for_deal", "requires_confirmation": False, "audit_id": result["audit_id"], "result": result["draft_stack"]}
        if action_key == "follow_up":
            deal = _resolve_deal(env_id=env_id, business_id=business_id, text=data["deal"])
            result = generate_followups(env_id=env_id, business_id=business_id, opportunity_id=UUID(str(deal["crm_opportunity_id"])))
            return {"intent": "follow_up", "requires_confirmation": False, "audit_id": result["audit_id"], "result": result["followups"]}
        if action_key == "prep":
            deal = _resolve_deal(env_id=env_id, business_id=business_id, text=data["company"])
            result = meeting_prep(env_id=env_id, business_id=business_id, opportunity_id=UUID(str(deal["crm_opportunity_id"])))
            return {"intent": "prep", "requires_confirmation": False, "audit_id": result["audit_id"], "result": result["meeting_prep"]}
        if action_key == "simulate":
            deal = _resolve_deal(env_id=env_id, business_id=business_id, text=data["deal"])
            result = simulate_action(env_id=env_id, business_id=business_id, opportunity_id=UUID(str(deal["crm_opportunity_id"])), action=data["action"])
            return {"intent": "simulate", "requires_confirmation": False, "audit_id": result["audit_id"], "result": result}
    return {
        "intent": "unsupported",
        "requires_confirmation": False,
        "audit_id": _audit_event(env_id=env_id, business_id=business_id, event_type="command_unsupported", command_text=command, payload_json={"supported": COMMAND_HELP}),
        "result": {"supported_commands": COMMAND_HELP},
    }
