"""Golden-path deploy gate — cross-environment prompt → template routing tests.

Rule: Only includes templates verified to exist in query_templates.py today.
PDS and CRM tests assert only on templates confirmed present via list_templates().

These tests are a required CI gate. A regression here means a live user would
get a wrong or missing routing for a high-value query pattern.
"""
from __future__ import annotations

import pytest

from app.sql_agent.query_classifier import classify_query


# ── REPE — all 13 templates verified present ──────────────────────────

REPE_PATHS = [
    # IRR / returns
    ("which fund has the best IRR", "repe.irr_ranked"),
    ("best funds by gross irr", "repe.irr_ranked"),
    ("best funds by net irr", "repe.irr_ranked"),
    ("rank funds by TVPI", "repe.tvpi_ranked"),
    ("which fund has the highest NAV", "repe.nav_ranked"),
    # Debt metrics
    ("which assets have the highest DSCR", "repe.dscr_ranked"),
    ("show me the lowest LTV assets", "repe.ltv_ranked"),
    ("show loans maturing in the next 12 months", "repe.debt_maturity"),
    ("what is the debt maturity schedule", "repe.debt_maturity"),
    # NOI
    ("biggest NOI movers this quarter", "repe.noi_movers"),
    ("show NOI trend for Meridian Park", "repe.noi_trend"),
    # Occupancy
    ("which assets have the highest occupancy", "repe.occupancy_ranked"),
    ("occupancy trend for Oakbrook", "repe.occupancy_trend"),
]

# ── PDS — only templates confirmed present ────────────────────────────

PDS_PATHS = [
    ("utilization by service line", "pds.utilization_by_group"),
    ("revenue vs budget this quarter", "pds.revenue_variance"),
]

# ── CRM — only templates confirmed present ────────────────────────────

CRM_PATHS = [
    ("show stale opportunities", "crm.stale_opportunities"),
    ("pipeline summary", "crm.pipeline_summary"),
]


# ── Parametrized test ─────────────────────────────────────────────────

ALL_PATHS = REPE_PATHS + PDS_PATHS + CRM_PATHS


@pytest.mark.parametrize("prompt,expected_template", ALL_PATHS)
def test_golden_path_routing(prompt: str, expected_template: str) -> None:
    """Classifier must route each golden-path prompt to the correct template."""
    result = classify_query(prompt)
    assert result.suggested_template_key == expected_template, (
        f"\nPrompt:   {prompt!r}"
        f"\nExpected: {expected_template!r}"
        f"\nGot:      {result.suggested_template_key!r}"
        f"\nDomain:   {result.domain!r}"
        f"\nType:     {result.query_type.value!r}"
        f"\nScores:   {result.signals.get('scores', {})}"
    )


# ── Sanity: all referenced templates actually exist ───────────────────

def test_all_golden_path_templates_registered():
    """Each expected template key must exist in the registry.

    This prevents the golden-path test suite from drifting out of sync
    with the actual template registry.
    """
    from app.sql_agent.query_templates import get_template
    for _, expected in ALL_PATHS:
        t = get_template(expected)
        assert t is not None, f"Template {expected!r} not found in registry — golden path is stale"
