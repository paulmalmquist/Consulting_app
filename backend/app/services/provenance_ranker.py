"""Rank evidence sources by provenance strength.

When multiple evidence records point at the same billing event (e.g. an Apple
IAP confirmation + a bank-statement card-charge line), the stronger one is
picked as primary and the others linked as corroboration — one occurrence,
many evidence ids.
"""
from __future__ import annotations

from typing import Any


_SOURCE_RANK = {
    "api_invoice": 100,       # direct provider invoice — strongest
    "provider_webhook": 90,
    "receipt": 75,
    "apple_iap": 60,          # Apple receipt email — known product but intermediary
    "card_charge": 40,        # bank statement line — amount/date only
}


def rank(evidence_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        evidence_records,
        key=lambda r: _SOURCE_RANK.get(r.get("source", ""), 0),
        reverse=True,
    )


def pick_primary(evidence_records: list[dict[str, Any]]) -> dict[str, Any] | None:
    ranked = rank(evidence_records)
    return ranked[0] if ranked else None


def provenance_score(source: str) -> int:
    return _SOURCE_RANK.get(source, 0)
