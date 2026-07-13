"""Guided terminal operator flow for the Coding Relay (stdlib only).

Entered when the relay is launched with no plan arguments on a TTY:

    select plan -> preview/confirm/edit criteria -> preflight table ->
    approve start -> per-iteration summaries with continue prompts ->
    final outcome -> safe draft-PR offer.

Design rules:
- No new bypasses: hard preflight failures stop before any prompt, and
  nothing here can reach a PR after a safety stop, block, or error.
- `--yes` makes the guided flow non-blocking (accept criteria, proceed on
  warnings like the non-interactive path, keep iterating, auto PR policy).
  It never bypasses hard failures; those stop before prompts exist.
- All prompt I/O is injectable (input_fn/print_fn/editor_fn) so the flow is
  testable without a real terminal.
"""
from __future__ import annotations

import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable, Optional

from orchestration.coding_relay import intake as intake_mod
from orchestration.coding_relay.intake import (
    AcceptanceCriteria,
    IntakeError,
    IntakeResult,
    TEMPLATE,
    extract_criteria,
    normalize_criteria,
)

HEADING_RE = re.compile(r"^#\s+(.*)")
STATUS_RE = re.compile(r"^[-*]?\s*(?:\*\*)?Status(?:\*\*)?\s*:\s*(.*)", re.IGNORECASE)
ID_MARKER_RE = re.compile(r"^(\s*[-*+]\s+)\[[A-Z]+\d+\]\s+")


def stdin_is_tty() -> bool:
    try:
        return sys.stdin.isatty()
    except (AttributeError, ValueError):
        return False


def safe_print(text: str = "") -> None:
    """print() that survives narrow consoles. Windows terminals often run
    cp1252, and active-plan titles legitimately contain characters it
    cannot encode; a crash here would exit 1 and collide with the MAX_ITER
    exit code. Lossy replacement beats a dead menu."""
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    sys.stdout.write(str(text).encode(enc, "replace").decode(enc, "replace") + "\n")
    sys.stdout.flush()


# ---------------------------------------------------------------- plan menu

def plan_menu_entries(repo_root: Path, plan_dir: str | None = None) -> list:
    """(path, title, status) per active plan; robust to unparseable files."""
    entries = []
    for path in intake_mod.list_active_plans(repo_root, plan_dir):
        title, status = "", ""
        try:
            for line in path.read_text(encoding="utf-8", errors="replace").splitlines()[:40]:
                line = line.strip()
                if not title:
                    m = HEADING_RE.match(line)
                    if m:
                        title = m.group(1).strip()
                        continue
                if not status:
                    m = STATUS_RE.match(line)
                    if m:
                        status = m.group(1).strip()
                if title and status:
                    break
        except OSError:
            pass
        entries.append((path, title, status))
    return entries


def render_menu(entries: list, print_fn: Callable = safe_print) -> None:
    print_fn("Active plans (docs/plans/03-implementation-plans/active/):")
    for i, (path, title, status) in enumerate(entries, 1):
        label = title or "(no title parsed)"
        suffix = f"  [{status[:40]}]" if status else ""
        print_fn(f"  {i:2d}. {path.name}")
        print_fn(f"      {label[:76]}{suffix}")
    print_fn("")
    print_fn("  [p] paste a plan   [f] enter a file path   [q] quit")


def _read_paste(input_fn: Callable, print_fn: Callable) -> Optional[str]:
    print_fn("Paste the plan text. Finish with a single line containing only END")
    lines = []
    while True:
        try:
            line = input_fn("")
        except EOFError:
            break
        if line.strip() == "END":
            break
        lines.append(line)
    text = "\n".join(lines).strip()
    if not text:
        print_fn("Nothing pasted.")
        return None
    tmp = tempfile.NamedTemporaryFile(
        "w", suffix=".md", prefix="relay-paste-", delete=False, encoding="utf-8"
    )
    tmp.write(text + "\n")
    tmp.close()
    return tmp.name


def select_plan(
    repo_root: Path,
    input_fn: Callable = input,
    print_fn: Callable = safe_print,
) -> Optional[dict]:
    """Menu loop. Returns {'plan': str} or {'paste_file': str}, or None on quit."""
    entries = plan_menu_entries(repo_root)
    render_menu(entries, print_fn)
    while True:
        try:
            choice = input_fn("Select a plan number, [p]aste, [f]ile path, or [q]uit: ").strip().lower()
        except EOFError:
            return None
        if choice in ("q", "quit", ""):
            return None
        if choice == "p":
            paste = _read_paste(input_fn, print_fn)
            if paste:
                return {"paste_file": paste}
            continue
        if choice == "f":
            raw = input_fn("Plan file path: ").strip().strip('"')
            if raw and Path(raw).is_file():
                return {"plan": raw}
            print_fn(f"Not a file: {raw}")
            continue
        if choice.isdigit() and 1 <= int(choice) <= len(entries):
            return {"plan": str(entries[int(choice) - 1][0])}
        print_fn("Unrecognized choice.")


