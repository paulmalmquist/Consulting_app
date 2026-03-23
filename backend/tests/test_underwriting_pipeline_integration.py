from __future__ import annotations

import json
from pathlib import Path

from app.underwriting.id import deterministic_run_identity
from app.underwriting.model import run_underwriting_model
from app.underwriting.normalization import normalize_research_payload, validate_citation_requirements
from app.underwriting.reports import generate_report_bundle
from app.underwriting.scenarios import merge_scenarios


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "underwriting"


def _load_json(name: str):
    return json.loads((FIXTURE_DIR / name).read_text())


def test_underwriting_pipeline_multifamily_fixture_is_stable():
    property_payload = _load_json("sample_property_multifamily.json")
    research_payload = _load_json("sample_research_payload.json")

    create_payload = {
        "business_id": "00000000-0000-0000-0000-000000000123",
        **property_payload,
    }
    run_id_1, input_hash_1 = deterministic_run_identity(create_payload)
    run_id_2, input_hash_2 = deterministic_run_identity(create_payload)
    assert run_id_1 == run_id_2
    assert input_hash_1 == input_hash_2

    validate_citation_requirements(research_payload)
    normalized = normalize_research_payload(research_payload)

    property_inputs = {
        "property_name": property_payload["property_name"],
        "property_type": property_payload["property_type"],
        "gross_area_sf": property_payload["gross_area_sf"],
        "unit_count": property_payload["unit_count"],
        "occupancy_pct": property_payload["occupancy_pct"],
        "in_place_noi_cents": property_payload["in_place_noi_cents"],
        "purchase_price_cents": property_payload["purchase_price_cents"],
    }
    market_snapshot = {row["metric_key"]: float(row["metric_value"]) for row in normalized["market_snapshot"]}
    assumptions = {
        "rent_growth_pct": market_snapshot.get("rent_growth_pct", 0.03),
        "vacancy_pct": market_snapshot.get("vacancy_rate", 0.06),
        "entry_cap_pct": market_snapshot.get("cap_rate", 0.055),
        "exit_cap_pct": market_snapshot.get("cap_rate", 0.06) + 0.005,
        "expense_growth_pct": 0.025,
        "opex_ratio": 0.38,
        "ti_lc_per_sf_cents": 1500,
        "capex_reserve_per_sf_cents": 300,
        "debt_rate_pct": market_snapshot.get("debt_rate_pct", 0.061),
        "ltv": 0.65,
        "amort_years": 30,
        "io_months": 24,
        "sale_cost_pct": 0.02,
        "discount_rate_pct": 0.10,
        "hold_years": 10,
    }

    scenarios = merge_scenarios(
        property_type=property_payload["property_type"],
        include_defaults=True,
        custom_scenarios=[{"name": "Stress Debt", "levers": {"debt_rate_bps": 75}}],
    )
    assert len(scenarios) == 4

    results = []
    for scenario in scenarios:
        out = run_underwriting_model(
            property_inputs=property_inputs,
            market_snapshot=market_snapshot,
            assumptions=assumptions,
            scenario_levers=scenario["levers"],
        )
        assert out["valuation"]["direct_cap_value_cents"] > 0
        assert out["recommendation"] in {"buy", "reprice", "pass"}
        results.append((scenario, out))

    report_bundle = generate_report_bundle(
        run_context={
            "run_id": str(run_id_1),
            "property_name": property_payload["property_name"],
            "property_type": property_payload["property_type"],
            "submarket": property_payload["submarket"],
        },
        scenario=results[0][0],
        result=results[0][1],
        assumptions=results[0][1]["applied_assumptions"],
        market_snapshot=market_snapshot,
        sale_comps=normalized["sale_comps"],
        lease_comps=normalized["lease_comps"],
        sources=normalized["sources"],
    )
    assert "Investment Committee Memo" in report_bundle["ic_memo_md"]
    assert "Appraisal-Style Narrative" in report_bundle["appraisal_md"]
    assert "Sources Ledger" in report_bundle["sources_ledger_md"]
    assert len(report_bundle["outputs_json"]["citations"]) == len(normalized["sources"])
