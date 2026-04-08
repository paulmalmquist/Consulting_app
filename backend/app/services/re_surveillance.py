"""CMBS-style Surveillance Service — Trepp-like quarterly monitoring.

Computes DSCR/debt yield/NOI/occupancy trends, refinance gap, balloon risk,
and threshold-based flags with LOW/MODERATE/HIGH classification.

Canonical source: re_asset_quarter_state (schema 270).
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


def _get_asset_state(asset_id: str, quarter: str) -> dict:
    """Get latest canonical asset state from re_asset_quarter_state."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_asset_quarter_state
            WHERE asset_id = %s AND quarter = %s AND scenario_id IS NULL
            ORDER BY created_at DESC LIMIT 1
            """,
            (asset_id, quarter),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"No asset quarter state for {asset_id} quarter {quarter}")
    return row


def compute(*, asset_id: str, quarter: str,
            fin_asset_investment_id: str | None = None) -> dict:
    """Compute surveillance snapshot for an asset quarter.

    Uses re_asset_quarter_state as canonical source.
    Accepts asset_id (canonical) or fin_asset_investment_id (legacy compat).
    """
    state = _get_asset_state(asset_id, quarter)

    # Get historical states for trends (last 8 quarters)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (quarter)
                quarter, dscr, debt_yield, noi,
                asset_value, debt_balance, ltv
            FROM re_asset_quarter_state
            WHERE asset_id = %s AND scenario_id IS NULL
            ORDER BY quarter DESC, created_at DESC
            LIMIT 8
            """,
            (asset_id,),
        )
        history = cur.fetchall()

    # Build trends
    dscr_trend = [{"quarter": h["quarter"], "value": str(h["dscr"])} for h in history if h.get("dscr")]
    dy_trend = [{"quarter": h["quarter"], "value": str(h["debt_yield"])} for h in history if h.get("debt_yield")]

    # NOI volatility (std dev of NOI changes)
    noi_values = [_d(h["noi"]) for h in history if h.get("noi")]
    noi_volatility = Decimal(0)
    if len(noi_values) >= 2:
        changes = [noi_values[i] - noi_values[i + 1] for i in range(len(noi_values) - 1)]
        mean_change = sum(changes) / len(changes)
        variance = sum((c - mean_change) ** 2 for c in changes) / len(changes)
        noi_volatility = variance.sqrt() if hasattr(variance, 'sqrt') else Decimal(str(float(variance) ** 0.5))

    # Occupancy trend (from canonical asset state)
    occ_trend = [{"quarter": h["quarter"], "value": str(h.get("occupancy") or h.get("occupancy_pct"))}
                 for h in history if h.get("occupancy") or h.get("occupancy_pct")]
    # If no occupancy in history, try dedicated occupancy records
    if not occ_trend:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT quarter, occupancy FROM re_asset_quarter_state
                WHERE asset_id = %s AND scenario_id IS NULL AND occupancy IS NOT NULL
                ORDER BY quarter DESC LIMIT 8
                """,
                (asset_id,),
            )
            occ_history = cur.fetchall()
        occ_trend = [{"quarter": h["quarter"], "value": str(h["occupancy"])} for h in occ_history]

    # Refinance gap at maturity — look up loans via asset_id
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT maturity_date, COALESCE(current_balance, upb) AS current_balance
            FROM re_loan_detail WHERE asset_id = %s
            UNION ALL
            SELECT maturity_date, COALESCE(current_balance, upb) AS current_balance
            FROM re_loan WHERE asset_id = %s
            """,
            (asset_id, asset_id),
        )
        loans = cur.fetchall()

    refinance_gap = Decimal(0)
    asset_value = _d(state.get("asset_value") or 0)
    for loan in loans:
        # Gap = current balance - (value * 0.65)  (assuming 65% refi LTV)
        max_refi = asset_value * Decimal("0.65")
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
    current_occ = _d(state.get("occupancy") or 0)
    if current_occ > 0 and current_occ < THRESHOLDS["occupancy_warning"]:
        flags.append(f"Occupancy {current_occ} below {THRESHOLDS['occupancy_warning']} threshold")

    # Classification
    if len(flags) >= 3 or (current_dscr > 0 and current_dscr < Decimal("1.0")):
        risk_class = "HIGH"
    elif len(flags) >= 1:
        risk_class = "MODERATE"
    else:
        risk_class = "LOW"

    reason_codes = flags

    # Store snapshot — write asset_id into fin_asset_investment_id column for compat
    snapshot_id = str(uuid.uuid4())
    valuation_snapshot_id = str(state.get("run_id") or uuid.uuid4())
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
                snapshot_id, asset_id, quarter,
                valuation_snapshot_id,
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
        message=f"Surveillance computed for asset {asset_id} {quarter}: {risk_class}",
        context={
            "asset_id": asset_id,
            "quarter": quarter,
            "risk_classification": risk_class,
            "flag_count": len(flags),
        },
    )

    return result


def get_snapshot(asset_id: str, quarter: str) -> dict:
    """Get surveillance snapshot by asset_id."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_surveillance_snapshot
            WHERE fin_asset_investment_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (asset_id, quarter),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"No surveillance snapshot for asset {asset_id} {quarter}")
    return row
