"""Metric and timeframe normalization for conversation state tracking.

Normalizes user-facing metric names and time references to canonical
keys so that follow-up questions inherit consistent context.
"""
from __future__ import annotations

import re

# ── Metric synonym map ──────────────────────────────────────────────
_METRIC_SYNONYMS: dict[str, list[str]] = {
    "noi": ["noi", "naoi", "net operating income", "operating income"],
    "irr": ["irr", "internal rate of return"],
    "tvpi": ["tvpi", "total value"],
    "dpi": ["dpi", "distributed to paid in"],
    "dscr": ["dscr", "debt service coverage", "debt coverage"],
    "ltv": ["ltv", "loan to value"],
    "occupancy": ["occupancy", "occ", "occupancy rate", "vacancy"],
    "cap_rate": ["cap rate", "capitalization rate"],
    "revenue": ["revenue", "gross revenue", "rental revenue", "income"],
    "expenses": ["expenses", "opex", "operating expenses"],
    "ncf": ["ncf", "net cash flow", "cash flow"],
    "gross_irr": ["gross irr", "gross return", "pre-fee irr", "pre fee irr"],
    "net_irr": ["net irr", "net return", "after-fee irr", "after fee irr"],
    "debt_yield": ["debt yield", "dy", "noi/debt", "noi to debt"],
    "rvpi": ["rvpi", "residual value", "residual value to paid in", "unrealized multiple"],
    "ttm_noi": ["ttm noi", "trailing noi", "ltm noi", "trailing 12 noi", "trailing twelve months noi"],
}

_METRIC_LOOKUP: dict[str, str] = {}
for canonical, synonyms in _METRIC_SYNONYMS.items():
    for syn in synonyms:
        _METRIC_LOOKUP[syn.lower()] = canonical

_METRIC_RE = re.compile(
    r"\b(" + "|".join(re.escape(syn) for syn in sorted(_METRIC_LOOKUP.keys(), key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)

# ── Timeframe synonym map ───────────────────────────────────────────
_TIMEFRAME_SYNONYMS: dict[str, list[str]] = {
    "ttm": ["ttm", "ltm", "trailing 12 months", "past 12 months", "last 12 months",
            "last twelve months", "trailing twelve months"],
    "ytd": ["ytd", "year to date"],
    "quarterly": ["quarterly", "by quarter", "per quarter", "each quarter"],
    "monthly": ["monthly", "by month", "per month"],
    "annual": ["annual", "annually", "yearly", "by year", "per year"],
}

_TIMEFRAME_LOOKUP: dict[str, str] = {}
for canonical, synonyms in _TIMEFRAME_SYNONYMS.items():
    for syn in synonyms:
        _TIMEFRAME_LOOKUP[syn.lower()] = canonical

_TIMEFRAME_RE = re.compile(
    r"\b(" + "|".join(re.escape(syn) for syn in sorted(_TIMEFRAME_LOOKUP.keys(), key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)

# Explicit quarter references: Q1 2025, Q3 2024, etc.
_QUARTER_RE = re.compile(r"\bQ([1-4])\s*(\d{4})\b", re.IGNORECASE)


def extract_metric(message: str) -> dict | None:
    """Extract the primary metric from a user message.

    Returns: {"normalized": str, "raw": str, "confidence": float} or None
    """
    m = _METRIC_RE.search(message)
    if not m:
        return None
    raw = m.group(0)
    normalized = _METRIC_LOOKUP.get(raw.lower())
    if not normalized:
        return None
    return {
        "normalized": normalized,
        "raw": raw,
        "confidence": 0.91,
        "source": "current_turn",
    }


def extract_timeframe(message: str) -> dict | None:
    """Extract the primary timeframe from a user message.

    Returns: {"normalized": str, "raw": str, "confidence": float} or None
    """
    # Check explicit quarter first (highest confidence)
    qm = _QUARTER_RE.search(message)
    if qm:
        return {
            "normalized": f"Q{qm.group(1)} {qm.group(2)}",
            "raw": qm.group(0),
            "confidence": 0.95,
            "source": "current_turn",
        }

    m = _TIMEFRAME_RE.search(message)
    if not m:
        return None
    raw = m.group(0)
    normalized = _TIMEFRAME_LOOKUP.get(raw.lower())
    if not normalized:
        return None
    return {
        "normalized": normalized,
        "raw": raw,
        "confidence": 0.72 if normalized in ("ttm", "ytd") else 0.65,
        "source": "inferred_synonym",
    }
