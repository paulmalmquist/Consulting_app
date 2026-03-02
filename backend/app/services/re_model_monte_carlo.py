"""Model-level Monte Carlo: runs seeded simulations across all in-scope assets,
rolls up to fund level, and stores per-entity + fund-level results.

Extends the existing single-asset MC pattern from re_monte_carlo.py to
support multi-asset fund-level aggregation with optional waterfall.
"""

from __future__ import annotations

import json
import random
import uuid
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import re_model
from app.services.re_math import calculate_irr


def start_run(
    *,
    model_id: UUID,
    quarter: str,
    n_sims: int = 1000,
    seed: int = 42,
    distribution_params: dict | None = None,
) -> dict:
    """Create a MC run record and execute the simulation.

    For n_sims <= 1000, runs synchronously. For larger runs,
    this should be dispatched to a background task.
    """
    model = re_model.get_model(model_id=model_id)
    fund_id = UUID(str(model["fund_id"]))

    params = _default_params()
    if distribution_params:
        params.update(distribution_params)

    # Create run record
    run_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_model_mc_run (
                id, model_id, fund_id, quarter,
                n_sims, seed, distribution_params_json,
                status, started_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'running', now())
            RETURNING *
            """,
            (run_id, str(model_id), str(fund_id), quarter,
             n_sims, seed, json.dumps(params)),
        )
        mc_run = cur.fetchone()

    try:
        _execute_mc(
            run_id=run_id,
            model_id=model_id,
            fund_id=fund_id,
            quarter=quarter,
            n_sims=n_sims,
            seed=seed,
            params=params,
        )

        with get_cursor() as cur:
            cur.execute(
                "UPDATE re_model_mc_run SET status = 'success', completed_at = now() WHERE id = %s RETURNING *",
                (run_id,),
            )
            mc_run = cur.fetchone()

        emit_log(
            level="info",
            service="re_model_monte_carlo",
            action="mc.completed",
            message=f"Model MC completed: {n_sims} sims, seed={seed}",
            context={"run_id": run_id, "model_id": str(model_id)},
        )

    except Exception as exc:
        with get_cursor() as cur:
            cur.execute(
                "UPDATE re_model_mc_run SET status = 'failed', error_message = %s, completed_at = now() WHERE id = %s",
                (str(exc), run_id),
            )
        raise

    return mc_run


def get_run(*, run_id: UUID) -> dict:
    """Get MC run + all results."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM re_model_mc_run WHERE id = %s", (str(run_id),))
        run = cur.fetchone()
        if not run:
            raise LookupError(f"MC run {run_id} not found")

        cur.execute(
            "SELECT * FROM re_model_mc_result WHERE mc_run_id = %s ORDER BY result_level, entity_id",
            (str(run_id),),
        )
        results = cur.fetchall()

    return {"run": run, "results": results}


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


def _execute_mc(
    *,
    run_id: str,
    model_id: UUID,
    fund_id: UUID,
    quarter: str,
    n_sims: int,
    seed: int,
    params: dict,
) -> None:
    """Run Monte Carlo simulation across all scoped assets."""
    # Get scoped assets with their financial state
    scoped_assets = _load_scoped_assets(model_id, fund_id, quarter)

    if not scoped_assets:
        # No assets in scope — store empty fund result
        _store_result(
            run_id=run_id,
            result_level="fund",
            entity_id=str(fund_id),
            irrs=[],
            moics=[],
            nav_outcomes=[],
            n_sims=n_sims,
        )
        return

    rng = random.Random(seed)

    # Per-asset results accumulators
    asset_irrs: dict[str, list[float]] = {a["asset_id"]: [] for a in scoped_assets}
    asset_moics: dict[str, list[float]] = {a["asset_id"]: [] for a in scoped_assets}
    asset_navs: dict[str, list[float]] = {a["asset_id"]: [] for a in scoped_assets}

    # Fund-level accumulators
    fund_irrs: list[float] = []
    fund_moics: list[float] = []
    fund_navs: list[float] = []

    total_contributions = sum(a["contributions"] for a in scoped_assets)

    for _ in range(n_sims):
        sim_total_equity = 0.0

        for asset in scoped_assets:
            noi = asset["base_noi"]
            loan_balance = asset["loan_balance"]
            contributions = asset["contributions"]

            # Simulate forward
            for _year in range(1, params["hold_years"] + 1):
                rg = rng.gauss(params["rent_growth_mean"], params["rent_growth_std"])
                eg = rng.gauss(params["expense_growth_mean"], params["expense_growth_std"])
                noi = noi * (1 + rg - eg)

                if rng.random() < params["vacancy_shock_prob"]:
                    noi = noi * (1 - params["vacancy_shock_magnitude"])

            exit_cap = max(0.01, rng.gauss(params["cap_rate_mean"], params["cap_rate_std"]))
            exit_value = noi / exit_cap
            exit_equity = exit_value - loan_balance

            asset_navs[asset["asset_id"]].append(exit_equity)
            sim_total_equity += exit_equity

            if contributions > 0:
                moic = exit_equity / contributions
                asset_moics[asset["asset_id"]].append(moic)
                cf = [(0.0, -contributions), (float(params["hold_years"]), exit_equity)]
                irr = calculate_irr(cf)
                if irr is not None:
                    asset_irrs[asset["asset_id"]].append(irr)

        # Fund-level metrics for this simulation
        fund_navs.append(sim_total_equity)
        if total_contributions > 0:
            fund_moics.append(sim_total_equity / total_contributions)
            cf = [(0.0, -total_contributions), (float(params["hold_years"]), sim_total_equity)]
            irr = calculate_irr(cf)
            if irr is not None:
                fund_irrs.append(irr)

    # Store per-asset results
    for asset in scoped_assets:
        aid = asset["asset_id"]
        _store_result(
            run_id=run_id,
            result_level="asset",
            entity_id=aid,
            irrs=asset_irrs[aid],
            moics=asset_moics[aid],
            nav_outcomes=asset_navs[aid],
            n_sims=n_sims,
        )

    # Store fund-level results
    _store_result(
        run_id=run_id,
        result_level="fund",
        entity_id=str(fund_id),
        irrs=fund_irrs,
        moics=fund_moics,
        nav_outcomes=fund_navs,
        n_sims=n_sims,
    )


