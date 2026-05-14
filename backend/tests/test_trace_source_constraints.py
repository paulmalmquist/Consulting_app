"""Structural source-file tests for the trace services.

These tests are pure source inspection — they read the trace service modules
and assert structural constraints about what tables they touch. No DB, no
FastAPI; safe to run in any context.

The constraint enforced here is the ownership-source rule from the trace
hardening pass:

    ownership_pct used by re_nav_trace must come from
    re_authoritative_asset_state_qtr.canonical_metrics.ownership_pct
    — never from repe_jv, repe_jv_partner_share, or any current ownership table.

If a future change adds a JOIN to one of those tables inside re_nav_trace.py,
this test will fail. The fix is not an allowlist — it is to route ownership
through the snapshot's canonical_metrics.
"""

from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
NAV_TRACE_PATH = REPO_ROOT / "backend" / "app" / "services" / "re_nav_trace.py"
IRR_TRACE_PATH = REPO_ROOT / "backend" / "app" / "services" / "re_irr_trace.py"
TRACE_GATE_PATH = REPO_ROOT / "backend" / "app" / "services" / "re_trace_gate.py"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# ─── Ownership source ────────────────────────────────────────────────────────


def test_nav_trace_reads_ownership_pct_from_canonical_metrics():
    """ownership_pct must come from canonical_metrics, not a current-state table."""
    src = _read(NAV_TRACE_PATH)
    assert "canonical_metrics->>'ownership_pct'" in src, (
        "re_nav_trace must read ownership_pct from "
        "re_authoritative_asset_state_qtr.canonical_metrics — that is the "
        "snapshot-consistent source. If the column moved, update both this "
        "test and the audit receipt."
    )


def test_nav_trace_does_not_touch_current_ownership_tables():
    """No JOIN to repe_jv / repe_jv_partner_share / repe_ownership."""
    src = _read(NAV_TRACE_PATH)
    banned = [
        "repe_jv_partner_share",
        "repe_jv ",
        "FROM repe_jv\n",
        "JOIN repe_jv\n",
        "repe_ownership",
        "re_jv_quarter_state",
    ]
    offenders = [b for b in banned if b in src]
    assert not offenders, (
        f"re_nav_trace must not read ownership from current-state tables: {offenders}. "
        "Ownership must be sourced from the asset snapshot row to keep the "
        "trace snapshot-consistent."
    )


# ─── Source-table scope ──────────────────────────────────────────────────────


def test_nav_trace_only_authoritative_asset_state_qtr():
    """The NAV trace's data source must be the released asset-state table."""
    src = _read(NAV_TRACE_PATH)
    assert "FROM re_authoritative_asset_state_qtr" in src
    # Banlist: legacy / current-state NAV sources
    banned = [
        "FROM repe_asset_quarter_state",
        "FROM re_asset_quarter_state",
        "FROM repe_quarter_state",
    ]
    for b in banned:
        assert b not in src, (
            f"NAV trace must not read NAV from {b}; that path bypasses the "
            "authoritative snapshot and is forbidden by the State Lockdown rules."
        )


def test_irr_trace_only_investment_cf_series_mat():
    """The IRR trace's CF source must be the materialized CF series."""
    src = _read(IRR_TRACE_PATH)
    assert "FROM re_investment_cf_series_mat" in src
    banned = [
        "FROM re_cash_event",
        "FROM re_capital_call",
        "FROM re_distribution",
    ]
    for b in banned:
        assert b not in src, (
            f"IRR trace must not recompute from {b}. The hash gate's purpose "
            "is to prove the CF series is the snapshot's exact inputs; "
            "falling back to a different table breaks the contract."
        )


# ─── Hash-gate / scope constants ─────────────────────────────────────────────


def test_irr_trace_hash_gate_uses_inputs_and_provenance():
    """Both the inputs_hash and provenance[0].cf_series_hash must be checked."""
    src = _read(IRR_TRACE_PATH)
    assert "inputs_hash" in src
    assert "cf_series_hash" in src
    # Verify the gate function exists and is wired
    assert re.search(r"_extract_cf_series_hash\b", src)


def test_irr_trace_has_investment_membership_check():
    """Defense-in-depth: matched CF rows must be checked against the released set."""
    src = _read(IRR_TRACE_PATH)
    assert "expected_investment_set" in src
    assert "rogue_investment_ids" in src or "expected_investment_set" in src
    assert "investment_set_check" in src or "expected_investment_set" in src


def test_irr_trace_has_quarter_consistency_check():
    """Matched CF rows must carry as_of_quarter == snapshot.quarter."""
    src = _read(IRR_TRACE_PATH)
    assert "mismatched_quarters" in src
    assert "quarter_consistency_check" in src
    assert "quarter_split_brain" in src or "as_of_quarter" in src


def test_nav_trace_has_quarter_consistency_check():
    """Asset rows must all be from snapshot.quarter."""
    src = _read(NAV_TRACE_PATH)
    assert "mismatched_quarters" in src
    assert "quarter_consistency_check" in src
    assert "quarter_split_brain" in src


# ─── Gate routing ────────────────────────────────────────────────────────────


def test_gate_joins_inclusion_view_and_released_snapshot():
    """Trace gate must join re_fund_portfolio_included_v with re_authoritative_fund_state_qtr."""
    src = _read(TRACE_GATE_PATH)
    assert "re_fund_portfolio_included_v" in src
    assert "re_authoritative_fund_state_qtr" in src
    assert "promotion_state = 'released'" in src
    # 404 path must be present
    assert "HTTPException" in src
    assert "404" in src
