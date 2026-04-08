from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.assistant_runtime.turn_receipts import SkillSelection
from app.services.prompt_composer import compose_prompt

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
SYSTEM_PROMPT_FILE = PROMPTS_DIR / "system_base.txt"
_MERIDIAN_STRUCTURED_GUARDRAIL = """CRITICAL ENFORCEMENT ADDITIONS:

1. Transformation precedence is absolute — cannot be overridden.
2. Query execution must be attempted before any fallback.
3. All metrics must resolve to a single canonical source.
4. All parsed operators (filter, group, sort) must be executed.
5. No silent fallbacks — all degradation must be explicit.
6. Tests fail if parsed intent ≠ executed behavior."""
SKILL_PROMPT_FILES: dict[str, Path] = {
    "explain_metric": PROMPTS_DIR / "skill_explain_metric.txt",
    "run_analysis": PROMPTS_DIR / "skill_analysis.txt",
    "lookup_entity": PROMPTS_DIR / "skill_lookup_entity.txt",
    "generate_lp_summary": PROMPTS_DIR / "skill_generate_lp_summary.txt",
    "create_entity": PROMPTS_DIR / "skill_create_entity.txt",
}


@lru_cache(maxsize=32)
def load_prompt(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()


def validate_prompt_registry() -> None:
    required = [SYSTEM_PROMPT_FILE, *SKILL_PROMPT_FILES.values()]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise ValueError(f"Missing assistant runtime prompt files: {missing}")


def compose_runtime_messages(
    *,
    lane: str,
    context_block: str,
    rag_context: str,
    history: list[dict[str, str]],
    user_message: str,
    skill: SkillSelection,
    system_role: str,
) -> tuple[list[dict[str, str]], object]:
    validate_prompt_registry()
    system_base = load_prompt(SYSTEM_PROMPT_FILE)
    if skill.skill_id and skill.skill_id in SKILL_PROMPT_FILES:
        skill_prompt = load_prompt(SKILL_PROMPT_FILES[skill.skill_id])
        system_base = f"{system_base}\n\n## Skill\n{skill_prompt}"
    if "Meridian Capital Management" in context_block:
        system_base = f"{system_base}\n\n## Meridian Guardrail\n{_MERIDIAN_STRUCTURED_GUARDRAIL}"
    return compose_prompt(
        system_base=system_base,
        lane=lane,
        context_block=context_block,
        rag_context=rag_context,
        history=history,
        user_message=user_message,
        system_role=system_role,
    )
