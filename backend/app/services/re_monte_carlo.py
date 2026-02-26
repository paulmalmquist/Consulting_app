"""Monte Carlo Risk Simulation — seeded and reproducible.

Samples rent growth, expense growth, cap rate drift, vacancy shocks.
Recomputes valuation and IRR per simulation using a deterministic seed.
Stores run metadata + summary results.
"""

from __future__ import annotations

import json
import random
import uuid
from decimal import Decimal

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_math import (
    calculate_irr,
)

TWO_PLACES = Decimal("0.01")
SIX_PLACES = Decimal("0.000001")


def run(
    *,
    fin_asset_investment_id: str,
    quarter: str,
    n_sims: int = 1000,
    seed: int = 42,
    distribution_params: dict | None = None,
) -> dict:
    """Run Monte Carlo simulation for an asset.

    Uses deterministic seed for reproducibility.
    """
    from app.services.re_valuation import get_asset_financial_state

    state = get_asset_financial_state(fin_asset_investment_id, quarter)

    base_noi = float(state["forward_12_noi"] or state["net_operating_income"])
    loan_balance = float(state["loan_balance"] or 0)
    contributions = float(state.get("cumulative_contributions") or 0)
    snapshot_id = str(state["valuation_snapshot_id"])

    # Default distribution params
    params = {
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
    if distribution_params:
        params.update(distribution_params)

    # Seed the RNG
    rng = random.Random(seed)

    irrs = []
    moics = []
    nav_outcomes = []
    impairment_count = 0

    for _ in range(n_sims):
        noi = base_noi

        for year in range(1, params["hold_years"] + 1):
            rg = rng.gauss(params["rent_growth_mean"], params["rent_growth_std"])
            eg = rng.gauss(params["expense_growth_mean"], params["expense_growth_std"])
            net_growth = rg - eg
            noi = noi * (1 + net_growth)

            # Vacancy shock
            if rng.random() < params["vacancy_shock_prob"]:
                noi = noi * (1 - params["vacancy_shock_magnitude"])

        # Exit valuation
        exit_cap = max(0.01, rng.gauss(params["cap_rate_mean"], params["cap_rate_std"]))
        exit_value = noi / exit_cap
        exit_equity = exit_value - loan_balance
        nav_outcomes.append(exit_equity)

        if contributions > 0:
            moic = (exit_equity) / contributions
            moics.append(moic)
            # IRR: contribution at t=0, exit equity at t=hold_years
            cf = [(0.0, -contributions), (float(params["hold_years"]), exit_equity)]
            irr = calculate_irr(cf)
            if irr is not None:
                irrs.append(irr)

        if exit_equity < 0:
            impairment_count += 1

    # Summary statistics
    mean_irr = sum(irrs) / len(irrs) if irrs else None
    median_irr = sorted(irrs)[len(irrs) // 2] if irrs else None
    std_irr = (sum((x - mean_irr) ** 2 for x in irrs) / len(irrs)) ** 0.5 if irrs and mean_irr else None

    expected_moic = sum(moics) / len(moics) if moics else None
    impairment_prob = impairment_count / n_sims

    # VaR 95% (5th percentile of NAV outcomes)
    sorted_nav = sorted(nav_outcomes)
    var_95_idx = max(0, int(n_sims * 0.05))
    var_95 = sorted_nav[var_95_idx] if sorted_nav else None

    # Promote trigger probability (assume 8% IRR hurdle)
    promote_trigger = len([i for i in irrs if i > 0.08]) / len(irrs) if irrs else None

    # Percentile buckets
    percentiles = {}
    if sorted_nav:
        for p in [5, 10, 25, 50, 75, 90, 95]:
            idx = min(int(n_sims * p / 100), len(sorted_nav) - 1)
            percentiles[f"p{p}"] = round(sorted_nav[idx], 2)

    # Store run
    run_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_monte_carlo_run (
                id, fin_asset_investment_id, quarter,
                n_sims, seed, distribution_params_json,
                valuation_snapshot_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                run_id, fin_asset_investment_id, quarter,
                n_sims, seed, json.dumps(params),
                snapshot_id,
            ),
        )
        mc_run = cur.fetchone()

    # Store result
    result_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_monte_carlo_result (
                id, re_monte_carlo_run_id,
                mean_irr, median_irr, std_irr,
                impairment_probability, var_95,
                expected_moic, promote_trigger_probability,
                percentile_buckets_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                result_id, run_id,
                round(mean_irr, 6) if mean_irr else None,
                round(median_irr, 6) if median_irr else None,
                round(std_irr, 6) if std_irr else None,
                round(impairment_prob, 6),
                round(var_95, 2) if var_95 is not None else None,
                round(expected_moic, 4) if expected_moic else None,
                round(promote_trigger, 6) if promote_trigger else None,
                json.dumps(percentiles),
            ),
        )
        mc_result = cur.fetchone()

    emit_log(
        level="info",
        service="re_monte_carlo",
        action="montecarlo.run",
        message=f"Monte Carlo complete: {n_sims} sims, seed={seed}",
        context={
            "run_id": run_id,
            "n_sims": n_sims,
            "seed": seed,
            "mean_irr": round(mean_irr, 4) if mean_irr else None,
            "impairment_prob": round(impairment_prob, 4),
        },
    )

    return {
        "run": mc_run,
        "result": mc_result,
    }


def get_result(run_id: str) -> dict:
    """Get Monte Carlo run + result."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT r.*, res.*
            FROM re_monte_carlo_run r
            JOIN re_monte_carlo_result res ON res.re_monte_carlo_run_id = r.id
            WHERE r.id = %s
            """,
            (run_id,),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"Monte Carlo run not found: {run_id}")
    return row
