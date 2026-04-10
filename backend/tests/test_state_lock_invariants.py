"""CI guardrail tests for the Authoritative State Lockdown.

These tests fail if any future agent reintroduces a legacy REPE fetch
path. They wrap verification/lint/no_legacy_repe_reads.py so the lint
runs in the same suite as the contract tests.

When this test fails, do NOT add an exception. Read
docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md and re-route the offending
code through the single fetch layer.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def test_no_legacy_repe_reads_in_locked_surfaces():
    from verification.lint.no_legacy_repe_reads import run_lint

    report = run_lint()
    if report.violations:
        formatted = "\n".join(
            f"  [{v.rule}] {v.file}:{v.line}\n      {v.snippet}"
            for v in report.violations
        )
        raise AssertionError(
            "Authoritative State Lockdown lint failed. "
            "See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.\n"
            f"{len(report.violations)} violation(s):\n{formatted}"
        )
