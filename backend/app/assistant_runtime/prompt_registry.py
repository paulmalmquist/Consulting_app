from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services.context_compiler import CompiledContext


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


def build_system_base(*, compiled: "CompiledContext") -> str:
    """Construct the always-on system base string for a compiled context.

    Combines the stable system prompt file with the Meridian structured
    guardrail when the scope touches Meridian. Skill instructions are NOT
    concatenated here — they are first-class compiler items that enter the
    merged dynamic block via ``compose_from_compiled``.
    """
    validate_prompt_registry()
    base = load_prompt(SYSTEM_PROMPT_FILE)
    scope_label = compiled.plan.scope.short_label if compiled and compiled.plan else ""
    if scope_label and "Meridian Capital Management" in scope_label:
        base = f"{base}\n\n## Meridian Guardrail\n{_MERIDIAN_STRUCTURED_GUARDRAIL}"
    return base


def compose_runtime_messages(
    *,
    compiled: "CompiledContext",
    system_role: str,
) -> tuple[list[dict[str, Any]], Any, Any]:
    """Compose the OpenAI messages list from a compiled context.

    Returns ``(messages, prompt_audit, prompt_sections)``. The audit is
    derived from the compiled context's item token counts. The sections
    sidecar carries the raw text of every included item for receipt capture.
    """
    from app.services.prompt_composer import compose_from_compiled, PromptAudit

    system_base = build_system_base(compiled=compiled)

    messages, sections = compose_from_compiled(
        compiled,
        system_base=system_base,
        system_role=system_role,
    )

    # Derive a PromptAudit from the compiled items so downstream loggers that
    # expect the legacy shape keep working. Token counts come from the
    # compiler (tiktoken, authoritative) rather than the legacy char/4 hack.
    audit = PromptAudit(lane=compiled.lane)
    audit.system_tokens = _approx_tokens(system_base)
    audit.context_tokens = (
        compiled.item_tokens("scope_entity")
        + compiled.item_tokens("scope_page")
        + compiled.item_tokens("scope_environment")
        + compiled.item_tokens("scope_filters")
        + compiled.item_tokens("scope_visible_records")
    )
    audit.rag_tokens = compiled.item_tokens("rag")
    audit.history_tokens = compiled.item_tokens("history")
    audit.user_tokens = compiled.item_tokens("current_user")
    audit.domain_block_tokens = compiled.item_tokens("domain_blocks")
    audit.session_context_tokens = compiled.item_tokens("thread_summary")
    audit.total_tokens = (
        audit.system_tokens
        + audit.context_tokens
        + audit.rag_tokens
        + audit.history_tokens
        + audit.user_tokens
        + audit.domain_block_tokens
        + audit.session_context_tokens
    )
    for entry in compiled.enforcement_trace:
        key = entry.get("key")
        if key and key != "_hard_overflow":
            audit.sections_truncated.append(str(key))
    if compiled.skill_trimmed:
        audit.sections_truncated.append("skill_instructions:trim_to_cap")

    return messages, audit, sections


def _approx_tokens(text: str) -> int:
    """Fallback approximation when tiktoken isn't available in this code path."""
    return max(0, (len(text or "")) // 4)
