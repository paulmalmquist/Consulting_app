from __future__ import annotations

from dataclasses import dataclass

from app.assistant_runtime.skill_registry import SKILL_BY_ID
from app.assistant_runtime.turn_receipts import (
    ContextReceipt,
    Lane,
    SkillDefinition,
    SkillSelection,
)
from app.services.request_router import RouteDecision


@dataclass(frozen=True)
class RoutedSkill:
    definition: SkillDefinition | None
    selection: SkillSelection


def build_routed_skill(*, message: str, skill_id: str | None, confidence: float) -> RoutedSkill:
    """Hydrate a RoutedSkill from a known skill_id. No matching logic —
    the model classifier or deterministic guardrail already decided."""
    skill = SKILL_BY_ID.get(skill_id) if skill_id else None
    return RoutedSkill(
        definition=skill,
        selection=SkillSelection(
            skill_id=skill_id if skill else None,
            confidence=round(max(0.0, min(1.0, confidence)), 2),
            triggers_matched=[],
        ),
    )


def route_skill(*, message: str, lane: Lane, route: RouteDecision, context: ContextReceipt) -> RoutedSkill:
    """Last-resort fallback when the model dispatcher fails entirely.

    Returns a safe default skill with low confidence so downstream knows
    this is a weak signal. Model dispatch should have fired before this.
    """
    if route.is_write:
        skill_id = "create_entity"
    else:
        skill_id = "lookup_entity"

    return RoutedSkill(
        definition=SKILL_BY_ID[skill_id],
        selection=SkillSelection(
            skill_id=skill_id,
            confidence=0.40,
            triggers_matched=[],
        ),
    )
