from __future__ import annotations

from app.underwriting.reports import generate_report_bundle


def test_report_bundle_contains_required_sections_and_citations():
    result = {
        "valuation": {
            "stabilized_noi_cents": 510000000,
            "direct_cap_value_cents": 9272727273,
            "gross_exit_value_cents": 9800000000,
            "net_exit_value_cents": 9604000000,
        },
        "returns": {
            "levered_irr": 0.128,
            "unlevered_irr": 0.107,
            "equity_multiple": 1.9,
            "npv_cents": 140000000,
        },
        "debt": {
            "loan_amount_cents": 5590000000,
            "debt_rate_pct": 0.061,
            "min_dscr": 1.29,
            "balloon_balance_cents": 4300000000,
        },
        "proforma": [{"year": 1, "noi_cents": 510000000}],
        "recommendation": "buy",
    }
    bundle = generate_report_bundle(
        run_context={
            "run_id": "test-run-id",
            "property_name": "Sunset Gardens",
            "property_type": "multifamily",
            "submarket": "Uptown",
        },
        scenario={
            "scenario_id": "test-scenario-id",
            "name": "Base",
            "scenario_type": "base",
            "levers": {},
        },
        result=result,
        assumptions={
            "rent_growth_pct": 0.03,
            "vacancy_pct": 0.06,
            "entry_cap_pct": 0.055,
            "exit_cap_pct": 0.06,
            "expense_growth_pct": 0.025,
            "debt_rate_pct": 0.061,
            "ltv": 0.65,
        },
        market_snapshot={
            "vacancy_rate": 0.056,
            "cap_rate": 0.055,
            "rent_growth_pct": 0.028,
        },
        sale_comps=[{"id": "sale-1"}],
        lease_comps=[{"id": "lease-1"}],
        sources=[
            {
                "citation_key": "SRC-1",
                "title": "Sample Source",
                "publisher": "Example Publisher",
                "date_accessed": "2026-02-19",
                "url": "https://example.com/source",
                "excerpt_hash": "abc123",
            }
        ],
    )

    assert "# Investment Committee Memo" in bundle["ic_memo_md"]
    assert "## Recommendation" in bundle["ic_memo_md"]
    assert "# Appraisal-Style Narrative" in bundle["appraisal_md"]
    assert "# Model Outputs" in bundle["outputs_md"]
    assert "# Sources Ledger" in bundle["sources_ledger_md"]
    assert "SRC-1" in bundle["sources_ledger_md"]
    assert bundle["outputs_json"]["citations"] == ["SRC-1"]
