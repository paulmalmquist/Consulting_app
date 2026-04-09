"""Content generation helpers for the consulting pipeline operator layer.

This module stays intentionally separate from the execution engine so the
ranking / pressure logic does not get entangled with content templates.
"""
from __future__ import annotations

from typing import Any


ANGLE_LIBRARY = [
    ("economic", "cost savings", "direct", "Would it be useful to cut reporting drag this quarter?"),
    ("speed", "speed", "urgent", "Would a faster path from intake to decision be worth a look?"),
    ("risk", "risk reduction", "credible", "Worth comparing how you are handling control risk today?"),
    ("visibility", "operating visibility", "operator", "Open to a tighter reporting and visibility workflow?"),
    ("leverage", "team leverage", "concise", "Should we show how your team can do more without adding headcount?"),
]


def _normalize_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def _pick_angles(last_angle: str | None, count: int) -> list[tuple[str, str, str, str]]:
    remaining = [item for item in ANGLE_LIBRARY if item[0] != last_angle]
    if len(remaining) < count:
        remaining = ANGLE_LIBRARY[:]
    return remaining[:count]


def _persona_label(profile: dict, deal: dict) -> str:
    personas = profile.get("personas") or []
    if personas:
        return str(personas[0])
    contact_name = deal.get("contact_name")
    if contact_name:
        return contact_name
    return "the team"


def build_initial_outreach(*, deal: dict, profile: dict) -> dict:
    angle_key, framing, tone, cta = _pick_angles(
        ((profile.get("narrative_memory") or {}).get("last_outbound_angle")),
        1,
    )[0]
    company = _normalize_text(deal.get("account_name"), "your team")
    persona = _persona_label(profile, deal)
    pain = _normalize_text(profile.get("pain_hypothesis"), "manual reporting, follow-up, and execution drift")
    value = _normalize_text(profile.get("value_prop"), "an operator layer that turns pipeline work into next-step execution")
    subject = f"{company}: {framing} without extra process"
    body = (
        f"{persona},\n\n"
        f"I think {company} is likely dealing with {pain}. "
        f"Winston is strongest when a team needs {value} without adding more admin.\n\n"
        f"If useful, I can show a short workflow centered on {framing} and the exact next actions it would automate.\n\n"
        f"{cta}"
    )
    return {
        "kind": "initial_outreach",
        "angle_key": angle_key,
        "framing": framing,
        "tone": tone,
        "cta": cta,
        "subject": subject,
        "body": body,
    }


def build_followups(*, deal: dict, profile: dict, count: int = 3) -> list[dict]:
    last_angle = ((profile.get("narrative_memory") or {}).get("last_outbound_angle"))
    company = _normalize_text(deal.get("account_name"), "your team")
    persona = _persona_label(profile, deal)
    objection = _normalize_text(
        (profile.get("narrative_memory") or {}).get("latest_objection_surfaced"),
        "silence",
    )
    followups = []
    for idx, (angle_key, framing, tone, cta) in enumerate(_pick_angles(last_angle, count), start=1):
        body = (
            f"{persona},\n\n"
            f"Following up with a different angle. This one is about {framing}. "
            f"If the blocker has been {objection}, the useful comparison is how Winston would remove the extra coordination and make the next step explicit.\n\n"
            f"{cta}"
        )
        followups.append({
            "kind": f"follow_up_{idx}",
            "angle_key": angle_key,
            "framing": framing,
            "tone": tone,
            "cta": cta,
            "subject": f"{company}: a different angle on {framing}",
            "body": body,
        })
    return followups


def build_meeting_prep(*, deal: dict, profile: dict) -> dict:
    company = _normalize_text(deal.get("account_name"), "this company")
    industry = _normalize_text(deal.get("industry"), "operations-heavy services")
    pain = _normalize_text(profile.get("pain_hypothesis"), "workflow fragmentation and weak follow-through")
    demo_angle = _normalize_text(profile.get("demo_angle"), "show the execution board, pressure system, and follow-up rotation")
    objection = _normalize_text(
        (profile.get("narrative_memory") or {}).get("latest_objection_surfaced"),
        "unclear urgency",
    )
    return {
        "company_summary": f"{company} is being worked as a {industry} opportunity with current focus on {pain}.",
        "likely_pain_points": [
            pain,
            "deals stall because next actions are not enforced",
            "follow-ups repeat instead of changing angle",
        ],
        "tailored_demo_path": demo_angle,
        "key_questions": [
            "Where does the handoff from outreach to action usually stall?",
            "What happens today when a follow-up gets ignored twice?",
            "Which workflow is most painful to keep moving manually?",
        ],
        "risks_to_watch": [
            objection,
            "No confirmed champion or owner",
            "Weak urgency despite visible pain",
        ],
    }


def build_playbook(*, deal: dict, profile: dict, execution_column: str) -> dict:
    industry = _normalize_text(deal.get("industry"), "general")
    persona = _persona_label(profile, deal)
    return {
        "outreach": {
            "primary_persona": persona,
            "industry": industry,
            "column": execution_column,
            "angle_order": [item[0] for item in _pick_angles(None, 3)],
        },
        "follow_up": {
            "rotation_axes": [item[0] for item in ANGLE_LIBRARY],
            "avoid_repeating_last_angle": True,
        },
        "demo": {
            "path": _normalize_text(profile.get("demo_angle"), "execution board -> pressure queue -> action drafts"),
        },
        "proposal": {
            "focus": _normalize_text(profile.get("value_prop"), "faster execution, clearer follow-up, and less drift"),
        },
    }


def build_auto_draft_stack(*, deal: dict, profile: dict, execution_column: str) -> dict:
    initial = build_initial_outreach(deal=deal, profile=profile)
    followups = build_followups(deal=deal, profile=profile, count=2)
    prep = build_meeting_prep(deal=deal, profile=profile)
    playbook = build_playbook(deal=deal, profile=profile, execution_column=execution_column)
    return {
        "initial_outreach": initial,
        "followups": followups,
        "meeting_prep": prep,
        "playbook": playbook,
    }
