"""Vendor/product/billing-platform normalization (Track B).

Core invariant: ``billing_platform`` is separate from ``vendor_normalized``.
Apple-billed Claude Pro must surface as
``billing_platform=apple, vendor_normalized=anthropic, product=claude_pro`` —
never as "Apple Services."

When Apple is the only signal with no corroborating document, emit
``requires_review=True`` with candidate vendors rather than guessing.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


_DIRECT_VENDOR_ALIASES: list[tuple[str, str, str, int]] = [
    # (substring in raw vendor, vendor_normalized, product, vendor_confidence)
    ("ANTHROPIC", "anthropic", "claude_api", 99),
    ("CLAUDE.AI", "anthropic", "claude_pro", 99),
    ("OPENAI", "openai", "openai_api", 99),
    ("CHATGPT", "openai", "chatgpt_plus", 95),
    ("FIGMA", "figma", "figma_pro", 95),
    ("NOTION", "notion", "notion_team", 95),
    ("DATADOG", "datadog", "datadog_pro", 92),
    ("RAMP", "ramp", "ramp_card", 100),
    ("WEWORK", "wework", "wework_membership", 95),
    ("GUSTO", "gusto", "gusto_payroll", 95),
    ("LEGALZOOM", "legalzoom", "legalzoom_services", 90),
]

_APPLE_BILLING_MARKERS = ["APPLE.COM/BILL", "APPLE.COM", "ITUNES.COM", "APPLE SERVICES"]
_STRIPE_MARKERS = ["STRIPE"]


@dataclass
class NormalizedParse:
    billing_platform: str
    vendor_normalized: str | None
    product: str | None
    vendor_confidence: int
    product_confidence: int
    ambiguity_notes: str
    requires_review: bool


def _detect_platform(raw: str) -> str:
    up = raw.upper()
    if any(m in up for m in _APPLE_BILLING_MARKERS):
        return "apple"
    if any(m in up for m in _STRIPE_MARKERS):
        return "stripe"
    return "direct"


def _direct_vendor(raw: str) -> tuple[str | None, str | None, int, int]:
    up = raw.upper()
    for token, vendor, product, conf in _DIRECT_VENDOR_ALIASES:
        if token in up:
            return vendor, product, conf, max(60, conf - 5)
    return None, None, 0, 0


def normalize(raw_vendor: str, amount: float, source: str) -> NormalizedParse:
    platform = _detect_platform(raw_vendor)
    vendor, product, vendor_conf, product_conf = _direct_vendor(raw_vendor)

    if platform == "apple":
        if vendor is None:
            # Apple's the only signal — preserve ambiguity.
            # Known small-amount Apple subscription heuristic:
            candidates = []
            if 18.0 <= amount <= 22.0:
                candidates = [("anthropic", "claude_pro", 40), ("openai", "chatgpt_plus", 30)]
            elif 8.0 <= amount <= 11.0:
                candidates = [("openai", "chatgpt_plus_legacy", 30), ("anthropic", "claude_pro_legacy", 30)]
            best = candidates[0] if candidates else ("unknown", "unknown", 0)
            return NormalizedParse(
                billing_platform="apple",
                vendor_normalized=None,
                product=None,
                vendor_confidence=best[2],
                product_confidence=max(best[2] - 10, 0),
                ambiguity_notes="Opaque Apple charge — requires human attribution",
                requires_review=True,
            )
        # Apple as intermediary for a known vendor (e.g. IAP confirmation was parsed)
        return NormalizedParse(
            billing_platform="apple",
            vendor_normalized=vendor,
            product=product,
            vendor_confidence=min(vendor_conf, 80),
            product_confidence=min(product_conf, 75),
            ambiguity_notes="Apple-billed — vendor inferred from IAP payload",
            requires_review=False,
        )

    if vendor is None:
        return NormalizedParse(
            billing_platform=platform,
            vendor_normalized=None,
            product=None,
            vendor_confidence=0,
            product_confidence=0,
            ambiguity_notes="Vendor not in alias map",
            requires_review=True,
        )

    return NormalizedParse(
        billing_platform=platform,
        vendor_normalized=vendor,
        product=product,
        vendor_confidence=vendor_conf,
        product_confidence=product_conf,
        ambiguity_notes="",
        requires_review=False,
    )


def to_dict(parse: NormalizedParse, evidence_id: str) -> dict[str, Any]:
    return {
        "evidence_id": evidence_id,
        "billing_platform": parse.billing_platform,
        "vendor_normalized": parse.vendor_normalized,
        "product": parse.product,
        "vendor_confidence": parse.vendor_confidence,
        "product_confidence": parse.product_confidence,
        "ambiguity_notes": parse.ambiguity_notes,
        "requires_review": parse.requires_review,
    }