# ------------------------------------------------- criteria confirm / edit

def strip_id_markers(text: str) -> str:
    return "\n".join(ID_MARKER_RE.sub(r"\1", line) for line in text.splitlines())


def reload_criteria(text: str) -> AcceptanceCriteria:
    """Re-parse an edited normalized-criteria file. Raises IntakeError."""
    cleaned = strip_id_markers(text)
    block = extract_criteria(cleaned)
    if block is None:
        raise IntakeError(
            "The edited file no longer contains an 'Acceptance Criteria' "
            "heading. Restore the shape:\n\n" + TEMPLATE
        )
    return normalize_criteria(block)


def default_editor(path: Path, input_fn: Callable = input, print_fn: Callable = safe_print) -> None:
    """Open $EDITOR on the file, or wait for a manual edit."""
    editor = os.environ.get("EDITOR", "").strip()
    if editor:
        try:
            subprocess.run([*shlex.split(editor), str(path)], check=False)
            return
        except OSError as exc:
            print_fn(f"Could not launch $EDITOR ({exc}); edit the file manually.")
    print_fn(f"Edit this file, then come back:\n  {path}")
    input_fn("Press Enter when you are done editing... ")


def confirm_criteria(
    result: IntakeResult,
    input_fn: Callable = input,
    print_fn: Callable = safe_print,
    editor_fn: Optional[Callable] = None,
    assume_yes: bool = False,
) -> Optional[IntakeResult]:
    """Preview loop: accept (Y), edit (e), or abort (n). None on abort.
    Raises IntakeError if an edit produces invalid criteria."""
    editor_fn = editor_fn or (lambda p: default_editor(p, input_fn, print_fn))
    while True:
        print_fn("")
        print_fn(result.criteria.to_markdown())
        if assume_yes:
            return result
        answer = input_fn("Use these criteria? [Y/e/n] ").strip().lower()
        if answer in ("", "y", "yes"):
            return result
        if answer in ("n", "no"):
            print_fn("Aborted before any work started.")
            return None
        if answer == "e":
            tmp = Path(tempfile.mkstemp(suffix=".md", prefix="relay-criteria-")[1])
            tmp.write_text(result.criteria.to_markdown(), encoding="utf-8")
            editor_fn(tmp)
            edited = tmp.read_text(encoding="utf-8", errors="replace")
            result.criteria = reload_criteria(edited)  # IntakeError propagates
            # Splice the edited criteria over the plan's original section so
            # the builder/reviewer prompts (which embed plan_text) do not
            # carry the stale, now-contradicting criteria.
            result.plan_text = intake_mod.replace_criteria_block(
                result.plan_text, result.criteria.to_markdown()
            )
            continue
        print_fn("Answer Y (accept), e (edit), or n (abort).")


# ----------------------------------------------------------- preflight view

def render_preflight(checks, print_fn: Callable = safe_print) -> None:
    for c in checks.checks:
        lines = c.detail.splitlines() or [""]
        # FAIL rows keep their full multi-line detail: it carries the
        # remediation hint (e.g. 're-run with --allow-stale-base'), which
        # must not be truncated away.
        if c.status == "fail":
            print_fn(f"{c.status.upper():<5} {c.name:<16} {lines[0]}")
            for extra in lines[1:]:
                print_fn(f"{'':<22}{extra}")
        else:
            print_fn(f"{c.status.upper():<5} {c.name:<16} {lines[0][:90]}")


# ------------------------------------------------------------- operator UI

class AutoUI:
    """Non-interactive policy: byte-identical to the pre-guided behavior."""

    def __init__(self, args):
        self.args = args

    def notify(self, text: str) -> None:
        safe_print(text)

    def error(self, text: str) -> None:
        """Failure/diagnostic channel. PR 1 wrote these to stderr; keep that
        so wrappers separating the streams still work."""
        sys.stderr.write(str(text) + "\n")

    def confirm_warnings(self, warn_checks) -> bool:
        return True  # non-interactive runs always proceeded on warnings

    def confirm_start(self, description: str) -> bool:
        return True

    def on_continue(self, iteration: int, verdict, test_results, violations) -> bool:
        return True

    def decide_pr(self, state: str, last_verdict) -> bool:
        from orchestration.coding_relay.loop import MAX_ITER, PASS

        if self.args.no_pr:
            return False
        if state == PASS:
            if last_verdict and not last_verdict.should_open_pr and not self.args.draft_pr:
                self.notify(
                    "[pr] skipped: reviewer set should_open_pr=false "
                    "(pass --draft-pr to override)"
                )
                return False
            return True
        if state == MAX_ITER:
            return self.args.draft_pr
        return False


