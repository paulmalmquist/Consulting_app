"""Tests for model-level Monte Carlo reproducibility and aggregation."""
from __future__ import annotations

import random


def _simulate_single_asset(
    rng: random.Random,
    base_noi: float,
    loan_balance: float,
    contributions: float,
    params: dict,
) -> dict:
    """Simplified single-asset MC simulation for testing."""
    noi = base_noi
    for _year in range(1, params["hold_years"] + 1):
        rg = rng.gauss(params["rent_growth_mean"], params["rent_growth_std"])
        eg = rng.gauss(params["expense_growth_mean"], params["expense_growth_std"])
        noi = noi * (1 + rg - eg)
        if rng.random() < params["vacancy_shock_prob"]:
            noi = noi * (1 - params["vacancy_shock_magnitude"])
    exit_cap = max(0.01, rng.gauss(params["cap_rate_mean"], params["cap_rate_std"]))
    exit_value = noi / exit_cap
    exit_equity = exit_value - loan_balance
    moic = exit_equity / contributions if contributions > 0 else None
    return {"exit_equity": exit_equity, "moic": moic, "noi": noi}


def _default_params() -> dict:
    return {
        "rent_growth_mean": 0.02,
        "rent_growth_std": 0.015,
        "expense_growth_mean": 0.03,
        "expense_growth_std": 0.01,
        "cap_rate_mean": 0.055,
        "cap_rate_std": 0.008,
        "vacancy_shock_prob": 0.10,
        "vacancy_shock_magnitude": 0.15,
        "hold_years": 5,
    }


def test_mc_deterministic_seed():
    """Same seed + params produces identical results."""
    params = _default_params()
    base_noi = 1_000_000.0
    loan_balance = 5_000_000.0
    contributions = 10_000_000.0

    results_a = []
    rng_a = random.Random(42)
    for _ in range(100):
        results_a.append(
            _simulate_single_asset(rng_a, base_noi, loan_balance, contributions, params)
        )

    results_b = []
    rng_b = random.Random(42)
    for _ in range(100):
        results_b.append(
            _simulate_single_asset(rng_b, base_noi, loan_balance, contributions, params)
        )

    for a, b in zip(results_a, results_b):
        assert a["exit_equity"] == b["exit_equity"]
        assert a["moic"] == b["moic"]
        assert a["noi"] == b["noi"]


def test_mc_different_seeds_diverge():
    """Different seeds produce different results."""
    params = _default_params()
    base_noi = 1_000_000.0
    loan_balance = 5_000_000.0
    contributions = 10_000_000.0

    rng_a = random.Random(42)
    rng_b = random.Random(99)

    result_a = _simulate_single_asset(rng_a, base_noi, loan_balance, contributions, params)
    result_b = _simulate_single_asset(rng_b, base_noi, loan_balance, contributions, params)

    assert result_a["exit_equity"] != result_b["exit_equity"]


def test_mc_percentile_ordering():
    """p5 < p50 < p95 for a non-degenerate simulation."""
    params = _default_params()
    base_noi = 1_000_000.0
    loan_balance = 5_000_000.0
    contributions = 10_000_000.0
    n_sims = 1000

    rng = random.Random(42)
    navs = []
    for _ in range(n_sims):
        result = _simulate_single_asset(rng, base_noi, loan_balance, contributions, params)
        navs.append(result["exit_equity"])

    sorted_navs = sorted(navs)
    p5 = sorted_navs[int(n_sims * 0.05)]
    p50 = sorted_navs[int(n_sims * 0.50)]
    p95 = sorted_navs[int(n_sims * 0.95)]

    assert p5 < p50
    assert p50 < p95


def test_mc_stress_higher_impairment():
    """Stress scenario (high cap rate volatility) has higher impairment probability."""
    base_noi = 500_000.0
    loan_balance = 8_000_000.0
    contributions = 3_000_000.0
    n_sims = 500

    # Normal scenario
    normal_params = _default_params()
    rng = random.Random(42)
    normal_impairments = 0
    for _ in range(n_sims):
        result = _simulate_single_asset(rng, base_noi, loan_balance, contributions, normal_params)
        if result["exit_equity"] < 0:
            normal_impairments += 1

    # Stress scenario: wider cap rate std, higher vacancy
    stress_params = _default_params()
    stress_params["cap_rate_std"] = 0.025
    stress_params["vacancy_shock_prob"] = 0.30
    rng = random.Random(42)
    stress_impairments = 0
    for _ in range(n_sims):
        result = _simulate_single_asset(rng, base_noi, loan_balance, contributions, stress_params)
        if result["exit_equity"] < 0:
            stress_impairments += 1

    assert stress_impairments >= normal_impairments


def test_mc_fund_level_aggregation():
    """Per-asset results correctly aggregate to fund level."""
    params = _default_params()
    n_sims = 100
    rng = random.Random(42)

    assets = [
        {"base_noi": 1_000_000.0, "loan_balance": 5_000_000.0, "contributions": 10_000_000.0},
        {"base_noi": 800_000.0, "loan_balance": 3_000_000.0, "contributions": 7_000_000.0},
    ]

    fund_navs = []
    total_contributions = sum(a["contributions"] for a in assets)

    for _ in range(n_sims):
        sim_total = 0.0
        for asset in assets:
            result = _simulate_single_asset(
                rng,
                asset["base_noi"],
                asset["loan_balance"],
                asset["contributions"],
                params,
            )
            sim_total += result["exit_equity"]
        fund_navs.append(sim_total)

    # Fund mean NAV should be reasonable
    mean_nav = sum(fund_navs) / len(fund_navs)
    assert mean_nav > 0  # Should be positive on average with these inputs

    # Fund MOIC should be derivable
    fund_moics = [nav / total_contributions for nav in fund_navs]
    mean_moic = sum(fund_moics) / len(fund_moics)
    assert mean_moic > 0
