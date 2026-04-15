"""CI lint: McpContext constructor contract.

The McpContext dataclass (backend/app/mcp/auth.py) has exactly four fields:
  - actor: str
  - token_valid: bool
  - resolved_scope: dict | None = None
  - context_envelope: dict | None = None

Passing any other kwarg (e.g. user=, env_id=, business_id=) raises TypeError
at construction. In SSE streams this TypeError fires BEFORE the outer
try/except, silently terminating the stream with no error event.

This is a recurring landmine documented in MEMORY.md. This lint is the
automated guard against regression. It walks every McpContext(...) call in
the backend and flags any keyword argument not in ALLOWED_FIELDS.

Usage:
    python -m verification.lint.mcp_context_contract          # exit 1 on violation
    python -m verification.lint.mcp_context_contract --json   # machine-readable
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"

ALLOWED_FIELDS = frozenset({"actor", "token_valid", "resolved_scope", "context_envelope"})


@dataclass
class Violation:
    file: str
    line: int
    col: int
    forbidden_kwarg: str
    snippet: str


@dataclass
class Report:
    violations: list[Violation] = field(default_factory=list)


class _McpContextCallVisitor(ast.NodeVisitor):
    def __init__(self, path: Path, source_lines: list[str], report: Report) -> None:
        self._path = path
        self._source_lines = source_lines
        self._report = report

    def visit_Call(self, node: ast.Call) -> None:
        if self._is_mcp_context_call(node):
            for kw in node.keywords:
                if kw.arg is None:
                    continue
                if kw.arg not in ALLOWED_FIELDS:
                    snippet = self._source_lines[node.lineno - 1].strip() if 0 < node.lineno <= len(self._source_lines) else ""
                    self._report.violations.append(
                        Violation(
                            file=str(self._path.relative_to(REPO_ROOT)),
                            line=node.lineno,
                            col=node.col_offset,
                            forbidden_kwarg=kw.arg,
                            snippet=snippet,
                        )
                    )
        self.generic_visit(node)

    @staticmethod
    def _is_mcp_context_call(node: ast.Call) -> bool:
        func = node.func
        if isinstance(func, ast.Name) and func.id == "McpContext":
            return True
        if isinstance(func, ast.Attribute) and func.attr == "McpContext":
            return True
        return False


# Files that deliberately exercise the forbidden-kwarg path to prove it
# raises. They are the lint's own safety net and must not be flagged.
EXEMPT_FILES = frozenset({"test_mcp_context_contract.py"})


def _iter_python_files(root: Path):
    for path in root.rglob("*.py"):
        parts = path.parts
        if any(segment in {".venv", "venv", "__pycache__", ".mypy_cache", ".pytest_cache"} for segment in parts):
            continue
        if path.name in EXEMPT_FILES:
            continue
        yield path


def run_lint() -> Report:
    report = Report()
    if not BACKEND_ROOT.exists():
        return report
    for path in _iter_python_files(BACKEND_ROOT):
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        try:
            tree = ast.parse(source, filename=str(path))
        except SyntaxError:
            continue
        source_lines = source.splitlines()
        _McpContextCallVisitor(path, source_lines, report).visit(tree)
    return report


def _format_violation(v: Violation) -> str:
    return f"  [mcp_context_forbidden_kwarg:{v.forbidden_kwarg}] {v.file}:{v.line}\n      {v.snippet}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    report = run_lint()

    if args.json:
        payload = {
            "violations": [
                {
                    "file": v.file,
                    "line": v.line,
                    "col": v.col,
                    "forbidden_kwarg": v.forbidden_kwarg,
                    "snippet": v.snippet,
                }
                for v in report.violations
            ]
        }
        print(json.dumps(payload, indent=2))
    else:
        if not report.violations:
            print("mcp_context_contract: OK (0 violations)")
        else:
            print(
                f"mcp_context_contract: FAIL ({len(report.violations)} violation(s))\n"
                "See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md and MEMORY.md.\n"
                "Allowed kwargs: actor, token_valid, resolved_scope, context_envelope."
            )
            for v in report.violations:
                print(_format_violation(v))

    return 1 if report.violations else 0


if __name__ == "__main__":
    sys.exit(main())
