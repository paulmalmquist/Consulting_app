"""CI lint: enforce the Authoritative State Lockdown rules.

See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.

This script greps the REPE-touching surface area for forbidden symbols
and direct SQL aggregates that would let a non-snapshot path serve a
financial value. It is run in CI via
backend/tests/test_state_lock_invariants.py.

Usage:
  python -m verification.lint.no_legacy_repe_reads          # exit 1 on violation
  python -m verification.lint.no_legacy_repe_reads --json   # machine-readable output

The lint is *deliberately conservative*. It is allowed to be wrong on
the side of more violations rather than fewer. If a legitimate use of a
banned symbol appears, add it to ALLOWLIST_FILES with a one-line
comment explaining why.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------

# Path roots to walk recursively. We don't use Path.glob because
# Next.js dynamic segments like `[envId]` are interpreted as character
# classes by fnmatch, so we walk subdirectories explicitly and match
# extensions instead.
REPE_PAGE_ROOTS = (
    ("repo-b/src/app/lab/env", (".tsx", ".ts")),
    ("repo-b/src/app/app/repe", (".tsx", ".ts")),
)
REPE_PAGE_FILTER_SEGMENTS = ("/re/", "/repe/")

ASSISTANT_RUNTIME_ROOTS = (
    ("backend/app/assistant_runtime", (".py",)),
)

# ---------------------------------------------------------------------------
# Forbidden patterns (UI side)
# ---------------------------------------------------------------------------

# These symbols may not appear in REPE page render paths because they
# bypass the authoritative-state contract.
FORBIDDEN_UI_SYMBOLS = (
    "getFundBaseScenario",
    "computeFundBaseScenario",
)

# These symbols may exist in REPE pages for non-KPI uses (entity name,
# tags, status), but a render of TVPI/IRR/NOI/Capex from them is
# forbidden. The lint flags any KPI rendering call site.
RESTRICTED_UI_SYMBOLS = (
    "getReV2FundQuarterState",
    "getReV2InvestmentQuarterState",
    "getReV2AssetQuarterState",
)

KPI_LABEL_REGEX = re.compile(
    r"\b(TVPI|IRR|NOI|Gross\s+IRR|Net\s+IRR|Capex|carry|promote|gp_share)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Forbidden patterns (assistant side)
# ---------------------------------------------------------------------------

# Direct SQL aggregates over the authoritative or REPE financial tables
# from assistant runtime files are forbidden — those answers must come
# from the snapshot contract.
SQL_AGG_REGEX = re.compile(
    r"(?ix)\b(SUM|COUNT|AVG)\s*\(\s*[^)]*\)\s+FROM\s+(re_authoritative_\w+|repe_\w+|re_fund_\w+)"
)

# Calls to repe.count_assets / list_property_assets without a fund_id
# argument are forbidden inside assistant runtime — these are how the
# 45-vs-22 bug happens. We use a paren-balanced matcher because the
# call args may contain nested calls like UUID(business_id).
ASSET_FN_NAME_REGEX = re.compile(
    r"\brepe\.(count_assets|list_property_assets)\s*\("
)


def _extract_paren_balanced(text: str, open_index: int) -> tuple[int, str] | None:
    """Return (close_index, inner) for the substring starting at the open
    paren at `open_index`. Returns None if no matching close paren."""
    depth = 0
    i = open_index
    while i < len(text):
        ch = text[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i, text[open_index + 1 : i]
        i += 1
    return None


# ---------------------------------------------------------------------------
# Allowlist
# ---------------------------------------------------------------------------

# Files explicitly allowed to use the single fetch layer or the legacy
# quarter-state fetchers for non-KPI display. These paths are part of
# the lockdown infrastructure itself.
ALLOWLIST_FILES = {
    # The single fetch layer itself.
    "repo-b/src/lib/bos-api.ts",
    "repo-b/src/hooks/useAuthoritativeState.ts",
    "repo-b/src/components/re/AuditDrawer.tsx",
    "repo-b/src/components/re/TrustChip.tsx",
    # Backend single source of truth.
    "backend/app/services/re_authoritative_snapshots.py",
    "backend/app/routes/re_authoritative.py",
    "backend/app/schemas/re_authoritative.py",
}


@dataclass
class Violation:
    rule: str
    file: str
    line: int
    snippet: str

    def to_dict(self) -> dict:
        return {
            "rule": self.rule,
            "file": self.file,
            "line": self.line,
            "snippet": self.snippet,
        }


@dataclass
class LintReport:
    violations: list[Violation] = field(default_factory=list)

    def add(self, violation: Violation) -> None:
        self.violations.append(violation)

    def to_dict(self) -> dict:
        return {
            "violation_count": len(self.violations),
            "violations": [v.to_dict() for v in self.violations],
        }


def _iter_files(
    roots: Iterable[tuple[str, tuple[str, ...]]],
    *,
    require_segments: tuple[str, ...] | None = None,
) -> Iterable[Path]:
    seen: set[Path] = set()
    for root_str, extensions in roots:
        root = REPO_ROOT / root_str
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in extensions:
                continue
            if require_segments is not None:
                rel = path.relative_to(REPO_ROOT).as_posix()
                if not any(seg in rel for seg in require_segments):
                    continue
            if path in seen:
                continue
            seen.add(path)
            yield path


def _is_allowed(path: Path) -> bool:
    rel = path.relative_to(REPO_ROOT).as_posix()
    return rel in ALLOWLIST_FILES


def _check_ui_files(report: LintReport) -> None:
    for path in _iter_files(REPE_PAGE_ROOTS, require_segments=REPE_PAGE_FILTER_SEGMENTS):
        if _is_allowed(path):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()

        for line_no, line in enumerate(content.splitlines(), start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("//") or stripped.startswith("*"):
                continue
            for symbol in FORBIDDEN_UI_SYMBOLS:
                if symbol in line:
                    report.add(
                        Violation(
                            rule="ui_forbidden_symbol",
                            file=rel,
                            line=line_no,
                            snippet=line.rstrip()[:200],
                        )
                    )
            for symbol in RESTRICTED_UI_SYMBOLS:
                if symbol in line:
                    # Restricted symbols are flagged only if a KPI label
                    # is present in the same window (loose heuristic for
                    # KPI rendering vs non-financial display).
                    window_start = max(0, line_no - 3)
                    window_end = min(len(content.splitlines()), line_no + 3)
                    window_text = "\n".join(
                        content.splitlines()[window_start:window_end]
                    )
                    if KPI_LABEL_REGEX.search(window_text):
                        report.add(
                            Violation(
                                rule="ui_restricted_symbol_used_for_kpi",
                                file=rel,
                                line=line_no,
                                snippet=line.rstrip()[:200],
                            )
                        )


def _check_assistant_files(report: LintReport) -> None:
    for path in _iter_files(ASSISTANT_RUNTIME_ROOTS):
        if _is_allowed(path):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()

        for match in SQL_AGG_REGEX.finditer(content):
            line_no = content.count("\n", 0, match.start()) + 1
            line_text = content.splitlines()[line_no - 1]
            report.add(
                Violation(
                    rule="assistant_sql_aggregate_over_repe_tables",
                    file=rel,
                    line=line_no,
                    snippet=line_text.rstrip()[:200],
                )
            )

        for match in ASSET_FN_NAME_REGEX.finditer(content):
            open_paren = match.end() - 1
            extracted = _extract_paren_balanced(content, open_paren)
            if extracted is None:
                continue
            _, inner_args = extracted
            # Only flag the call if fund_id is NOT in the argument list.
            if "fund_id" in inner_args:
                continue
            line_no = content.count("\n", 0, match.start()) + 1
            line_text = content.splitlines()[line_no - 1]
            report.add(
                Violation(
                    rule="assistant_unscoped_asset_fn",
                    file=rel,
                    line=line_no,
                    snippet=line_text.rstrip()[:200],
                )
            )


def run_lint() -> LintReport:
    report = LintReport()
    _check_ui_files(report)
    _check_assistant_files(report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    report = run_lint()
    if args.json:
        json.dump(report.to_dict(), sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        if not report.violations:
            print("no_legacy_repe_reads: PASS (0 violations)")
        else:
            print(f"no_legacy_repe_reads: FAIL ({len(report.violations)} violations)")
            for v in report.violations:
                print(f"  [{v.rule}] {v.file}:{v.line}")
                print(f"      {v.snippet}")
    return 1 if report.violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
