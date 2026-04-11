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

Rules
─────
Existing:
  ui_forbidden_symbol              — banned REPE UI symbols
  ui_restricted_symbol_used_for_kpi — restricted symbols used for KPI display
  assistant_sql_aggregate_over_repe_tables — raw SQL aggregates in assistant runtime
  assistant_unscoped_asset_fn      — asset functions without fund_id scope

Phase 7 additions (INV-1…INV-5, NF-2):
  backend_nav_source_drift         — INV-1: backend service reads NAV from legacy table
  banned_legacy_table_reads        — INV-1: direct reads from banned tables outside snapshot builder
  period_coherence_violation       — INV-2: quarter_state joins without quarter filter
  ownership_at_aggregation         — INV-4: ownership multiplication inside rollup loop
  fail_closed_violation            — INV-5: except-run_waterfall returns numeric fallback; || 0 coercions
  ui_fallback_to_stale_metrics     — INV-1+5: React component mixes authoritative + legacy with fallback
  canonical_metrics_key_drift      — NF-2: code references canonical_metrics.gross_tvpi (wrong key)
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


# ---------------------------------------------------------------------------
# Phase 7 additions — INV-1 through INV-5, NF-2
# ---------------------------------------------------------------------------

BACKEND_SERVICE_ROOTS = (
    ("backend/app/services", (".py",)),
    ("backend/app/routes", (".py",)),
)

# backend_nav_source_drift (INV-1)
# Backend service files that compute fund-level return metrics must source
# NAV from get_authoritative_state, not legacy tables.
_METRIC_COMPUTE_REGEX = re.compile(
    r"\b(dpi|rvpi|tvpi|gross_tvpi|net_tvpi)\s*=",
    re.IGNORECASE,
)
_LEGACY_NAV_TABLE_REGEX = re.compile(
    r"FROM\s+re_fund_quarter_state\b",
    re.IGNORECASE,
)

# banned_legacy_table_reads (INV-1)
# Direct reads from banned tables outside the snapshot-builder / authoritative
# snapshots allowlist.
BANNED_TABLE_READS_REGEX = re.compile(
    r"\b(re_fund_quarter_state|re_fund_metrics_qtr)\b",
    re.IGNORECASE,
)
# raw re_cash_event aggregate for fund-level metrics
BANNED_CASH_EVENT_AGG_REGEX = re.compile(
    r"FROM\s+re_cash_event\b(?!.*event_date\s*<=)",  # missing event_date filter
    re.IGNORECASE,
)

SNAPSHOT_BUILDER_ALLOWLIST = {
    "backend/app/services/re_authoritative_snapshots.py",
    "backend/app/routes/re_authoritative.py",
    "backend/app/schemas/re_authoritative.py",
    "backend/app/services/re_fund_metrics.py",  # patched — reads banned tables only for bridge inserts
}

# period_coherence_violation (INV-2)
# SQL JOINs on *_quarter_state tables must have an explicit quarter filter.
_QS_JOIN_REGEX = re.compile(
    r"JOIN\s+\w*_quarter_state\b",
    re.IGNORECASE,
)
_QUARTER_FILTER_REGEX = re.compile(
    r"quarter\s*=",
    re.IGNORECASE,
)

# ownership_at_aggregation (INV-4)
# Ownership multiplied inside aggregation loops is banned. Pre-normalize at edge.
_OWNERSHIP_MULTIPLY_REGEX = re.compile(
    r"\*\s*(ownership|ownership_percent|ownership_pct)\b",
    re.IGNORECASE,
)

# fail_closed_violation (INV-5, backend)
# except blocks around run_waterfall that return a numeric value rather than None.
_RUN_WATERFALL_EXCEPT_REGEX = re.compile(
    r"except\s*\([^)]*\)\s*:\s*\n(?:[^\n]*\n){0,5}.*return\s+Decimal\(",
    re.MULTILINE,
)

# fail_closed_violation (INV-5, frontend)
# || 0 / ?? 0 / Number(x) || 0 coercions on authoritative-state fields.
_ZERO_COERCION_REGEX = re.compile(
    r"(gross_irr|net_irr|gross_tvpi|net_tvpi|dpi|rvpi|carry|carry_shadow"
    r"|gross_net_spread|net_return|gross_return)"
    r"[^;{}]*(\?\?\s*0\b|\|\|\s*0\b|Number\([^)]+\)\s*\|\|\s*0\b)",
    re.IGNORECASE,
)

