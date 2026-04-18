"""Apple receipt normalization — billing platform vs underlying vendor."""
from __future__ import annotations

from app.services import receipt_normalization
from app.services.receipt_extraction import extract_receipt_from_text


APPLE_ONE_RECEIPT = """
Apple Services
Apple.com/bill

Apple One · Individual
Monthly subscription

Order ID: MP123ABC
Date: 03/15/2026

Subtotal: $16.95
Tax:      $0.00
Total:    $16.95 USD

Auto-renews on 04/15/2026
"""

ICLOUD_RECEIPT = """
APPLE.COM/BILL

iCloud+ with 200GB storage
Date: 03/10/2026
Total: $2.99 USD
Auto-renew: YES
"""

CHATGPT_VIA_APPLE = """
Apple Services
App Store

ChatGPT Plus
Monthly
Order ID: DOC987ZZ
Date: 03/20/2026

Subtotal: $19.99
Tax:      $1.76
Total:    $21.75 USD

Renews on 04/20/2026
"""

DIRECT_OPENAI_WEB_RECEIPT = """
OpenAI
Receipt

ChatGPT Plus
Billing period: 03/01/2026 - 04/01/2026

Total: $20.00
"""

AMBIGUOUS_APPLE = """
Apple.com/bill

Your receipt from Apple
Order ID: XYZ000

Total: $4.99
"""


def test_apple_one_recognized():
    parsed = extract_receipt_from_text(APPLE_ONE_RECEIPT)
    assert parsed.billing_platform == "Apple"
    assert parsed.vendor_normalized == "Apple"
    assert parsed.service_name_guess == "Apple One"
    assert parsed.confidence_vendor >= 0.9
    assert parsed.apple_ambiguous is False
    assert parsed.renewal_language is not None


def test_icloud_recognized():
    parsed = extract_receipt_from_text(ICLOUD_RECEIPT)
    assert parsed.billing_platform == "Apple"
    assert parsed.vendor_normalized == "Apple"
    assert parsed.service_name_guess == "iCloud+"


def test_chatgpt_via_apple_separates_platform_from_vendor():
    parsed = extract_receipt_from_text(CHATGPT_VIA_APPLE)
    assert parsed.billing_platform == "Apple", "Apple must be recorded as billing platform"
    assert parsed.vendor_normalized == "OpenAI", "underlying vendor must be OpenAI"
    assert parsed.service_name_guess == "ChatGPT Plus"
    assert parsed.apple_ambiguous is False
    assert parsed.confidence_vendor >= 0.8


def test_direct_openai_web_receipt_not_apple_platform():
    parsed = extract_receipt_from_text(DIRECT_OPENAI_WEB_RECEIPT)
    assert parsed.billing_platform is None
    assert parsed.vendor_normalized == "OpenAI"
    assert parsed.service_name_guess == "ChatGPT Plus"


def test_ambiguous_apple_charge_flagged():
    parsed = extract_receipt_from_text(AMBIGUOUS_APPLE)
    assert parsed.billing_platform == "Apple"
    assert parsed.vendor_normalized is None
    assert parsed.apple_ambiguous is True
    assert parsed.confidence_vendor < 0.5


def test_detect_apple_billing_helper():
    assert receipt_normalization.detect_apple_billing("apple.com/bill") is True
    assert receipt_normalization.detect_apple_billing("Apple Services") is True
    assert receipt_normalization.detect_apple_billing("App Store") is True
    assert receipt_normalization.detect_apple_billing("Stripe") is False
    assert receipt_normalization.detect_apple_billing(None, "iCloud+") is True


def test_classification_rules_override_default():
    rules = [
        {
            "id": "r1",
            "priority": 10,
            "match_when": {"billing_platform": "Apple", "service_contains": "ChatGPT"},
            "set_category": "AI tools",
            "set_business_relevance": "high",
            "set_vendor_normalized": "OpenAI",
        }
    ]
    out = receipt_normalization.apply_classification_rules(
        rules,
        billing_platform="Apple",
        service_name_guess="ChatGPT Plus",
        vendor_normalized=None,
    )
    assert out["category"] == "AI tools"
    assert out["business_relevance"] == "high"
    assert out["vendor_normalized_override"] == "OpenAI"
    assert out["matched_rule_id"] == "r1"


def test_rule_priority_respected():
    rules = [
        {"id": "low", "priority": 100, "match_when": {"billing_platform": "Apple"}, "set_category": "Catch-all"},
        {"id": "high", "priority": 10, "match_when": {"billing_platform": "Apple", "service_contains": "iCloud"}, "set_category": "Cloud / Storage"},
    ]
    out = receipt_normalization.apply_classification_rules(
        rules,
        billing_platform="Apple",
        service_name_guess="iCloud+",
        vendor_normalized="Apple",
    )
    assert out["category"] == "Cloud / Storage"
    assert out["matched_rule_id"] == "high"
