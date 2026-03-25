"""Capital account service helpers for waterfall what-if analysis."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.capital_account_engine import compute_rollforward
from app.services.re_waterfall_runtime import run_waterfall


def _quarter_end(quarter: str) -> date:
    year = int(quarter[:4])
    q = int(quarter[-1])
    month = q * 3
    if month == 3:
        return date(year, 3, 31)
    if month == 6:
        return date(year, 6, 30)
    if month == 9:
        return date(year, 9, 30)
    return date(year, 12, 31)


def load_capital_events(*, fund_id: UUID, quarter: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                entry_id::text AS fin_capital_event_id,
                fund_id::text AS fin_entity_id,
                partner_id::text AS fin_participant_id,
                effective_date AS event_date,
                entry_type AS event_type,
                amount_base AS amount
            FROM re_capital_ledger_entry
            WHERE fund_id = %s AND quarter <= %s
            ORDER BY effective_date, created_at
            """,
            (str(fund_id), quarter),
        )
        return cur.fetchall()


def rollforward_with_injection(
    *,
    fund_id: UUID,
    quarter: str,
    additional_call_amount: Decimal,
) -> dict:
    events = load_capital_events(fund_id=fund_id, quarter=quarter)
    as_of_date = _quarter_end(quarter)

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.partner_id::text AS partner_id,
                   p.name,
                   p.partner_type,
                   pc.committed_amount
            FROM re_partner p
            JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
            WHERE pc.fund_id = %s
              AND p.partner_type IN ('lp', 'co_invest')
            ORDER BY p.name
            """,
            (str(fund_id),),
        )
        partners = cur.fetchall()

    total_commitment = sum(Decimal(str(row.get("committed_amount") or 0)) for row in partners) or Decimal("0")
    if total_commitment <= 0:
        raise ValueError(f"No LP commitments found for fund {fund_id}")

    before = compute_rollforward(events, as_of_date)
    synthetic_events = list(events)
    participant_adjustments: dict[str, dict] = {}
    for idx, partner in enumerate(partners):
        commitment = Decimal(str(partner.get("committed_amount") or 0))
        share = commitment / total_commitment if total_commitment else Decimal("0")
        amount = (additional_call_amount * share).quantize(Decimal("0.01"))
        synthetic_events.append({
            "fin_capital_event_id": f"synthetic_{idx}",
            "fin_entity_id": str(fund_id),
            "fin_participant_id": partner["partner_id"],
            "event_date": as_of_date.isoformat(),
            "event_type": "capital_call",
            "amount": amount,
        })
        participant_adjustments[partner["partner_id"]] = {"additional_contribution": amount}

    after = compute_rollforward(synthetic_events, as_of_date)
    base_waterfall = run_waterfall(fund_id=fund_id, quarter=quarter)
    injected_waterfall = run_waterfall(
        fund_id=fund_id,
        quarter=quarter,
        run_type="what_if_capital_call",
        participant_adjustments=participant_adjustments,
    )
    return {
        "before_rollforward": before,
        "after_rollforward": after,
        "base_waterfall": base_waterfall,
        "injected_waterfall": injected_waterfall,
        "additional_call_amount": additional_call_amount,
    }