class TerminalUI(AutoUI):
    """Interactive prompts layered on the same safe policy boundaries."""

    def __init__(self, args, input_fn: Callable = input, print_fn: Callable = safe_print):
        super().__init__(args)
        self.input_fn = input_fn
        self.print_fn = print_fn

    def notify(self, text: str) -> None:
        self.print_fn(text)

    def error(self, text: str) -> None:
        # Interactive operator sees failures inline; still mirror to stderr
        # so piped invocations keep the stream separation.
        self.print_fn(text)
        sys.stderr.write(str(text) + "\n")

    def _ask(self, question: str, default_yes: bool) -> bool:
        suffix = "[Y/n] " if default_yes else "[y/N] "
        try:
            answer = self.input_fn(f"{question} {suffix}").strip().lower()
        except EOFError:
            # A closed stdin (Ctrl+D, dropped SSH) is a decline, not a crash.
            # This keeps operator termination on the safe path: No answers
            # never open a PR or continue, and the loop's on_continue stop is
            # MAX_ITER semantics, not an internal ERROR.
            self.print_fn("")
            return False
        if not answer:
            return default_yes
        return answer in ("y", "yes")

    def confirm_warnings(self, warn_checks) -> bool:
        if self.args.yes:
            return True  # matches non-interactive behavior; never hides FAILs
        names = ", ".join(c.name for c in warn_checks)
        return self._ask(f"Preflight warnings ({names}). Continue with warnings?", default_yes=False)

    def confirm_start(self, description: str) -> bool:
        if self.args.yes:
            return True
        return self._ask(f"Create {description} and start the relay?", default_yes=True)

    def on_continue(self, iteration: int, verdict, test_results, violations) -> bool:
        unmet = sum(1 for c in verdict.criteria_status if c.get("status") in ("unmet", "unknown"))
        self.print_fn("")
        self.print_fn(f"--- iteration {iteration} summary ---")
        self.print_fn(f"safety:   {len(violations)} violation(s) this run")
        if test_results:
            for r in test_results:
                self.print_fn(f"tests:    {r.summary_line()}")
        else:
            self.print_fn("tests:    none run (no matching changed paths)")
        self.print_fn(f"verdict:  {verdict.status} - {verdict.summary[:160]}")
        self.print_fn(f"criteria: {unmet} unmet/unknown of {len(verdict.criteria_status)} judged")
        for step in verdict.required_next_steps[:5]:
            self.print_fn(f"next:     {step[:160]}")
        for flag in verdict.risk_flags[:5]:
            self.print_fn(f"risk:     {flag[:160]}")
        if self.args.yes:
            return True
        return self._ask("Continue to next iteration?", default_yes=True)

    def decide_pr(self, state: str, last_verdict) -> bool:
        from orchestration.coding_relay.loop import MAX_ITER, PASS

        if self.args.no_pr:
            return False
        if state == PASS:
            if self.args.yes or self.args.draft_pr:
                return super().decide_pr(state, last_verdict)
            default_yes = True
            note = ""
            if last_verdict and not last_verdict.should_open_pr:
                default_yes = False
                note = " (reviewer set should_open_pr=false)"
            return self._ask(f"Open draft PR now?{note}", default_yes=default_yes)
        if state == MAX_ITER:
            if self.args.draft_pr:
                return True  # explicit flag is the operator override
            if self.args.yes:
                return False
            return self._ask(
                "Relay did not pass. Open draft PR anyway as operator override?",
                default_yes=False,
            )
        return False  # never after SAFETY_STOP / BLOCKED / ERROR


# ----------------------------------------------------------------- guided

def run_guided(args, input_fn: Callable = input, print_fn: Callable = safe_print) -> int:
    """Full guided flow. Returns the process exit code."""
    from orchestration.coding_relay.__main__ import execute_run

    repo_root: Path = args.repo_root.resolve()
    print_fn("Coding Relay - guided mode (docs/reference/CODING_RELAY.md)")
    selection = select_plan(repo_root, input_fn, print_fn)
    if selection is None:
        print_fn("Quit. Nothing was created.")
        return 2
    try:
        result = intake_mod.load_plan(
            repo_root, selection.get("plan"), selection.get("paste_file")
        )
    except IntakeError as exc:
        print_fn(f"[intake] REFUSED: {exc}")
        return 2
    print_fn(f"[intake] plan: {result.title}")
    try:
        confirmed = confirm_criteria(
            result, input_fn, print_fn, assume_yes=args.yes
        )
    except IntakeError as exc:
        print_fn(f"[criteria] invalid after edit: {exc}")
        return 2
    if confirmed is None:
        return 2
    ui = TerminalUI(args, input_fn, print_fn)
    return execute_run(args, confirmed, ui)
