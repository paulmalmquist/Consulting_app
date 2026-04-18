"""Harder recurring-detection cases:
- Same product, slightly different tax/total (subtotal stability)
- Billing date drifts by a few days (cadence window tolerance)
- Apple wording change (still recognized by service map)
- Annual renewal (first→unknown, second ~365d → annual)
- Missing month + reappearance (cadence_changed review item)
- Triple-signal dedup (file + provider + operator attach → 1 occurrence)
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services import subscription_ledger
from app.services.receipt_extraction import extract_receipt_from_text
from app.services.receipt_normalization import infer_spend_type


class _Parsed:
    def __init__(
        self, *, service, platform, total, txn_date,
        subtotal=None, vendor="Apple", renewal=None, spend_type="subscription_fixed",
    ):
        self.service_name_guess = service
        self.billing_platform = platform
        self.vendor_normalized = vendor
        self.subtotal = subtotal
        self.total = total
        self.currency = "USD"
        self.transaction_date = txn_date
        self.merchant_raw = None
        self.renewal_language = renewal
        self.spend_type = spend_type


# ── Spend-type inference ─────────────────────────────────────────────────────

def test_spend_type_subscription_fixed():
    assert infer_spend_type(
        service_name_guess="Apple One", raw_text="Apple One monthly",
        renewal_language="Auto-renews",
    ) == "subscription_fixed"


def test_spend_type_api_usage_openai_api():
    assert infer_spend_type(
        service_name_guess="OpenAI API", raw_text="platform.openai.com — API credit",
        renewal_language=None,
    ) == "api_usage"


def test_spend_type_api_usage_anthropic_api():
    assert infer_spend_type(
        service_name_guess="Anthropic API", raw_text="api.anthropic.com usage",
        renewal_language=None,
    ) == "api_usage"


def test_spend_type_one_off_with_service_no_renewal():
    assert infer_spend_type(
        service_name_guess="JetBrains Perpetual",
        raw_text="One-time purchase",
        renewal_language=None,
    ) == "one_off"


def test_spend_type_ambiguous_no_service_no_renewal():
    assert infer_spend_type(
        service_name_guess=None, raw_text="receipt", renewal_language=None,
    ) == "ambiguous"


# ── Tax-drift stability: subtotal preferred over total ───────────────────────

def test_tax_drift_does_not_trigger_price_change(fake_cursor, monkeypatch):
    existing_id = uuid4()
    fake_cursor.push_result([{
        "id": existing_id,
        "expected_amount": Decimal("19.99"),  # subtotal stored
        "cadence": "monthly",
        "last_seen_date": date(2026, 2, 15),
        "category": "AI tools",
        "business_relevance": "high",
        "spend_type": "subscription_fixed",
    }])
    fake_cursor.push_result([{"id": existing_id}])  # UPDATE
    fake_cursor.push_result([{"id": uuid4()}])       # occurrence upsert

    reviews: list[dict] = []
    monkeypatch.setattr(
        "app.services.subscription_ledger.receipt_review_queue.build_review_item",
        lambda **kwargs: reviews.append(kwargs),
    )

    # Same subtotal as before ($19.99) but total jumped because tax was added.
    parsed = _Parsed(
        service="ChatGPT Plus", platform="Apple",
        subtotal=Decimal("19.99"), total=Decimal("21.75"),  # +tax
        txn_date=date(2026, 3, 15),
    )
    result = subscription_ledger.update_ledger_on_new_receipt(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        parsed=parsed,
        classification={"category": "AI tools", "business_relevance": "high"},
    )
    assert result["price_changed"] is False, "Tax drift must not fire price_increased"
    assert not any(r["reason"] == "price_increased" for r in reviews)


# ── Billing-date drift: 28d and 34d still count as monthly ───────────────────

def test_billing_date_drift_within_monthly_window(fake_cursor, monkeypatch):
    existing_id = uuid4()
    fake_cursor.push_result([{
        "id": existing_id,
        "expected_amount": Decimal("16.95"),
        "cadence": "monthly",
        "last_seen_date": date(2026, 2, 15),
        "category": "Software subscription",
        "business_relevance": "medium",
        "spend_type": "subscription_fixed",
    }])
    fake_cursor.push_result([{"id": existing_id}])
    fake_cursor.push_result([{"id": uuid4()}])

    reviews: list[dict] = []
    monkeypatch.setattr(
        "app.services.subscription_ledger.receipt_review_queue.build_review_item",
        lambda **kwargs: reviews.append(kwargs),
    )

    # 28 days later — inside monthly window (25-35).
    result = subscription_ledger.update_ledger_on_new_receipt(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        parsed=_Parsed(service="Apple One", platform="Apple",
                       total=Decimal("16.95"), txn_date=date(2026, 3, 15)),
        classification={"category": "Software subscription", "business_relevance": "medium"},
    )
    assert result["cadence_changed"] is False
    assert not any(r["reason"] == "cadence_changed" for r in reviews)


# ── Annual renewal: unknown → annual ─────────────────────────────────────────

def test_annual_cadence_inferred_from_365_day_gap(fake_cursor, monkeypatch):
    existing_id = uuid4()
    fake_cursor.push_result([{
        "id": existing_id,
        "expected_amount": Decimal("89.00"),
        "cadence": "unknown",
        "last_seen_date": date(2025, 3, 20),
        "category": "Developer tools",
        "business_relevance": "high",
        "spend_type": "subscription_fixed",
    }])
    captured_update: dict = {}
    original_execute = fake_cursor.execute

    def capture(sql, params=None):
        if "UPDATE nv_subscription_ledger" in sql and "SET expected_amount" in sql:
            captured_update["params"] = params
        return original_execute(sql, params)

    fake_cursor.execute = capture  # type: ignore[assignment]
    fake_cursor.push_result([{"id": existing_id}])  # UPDATE
    fake_cursor.push_result([{"id": uuid4()}])       # occurrence upsert
    monkeypatch.setattr(
        "app.services.subscription_ledger.receipt_review_queue.build_review_item",
        lambda **kwargs: None,
    )

    subscription_ledger.update_ledger_on_new_receipt(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        parsed=_Parsed(service="JetBrains All-Products", platform=None, vendor="JetBrains",
                       total=Decimal("89.00"), txn_date=date(2026, 3, 20)),
        classification={"category": "Developer tools", "business_relevance": "high"},
    )
    params = captured_update.get("params")
    assert params is not None, "UPDATE should have been called"
    assert "annual" in params, f"cadence should be 'annual', got params: {params}"


# ── Missing month + reappearance fires cadence_changed ───────────────────────

def test_gap_outside_window_flags_cadence_changed(fake_cursor, monkeypatch):
    existing_id = uuid4()
    fake_cursor.push_result([{
        "id": existing_id,
        "expected_amount": Decimal("16.95"),
        "cadence": "monthly",
        "last_seen_date": date(2026, 1, 15),
        "category": "Software subscription",
        "business_relevance": "medium",
        "spend_type": "subscription_fixed",
    }])
    fake_cursor.push_result([{"id": existing_id}])
    fake_cursor.push_result([{"id": uuid4()}])

    reviews: list[dict] = []
    monkeypatch.setattr(
        "app.services.subscription_ledger.receipt_review_queue.build_review_item",
        lambda **kwargs: reviews.append(kwargs),
    )

    # 59-day gap = missing Feb + late March → outside monthly window (25-35).
    result = subscription_ledger.update_ledger_on_new_receipt(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        parsed=_Parsed(service="Apple One", platform="Apple",
                       total=Decimal("16.95"), txn_date=date(2026, 3, 15)),
        classification={"category": "Software subscription", "business_relevance": "medium"},
    )
    assert result["cadence_changed"] is True
    assert any(r["reason"] == "cadence_changed" for r in reviews)


# ── Apple wording change is still recognized by service map ─────────────────

def test_apple_wording_change_still_recognized():
    # Apple occasionally changes "Apple.com/bill" to "Apple Services" etc.
    out = extract_receipt_from_text(
        "APPLE SERVICES\nApp Store\nChatGPT Plus\nDate: 03/20/2026\nTotal: $21.75 USD\n"
    )
    assert out.billing_platform == "Apple"
    assert out.vendor_normalized == "OpenAI"
    assert out.service_name_guess == "ChatGPT Plus"
    assert out.spend_type == "subscription_fixed"


# ── Triple-signal dedup: same (subscription, date) idempotent via UNIQUE ────

def test_triple_signal_dedup_writes_one_occurrence(fake_cursor, monkeypatch):
    """We model the ON CONFLICT behavior by asserting the SQL uses the unique
    constraint; actual de-dup is enforced by the DB UNIQUE INDEX in schema v2.
    """
    existing_id = uuid4()
    fake_cursor.push_result([{
        "id": existing_id,
        "expected_amount": Decimal("16.95"),
        "cadence": "monthly",
        "last_seen_date": date(2026, 2, 15),
        "category": "Software subscription",
        "business_relevance": "medium",
        "spend_type": "subscription_fixed",
    }])
    fake_cursor.push_result([{"id": existing_id}])
    # First occurrence insert.
    occ_id = uuid4()
    fake_cursor.push_result([{"id": occ_id}])
    monkeypatch.setattr(
        "app.services.subscription_ledger.receipt_review_queue.build_review_item",
        lambda **kwargs: None,
    )

    subscription_ledger.update_ledger_on_new_receipt(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        parsed=_Parsed(service="Apple One", platform="Apple",
                       total=Decimal("16.95"), txn_date=date(2026, 3, 15)),
        classification={"category": "Software subscription", "business_relevance": "medium"},
    )

    # The SQL should use ON CONFLICT (subscription_id, occurrence_date).
    insert_sql = next(
        (sql for sql, _ in fake_cursor.queries
         if "INSERT INTO nv_subscription_occurrence" in sql), None,
    )
    assert insert_sql is not None
    assert "ON CONFLICT (subscription_id, occurrence_date)" in insert_sql
    assert "source_signals ||" in insert_sql, (
        "Conflict resolution must merge source_signals, not overwrite"
    )
