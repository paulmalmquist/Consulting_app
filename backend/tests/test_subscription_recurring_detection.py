"""Subscription ledger — price-change detection + insert-on-first-sighting."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services import subscription_ledger


class _Parsed:
    def __init__(self, *, service, platform, total, txn_date, vendor="Apple"):
        self.service_name_guess = service
        self.billing_platform = platform
        self.vendor_normalized = vendor
        self.total = total
        self.currency = "USD"
        self.transaction_date = txn_date


def test_first_sighting_creates_ledger_row(fake_cursor, monkeypatch):
    # No existing ledger row.
    fake_cursor.push_result([])
    new_id = uuid4()
    # Ledger INSERT returns new id.
    fake_cursor.push_result([{"id": new_id}])
    # Occurrence upsert returns id.
    fake_cursor.push_result([{"id": uuid4()}])
    result = subscription_ledger.update_ledger_on_new_receipt(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        parsed=_Parsed(service="Apple One", platform="Apple",
                       total=Decimal("16.95"), txn_date=date(2026, 3, 1)),
        classification={"category": "Software subscription", "business_relevance": "medium"},
    )
    assert result["new"] is True
    assert result["price_changed"] is False
    assert result["occurrence_id"] is not None


def test_price_change_flags_review_item(fake_cursor, monkeypatch):
    existing_id = uuid4()
    # Existing with $16.95 last month.
    fake_cursor.push_result([{
        "id": existing_id,
        "expected_amount": Decimal("16.95"),
        "cadence": "monthly",
        "last_seen_date": date(2026, 2, 1),
        "category": "Software subscription",
        "business_relevance": "medium",
    }])
    # UPDATE returns the same id.
    fake_cursor.push_result([{"id": existing_id}])
    # Occurrence upsert returns id.
    fake_cursor.push_result([{"id": uuid4()}])

    reviews: list[dict] = []

    def fake_build_review(**kwargs):
        reviews.append(kwargs)
        return "rev-1"

    monkeypatch.setattr(
        "app.services.subscription_ledger.receipt_review_queue.build_review_item",
        fake_build_review,
    )

    result = subscription_ledger.update_ledger_on_new_receipt(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        parsed=_Parsed(service="Apple One", platform="Apple",
                       total=Decimal("19.99"),  # >2% change
                       txn_date=date(2026, 3, 1)),
        classification={"category": "Software subscription", "business_relevance": "medium"},
    )
    assert result["price_changed"] is True
    assert any(r["reason"] == "price_increased" for r in reviews)


def test_tiny_price_change_within_tolerance_does_not_flag(fake_cursor, monkeypatch):
    existing_id = uuid4()
    fake_cursor.push_result([{
        "id": existing_id,
        "expected_amount": Decimal("16.95"),
        "cadence": "monthly",
        "last_seen_date": date(2026, 2, 1),
        "category": "Software subscription",
        "business_relevance": "medium",
    }])
    fake_cursor.push_result([{"id": existing_id}])
    # Occurrence upsert returns id.
    fake_cursor.push_result([{"id": uuid4()}])

    reviews: list[dict] = []
    monkeypatch.setattr(
        "app.services.subscription_ledger.receipt_review_queue.build_review_item",
        lambda **kwargs: reviews.append(kwargs),
    )

    result = subscription_ledger.update_ledger_on_new_receipt(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        parsed=_Parsed(service="Apple One", platform="Apple",
                       total=Decimal("17.10"),  # <2% change (0.89%)
                       txn_date=date(2026, 3, 1)),
        classification={"category": "Software subscription", "business_relevance": "medium"},
    )
    assert result["price_changed"] is False
    assert reviews == []
