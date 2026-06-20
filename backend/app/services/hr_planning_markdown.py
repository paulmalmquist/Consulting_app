"""History Rhymes research → planning bridge: planning-agent markdown generator.

Deterministically renders a single enhancement candidate into a planning-agent-
ready plan with a fixed 16-heading structure. Pure (no DB, no LLM).

Contract:
  - Emit exactly the 16 headings, in order, every time.
  - Fill only from candidate + brief context. Unknown fields render the
    placeholder `_Not specified in source brief._` — never invented (guardrail:
    the parser/generator must never fabricate missing data).

Usage:
    from app.services.hr_planning_markdown import build_planning_markdown
    md = build_planning_markdown(candidate_dict, brief_ctx_dict)
"""

from __future__ import annotations

from typing import Any

PLANNING_HEADINGS: list[str] = [
    "Objective",
    "Context",
    "Current State",
    "Desired State",
    "Constraints",
    "Deliverables",
    "Backend Changes",
    "Frontend Changes",
    "DB Changes",
    "AI Runtime Changes",
    "Eval Requirements",
    "Rollback Plan",
    "Acceptance Criteria",
    "Telemetry",
    "Risks",
    "Future Extensions",
]

_PLACEHOLDER = "_Not specified in source brief._"


def _val(value: Any) -> str:
    if value is None:
        return _PLACEHOLDER
    if isinstance(value, (list, tuple)):
        items = [str(v).strip() for v in value if str(v).strip()]
        if not items:
            return _PLACEHOLDER
        return "\n".join(f"- {i}" for i in items)
    text = str(value).strip()
    return text or _PLACEHOLDER


def build_planning_markdown(
    candidate: dict[str, Any],
    brief_ctx: dict[str, Any] | None = None,
) -> str:
    """Render one candidate into a planning-agent-ready markdown plan.

    `candidate` keys: title, category, what, why, effort_days, expected_impact,
    dependencies, priority, confidence, adversarial_verdict.
    `brief_ctx` keys (optional): brief_date, week_type, pillar_name, title,
    source_filename, regime_call.
    """
    brief_ctx = brief_ctx or {}
    title = str(candidate.get("title") or "Untitled enhancement").strip()
    what = candidate.get("what")
    why = candidate.get("why")
    category = candidate.get("category")
    effort = candidate.get("effort_days")
    impact = candidate.get("expected_impact")
    dependencies = candidate.get("dependencies") or []
    priority = candidate.get("priority") or "medium"
    confidence = candidate.get("confidence")
    verdict = candidate.get("adversarial_verdict")

    pillar = brief_ctx.get("pillar_name")
    week_type = brief_ctx.get("week_type")
    brief_date = brief_ctx.get("brief_date")
    brief_title = brief_ctx.get("title")
    source_filename = brief_ctx.get("source_filename")
    regime_call = brief_ctx.get("regime_call")

    context_lines = [
        "Source: History Rhymes weekly research brief"
        + (f" — {brief_title}" if brief_title else "")
        + (f" ({brief_date})" if brief_date else ""),
        f"Pillar: {_inline(pillar)}",
        f"Week: {_inline(week_type)}",
        f"Regime call at brief time: {_inline(regime_call)}",
        f"Source file: {_inline(source_filename)}",
    ]

    sections: dict[str, str] = {
        "Objective": _val(what) if what else f"Implement: {title}.",
        "Context": "\n".join(context_lines)
        + (f"\n\nWhy this matters: {why}" if why else ""),
        "Current State": _PLACEHOLDER,
        "Desired State": _val(what),
        "Constraints": (
            f"Priority: {priority}.\n"
            f"Adversarial stress-test verdict: {_inline(verdict)}.\n"
            "Respect existing repo conventions; deterministic and fail-closed; "
            "no scope expansion beyond this candidate."
        ),
        "Deliverables": (
            f"- {title}"
            + (f"\n- Category: {category}" if category else "")
            + (
                f"\n- Estimated effort: {_fmt_effort(effort)}"
                if effort is not None
                else ""
            )
        ),
        "Backend Changes": _PLACEHOLDER,
        "Frontend Changes": _PLACEHOLDER,
        "DB Changes": _PLACEHOLDER,
        "AI Runtime Changes": _PLACEHOLDER,
        "Eval Requirements": (
            "Add deterministic tests proving the change works and fails closed. "
            "No fabricated metrics; report real pass/fail."
        ),
        "Rollback Plan": (
            "Change is additive and scoped to this candidate; revert the commit "
            "to roll back. No data migration backfill implied by this plan."
        ),
        "Acceptance Criteria": _acceptance(title, what, impact),
        "Telemetry": _val(impact) if impact else _PLACEHOLDER,
        "Risks": (
            f"Adversarial verdict: {_inline(verdict)}. "
            "Parser/LLM must never fabricate; verify source brief before acting."
        ),
        "Future Extensions": _PLACEHOLDER,
    }

    out: list[str] = [f"# Planning Plan — {title}", ""]
    if confidence is not None:
        out.append(f"_Extraction confidence: {confidence}_")
        out.append("")
    if dependencies:
        out.append("**Dependencies:** " + ", ".join(str(d) for d in dependencies))
        out.append("")

    for heading in PLANNING_HEADINGS:
        out.append(f"# {heading}")
        out.append(sections.get(heading, _PLACEHOLDER).strip() or _PLACEHOLDER)
        out.append("")

    return "\n".join(out).rstrip() + "\n"


def _inline(value: Any) -> str:
    if value is None or str(value).strip() == "":
        return "not specified"
    return str(value).strip()


def _fmt_effort(effort: Any) -> str:
    try:
        f = float(effort)
    except (TypeError, ValueError):
        return _inline(effort)
    return f"{int(f)} day(s)" if f.is_integer() else f"{f} day(s)"


def _acceptance(title: str, what: Any, impact: Any) -> str:
    lines = [f"- {title} is implemented and verifiable."]
    if what:
        lines.append(f"- Behavior matches: {str(what).strip()}")
    if impact:
        lines.append(f"- Expected impact realized/measurable: {str(impact).strip()}")
    lines.append("- Tests pass; no fabricated results; degraded paths fail closed.")
    return "\n".join(lines)
