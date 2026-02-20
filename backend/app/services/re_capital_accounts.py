"""Capital Account Service — wraps fin_capital_account, fin_capital_event, fin_capital_rollforward.

Maintains investor capital accounts and computes DPI/RVPI/TVPI per investor.
All writes go through fin_capital_event (append-only).
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from app.db import get_cursor
from app.services.re_math import _d

TWO_PLACES = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")


def get_investor_statement(
    investor_id: str, fund_id: str, quarter: str
) -> dict:
    """Get investor capital account statement for a fund quarter.

    Includes: contributions, distributions, DPI, RVPI, TVPI, NAV share.
    """
    with get_cursor() as cur:
        # Get commitment
        cur.execute(
            """
            SELECT committed_amount FROM fin_commitment
            WHERE fin_fund_id = %s AND fin_participant_id = %s
            LIMIT 1
            """,
            (fund_id, investor_id),
        )
        commitment = cur.fetchone()
        committed = _d(commitment["committed_amount"]) if commitment else Decimal(0)

        # Get capital events
        cur.execute(
            """
            SELECT event_type, SUM(amount) as total
            FROM fin_capital_event
            WHERE fin_entity_id = %s AND fin_participant_id = %s
            GROUP BY event_type
            """,
            (fund_id, investor_id),
        )
        events = cur.fetchall()

    contributions = Decimal(0)
    distributions = Decimal(0)
    for ev in events:
        if ev["event_type"] in ("contribution", "capital_call"):
            contributions += _d(ev["total"])
        elif ev["event_type"] in ("distribution", "return_of_capital"):
            distributions += _d(ev["total"])

    # Get NAV share from latest waterfall
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT investor_allocations_json FROM re_waterfall_snapshot
            WHERE fin_fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (fund_id, quarter),
        )
        ws = cur.fetchone()

    nav_share = Decimal(0)
    if ws and ws.get("investor_allocations_json"):
        import json
        allocs = ws["investor_allocations_json"]
        if isinstance(allocs, str):
            allocs = json.loads(allocs)
        for a in allocs:
            if a.get("fin_participant_id") == investor_id:
                nav_share = _d(a.get("allocation", 0))
                break

    # Performance metrics
    dpi = (distributions / contributions).quantize(FOUR_PLACES, ROUND_HALF_UP) if contributions > 0 else Decimal(0)
    rvpi = (nav_share / contributions).quantize(FOUR_PLACES, ROUND_HALF_UP) if contributions > 0 else Decimal(0)
    tvpi = dpi + rvpi

    return {
        "investor_id": investor_id,
        "fund_id": fund_id,
        "quarter": quarter,
        "committed": str(committed),
        "contributions": str(contributions),
        "distributions": str(distributions),
        "nav_share": str(nav_share),
        "dpi": str(dpi),
        "rvpi": str(rvpi),
        "tvpi": str(tvpi),
    }
