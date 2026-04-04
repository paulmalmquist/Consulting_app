from __future__ import annotations

from dataclasses import dataclass

from app.assistant_runtime.skill_registry import SKILLS, SKILL_BY_ID
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


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def route_skill(*, message: str, lane: Lane, route: RouteDecision, context: ContextReceipt) -> RoutedSkill:
    text = _normalize(message)
    best_skill: SkillDefinition | None = None
    best_matches: list[str] = []
    best_score = -1

    for skill in SKILLS:
        matches = [trigger for trigger in skill.triggers if trigger in text]
        score = len(matches) * 10
        if route.is_write and "write" in skill.capability_tags:
            score += 5
        if lane in (Lane.C_ANALYSIS, Lane.D_DEEP) and "analysis" in skill.capability_tags:
            score += 2
        if lane in (Lane.A_FAST, Lane.B_LOOKUP) and "lookup" in skill.capability_tags:
            score += 2
        if score > best_score and matches:
            best_skill = skill
            best_matches = matches
            best_score = score

    if best_skill is None:
        if route.is_write:
            best_skill = SKILL_BY_ID["create_entity"]
            best_score = 6
        elif lane in (Lane.C_ANALYSIS, Lane.D_DEEP):
            best_skill = SKILL_BY_ID["run_analysis"]
            best_score = 5
        elif context.resolution_status == "resolved":
            best_skill = SKILL_BY_ID["lookup_entity"]
            best_score = 4

    if best_skill is None:
        return RoutedSkill(
            definition=None,
            selection=SkillSelection(skill_id=None, confidence=0.0, triggers_matched=[]),
        )

    confidence = min(1.0, 0.45 + (0.1 * len(best_matches)) + (0.05 if route.is_write else 0.0))
    if not best_matches:
        confidence = max(confidence, 0.55)
    return RoutedSkill(
        definition=best_skill,
        selection=SkillSelection(
            skill_id=best_skill.id,
            confidence=round(confidence, 2),
            triggers_matched=best_matches,
        ),
    )

