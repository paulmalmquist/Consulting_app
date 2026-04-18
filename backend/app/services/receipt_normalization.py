"""Receipt normalization — separates billing platform from underlying vendor.

Core contract: an Apple-billed ChatGPT subscription is recorded as
    billing_platform = "Apple"
    service_name_guess = "ChatGPT Plus"
    vendor_normalized = "OpenAI"

When the underlying vendor cannot be inferred, vendor_normalized stays null
and confidence_vendor drops to ~0.2 so the intake routes to review.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


APPLE_MERCHANT_RE = re.compile(
    r"apple\.com/bill|apple\s+services|app\s*store|apple\s*one|icloud\+?",
    re.IGNORECASE,
)

RENEWAL_RE = re.compile(
    r"(auto[-\s]?renew[s]?|renews?\s+on|next\s+charge|subscription\s+renews|will\s+renew)",
    re.IGNORECASE,
)

# API-usage signals — charges that vary month-over-month with consumption.
# Matched on the full raw text so we catch "OpenAI · API credit" and
# "api.anthropic.com" style receipts that don't look like a subscription.
API_USAGE_SIGNALS: list[re.Pattern] = [
    re.compile(r"openai\s+api|platform\.openai", re.IGNORECASE),
    re.compile(r"anthropic\s+api|api\.anthropic", re.IGNORECASE),
    re.compile(r"\bapi\s+(credit|usage|billing)\b", re.IGNORECASE),
    re.compile(r"aws\s+(invoice|usage)", re.IGNORECASE),
    re.compile(r"cloud\s+(compute|usage)", re.IGNORECASE),
    re.compile(r"\btokens?\s+(used|consumed)\b", re.IGNORECASE),
    re.compile(r"pay[-\s]?as[-\s]?you[-\s]?go", re.IGNORECASE),
]

# Known subscription-shaped services (identified above). Kept in sync with
# APPLE_SERVICE_MAP canonical names so spend_type inference is deterministic.
SUBSCRIPTION_SERVICE_CANONICAL = {
    "apple one", "icloud+", "apple tv+", "apple music", "apple arcade",
    "chatgpt plus", "claude", "perplexity pro", "notion", "github",
    "spotify", "netflix", "1password", "dropbox",
}


def infer_spend_type(
    *,
    service_name_guess: str | None,
    raw_text: str | None,
    renewal_language: str | None,
) -> str:
    """Return one of: subscription_fixed | api_usage | one_off | ambiguous.

    reimbursable_client is only set via classification rules (needs operator
    context) — the inference layer does not guess client attribution.
    """
    hay = " ".join(s for s in [service_name_guess, raw_text] if s)

    # API-usage signals win even if renewal-language is present (some API
    # billing portals use "next charge" language).
    for pattern in API_USAGE_SIGNALS:
        if pattern.search(hay):
            return "api_usage"

    canonical = (service_name_guess or "").strip().lower()
    if canonical in SUBSCRIPTION_SERVICE_CANONICAL:
        return "subscription_fixed"

    if renewal_language:
        # Auto-renew language present → treat as subscription unless the
        # service is clearly absent (ambiguous Apple charges land here).
        if service_name_guess:
            return "subscription_fixed"
        return "ambiguous"

    if service_name_guess:
        return "one_off"
    return "ambiguous"


# service-text → (vendor_normalized, canonical_service_name, confidence_vendor)
APPLE_SERVICE_MAP: list[tuple[re.Pattern, str, str, float]] = [
    (re.compile(r"apple\s*one", re.IGNORECASE),            "Apple",     "Apple One",      0.95),
    (re.compile(r"icloud\+?", re.IGNORECASE),              "Apple",     "iCloud+",        0.95),
    (re.compile(r"apple\s*tv\+?", re.IGNORECASE),          "Apple",     "Apple TV+",      0.95),
    (re.compile(r"apple\s*music", re.IGNORECASE),          "Apple",     "Apple Music",    0.95),
    (re.compile(r"apple\s*arcade", re.IGNORECASE),         "Apple",     "Apple Arcade",   0.95),
    (re.compile(r"chat\s*gpt", re.IGNORECASE),             "OpenAI",    "ChatGPT Plus",   0.85),
    (re.compile(r"\bclaude\b", re.IGNORECASE),             "Anthropic", "Claude",         0.85),
    (re.compile(r"\bperplexity\b", re.IGNORECASE),         "Perplexity AI", "Perplexity Pro", 0.85),
    (re.compile(r"\bnotion\b", re.IGNORECASE),             "Notion Labs",   "Notion",     0.85),
    (re.compile(r"\bgithub\b", re.IGNORECASE),             "GitHub",    "GitHub",         0.85),
    (re.compile(r"\bspotify\b", re.IGNORECASE),            "Spotify",   "Spotify",        0.85),
    (re.compile(r"\bnetflix\b", re.IGNORECASE),            "Netflix",   "Netflix",        0.85),
    (re.compile(r"1password", re.IGNORECASE),              "1Password", "1Password",      0.85),
    (re.compile(r"\bdropbox\b", re.IGNORECASE),            "Dropbox",   "Dropbox",        0.85),
]


@dataclass
class NormalizedParse:
    billing_platform: str | None = None
    service_name_guess: str | None = None
    vendor_normalized: str | None = None
    renewal_language: str | None = None
    confidence_vendor: float = 0.0
    confidence_service: float = 0.0
    apple_ambiguous: bool = False
    notes: list[str] = field(default_factory=list)


def detect_apple_billing(merchant_raw: str | None, raw_text: str | None = None) -> bool:
    """Return True if the receipt looks like it was billed through Apple."""
    haystack = " ".join(s for s in [merchant_raw, raw_text] if s)
    if not haystack:
        return False
    return bool(APPLE_MERCHANT_RE.search(haystack))


def detect_renewal_language(raw_text: str | None) -> str | None:
    if not raw_text:
        return None
    m = RENEWAL_RE.search(raw_text)
    if not m:
        return None
    start = max(0, m.start() - 20)
    end = min(len(raw_text), m.end() + 60)
    return raw_text[start:end].strip()


def normalize(
    *,
    merchant_raw: str | None,
    service_hint: str | None = None,
    raw_text: str | None = None,
) -> NormalizedParse:
    """Apply deterministic rules on top of raw extraction fields."""
    result = NormalizedParse()
    hay = " ".join(s for s in [merchant_raw, service_hint, raw_text] if s)

    is_apple = detect_apple_billing(merchant_raw, raw_text)
    if is_apple:
        result.billing_platform = "Apple"

    # Try service-text match across the combined haystack.
    for pattern, vendor, canonical, conf in APPLE_SERVICE_MAP:
        if pattern.search(hay):
            result.vendor_normalized = vendor
            result.service_name_guess = canonical
            result.confidence_vendor = conf
            result.confidence_service = conf
            break

    # Non-Apple receipt with no service match: fall back to merchant_raw as vendor.
    if not is_apple and not result.vendor_normalized and merchant_raw:
        cleaned = merchant_raw.strip()
        if cleaned:
            result.vendor_normalized = cleaned
            result.service_name_guess = cleaned
            result.confidence_vendor = 0.6
            result.confidence_service = 0.5
            result.notes.append("vendor derived from merchant_raw")

    # Apple-billed but no underlying service match → ambiguous.
    if is_apple and not result.vendor_normalized:
        result.confidence_vendor = 0.2
        result.confidence_service = 0.2
        result.apple_ambiguous = True
        result.notes.append("apple-billed, underlying vendor undetermined")

    result.renewal_language = detect_renewal_language(raw_text)
    return result


def apply_classification_rules(
    rules: list[dict[str, Any]],
    *,
    billing_platform: str | None,
    service_name_guess: str | None,
    vendor_normalized: str | None,
) -> dict[str, Any]:
    """Run JSONB rules (highest priority first) and return first match.

    Rule shape:
        {
          "match_when": {
            "billing_platform": "Apple",
            "service_contains": "ChatGPT"
          },
          "set_category": "AI tools",
          "set_business_relevance": "high",
          "set_vendor_normalized": "OpenAI"
        }
    """
    sorted_rules = sorted(rules, key=lambda r: r.get("priority", 100))
    for rule in sorted_rules:
        when = rule.get("match_when") or {}
        if not when:
            continue
        platform_need = when.get("billing_platform")
        if platform_need and (billing_platform or "").lower() != platform_need.lower():
            continue
        service_need = when.get("service_contains")
        if service_need and service_need.lower() not in (service_name_guess or "").lower():
            continue
        vendor_need = when.get("vendor_equals")
        if vendor_need and (vendor_normalized or "").lower() != vendor_need.lower():
            continue
        return {
            "category": rule.get("set_category"),
            "business_relevance": rule.get("set_business_relevance"),
            "vendor_normalized_override": rule.get("set_vendor_normalized"),
            "matched_rule_id": rule.get("id"),
        }
    return {}
