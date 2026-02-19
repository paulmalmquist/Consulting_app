from __future__ import annotations

import pytest

from app.schemas.underwriting import PropertyType
from app.underwriting.scenarios import apply_scenario_levers, default_scenarios_for_property_type, merge_scenarios


def test_default_scenarios_for_all_property_types():
    for prop in PropertyType:
        scenarios = default_scenarios_for_property_type(prop.value)
        assert [s["scenario_type"] for s in scenarios] == ["base", "upside", "downside"]
        assert all("levers" in row for row in scenarios)


def test_merge_scenarios_keeps_first_duplicate_name():
    merged = merge_scenarios(
        property_type="multifamily",
        include_defaults=True,
        custom_scenarios=[
            {"name": "Base", "levers": {"rent_growth_bps": 500}},
            {"name": "Custom Alpha", "levers": {"vacancy_bps": 100}},
            {"name": "custom alpha", "levers": {"vacancy_bps": 200}},
        ],
    )
    names = [row["name"] for row in merged]
    assert names.count("Base") == 1
    assert names.count("Custom Alpha") == 1


def test_apply_scenario_levers_adjustments_and_clamps():
    base = {
        "rent_growth_pct": 0.03,
        "vacancy_pct": 0.06,
        "exit_cap_pct": 0.055,
        "expense_growth_pct": 0.025,
        "opex_ratio": 0.38,
        "ti_lc_per_sf_cents": 1500,
        "capex_reserve_per_sf_cents": 300,
        "debt_rate_pct": 0.06,
        "ltv": 0.65,
        "amort_years": 30,
        "io_months": 24,
    }
    levers = {
        "rent_growth_bps": 100,
        "vacancy_bps": -50,
        "exit_cap_bps": 25,
        "expense_growth_bps": -25,
        "opex_ratio_delta": 0.02,
        "ti_lc_per_sf": 100,
        "capex_reserve_per_sf": 50,
        "debt_rate_bps": 40,
        "ltv_delta": -0.02,
        "amort_years": 35,
        "io_months": 36,
    }
    adjusted = apply_scenario_levers(base, levers)
    assert adjusted["rent_growth_pct"] == pytest.approx(0.04)
    assert adjusted["vacancy_pct"] == pytest.approx(0.055)
    assert adjusted["exit_cap_pct"] == pytest.approx(0.0575)
    assert adjusted["expense_growth_pct"] == pytest.approx(0.0225)
    assert adjusted["opex_ratio"] == pytest.approx(0.4)
    assert adjusted["ti_lc_per_sf_cents"] == 1600
    assert adjusted["capex_reserve_per_sf_cents"] == 350
    assert adjusted["debt_rate_pct"] == pytest.approx(0.064)
    assert adjusted["ltv"] == pytest.approx(0.63)
    assert adjusted["amort_years"] == 35
    assert adjusted["io_months"] == 36
