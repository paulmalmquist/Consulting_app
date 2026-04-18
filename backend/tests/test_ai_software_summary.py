"""AI/software spend summary report — verifies shape + roll-ups."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services import receipt_reports


def test_summary_shape_and_rollups(fake_cursor):
    # Apple-billed total.
    fake_cursor.push_result([{"total": Decimal("41.93")}])
    # Vendor totals: Anthropic + OpenAI.
    fake_cursor.push_result([
        {"vendor": "Anthropic", "total": Decimal("40.00")},
        {"vendor": "OpenAI", "total": Decimal("61.75")},
    ])
    # By spend_type.
    fake_cursor.push_result([
        {"spend_type": "subscription_fixed", "total": Decimal("120.00"), "receipt_count": 6},
        {"spend_type": "api_usage", "total": Decimal("42.50"), "receipt_count": 3},
        {"spend_type": "ambiguous", "total": Decimal("4.99"), "receipt_count": 1},
    ])
    # Top vendors (trimmed).
    fake_cursor.push_result([
        {"vendor": "Apple", "billing_platform": "Apple", "total": Decimal("41.93"), "receipt_count": 4},
        {"vendor": "OpenAI", "billing_platform": None, "total": Decimal("20.00"), "receipt_count": 1},
    ])
    # Ambiguous pending.
    fake_cursor.push_result([{"pending_usd": Decimal("4.99")}])
    # Missing support count.
    fake_cursor.push_result([{"c": 2}])

    out = receipt_reports.ai_software_summary(
        env_id="env-1", business_id=str(uuid4()),
        period_start=date(2026, 3, 1), period_end=date(2026, 3, 31),
    )

    assert out["apple_billed_total"] == 41.93
    assert out["claude_total"] == 40.0
    assert out["openai_total"] == 61.75
    assert out["ambiguous_pending_review_usd"] == 4.99
    assert out["missing_support_count"] == 2
    spend_types = {r["spend_type"] for r in out["by_spend_type"]}
    assert {"subscription_fixed", "api_usage", "ambiguous"} == spend_types
    # Period echoed back.
    assert out["period_start"] == "2026-03-01"
    assert out["period_end"] == "2026-03-31"


def test_summary_zero_state(fake_cursor):
    # Push results in the exact order the service executes its SQL.
    fake_cursor.push_result([{"total": 0}])              # apple_total
    fake_cursor.push_result([])                          # vendor_totals
    fake_cursor.push_result([])                          # by_spend_type
    fake_cursor.push_result([])                          # by_vendor
    fake_cursor.push_result([{"pending_usd": 0}])        # ambiguous pending
    fake_cursor.push_result([{"c": 0}])                  # missing support

    out = receipt_reports.ai_software_summary(
        env_id="env-1", business_id=str(uuid4()),
    )
    assert out["apple_billed_total"] == 0
    assert out["claude_total"] == 0
    assert out["openai_total"] == 0
    assert out["by_spend_type"] == []
    assert out["by_vendor"] == []
    assert out["missing_support_count"] == 0
