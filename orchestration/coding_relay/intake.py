"""Plan intake: source a plan, require success criteria, normalize them.

The relay refuses to run without explicit success criteria. Criteria are
normalized into six fixed sections so the reviewer can judge each one by a
stable id:

    General (G) — bullets that fit no section
    Screen (S) / API (A) / DB-Data (D) / AI behavior (B) /
    Evals-tests (T) / Regression guard (R)

Sections with no criteria render "Not applicable."
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

ACTIVE_PLANS_REL = Path("docs/plans/03-implementation-plans/active")

CRITERIA_HEADING_RE = re.compile(
    r"^#{1,6}\s+.*((success|acceptance)\s+criteria|definition\s+of\s+done)",
    re.IGNORECASE,
)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)")
BULLET_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.*)")

# Canonical section order with (id-prefix, keyword list). Scored per bullet;
# highest hit count wins, ties resolved by this order.
SECTIONS: list[tuple[str, str, tuple[str, ...]]] = [
    (
        "Regression guard",
        "R",
        ("regression", "must not break", "unchanged", "still work", "still pass",
         "existing behavior", "no change to", "not regress"),
    ),
    (
        "Evals-tests",
        "T",
        ("test", "tests", "pytest", "vitest", "eval", "evals", "lint",
         "typecheck", "ci", "coverage", "assert"),
    ),
    (
        "DB-Data",
        "D",
        ("db", "database", "table", "migration", "schema", "row", "column",
         "seed", "sql", "supabase", "data model", "dataset"),
    ),
    (
        "API",
        "A",
        ("api", "endpoint", "route", "http", "status code", "response",
         "request", "payload", "rest", "fastapi"),
    ),
    (
        "AI behavior",
        "B",
        ("ai", "prompt", "model", "llm", "assistant", "rag",
         "tool call", "agent", "fail-closed", "fail closed", "hallucinat"),
    ),
    (
        "Screen",
        "S",
        ("screen", "ui", "page", "component", "render", "display", "button",
         "css", "style", "visual", "frontend", "layout", "browser"),
    ),
]
SECTION_NAMES = tuple(name for name, _, _ in SECTIONS)
# Aliases for explicit "### <section>" sub-headings inside a criteria block.
SECTION_ALIASES = {
    "screen": "Screen",
    "ui": "Screen",
    "api": "API",
    "db/data": "DB-Data",
    "db-data": "DB-Data",
    "db": "DB-Data",
    "data": "DB-Data",
    "ai behavior": "AI behavior",
    "ai": "AI behavior",
    "evals/tests": "Evals-tests",
    "evals-tests": "Evals-tests",
    "tests": "Evals-tests",
    "evals": "Evals-tests",
    "regression guard": "Regression guard",
    "regression": "Regression guard",
    "general": "General",
}

TEMPLATE = """## Acceptance Criteria

### Screen
- ...

### API
- ...

### DB/Data
- ...

### AI behavior
- ...

### Evals/tests
- ...

### Regression guard
- ...

