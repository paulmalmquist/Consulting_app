"""Semantic runtime registry — DB-aware metric extraction for NLP pipelines.

Wraps semantic_metric_def to provide runtime metric extraction that augments
the static metric_normalizer fallback. Keys are normalized to lowercase on
load (DB stores GROSS_IRR; runtime uses gross_irr).

Usage:
    registry = SemanticMetricRegistry(business_id)
    result = registry.extract("show me gross IRR by fund")
    # {"normalized": "gross_irr", "raw": "gross irr", "confidence": 0.88, "source": "db_registry"}
"""
from __future__ import annotations

from typing import Any


class SemanticMetricRegistry:
    """Runtime wrapper around semantic_metric_def for NLP metric extraction.

    - Keys are normalized to lowercase on load (DB: GROSS_IRR → gross_irr)
    - Generates synonym candidates from display_name (e.g. "Net Operating Income")
    - Does NOT replace the static _METRIC_SYNONYMS fallback — augments it
    - Silently degrades when the DB is unavailable (empty synonyms dict)
    """

    def __init__(self, business_id: str) -> None:
        self._synonyms: dict[str, str] = {}   # phrase → canonical_key
        self._domain_keywords: frozenset[str] = frozenset()
        self._load(business_id)

    def _load(self, business_id: str) -> None:
        from app.services.semantic_catalog import list_metrics
        try:
            metrics = list_metrics(business_id=business_id)
        except Exception:
            return  # DB not available — caller uses static fallback

        for m in metrics:
            key = m["metric_key"].lower()  # GROSS_IRR → gross_irr
            self._domain_keywords = self._domain_keywords | {key}
            # Register the canonical key itself
            self._synonyms[key] = key
            # Register display_name as synonym
            display = m["display_name"].lower()  # "Gross IRR" → "gross irr"
            self._synonyms[display] = key
            # Register individual meaningful words from display_name (≥ 4 chars)
            for word in display.split():
                if len(word) >= 4 and word not in ("with", "from", "over", "than"):
                    self._synonyms.setdefault(word, key)

    def extract(self, text: str) -> dict[str, Any] | None:
        """Try to match text against DB metric synonyms.

        Returns {"normalized": key, "raw": matched_phrase, "confidence": 0.88,
                 "source": "db_registry"} or None if no match.
        Longer synonyms are tried first to prefer specific over generic.
        """
        if not self._synonyms:
            return None
        lower = text.lower()
        for syn in sorted(self._synonyms, key=len, reverse=True):
            if syn in lower:
                return {
                    "normalized": self._synonyms[syn],
                    "raw": syn,
                    "confidence": 0.88,
                    "source": "db_registry",
                }
        return None

    @property
    def domain_keywords(self) -> frozenset[str]:
        """Set of lowercase canonical metric keys — usable for domain detection."""
        return self._domain_keywords

    @property
    def has_data(self) -> bool:
        """True if at least one metric was loaded from the DB."""
        return bool(self._synonyms)
