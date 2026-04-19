"""Category suggestions for the drawer's "AI Suggested" panel.

Delegates to receipt_classification for rule-based category inference, then
adds a heuristic fallback so an unknown vendor still gets top-3 candidates.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services import receipt_classification


@dataclass
class CategorySuggestion:
    category: str
    confidence: int
    reason: str


_HEURISTICS: list[tuple[str, str]] = [
    ("UBER", "Travel"),
    ("LYFT", "Travel"),
    ("HILTON", "Travel"),
    ("UNITED", "Travel"),
    ("DELTA", "Travel"),
    ("AMERICAN AIRLINES", "Travel"),
    ("AWS", "Cloud / Storage"),
    ("AZURE", "Cloud / Storage"),
    ("GCP", "Cloud / Storage"),
    ("FIGMA", "Productivity"),
    ("NOTION", "Productivity"),
    ("DATADOG", "Developer tools"),
    ("OPENAI", "AI tools"),
    ("ANTHROPIC", "AI tools"),
    ("CLAUDE", "AI tools"),
    ("RAMP", "Developer tools"),
    ("GUSTO", "Payroll"),
    ("WEWORK", "Rent"),
    ("LEGALZOOM", "Legal & Professional"),
    ("APPLE.COM", "Software & SaaS"),
]


def suggest_categories(
    *,
    env_id: str,
    business_id: str,
    vendor: str,
    amount: float,
    memo: str | None = None,
) -> list[CategorySuggestion]:
    suggestions: list[CategorySuggestion] = []
    seen: set[str] = set()

    # 1. Delegate to the receipt_classification pipeline (rules + carry-forward + defaults)
    try:
        hit = receipt_classification.classify(
            env_id=env_id,
            business_id=business_id,
            billing_platform=None,
            service_name_guess=memo,
            vendor_normalized=vendor,
        )
    except Exception:
        hit = None
    if hit and hit.get("category"):
        suggestions.append(
            CategorySuggestion(
                category=hit["category"],
                confidence=90 if hit.get("rule_id") else 74,
                reason="rules" if hit.get("rule_id") else "carry-forward or default",
            )
        )
        seen.add(hit["category"])

    # 2. Heuristic fallback on raw vendor/memo tokens
    vendor_upper = (vendor or "").upper()
    memo_upper = (memo or "").upper()
    for token, category in _HEURISTICS:
        if category in seen:
            continue
        if token in vendor_upper or token in memo_upper:
            suggestions.append(
                CategorySuggestion(category=category, confidence=58, reason=f"heuristic '{token}'")
            )
            seen.add(category)

    # 3. Generic amount-based fallback
    if not suggestions:
        if amount < 50:
            suggestions.append(CategorySuggestion(category="Meals", confidence=30, reason="amount<50 fallback"))
        elif amount < 500:
            suggestions.append(CategorySuggestion(category="Office Supplies", confidence=30, reason="amount<500 fallback"))
        else:
            suggestions.append(CategorySuggestion(category="Legal & Professional", confidence=20, reason="amount>=500 fallback"))

    suggestions.sort(key=lambda s: s.confidence, reverse=True)
    return suggestions[:3]


def to_dict(suggestions: list[CategorySuggestion]) -> list[dict[str, Any]]:
    return [
        {"category": s.category, "confidence": s.confidence, "reason": s.reason}
        for s in suggestions
    ]
