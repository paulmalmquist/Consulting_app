"""Cleanup PR regressions: prove that /fund-trend and re_reconciliation now
consume the canonical fund-set view (re_fund_portfolio_included_funds_v) and
no longer carry inline `[QUARANTINED]` name filters.

These are structural assertions — they read the production source files and
verify the contract is encoded the way the audit receipt claims. They run
with no DB and no FastAPI; they're pure source inspection.

Companion to audit/fund_portfolio_coherence/inclusion_selectors_audit.md.
"""

from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
RE_V2_PATH = REPO_ROOT / "backend" / "app" / "routes" / "re_v2.py"
RECONCILIATION_PATH = REPO_ROOT / "backend" / "app" / "services" / "re_reconciliation.py"
INCLUDED_FUNDS_VIEW_PATH = REPO_ROOT / "repo-b" / "db" / "schema" / "536_re_fund_portfolio_included_funds_view.sql"
INCLUDED_VIEW_PATH = REPO_ROOT / "repo-b" / "db" / "schema" / "535_re_fund_portfolio_included_view.sql"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _extract_fund_trend_block(source: str) -> str:
    """Slice the get_environment_fund_trend handler from re_v2.py."""
    start = source.index('@router.get("/environments/{env_id}/fund-trend")')
    # The next route definition marks the end.
    rest = source[start:]
    next_route = re.search(r"\n@router\.get\(", rest[1:])
    if next_route:
        return rest[: next_route.start() + 1]
    return rest


def _extract_reconciliation_topology_block(source: str) -> str:
    """Slice the topology-loading section in build_environment_reconciliation."""
    start = source.index("def build_environment_reconciliation(")
    end_marker = "# ── 2. Portfolio-level expected"
    end = source.index(end_marker, start)
    return source[start:end]


# ─── Migration view exists ────────────────────────────────────────────────


def test_included_funds_view_migration_exists():
    """The shared fund-set predicate view migration must exist on disk."""
    assert INCLUDED_FUNDS_VIEW_PATH.exists(), (
        f"Expected {INCLUDED_FUNDS_VIEW_PATH} to exist. The cleanup PR "
        f"introduces re_fund_portfolio_included_funds_v as the shared "
        f"fund-set predicate."
    )
    text = _read(INCLUDED_FUNDS_VIEW_PATH)
    assert "CREATE OR REPLACE VIEW re_fund_portfolio_included_funds_v" in text
    assert "promotion_state = 'released'" in text
    assert "NOT ILIKE '%[QUARANTINED]%'" in text
    assert "scope_completeness" in text


# ─── /fund-trend uses the canonical view ──────────────────────────────────


def test_fund_trend_joins_canonical_included_funds_view():
    """/fund-trend must JOIN re_fund_portfolio_included_funds_v, not repe_fund."""
    source = _read(RE_V2_PATH)
    block = _extract_fund_trend_block(source)
    assert "re_fund_portfolio_included_funds_v" in block, (
        "Expected /fund-trend to JOIN re_fund_portfolio_included_funds_v. "
        "Found:\n" + block[:1500]
    )


def test_fund_trend_no_inline_quarantined_filter():
    """The handler must not carry an inline `name NOT ILIKE '%[QUARANTINED]%'`
    filter — that's the canonical view's job."""
    source = _read(RE_V2_PATH)
    block = _extract_fund_trend_block(source)
    assert "NOT ILIKE '%%[QUARANTINED]%%'" not in block, (
        "/fund-trend still carries an inline [QUARANTINED] name filter. "
        "Replace the inline filter with a JOIN on "
        "re_fund_portfolio_included_funds_v."
    )
    assert "NOT ILIKE '%[QUARANTINED]%'" not in block


# ─── re_reconciliation uses the canonical view ────────────────────────────


def test_reconciliation_loads_funds_from_canonical_view():
    """re_reconciliation.build_environment_reconciliation must load the
    fund topology from re_fund_portfolio_included_funds_v."""
    source = _read(RECONCILIATION_PATH)
    block = _extract_reconciliation_topology_block(source)
    assert "re_fund_portfolio_included_funds_v" in block, (
        "Expected reconciliation topology to read from "
        "re_fund_portfolio_included_funds_v. Found:\n" + block[:1500]
    )


def test_reconciliation_no_inline_quarantined_filter():
    """The reconciliation topology block must not carry an inline `name NOT
    ILIKE '%[QUARANTINED]%'` filter."""
    source = _read(RECONCILIATION_PATH)
    block = _extract_reconciliation_topology_block(source)
    assert "NOT ILIKE '%%[QUARANTINED]%%'" not in block
    assert "NOT ILIKE '%[QUARANTINED]%'" not in block


# ─── No remaining inline `[QUARANTINED]` selectors in production code ────
# Other matches are allowed in:
#   - the schema migration files (where the canonical predicate is defined)
#   - test files (which exercise the predicate)


def test_no_remaining_inline_quarantined_selectors_in_production_code():
    """Sweep backend production sources for inline `[QUARANTINED]` name filters.

    The only legitimate occurrences are in the schema migration files
    (535_re_fund_portfolio_included_view.sql, 536_re_fund_portfolio_included_funds_view.sql)
    which define the canonical predicate.
    """
    backend_app = REPO_ROOT / "backend" / "app"
    offenders: list[tuple[str, int, str]] = []

    for py_file in backend_app.rglob("*.py"):
        # Skip migrations / fixture seeds — none expected, but be explicit.
        if py_file.name.startswith("_"):
            continue
        text = py_file.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            if "[QUARANTINED]" in line and (
                "ILIKE" in line or "LIKE" in line
            ):
                offenders.append((str(py_file.relative_to(REPO_ROOT)), lineno, line.strip()))

    assert not offenders, (
        "Found inline [QUARANTINED] LIKE/ILIKE filters in production backend "
        "code. These should be replaced with a JOIN on "
        "re_fund_portfolio_included_funds_v so the inclusion predicate is "
        "defined exactly once.\n"
        + "\n".join(f"  {p}:{ln}: {src}" for p, ln, src in offenders)
    )
