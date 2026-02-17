"""Trust accounting controls and deterministic balances."""

from __future__ import annotations

from decimal import Decimal

from .utils import qmoney


def compute_trust_balance(transactions: list[dict]) -> Decimal:
    balance = Decimal("0")
    for row in transactions:
        amount = qmoney(row.get("amount", 0))
        direction = str(row.get("direction", "")).lower()
        if direction == "credit":
            balance += amount
        elif direction == "debit":
            balance -= amount
    return qmoney(balance)


def enforce_same_matter(source_matter_id: str, target_matter_id: str) -> None:
    if source_matter_id != target_matter_id:
        raise ValueError("Cross-matter trust transfers are prohibited")