# ui_fallback_to_stale_metrics (INV-1 + INV-5)
# React files that import both useAuthoritativeState and a legacy fetcher.
_AUTH_STATE_IMPORT_REGEX = re.compile(r"\buseAuthoritativeState\b")
_LEGACY_FETCHER_IMPORT_REGEX = re.compile(
    r"\b(getReV2FundQuarterState|re_fund_metrics_qtr|getFundMetricsQtr)\b"
)
_FALLBACK_PATTERN_REGEX = re.compile(
    r"\?\?\s*(legacy|stale|cached|fallback|fund_state)",
    re.IGNORECASE,
)

# canonical_metrics_key_drift (NF-2)
# The correct key in canonical_metrics is 'tvpi', not 'gross_tvpi'.
_CANONICAL_GROSS_TVPI_REGEX = re.compile(
    r"""canonical_metrics['".\s\[]*gross_tvpi""",
    re.IGNORECASE,
)


def _check_backend_nav_source_drift(report: LintReport) -> None:
    """INV-1: backend services must not compute fund-level metrics from legacy NAV table."""
    for path in _iter_files(BACKEND_SERVICE_ROOTS):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel in SNAPSHOT_BUILDER_ALLOWLIST or rel in ALLOWLIST_FILES:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        lines = content.splitlines()
        # Flag files that both compute a fund-level metric AND read from
        # the legacy re_fund_quarter_state table.
        computes_metric = any(_METRIC_COMPUTE_REGEX.search(ln) for ln in lines)
        reads_legacy_nav = any(_LEGACY_NAV_TABLE_REGEX.search(ln) for ln in lines)
        if computes_metric and reads_legacy_nav:
            for i, ln in enumerate(lines, start=1):
                if _LEGACY_NAV_TABLE_REGEX.search(ln):
                    report.add(Violation(
                        rule="backend_nav_source_drift",
                        file=rel,
                        line=i,
                        snippet=ln.rstrip()[:200],
                    ))


def _check_banned_legacy_table_reads(report: LintReport) -> None:
    """INV-1: direct reads from banned tables outside snapshot-builder allowlist."""
    for path in _iter_files(BACKEND_SERVICE_ROOTS):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel in SNAPSHOT_BUILDER_ALLOWLIST or rel in ALLOWLIST_FILES:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        lines = content.splitlines()
        for i, ln in enumerate(lines, start=1):
            stripped = ln.strip()
            if stripped.startswith("#"):
                continue
            if BANNED_TABLE_READS_REGEX.search(ln):
                report.add(Violation(
                    rule="banned_legacy_table_reads",
                    file=rel,
                    line=i,
                    snippet=ln.rstrip()[:200],
                ))


def _check_period_coherence(report: LintReport) -> None:
    """INV-2: SQL JOINs on *_quarter_state must carry an explicit quarter filter."""
    all_roots = BACKEND_SERVICE_ROOTS + (("backend/app/assistant_runtime", (".py",)),)
    for path in _iter_files(all_roots):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if _is_allowed(path) or rel in SNAPSHOT_BUILDER_ALLOWLIST:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        lines = content.splitlines()
        for i, ln in enumerate(lines, start=1):
            if not _QS_JOIN_REGEX.search(ln):
                continue
            # Check a ±10-line window for a quarter = filter
            window_start = max(0, i - 5)
            window_end = min(len(lines), i + 10)
            window = "\n".join(lines[window_start:window_end])
            if not _QUARTER_FILTER_REGEX.search(window):
                report.add(Violation(
                    rule="period_coherence_violation",
                    file=rel,
                    line=i,
                    snippet=ln.rstrip()[:200],
                ))


def _check_ownership_at_aggregation(report: LintReport) -> None:
    """INV-4: ownership must not be multiplied inside aggregation loops."""
    rollup_roots = (("backend/app/services", (".py",)),)
    for path in _iter_files(rollup_roots):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if _is_allowed(path) or rel in SNAPSHOT_BUILDER_ALLOWLIST:
            continue
        if "rollup" not in path.name and "aggregat" not in path.name:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        lines = content.splitlines()
        for i, ln in enumerate(lines, start=1):
            stripped = ln.strip()
            if stripped.startswith("#"):
                continue
            if _OWNERSHIP_MULTIPLY_REGEX.search(ln):
                report.add(Violation(
                    rule="ownership_at_aggregation",
                    file=rel,
                    line=i,
                    snippet=ln.rstrip()[:200],
                ))


