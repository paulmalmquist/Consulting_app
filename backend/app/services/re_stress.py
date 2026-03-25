"""Stress Test Engine — runs cap rate, NOI, and rate shock scenarios.

Each scenario stores delta vs base NAV for the asset.
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_math import (
    _d,
    calculate_dscr,
    calculate_debt_yield,
    calculate_ltv,
    calculate_value_direct_cap,
)

TWO_PLACES = Decimal("0.01")

# Default stress scenarios
DEFAULT_SCENARIOS = [
    {"name": "Cap +25bps", "parameters_json": {"cap_rate_delta_bps": 25}},
    {"name": "Cap +50bps", "parameters_json": {"cap_rate_delta_bps": 50}},
    {"name": "Cap +100bps", "parameters_json": {"cap_rate_delta_bps": 100}},
    {"name": "NOI -5%", "parameters_json": {"noi_shock_pct": -0.05}},
    {"name": "NOI -10%", "parameters_json": {"noi_shock_pct": -0.10}},
    {"name": "NOI -20%", "parameters_json": {"noi_shock_pct": -0.20}},
    {"name": "Rate +100bps", "parameters_json": {"rate_shock_bps": 100}},
]


def run(
    *,
    fin_asset_investment_id: str,
    quarter: str,
    scenarios: list[dict] | None = None,
) -> list[dict]:
    """Run stress scenarios for an asset quarter."""
    from app.services.re_valuation import get_asset_financial_state

    state = get_asset_financial_state(fin_asset_investment_id, quarter)

    base_noi = _d(state["forward_12_noi"] or state["net_operating_income"])
    base_nav = _d(state["nav_equity"])
    loan_balance = _d(state["loan_balance"] or 0)
    debt_service = _d(state["debt_service"] or 0)
    cap_rate = _d(state.get("interest_rate") or "0.055")  # fallback
    snapshot_id = str(state["valuation_snapshot_id"])

    # Get base cap rate from the valuation snapshot assumptions
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT a.cap_rate FROM re_valuation_assumption_set a
            JOIN re_valuation_snapshot v ON v.assumption_set_id = a.assumption_set_id
            WHERE v.valuation_snapshot_id = %s
            """,
            (snapshot_id,),
        )
        assumption = cur.fetchone()
        if assumption:
            cap_rate = _d(assumption["cap_rate"])

    scenarios = scenarios or DEFAULT_SCENARIOS
    results = []

    for scenario in scenarios:
        params = scenario.get("parameters_json", scenario)
        name = scenario.get("name", json.dumps(params))

        stressed_noi = base_noi
        stressed_cap = cap_rate
        stressed_ds = debt_service

        # Apply shocks
        if "cap_rate_delta_bps" in params:
            stressed_cap = cap_rate + _d(params["cap_rate_delta_bps"]) / Decimal(10000)
        if "noi_shock_pct" in params:
            stressed_noi = base_noi * (1 + _d(params["noi_shock_pct"]))
        if "rate_shock_bps" in params:
            # Approximate: increase debt service proportionally
            rate_delta = _d(params["rate_shock_bps"]) / Decimal(10000)
            if loan_balance > 0:
                stressed_ds = debt_service + loan_balance * rate_delta

        # Recompute
        stressed_value = calculate_value_direct_cap(stressed_noi, stressed_cap) if stressed_cap > 0 else Decimal(0)
        stressed_equity = stressed_value - loan_balance
        stressed_nav = stressed_equity
        delta = stressed_nav - base_nav
        stressed_dscr = calculate_dscr(stressed_noi, stressed_ds) if stressed_ds > 0 else None
        stressed_ltv = calculate_ltv(loan_balance, stressed_value) if stressed_value > 0 else None
        stressed_dy = calculate_debt_yield(stressed_noi, loan_balance) if loan_balance > 0 else None

        # Ensure or create scenario record
        scenario_id = str(uuid.uuid4())
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO re_stress_scenario (id, name, parameters_json)
                VALUES (%s, %s, %s) RETURNING id
                """,
                (scenario_id, name, json.dumps(params)),
            )
            cur.fetchone()

            result_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO re_stress_result (
                    id, fin_asset_investment_id, quarter,
                    re_stress_scenario_id, valuation_snapshot_id,
                    base_nav, stressed_nav, delta_nav,
                    stressed_dscr, stressed_ltv, stressed_debt_yield,
                    details_json
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    result_id, fin_asset_investment_id, quarter,
                    scenario_id, snapshot_id,
                    str(base_nav), str(stressed_nav), str(delta),
                    str(stressed_dscr) if stressed_dscr else None,
                    str(stressed_ltv) if stressed_ltv else None,
                    str(stressed_dy) if stressed_dy else None,
                    json.dumps({"name": name, "params": params}),
                ),
            )
            result = cur.fetchone()
            results.append(result)

    emit_log(
        level="info",
        service="re_stress",
        action="stress.run",
        message=f"Stress tests complete for {fin_asset_investment_id} {quarter}",
        context={
            "fin_asset_investment_id": fin_asset_investment_id,
            "quarter": quarter,
            "scenario_count": len(results),
        },
    )

    return results
