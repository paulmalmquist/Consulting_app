"""Risk Scoring Service — deterministic composite risk score.

Scores: market, execution, leverage, liquidity, refinance, concentration, volatility.
Weighted composite 1-100 with tunable parameters.
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal, ROUND_HALF_UP

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_math import _d

# Default weights (sum to 1.0)
DEFAULT_WEIGHTS = {
    "leverage": 0.25,
    "liquidity": 0.15,
    "refinance": 0.20,
    "volatility": 0.15,
    "market": 0.10,
    "execution": 0.10,
    "concentration": 0.05,
}


def _score_leverage(state: dict) -> int:
    """Score leverage risk from LTV and DSCR."""
    score = 50
    ltv = _d(state.get("ltv") or 0)
    dscr = _d(state.get("dscr") or 0)
    if ltv > Decimal("0.80"):
        score = 90
    elif ltv > Decimal("0.70"):
        score = 70
    elif ltv > Decimal("0.60"):
        score = 50
    else:
        score = 30
    if dscr > 0 and dscr < Decimal("1.10"):
        score = min(100, score + 20)
    elif dscr > 0 and dscr < Decimal("1.25"):
        score = min(100, score + 10)
    return score


def _score_refinance(state: dict) -> int:
    """Score refinance risk."""
    # Check if there's a refinance scenario
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT viability_score FROM re_refinance_scenario
            WHERE fin_asset_investment_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(state["fin_asset_investment_id"]), state["quarter"]),
        )
        refi = cur.fetchone()
    if refi:
        return 100 - (refi["viability_score"] or 50)
    return 50


def _score_volatility(state: dict) -> int:
    """Score from surveillance NOI volatility."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT noi_volatility FROM re_surveillance_snapshot
            WHERE fin_asset_investment_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(state["fin_asset_investment_id"]), state["quarter"]),
        )
        surv = cur.fetchone()
    if surv and surv.get("noi_volatility"):
        vol = float(surv["noi_volatility"])
        if vol > 500000:
            return 80
        elif vol > 200000:
            return 60
        elif vol > 50000:
            return 40
        return 20
    return 50


def compute(*, fin_asset_investment_id: str, quarter: str) -> dict:
    """Compute composite risk score for an asset quarter."""
    from app.services.re_valuation import get_asset_financial_state

    state = get_asset_financial_state(fin_asset_investment_id, quarter)

    leverage_score = _score_leverage(state)
    refinance_score = _score_refinance(state)
    volatility_score = _score_volatility(state)
    liquidity_score = 50  # placeholder — would need market data
    market_score = 50
    execution_score = 50
    concentration_score = 50

    scores = {
        "leverage": leverage_score,
        "liquidity": liquidity_score,
        "refinance": refinance_score,
        "volatility": volatility_score,
        "market": market_score,
        "execution": execution_score,
        "concentration": concentration_score,
    }

    composite = sum(
        scores[k] * DEFAULT_WEIGHTS[k] for k in DEFAULT_WEIGHTS
    )
    composite = max(1, min(100, round(composite)))

    # Store
    result_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_risk_score (
                id, fin_asset_investment_id, quarter,
                market_score, execution_score, leverage_score,
                liquidity_score, refinance_score, concentration_score,
                volatility_score, composite_score,
                weights_json, details_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                result_id, fin_asset_investment_id, quarter,
                market_score, execution_score, leverage_score,
                liquidity_score, refinance_score, concentration_score,
                volatility_score, composite,
                json.dumps(DEFAULT_WEIGHTS),
                json.dumps(scores),
            ),
        )
        result = cur.fetchone()

    emit_log(
        level="info",
        service="re_risk_scoring",
        action="risk_score.compute",
        message=f"Risk score: {composite}/100 for {fin_asset_investment_id} {quarter}",
        context={"composite_score": composite},
    )

    return result


def get_score(fin_asset_investment_id: str, quarter: str) -> dict:
    """Get risk score."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_risk_score
            WHERE fin_asset_investment_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (fin_asset_investment_id, quarter),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"No risk score for {fin_asset_investment_id} {quarter}")
    return row
