from __future__ import annotations

from copy import deepcopy
from typing import Any

LEVER_KEYS = [
    "rent_growth_bps",
    "vacancy_bps",
    "exit_cap_bps",
    "expense_growth_bps",
    "opex_ratio_delta",
    "ti_lc_per_sf",
    "capex_reserve_per_sf",
    "debt_rate_bps",
    "ltv_delta",
    "amort_years",
    "io_months",
]


def empty_levers() -> dict[str, float]:
    return {k: 0.0 for k in LEVER_KEYS}


_DEFAULT_SCENARIOS: dict[str, dict[str, dict[str, float]]] = {
    "multifamily": {
        "base": empty_levers(),
        "upside": {
            **empty_levers(),
            "rent_growth_bps": 50,
            "vacancy_bps": -100,
            "exit_cap_bps": -25,
            "expense_growth_bps": -25,
        },
        "downside": {
            **empty_levers(),
            "rent_growth_bps": -100,
            "vacancy_bps": 200,
            "exit_cap_bps": 50,
            "expense_growth_bps": 50,
            "debt_rate_bps": 50,
        },
    },
    "industrial": {
        "base": empty_levers(),
        "upside": {**empty_levers(), "rent_growth_bps": 75, "vacancy_bps": -75, "exit_cap_bps": -20},
        "downside": {**empty_levers(), "rent_growth_bps": -75, "vacancy_bps": 150, "exit_cap_bps": 40, "debt_rate_bps": 40},
    },
    "office": {
        "base": empty_levers(),
        "upside": {**empty_levers(), "rent_growth_bps": 60, "vacancy_bps": -100, "exit_cap_bps": -15},
        "downside": {**empty_levers(), "rent_growth_bps": -100, "vacancy_bps": 250, "exit_cap_bps": 60, "ti_lc_per_sf": 300},
    },
    "retail": {
        "base": empty_levers(),
        "upside": {**empty_levers(), "rent_growth_bps": 40, "vacancy_bps": -80, "exit_cap_bps": -20},
        "downside": {**empty_levers(), "rent_growth_bps": -80, "vacancy_bps": 180, "exit_cap_bps": 50},
    },
    "medical_office": {
        "base": empty_levers(),
        "upside": {**empty_levers(), "rent_growth_bps": 40, "vacancy_bps": -60, "exit_cap_bps": -15},
        "downside": {**empty_levers(), "rent_growth_bps": -60, "vacancy_bps": 140, "exit_cap_bps": 40},
    },
    "senior_housing": {
        "base": empty_levers(),
        "upside": {**empty_levers(), "rent_growth_bps": 60, "vacancy_bps": -120, "exit_cap_bps": -20},
        "downside": {**empty_levers(), "rent_growth_bps": -120, "vacancy_bps": 240, "exit_cap_bps": 60},
    },
    "student_housing": {
        "base": empty_levers(),
        "upside": {**empty_levers(), "rent_growth_bps": 70, "vacancy_bps": -100, "exit_cap_bps": -20},
        "downside": {**empty_levers(), "rent_growth_bps": -100, "vacancy_bps": 220, "exit_cap_bps": 50},
    },
}


def default_scenarios_for_property_type(property_type: str) -> list[dict[str, Any]]:
    preset = _DEFAULT_SCENARIOS.get(property_type) or _DEFAULT_SCENARIOS["multifamily"]
    return [
        {
            "name": "Base",
            "scenario_type": "base",
            "levers": deepcopy(preset["base"]),
            "is_default": True,
        },
        {
            "name": "Upside",
            "scenario_type": "upside",
            "levers": deepcopy(preset["upside"]),
            "is_default": True,
        },
        {
            "name": "Downside",
            "scenario_type": "downside",
            "levers": deepcopy(preset["downside"]),
            "is_default": True,
        },
    ]


def _normalize_levers(raw: dict[str, Any]) -> dict[str, float]:
    out = empty_levers()
    for key in LEVER_KEYS:
        if key in raw and raw[key] is not None:
            out[key] = float(raw[key])
    return out


def merge_scenarios(
    *,
    property_type: str,
    include_defaults: bool,
    custom_scenarios: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    scenarios: list[dict[str, Any]] = []
    if include_defaults:
        scenarios.extend(default_scenarios_for_property_type(property_type))

    for custom in custom_scenarios or []:
        scenarios.append(
            {
                "name": custom["name"],
                "scenario_type": "custom",
                "levers": _normalize_levers(custom.get("levers") or {}),
                "is_default": False,
            }
        )

    # Deduplicate by case-insensitive name, keep first.
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for row in scenarios:
        key = row["name"].strip().lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def apply_scenario_levers(base_assumptions: dict[str, Any], levers: dict[str, Any]) -> dict[str, Any]:
    adjusted = dict(base_assumptions)
    lever_values = _normalize_levers(levers)

    adjusted["rent_growth_pct"] = _clamp(
        float(base_assumptions.get("rent_growth_pct", 0.03)) + (lever_values["rent_growth_bps"] / 10000.0),
        -0.5,
        1.0,
    )
    adjusted["vacancy_pct"] = _clamp(
        float(base_assumptions.get("vacancy_pct", 0.06)) + (lever_values["vacancy_bps"] / 10000.0),
        0.0,
        0.95,
    )
    adjusted["exit_cap_pct"] = _clamp(
        float(base_assumptions.get("exit_cap_pct", 0.055)) + (lever_values["exit_cap_bps"] / 10000.0),
        0.01,
        0.20,
    )
    adjusted["expense_growth_pct"] = _clamp(
        float(base_assumptions.get("expense_growth_pct", 0.025))
        + (lever_values["expense_growth_bps"] / 10000.0),
        -0.5,
        1.0,
    )
    adjusted["opex_ratio"] = _clamp(
        float(base_assumptions.get("opex_ratio", 0.38)) + lever_values["opex_ratio_delta"],
        0.0,
        0.95,
    )
    adjusted["ti_lc_per_sf_cents"] = max(
        0.0,
        float(base_assumptions.get("ti_lc_per_sf_cents", 1500)) + float(lever_values["ti_lc_per_sf"]),
    )
    adjusted["capex_reserve_per_sf_cents"] = max(
        0.0,
        float(base_assumptions.get("capex_reserve_per_sf_cents", 300))
        + float(lever_values["capex_reserve_per_sf"]),
    )
    adjusted["debt_rate_pct"] = _clamp(
        float(base_assumptions.get("debt_rate_pct", 0.06)) + (lever_values["debt_rate_bps"] / 10000.0),
        0.0,
        0.30,
    )
    adjusted["ltv"] = _clamp(
        float(base_assumptions.get("ltv", 0.65)) + float(lever_values["ltv_delta"]),
        0.0,
        0.90,
    )

    amort_years = int(base_assumptions.get("amort_years", 30))
    io_months = int(base_assumptions.get("io_months", 24))
    if int(lever_values["amort_years"]) > 0:
        amort_years = int(lever_values["amort_years"])
    if int(lever_values["io_months"]) > 0:
        io_months = int(lever_values["io_months"])

    adjusted["amort_years"] = max(1, amort_years)
    adjusted["io_months"] = max(0, io_months)
    return adjusted
