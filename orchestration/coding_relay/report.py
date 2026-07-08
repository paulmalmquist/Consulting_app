"""Final report and PR body generation.

Both documents are receipts: they state what actually happened, including
skipped tests and unmet criteria. Prose follows docs/anti-ai-style.md; the
strip pass removes em-dashes from any text we assemble from model output.
"""
from __future__ import annotations

from dataclasses import dataclass, field


def strip_style(text: str) -> str:
    """Minimal anti-ai-style pass on assembled prose: no em/en dashes."""
    return text.replace("—", " - ").replace("–", "-")


@dataclass
class RunSummary:
    """Everything the report needs, collected by the loop/__main__."""

    run_id: str
    state: str
    exit_code: int
    title: str
    plan_path: str
    branch: str = ""
    worktree_path: str = ""
    base_ref: str = ""
    base_sha: str = ""
    iterations_run: int = 0
    max_iterations: int = 0
    criteria_checklist: list = field(default_factory=list)  # (id, section, text)
    final_criteria_status: list = field(default_factory=list)  # verdict dicts
    verdict_history: list = field(default_factory=list)  # (iteration, status, summary)
    test_results: list = field(default_factory=list)  # SuiteResult payload dicts
    violations: list = field(default_factory=list)  # Violation dicts
    files_changed: list = field(default_factory=list)  # numstat strings
    risk_notes: list = field(default_factory=list)
    removal_instructions: str = ""
    codex_summary: str = ""
    escalation_flags: list = field(default_factory=list)  # e.g. codex-repo-access


def _criteria_lines(s: RunSummary) -> list:
    status_by_id = {c.get("id"): c for c in s.final_criteria_status}
    lines = []
    for cid, section, text in s.criteria_checklist:
        entry = status_by_id.get(cid)
        # Only "met" earns a check; not_applicable stays visibly distinct
        # via its status text so a reviewer never mistakes it for proven.
        mark = "x" if (entry and entry.get("status") == "met") else " "
        status = entry.get("status") if entry else "not reviewed"
        evidence = (entry.get("evidence", "") if entry else "").strip()
        line = f"- [{mark}] {cid} ({section}): {text} -- {status}"
        if evidence:
            line += f"; evidence: {evidence}"
        lines.append(line)
    return lines or ["- (no criteria recorded)"]


def _test_lines(s: RunSummary) -> list:
    if not s.test_results:
        return ["- No test suites were run (no matching changed paths, or --no-tests)."]
    lines = []
    for t in s.test_results:
        if t.get("skipped"):
            lines.append(f"- {t['name']}: SKIPPED. {t.get('reason', '')}")
        else:
            state = "PASS" if t.get("exit_code") == 0 else f"FAIL (exit {t.get('exit_code')})"
            lines.append(f"- {t['name']}: {state} ({t.get('duration_s', 0)}s), log: {t.get('log', '')}")
    return lines


def final_report(s: RunSummary) -> str:
    lines = [
        f"# Coding Relay run {s.run_id}",
        "",
        f"- Outcome: {s.state} (exit {s.exit_code})",
        f"- Plan: {s.title} ({s.plan_path})",
        f"- Branch: {s.branch or '(none created)'}",
        f"- Worktree: {s.worktree_path or '(none created)'}",
        f"- Base: {s.base_ref} @ {s.base_sha[:12]}",
        f"- Iterations: {s.iterations_run}/{s.max_iterations}",
        "",
        "## Verdict history",
    ]
    for it, status, summary in s.verdict_history:
        lines.append(f"- iteration {it}: {status}. {summary}")
    if not s.verdict_history:
        lines.append("- No reviewer verdicts were produced.")
    lines += ["", "## Acceptance criteria"]
    lines += _criteria_lines(s)
    lines += ["", "## Tests"]
    lines += _test_lines(s)
    if s.violations:
        lines += ["", "## Safety violations"]
        for v in s.violations:
            lines.append(f"- [{v['severity']}] {v['rule']}: {v['detail']}")
            for p in v.get("paths", [])[:10]:
                lines.append(f"    - {p}")
    if s.escalation_flags:
        lines += ["", "## Recorded escalations"]
        lines += [f"- {flag}" for flag in s.escalation_flags]
    lines += ["", "## Files changed (numstat)"]
    lines += [f"- {n}" for n in s.files_changed] or ["- (none)"]
    if s.risk_notes:
        lines += ["", "## Risks and notes"]
        lines += [f"- {n}" for n in s.risk_notes]
    if s.removal_instructions:
        lines += ["", "## Rollback / cleanup", "", s.removal_instructions]
    return strip_style("\n".join(lines) + "\n")


def pr_body(s: RunSummary, tips_note: str = "") -> str:
    lines = [
        "## Plan",
        "",
        f"{s.title} ({s.plan_path})",
        "",
        "## Acceptance criteria",
        "",
    ]
    lines += _criteria_lines(s)
    lines += [
        "",
        "## Implementation summary",
        "",
        s.codex_summary or "(see verdict history in the run folder)",
        "",
        "## Files changed",
        "",
    ]
    lines += [f"- {n}" for n in s.files_changed] or ["- (none)"]
    lines += ["", "## Tests", ""]
    lines += _test_lines(s)
    lines += [
        "",
        "## Evidence",
        "",
        f"- Run folder (local, untracked): .orchestration/runs/{s.run_id}/",
        f"- Iterations run: {s.iterations_run}/{s.max_iterations}",
        "",
        "## Reviewer verdicts",
        "",
    ]
    for it, status, summary in s.verdict_history:
        lines.append(f"- iteration {it}: {status}. {summary}")
    lines += ["", "## Risks and unknowns", ""]
    lines += [f"- {n}" for n in s.risk_notes] or ["- None recorded."]
    if s.escalation_flags:
        lines += [f"- Escalation: {flag}" for flag in s.escalation_flags]
    lines += [
        "",
        "## Follow-ups",
        "",
        "- Review the run folder receipts before merging.",
        "",
        "## tips.md",
        "",
        tips_note or "- No reusable lesson recorded this run.",
        "",
        "## Rollback",
        "",
        "Close this PR and delete the branch; the relay never merges.",
        "",
        "Draft PR opened by the Coding Relay (docs/reference/CODING_RELAY.md).",
    ]
    return strip_style("\n".join(lines) + "\n")
