"""CMBS-style Surveillance Service — Trepp-like quarterly monitoring.

Computes DSCR/debt yield/NOI/occupancy trends, refinance gap, balloon risk,
and threshold-based flags with LOW/MODERATE/HIGH classification.
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal, ROUND_HALF_UP

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_math import _d

TWO_PLACES = Decimal("0.01")

# Threshold configuration
THRESHOLDS = {
    "dscr_warning": Decimal("1.15"),
    "ltv_warning": Decimal("0.75"),
    "noi_decline_warning": Decimal("-0.10"),
    "occupancy_warning": Decimal("0.85"),
}


def compute(*, fin_asset_investment_id: str, quarter: str) -> dict:
    """Compute surveillance snapshot for an asset quarter."""
    from app.services.re_valuation import get_asset_financial_state

    state = get_asset_financial_state(fin_asset_investment_id, quarter)

    # Get historical states for trends (last 4 quarters)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (quarter)
                quarter, dscr, debt_yield, net_operating_income,
                implied_gross_value, loan_balance, ltv
            FROM re_asset_financial_state
            WHERE fin_asset_investment_id = %s
            ORDER BY quarter DESC, created_at DESC
            LIMIT 8
            """,
            (fin_asset_investment_id,),
        )
        history = cur.fetchall()

    # Build trends
    dscr_trend = [{"quarter": h["quarter"], "value": str(h["dscr"])} for h in history if h.get("dscr")]
    dy_trend = [{"quarter": h["quarter"], "value": str(h["debt_yield"])} for h in history if h.get("debt_yield")]

    # NOI volatility (std dev of NOI changes)
    noi_values = [_d(h["net_operating_income"]) for h in history if h.get("net_operating_income")]
    noi_volatility = Decimal(0)
    if len(noi_values) >= 2:
        changes = [noi_values[i] - noi_values[i + 1] for i in range(len(noi_values) - 1)]
        mean_change = sum(changes) / len(changes)
        variance = sum((c - mean_change) ** 2 for c in changes) / len(changes)
        noi_volatility = variance.sqrt() if hasattr(variance, 'sqrt') else Decimal(str(float(variance) ** 0.5))

    # Occupancy trend (from quarterly financials)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT quarter, occupancy_pct FROM re_asset_quarterly_financials
            WHERE fin_asset_investment_id = %s
            ORDER BY quarter DESC LIMIT 8
            """,
            (fin_asset_investment_id,),
        )
        occ_history = cur.fetchall()
    occ_trend = [{"quarter": h["quarter"], "value": str(h["occupancy_pct"])} for h in occ_history if h.get("occupancy_pct")]

    # Refinance gap at maturity
    with get_cursor() as cur:
        cur.execute(
            "SELECT maturity_date, current_balance FROM re_loan WHERE fin_asset_investment_id = %s",
            (fin_asset_investment_id,),
        )
        loans = cur.fetchall()

    refinance_gap = Decimal(0)
    for loan in loans:
        # Gap = current balance - (value * 0.65)  (assuming 65% refi LTV)
        max_refi = _d(state["implied_gross_value"]) * Decimal("0.65")
        gap = _d(loan["current_balance"]) - max_refi
        refinance_gap += max(gap, Decimal(0))

    # Balloon risk score (0-100)
    balloon_score = 0
    for loan in loans:
        if loan.get("maturity_date"):
            # Simple: closer maturity = higher risk
            balloon_score = min(100, balloon_score + 30)  # placeholder
        if refinance_gap > 0:
            balloon_score = min(100, balloon_score + 40)

    # Threshold flags
    flags = []
    current_dscr = _d(state.get("dscr") or 0)
    current_ltv = _d(state.get("ltv") or 0)

    if current_dscr > 0 and current_dscr < THRESHOLDS["dscr_warning"]:
        flags.append(f"DSCR {current_dscr} below {THRESHOLDS['dscr_warning']}x threshold")
    if current_ltv > THRESHOLDS["ltv_warning"]:
        flags.append(f"LTV {current_ltv} above {THRESHOLDS['ltv_warning']} threshold")

    # NOI decline check
    if len(noi_values) >= 2:
        noi_change = (noi_values[0] - noi_values[1]) / noi_values[1] if noi_values[1] != 0 else Decimal(0)
        if noi_change < THRESHOLDS["noi_decline_warning"]:
            flags.append(f"NOI declined {noi_change:.1%} vs prior quarter")

    # Occupancy check
    if occ_history and occ_history[0].get("occupancy_pct"):
        occ = _d(occ_history[0]["occupancy_pct"])
        if occ < THRESHOLDS["occupancy_warning"]:
            flags.append(f"Occupancy {occ} below {THRESHOLDS['occupancy_warning']} threshold")

    # Classification
    if len(flags) >= 3 or (current_dscr > 0 and current_dscr < Decimal("1.0")):
        risk_class = "HIGH"
    elif len(flags) >= 1:
        risk_class = "MODERATE"
    else:
        risk_class = "LOW"

    reason_codes = flags

    # Store snapshot
    snapshot_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_surveillance_snapshot (
                id, fin_asset_investment_id, quarter, valuation_snapshot_id,
                dscr_trend, debt_yield_trend, noi_volatility, occupancy_trend,
                refinance_gap, balloon_risk_score,
                risk_classification, reason_codes, flags_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                snapshot_id, fin_asset_investment_id, quarter,
                str(state["valuation_snapshot_id"]),
                json.dumps(dscr_trend), json.dumps(dy_trend),
                str(noi_volatility.quantize(Decimal("0.000001"), ROUND_HALF_UP)),
                json.dumps(occ_trend),
                str(refinance_gap), balloon_score,
                risk_class, reason_codes,
                json.dumps({"thresholds": {k: str(v) for k, v in THRESHOLDS.items()}}),
            ),
        )
        result = cur.fetchone()

    emit_log(
        level="info",
        service="re_surveillance",
        action="surveillance.compute",
        message=f"Surveillance computed for {fin_asset_investment_id} {quarter}: {risk_class}",
        context={
            "fin_asset_investment_id": fin_asset_investment_id,
            "quarter": quarter,
            "risk_classification": risk_class,
            "flag_count": len(flags),
        },
    )

    return result


def get_snapshot(fin_asset_investment_id: str, quarter: str) -> dict:
    """Get surveillance snapshot."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_surveillance_snapshot
            WHERE fin_asset_investment_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (fin_asset_investment_id, quarter),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"No surveillance snapshot for {fin_asset_investment_id} {quarter}")
    return row
