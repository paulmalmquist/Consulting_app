"""Receipt → transaction match scoring (pure-Python)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.services.receipt_matching import Candidate, _score_candidate


def test_exact_amount_same_day_top_score():
    cand = Candidate(
        transaction_id="00000000-0000-0000-0000-000000000001",
        amount=Decimal("19.99"),
        transaction_date=date(2026, 3, 20),
        merchant="Apple.com/bill",
    )
    score, reason = _score_candidate(
        cand,
        parsed_total=Decimal("19.99"),
        parsed_date=date(2026, 3, 20),
        merchant_text="Apple.com/bill",
    )
    assert score > 0.9
    assert reason["amount_delta"] == 0.0
    assert reason["date_delta_days"] == 0


def test_amount_off_by_cents_lower_than_exact():
    exact = Candidate(
        transaction_id="id-exact", amount=Decimal("19.99"),
        transaction_date=date(2026, 3, 20), merchant="Apple",
    )
    off = Candidate(
        transaction_id="id-off", amount=Decimal("22.50"),
        transaction_date=date(2026, 3, 20), merchant="Apple",
    )
    exact_score, _ = _score_candidate(
        exact, parsed_total=Decimal("19.99"),
        parsed_date=date(2026, 3, 20), merchant_text="Apple",
    )
    off_score, _ = _score_candidate(
        off, parsed_total=Decimal("19.99"),
        parsed_date=date(2026, 3, 20), merchant_text="Apple",
    )
    assert exact_score > off_score


def test_date_distance_decays_score():
    same_day = Candidate(
        transaction_id="d1", amount=Decimal("20.00"),
        transaction_date=date(2026, 3, 20), merchant="OpenAI",
    )
    five_days = Candidate(
        transaction_id="d2", amount=Decimal("20.00"),
        transaction_date=date(2026, 3, 25), merchant="OpenAI",
    )
    s1, _ = _score_candidate(
        same_day, parsed_total=Decimal("20.00"),
        parsed_date=date(2026, 3, 20), merchant_text="OpenAI",
    )
    s2, _ = _score_candidate(
        five_days, parsed_total=Decimal("20.00"),
        parsed_date=date(2026, 3, 20), merchant_text="OpenAI",
    )
    assert s1 > s2


def test_merchant_mismatch_reduces_score():
    same_merchant = Candidate(
        transaction_id="m1", amount=Decimal("20.00"),
        transaction_date=date(2026, 3, 20), merchant="OpenAI",
    )
    diff_merchant = Candidate(
        transaction_id="m2", amount=Decimal("20.00"),
        transaction_date=date(2026, 3, 20), merchant="Stripe",
    )
    s1, _ = _score_candidate(
        same_merchant, parsed_total=Decimal("20.00"),
        parsed_date=date(2026, 3, 20), merchant_text="OpenAI",
    )
    s2, _ = _score_candidate(
        diff_merchant, parsed_total=Decimal("20.00"),
        parsed_date=date(2026, 3, 20), merchant_text="OpenAI",
    )
    assert s1 > s2
