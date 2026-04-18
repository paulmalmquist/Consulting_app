"""Category suggestions for a given vendor/amount/memo.

Exact vendor map → fuzzy prefix → token heuristic. Returns top 3 sorted desc.
Interface-compatible with future LLM replacement.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.accounting_fixture_loader import AccountingRepo


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
    ("AWS", "Software & SaaS"),
    ("AZURE", "Software & SaaS"),
    ("GCP", "Software & SaaS"),
    ("FIGMA", "Software & SaaS"),
    ("NOTION", "Software & SaaS"),
    ("DATADOG", "Software & SaaS"),
    ("OPENAI", "Software & SaaS"),
    ("ANTHROPIC", "Software & SaaS"),
    ("RAMP", "Software & SaaS"),
    ("GUSTO", "Payroll"),
    ("WEWORK", "Rent"),
    ("LEGALZOOM", "Legal & Professional"),
    ("APPLE.COM", "Software & SaaS"),
]


def suggest_categories(vendor: str, amount: float, memo: str | None, repo: AccountingRepo) -> list[CategorySuggestion]:
    vendor_upper = vendor.upper()
    memo_upper = (memo or "").upper()
    cat_map = repo.vendor_category_map()
    suggestions: list[CategorySuggestion] = []
    seen: set[str] = set()

    # 1. exact match
    for key, category in cat_map.items():
        if key.upper() == vendor_upper:
            suggestions.append(CategorySuggestion(category=category, confidence=94, reason="exact vendor match"))
            seen.add(category)
            break

    # 2. prefix/contains match
    for key, category in cat_map.items():
        if category in seen:
            continue
        k = key.upper()
        if k and (vendor_upper.startswith(k) or k in vendor_upper or k in memo_upper):
            suggestions.append(CategorySuggestion(category=category, confidence=74, reason=f"vendor contains '{key}'"))
            seen.add(category)

    # 3. heuristics
    for token, category in _HEURISTICS:
        if category in seen:
            continue
        if token in vendor_upper or token in memo_upper:
            suggestions.append(CategorySuggestion(category=category, confidence=58, reason=f"heuristic '{token}'"))
            seen.add(category)

    # 4. generic fallback by amount
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
    return [{"category": s.category, "confidence": s.confidence, "reason": s.reason} for s in suggestions]