def _check_fail_closed(report: LintReport) -> None:
    """INV-5: except-run_waterfall must not return numeric fallback; no || 0 coercions on KPI fields."""
    # Backend: multiline except block check
    for path in _iter_files(BACKEND_SERVICE_ROOTS):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if _is_allowed(path) or rel in SNAPSHOT_BUILDER_ALLOWLIST:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if "run_waterfall" not in content:
            continue
        for match in _RUN_WATERFALL_EXCEPT_REGEX.finditer(content):
            line_no = content.count("\n", 0, match.start()) + 1
            snippet = content[match.start():match.start() + 120].replace("\n", " ")
            report.add(Violation(
                rule="fail_closed_violation",
                file=rel,
                line=line_no,
                snippet=snippet[:200],
            ))

    # Frontend: zero coercions on KPI fields
    fe_roots = REPE_PAGE_ROOTS + (("repo-b/src/components/re", (".tsx", ".ts")),)
    for path in _iter_files(fe_roots):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if _is_allowed(path):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        lines = content.splitlines()
        for i, ln in enumerate(lines, start=1):
            stripped = ln.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            if _ZERO_COERCION_REGEX.search(ln):
                report.add(Violation(
                    rule="fail_closed_violation",
                    file=rel,
                    line=i,
                    snippet=ln.rstrip()[:200],
                ))


def _check_ui_fallback_to_stale_metrics(report: LintReport) -> None:
    """INV-1+5: React components may not mix authoritative state + legacy fetcher with fallback."""
    fe_roots = (
        ("repo-b/src/app/lab/env", (".tsx", ".ts")),
        ("repo-b/src/components/re", (".tsx", ".ts")),
    )
    for path in _iter_files(fe_roots, require_segments=("/re/",)):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if _is_allowed(path):
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        has_auth = bool(_AUTH_STATE_IMPORT_REGEX.search(content))
        has_legacy = bool(_LEGACY_FETCHER_IMPORT_REGEX.search(content))
        has_fallback = bool(_FALLBACK_PATTERN_REGEX.search(content))
        if has_auth and has_legacy and has_fallback:
            # Flag the line with the legacy fetcher reference
            lines = content.splitlines()
            for i, ln in enumerate(lines, start=1):
                if _LEGACY_FETCHER_IMPORT_REGEX.search(ln):
                    report.add(Violation(
                        rule="ui_fallback_to_stale_metrics",
                        file=rel,
                        line=i,
                        snippet=ln.rstrip()[:200],
                    ))


def _check_canonical_metrics_key_drift(report: LintReport) -> None:
    """NF-2: canonical_metrics key must be 'tvpi', not 'gross_tvpi'."""
    all_roots = BACKEND_SERVICE_ROOTS + REPE_PAGE_ROOTS + (
        ("repo-b/src/components/re", (".tsx", ".ts")),
        ("repo-b/src/lib", (".ts",)),
    )
    for path in _iter_files(all_roots):
        rel = path.relative_to(REPO_ROOT).as_posix()
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        lines = content.splitlines()
        for i, ln in enumerate(lines, start=1):
            stripped = ln.strip()
            if stripped.startswith("#") or stripped.startswith("//") or stripped.startswith("*"):
                continue
            if _CANONICAL_GROSS_TVPI_REGEX.search(ln):
                report.add(Violation(
                    rule="canonical_metrics_key_drift",
                    file=rel,
                    line=i,
                    snippet=ln.rstrip()[:200],
                ))


def run_lint() -> LintReport:
    report = LintReport()
    _check_ui_files(report)
    _check_assistant_files(report)
    _check_backend_nav_source_drift(report)
    _check_banned_legacy_table_reads(report)
    _check_period_coherence(report)
    _check_ownership_at_aggregation(report)
    _check_fail_closed(report)
    _check_ui_fallback_to_stale_metrics(report)
    _check_canonical_metrics_key_drift(report)
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
