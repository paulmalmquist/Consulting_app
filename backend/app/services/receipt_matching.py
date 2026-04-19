"""Receipt → bank/CC transaction matching.

Transaction source is still forward-compatible in Phase 1 (there's no
imported-transactions table yet in Novendor); when no candidates exist the
matcher writes a single 'unmatched' row so the review queue picks it up.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from psycopg.types.json import Json

from app.db import get_cursor


@dataclass(frozen=True)
class Candidate:
    transaction_id: str
    amount: Decimal
    transaction_date: date
    merchant: str | None


def _has_transactions_table(cur) -> bool:
    cur.execute(
        """
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'nv_bank_transaction'
         LIMIT 1
        """,
    )
    return cur.fetchone() is not None


def _load_candidates(cur, env_id: str, business_id: str, parsed_date: date | None) -> list[Candidate]:
    if not parsed_date:
        return []
    if not _has_transactions_table(cur):
        return []
    lo = parsed_date - timedelta(days=7)
    hi = parsed_date + timedelta(days=7)
    cur.execute(
        """
        SELECT id, amount_cents, posted_at, description
          FROM nv_bank_transaction
         WHERE env_id = %s AND business_id = %s::uuid
           AND parent_txn_id IS NULL
           AND posted_at::date BETWEEN %s AND %s
         LIMIT 50
        """,
        (env_id, business_id, lo, hi),
    )
    return [
        Candidate(
            transaction_id=str(r["id"]),
            amount=(Decimal(r["amount_cents"]) / Decimal(100)).copy_abs(),
            transaction_date=r["posted_at"].date() if r.get("posted_at") else None,
            merchant=r.get("description"),
        )
        for r in cur.fetchall()
    ]


def _score_candidate(
    candidate: Candidate,
    *,
    parsed_total: Decimal | None,
    parsed_date: date | None,
    merchant_text: str | None,
) -> tuple[float, dict[str, Any]]:
    reason: dict[str, Any] = {}
    amount_score = 0.0
    if parsed_total is not None and candidate.amount is not None:
        delta = abs(candidate.amount - parsed_total)
        denom = max(abs(parsed_total), Decimal("0.01"))
        pct = float(delta / denom)
        amount_score = max(0.0, 1.0 - min(pct, 1.0))
        reason["amount_delta"] = float(delta)
        reason["amount_pct_delta"] = pct

    date_score = 0.0
    if parsed_date and candidate.transaction_date:
        days = abs((candidate.transaction_date - parsed_date).days)
        date_score = max(0.0, 1.0 - days / 7.0)
        reason["date_delta_days"] = days

    merchant_score = 0.0
    if merchant_text and candidate.merchant:
        a = merchant_text.lower()
        b = candidate.merchant.lower()
        if a == b or a in b or b in a:
            merchant_score = 1.0
            reason["merchant_match"] = "substring"
        else:
            # tiny set overlap
            a_tokens = set(a.split())
            b_tokens = set(b.split())
            overlap = len(a_tokens & b_tokens)
            if overlap:
                merchant_score = min(1.0, overlap / max(len(a_tokens), 1))
                reason["merchant_match"] = "token-overlap"

    score = (amount_score * 0.55) + (date_score * 0.25) + (merchant_score * 0.20)
    return score, reason


def match_to_transactions(
    *,
    env_id: str,
    business_id: str,
    intake_id: str,
    parsed,  # ExtractedReceipt
) -> list[str]:
    """Write match candidate rows. Returns list of written candidate_ids."""
    written: list[str] = []
    with get_cursor() as cur:
        candidates = _load_candidates(cur, env_id, business_id, parsed.transaction_date)
        if not candidates:
            cur.execute(
                """
                INSERT INTO nv_receipt_match_candidate
                  (env_id, business_id, intake_id, transaction_id, match_score,
                   match_reason, match_status)
                VALUES (%s, %s::uuid, %s::uuid, NULL, 0,
                        %s, 'unmatched')
                RETURNING id
                """,
                (env_id, business_id, intake_id,
                 Json({"reason": "no-transactions-available"})),
            )
            written.append(str(cur.fetchone()["id"]))
            return written

        scored: list[tuple[Candidate, float, dict[str, Any]]] = []
        merchant = parsed.vendor_normalized or parsed.merchant_raw
        for cand in candidates:
            score, reason = _score_candidate(
                cand,
                parsed_total=parsed.total,
                parsed_date=parsed.transaction_date,
                merchant_text=merchant,
            )
            scored.append((cand, score, reason))

        scored.sort(key=lambda x: x[1], reverse=True)
        for cand, score, reason in scored[:3]:
            cur.execute(
                """
                INSERT INTO nv_receipt_match_candidate
                  (env_id, business_id, intake_id, transaction_id,
                   match_score, match_reason, match_status)
                VALUES (%s, %s::uuid, %s::uuid, %s::uuid, %s, %s, 'suggested')
                RETURNING id
                """,
                (env_id, business_id, intake_id, cand.transaction_id,
                 round(score, 4), Json(reason)),
            )
            written.append(str(cur.fetchone()["id"]))
    return written