Write "Not applicable" under any section that does not apply. The relay
refuses to run a plan without a "Success Criteria" / "Acceptance Criteria" /
"Definition of Done" heading followed by concrete bullets.
"""


class IntakeError(Exception):
    """Plan cannot be accepted. Message is user-facing; exit code 2."""


@dataclass
class AcceptanceCriteria:
    # section name -> list of criterion texts ([] means Not applicable)
    sections: dict[str, list[str]]
    general: list[str]
    raw_block: str

    def checklist(self) -> list[tuple[str, str, str]]:
        """Stable (id, section, text) triples, e.g. ("S1", "Screen", ...)."""
        items: list[tuple[str, str, str]] = []
        for i, text in enumerate(self.general, 1):
            items.append((f"G{i}", "General", text))
        for name, prefix, _ in SECTIONS:
            for i, text in enumerate(self.sections.get(name, []), 1):
                items.append((f"{prefix}{i}", name, text))
        return items

    def to_markdown(self) -> str:
        lines = ["## Acceptance Criteria", ""]
        if self.general:
            lines.append("### General")
            lines += [f"- [{cid}] {text}" for cid, sec, text in self.checklist() if sec == "General"]
            lines.append("")
        # Render in the canonical order the template uses.
        display_order = ["Screen", "API", "DB-Data", "AI behavior", "Evals-tests", "Regression guard"]
        by_section = {name: [] for name in display_order}
        for cid, sec, text in self.checklist():
            if sec in by_section:
                by_section[sec].append(f"- [{cid}] {text}")
        for name in display_order:
            lines.append(f"### {name}")
            lines += by_section[name] or ["Not applicable."]
            lines.append("")
        return "\n".join(lines)


@dataclass
class IntakeResult:
    plan_path: Path | None
    plan_text: str
    title: str
    slug: str
    criteria: AcceptanceCriteria = field(repr=False, default=None)  # type: ignore[assignment]


def list_active_plans(repo_root: Path) -> list[Path]:
    active = repo_root / ACTIVE_PLANS_REL
    if not active.is_dir():
        return []
    return sorted(p for p in active.glob("*.md") if p.is_file())


def resolve_plan_path(repo_root: Path, plan_arg: str) -> Path:
    """Resolve --plan as a path, or as a filename prefix in the active dir."""
    direct = Path(plan_arg)
    for candidate in (direct, repo_root / plan_arg):
        if candidate.is_file():
            return candidate.resolve()
    matches = [p for p in list_active_plans(repo_root) if p.name.startswith(plan_arg)]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        names = ", ".join(p.name for p in matches)
        raise IntakeError(f"--plan {plan_arg!r} is ambiguous in the active plans dir: {names}")
    raise IntakeError(
        f"--plan {plan_arg!r} is neither a file nor a unique prefix in "
        f"{ACTIVE_PLANS_REL}. Run with no arguments to list active plans."
    )


def extract_title(plan_text: str, fallback: str) -> str:
    for line in plan_text.splitlines():
        m = HEADING_RE.match(line.strip())
        if m:
            return m.group(2).strip()
        if line.strip():
            return line.strip()[:80]
    return fallback


def extract_criteria(plan_text: str) -> str | None:
    """Return the raw criteria block (heading through end of its section)."""
    lines = plan_text.splitlines()
    start: int | None = None
    level = 0
    for i, line in enumerate(lines):
        m = CRITERIA_HEADING_RE.match(line.strip())
        if m:
            start = i
            level = len(HEADING_RE.match(line.strip()).group(1))  # type: ignore[union-attr]
            break
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        m = HEADING_RE.match(lines[j].strip())
        if m and len(m.group(1)) <= level:
            end = j
            break
    return "\n".join(lines[start:end]).strip()


def _kw_hit(kw: str, text: str) -> bool:
    """Multi-word keywords match as phrases. Short tokens need full word
    boundaries so 'ci' never fires inside 'decision' or 'db' inside
    'feedback'; longer tokens allow a suffix ('migration' matches
    'migrations', 'hallucinat' matches 'hallucination')."""
    if " " in kw or "-" in kw:
        return kw in text
    if len(kw) <= 4:
        return re.search(rf"\b{re.escape(kw)}\b", text) is not None
    return re.search(rf"\b{re.escape(kw)}", text) is not None


def _classify(bullet: str) -> str:
    text = bullet.lower()
    best_name = "General"
    best_score = 0
    for name, _, keywords in SECTIONS:
        score = sum(1 for kw in keywords if _kw_hit(kw, text))
        if score > best_score:
            best_name, best_score = name, score
    return best_name


def normalize_criteria(raw_block: str) -> AcceptanceCriteria:
    """Turn a raw criteria block into the fixed six-section shape.

    If the block already uses explicit sub-headings that match the section
    names (or aliases), bullets are assigned by heading. Otherwise each
    bullet is keyword-scored into a section; no hits -> General.
    """
    sections: dict[str, list[str]] = {name: [] for name in SECTION_NAMES}
    general: list[str] = []
    current_explicit: str | None = None
    saw_bullet = False
    for line in raw_block.splitlines():
        m = HEADING_RE.match(line.strip())
        if m:
            alias = re.sub(r"[^a-z/ -]", "", m.group(2).strip().lower()).strip()
            current_explicit = SECTION_ALIASES.get(alias)
            continue
        b = BULLET_RE.match(line)
        if not b:
            continue
        text = b.group(1).strip()
        if not text or text.lower().rstrip(".") in ("not applicable", "n/a", "..."):
            continue
        saw_bullet = True
        target = current_explicit or _classify(text)
        if target == "General":
            general.append(text)
        else:
            sections[target].append(text)
    if not saw_bullet:
        raise IntakeError(
            "The success-criteria section contains no concrete bullets.\n"
            "Add at least one measurable criterion, for example:\n\n" + TEMPLATE
        )
    return AcceptanceCriteria(sections=sections, general=general, raw_block=raw_block)


def load_plan(
    repo_root: Path,
    plan_arg: str | None,
    paste_file: str | None,
) -> IntakeResult:
    """Load and validate the plan from --plan or --paste-file."""
    from orchestration.coding_relay.runs import safe_slug

    if plan_arg and paste_file:
        raise IntakeError("Pass either --plan or --paste-file, not both.")
    if paste_file:
        p = Path(paste_file)
        if not p.is_file():
            raise IntakeError(f"--paste-file {paste_file} does not exist.")
        plan_path: Path | None = p.resolve()
        plan_text = p.read_text(encoding="utf-8", errors="replace")
        fallback = p.stem
    elif plan_arg:
        plan_path = resolve_plan_path(repo_root, plan_arg)
        plan_text = plan_path.read_text(encoding="utf-8", errors="replace")
        fallback = plan_path.stem
    else:
        raise IntakeError("No plan given. Pass --plan <path|NNNN> or --paste-file <path>.")

    if not plan_text.strip():
        raise IntakeError(f"Plan file {plan_path} is empty.")

    raw_block = extract_criteria(plan_text)
    if raw_block is None:
        raise IntakeError(
            "The plan has no success criteria. The relay refuses vague work.\n"
            "Add a section with one of these headings: 'Success Criteria',\n"
            "'Acceptance Criteria', or 'Definition of Done', shaped like:\n\n"
            + TEMPLATE
        )
    criteria = normalize_criteria(raw_block)
    title = extract_title(plan_text, fallback)
    result = IntakeResult(
        plan_path=plan_path,
        plan_text=plan_text,
        title=title,
        slug=safe_slug(title),
    )
    result.criteria = criteria
    return result
