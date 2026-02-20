"""Refinance Service — simulates refinance scenarios for assets.

Determines max new loan by LTV and DSCR constraints.
Computes proceeds, cash-out, new DSCR, IRR impact, viability score.
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal, ROUND_HALF_UP

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_math import _d, calculate_dscr, calculate_ltv, generate_amortization_schedule

TWO_PLACES = Decimal("0.01")


def simulate(
    *,
    fin_asset_investment_id: str,
    quarter: str,
    new_rate: float,
    new_term_years: int = 10,
    new_amort_years: int = 30,
    max_ltv_constraint: float = 0.65,
    min_dscr_constraint: float = 1.25,
    prepayment_penalty_pct: float = 0,
    origination_fee_pct: float = 0.01,
) -> dict:
    """Simulate refinance for an asset and store results."""
    from app.services.re_valuation import get_asset_financial_state

    state = get_asset_financial_state(fin_asset_investment_id, quarter)

    noi = _d(state["net_operating_income"])
    current_balance = _d(state["loan_balance"] or 0)
    gross_value = _d(state["implied_gross_value"])

    rate = _d(new_rate)

    # Max loan by LTV constraint
    max_by_ltv = (gross_value * _d(max_ltv_constraint)).quantize(TWO_PLACES, ROUND_HALF_UP)

    # Max loan by DSCR constraint: NOI / min_dscr = max debt service
    # debt service = loan * (rate/12 * (1+rate/12)^n) / ((1+rate/12)^n - 1) * 12
    monthly_rate = rate / 12
    n_months = new_amort_years * 12
    if monthly_rate > 0 and n_months > 0:
        annuity_factor = (monthly_rate * (1 + monthly_rate) ** n_months) / ((1 + monthly_rate) ** n_months - 1)
        max_annual_ds = noi / _d(min_dscr_constraint)
        max_monthly_ds = max_annual_ds / 12
        max_by_dscr = (max_monthly_ds / annuity_factor).quantize(TWO_PLACES, ROUND_HALF_UP)
    else:
        max_by_dscr = max_by_ltv

    max_new_loan = min(max_by_ltv, max_by_dscr)

    # Costs
    prepayment = (current_balance * _d(prepayment_penalty_pct)).quantize(TWO_PLACES, ROUND_HALF_UP)
    origination = (max_new_loan * _d(origination_fee_pct)).quantize(TWO_PLACES, ROUND_HALF_UP)
    net_proceeds = max_new_loan - prepayment - origination
    cash_out = net_proceeds - current_balance

    # New metrics
    if monthly_rate > 0 and n_months > 0:
        new_monthly = max_new_loan * annuity_factor
        new_annual_ds = (new_monthly * 12).quantize(TWO_PLACES, ROUND_HALF_UP)
    else:
        new_annual_ds = Decimal(0)

    new_dscr = calculate_dscr(noi, new_annual_ds) if new_annual_ds > 0 else None
    new_ltv = calculate_ltv(max_new_loan, gross_value) if gross_value > 0 else None

    # Viability score (0-100)
    score = 100
    if new_dscr and new_dscr < _d(1.25):
        score -= 30
    if new_dscr and new_dscr < _d(1.0):
        score -= 40
    if new_ltv and new_ltv > _d(0.75):
        score -= 20
    if cash_out < 0:
        score -= 20
    score = max(0, min(100, score))

    # Store result
    result_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_refinance_scenario (
                id, fin_asset_investment_id, quarter,
                valuation_snapshot_id,
                new_rate, new_term_years, new_amort_years,
                max_ltv_constraint, min_dscr_constraint,
                prepayment_penalty_pct, origination_fee_pct,
                max_new_loan, net_proceeds, cash_out,
                new_dscr, new_ltv, new_debt_service,
                viability_score, details_json
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING *
            """,
            (
                result_id, fin_asset_investment_id, quarter,
                str(state["valuation_snapshot_id"]),
                new_rate, new_term_years, new_amort_years,
                max_ltv_constraint, min_dscr_constraint,
                prepayment_penalty_pct, origination_fee_pct,
                str(max_new_loan), str(net_proceeds), str(cash_out),
                str(new_dscr) if new_dscr else None,
                str(new_ltv) if new_ltv else None,
                str(new_annual_ds),
                score,
                json.dumps({
                    "max_by_ltv": str(max_by_ltv),
                    "max_by_dscr": str(max_by_dscr),
                    "prepayment_penalty": str(prepayment),
                    "origination_fee": str(origination),
                }),
            ),
        )
        result = cur.fetchone()

    emit_log(
        level="info",
        service="re_refinance",
        action="refinance.simulate",
        message=f"Refinance simulation for {fin_asset_investment_id} {quarter}",
        context={
            "viability_score": score,
            "max_new_loan": str(max_new_loan),
            "new_dscr": str(new_dscr),
        },
    )

    return result
