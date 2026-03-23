"""Clawback and promote position math."""

from __future__ import annotations

from decimal import Decimal

from .utils import qmoney


def compute_clawback(gp_profit_paid: Decimal, gp_target_profit: Decimal, settled: Decimal = Decimal("0")) -> dict:
    liability = qmoney(max(gp_profit_paid - gp_target_profit, Decimal("0")))
    settled_amt = qmoney(settled)
    outstanding = qmoney(max(liability - settled_amt, Decimal("0")))
    return {
        "liability_amount": liability,
        "settled_amount": settled_amt,
        "outstanding_amount": outstanding,
    }


def compute_promote_position(promote_earned: Decimal, promote_paid: Decimal) -> dict:
    earned = qmoney(promote_earned)
    paid = qmoney(promote_paid)
    return {
        "promote_earned": earned,
        "promote_paid": paid,
        "promote_outstanding": qmoney(max(earned - paid, Decimal("0"))),
    }
