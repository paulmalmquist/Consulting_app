from __future__ import annotations

from app.underwriting.model import run_underwriting_model


def _sample_inputs():
    property_inputs = {
        "property_name": "Sunset Gardens",
        "property_type": "multifamily",
        "gross_area_sf": 125000,
        "unit_count": 220,
        "occupancy_pct": 0.94,
        "in_place_noi_cents": 520000000,
        "purchase_price_cents": 8600000000,
    }
    market_snapshot = {
        "cap_rate": 0.055,
        "exit_cap_rate": 0.06,
        "vacancy_rate": 0.056,
        "rent_growth_pct": 0.028,
        "expense_growth_pct": 0.025,
        "debt_rate_pct": 0.061,
    }
    assumptions = {
        "rent_growth_pct": 0.03,
        "vacancy_pct": 0.06,
        "entry_cap_pct": 0.055,
        "exit_cap_pct": 0.06,
        "expense_growth_pct": 0.025,
        "opex_ratio": 0.38,
        "ti_lc_per_sf_cents": 1500,
        "capex_reserve_per_sf_cents": 300,
        "debt_rate_pct": 0.061,
        "ltv": 0.65,
        "amort_years": 30,
        "io_months": 24,
        "sale_cost_pct": 0.02,
        "discount_rate_pct": 0.10,
        "hold_years": 10,
    }
    return property_inputs, market_snapshot, assumptions


def test_model_is_deterministic():
    property_inputs, market_snapshot, assumptions = _sample_inputs()
    scenario = {
        "rent_growth_bps": 0,
        "vacancy_bps": 0,
        "exit_cap_bps": 0,
        "expense_growth_bps": 0,
        "opex_ratio_delta": 0,
        "ti_lc_per_sf": 0,
        "capex_reserve_per_sf": 0,
        "debt_rate_bps": 0,
        "ltv_delta": 0,
        "amort_years": 0,
        "io_months": 0,
    }
    out1 = run_underwriting_model(
        property_inputs=property_inputs,
        market_snapshot=market_snapshot,
        assumptions=assumptions,
        scenario_levers=scenario,
    )
    out2 = run_underwriting_model(
        property_inputs=property_inputs,
        market_snapshot=market_snapshot,
        assumptions=assumptions,
        scenario_levers=scenario,
    )
    assert out1 == out2


def test_model_outputs_required_sections():
    property_inputs, market_snapshot, assumptions = _sample_inputs()
    out = run_underwriting_model(
        property_inputs=property_inputs,
        market_snapshot=market_snapshot,
        assumptions=assumptions,
        scenario_levers={"rent_growth_bps": 50, "vacancy_bps": -50},
    )
    assert out["recommendation"] in {"buy", "reprice", "pass"}
    assert out["valuation"]["direct_cap_value_cents"] > 0
    assert out["returns"]["npv_cents"] != 0
    assert len(out["proforma"]) == 10
    assert len(out["debt"]["schedule"]) == 10
    for key in [
        "exit_cap_minus_50bps",
        "exit_cap_plus_50bps",
        "rent_growth_minus_100bps",
        "rent_growth_plus_100bps",
        "vacancy_minus_200bps",
        "vacancy_plus_200bps",
    ]:
        assert key in out["sensitivities"]
