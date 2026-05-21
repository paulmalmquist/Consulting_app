#!/usr/bin/env python3
"""winston-plan-relay — prompt-bundle assembler with optional CLI adapters.

Takes an idea or existing plan file, reads Winston context, and assembles a
fully-assembled prompt bundle.

- With --dry-run (the default-safe path): writes the bundle + sibling receipt
  and invokes no external process.
- Without --dry-run: hands the bundle to the reviewer CLI implied by
  --target-agent (Claude or Codex), writes the reviewer output to --out, the
  exact prompt to <out>.bundle.md, and an audit receipt to <out>.receipt.md.

Run with --help for full argument list. See SKILL.md and examples/.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Adapters live in scripts/adapters/. Importing as a sibling package works
# whether relay.py is run directly or imported.
try:
    from adapters import AdapterResult, AdapterUnavailable
    from adapters import claude_cli, codex_cli
except ImportError:  # run from outside scripts/ — add it to sys.path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from adapters import AdapterResult, AdapterUnavailable
    from adapters import claude_cli, codex_cli


MODES = ("plan-review", "route-and-plan", "handoff-only", "two-agent-loop")
TARGET_AGENTS = ("claude-code", "codex", "human")
VALID_REVIEWERS = {"claude", "codex"}

REQUIRED_CONTEXT_FILES = [
    "WINSTON_CODING_SESSION_INSTRUCTIONS.md",
    "CLAUDE.md",
    "docs/plans/PLAN_MAINTENANCE_RULES.md",
]
OPTIONAL_CONTEXT_FILES = [
    "docs/plans/00-dispatch/routing-map.md",
]
TEMPLATES_DIR_REL = "docs/plans/_templates"
ACTIVE_PLANS_DIR_REL = "docs/plans/03-implementation-plans/active"
PROMPTS_DIR_NAME = "prompts"
MODE_PROMPT_FILE = {
    "plan-review": "plan_review.md",
    "route-and-plan": "route_and_plan.md",
    "handoff-only": "implementation_handoff.md",
    "two-agent-loop": "adversarial_review.md",
}


@dataclass
class ContextFile:
    rel_path: str
    abs_path: Path
    found: bool
    size_bytes: int = 0

    @property
    def size_kb(self) -> str:
        if not self.found:
            return "—"
        return f"{self.size_bytes / 1024:.1f} KB"


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="relay.py",
        description="winston-plan-relay prompt assembler with optional CLI adapters.",
    )
    p.add_argument("--repo-root", required=True, type=Path)
    p.add_argument("--input", dest="input_path", required=True, type=Path)
    p.add_argument("--mode", required=True, choices=MODES)
    p.add_argument("--target-agent", default="claude-code", choices=TARGET_AGENTS)
    p.add_argument("--reviewers", default="", help="Comma list, subset of claude,codex")
    p.add_argument("--out", required=True, type=Path)
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Assemble the bundle + receipt only; invoke no external process "
        "(default-safe path).",
    )
    p.add_argument("--allow-missing-context", action="store_true")
    p.add_argument("--max-input-kb", type=int, default=200)
    p.add_argument("--print-next-command", action="store_true")
    p.add_argument(
        "--adapter-timeout",
        type=int,
        default=600,
        help="Seconds to wait for the reviewer CLI before timing out "
        "(non-dry-run only).",
    )
    return p.parse_args(argv)


# Maps --target-agent to its adapter module. `human` has no adapter — it is
# a dry-run-only target.
ADAPTER_FOR_AGENT = {
    "claude-code": claude_cli,
    "codex": codex_cli,
}


def err(msg: str) -> None:
    sys.stderr.write(f"relay.py: error: {msg}\n")


def validate_repo_root(repo_root: Path, allow_missing: bool) -> bool:
    markers = ["CLAUDE.md", "AGENTS.md", ".git"]
    if any((repo_root / m).exists() for m in markers):
        return True
    if allow_missing:
        sys.stderr.write(
            f"relay.py: warning: --repo-root {repo_root} has no CLAUDE.md/AGENTS.md/.git "
            f"(continuing because --allow-missing-context)\n"
        )
        return True
    err(
        f"--repo-root {repo_root} does not look like a repo root "
        f"(no CLAUDE.md / AGENTS.md / .git). Pass --allow-missing-context to override."
    )
    return False


def gather_context(repo_root: Path) -> tuple[list[ContextFile], list[ContextFile]]:
    required = []
    for rel in REQUIRED_CONTEXT_FILES:
        ap = repo_root / rel
        required.append(
            ContextFile(rel, ap, ap.is_file(), ap.stat().st_size if ap.is_file() else 0)
        )
    optional = []
    for rel in OPTIONAL_CONTEXT_FILES:
        ap = repo_root / rel
        optional.append(
            ContextFile(rel, ap, ap.is_file(), ap.stat().st_size if ap.is_file() else 0)
        )
    return required, optional


def list_templates(repo_root: Path) -> list[str]:
    tdir = repo_root / TEMPLATES_DIR_REL
    if not tdir.is_dir():
        return []
    return sorted(p.name for p in tdir.iterdir() if p.is_file())


def suggest_next_plan_number(repo_root: Path) -> Optional[str]:
    adir = repo_root / ACTIVE_PLANS_DIR_REL
    if not adir.is_dir():
        return None
    highest = 0
    pat = re.compile(r"^(\d{4})-")
    for p in adir.iterdir():
        if not p.is_file():
            continue
        m = pat.match(p.name)
        if m:
            n = int(m.group(1))
            if n > highest:
                highest = n
    return f"{highest + 1:04d}"


def read_text(path: Path, max_bytes: Optional[int] = None) -> str:
    data = path.read_text(encoding="utf-8", errors="replace")
    if max_bytes is not None and len(data.encode("utf-8")) > max_bytes:
        return data  # caller already warned; include in full
    return data


def read_prompt_fragment(skill_dir: Path, name: str) -> str:
    fp = skill_dir / PROMPTS_DIR_NAME / name
    if not fp.is_file():
        return f"<!-- MISSING PROMPT FRAGMENT: {name} at {fp} -->"
    return fp.read_text(encoding="utf-8", errors="replace")


def fence_for(text: str) -> str:
    """Return a backtick fence longer than any backtick run inside `text`.

    The input file may itself contain ```fenced``` blocks. A plain 3-tick
    wrapper would be closed prematurely by the first inner fence. We scan for
    the longest run of backticks at the start of any line and return a fence
    one tick longer (minimum 3).
    """
    longest = 0
    for line in text.splitlines():
        stripped = line.lstrip()
        run = 0
        for ch in stripped:
            if ch == "`":
                run += 1
            else:
                break
        longest = max(longest, run)
    return "`" * max(3, longest + 1)


# Per-mode imperative task line shown at the top of every bundle.
MODE_TASK = {
    "plan-review": (
        "Review the plan in the \"## Input\" section and produce a response with "
        "exactly these sections: **Critique**, **Refined ticket boundaries**, and "
        "**Handoff prompt**. The handoff prompt must be complete and paste-ready — "
        "not a description of what a handoff prompt should contain."
    ),
    "route-and-plan": (
        "Convert the rough idea in the \"## Input\" section into a Winston "
        "implementation plan. Produce exactly these sections: **Routing decision**, "
        "**Drafted plan** (in the NNNN-environment-short-title skeleton), and "
        "**Ticket 1 handoff prompt** (complete and paste-ready)."
    ),
    "handoff-only": (
        "Produce a single complete, paste-ready handoff prompt for the next "
        "ticket of the approved plan in the \"## Input\" section. Use the structure "
        "in the \"## Implementation handoff scaffold\" section. Output only the "
        "handoff prompt — no preamble, no commentary."
    ),
    "two-agent-loop": (
        "Ticket 1 behavior: apply the plan-review pass to the \"## Input\" section "
        "and produce **Critique**, **Refined ticket boundaries**, and a paste-ready "
        "**Handoff prompt**. End with the note: \"Reviewer B / reconciliation "
        "deferred to Ticket 2.\""
    ),
}


def parse_reviewers(raw: str) -> list[str]:
    if not raw.strip():
        return []
    out = []
    for tok in raw.split(","):
        t = tok.strip().lower()
        if not t:
            continue
        if t not in VALID_REVIEWERS:
            sys.stderr.write(
                f"relay.py: warning: ignoring unknown reviewer '{t}' "
                f"(valid: {sorted(VALID_REVIEWERS)})\n"
            )
            continue
        out.append(t)
    return out


def assemble_bundle(
    args: argparse.Namespace,
    skill_dir: Path,
    required_ctx: list[ContextFile],
    optional_ctx: list[ContextFile],
    template_names: list[str],
    suggested_plan_filename: Optional[str],
    input_text: str,
    reviewers: list[str],
) -> str:
    system = read_prompt_fragment(skill_dir, "system.md")
    mode_prompt = read_prompt_fragment(skill_dir, MODE_PROMPT_FILE[args.mode])
    handoff = read_prompt_fragment(skill_dir, "implementation_handoff.md")

    found_ctx_lines = []
    for cf in required_ctx + optional_ctx:
        marker = "✓" if cf.found else "✗"
        found_ctx_lines.append(f"- {marker} `{cf.rel_path}` ({cf.size_kb})")
    if template_names:
        found_ctx_lines.append(
            f"- templates in `{TEMPLATES_DIR_REL}/`: " + ", ".join(template_names)
        )

    fence = fence_for(input_text)

    parts = []
    parts.append(f"# Winston Plan Relay — Assembled Bundle\n")
    parts.append(f"**Mode:** `{args.mode}`")
    parts.append(f"**Target agent:** `{args.target_agent}`")
    parts.append(f"**Reviewers requested:** {', '.join(reviewers) if reviewers else '(none)'}")
    parts.append(f"**Input:** `{args.input_path}`")
    parts.append(f"**Repo root:** `{args.repo_root}`")
    if suggested_plan_filename:
        parts.append(f"**Suggested next active-plan filename:** `{suggested_plan_filename}`")
    parts.append("")
    parts.append("## Your task\n")
    parts.append(MODE_TASK.get(args.mode, f"Process the Input section per the `{args.mode}` mode instructions below."))
    parts.append("")
    parts.append(
        "Follow the **Mode instructions** for the exact procedure and the "
        "**System invariants** for the rules every output must respect. Use the "
        "**Implementation handoff scaffold** when writing the handoff prompt."
    )
    parts.append("")
    parts.append("## Context files read\n")
    parts.append("\n".join(found_ctx_lines))
    parts.append("")
    parts.append("---")
    parts.append("## System invariants\n")
    parts.append(system)
    parts.append("---")
    parts.append(f"## Mode instructions — `{args.mode}`\n")
    parts.append(mode_prompt)
    parts.append("---")
    parts.append("## Input\n")
    parts.append(
        f"_The plan/idea under review, between the {len(fence)}-backtick fences "
        f"below (the content itself contains 3-backtick code blocks)._\n"
    )
    parts.append(f"{fence}markdown")
    parts.append(input_text.rstrip("\n"))
    parts.append(fence)
    parts.append("---")
    parts.append("## Implementation handoff scaffold\n")
    parts.append(handoff)
    return "\n".join(parts) + "\n"


def next_command_for(
    args: argparse.Namespace,
    adapter_result: Optional["AdapterResult"] = None,
    unavailable: Optional["AdapterUnavailable"] = None,
) -> str:
    """The recommended next shell step. Differs for dry-run (paste the bundle
    yourself), an adapter run (reviewer output is already at --out), and a
    CLI-unavailable miss (re-run with --dry-run)."""
    if unavailable is not None:
        return (
            f"# The {unavailable.agent} CLI is not installed.\n"
            f"# Either install it, or re-run with --dry-run to assemble the bundle:\n"
            f"#   python skills/winston-plan-relay/scripts/relay.py ... --dry-run"
        )
    if adapter_result is not None:
        if adapter_result.ok:
            return f"# Reviewer output is ready. Read it:\n#   cat {args.out}"
        return (
            "# The reviewer run FAILED — see the receipt's stderr excerpt.\n"
            f"#   cat {args.out}.receipt.md\n"
            "# Re-run with --dry-run to inspect the assembled bundle without invoking a model."
        )
    if args.mode == "plan-review":
        return (
            "# Hand the bundle to your reviewer. Suggested:\n"
            f"#   cat {args.out}   # then paste into Claude Code / Codex"
        )
    if args.mode == "route-and-plan":
        return (
            "# Review the suggested plan filename in the bundle, then create the plan:\n"
            f"#   code {args.out}\n"
            f"#   # then copy the drafted plan into {ACTIVE_PLANS_DIR_REL}/<NNNN>-<env>-<title>.md"
        )
    if args.mode == "handoff-only":
        return (
            "# Paste the handoff prompt into Claude Code or Codex:\n"
            f"#   cat {args.out}"
        )
    return (
        "# two-agent-loop: run reviews manually, or drop --dry-run to invoke one reviewer CLI.\n"
        f"# For now: cat {args.out}"
    )


def assemble_receipt(
    args: argparse.Namespace,
    required_ctx: list[ContextFile],
    optional_ctx: list[ContextFile],
    suggested_plan_filename: Optional[str],
    reviewers: list[str],
    input_size_bytes: int,
    over_cap: bool,
    risks: list[str],
    adapter_result: Optional["AdapterResult"] = None,
    bundle_path: Optional[Path] = None,
    unavailable: Optional["AdapterUnavailable"] = None,
) -> tuple[str, str]:
    """Render the receipt. Three shapes:
    - dry-run: `adapter_result` and `unavailable` both None — describes the bundle.
    - adapter run: `adapter_result` set — records command, exit code, duration,
      and (on failure) a stderr excerpt.
    - CLI unavailable: `unavailable` set — records the attempted command and the
      dry-run fallback. A failure is never silent."""
    next_cmd = next_command_for(args, adapter_result, unavailable)
    lines = []
    lines.append("# Winston Plan Relay — Receipt\n")
    if unavailable is not None:
        lines.append("**Run type:** adapter invocation — **CLI UNAVAILABLE**\n")
    elif adapter_result is not None:
        status = "SUCCESS" if adapter_result.ok else "FAILURE"
        lines.append(f"**Run type:** adapter invocation — **{status}**\n")
    else:
        lines.append("**Run type:** dry-run (no model invoked)\n")
    lines.append(f"- **Input:** `{args.input_path}` ({input_size_bytes / 1024:.1f} KB)")
    if over_cap:
        lines.append(
            f"- **Note:** input exceeds `--max-input-kb {args.max_input_kb}`; "
            f"included anyway."
        )
    lines.append(f"- **Mode:** `{args.mode}`")
    lines.append(f"- **Target agent:** `{args.target_agent}`")
    lines.append(
        f"- **Reviewers requested:** {', '.join(reviewers) if reviewers else '(none)'}"
    )
    lines.append("- **Context files read:**")
    for cf in required_ctx + optional_ctx:
        marker = "✓" if cf.found else "✗ (missing)"
        lines.append(f"    - {marker} `{cf.rel_path}` ({cf.size_kb})")
    if suggested_plan_filename:
        lines.append(f"- **Suggested next plan number:** `{suggested_plan_filename}`")

    if unavailable is not None:
        lines.append("")
        lines.append("## Adapter invocation — CLI unavailable\n")
        lines.append(f"- **Target agent:** `{unavailable.agent}`")
        lines.append(f"- **Command attempted:** `{unavailable.command}`")
        if unavailable.detail:
            lines.append(f"- **Detail:** {unavailable.detail}")
        lines.append(f"- **Prompt bundle (preserved):** `{bundle_path}`")
        lines.append("- **Reviewer output:** not written — the CLI never ran.")
    elif adapter_result is not None:
        lines.append("")
        lines.append("## Adapter invocation\n")
        lines.append(f"- **Adapter:** `{adapter_result.adapter}`")
        lines.append(f"- **Command attempted:** `{adapter_result.command_str}`")
        lines.append(f"- **Exit code:** `{adapter_result.exit_code}`")
        lines.append(f"- **Duration:** {adapter_result.duration_ms} ms")
        lines.append(f"- **Prompt bundle:** `{bundle_path}`")
        lines.append(f"- **Reviewer output:** `{args.out}`")
        if not adapter_result.ok:
            excerpt = adapter_result.stderr_excerpt()
            lines.append("- **stderr excerpt:**")
            lines.append("")
            lines.append("```")
            lines.append(excerpt if excerpt else "(empty)")
            lines.append("```")
    else:
        lines.append(f"- **Output bundle:** `{args.out}`")

    if risks:
        lines.append("")
        lines.append("- **Risks / assumptions flagged:**")
        for r in risks:
            lines.append(f"    - {r}")
    lines.append("")
    lines.append("## Next recommended command\n")
    lines.append("```")
    lines.append(next_cmd)
    lines.append("```")
    return "\n".join(lines) + "\n", next_cmd


def _has_acceptance_evidence(text: str) -> bool:
    """True if the plan shows acceptance-criteria signal — either the literal
    phrase, or the canonical Winston row labels, or concrete proof structure
    (exit codes, status enums, verification commands). Avoids the false
    positive where a well-shaped plan never uses the words "acceptance
    criteria" but clearly defines pass/fail conditions."""
    lowered = text.lower()
    if "acceptance crit" in lowered:
        return True
    # Canonical Winston acceptance-row labels.
    row_labels = ("regression guard", "screen:", "evals:", "out of scope", "non-goals")
    if any(lbl in lowered for lbl in row_labels):
        return True
    # Concrete proof structure: exit codes, status enums, verification block.
    if re.search(r"exit\s*code", lowered):
        return True
    if re.search(r"^#+\s*verification", text, re.MULTILINE | re.IGNORECASE):
        return True
    return False