def _load_scoped_assets(
    model_id: UUID,
    fund_id: UUID,
    quarter: str,
) -> list[dict]:
    """Load financial state for all scoped assets."""
    scoped_ids = re_model.get_scoped_asset_ids(model_id=model_id)

    if not scoped_ids:
        # If no explicit scope, use ALL assets in the fund
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT a.asset_id
                FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                WHERE d.fund_id = %s
                """,
                (str(fund_id),),
            )
            scoped_ids = [str(r["asset_id"]) for r in cur.fetchall()]

    assets = []
    for asset_id in scoped_ids:
        state = _get_asset_state(asset_id, quarter)
        if state:
            assets.append(state)

    return assets


def _get_asset_state(asset_id: str, quarter: str) -> dict | None:
    """Get latest financial state for an asset."""
    with get_cursor() as cur:
        # Try operating data first
        cur.execute(
            """
            SELECT revenue, opex, occupancy, debt_service, cash_balance
            FROM re_asset_operating_qtr
            WHERE asset_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (asset_id, quarter),
        )
        op = cur.fetchone()

        # Get loan info
        cur.execute(
            """
            SELECT current_balance, coupon
            FROM re_loan_detail
            WHERE asset_id = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (asset_id,),
        )
        loan = cur.fetchone()

        # Get cost basis
        cur.execute(
            "SELECT cost_basis FROM repe_asset WHERE asset_id = %s",
            (asset_id,),
        )
        asset_row = cur.fetchone()

    revenue = float(op["revenue"] or 0) if op else 0.0
    opex = float(op["opex"] or 0) if op else 0.0
    base_noi = revenue - opex if revenue > 0 else 0.0
    loan_balance = float(loan["current_balance"] or 0) if loan else 0.0
    contributions = float(asset_row["cost_basis"] or 0) if asset_row else 0.0

    if base_noi <= 0 and contributions <= 0:
        return None

    return {
        "asset_id": asset_id,
        "base_noi": base_noi,
        "loan_balance": loan_balance,
        "contributions": contributions,
    }


def _store_result(
    *,
    run_id: str,
    result_level: str,
    entity_id: str,
    irrs: list[float],
    moics: list[float],
    nav_outcomes: list[float],
    n_sims: int,
) -> None:
    """Compute summary statistics and store as a result row."""
    mean_irr = sum(irrs) / len(irrs) if irrs else None
    median_irr = sorted(irrs)[len(irrs) // 2] if irrs else None
    std_irr = (
        (sum((x - mean_irr) ** 2 for x in irrs) / len(irrs)) ** 0.5
        if irrs and mean_irr is not None
        else None
    )
    expected_moic = sum(moics) / len(moics) if moics else None
    impairment_count = sum(1 for n in nav_outcomes if n < 0)
    impairment_prob = impairment_count / n_sims if n_sims > 0 else 0.0

    sorted_nav = sorted(nav_outcomes)
    var_95_idx = max(0, int(n_sims * 0.05))
    var_95 = sorted_nav[var_95_idx] if sorted_nav else None

    promote_trigger = (
        len([i for i in irrs if i > 0.08]) / len(irrs) if irrs else None
    )

    percentiles = {}
    if sorted_nav:
        for p in [5, 10, 25, 50, 75, 90, 95]:
            idx = min(int(n_sims * p / 100), len(sorted_nav) - 1)
            percentiles[f"p{p}"] = round(sorted_nav[idx], 2)

    result_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_model_mc_result (
                id, mc_run_id, result_level, entity_id,
                mean_irr, median_irr, std_irr,
                impairment_probability, var_95,
                expected_moic, promote_trigger_probability,
                percentile_buckets_json
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                result_id,
                run_id,
                result_level,
                entity_id,
                round(mean_irr, 6) if mean_irr is not None else None,
                round(median_irr, 6) if median_irr is not None else None,
                round(std_irr, 6) if std_irr is not None else None,
                round(impairment_prob, 6),
                round(var_95, 2) if var_95 is not None else None,
                round(expected_moic, 4) if expected_moic is not None else None,
                round(promote_trigger, 6) if promote_trigger is not None else None,
                json.dumps(percentiles),
            ),
        )