def _has_verification_evidence(text: str) -> bool:
    lowered = text.lower()
    if re.search(r"^#+\s*verification", text, re.MULTILINE | re.IGNORECASE):
        return True
    if "smoke test" in lowered or "pytest" in lowered or "exit code" in lowered:
        return True
    return False


def flag_risks(input_text: str, mode: str) -> list[str]:
    risks = []
    lowered = input_text.lower()
    if mode in ("plan-review", "two-agent-loop"):
        if not _has_acceptance_evidence(input_text):
            risks.append(
                "No acceptance-criteria signal found — no 'acceptance criteria' "
                "phrase, no Screen/API/DB/Evals/Regression-Guard rows, no exit-code "
                "or verification structure. Flag for the reviewer to add explicit "
                "pass/fail conditions."
            )
        if not _has_verification_evidence(input_text):
            risks.append("Input has no verification/test section — flag for reviewer.")
    if mode == "route-and-plan":
        if "environment" not in lowered:
            risks.append("Raw idea does not name an environment — route-and-plan will need to classify.")
    if len(input_text.strip()) < 200:
        risks.append("Input is very short (<200 chars) — bundle may be thin.")
    return risks


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)

    # --target-agent human has no adapter — it is a dry-run-only target.
    if not args.dry_run and args.target_agent == "human":
        err(
            "--target-agent human has no reviewer CLI to invoke. "
            "Re-run with --dry-run to assemble the bundle for manual paste."
        )
        return 2

    repo_root: Path = args.repo_root.resolve()
    if not repo_root.is_dir():
        err(f"--repo-root {repo_root} is not a directory.")
        return 2
    if not validate_repo_root(repo_root, args.allow_missing_context):
        return 2

    input_path: Path = args.input_path
    if not input_path.is_absolute():
        input_path = (Path.cwd() / input_path).resolve()
    if not input_path.is_file():
        err(f"--input {input_path} does not exist or is not a file.")
        return 2

    out_path: Path = args.out
    if not out_path.is_absolute():
        out_path = (Path.cwd() / out_path).resolve()
    if not out_path.parent.is_dir():
        err(f"--out parent dir {out_path.parent} does not exist (no auto-mkdir).")
        return 2

    skill_dir = Path(__file__).resolve().parent.parent

    required_ctx, optional_ctx = gather_context(repo_root)
    missing_required = [cf.rel_path for cf in required_ctx if not cf.found]
    if missing_required and not args.allow_missing_context:
        err(
            "missing required context files (pass --allow-missing-context to override):\n  "
            + "\n  ".join(missing_required)
        )
        return 2

    template_names = list_templates(repo_root)

    suggested_plan_filename = None
    if args.mode == "route-and-plan":
        nxt = suggest_next_plan_number(repo_root)
        if nxt is not None:
            suggested_plan_filename = f"{nxt}-<environment>-<short-title>.md"

    input_size = input_path.stat().st_size
    over_cap = input_size > args.max_input_kb * 1024
    if input_size == 0:
        sys.stderr.write(f"relay.py: warning: --input {input_path} is empty.\n")
    if over_cap:
        sys.stderr.write(
            f"relay.py: warning: --input is {input_size / 1024:.1f} KB, "
            f"over --max-input-kb {args.max_input_kb}; including anyway.\n"
        )
    input_text = read_text(input_path)

    reviewers = parse_reviewers(args.reviewers)

    risks = flag_risks(input_text, args.mode)

    bundle = assemble_bundle(
        args=args,
        skill_dir=skill_dir,
        required_ctx=required_ctx,
        optional_ctx=optional_ctx,
        template_names=template_names,
        suggested_plan_filename=suggested_plan_filename,
        input_text=input_text,
        reviewers=reviewers,
    )

    # Sibling-file paths. "<out>.receipt.md" and "<out>.bundle.md".
    receipt_path = out_path.parent / (out_path.name + ".receipt.md")
    bundle_path = out_path.parent / (out_path.name + ".bundle.md")

    # ---- Dry-run path: unchanged from Ticket 1.6. Bundle -> --out, plus receipt.
    if args.dry_run:
        receipt, next_cmd = assemble_receipt(
            args=args,
            required_ctx=required_ctx,
            optional_ctx=optional_ctx,
            suggested_plan_filename=suggested_plan_filename,
            reviewers=reviewers,
            input_size_bytes=input_size,
            over_cap=over_cap,
            risks=risks,
        )
        out_path.write_text(bundle, encoding="utf-8")
        receipt_path.write_text(receipt, encoding="utf-8")
        sys.stdout.write(f"Wrote bundle:  {out_path}\n")
        sys.stdout.write(f"Wrote receipt: {receipt_path}\n")
        if args.print_next_command:
            sys.stdout.write("\nNext recommended command:\n")
            sys.stdout.write(next_cmd + "\n")
        return 0

    # ---- Adapter path: invoke the reviewer CLI for --target-agent.
    adapter = ADAPTER_FOR_AGENT[args.target_agent]

    # Always preserve the exact prompt sent — debugging an adapter run without
    # the bundle is painful.
    bundle_path.write_text(bundle, encoding="utf-8")

    try:
        adapter_result = adapter.invoke(bundle, timeout_s=args.adapter_timeout)
    except AdapterUnavailable as exc:
        # Fail loud. The bundle is on disk; the receipt records the miss.
        err(str(exc))
        receipt, _ = assemble_receipt(
            args=args,
            required_ctx=required_ctx,
            optional_ctx=optional_ctx,
            suggested_plan_filename=suggested_plan_filename,
            reviewers=reviewers,
            input_size_bytes=input_size,
            over_cap=over_cap,
            risks=risks,
            unavailable=exc,
            bundle_path=bundle_path,
        )
        receipt_path.write_text(receipt, encoding="utf-8")
        sys.stdout.write(f"Wrote bundle:  {bundle_path}\n")
        sys.stdout.write(f"Wrote receipt: {receipt_path}\n")
        return 3

    # Write reviewer output (even on non-zero exit — partial output can help).
    out_path.write_text(adapter_result.stdout, encoding="utf-8")
    receipt, next_cmd = assemble_receipt(
        args=args,
        required_ctx=required_ctx,
        optional_ctx=optional_ctx,
        suggested_plan_filename=suggested_plan_filename,
        reviewers=reviewers,
        input_size_bytes=input_size,
        over_cap=over_cap,
        risks=risks,
        adapter_result=adapter_result,
        bundle_path=bundle_path,
    )
    receipt_path.write_text(receipt, encoding="utf-8")

    sys.stdout.write(f"Wrote bundle:  {bundle_path}\n")
    sys.stdout.write(f"Wrote output:  {out_path}\n")
    sys.stdout.write(f"Wrote receipt: {receipt_path}\n")
    if args.print_next_command:
        sys.stdout.write("\nNext recommended command:\n")
        sys.stdout.write(next_cmd + "\n")

    if not adapter_result.ok:
        # Never pretend the reviewer succeeded.
        err(
            f"reviewer exited {adapter_result.exit_code}. "
            f"See {receipt_path} for the stderr excerpt."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
